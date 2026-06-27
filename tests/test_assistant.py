from __future__ import annotations

from datetime import date
from pathlib import Path

from data import database
from data import study_pipeline
from domain.activity import ActivitySummary
from domain.assistant import AssistantEvent, AssistantState, compute_assistant_state, evaluate_assistant_events
from domain.history import ItemHistory
from domain.mistakes import MistakeBreakdownRow
from domain.session import SessionSummary
from domain.streaks import StreakState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-assistant-test.db")
    database.init_db()


def test_compute_assistant_state_is_deterministic() -> None:
    activity = ActivitySummary(
        days=7,
        reviewed=25,
        correct=18,
        incorrect=7,
        accuracy=72,
        points_earned=18,
        active_days=5,
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=6,
        best_streak_days=9,
    )
    mistakes = [MistakeBreakdownRow(key="kanji_n5", attempts=10, mistakes=7, error_rate=70)]
    history = [
        ItemHistory(
            key="k:1",
            script_tag="kanji_n5",
            deck="kanji n5",
            card_id=1,
            prompt="学",
            trend="declining",
            events=[],
        )
    ]

    state_a = compute_assistant_state(
        activity_week=activity,
        streak=streak,
        mistakes=mistakes,
        item_history=history,
        leech_count=4,
        session_summary=None,
        prior_momentum=10,
    )
    state_b = compute_assistant_state(
        activity_week=activity,
        streak=streak,
        mistakes=mistakes,
        item_history=history,
        leech_count=4,
        session_summary=None,
        prior_momentum=10,
    )

    assert state_a == state_b
    assert state_a.mood in {"coach_supportive", "coach_alert"}


def test_evaluate_assistant_events_emits_goal_and_streak() -> None:
    state = AssistantState(
        mood="coach_celebratory",
        momentum=45,
        confidence_level=72,
        focus_area="general",
        last_major_event="session_goal_met",
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=7,
        best_streak_days=7,
    )
    summary = SessionSummary(
        session_id="abc",
        target_items=15,
        completed_items=15,
        reviewed=20,
        correct=16,
        accuracy=80,
        target_accuracy=75,
        goal_met=True,
    )

    events = evaluate_assistant_events(
        state=state,
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=summary,
    )

    event_types = [event.event_type for event in events]
    assert "session_goal_met" in event_types
    assert "streak_milestone" in event_types


def test_assistant_profile_and_events_round_trip(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    profile = database.load_assistant_profile()
    assert profile["persona_style"] == "coach"

    database.enqueue_assistant_events(
        [
            AssistantEvent(
                event_type="ambient_checkin",
                priority="info",
                message_key="coach.ambient_checkin",
                metadata={"mood": "coach_neutral"},
            )
        ]
    )

    pending = database.load_pending_assistant_events(limit=5)
    assert len(pending) == 1
    event_id, event = pending[0]
    assert event.event_type == "ambient_checkin"

    database.mark_assistant_events_consumed([event_id])
    assert database.load_pending_assistant_events(limit=5) == []


def test_study_pipeline_assistant_snapshot(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    snapshot = study_pipeline.load_assistant_snapshot()
    assert snapshot["profile"]["llm_backend"] == "llama.cpp"
    assert "state" in snapshot
    assert isinstance(snapshot["events"], list)
