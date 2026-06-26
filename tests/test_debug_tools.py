from __future__ import annotations

from datetime import date
from pathlib import Path

from data import database
from domain.scheduler import ReviewState
from scripts import debug_tools


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def test_build_diagnostics_report_includes_queue_session_and_typed_sections(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=1, interval=2, next_review=date.today()),
    )
    database.save_session_goal("session-1", target_items=1)
    database.log_review(
        "Hiragana",
        1,
        4,
        reviewed_on=date.today(),
        script_tag="hiragana",
        tags=["typed_recall"],
        session_id="session-1",
    )

    report = debug_tools.build_diagnostics_report()

    assert "queue_composition" in report
    assert "session_completion" in report
    assert "typed_outcomes" in report

    queue = report["queue_composition"]
    assert isinstance(queue, list)
    assert queue
    assert queue[0]["deck"] == "Hiragana"

    sessions = report["session_completion"]
    assert isinstance(sessions, list)
    assert sessions
    assert sessions[0]["session_id"] == "session-1"

    typed = report["typed_outcomes"]
    assert isinstance(typed, dict)
    assert typed["attempts"] == 1
    assert typed["correct"] == 1
