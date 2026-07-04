"""Deterministic tutor assistant domain models and evaluators."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from domain.activity import ActivitySummary
from domain.history import ItemHistory
from domain.mistakes import MistakeBreakdownRow
from domain.session import SessionSummary
from domain.streaks import StreakState

AssistantMood = Literal["coach_neutral", "coach_supportive", "coach_celebratory", "coach_alert"]
AssistantEventPriority = Literal["info", "coaching", "critical", "celebration"]
AssistantPopupCadence = Literal["low", "medium", "high"]

SCRIPTED_CONTENT_REGISTRY: dict[str, dict[str, str]] = {
    "session_goal_met": {
        "message_key": "coach.goal_met",
        "recommendation_key": "rec.short_follow_up_session",
    },
    "streak_milestone": {
        "message_key": "coach.streak_milestone",
        "recommendation_key": "rec.protect_streak_chain",
    },
    "leech_intervention": {
        "message_key": "coach.leech_intervention",
        "recommendation_key": "rec.typed_recall_focus",
    },
    "weakness_spike": {
        "message_key": "coach.weakness_focus",
        "recommendation_key": "rec.focused_block_retry",
    },
    "curriculum_stall": {
        "message_key": "coach.curriculum_stall",
        "recommendation_key": "rec.particle_cloze_recovery",
    },
    "activity_nudge": {
        "message_key": "coach.activity_nudge",
        "recommendation_key": "rec.short_reminder_session",
    },
    "session_recovery": {
        "message_key": "coach.session_recovery",
        "recommendation_key": "rec.recovery_loop",
    },
    "momentum_encouragement": {
        "message_key": "coach.momentum_encouragement",
        "recommendation_key": "rec.stretch_goal_push",
    },
    "ambient_checkin": {
        "message_key": "coach.ambient_checkin",
        "recommendation_key": "rec.maintain_consistency",
    },
}

SCRIPTED_RECOMMENDATION_PAYLOADS: dict[str, dict[str, str]] = {
    "rec.short_follow_up_session": {
        "action_type": "follow_up",
        "target_mode": "interleave_mix",
        "suggested_rounds": "8",
        "suggested_minutes": "6",
    },
    "rec.protect_streak_chain": {
        "action_type": "streak_keepalive",
        "target_mode": "meaning_match",
        "suggested_rounds": "5",
        "suggested_minutes": "5",
    },
    "rec.typed_recall_focus": {
        "action_type": "recovery_drill",
        "target_mode": "typed_recall",
        "suggested_rounds": "10",
        "suggested_minutes": "10",
    },
    "rec.focused_block_retry": {
        "action_type": "focused_retry",
        "target_mode": "meaning_match",
        "suggested_rounds": "8",
        "suggested_minutes": "8",
    },
    "rec.particle_cloze_recovery": {
        "action_type": "curriculum_recovery",
        "target_mode": "particle_cloze",
        "suggested_rounds": "7",
        "suggested_minutes": "9",
    },
    "rec.short_reminder_session": {
        "action_type": "consistency_nudge",
        "target_mode": "interleave_mix",
        "suggested_rounds": "6",
        "suggested_minutes": "5",
    },
    "rec.recovery_loop": {
        "action_type": "session_recovery",
        "target_mode": "typed_recall",
        "suggested_rounds": "9",
        "suggested_minutes": "10",
    },
    "rec.stretch_goal_push": {
        "action_type": "stretch_push",
        "target_mode": "interleave_mix",
        "suggested_rounds": "12",
        "suggested_minutes": "12",
    },
    "rec.maintain_consistency": {
        "action_type": "steady_progress",
        "target_mode": "meaning_match",
        "suggested_rounds": "5",
        "suggested_minutes": "5",
    },
}


@dataclass(frozen=True)
class AssistantState:
    """Persistent emotional snapshot for the tutor companion."""

    mood: AssistantMood
    momentum: int
    confidence_level: int
    focus_area: str
    last_major_event: str


@dataclass(frozen=True)
class AssistantEvent:
    """Deterministic scripted event for popups and notifications."""

    event_type: str
    priority: AssistantEventPriority
    message_key: str
    metadata: dict[str, str]
    dedup_key: str = ""
    cooldown_minutes: int = 60


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _trend_score(item_history: list[ItemHistory]) -> int:
    if not item_history:
        return 0
    latest = item_history[:5]
    improving = sum(1 for item in latest if item.trend == "improving")
    declining = sum(1 for item in latest if item.trend == "declining")
    return (improving - declining) * 8


def _resolve_focus_area(mistakes: list[MistakeBreakdownRow]) -> str:
    if not mistakes:
        return "general"
    weakest = mistakes[0]
    if weakest.error_rate < 45:
        return "general"
    return weakest.key


def _priority_sort_value(priority: AssistantEventPriority) -> int:
    if priority == "critical":
        return 0
    if priority == "celebration":
        return 1
    if priority == "coaching":
        return 2
    return 3


def _max_events_for_cadence(popup_cadence: AssistantPopupCadence) -> int:
    if popup_cadence == "high":
        return 4
    if popup_cadence == "medium":
        return 3
    return 2


def _cooldown_minutes_for_event(
    event_priority: AssistantEventPriority,
    popup_cadence: AssistantPopupCadence,
) -> int:
    base_by_priority = {
        "critical": 20,
        "celebration": 60,
        "coaching": 45,
        "info": 90,
    }
    cadence_multiplier = {
        "high": 1.0,
        "medium": 1.6,
        "low": 2.4,
    }
    base = base_by_priority[event_priority]
    return max(10, round(base * cadence_multiplier[popup_cadence]))


def build_assistant_event_dedup_key(event_type: str, metadata: dict[str, str]) -> str:
    """Build deterministic dedup key from event type and stable metadata fields."""

    if event_type == "session_goal_met":
        session_id = metadata.get("session_id", "")
        return f"goal:{session_id or 'unknown'}"
    if event_type == "streak_milestone":
        return f"streak:{metadata.get('days', '0')}"
    if event_type == "leech_intervention":
        return f"leech:{metadata.get('leech_count', '0')}"
    if event_type == "weakness_spike":
        return f"weakness:{metadata.get('focus_area', 'general')}:{metadata.get('error_rate', '0')}"
    if event_type == "curriculum_stall":
        return f"curriculum:{metadata.get('mode', 'particle_cloze')}:{metadata.get('accuracy_7d', '0')}"
    if event_type == "activity_nudge":
        return f"activity:{metadata.get('active_days', '0')}:{metadata.get('reviewed', '0')}"
    if event_type == "session_recovery":
        return f"recovery:{metadata.get('session_id', 'unknown')}:{metadata.get('accuracy', '0')}"
    if event_type == "momentum_encouragement":
        return f"momentum:{metadata.get('momentum_band', 'steady')}"
    return f"ambient:{metadata.get('mood', 'coach_neutral')}"


def _create_scripted_event(
    event_type: str,
    priority: AssistantEventPriority,
    popup_cadence: AssistantPopupCadence,
    metadata: dict[str, str],
) -> AssistantEvent:
    registry = SCRIPTED_CONTENT_REGISTRY[event_type]
    recommendation_key = registry["recommendation_key"]
    recommendation_payload = SCRIPTED_RECOMMENDATION_PAYLOADS.get(recommendation_key, {})
    normalized_metadata = {
        **metadata,
        "recommendation_key": recommendation_key,
        **recommendation_payload,
    }
    return AssistantEvent(
        event_type=event_type,
        priority=priority,
        message_key=registry["message_key"],
        metadata=normalized_metadata,
        dedup_key=build_assistant_event_dedup_key(event_type, normalized_metadata),
        cooldown_minutes=_cooldown_minutes_for_event(priority, popup_cadence),
    )


def compute_assistant_state(
    activity_week: ActivitySummary,
    streak: StreakState,
    mistakes: list[MistakeBreakdownRow],
    item_history: list[ItemHistory],
    leech_count: int,
    session_summary: SessionSummary | None,
    prior_momentum: int = 0,
    long_horizon_momentum: int = 0,
    curriculum_attempts: int = 0,
    curriculum_accuracy_7d: int = 100,
) -> AssistantState:
    """Compute deterministic coach mood and momentum from study signals."""

    momentum_delta = 0
    momentum_delta += _clamp(activity_week.accuracy - 65, -25, 25)
    momentum_delta += _clamp((streak.current_streak_days // 3) * 4, -4, 24)
    momentum_delta += _trend_score(item_history)
    momentum_delta -= _clamp(leech_count * 6, 0, 30)
    if mistakes:
        momentum_delta -= _clamp((mistakes[0].error_rate - 40) // 4, 0, 15)

    if session_summary is not None and session_summary.goal_met:
        momentum_delta += 12

    if curriculum_attempts >= 8 and curriculum_accuracy_7d < 60:
        momentum_delta -= _clamp((60 - curriculum_accuracy_7d) // 2, 0, 15)

    smoothed_prior = round((prior_momentum * 0.6) + (long_horizon_momentum * 0.4))
    momentum = _clamp(round((smoothed_prior * 0.7) + momentum_delta), -100, 100)
    confidence_level = _clamp(50 + round(momentum * 0.4), 0, 100)
    focus_area = _resolve_focus_area(mistakes)
    if focus_area == "general" and curriculum_attempts >= 8 and curriculum_accuracy_7d < 60:
        focus_area = "particle_cloze"

    mood: AssistantMood = "coach_neutral"
    last_major_event = "steady_progress"
    if session_summary is not None and session_summary.goal_met:
        mood = "coach_celebratory"
        last_major_event = "session_goal_met"
    elif leech_count >= 3 or (mistakes and mistakes[0].error_rate >= 70):
        mood = "coach_alert"
        last_major_event = "high_difficulty"
    elif momentum <= -25:
        mood = "coach_supportive"
        last_major_event = "momentum_drop"
    elif curriculum_attempts >= 8 and curriculum_accuracy_7d < 60:
        mood = "coach_supportive"
        last_major_event = "curriculum_stall"
    elif momentum >= 25:
        mood = "coach_celebratory"
        last_major_event = "momentum_rise"

    return AssistantState(
        mood=mood,
        momentum=momentum,
        confidence_level=confidence_level,
        focus_area=focus_area,
        last_major_event=last_major_event,
    )


def evaluate_assistant_events(
    state: AssistantState,
    activity_week: ActivitySummary,
    streak: StreakState,
    mistakes: list[MistakeBreakdownRow],
    leech_count: int,
    session_summary: SessionSummary | None,
    now_utc: datetime,
    popup_cadence: AssistantPopupCadence = "high",
    recently_emitted_dedup_keys: set[str] | None = None,
    curriculum_attempts: int = 0,
    curriculum_accuracy_7d: int = 100,
) -> list[AssistantEvent]:
    """Evaluate deterministic scripted popup events for the companion UI."""

    _ = now_utc  # Explicit injection keeps clock ownership outside domain logic.
    candidates: list[AssistantEvent] = []

    if session_summary is not None and session_summary.goal_met:
        candidates.append(
            _create_scripted_event(
                event_type="session_goal_met",
                priority="celebration",
                popup_cadence=popup_cadence,
                metadata={"session_id": session_summary.session_id},
            )
        )

    if streak.current_streak_days > 0 and streak.current_streak_days in {3, 7, 14, 30}:
        candidates.append(
            _create_scripted_event(
                event_type="streak_milestone",
                priority="celebration",
                popup_cadence=popup_cadence,
                metadata={"days": str(streak.current_streak_days)},
            )
        )

    if leech_count >= 3:
        candidates.append(
            _create_scripted_event(
                event_type="leech_intervention",
                priority="critical",
                popup_cadence=popup_cadence,
                metadata={"leech_count": str(leech_count)},
            )
        )

    if mistakes and mistakes[0].error_rate >= 60:
        candidates.append(
            _create_scripted_event(
                event_type="weakness_spike",
                priority="coaching",
                popup_cadence=popup_cadence,
                metadata={
                    "focus_area": state.focus_area,
                    "error_rate": str(mistakes[0].error_rate),
                },
            )
        )

    if curriculum_attempts >= 8 and curriculum_accuracy_7d < 60:
        candidates.append(
            _create_scripted_event(
                event_type="curriculum_stall",
                priority="coaching",
                popup_cadence=popup_cadence,
                metadata={
                    "mode": "particle_cloze",
                    "accuracy_7d": str(curriculum_accuracy_7d),
                },
            )
        )

    if activity_week.active_days <= 2 or activity_week.reviewed < 12:
        candidates.append(
            _create_scripted_event(
                event_type="activity_nudge",
                priority="coaching",
                popup_cadence=popup_cadence,
                metadata={
                    "active_days": str(activity_week.active_days),
                    "reviewed": str(activity_week.reviewed),
                },
            )
        )

    if session_summary is not None and not session_summary.goal_met and session_summary.accuracy < 70:
        candidates.append(
            _create_scripted_event(
                event_type="session_recovery",
                priority="coaching",
                popup_cadence=popup_cadence,
                metadata={
                    "session_id": session_summary.session_id,
                    "accuracy": str(session_summary.accuracy),
                    "target_items": str(session_summary.target_items),
                    "completed_items": str(session_summary.completed_items),
                },
            )
        )

    if state.momentum >= 35 and state.mood == "coach_celebratory":
        momentum_band = "high" if state.momentum >= 60 else "rising"
        candidates.append(
            _create_scripted_event(
                event_type="momentum_encouragement",
                priority="celebration",
                popup_cadence=popup_cadence,
                metadata={
                    "momentum_band": momentum_band,
                    "momentum": str(state.momentum),
                },
            )
        )

    if not candidates:
        candidates.append(
            _create_scripted_event(
                event_type="ambient_checkin",
                priority="info",
                popup_cadence=popup_cadence,
                metadata={"mood": state.mood},
            )
        )

    seen = set(recently_emitted_dedup_keys or set())
    selected: list[AssistantEvent] = []
    for event in sorted(candidates, key=lambda item: _priority_sort_value(item.priority)):
        if event.dedup_key and event.dedup_key in seen:
            continue
        selected.append(event)
        if event.dedup_key:
            seen.add(event.dedup_key)
        if len(selected) >= _max_events_for_cadence(popup_cadence):
            break

    return selected