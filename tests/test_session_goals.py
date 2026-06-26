from datetime import date
from pathlib import Path

from data import database
from data import study_pipeline
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-session-test.db")
    database.init_db()


def test_save_and_load_session_summary_tracks_goal_completion(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    goal = database.save_session_goal(
        session_id="session-1",
        target_items=2,
        target_accuracy=50,
        started_at_utc="2026-06-26T10:00:00+00:00",
    )
    assert goal.session_id == "session-1"
    assert goal.target_items == 2
    assert goal.target_accuracy == 50

    database.log_review("Hiragana", 1, 4, reviewed_on=date(2026, 6, 26), session_id="session-1")
    database.log_review("Hiragana", 2, 1, reviewed_on=date(2026, 6, 26), session_id="session-1")

    summary = database.load_session_summary("session-1")
    assert summary is not None
    assert summary.session_id == "session-1"
    assert summary.target_items == 2
    assert summary.completed_items == 2
    assert summary.reviewed == 2
    assert summary.correct == 1
    assert summary.accuracy == 50
    assert summary.target_accuracy == 50
    assert summary.goal_met is True


def test_load_session_summary_returns_none_when_goal_missing(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    assert database.load_session_summary("missing-session") is None


def test_review_minigame_result_persists_session_id(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_session_goal(session_id="session-bridge", target_items=1)
    state = ReviewState(card_id=42)
    study_pipeline.review_card(
        deck_name="Hiragana",
        state=state,
        quality=4,
        session_id="session-bridge",
    )

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT session_id
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 42),
        ).fetchone()

    assert row is not None
    assert row["session_id"] == "session-bridge"
