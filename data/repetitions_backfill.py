"""Correct historical ``review_states.repetitions`` totals from the review log.

Plans and optionally applies the one-time correction described in
:mod:`domain.review_replay`. Planning is read-only and always runs first,
so the effect can be inspected before anything is written.

Deliberately not a schema migration: the ``schema_version`` counter is already
claimed up to 20 by in-flight work on issue #66, and the live database has
already recorded that version, so a migration added here would never run on it.
This is also a data correction rather than a schema change, and re-running it is
harmless — a row already corrected no longer matches the old-rule checksum, so
it is skipped on the second pass.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from data import database
from domain.review_replay import ReplayedReview, recount_repetitions


@dataclass(frozen=True)
class PlannedCorrection:
    """One row whose stored total the log accounts for and disagrees with."""

    deck: str
    card_id: int
    stored: int
    corrected: int
    reviews: int


@dataclass
class BackfillPlan:
    """What the correction would do, before anything is written.

    Attributes:
        corrections: Rows to rewrite, worst inflation first.
        already_correct: Rows the log accounts for that need no change.
        skipped_unexplained: Rows whose stored total the log cannot account
            for — seeded, imported, or written before the log covered them.
            Left untouched by design.
        skipped_no_events: Rows with no logged reviews at all.
    """

    corrections: list[PlannedCorrection] = field(default_factory=list)
    already_correct: int = 0
    skipped_unexplained: int = 0
    skipped_no_events: int = 0

    @property
    def total_reduction(self) -> int:
        """Sum of repetitions removed across every planned correction."""
        return sum(c.stored - c.corrected for c in self.corrections)

    @property
    def newly_unmastered(self) -> int:
        """Corrections that drop a row below the mastered rule's reps >= 3.

        Only meaningful alongside each row's interval, which this correction
        does not touch; reported so the visible effect is never a surprise.
        """
        return sum(1 for c in self.corrections if c.stored >= 3 > c.corrected)


def _load_reviews_by_card(
    conn: sqlite3.Connection,
) -> dict[tuple[str, int], list[ReplayedReview]]:
    """Group every logged review by (deck, card_id), in chronological order."""
    has_confidence = any(
        row["name"] == "confidence_score"
        for row in conn.execute("PRAGMA table_info(review_events)").fetchall()
    )
    confidence_column = "confidence_score" if has_confidence else "NULL AS confidence_score"

    rows = conn.execute(
        f"""
        SELECT deck, card_id, quality, reviewed_on, {confidence_column}
        FROM review_events
        ORDER BY deck, card_id, reviewed_on, id
        """
    ).fetchall()

    reviews: dict[tuple[str, int], list[ReplayedReview]] = {}
    for row in rows:
        confidence = row["confidence_score"]
        reviews.setdefault((row["deck"], int(row["card_id"])), []).append(
            ReplayedReview(
                day=date.fromisoformat(row["reviewed_on"]),
                quality=int(row["quality"]),
                confidence=None if confidence is None else int(confidence),
            )
        )
    return reviews


def plan_backfill(conn: sqlite3.Connection) -> BackfillPlan:
    """Work out which rows the review log can safely correct. Read-only."""
    reviews_by_card = _load_reviews_by_card(conn)
    plan = BackfillPlan()

    for row in conn.execute("SELECT deck, card_id, repetitions FROM review_states"):
        key = (row["deck"], int(row["card_id"]))
        stored = int(row["repetitions"])
        reviews = reviews_by_card.get(key)

        if not reviews:
            plan.skipped_no_events += 1
            continue

        recount = recount_repetitions(reviews)
        if recount.under_new_rule == stored:
            # Already at the current rule's total. Checked before the checksum
            # so a row this tool has already corrected reports as correct
            # rather than as unexplained: once rewritten it no longer matches
            # the old-rule replay, which is what makes re-running a no-op.
            plan.already_correct += 1
        elif recount.under_old_rule != stored:
            # The log does not explain this row, so it cannot be trusted to
            # rewrite it. See domain/review_replay.py.
            plan.skipped_unexplained += 1
        else:
            plan.corrections.append(
                PlannedCorrection(
                    deck=key[0],
                    card_id=key[1],
                    stored=stored,
                    corrected=recount.under_new_rule,
                    reviews=recount.reviews,
                )
            )

    plan.corrections.sort(key=lambda c: (c.corrected - c.stored, c.deck, c.card_id))
    return plan


def apply_backfill(conn: sqlite3.Connection, plan: BackfillPlan) -> int:
    """Write a plan's corrections. Returns the number of rows updated."""
    conn.executemany(
        "UPDATE review_states SET repetitions=? WHERE deck=? AND card_id=?",
        [(c.corrected, c.deck, c.card_id) for c in plan.corrections],
    )
    return len(plan.corrections)


def run_backfill(*, apply: bool, db_path: Path | None = None) -> BackfillPlan:
    """Plan the correction against a database, optionally applying it.

    ``db_path`` overrides the module-level location, which a git worktree needs
    because each checkout carries its own ``data/`` directory.
    """
    previous_path = database.DB_PATH
    if db_path is not None:
        database.DB_PATH = db_path
    try:
        database.init_db()
        with database._connect() as conn:  # noqa: SLF001 — same-package helper
            plan = plan_backfill(conn)
            if apply and plan.corrections:
                apply_backfill(conn, plan)
        return plan
    finally:
        database.DB_PATH = previous_path
