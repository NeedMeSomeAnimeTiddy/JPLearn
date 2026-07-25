"""Rebuild overwritten ``review_states`` rows by replaying their review log.

Expertise seeding writes a synthetic mastered state over every card in a deck
without logging a review, discarding whatever scheduling the learner had built
up. Those rows are exactly the ones
:mod:`data.repetitions_backfill` refuses to touch, because the log does not
account for them. This module is the other half: where the log *does* hold real
history for such a row, replay it and put the scheduling back.

Rebuilding reschedules cards, so planning is read-only and always runs first.

Replay happens under the learner's saved FSRS weights when they have any. The
live app installs them at startup (``scripts/desktop_bridge.py``), so replaying
under the defaults would rebuild state the running app would never produce.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from data import database
from data.repetitions_backfill import _load_reviews_by_card
from domain.review_replay import ReplayedReview, rebuild_review_state
from domain.scheduler import ReviewState, get_weights, set_weights


@dataclass(frozen=True)
class PlannedRebuild:
    """One row the log can rebuild, with before and after side by side."""

    deck: str
    card_id: int
    before: ReviewState
    after: ReviewState
    reviews: int

    @property
    def interval_delta(self) -> int:
        return self.after.interval - self.before.interval

    def is_due_on(self, today: date) -> bool:
        return self.after.next_review <= today


@dataclass
class RebuildPlan:
    """What the rebuild would do, before anything is written.

    Attributes:
        rebuilds: Rows to rewrite, largest interval drop first.
        skipped_explained: Rows whose stored state the log already accounts
            for — nothing was overwritten, so there is nothing to rebuild.
        skipped_no_events: Rows with no logged history to rebuild from.
    """

    rebuilds: list[PlannedRebuild] = field(default_factory=list)
    skipped_explained: int = 0
    skipped_no_events: int = 0

    def due_after(self, today: date) -> int:
        """How many rebuilt rows come back due immediately."""
        return sum(1 for r in self.rebuilds if r.is_due_on(today))

    @property
    def losing_mastered(self) -> int:
        """Rows mastered before the rebuild that are not mastered after."""
        return sum(
            1
            for r in self.rebuilds
            if _is_mastered(r.before) and not _is_mastered(r.after)
        )

    @property
    def gaining_mastered(self) -> int:
        return sum(
            1
            for r in self.rebuilds
            if not _is_mastered(r.before) and _is_mastered(r.after)
        )


def _is_mastered(state: ReviewState) -> bool:
    """The app's mastered rule, kept here so the report speaks its language."""
    return state.repetitions >= 3 and state.interval >= 21


def _load_saved_weights(conn: sqlite3.Connection) -> tuple[float, ...] | None:
    """Read the learner's optimized FSRS weights, if they have any."""
    try:
        row = conn.execute(
            "SELECT value FROM user_settings WHERE key='fsrs_weights'"
        ).fetchone()
    except sqlite3.Error:
        return None
    if row is None or not row["value"]:
        return None
    try:
        weights = tuple(float(part) for part in str(row["value"]).split(","))
    except ValueError:
        return None
    return weights if len(weights) == 17 else None


def plan_rebuild(
    conn: sqlite3.Connection, *, deck: str | None = None
) -> RebuildPlan:
    """Work out which rows the log can rebuild. Read-only."""
    reviews_by_card = _load_reviews_by_card(conn)
    plan = RebuildPlan()

    query = "SELECT * FROM review_states"
    params: tuple[str, ...] = ()
    if deck is not None:
        query += " WHERE deck=?"
        params = (database._normalize_deck_name(deck),)  # noqa: SLF001

    saved_weights = _load_saved_weights(conn)
    previous_weights = get_weights()
    if saved_weights is not None:
        set_weights(saved_weights)
    try:
        for row in conn.execute(query, params):
            key = (row["deck"], int(row["card_id"]))
            reviews: list[ReplayedReview] | None = reviews_by_card.get(key)

            if not reviews:
                plan.skipped_no_events += 1
                continue

            before = _row_to_state(row)
            if before.last_review == reviews[-1].day:
                # A row the app maintained review by review carries the date of
                # its own last logged review. A row written over it does not:
                # seeding backdates last_review to a date of its own choosing.
                #
                # This is the gate rather than comparing repetitions, which only
                # catches an overwrite when the synthetic count happens to
                # disagree with the log — seeding writes repetitions=4, so every
                # card with four successful days would slip through with its
                # synthetic interval intact.
                plan.skipped_explained += 1
                continue

            plan.rebuilds.append(
                PlannedRebuild(
                    deck=key[0],
                    card_id=key[1],
                    before=before,
                    after=rebuild_review_state(key[1], reviews),
                    reviews=len(reviews),
                )
            )
    finally:
        set_weights(previous_weights)

    plan.rebuilds.sort(key=lambda r: (r.interval_delta, r.deck, r.card_id))
    return plan


def _row_to_state(row: sqlite3.Row) -> ReviewState:
    return ReviewState(
        card_id=int(row["card_id"]),
        ease_factor=row["ease_factor"],
        interval=int(row["interval"]),
        repetitions=int(row["repetitions"]),
        next_review=date.fromisoformat(row["next_review"]),
        stability=row["stability"],
        difficulty=row["difficulty"],
        last_review=(
            date.fromisoformat(row["last_review"]) if row["last_review"] else None
        ),
    )


def apply_rebuild(conn: sqlite3.Connection, plan: RebuildPlan) -> int:
    """Write a plan's rebuilds. Returns the number of rows updated."""
    conn.executemany(
        """
        UPDATE review_states
        SET ease_factor=?, interval=?, repetitions=?, next_review=?,
            stability=?, difficulty=?, last_review=?
        WHERE deck=? AND card_id=?
        """,
        [
            (
                r.after.ease_factor,
                r.after.interval,
                r.after.repetitions,
                r.after.next_review.isoformat(),
                r.after.stability,
                r.after.difficulty,
                r.after.last_review.isoformat() if r.after.last_review else None,
                r.deck,
                r.card_id,
            )
            for r in plan.rebuilds
        ],
    )
    return len(plan.rebuilds)


def run_rebuild(
    *, apply: bool, deck: str | None = None, db_path: Path | None = None
) -> RebuildPlan:
    """Plan the rebuild against a database, optionally applying it."""
    previous_path = database.DB_PATH
    if db_path is not None:
        database.DB_PATH = db_path
    try:
        database.init_db()
        with database._connect() as conn:  # noqa: SLF001 — same-package helper
            plan = plan_rebuild(conn, deck=deck)
            if apply and plan.rebuilds:
                apply_rebuild(conn, plan)
        return plan
    finally:
        database.DB_PATH = previous_path
