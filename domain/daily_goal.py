"""Domain models for daily study goal tracking."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DailyGoal:
    """Daily review target and current progress."""

    target_items: int
    current_items: int

    @property
    def goal_met(self) -> bool:
        return self.current_items >= self.target_items


DAILY_MINUTES_TO_CARDS: dict[int, int] = {
    5: 10,
    10: 20,
    20: 30,
    30: 50,
}

FALLBACK_DAILY_CARD_GOAL = 20

PRESET_CARD_GOALS = (10, 20, 30, 50, 75)


def default_card_target(onboarding_daily_minutes: int | None) -> int:
    if onboarding_daily_minutes is not None:
        return DAILY_MINUTES_TO_CARDS.get(onboarding_daily_minutes, FALLBACK_DAILY_CARD_GOAL)
    return FALLBACK_DAILY_CARD_GOAL
