"""Deterministic daily streak tracking logic."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class StreakState:
    """Persistent streak state for study activity.

    Attributes:
        last_study_day_utc: UTC day of the last accepted study event.
        last_study_day_local: Local day of the last accepted study event.
        current_streak_days: Current consecutive-day streak.
        best_streak_days: Best historical consecutive-day streak.
    """

    last_study_day_utc: date | None = None
    last_study_day_local: date | None = None
    current_streak_days: int = 0
    best_streak_days: int = 0


def apply_study_day(
    state: StreakState,
    study_day_utc: date,
    study_day_local: date,
) -> StreakState:
    """Return next streak state for one study event.

    Rules:
    - First accepted event starts streak at 1.
    - Repeated events on the same local day do not increment streak.
    - Next consecutive local day increments streak.
    - Gaps of 2+ local days reset streak to 1.
    - UTC day regression is treated as stale input and ignored.
    """

    if state.last_study_day_utc is not None and study_day_utc < state.last_study_day_utc:
        return state

    if state.last_study_day_local is None:
        return StreakState(
            last_study_day_utc=study_day_utc,
            last_study_day_local=study_day_local,
            current_streak_days=1,
            best_streak_days=max(1, state.best_streak_days),
        )

    delta_days = (study_day_local - state.last_study_day_local).days

    if delta_days <= 0:
        next_current = state.current_streak_days
    elif delta_days == 1:
        next_current = state.current_streak_days + 1
    else:
        next_current = 1

    return StreakState(
        last_study_day_utc=study_day_utc,
        last_study_day_local=study_day_local,
        current_streak_days=next_current,
        best_streak_days=max(state.best_streak_days, next_current),
    )
