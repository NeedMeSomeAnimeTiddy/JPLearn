from __future__ import annotations

from datetime import date, datetime, timezone
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
        activity_week=ActivitySummary(
            days=7,
            reviewed=40,
            correct=30,
            incorrect=10,
            accuracy=75,
            points_earned=30,
            active_days=5,
        ),
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=summary,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )

    event_types = [event.event_type for event in events]
    assert "session_goal_met" in event_types
    assert "streak_milestone" in event_types
    assert all(event.dedup_key for event in events)
    assert all("action_type" in event.metadata for event in events)
    assert all("target_mode" in event.metadata for event in events)


def test_evaluate_assistant_events_respects_recent_dedup_keys() -> None:
    state = AssistantState(
        mood="coach_celebratory",
        momentum=52,
        confidence_level=76,
        focus_area="kanji_n5",
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
        target_items=10,
        completed_items=10,
        reviewed=11,
        correct=9,
        accuracy=82,
        target_accuracy=70,
        goal_met=True,
    )

    events = evaluate_assistant_events(
        state=state,
        activity_week=ActivitySummary(
            days=7,
            reviewed=35,
            correct=28,
            incorrect=7,
            accuracy=80,
            points_earned=28,
            active_days=5,
        ),
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=summary,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
        recently_emitted_dedup_keys={"goal:abc"},
    )

    assert all(event.dedup_key != "goal:abc" for event in events)


def test_evaluate_assistant_events_emits_activity_nudge_for_low_activity() -> None:
    state = AssistantState(
        mood="coach_supportive",
        momentum=-8,
        confidence_level=46,
        focus_area="general",
        last_major_event="steady_progress",
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=1,
        best_streak_days=4,
    )

    events = evaluate_assistant_events(
        state=state,
        activity_week=ActivitySummary(
            days=7,
            reviewed=8,
            correct=5,
            incorrect=3,
            accuracy=62,
            points_earned=5,
            active_days=2,
        ),
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=None,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )

    assert any(event.event_type == "activity_nudge" for event in events)


def test_evaluate_assistant_events_emits_session_recovery_for_missed_goal() -> None:
    state = AssistantState(
        mood="coach_supportive",
        momentum=-20,
        confidence_level=40,
        focus_area="vocab_n5",
        last_major_event="momentum_drop",
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=2,
        best_streak_days=6,
    )
    summary = SessionSummary(
        session_id="recover-1",
        target_items=20,
        completed_items=10,
        reviewed=16,
        correct=10,
        accuracy=62,
        target_accuracy=75,
        goal_met=False,
    )

    events = evaluate_assistant_events(
        state=state,
        activity_week=ActivitySummary(
            days=7,
            reviewed=24,
            correct=14,
            incorrect=10,
            accuracy=58,
            points_earned=14,
            active_days=4,
        ),
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=summary,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )

    assert any(event.event_type == "session_recovery" for event in events)
    recovery_event = next(event for event in events if event.event_type == "session_recovery")
    assert recovery_event.metadata["action_type"] == "session_recovery"
    assert recovery_event.metadata["target_mode"] == "typed_recall"


def test_evaluate_assistant_events_emits_momentum_encouragement() -> None:
    state = AssistantState(
        mood="coach_celebratory",
        momentum=66,
        confidence_level=82,
        focus_area="general",
        last_major_event="momentum_rise",
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=4,
        best_streak_days=9,
    )

    events = evaluate_assistant_events(
        state=state,
        activity_week=ActivitySummary(
            days=7,
            reviewed=42,
            correct=36,
            incorrect=6,
            accuracy=86,
            points_earned=36,
            active_days=6,
        ),
        streak=streak,
        mistakes=[],
        leech_count=0,
        session_summary=None,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
    )

    assert any(event.event_type == "momentum_encouragement" for event in events)


def test_evaluate_assistant_events_low_cadence_caps_and_prioritizes() -> None:
    state = AssistantState(
        mood="coach_alert",
        momentum=40,
        confidence_level=66,
        focus_area="kanji_n5",
        last_major_event="high_difficulty",
    )
    streak = StreakState(
        last_study_day_utc=date(2026, 6, 27),
        last_study_day_local=date(2026, 6, 27),
        current_streak_days=7,
        best_streak_days=7,
    )
    summary = SessionSummary(
        session_id="cap-1",
        target_items=12,
        completed_items=12,
        reviewed=14,
        correct=11,
        accuracy=78,
        target_accuracy=70,
        goal_met=True,
    )
    mistakes = [MistakeBreakdownRow(key="kanji_n5", attempts=12, mistakes=8, error_rate=66)]

    events = evaluate_assistant_events(
        state=state,
        activity_week=ActivitySummary(
            days=7,
            reviewed=10,
            correct=6,
            incorrect=4,
            accuracy=60,
            points_earned=6,
            active_days=2,
        ),
        streak=streak,
        mistakes=mistakes,
        leech_count=4,
        session_summary=summary,
        now_utc=datetime(2026, 6, 27, 12, 0, tzinfo=timezone.utc),
        popup_cadence="low",
        curriculum_attempts=12,
        curriculum_accuracy_7d=55,
    )

    assert len(events) == 2
    assert events[0].priority == "critical"


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

    database.upsert_assistant_memory_fact(
        fact_key="coach.focus_area",
        fact_value="kanji_n5",
        source="test",
    )
    facts = database.load_assistant_memory_facts(limit=10)
    assert facts[0]["fact_key"] == "coach.focus_area"
    assert facts[0]["fact_value"] == "kanji_n5"


def test_study_pipeline_assistant_snapshot(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    snapshot = study_pipeline.load_assistant_snapshot()
    assert snapshot["profile"]["llm_backend"] == "llama.cpp"
    assert "state" in snapshot
    assert isinstance(snapshot["events"], list)


def test_assistant_chat_memory_compaction_creates_summaries(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for index in range(30):
        role = "user" if index % 2 == 0 else "assistant"
        content = "Need help with kanji and streak goals" if role == "user" else "Next: run typed recall"
        study_pipeline.append_assistant_chat_turn(role, content)

    turns = study_pipeline.load_recent_assistant_chat_turns(limit=100)
    assert len(turns) <= 20

    summaries = database.load_recent_assistant_chat_summaries(limit=5)
    assert summaries
    assert "focus_tags" in summaries[0]


def test_assistant_chat_context_assembler_exposes_required_context_tiers(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.log_review("Hiragana", 1, 4, script_tag="hiragana", prompt_text="あ")
    database.log_review("Kanji N5", 2, 1, script_tag="kanji_n5", prompt_text="学")
    study_pipeline.load_assistant_snapshot()

    database.log_assistant_event_interaction(
        event_id=1,
        interaction_type="clicked",
        metadata={
            "action_type": "session_recovery",
            "target_mode": "typed_recall",
            "focus_area": "kanji_n5",
        },
    )

    for index in range(10):
        study_pipeline.append_assistant_chat_turn(
            "user" if index % 2 == 0 else "assistant",
            "Need context cloze support" if index % 2 == 0 else "Try one short cloze loop.",
        )

    context = study_pipeline.assemble_assistant_chat_context()

    expected_keys = {
        "persona",
        "emotional_state",
        "goals",
        "strengths",
        "weaknesses",
        "recent_activity",
        "commitments",
        "memory",
    }
    assert expected_keys.issubset(context.keys())
    assert "style=coach" in context["persona"]
    assert context["memory"]


def test_assistant_chat_context_prefers_relevant_memory_for_user_message(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.upsert_assistant_memory_fact("study.focus.kanji", "kanji confusion in compounds", source="test")
    database.upsert_assistant_memory_fact("study.focus.vocab", "vocab ordering mistakes", source="test")
    database.upsert_assistant_memory_fact("study.focus.grammar", "grammar tense slips", source="test")

    context = study_pipeline.assemble_assistant_chat_context(user_message="help me with kanji")
    assert "kanji" in context["memory"].lower()


def test_prune_assistant_memory_facts_keeps_recent_entries_only(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for index in range(30):
        database.upsert_assistant_memory_fact(
            fact_key=f"test.fact.{index}",
            fact_value=f"value-{index}",
            source="test",
        )

    database.prune_assistant_memory_facts(max_facts=12)
    facts = database.load_assistant_memory_facts(limit=100)
    assert len(facts) == 12
