"""SQLite persistence for review states and progress."""

import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from domain.activity import ActivitySummary
from domain.history import ItemHistoryEvent, RawItemHistoryBucket
from domain.leech import evaluate_leech_state
from domain.mistakes import MistakeBreakdownRow
from domain.scheduler import ReviewState
from domain.streaks import StreakState

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
                reviewed_on TEXT    NOT NULL,
                reviewed_at_utc TEXT NOT NULL DEFAULT '',
                script_tag  TEXT    NOT NULL DEFAULT '',
                tags_csv    TEXT    NOT NULL DEFAULT ''
            )
        """)
        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(review_events)").fetchall()
        }
        if "script_tag" not in existing_columns:
            conn.execute("ALTER TABLE review_events ADD COLUMN script_tag TEXT NOT NULL DEFAULT ''")
        if "tags_csv" not in existing_columns:
            conn.execute("ALTER TABLE review_events ADD COLUMN tags_csv TEXT NOT NULL DEFAULT ''")
        if "reviewed_at_utc" not in existing_columns:
            conn.execute("ALTER TABLE review_events ADD COLUMN reviewed_at_utc TEXT NOT NULL DEFAULT ''")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS streak_state (
                id                   INTEGER PRIMARY KEY CHECK (id = 1),
                last_study_day_utc   TEXT,
                last_study_day_local TEXT,
                current_streak_days  INTEGER NOT NULL DEFAULT 0,
                best_streak_days     INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS leech_items (
                deck                 TEXT    NOT NULL,
                card_id              INTEGER NOT NULL,
                is_active            INTEGER NOT NULL DEFAULT 0,
                attempts_recent      INTEGER NOT NULL DEFAULT 0,
                failures_recent      INTEGER NOT NULL DEFAULT 0,
                last_evaluated_utc   TEXT    NOT NULL,
                PRIMARY KEY (deck, card_id)
            )
        """)


def reset_db() -> None:
    """Delete all persisted review progress while keeping schema intact."""
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM review_events")
        conn.execute("DELETE FROM review_states")
        conn.execute("DELETE FROM streak_state")
        conn.execute("DELETE FROM leech_items")


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


def log_review(
    deck_name: str,
    card_id: int,
    quality: int,
    reviewed_on: date | None = None,
    reviewed_at_utc: str | None = None,
    script_tag: str = "",
    tags: list[str] | None = None,
) -> None:
    """Record one review outcome for daily progress reporting."""
    review_day = reviewed_on or date.today()
    reviewed_utc = reviewed_at_utc or datetime.now(timezone.utc).isoformat(timespec="seconds")
    tags_csv = ",".join(tags or [])
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO review_events (deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag, tags_csv)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (deck_name, card_id, quality, review_day.isoformat(), reviewed_utc, script_tag, tags_csv),
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


def load_streak_state() -> StreakState:
    """Load persisted streak state or defaults when no row exists."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT last_study_day_utc, last_study_day_local, current_streak_days, best_streak_days
            FROM streak_state
            WHERE id=1
            """
        ).fetchone()

    if row is None:
        return StreakState()

    return StreakState(
        last_study_day_utc=date.fromisoformat(row["last_study_day_utc"]) if row["last_study_day_utc"] else None,
        last_study_day_local=date.fromisoformat(row["last_study_day_local"]) if row["last_study_day_local"] else None,
        current_streak_days=row["current_streak_days"],
        best_streak_days=row["best_streak_days"],
    )


def save_streak_state(state: StreakState) -> None:
    """Insert or update the singleton streak state row."""
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO streak_state (id, last_study_day_utc, last_study_day_local, current_streak_days, best_streak_days)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                last_study_day_utc=excluded.last_study_day_utc,
                last_study_day_local=excluded.last_study_day_local,
                current_streak_days=excluded.current_streak_days,
                best_streak_days=excluded.best_streak_days
            """,
            (
                state.last_study_day_utc.isoformat() if state.last_study_day_utc else None,
                state.last_study_day_local.isoformat() if state.last_study_day_local else None,
                state.current_streak_days,
                state.best_streak_days,
            ),
        )


def load_activity_summary(window_days: int, on_date: date | None = None) -> ActivitySummary:
    """Return aggregated review activity for the inclusive rolling day window."""
    if window_days <= 0:
        raise ValueError("window_days must be positive")

    target_day = on_date or date.today()
    start_day = target_day - timedelta(days=window_days - 1)

    with _connect() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS reviewed,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct,
                SUM(CASE WHEN quality < 3 THEN 1 ELSE 0 END) AS incorrect,
                COUNT(DISTINCT reviewed_on) AS active_days
            FROM review_events
            WHERE reviewed_on BETWEEN ? AND ?
            """,
            (start_day.isoformat(), target_day.isoformat()),
        ).fetchone()

    reviewed = int(row["reviewed"] or 0)
    correct = int(row["correct"] or 0)
    incorrect = int(row["incorrect"] or 0)
    active_days = int(row["active_days"] or 0)
    accuracy = round((correct / reviewed) * 100) if reviewed > 0 else 0
    points_earned = correct

    return ActivitySummary(
        days=window_days,
        reviewed=reviewed,
        correct=correct,
        incorrect=incorrect,
        accuracy=accuracy,
        points_earned=points_earned,
        active_days=active_days,
    )


def load_mistake_breakdown(limit: int = 6) -> list[MistakeBreakdownRow]:
    """Return top weak buckets grouped by script tag from review events."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                CASE
                    WHEN script_tag IS NULL OR script_tag = '' THEN 'unknown'
                    ELSE script_tag
                END AS key,
                COUNT(*) AS attempts,
                SUM(CASE WHEN quality < 3 THEN 1 ELSE 0 END) AS mistakes
            FROM review_events
            GROUP BY key
            HAVING COUNT(*) > 0
            ORDER BY
                CAST(SUM(CASE WHEN quality < 3 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) DESC,
                SUM(CASE WHEN quality < 3 THEN 1 ELSE 0 END) DESC,
                COUNT(*) DESC,
                key ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    breakdown: list[MistakeBreakdownRow] = []
    for row in rows:
        attempts = int(row["attempts"] or 0)
        mistakes = int(row["mistakes"] or 0)
        error_rate = round((mistakes / attempts) * 100) if attempts > 0 else 0
        breakdown.append(
            MistakeBreakdownRow(
                key=str(row["key"]),
                attempts=attempts,
                mistakes=mistakes,
                error_rate=error_rate,
            )
        )
    return breakdown


def load_raw_item_history(limit_items: int = 8, events_per_item: int = 8) -> list[RawItemHistoryBucket]:
    """Return recent per-item history groups with bounded item/event counts."""
    if limit_items <= 0:
        raise ValueError("limit_items must be positive")
    if events_per_item <= 0:
        raise ValueError("events_per_item must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag
            FROM review_events
            ORDER BY
                CASE
                    WHEN reviewed_at_utc IS NULL OR reviewed_at_utc = ''
                        THEN reviewed_on || 'T00:00:00+00:00'
                    ELSE reviewed_at_utc
                END DESC,
                id DESC
            """
        ).fetchall()

    grouped: dict[str, dict[str, object]] = {}
    for row in rows:
        key = f"{row['deck']}:{row['card_id']}"
        if key not in grouped:
            if len(grouped) >= limit_items:
                continue
            grouped[key] = {
                "key": key,
                "script_tag": row["script_tag"] or "unknown",
                "deck": row["deck"],
                "card_id": int(row["card_id"]),
                "events": [],
                "successes": [],
            }

        bucket = grouped[key]
        events: list[ItemHistoryEvent] = bucket["events"]  # type: ignore[assignment]
        successes: list[int] = bucket["successes"]  # type: ignore[assignment]
        if len(events) >= events_per_item:
            continue

        reviewed_at = row["reviewed_at_utc"] or f"{row['reviewed_on']}T00:00:00+00:00"
        is_success = int(row["quality"] >= 3)
        events.append(
            ItemHistoryEvent(
                reviewed_at_utc=reviewed_at,
                outcome="correct" if is_success else "incorrect",
                points_delta=1 if is_success else 0,
            )
        )
        successes.append(is_success)

    result: list[RawItemHistoryBucket] = []
    for value in grouped.values():
        result.append(
            RawItemHistoryBucket(
                key=value["key"],
                script_tag=value["script_tag"],
                deck=value["deck"],
                card_id=value["card_id"],
                prompt="",
                events=value["events"],
                successes=value["successes"],
            )
        )

    return result


def update_leech_state_for_card(
    deck_name: str,
    card_id: int,
    window_size: int = 5,
    fail_threshold: int = 3,
) -> None:
    """Recompute and persist leech state for a card from recent review events."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT quality
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY
                CASE
                    WHEN reviewed_at_utc IS NULL OR reviewed_at_utc = ''
                        THEN reviewed_on || 'T00:00:00+00:00'
                    ELSE reviewed_at_utc
                END DESC,
                id DESC
            LIMIT ?
            """,
            (deck_name, card_id, window_size),
        ).fetchall()

    qualities = [int(row["quality"]) for row in rows]
    evaluation = evaluate_leech_state(qualities, window_size=window_size, fail_threshold=fail_threshold)
    evaluated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO leech_items (deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                is_active=excluded.is_active,
                attempts_recent=excluded.attempts_recent,
                failures_recent=excluded.failures_recent,
                last_evaluated_utc=excluded.last_evaluated_utc
            """,
            (
                deck_name,
                card_id,
                1 if evaluation.is_active else 0,
                evaluation.attempts_recent,
                evaluation.failures_recent,
                evaluated_at,
            ),
        )


def load_active_leech_card_ids(deck_name: str) -> set[int]:
    """Return active leech card ids for the given deck."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT card_id
            FROM leech_items
            WHERE deck=? AND is_active=1
            """,
            (deck_name,),
        ).fetchall()

    return {int(row["card_id"]) for row in rows}
