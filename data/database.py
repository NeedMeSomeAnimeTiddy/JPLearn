"""SQLite persistence for review states and progress."""

import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, TypedDict, TypeAlias, cast

from domain.activity import ActivitySummary
from domain.assistant import AssistantEvent, AssistantEventPriority, AssistantMood, AssistantState
from domain.history import ItemHistoryEvent, RawItemHistoryBucket
from domain.leech import evaluate_leech_state
from domain.mistakes import MistakeBreakdownRow
from domain.scheduler import ReviewState
from domain.session import SessionGoal, SessionSummary
from domain.streaks import StreakState
from data.text_normalization import normalize_japanese_text, normalize_storage_text

DB_PATH = Path(__file__).parent.parent / "data" / "jplearn.db"
SCHEMA_VERSION_TABLE = "schema_version"
MIGRATION_V1 = 1
MIGRATION_V2 = 2
MIGRATION_V3 = 3
MIGRATION_V4 = 4
MIGRATION_V5 = 5
MIGRATION_V6 = 6
MIGRATION_V7 = 7
MIGRATION_V8 = 8
MIGRATION_V9 = 9
MIGRATION_V10 = 10
LATEST_SCHEMA_VERSION = 10

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


class AssistantProfile(TypedDict):
    persona_style: str
    popup_cadence: str
    emotion_persistence: str
    llm_backend: str
    chat_retention: str
    updated_at_utc: str


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


def _migration_0003(conn: sqlite3.Connection) -> None:
    existing_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(review_events)").fetchall()
    }
    if "confidence_score" not in existing_columns:
        conn.execute("ALTER TABLE review_events ADD COLUMN confidence_score INTEGER")


def _migration_0004(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            persona_style TEXT NOT NULL DEFAULT 'coach',
            popup_cadence TEXT NOT NULL DEFAULT 'high',
            emotion_persistence TEXT NOT NULL DEFAULT 'long_memory',
            llm_backend TEXT NOT NULL DEFAULT 'llama.cpp',
            chat_retention TEXT NOT NULL DEFAULT 'minimal',
            updated_at_utc TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_state_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mood TEXT NOT NULL,
            momentum INTEGER NOT NULL,
            confidence_level INTEGER NOT NULL,
            focus_area TEXT NOT NULL,
            last_major_event TEXT NOT NULL,
            recorded_at_utc TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            priority TEXT NOT NULL,
            message_key TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at_utc TEXT NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_chat_turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at_utc TEXT NOT NULL
        )
        """
    )


def _migration_0005(conn: sqlite3.Connection) -> None:
    existing_event_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(assistant_events)").fetchall()
    }
    if "dedup_key" not in existing_event_columns:
        conn.execute("ALTER TABLE assistant_events ADD COLUMN dedup_key TEXT NOT NULL DEFAULT ''")
    if "cooldown_minutes" not in existing_event_columns:
        conn.execute("ALTER TABLE assistant_events ADD COLUMN cooldown_minutes INTEGER NOT NULL DEFAULT 60")
    if "consumed_at_utc" not in existing_event_columns:
        conn.execute("ALTER TABLE assistant_events ADD COLUMN consumed_at_utc TEXT")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_memory_facts (
            fact_key TEXT PRIMARY KEY,
            fact_value TEXT NOT NULL,
            source TEXT NOT NULL,
            linked_event_id INTEGER,
            updated_at_utc TEXT NOT NULL
        )
        """
    )


def _migration_0006(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_event_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            interaction_type TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at_utc TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assistant_event_interactions_event_id
        ON assistant_event_interactions (event_id)
        """
    )


def _migration_0007(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS assistant_chat_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_turn_id INTEGER NOT NULL,
            end_turn_id INTEGER NOT NULL,
            summary_json TEXT NOT NULL,
            created_at_utc TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assistant_chat_summaries_turn_window
        ON assistant_chat_summaries (start_turn_id, end_turn_id)
        """
    )


def _migration_0008(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_progression (
            node_id                TEXT PRIMARY KEY,
            status                 TEXT NOT NULL DEFAULT 'locked',
            mastered_item_count    INTEGER NOT NULL DEFAULT 0,
            total_item_count       INTEGER NOT NULL DEFAULT 0,
            first_activated_at     TEXT,
            mastered_at            TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_feature_unlocks (
            feature_id   TEXT PRIMARY KEY,
            unlocked_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_xp (
            id                      INTEGER PRIMARY KEY CHECK (id = 1),
            total_xp                INTEGER NOT NULL DEFAULT 0,
            level                   INTEGER NOT NULL DEFAULT 1,
            applied_dedup_keys_json TEXT    NOT NULL DEFAULT '[]'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tutor_reactions_seen (
            dedup_key    TEXT PRIMARY KEY,
            dismissed_at TEXT NOT NULL
        )
        """
    )


def _migration_0009(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jlpt_exam_results (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            level               TEXT    NOT NULL,
            mode                TEXT    NOT NULL,
            questions_answered  INTEGER NOT NULL,
            correct             INTEGER NOT NULL,
            accuracy            REAL    NOT NULL,
            projected_score     INTEGER,
            completed_at_utc    TEXT    NOT NULL
        )
        """
    )


def _migration_0010(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    MIGRATION_V1: _migration_0001,
    MIGRATION_V2: _migration_0002,
    MIGRATION_V3: _migration_0003,
    MIGRATION_V4: _migration_0004,
    MIGRATION_V5: _migration_0005,
    MIGRATION_V6: _migration_0006,
    MIGRATION_V7: _migration_0007,
    MIGRATION_V8: _migration_0008,
    MIGRATION_V9: _migration_0009,
    MIGRATION_V10: _migration_0010,
}


def _validate_migration_plan() -> None:
    expected = list(range(1, LATEST_SCHEMA_VERSION + 1))
    observed = sorted(MIGRATIONS.keys())
    if observed != expected:
        raise RuntimeError(
            f"Invalid migration plan: expected versions {expected}, found {observed}"
        )


def _apply_migrations(conn: sqlite3.Connection) -> None:
    _validate_migration_plan()
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


def _normalize_deck_name(deck_name: str) -> str:
    return normalize_storage_text(deck_name)


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
        conn.execute("DELETE FROM assistant_state_snapshots")
        conn.execute("DELETE FROM assistant_events")
        conn.execute("DELETE FROM assistant_chat_turns")
        conn.execute("DELETE FROM assistant_memory_facts")
        conn.execute("DELETE FROM assistant_event_interactions")
        conn.execute("DELETE FROM assistant_chat_summaries")
        conn.execute("DELETE FROM user_progression")
        conn.execute("DELETE FROM user_feature_unlocks")
        conn.execute("DELETE FROM user_xp")
        conn.execute("DELETE FROM tutor_reactions_seen")


# ---------------------------------------------------------------------------
# Progression, feature, XP, and tutor state repositories (V8)
# ---------------------------------------------------------------------------


def load_user_progression(conn: sqlite3.Connection | None = None) -> list[sqlite3.Row]:
    """Return all rows from user_progression."""
    def _query(c: sqlite3.Connection) -> list[sqlite3.Row]:
        return c.execute("SELECT * FROM user_progression").fetchall()

    if conn is not None:
        return _query(conn)
    init_db()
    with _connect() as c:
        return _query(c)


def upsert_progression_node(
    node_id: str,
    status: str,
    mastered_item_count: int,
    total_item_count: int,
    first_activated_at: str | None,
    mastered_at: str | None,
) -> None:
    """Insert or update one progression node row."""
    init_db()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_progression
                (node_id, status, mastered_item_count, total_item_count,
                 first_activated_at, mastered_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                status              = excluded.status,
                mastered_item_count = excluded.mastered_item_count,
                total_item_count    = excluded.total_item_count,
                first_activated_at  = excluded.first_activated_at,
                mastered_at         = excluded.mastered_at
            """,
            (node_id, status, mastered_item_count, total_item_count,
             first_activated_at, mastered_at),
        )


def load_feature_unlocks() -> set[str]:
    """Return the set of unlocked feature_ids."""
    init_db()
    with _connect() as conn:
        rows = conn.execute("SELECT feature_id FROM user_feature_unlocks").fetchall()
    return {row["feature_id"] for row in rows}


def save_feature_unlock(feature_id: str, unlocked_at: str) -> None:
    """Record a feature as unlocked (idempotent)."""
    init_db()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO user_feature_unlocks (feature_id, unlocked_at)
            VALUES (?, ?)
            """,
            (feature_id, unlocked_at),
        )


def load_user_xp() -> dict[str, object]:
    """Return the single user_xp row as a dict, or defaults if absent."""
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM user_xp WHERE id = 1").fetchone()
    if row is None:
        return {"total_xp": 0, "level": 1, "applied_dedup_keys_json": "[]"}
    return {
        "total_xp": row["total_xp"],
        "level": row["level"],
        "applied_dedup_keys_json": row["applied_dedup_keys_json"],
    }


def save_user_xp(total_xp: int, level: int, applied_dedup_keys_json: str) -> None:
    """Upsert the user_xp row."""
    init_db()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_xp (id, total_xp, level, applied_dedup_keys_json)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                total_xp                = excluded.total_xp,
                level                   = excluded.level,
                applied_dedup_keys_json = excluded.applied_dedup_keys_json
            """,
            (total_xp, level, applied_dedup_keys_json),
        )


def load_tutor_seen_keys() -> set[str]:
    """Return all dedup_keys already seen by the tutor."""
    init_db()
    with _connect() as conn:
        rows = conn.execute("SELECT dedup_key FROM tutor_reactions_seen").fetchall()
    return {row["dedup_key"] for row in rows}


def save_tutor_seen_key(dedup_key: str, dismissed_at: str) -> None:
    """Persist a tutor reaction dedup key (idempotent)."""
    init_db()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO tutor_reactions_seen (dedup_key, dismissed_at)
            VALUES (?, ?)
            """,
            (dedup_key, dismissed_at),
        )


def load_states(deck_name: str, card_ids: list[int]) -> dict[int, ReviewState]:
    """Load persisted states for a deck; missing cards get default ReviewState."""
    if not card_ids:
        return {}

    normalized_deck_name = _normalize_deck_name(deck_name)
    with _connect() as conn:
        placeholders = ",".join("?" * len(card_ids))
        rows = conn.execute(
            f"SELECT * FROM review_states WHERE deck=? AND card_id IN ({placeholders})",
            [normalized_deck_name, *card_ids],
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
    normalized_deck_name = _normalize_deck_name(deck_name)
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
                normalized_deck_name,
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
    confidence_score: int | None = None,
) -> None:
    """Record one review outcome for daily progress reporting."""
    review_day = reviewed_on or date.today()
    reviewed_utc = reviewed_at_utc or datetime.now(timezone.utc).isoformat(timespec="seconds")
    normalized_deck_name = _normalize_deck_name(deck_name)
    normalized_script_tag = normalize_storage_text(script_tag).lower()
    normalized_prompt_text = normalize_japanese_text(prompt_text)
    normalized_tags: list[str] = []
    for tag in tags or []:
        normalized_tag = normalize_storage_text(tag)
        if normalized_tag:
            normalized_tags.append(normalized_tag)
    tags_csv = ",".join(normalized_tags)
    normalized_session_id = normalize_storage_text(session_id)
    normalized_confidence = None if confidence_score is None else max(1, min(5, int(confidence_score)))
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO review_events (deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag, curriculum_stage, prompt_text, tags_csv, session_id, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_deck_name,
                card_id,
                quality,
                review_day.isoformat(),
                reviewed_utc,
                normalized_script_tag,
                curriculum_stage,
                normalized_prompt_text,
                tags_csv,
                normalized_session_id,
                normalized_confidence,
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
    normalized_session_id = normalize_storage_text(session_id)
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
    normalized_session_id = normalize_storage_text(session_id)
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
    normalized_deck_name = _normalize_deck_name(deck_name)
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
            (normalized_deck_name, card_id, normalized_mode, normalized_stage, updated_at),
        )


def load_curriculum_stages(deck_name: str, mode: str, card_ids: list[int]) -> dict[int, int]:
    """Load persisted stage map for one deck/mode; missing rows default to stage 1."""
    if not card_ids:
        return {}

    normalized_deck_name = _normalize_deck_name(deck_name)
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
            [normalized_deck_name, normalized_mode, *card_ids],
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

    normalized_script = normalize_storage_text(script_tag).lower() if script_tag else ""

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
    normalized_script = normalize_storage_text(script_tag).lower() if script_tag else ""

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

    normalized_deck_name = _normalize_deck_name(deck_name)
    target_day = on_date or date.today()
    states = load_states(normalized_deck_name, card_ids)
    due_remaining = sum(1 for state in states.values() if state.next_review <= target_day)

    placeholders = ",".join("?" * len(card_ids))
    with _connect() as conn:
        completed_today = conn.execute(
            f"""
            SELECT COUNT(DISTINCT card_id)
            FROM review_events
            WHERE deck=? AND reviewed_on=? AND card_id IN ({placeholders})
            """,
            [normalized_deck_name, target_day.isoformat(), *card_ids],
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
    normalized_deck_name = _normalize_deck_name(deck_name)
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
            (normalized_deck_name, card_id, window_size),
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
                normalized_deck_name,
                card_id,
                1 if evaluation.is_active else 0,
                evaluation.attempts_recent,
                evaluation.failures_recent,
                evaluated_at,
            ),
        )


def load_active_leech_card_ids(deck_name: str) -> set[int]:
    """Return active leech card ids for the given deck."""
    normalized_deck_name = _normalize_deck_name(deck_name)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT card_id
            FROM leech_items
            WHERE deck=? AND is_active=1
            """,
            (normalized_deck_name,),
        ).fetchall()

    return {int(row["card_id"]) for row in rows}


def load_active_leech_count() -> int:
    """Return total count of active leech cards across all decks."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS total
            FROM leech_items
            WHERE is_active=1
            """
        ).fetchone()
    return int((row or {})["total"] or 0)


def save_assistant_profile(
    persona_style: str,
    popup_cadence: str,
    emotion_persistence: str,
    llm_backend: str,
    chat_retention: str,
) -> AssistantProfile:
    """Persist singleton assistant profile configuration."""
    normalized_persona_style = normalize_storage_text(persona_style).lower() or "coach"
    normalized_popup_cadence = normalize_storage_text(popup_cadence).lower() or "high"
    normalized_emotion_persistence = normalize_storage_text(emotion_persistence).lower() or "long_memory"
    normalized_llm_backend = normalize_storage_text(llm_backend).lower() or "llama.cpp"
    normalized_chat_retention = normalize_storage_text(chat_retention).lower() or "minimal"
    updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO assistant_profile (id, persona_style, popup_cadence, emotion_persistence, llm_backend, chat_retention, updated_at_utc)
            VALUES (1, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                persona_style=excluded.persona_style,
                popup_cadence=excluded.popup_cadence,
                emotion_persistence=excluded.emotion_persistence,
                llm_backend=excluded.llm_backend,
                chat_retention=excluded.chat_retention,
                updated_at_utc=excluded.updated_at_utc
            """,
            (
                normalized_persona_style,
                normalized_popup_cadence,
                normalized_emotion_persistence,
                normalized_llm_backend,
                normalized_chat_retention,
                updated_at,
            ),
        )

    return {
        "persona_style": normalized_persona_style,
        "popup_cadence": normalized_popup_cadence,
        "emotion_persistence": normalized_emotion_persistence,
        "llm_backend": normalized_llm_backend,
        "chat_retention": normalized_chat_retention,
        "updated_at_utc": updated_at,
    }


def load_assistant_profile() -> AssistantProfile:
    """Load assistant profile, creating defaults on first access."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT persona_style, popup_cadence, emotion_persistence, llm_backend, chat_retention, updated_at_utc
            FROM assistant_profile
            WHERE id = 1
            """
        ).fetchone()

    if row is None:
        return save_assistant_profile(
            persona_style="coach",
            popup_cadence="high",
            emotion_persistence="long_memory",
            llm_backend="llama.cpp",
            chat_retention="minimal",
        )

    return {
        "persona_style": str(row["persona_style"]),
        "popup_cadence": str(row["popup_cadence"]),
        "emotion_persistence": str(row["emotion_persistence"]),
        "llm_backend": str(row["llm_backend"]),
        "chat_retention": str(row["chat_retention"]),
        "updated_at_utc": str(row["updated_at_utc"]),
    }


def save_assistant_state_snapshot(state: AssistantState) -> None:
    """Append an assistant emotional-state snapshot."""
    recorded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO assistant_state_snapshots (mood, momentum, confidence_level, focus_area, last_major_event, recorded_at_utc)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                state.mood,
                state.momentum,
                state.confidence_level,
                normalize_storage_text(state.focus_area) or "general",
                normalize_storage_text(state.last_major_event) or "steady_progress",
                recorded_at,
            ),
        )


def load_latest_assistant_state() -> AssistantState | None:
    """Return latest assistant state snapshot if available."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT mood, momentum, confidence_level, focus_area, last_major_event
            FROM assistant_state_snapshots
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    if row is None:
        return None

    return AssistantState(
        mood=cast(AssistantMood, str(row["mood"])),
        momentum=int(row["momentum"]),
        confidence_level=int(row["confidence_level"]),
        focus_area=str(row["focus_area"]),
        last_major_event=str(row["last_major_event"]),
    )


def load_assistant_state_timeline(limit: int = 60) -> list[AssistantState]:
    """Return recent assistant emotional timeline, oldest to newest."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT mood, momentum, confidence_level, focus_area, last_major_event
            FROM assistant_state_snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    timeline = [
        AssistantState(
            mood=cast(AssistantMood, str(row["mood"])),
            momentum=int(row["momentum"]),
            confidence_level=int(row["confidence_level"]),
            focus_area=str(row["focus_area"]),
            last_major_event=str(row["last_major_event"]),
        )
        for row in rows
    ]
    return list(reversed(timeline))


def load_assistant_long_horizon_momentum(limit: int = 24) -> int:
    """Return averaged momentum over recent snapshots for long-memory blending."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT momentum
            FROM assistant_state_snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    if not rows:
        return 0
    total = sum(int(row["momentum"]) for row in rows)
    return round(total / len(rows))


def load_recent_assistant_event_dedup_keys(window_minutes: int = 180) -> set[str]:
    """Return event dedup keys emitted in a rolling UTC window."""
    if window_minutes <= 0:
        raise ValueError("window_minutes must be positive")

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=window_minutes)).isoformat(timespec="seconds")
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT dedup_key
            FROM assistant_events
            WHERE dedup_key != '' AND created_at_utc >= ?
            """,
            (cutoff,),
        ).fetchall()

    return {str(row["dedup_key"]) for row in rows if str(row["dedup_key"]).strip()}


def _event_dedup_key_is_in_cooldown(dedup_key: str, cooldown_minutes: int) -> bool:
    if not dedup_key.strip() or cooldown_minutes <= 0:
        return False

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT created_at_utc
            FROM assistant_events
            WHERE dedup_key=?
            ORDER BY id DESC
            LIMIT 1
            """,
            (dedup_key,),
        ).fetchone()

    if row is None:
        return False
    try:
        created_at = datetime.fromisoformat(str(row["created_at_utc"]))
    except ValueError:
        return False
    return created_at >= cutoff


def enqueue_assistant_events(events: list[AssistantEvent], dedup_window_minutes: int = 180) -> None:
    """Persist scripted assistant events for popup consumption."""
    if not events:
        return
    if dedup_window_minutes <= 0:
        raise ValueError("dedup_window_minutes must be positive")

    recent_keys = load_recent_assistant_event_dedup_keys(window_minutes=dedup_window_minutes)
    unique_events: list[AssistantEvent] = []
    seen_in_batch = set()
    for event in events:
        dedup_key = event.dedup_key.strip()
        if dedup_key and (dedup_key in recent_keys or dedup_key in seen_in_batch):
            continue
        if dedup_key and _event_dedup_key_is_in_cooldown(dedup_key, int(event.cooldown_minutes)):
            continue
        unique_events.append(event)
        if dedup_key:
            seen_in_batch.add(dedup_key)

    if not unique_events:
        return

    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        conn.executemany(
            """
            INSERT INTO assistant_events (event_type, priority, message_key, metadata_json, created_at_utc, consumed, dedup_key, cooldown_minutes)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            [
                (
                    normalize_storage_text(event.event_type),
                    normalize_storage_text(event.priority),
                    normalize_storage_text(event.message_key),
                    json.dumps(event.metadata, ensure_ascii=False, sort_keys=True),
                    created_at,
                    normalize_storage_text(event.dedup_key),
                    max(1, int(event.cooldown_minutes)),
                )
                for event in unique_events
            ],
        )


def load_pending_assistant_events(limit: int = 8) -> list[tuple[int, AssistantEvent]]:
    """Load oldest unconsumed assistant events with ids."""
    if limit <= 0:
        raise ValueError("limit must be positive")
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, event_type, priority, message_key, metadata_json, dedup_key, cooldown_minutes
            FROM assistant_events
            WHERE consumed=0
            ORDER BY id ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    pending: list[tuple[int, AssistantEvent]] = []
    for row in rows:
        metadata = json.loads(str(row["metadata_json"]))
        normalized_metadata = {
            str(key): str(value)
            for key, value in metadata.items()
        }
        pending.append(
            (
                int(row["id"]),
                AssistantEvent(
                    event_type=str(row["event_type"]),
                    priority=cast(AssistantEventPriority, str(row["priority"])),
                    message_key=str(row["message_key"]),
                    metadata=normalized_metadata,
                    dedup_key=str(row["dedup_key"]),
                    cooldown_minutes=int(row["cooldown_minutes"]),
                ),
            )
        )
    return pending


def mark_assistant_events_consumed(event_ids: list[int]) -> None:
    """Mark assistant events as consumed after renderer acknowledgement."""
    if not event_ids:
        return
    consumed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    placeholders = ",".join("?" for _ in event_ids)
    with _connect() as conn:
        conn.execute(
            f"UPDATE assistant_events SET consumed=1, consumed_at_utc=? WHERE id IN ({placeholders})",
            [consumed_at, *[int(event_id) for event_id in event_ids]],
        )


def upsert_assistant_memory_fact(
    fact_key: str,
    fact_value: str,
    source: str,
    linked_event_id: int | None = None,
) -> None:
    """Persist one assistant long-memory fact as latest known value."""
    normalized_key = normalize_storage_text(fact_key).lower()
    normalized_value = normalize_japanese_text(fact_value)
    normalized_source = normalize_storage_text(source).lower() or "system"
    if not normalized_key:
        raise ValueError("fact_key must not be empty")
    if not normalized_value:
        raise ValueError("fact_value must not be empty")

    updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO assistant_memory_facts (fact_key, fact_value, source, linked_event_id, updated_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(fact_key) DO UPDATE SET
                fact_value=excluded.fact_value,
                source=excluded.source,
                linked_event_id=excluded.linked_event_id,
                updated_at_utc=excluded.updated_at_utc
            """,
            (
                normalized_key,
                normalized_value,
                normalized_source,
                linked_event_id,
                updated_at,
            ),
        )


def load_assistant_memory_facts(limit: int = 40) -> list[dict[str, str | int | None]]:
    """Load assistant long-memory facts ordered by most recently updated."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT fact_key, fact_value, source, linked_event_id, updated_at_utc
            FROM assistant_memory_facts
            ORDER BY updated_at_utc DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "fact_key": str(row["fact_key"]),
            "fact_value": str(row["fact_value"]),
            "source": str(row["source"]),
            "linked_event_id": None if row["linked_event_id"] is None else int(row["linked_event_id"]),
            "updated_at_utc": str(row["updated_at_utc"]),
        }
        for row in rows
    ]


def prune_assistant_memory_facts(max_facts: int = 120) -> None:
    """Enforce bounded semantic fact storage by keeping newest entries only."""
    if max_facts <= 0:
        raise ValueError("max_facts must be positive")

    with _connect() as conn:
        conn.execute(
            """
            DELETE FROM assistant_memory_facts
            WHERE fact_key NOT IN (
                SELECT fact_key
                FROM assistant_memory_facts
                ORDER BY updated_at_utc DESC, fact_key ASC
                LIMIT ?
            )
            """,
            (max_facts,),
        )


def append_assistant_chat_turn(role: str, content: str) -> None:
    """Persist a single assistant/user chat turn."""
    normalized_role = normalize_storage_text(role).lower()
    if normalized_role not in {"user", "assistant"}:
        raise ValueError("role must be user or assistant")
    normalized_content = normalize_storage_text(content)
    if not normalized_content:
        raise ValueError("content must not be empty")
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO assistant_chat_turns (role, content, created_at_utc)
            VALUES (?, ?, ?)
            """,
            (normalized_role, normalized_content, created_at),
        )


def load_recent_assistant_chat_turns(limit: int = 20) -> list[dict[str, str]]:
    """Return most recent assistant chat turns ordered oldest to newest."""
    if limit <= 0:
        raise ValueError("limit must be positive")
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT role, content, created_at_utc
            FROM assistant_chat_turns
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "role": str(row["role"]),
            "content": str(row["content"]),
            "created_at_utc": str(row["created_at_utc"]),
        }
        for row in reversed(rows)
    ]


def clear_assistant_chat() -> int:
    """Delete all stored assistant chat turns and summaries.

    Returns the number of chat turns removed.
    """
    with _connect() as conn:
        removed = conn.execute("SELECT COUNT(*) FROM assistant_chat_turns").fetchone()[0]
        conn.execute("DELETE FROM assistant_chat_turns")
        conn.execute("DELETE FROM assistant_chat_summaries")
    return int(removed)



def _clip_compact_text(value: str, max_chars: int = 72) -> str:
    if max_chars <= 3:
        raise ValueError("max_chars must be greater than 3")
    normalized = normalize_japanese_text(value)
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3] + "..."


def _derive_focus_tags(turns: list[dict[str, str]]) -> str:
    keyword_map = {
        "kanji": "kanji",
        "vocab": "vocab",
        "grammar": "grammar",
        "streak": "streak",
        "goal": "goal",
        "accuracy": "accuracy",
        "typed": "typed_recall",
        "cloze": "context_cloze",
        "story": "narrative",
        "leech": "leech",
    }
    seen: list[str] = []
    for turn in turns:
        text = str(turn["content"]).lower()
        for token, tag in keyword_map.items():
            if token in text and tag not in seen:
                seen.append(tag)
    if not seen:
        return "general"
    return ", ".join(seen[:3])


def _summarize_chat_turns(turns: list[dict[str, str]]) -> dict[str, str]:
    if not turns:
        raise ValueError("turns must not be empty")

    user_turns = [turn for turn in turns if turn["role"] == "user"]
    assistant_turns = [turn for turn in turns if turn["role"] == "assistant"]
    latest_user = user_turns[-1]["content"] if user_turns else ""
    latest_assistant = assistant_turns[-1]["content"] if assistant_turns else ""

    return {
        "window": f"{turns[0]['created_at_utc']}..{turns[-1]['created_at_utc']}",
        "user_turns": str(len(user_turns)),
        "assistant_turns": str(len(assistant_turns)),
        "focus_tags": _derive_focus_tags(turns),
        "latest_user_intent": _clip_compact_text(latest_user, max_chars=90) if latest_user else "",
        "latest_coach_reply": _clip_compact_text(latest_assistant, max_chars=90) if latest_assistant else "",
    }


def load_recent_assistant_chat_summaries(limit: int = 6) -> list[dict[str, str | int]]:
    """Return recent compacted chat summaries ordered newest first."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, start_turn_id, end_turn_id, summary_json, created_at_utc
            FROM assistant_chat_summaries
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    summaries: list[dict[str, str | int]] = []
    for row in rows:
        payload = json.loads(str(row["summary_json"]))
        normalized_payload = {str(key): str(value) for key, value in payload.items()}
        summaries.append(
            {
                "id": int(row["id"]),
                "start_turn_id": int(row["start_turn_id"]),
                "end_turn_id": int(row["end_turn_id"]),
                "created_at_utc": str(row["created_at_utc"]),
                **normalized_payload,
            }
        )
    return summaries


def compact_assistant_chat_memory(
    max_turns: int = 20,
    summary_batch_size: int = 12,
    max_summaries: int = 40,
) -> None:
    """Summarize oldest chat turns and enforce bounded chat storage."""
    if max_turns <= 0:
        raise ValueError("max_turns must be positive")
    if summary_batch_size <= 0:
        raise ValueError("summary_batch_size must be positive")
    if max_summaries <= 0:
        raise ValueError("max_summaries must be positive")

    with _connect() as conn:
        total_turns_row = conn.execute("SELECT COUNT(*) AS count FROM assistant_chat_turns").fetchone()
        total_turns = int(total_turns_row["count"]) if total_turns_row is not None else 0
        overflow = total_turns - max_turns
        if overflow > 0:
            rows = conn.execute(
                """
                SELECT id, role, content, created_at_utc
                FROM assistant_chat_turns
                ORDER BY id ASC
                LIMIT ?
                """,
                (overflow,),
            ).fetchall()

            turns_to_compact = [
                {
                    "id": int(row["id"]),
                    "role": str(row["role"]),
                    "content": str(row["content"]),
                    "created_at_utc": str(row["created_at_utc"]),
                }
                for row in rows
            ]

            if turns_to_compact:
                batches: list[list[dict[str, str | int]]] = []
                current: list[dict[str, str | int]] = []
                for turn in turns_to_compact:
                    current.append(turn)
                    if len(current) >= summary_batch_size:
                        batches.append(current)
                        current = []
                if current:
                    batches.append(current)

                for batch in batches:
                    start_turn_id = int(batch[0]["id"])
                    end_turn_id = int(batch[-1]["id"])
                    summary_payload = _summarize_chat_turns(
                        [
                            {
                                "role": str(item["role"]),
                                "content": str(item["content"]),
                                "created_at_utc": str(item["created_at_utc"]),
                            }
                            for item in batch
                        ]
                    )
                    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO assistant_chat_summaries (start_turn_id, end_turn_id, summary_json, created_at_utc)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            start_turn_id,
                            end_turn_id,
                            json.dumps(summary_payload, ensure_ascii=False, sort_keys=True),
                            created_at,
                        ),
                    )

                delete_ids = [int(turn["id"]) for turn in turns_to_compact]
                placeholders = ",".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM assistant_chat_turns WHERE id IN ({placeholders})",
                    delete_ids,
                )

        conn.execute(
            """
            DELETE FROM assistant_chat_summaries
            WHERE id NOT IN (
                SELECT id
                FROM assistant_chat_summaries
                ORDER BY id DESC
                LIMIT ?
            )
            """,
            (max_summaries,),
        )


def trim_assistant_chat_turns(max_turns: int = 20) -> None:
    """Keep only the latest ``max_turns`` chat turns for minimal retention."""
    if max_turns <= 0:
        raise ValueError("max_turns must be positive")
    with _connect() as conn:
        conn.execute(
            """
            DELETE FROM assistant_chat_turns
            WHERE id NOT IN (
                SELECT id
                FROM assistant_chat_turns
                ORDER BY id DESC
                LIMIT ?
            )
            """,
            (max_turns,),
        )


def log_assistant_event_interaction(
    event_id: int,
    interaction_type: str,
    metadata: dict[str, str] | None = None,
) -> None:
    """Persist renderer interaction telemetry for one assistant popup event."""
    if event_id <= 0:
        raise ValueError("event_id must be positive")

    normalized_type = normalize_storage_text(interaction_type).lower()
    if normalized_type not in {"clicked", "ignored", "expired"}:
        raise ValueError("interaction_type must be clicked, ignored, or expired")

    normalized_metadata: dict[str, str] = {}
    for key, value in (metadata or {}).items():
        normalized_key = normalize_storage_text(str(key)).lower()
        normalized_value = normalize_japanese_text(str(value))
        if normalized_key and normalized_value:
            normalized_metadata[normalized_key] = normalized_value

    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO assistant_event_interactions (event_id, interaction_type, metadata_json, created_at_utc)
            VALUES (?, ?, ?, ?)
            """,
            (
                int(event_id),
                normalized_type,
                json.dumps(normalized_metadata, ensure_ascii=False, sort_keys=True),
                created_at,
            ),
        )


def load_recent_assistant_commitments(limit: int = 4) -> list[dict[str, str]]:
    """Load recently accepted assistant actions from click interactions."""
    if limit <= 0:
        raise ValueError("limit must be positive")

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT ai.metadata_json AS interaction_metadata, ae.metadata_json AS event_metadata, ai.created_at_utc
            FROM assistant_event_interactions ai
            LEFT JOIN assistant_events ae ON ae.id = ai.event_id
            WHERE ai.interaction_type='clicked'
            ORDER BY ai.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    commitments: list[dict[str, str]] = []
    for row in rows:
        interaction_meta = {
            str(key): str(value)
            for key, value in json.loads(str(row["interaction_metadata"])).items()
        }
        event_meta_raw = row["event_metadata"]
        event_meta = (
            {str(key): str(value) for key, value in json.loads(str(event_meta_raw)).items()}
            if event_meta_raw
            else {}
        )
        merged = {**event_meta, **interaction_meta}
        action_type = merged.get("action_type", "")
        target_mode = merged.get("target_mode", "")
        focus_area = merged.get("focus_area", "")
        if not (action_type or target_mode or focus_area):
            continue
        commitments.append(
            {
                "action_type": action_type,
                "target_mode": target_mode,
                "focus_area": focus_area,
                "created_at_utc": str(row["created_at_utc"]),
            }
        )
    return commitments
