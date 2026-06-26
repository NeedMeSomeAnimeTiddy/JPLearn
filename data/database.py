"""SQLite persistence for review states and progress."""

import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, TypedDict, TypeAlias

from domain.activity import ActivitySummary
from domain.history import ItemHistoryEvent, RawItemHistoryBucket
from domain.leech import evaluate_leech_state
from domain.mistakes import MistakeBreakdownRow
from domain.scheduler import ReviewState
from domain.session import SessionGoal, SessionSummary
from domain.streaks import StreakState

DB_PATH = Path(__file__).parent.parent / "data" / "jplearn.db"
SCHEMA_VERSION_TABLE = "schema_version"
LATEST_SCHEMA_VERSION = 2

StageDistribution: TypeAlias = dict[int, int]

class CurriculumStageSummary(TypedDict):
    mode: str
    script_tag: str
    attempts: int
    accuracy: int
    accuracy_7d: int
    stage_distribution: StageDistribution

class NarrativeChapterMetrics(TypedDict):
    attempts: int
    accuracy: int
    completion_rate: int

NarrativeChaptersSummary: TypeAlias = dict[str, NarrativeChapterMetrics]

class NarrativeChapterSummary(TypedDict):
    mode: str
    script_tag: str
    attempts: int
    accuracy: int
    chapters: NarrativeChaptersSummary


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema_version_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA_VERSION_TABLE} (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
        )
        """
    )


def _load_schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        f"SELECT version FROM {SCHEMA_VERSION_TABLE} WHERE id = 1"
    ).fetchone()
    if row is None:
        return 0
    return int(row["version"])


def _store_schema_version(conn: sqlite3.Connection, version: int) -> None:
    conn.execute(
        f"""
        INSERT INTO {SCHEMA_VERSION_TABLE} (id, version)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET version = excluded.version
        """,
        (version,),
    )


def _migration_0001(conn: sqlite3.Connection) -> None:
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
            curriculum_stage INTEGER,
            prompt_text TEXT    NOT NULL DEFAULT '',
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
    if "curriculum_stage" not in existing_columns:
        conn.execute("ALTER TABLE review_events ADD COLUMN curriculum_stage INTEGER")
    if "prompt_text" not in existing_columns:
        conn.execute("ALTER TABLE review_events ADD COLUMN prompt_text TEXT NOT NULL DEFAULT ''")

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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS curriculum_stages (
            deck               TEXT    NOT NULL,
            card_id            INTEGER NOT NULL,
            mode               TEXT    NOT NULL,
            stage              INTEGER NOT NULL,
            updated_at_utc     TEXT    NOT NULL,
            PRIMARY KEY (deck, card_id, mode)
        )
    """)


def _migration_0002(conn: sqlite3.Connection) -> None:
    existing_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(review_events)").fetchall()
    }
    if "session_id" not in existing_columns:
        conn.execute("ALTER TABLE review_events ADD COLUMN session_id TEXT NOT NULL DEFAULT ''")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS session_goals (
            session_id      TEXT PRIMARY KEY,
            target_items    INTEGER NOT NULL,
            target_minutes  INTEGER,
            target_accuracy INTEGER,
            started_at_utc  TEXT    NOT NULL
        )
        """
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migration_0001,
    2: _migration_0002,
}


def _apply_migrations(conn: sqlite3.Connection) -> None:
    _ensure_schema_version_table(conn)
    current_version = _load_schema_version(conn)
    for target_version in range(current_version + 1, LATEST_SCHEMA_VERSION + 1):
        migration = MIGRATIONS.get(target_version)
        if migration is None:
            raise RuntimeError(f"Missing migration implementation for version {target_version}")
        migration(conn)
        _store_schema_version(conn, target_version)


def init_db() -> None:
    """Create required tables when they do not already exist."""
    with _connect() as conn:
        _apply_migrations(conn)


def reset_db() -> None:
    """Delete all persisted review progress while keeping schema intact."""
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM review_events")
        conn.execute("DELETE FROM review_states")
        conn.execute("DELETE FROM streak_state")
        conn.execute("DELETE FROM leech_items")
        conn.execute("DELETE FROM curriculum_stages")
        conn.execute("DELETE FROM session_goals")


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
    curriculum_stage: int | None = None,
    prompt_text: str = "",
    tags: list[str] | None = None,
    session_id: str = "",
) -> None:
    """Record one review outcome for daily progress reporting."""
    review_day = reviewed_on or date.today()
    reviewed_utc = reviewed_at_utc or datetime.now(timezone.utc).isoformat(timespec="seconds")
    tags_csv = ",".join(tags or [])
    normalized_session_id = session_id.strip()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO review_events (deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag, curriculum_stage, prompt_text, tags_csv, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                deck_name,
                card_id,
                quality,
                review_day.isoformat(),
                reviewed_utc,
                script_tag,
                curriculum_stage,
                prompt_text.strip(),
                tags_csv,
                normalized_session_id,
            ),
        )


def save_session_goal(
    session_id: str,
    target_items: int,
    target_minutes: int | None = None,
    target_accuracy: int | None = None,
    started_at_utc: str | None = None,
) -> SessionGoal:
    """Insert or update one session goal row and return the saved payload."""
    normalized_session_id = session_id.strip()
    if not normalized_session_id:
        raise ValueError("session_id must not be empty")
    if target_items <= 0:
        raise ValueError("target_items must be positive")

    normalized_target_minutes = None if target_minutes is None else max(1, int(target_minutes))
    normalized_target_accuracy = None if target_accuracy is None else max(0, min(100, int(target_accuracy)))
    normalized_started_at = started_at_utc or datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO session_goals (session_id, target_items, target_minutes, target_accuracy, started_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                target_items=excluded.target_items,
                target_minutes=excluded.target_minutes,
                target_accuracy=excluded.target_accuracy,
                started_at_utc=excluded.started_at_utc
            """,
            (
                normalized_session_id,
                int(target_items),
                normalized_target_minutes,
                normalized_target_accuracy,
                normalized_started_at,
            ),
        )

    return SessionGoal(
        session_id=normalized_session_id,
        target_items=int(target_items),
        target_minutes=normalized_target_minutes,
        target_accuracy=normalized_target_accuracy,
        started_at_utc=normalized_started_at,
    )


def load_session_summary(session_id: str) -> SessionSummary | None:
    """Return computed completion metrics for one session id."""
    normalized_session_id = session_id.strip()
    if not normalized_session_id:
        raise ValueError("session_id must not be empty")

    with _connect() as conn:
        goal_row = conn.execute(
            """
            SELECT session_id, target_items, target_minutes, target_accuracy, started_at_utc
            FROM session_goals
            WHERE session_id=?
            """,
            (normalized_session_id,),
        ).fetchone()
        if goal_row is None:
            return None

        metrics_row = conn.execute(
            """
            SELECT
                COUNT(*) AS reviewed,
                COUNT(DISTINCT card_id) AS completed_items,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct
            FROM review_events
            WHERE session_id=?
            """,
            (normalized_session_id,),
        ).fetchone()

    reviewed = int((metrics_row or {})["reviewed"] or 0)
    completed_items = int((metrics_row or {})["completed_items"] or 0)
    correct = int((metrics_row or {})["correct"] or 0)
    accuracy = round((correct / reviewed) * 100) if reviewed > 0 else 0
    target_items = int(goal_row["target_items"])
    target_accuracy_value = (
        None if goal_row["target_accuracy"] is None else int(goal_row["target_accuracy"])
    )
    goal_met = completed_items >= target_items
    if target_accuracy_value is not None:
        goal_met = goal_met and accuracy >= target_accuracy_value

    return SessionSummary(
        session_id=normalized_session_id,
        target_items=target_items,
        completed_items=completed_items,
        reviewed=reviewed,
        correct=correct,
        accuracy=accuracy,
        target_accuracy=target_accuracy_value,
        goal_met=goal_met,
    )


def save_curriculum_stage(deck_name: str, card_id: int, mode: str, stage: int) -> None:
    """Persist one curriculum stage row for a card and mode."""
    normalized_mode = mode.strip().lower()
    if not normalized_mode:
        raise ValueError("mode must not be empty")
    normalized_stage = max(1, min(3, int(stage)))
    updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO curriculum_stages (deck, card_id, mode, stage, updated_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id, mode) DO UPDATE SET
                stage=excluded.stage,
                updated_at_utc=excluded.updated_at_utc
            """,
            (deck_name, card_id, normalized_mode, normalized_stage, updated_at),
        )


def load_curriculum_stages(deck_name: str, mode: str, card_ids: list[int]) -> dict[int, int]:
    """Load persisted stage map for one deck/mode; missing rows default to stage 1."""
    if not card_ids:
        return {}

    normalized_mode = mode.strip().lower()
    if not normalized_mode:
        raise ValueError("mode must not be empty")

    placeholders = ",".join("?" * len(card_ids))
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT card_id, stage
            FROM curriculum_stages
            WHERE deck=? AND mode=? AND card_id IN ({placeholders})
            """,
            [deck_name, normalized_mode, *card_ids],
        ).fetchall()

    stages = {int(row["card_id"]): max(1, min(3, int(row["stage"]))) for row in rows}
    for cid in card_ids:
        if cid not in stages:
            stages[cid] = 1
    return stages


def load_curriculum_stage_summary(mode: str, script_tag: str | None = None) -> CurriculumStageSummary:
    """Return aggregate curriculum stage metrics for one mode."""
    normalized_mode = mode.strip().lower()
    if not normalized_mode:
        raise ValueError("mode must not be empty")

    normalized_script = script_tag.strip().lower() if script_tag and script_tag.strip() else ""

    where_clause = "WHERE mode=?"
    params: list[object] = [normalized_mode]
    if normalized_script:
        where_clause += " AND deck LIKE ?"
        params.append(f"%{normalized_script.replace('_', ' ').split('_')[0]}%")

    with _connect() as conn:
        stage_rows = conn.execute(
            f"""
            SELECT stage, COUNT(*) AS item_count
            FROM curriculum_stages
            {where_clause}
            GROUP BY stage
            ORDER BY stage ASC
            """,
            params,
        ).fetchall()
        accuracy_where = "WHERE tags_csv LIKE ?"
        accuracy_params: list[object] = [f"%{normalized_mode}%"]
        if normalized_script:
            accuracy_where += " AND script_tag=?"
            accuracy_params.append(normalized_script)

        accuracy_row = conn.execute(
            f"""
            SELECT
                COUNT(*) AS attempts,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct
            FROM review_events
            {accuracy_where}
            """,
            accuracy_params,
        ).fetchone()

        recent_row = conn.execute(
            f"""
            SELECT
                COUNT(*) AS attempts,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct
            FROM review_events
            {accuracy_where} AND reviewed_on >= date('now', '-6 day')
            """,
            accuracy_params,
        ).fetchone()

    stage_distribution = {
        int(row["stage"]): int(row["item_count"] or 0)
        for row in stage_rows
    }
    for stage in (1, 2, 3):
        if stage not in stage_distribution:
            stage_distribution[stage] = 0

    attempts = int((accuracy_row or {})["attempts"] or 0)
    correct = int((accuracy_row or {})["correct"] or 0)
    accuracy = round((correct / attempts) * 100) if attempts > 0 else 0
    recent_attempts = int((recent_row or {})["attempts"] or 0)
    recent_correct = int((recent_row or {})["correct"] or 0)
    accuracy_7d = round((recent_correct / recent_attempts) * 100) if recent_attempts > 0 else 0

    return {
        "mode": normalized_mode,
        "script_tag": normalized_script or "all",
        "attempts": attempts,
        "accuracy": accuracy,
        "accuracy_7d": accuracy_7d,
        "stage_distribution": stage_distribution,
    }


def load_narrative_chapter_summary(script_tag: str | None = None) -> NarrativeChapterSummary:
    """Return chapter-level narrative metrics from review events and curriculum stages."""
    normalized_script = script_tag.strip().lower() if script_tag and script_tag.strip() else ""

    where_clause = "WHERE tags_csv LIKE ?"
    params: list[object] = ["%narrative_story%"]
    if normalized_script:
        where_clause += " AND script_tag=?"
        params.append(normalized_script)

    with _connect() as conn:
        overall_row = conn.execute(
            f"""
            SELECT
                COUNT(*) AS attempts,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct
            FROM review_events
            {where_clause}
            """,
            params,
        ).fetchone()

        chapter_rows = conn.execute(
            f"""
            SELECT
                CASE
                    WHEN curriculum_stage IN (1, 2, 3) THEN curriculum_stage
                    WHEN tags_csv LIKE '%chapter_1%' THEN 1
                    WHEN tags_csv LIKE '%chapter_2%' THEN 2
                    WHEN tags_csv LIKE '%chapter_3%' THEN 3
                    ELSE 0
                END AS chapter,
                COUNT(*) AS attempts,
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct
            FROM review_events
            {where_clause}
            GROUP BY chapter
            """,
            params,
        ).fetchall()

    attempts = int((overall_row or {})["attempts"] or 0)
    correct = int((overall_row or {})["correct"] or 0)
    accuracy = round((correct / attempts) * 100) if attempts > 0 else 0

    chapter_stats: dict[int, NarrativeChapterMetrics] = {
        1: {"attempts": 0, "accuracy": 0, "completion_rate": 0},
        2: {"attempts": 0, "accuracy": 0, "completion_rate": 0},
        3: {"attempts": 0, "accuracy": 0, "completion_rate": 0},
    }
    for row in chapter_rows:
        chapter = int(row["chapter"] or 0)
        if chapter not in chapter_stats:
            continue
        chapter_attempts = int(row["attempts"] or 0)
        chapter_correct = int(row["correct"] or 0)
        chapter_accuracy = round((chapter_correct / chapter_attempts) * 100) if chapter_attempts > 0 else 0
        chapter_stats[chapter]["attempts"] = chapter_attempts
        chapter_stats[chapter]["accuracy"] = chapter_accuracy

    stage_summary = load_curriculum_stage_summary("context_cloze", script_tag=normalized_script or None)
    stage_distribution = stage_summary["stage_distribution"]
    if not isinstance(stage_distribution, dict):
        stage_distribution = {1: 0, 2: 0, 3: 0}
    stage_1 = int(stage_distribution[1])
    stage_2 = int(stage_distribution[2])
    stage_3 = int(stage_distribution[3])
    tracked = stage_1 + stage_2 + stage_3

    chapter_stats[1]["completion_rate"] = 100 if tracked > 0 else 0
    chapter_stats[2]["completion_rate"] = round(((stage_2 + stage_3) / tracked) * 100) if tracked > 0 else 0
    chapter_stats[3]["completion_rate"] = round((stage_3 / tracked) * 100) if tracked > 0 else 0

    return {
        "mode": "narrative_story",
        "script_tag": normalized_script or "all",
        "attempts": attempts,
        "accuracy": accuracy,
        "chapters": {
            "1": chapter_stats[1],
            "2": chapter_stats[2],
            "3": chapter_stats[3],
        },
    }


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
            SELECT id, deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag, prompt_text
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

    grouped: dict[str, RawItemHistoryBucket] = {}
    for row in rows:
        key = f"{row['deck']}:{row['card_id']}"
        row_prompt_text = str(row["prompt_text"] or "").strip()
        if key not in grouped:
            if len(grouped) >= limit_items:
                continue
            grouped[key] = RawItemHistoryBucket(
                key=key,
                script_tag=str(row["script_tag"] or "unknown"),
                deck=str(row["deck"]),
                card_id=int(row["card_id"]),
                prompt=row_prompt_text,
                events=[],
                successes=[],
            )

        bucket = grouped[key]
        if not bucket.prompt and row_prompt_text:
            grouped[key] = RawItemHistoryBucket(
                key=bucket.key,
                script_tag=bucket.script_tag,
                deck=bucket.deck,
                card_id=bucket.card_id,
                prompt=row_prompt_text,
                events=bucket.events,
                successes=bucket.successes,
            )
            bucket = grouped[key]
        events = bucket.events
        successes = bucket.successes
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

    return list(grouped.values())


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
