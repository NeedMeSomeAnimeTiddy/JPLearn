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

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == database.LATEST_SCHEMA_VERSION


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
