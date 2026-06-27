from __future__ import annotations

import sqlite3
from pathlib import Path

from data import database
from data.srs_repository import SRSRepository


def _column_names(db_path: Path, table_name: str) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        return {
            str(row[1])
            for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        }


def test_jplearn_db_fresh_install_creates_schema_marker(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "jplearn-migration-fresh.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == database.LATEST_SCHEMA_VERSION


def test_jplearn_db_upgrade_adds_review_event_columns_and_schema_marker(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-migration-upgrade.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deck TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                quality INTEGER NOT NULL,
                reviewed_on TEXT NOT NULL
            )
            """
        )

    database.init_db()

    columns = _column_names(db_path, "review_events")
    assert "script_tag" in columns
    assert "tags_csv" in columns
    assert "reviewed_at_utc" in columns
    assert "curriculum_stage" in columns
    assert "prompt_text" in columns
    assert "session_id" in columns
    assert "confidence_score" in columns

    session_goal_columns = _column_names(db_path, "session_goals")
    assert "session_id" in session_goal_columns
    assert "target_items" in session_goal_columns
    assert "target_minutes" in session_goal_columns
    assert "target_accuracy" in session_goal_columns
    assert "started_at_utc" in session_goal_columns

    assistant_profile_columns = _column_names(db_path, "assistant_profile")
    assert "persona_style" in assistant_profile_columns
    assert "popup_cadence" in assistant_profile_columns
    assert "emotion_persistence" in assistant_profile_columns
    assert "llm_backend" in assistant_profile_columns
    assert "chat_retention" in assistant_profile_columns

    assistant_state_columns = _column_names(db_path, "assistant_state_snapshots")
    assert "mood" in assistant_state_columns
    assert "momentum" in assistant_state_columns

    assistant_events_columns = _column_names(db_path, "assistant_events")
    assert "event_type" in assistant_events_columns
    assert "metadata_json" in assistant_events_columns

    assistant_chat_columns = _column_names(db_path, "assistant_chat_turns")
    assert "role" in assistant_chat_columns
    assert "content" in assistant_chat_columns

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == database.LATEST_SCHEMA_VERSION


def test_jplearn_db_upgrade_from_v1_applies_v2_and_v3_in_order(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-migration-from-v1.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            )
            """
        )
        conn.execute("INSERT INTO schema_version (id, version) VALUES (1, 1)")
        conn.execute(
            """
            CREATE TABLE review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deck TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                quality INTEGER NOT NULL,
                reviewed_on TEXT NOT NULL,
                reviewed_at_utc TEXT NOT NULL DEFAULT '',
                script_tag TEXT NOT NULL DEFAULT '',
                curriculum_stage INTEGER,
                prompt_text TEXT NOT NULL DEFAULT '',
                tags_csv TEXT NOT NULL DEFAULT ''
            )
            """
        )

    database.init_db()

    columns = _column_names(db_path, "review_events")
    assert "session_id" in columns
    assert "confidence_score" in columns

    with sqlite3.connect(db_path) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION


def test_jplearn_db_upgrade_from_v2_only_applies_confidence_column(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-migration-from-v2.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            )
            """
        )
        conn.execute("INSERT INTO schema_version (id, version) VALUES (1, 2)")
        conn.execute(
            """
            CREATE TABLE review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deck TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                quality INTEGER NOT NULL,
                reviewed_on TEXT NOT NULL,
                reviewed_at_utc TEXT NOT NULL DEFAULT '',
                script_tag TEXT NOT NULL DEFAULT '',
                curriculum_stage INTEGER,
                prompt_text TEXT NOT NULL DEFAULT '',
                tags_csv TEXT NOT NULL DEFAULT '',
                session_id TEXT NOT NULL DEFAULT ''
            )
            """
        )

    database.init_db()

    columns = _column_names(db_path, "review_events")
    assert "session_id" in columns
    assert "confidence_score" in columns

    with sqlite3.connect(db_path) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION


def test_jplearn_db_upgrade_from_v3_applies_assistant_tables(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-migration-from-v3.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            )
            """
        )
        conn.execute("INSERT INTO schema_version (id, version) VALUES (1, 3)")
        conn.execute(
            """
            CREATE TABLE review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deck TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                quality INTEGER NOT NULL,
                reviewed_on TEXT NOT NULL,
                reviewed_at_utc TEXT NOT NULL DEFAULT '',
                script_tag TEXT NOT NULL DEFAULT '',
                curriculum_stage INTEGER,
                prompt_text TEXT NOT NULL DEFAULT '',
                tags_csv TEXT NOT NULL DEFAULT '',
                session_id TEXT NOT NULL DEFAULT '',
                confidence_score INTEGER
            )
            """
        )

    database.init_db()

    assert "persona_style" in _column_names(db_path, "assistant_profile")
    assert "mood" in _column_names(db_path, "assistant_state_snapshots")
    assert "event_type" in _column_names(db_path, "assistant_events")
    assert "role" in _column_names(db_path, "assistant_chat_turns")

    with sqlite3.connect(db_path) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION


def test_app_db_fresh_install_creates_schema_marker(tmp_path: Path) -> None:
    db_path = tmp_path / "app-migration-fresh.db"
    repo = SRSRepository(db_path=db_path)

    assert repo.all() == []
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == 1


def test_app_db_upgrade_adds_updated_at_column_and_schema_marker(tmp_path: Path) -> None:
    db_path = tmp_path / "app-migration-upgrade.db"

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE srs_items (
                id TEXT PRIMARY KEY,
                last_interval INTEGER NOT NULL,
                ease_factor REAL NOT NULL,
                due INTEGER NOT NULL
            )
            """
        )

    SRSRepository(db_path=db_path)

    columns = _column_names(db_path, "srs_items")
    assert "updated_at" in columns

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == 1
