"""Collapse duplicated per-card progress left by the thematic category decks.

Before issue #78 a thematic category was a *separate deck* with its own
``id_offset``, so one word could hold two independent sets of learner state:
``見る`` as ``("Vocabulary N5", 647)`` and ``みる`` as ``("Vocabulary: Verbs", 1104)``
each had their own FSRS schedule, mastery counter and leech record. The category
decks are now views over their parent, so those second rows are stranded under
deck names nothing will ask for again.

This is the one-shot correction. For every table keyed ``(deck, card_id)`` that
holds durable per-card progress, a row stored under a category deck is moved onto
the parent card it resolves to. Where both rows exist, the **further-along** one
wins — the learner never moves backwards.

Deliberately not a schema migration: ``schema_version`` describes table shape and
this changes rows, not columns. It follows :mod:`data.repetitions_backfill`
instead — plan first (read-only), inspect, then apply.

Re-running is a no-op: applying removes every source row, so a second pass finds
nothing to move. Rows whose ``card_id`` does not resolve are left exactly where
they are and reported as orphans rather than deleted; they are already
unreachable, and guessing at a destination would invent progress.

``review_events`` is **not** rewritten. It is an append-only log of what happened
at the time, and its rows stay under the deck name they were recorded against.
The consequence is that history and heatmap totals still attribute those reviews
to the category deck.
"""

from __future__ import annotations

import shutil
import sqlite3
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from data import database
from data.text_normalization import normalize_storage_text
from domain.block_mapping import parent_slug_for_category, resolve_category_card_map
from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS

# Deck names as stored: every write path normalizes through
# `database._normalize_deck_name`, so matching must too.
_DeckKey = tuple[str, int]


@dataclass(frozen=True)
class _TableSpec:
    """One table to migrate, and how to pick a winner when both rows exist."""

    table: str
    deck_column: str
    #: Key columns beyond the deck and card id (e.g. a per-mode row).
    extra_key_columns: tuple[str, ...]
    #: Ordering key; the row with the greatest tuple is the further-along one.
    rank: Callable[[Mapping[str, Any]], tuple]


def _rank_review_state(row: Mapping[str, Any]) -> tuple:
    """More repetitions wins; ties break on the longer interval.

    Repetitions first because that is what the mastered rule counts
    (``repetitions >= 3 AND interval >= 21``) and what a learner reads as
    progress. Interval only separates rows that are level on repetitions.
    """
    return (int(row["repetitions"] or 0), int(row["interval"] or 0))


def _rank_leech(row: Mapping[str, Any]) -> tuple:
    """An active leech outranks a cleared one; then the worse recent record."""
    return (
        int(row["is_active"] or 0),
        int(row["failures_recent"] or 0),
        int(row["attempts_recent"] or 0),
    )


_TABLES: tuple[_TableSpec, ...] = (
    _TableSpec("review_states", "deck", (), _rank_review_state),
    _TableSpec("card_mastery_scores", "deck", (), lambda row: (int(row["score"] or 0),)),
    _TableSpec("leech_items", "deck", (), _rank_leech),
    # Stage is tracked per practice mode, so mode is part of the identity.
    _TableSpec("curriculum_stages", "deck", ("mode",), lambda row: (int(row["stage"] or 0),)),
)

#: Deck-keyed tables this migration leaves alone, and why. Reported so the gap is
#: stated rather than discovered.
UNTOUCHED_TABLES: Mapping[str, str] = {
    "review_events": "append-only log of what happened at the time",
    "daily_game_miss_signals": "transient daily-game signal, regenerated",
    "daily_word_pool_words": "materialised daily pool snapshot, regenerated",
}


@dataclass(frozen=True)
class PlannedMove:
    """One stored row and where it is going."""

    table: str
    source_deck: str
    source_card_id: int
    target_deck: str
    target_card_id: int
    #: True when the target already holds a row, so the two must be merged.
    merges: bool
    #: True when the *incoming* row wins the merge. False means the stored
    #: target row is further along and the source row is simply dropped.
    incoming_wins: bool


@dataclass(frozen=True)
class OrphanRow:
    """A category row whose card id resolves to nothing, left in place."""

    table: str
    deck: str
    card_id: int


@dataclass
class MigrationPlan:
    """What the migration would do, before anything is written."""

    moves: list[PlannedMove] = field(default_factory=list)
    orphans: list[OrphanRow] = field(default_factory=list)
    untouched_rows: dict[str, int] = field(default_factory=dict)

    @property
    def rekeyed(self) -> int:
        """Rows moving onto a parent card that had no row of its own."""
        return sum(1 for move in self.moves if not move.merges)

    @property
    def merged(self) -> int:
        """Rows landing on a parent card that already had one."""
        return sum(1 for move in self.moves if move.merges)

    @property
    def superseded(self) -> int:
        """Merges where the stored parent row was already further along."""
        return sum(1 for move in self.moves if move.merges and not move.incoming_wins)

    @property
    def is_empty(self) -> bool:
        return not self.moves


def build_card_remap() -> dict[_DeckKey, _DeckKey]:
    """Map every stored category ``(deck, card_id)`` onto its parent equivalent.

    Deck names come from the decks themselves rather than literals, so renaming a
    category cannot silently desync this from what is in the database.
    """
    remap: dict[_DeckKey, _DeckKey] = {}
    for slug, source in CATEGORY_SOURCE_DECKS.items():
        parent_slug = parent_slug_for_category(slug)
        if parent_slug is None:  # pragma: no cover - registry invariant
            continue
        source_deck = normalize_storage_text(source().name)
        target_deck = normalize_storage_text(ALL_DECKS[parent_slug]().name)
        for source_id, target_id in resolve_category_card_map(slug).items():
            remap[(source_deck, source_id)] = (target_deck, target_id)
    return remap


def category_deck_names() -> set[str]:
    """Return the stored deck names that belonged to thematic categories."""
    return {
        normalize_storage_text(source().name) for source in CATEGORY_SOURCE_DECKS.values()
    }


def _row_key(spec: _TableSpec, row: Mapping[str, Any]) -> tuple:
    return tuple(row[column] for column in spec.extra_key_columns)


def plan_migration(conn: sqlite3.Connection) -> MigrationPlan:
    """Work out every row that would move. Read-only."""
    remap = build_card_remap()
    source_decks = category_deck_names()
    plan = MigrationPlan()

    for spec in _TABLES:
        if not _table_exists(conn, spec.table):
            continue
        placeholders = ",".join("?" for _ in source_decks)
        rows = conn.execute(
            f"SELECT * FROM {spec.table} WHERE {spec.deck_column} IN ({placeholders})",
            sorted(source_decks),
        ).fetchall()
        if not rows:
            continue

        # Existing target rows, so a merge can be decided without a query per row.
        targets = {
            (row[spec.deck_column], int(row["card_id"]), *_row_key(spec, row)): row
            for row in conn.execute(f"SELECT * FROM {spec.table}").fetchall()
        }

        for row in rows:
            source_key = (row[spec.deck_column], int(row["card_id"]))
            target = remap.get(source_key)
            if target is None:
                plan.orphans.append(OrphanRow(spec.table, source_key[0], source_key[1]))
                continue

            existing = targets.get((target[0], target[1], *_row_key(spec, row)))
            plan.moves.append(
                PlannedMove(
                    table=spec.table,
                    source_deck=source_key[0],
                    source_card_id=source_key[1],
                    target_deck=target[0],
                    target_card_id=target[1],
                    merges=existing is not None,
                    incoming_wins=existing is None or spec.rank(row) > spec.rank(existing),
                )
            )

    for table in UNTOUCHED_TABLES:
        if not _table_exists(conn, table):
            continue
        column = "deck_name" if table != "review_events" else "deck"
        placeholders = ",".join("?" for _ in source_decks)
        count = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {column} IN ({placeholders})",
            sorted(source_decks),
        ).fetchone()[0]
        if count:
            plan.untouched_rows[table] = int(count)

    return plan


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def apply_migration(conn: sqlite3.Connection, plan: MigrationPlan) -> int:
    """Write a plan. Returns the number of source rows consumed.

    Every write happens inside the caller's transaction, and each row's
    UPDATE/INSERT precedes its DELETE, so a failure part-way rolls the whole
    thing back rather than leaving a card with progress in neither place.
    """
    specs = {spec.table: spec for spec in _TABLES}
    moved = 0

    for table, spec in specs.items():
        table_moves = [move for move in plan.moves if move.table == table]
        if not table_moves:
            continue

        columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
        value_columns = [c for c in columns if c not in (spec.deck_column, "card_id")]

        for move in table_moves:
            source = conn.execute(
                f"SELECT * FROM {table} WHERE {spec.deck_column}=? AND card_id=?",
                (move.source_deck, move.source_card_id),
            ).fetchall()
            for row in source:
                if move.incoming_wins:
                    assignments = ",".join(f"{c}=?" for c in value_columns)
                    updated = conn.execute(
                        f"UPDATE {table} SET {assignments} "
                        f"WHERE {spec.deck_column}=? AND card_id=?"
                        + "".join(f" AND {c}=?" for c in spec.extra_key_columns),
                        (
                            *[row[c] for c in value_columns],
                            move.target_deck,
                            move.target_card_id,
                            *[row[c] for c in spec.extra_key_columns],
                        ),
                    ).rowcount
                    if not updated:
                        placeholders = ",".join("?" for _ in columns)
                        conn.execute(
                            f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
                            [
                                move.target_deck
                                if column == spec.deck_column
                                else move.target_card_id
                                if column == "card_id"
                                else row[column]
                                for column in columns
                            ],
                        )
            conn.execute(
                f"DELETE FROM {table} WHERE {spec.deck_column}=? AND card_id=?",
                (move.source_deck, move.source_card_id),
            )
            moved += len(source)

    return moved


def backup_database(db_path: Path | None = None, *, now: datetime | None = None) -> Path:
    """Copy the live database beside itself before anything is rewritten.

    Naming follows the existing precedent, ``jplearn.db.backup-pre-issue66-*``.
    """
    source = db_path or database.DB_PATH
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    destination = source.with_name(f"{source.name}.backup-pre-issue78-{stamp}")
    shutil.copyfile(source, destination)
    return destination


def run_migration(
    *, apply: bool, db_path: Path | None = None, backup: bool = True
) -> tuple[MigrationPlan, Path | None]:
    """Plan the migration against a database, optionally applying it.

    Returns the plan and the backup path, if one was taken. ``db_path`` overrides
    the module-level location, which a git worktree needs because each checkout
    carries its own ``data/`` directory.

    The backup is taken before the connection is opened and only when there is
    something to write, so a dry run never touches the disk.
    """
    previous_path = database.DB_PATH
    if db_path is not None:
        database.DB_PATH = db_path
    try:
        database.init_db()
        with database._connect() as conn:  # noqa: SLF001 — same-package helper
            plan = plan_migration(conn)

        backup_path: Path | None = None
        if apply and not plan.is_empty:
            if backup:
                backup_path = backup_database(database.DB_PATH)
            with database._connect() as conn:  # noqa: SLF001
                apply_migration(conn, plan)
        return plan, backup_path
    finally:
        database.DB_PATH = previous_path


def format_report(plan: MigrationPlan) -> str:
    """Render a plan as the human-readable record of what changed."""
    if plan.is_empty and not plan.orphans:
        return "Nothing to migrate: no progress is stored under a category deck."

    lines = [
        f"Rows to move:      {len(plan.moves)}",
        f"  re-keyed:        {plan.rekeyed} (parent card had no row)",
        f"  merged:          {plan.merged} (parent card already had one)",
        f"    superseded:    {plan.superseded} (stored parent row was further along)",
        f"Orphans left:      {len(plan.orphans)} (card id resolves to nothing)",
    ]
    by_table: dict[str, int] = {}
    for move in plan.moves:
        by_table[move.table] = by_table.get(move.table, 0) + 1
    for table, count in sorted(by_table.items()):
        lines.append(f"  {table}: {count}")
    for table, count in sorted(plan.untouched_rows.items()):
        lines.append(f"Left alone — {table}: {count} rows ({UNTOUCHED_TABLES[table]})")
    for orphan in plan.orphans[:10]:
        lines.append(f"  orphan: {orphan.table} ({orphan.deck!r}, {orphan.card_id})")
    return "\n".join(lines)
