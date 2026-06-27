"""Deterministic tutor assistant domain models and evaluators."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from domain.activity import ActivitySummary
from domain.history import ItemHistory
from domain.mistakes import MistakeBreakdownRow
from domain.session import SessionSummary
from domain.streaks import StreakState

AssistantMood = Literal["coach_neutral", "coach_supportive", "coach_celebratory", "coach_alert"]
AssistantEventPriority = Literal["info", "coaching", "critical", "celebration"]


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


def compute_assistant_state(
    activity_week: ActivitySummary,
    streak: StreakState,
    mistakes: list[MistakeBreakdownRow],
    item_history: list[ItemHistory],
    leech_count: int,
    session_summary: SessionSummary | None,
    prior_momentum: int = 0,
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

    momentum = _clamp(round((prior_momentum * 0.7) + momentum_delta), -100, 100)
    confidence_level = _clamp(50 + round(momentum * 0.4), 0, 100)
    focus_area = _resolve_focus_area(mistakes)

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
    streak: StreakState,
    mistakes: list[MistakeBreakdownRow],
    leech_count: int,
    session_summary: SessionSummary | None,
) -> list[AssistantEvent]:
    """Evaluate deterministic scripted popup events for the companion UI."""

    events: list[AssistantEvent] = []

    if session_summary is not None and session_summary.goal_met:
        events.append(
            AssistantEvent(
                event_type="session_goal_met",
                priority="celebration",
                message_key="coach.goal_met",
                metadata={"session_id": session_summary.session_id},
            )
        )

    if streak.current_streak_days > 0 and streak.current_streak_days in {3, 7, 14, 30}:
        events.append(
            AssistantEvent(
                event_type="streak_milestone",
                priority="celebration",
                message_key="coach.streak_milestone",
                metadata={"days": str(streak.current_streak_days)},
            )
        )

    if leech_count >= 3:
        events.append(
            AssistantEvent(
                event_type="leech_intervention",
                priority="critical",
                message_key="coach.leech_intervention",
                metadata={"leech_count": str(leech_count)},
            )
        )

    if mistakes and mistakes[0].error_rate >= 60:
        events.append(
            AssistantEvent(
                event_type="weakness_spike",
                priority="coaching",
                message_key="coach.weakness_focus",
                metadata={
                    "focus_area": state.focus_area,
                    "error_rate": str(mistakes[0].error_rate),
                },
            )
        )

    if not events:
        events.append(
            AssistantEvent(
                event_type="ambient_checkin",
                priority="info",
                message_key="coach.ambient_checkin",
                metadata={"mood": state.mood},
            )
        )

    return events