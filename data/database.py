"""SQLite persistence for review states and progress."""

import sqlite3
from datetime import date
from pathlib import Path

from domain.scheduler import ReviewState

DB_PATH = Path(__file__).parent.parent / "data" / "jplearn.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create required tables when they do not already exist."""
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS review_states (
                deck        TEXT    NOT NULL,
                card_id     INTEGER NOT NULL,
                ease_factor REAL    NOT NULL DEFAULT 2.5,
                interval    INTEGER NOT NULL DEFAULT 1,
                repetitions INTEGER NOT NULL DEFAULT 0,
                next_review TEXT    NOT NULL,
                PRIMARY KEY (deck, card_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS review_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                deck        TEXT    NOT NULL,
                card_id     INTEGER NOT NULL,
                quality     INTEGER NOT NULL,
                reviewed_on TEXT    NOT NULL
            )
        """)


def load_states(deck_name: str, card_ids: list[int]) -> dict[int, ReviewState]:
    """Load persisted states for a deck; missing cards get default ReviewState."""
    if not card_ids:
        return {}

    with _connect() as conn:
        placeholders = ",".join("?" * len(card_ids))
        rows = conn.execute(
            f"SELECT * FROM review_states WHERE deck=? AND card_id IN ({placeholders})",
            [deck_name, *card_ids],
        ).fetchall()

    states = {
        row["card_id"]: ReviewState(
            card_id=row["card_id"],
            ease_factor=row["ease_factor"],
            interval=row["interval"],
            repetitions=row["repetitions"],
            next_review=date.fromisoformat(row["next_review"]),
        )
        for row in rows
    }
    # Create default states for any card not yet in DB
    for cid in card_ids:
        if cid not in states:
            states[cid] = ReviewState(card_id=cid)
    return states


def save_state(deck_name: str, state: ReviewState) -> None:
    """Insert or update one review state row."""
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO review_states (deck, card_id, ease_factor, interval, repetitions, next_review)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                ease_factor=excluded.ease_factor,
                interval=excluded.interval,
                repetitions=excluded.repetitions,
                next_review=excluded.next_review
            """,
            (
                deck_name,
                state.card_id,
                state.ease_factor,
                state.interval,
                state.repetitions,
                state.next_review.isoformat(),
            ),
        )


def log_review(deck_name: str, card_id: int, quality: int, reviewed_on: date | None = None) -> None:
    """Record one review outcome for daily progress reporting."""
    review_day = reviewed_on or date.today()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO review_events (deck, card_id, quality, reviewed_on)
            VALUES (?, ?, ?, ?)
            """,
            (deck_name, card_id, quality, review_day.isoformat()),
        )


def load_today_progress(
    deck_name: str, card_ids: list[int], on_date: date | None = None
) -> tuple[int, int]:
    """Return (due_today, completed_today) for the selected deck cards."""
    if not card_ids:
        return (0, 0)

    target_day = on_date or date.today()
    states = load_states(deck_name, card_ids)
    due_remaining = sum(1 for state in states.values() if state.next_review <= target_day)

    placeholders = ",".join("?" * len(card_ids))
    with _connect() as conn:
        completed_today = conn.execute(
            f"""
            SELECT COUNT(DISTINCT card_id)
            FROM review_events
            WHERE deck=? AND reviewed_on=? AND card_id IN ({placeholders})
            """,
            [deck_name, target_day.isoformat(), *card_ids],
        ).fetchone()[0]

    due_today = due_remaining + completed_today
    return due_today, completed_today
