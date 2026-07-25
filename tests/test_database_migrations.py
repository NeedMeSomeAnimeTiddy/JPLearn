from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from data import database
from data.srs_repository import SRSRepository


def _column_names(db_path: Path, table_name: str) -> set[str]:
    with closing(sqlite3.connect(db_path)) as conn:
        return {
            str(row[1])
            for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        }


def test_jplearn_db_fresh_install_creates_schema_marker(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "jplearn-migration-fresh.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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
    assert "dedup_key" in assistant_events_columns
    assert "cooldown_minutes" in assistant_events_columns
    assert "consumed_at_utc" in assistant_events_columns

    assistant_chat_columns = _column_names(db_path, "assistant_chat_turns")
    assert "role" in assistant_chat_columns
    assert "content" in assistant_chat_columns

    assistant_memory_columns = _column_names(db_path, "assistant_memory_facts")
    assert "fact_key" in assistant_memory_columns
    assert "fact_value" in assistant_memory_columns
    assert "source" in assistant_memory_columns

    assistant_interaction_columns = _column_names(db_path, "assistant_event_interactions")
    assert "event_id" in assistant_interaction_columns
    assert "interaction_type" in assistant_interaction_columns
    assert "metadata_json" in assistant_interaction_columns

    assistant_chat_summary_columns = _column_names(db_path, "assistant_chat_summaries")
    assert "start_turn_id" in assistant_chat_summary_columns
    assert "end_turn_id" in assistant_chat_summary_columns
    assert "summary_json" in assistant_chat_summary_columns

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
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
    assert "dedup_key" in _column_names(db_path, "assistant_events")
    assert "fact_key" in _column_names(db_path, "assistant_memory_facts")
    assert "interaction_type" in _column_names(db_path, "assistant_event_interactions")
    assert "summary_json" in _column_names(db_path, "assistant_chat_summaries")

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION


def test_jplearn_db_v18_creates_card_notes_without_timestamp_index(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-card-notes-fresh.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()

    columns = _column_names(db_path, "card_notes")
    assert columns == {
        "note_key",
        "note_text",
        "created_at_utc",
        "updated_at_utc",
    }

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()
        index_names = {
            str(row[1])
            for row in conn.execute("PRAGMA index_list(card_notes)").fetchall()
        }

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION
    assert "idx_card_notes_updated_at" not in index_names


def test_jplearn_db_upgrade_from_v17_preserves_existing_rows_and_adds_card_notes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-card-notes-upgrade.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(
            """
            CREATE TABLE schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            );
            INSERT INTO schema_version (id, version) VALUES (1, 17);
            CREATE TABLE retained_data (value TEXT NOT NULL);
            INSERT INTO retained_data (value) VALUES ('preserve me');
            """
        )

    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()
        retained_row = conn.execute("SELECT value FROM retained_data").fetchone()

    assert "note_key" in _column_names(db_path, "card_notes")
    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION
    assert retained_row == ("preserve me",)


def test_jplearn_db_v19_creates_scenario_tables(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "jplearn-scenario-fresh.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()

    session_columns = _column_names(db_path, "scenario_sessions")
    assert session_columns == {
        "id", "scenario_id", "scenario_version", "learner_level", "status",
        "started_at_utc", "completed_at_utc", "transcript_json", "summary_json",
    }
    srs_columns = _column_names(db_path, "scenario_srs_cards")
    assert srs_columns == {
        "id", "session_id", "scenario_id", "front", "back", "reading", "notes", "created_at_utc",
    }

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    # This test is about the scenario tables; pinning the exact latest version here
    # made every later migration edit it. The latest version is pinned once, in
    # test_jplearn_db_v20_creates_card_mastery_scores.
    assert int(version_row[0]) >= 19


def test_jplearn_db_v20_creates_card_mastery_scores(tmp_path: Path, monkeypatch) -> None:
    """Per-card mastery counters get their own table (issue #66)."""
    db_path = tmp_path / "jplearn-mastery-fresh.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()

    assert _column_names(db_path, "card_mastery_scores") == {"deck", "card_id", "score"}

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION == 20


def test_jplearn_db_upgrade_from_v19_preserves_rows_and_adds_mastery_table(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """The upgrade path real users take. A dropped table here would zero mastery."""
    db_path = tmp_path / "jplearn-mastery-upgrade.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    database.init_db()
    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute(
            "INSERT INTO review_states (deck, card_id, interval, repetitions, next_review)"
            " VALUES ('Hiragana', 1, 21, 3, '2026-01-01')"
        )
        conn.execute("UPDATE schema_version SET version = 19 WHERE id = 1")
        conn.execute("DROP TABLE card_mastery_scores")
        conn.commit()

    database.init_db()

    assert _column_names(db_path, "card_mastery_scores") == {"deck", "card_id", "score"}
    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM review_states WHERE deck = 'Hiragana'"
        ).fetchone()[0] == 1
        assert int(
            conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()[0]
        ) == 20


def test_card_mastery_score_range_is_enforced_by_the_schema(tmp_path: Path, monkeypatch) -> None:
    """The renderer clamps too, but the table must not depend on it."""
    db_path = tmp_path / "jplearn-mastery-check.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
        for bad_score in (-1, 5):
            try:
                conn.execute(
                    "INSERT INTO card_mastery_scores (deck, card_id, score) VALUES ('hiragana', 1, ?)",
                    (bad_score,),
                )
            except sqlite3.IntegrityError:
                continue
            raise AssertionError(f"score {bad_score} should violate the CHECK constraint")


def test_jplearn_db_upgrade_from_v18_preserves_existing_rows_and_adds_scenario_tables(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "jplearn-scenario-upgrade.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(
            """
            CREATE TABLE schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            );
            INSERT INTO schema_version (id, version) VALUES (1, 18);
            CREATE TABLE card_notes (
                note_key TEXT PRIMARY KEY,
                note_text TEXT NOT NULL,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL
            );
            INSERT INTO card_notes (note_key, note_text, created_at_utc, updated_at_utc)
            VALUES ('note:v1:builtin:' || printf('%.64d', 0), 'preserve me', 'x', 'x');
            """
        )

    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
        version_row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()
        retained_row = conn.execute("SELECT note_text FROM card_notes").fetchone()

    assert "transcript_json" in _column_names(db_path, "scenario_sessions")
    assert version_row is not None
    assert int(version_row[0]) == database.LATEST_SCHEMA_VERSION
    assert retained_row == ("preserve me",)


def test_app_db_fresh_install_creates_schema_marker(tmp_path: Path) -> None:
    db_path = tmp_path / "app-migration-fresh.db"
    repo = SRSRepository(db_path=db_path)

    assert repo.all() == []
    with closing(sqlite3.connect(db_path)) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == 1


def test_app_db_upgrade_adds_updated_at_column_and_schema_marker(tmp_path: Path) -> None:
    db_path = tmp_path / "app-migration-upgrade.db"

    with closing(sqlite3.connect(db_path)) as conn:
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

    with closing(sqlite3.connect(db_path)) as conn:
        row = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()

    assert row is not None
    assert int(row[0]) == 1
