"""Deterministic daily streak tracking logic."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

MAX_FREEZES: int = 3
"""Maximum number of streak freezes a user can store."""


@dataclass(frozen=True)
class StreakState:
    """Persistent streak state for study activity.

    Attributes:
        last_study_day_utc: UTC day of the last accepted study event.
        last_study_day_local: Local day of the last accepted study event.
        current_streak_days: Current consecutive-day streak.
        best_streak_days: Best historical consecutive-day streak.
        freezes_available: Number of streak freezes stored (max 3).
        last_freeze_granted_local: Local date when a freeze was last granted,
            used to determine when a new ISO week begins.
    """

    last_study_day_utc: date | None = None
    last_study_day_local: date | None = None
    current_streak_days: int = 0
    best_streak_days: int = 0
    freezes_available: int = 0
    last_freeze_granted_local: date | None = None


def apply_study_day(
    state: StreakState,
    study_day_utc: date,
    study_day_local: date,
    *,
    freezes_available: int | None = None,
    grant_freeze: bool = False,
) -> StreakState:
    """Return next streak state for one study event.

    Rules:
    - First accepted event starts streak at 1.
    - Repeated events on the same local day do not increment streak.
    - Next consecutive local day increments streak.
    - Gaps of 2+ local days may be covered by streak freezes:
      each missed day costs 1 freeze. If enough freezes are available,
      the streak continues and freezes are consumed. If insufficient,
      the streak resets to 1 and freezes are left untouched.
    - When ``grant_freeze`` is True, a freeze is granted on the first
      study of each ISO week (Mon-Sun), capped at ``MAX_FREEZES``.
    - UTC day regression is treated as stale input and ignored.
    """

    if state.last_study_day_utc is not None and study_day_utc < state.last_study_day_utc:
        return state

    effective_freezes = freezes_available if freezes_available is not None else state.freezes_available

    if state.last_study_day_local is None:
        next_current = 1
        next_best = max(1, state.best_streak_days)
        next_freezes = effective_freezes
        first_grant = _maybe_grant_freeze(state, study_day_local, grant_freeze, next_freezes)
        return StreakState(
            last_study_day_utc=study_day_utc,
            last_study_day_local=study_day_local,
            current_streak_days=next_current,
            best_streak_days=next_best,
            freezes_available=first_grant[0],
            last_freeze_granted_local=first_grant[1],
        )

    delta_days = (study_day_local - state.last_study_day_local).days

    if delta_days <= 0:
        next_current = state.current_streak_days
        next_freezes = effective_freezes
    elif delta_days == 1:
        next_current = state.current_streak_days + 1
        next_freezes = effective_freezes
    else:
        missed_days = delta_days - 1
        if effective_freezes >= missed_days:
            next_current = state.current_streak_days + 1
            next_freezes = effective_freezes - missed_days
        else:
            next_current = 1
            next_freezes = effective_freezes

    next_freezes, next_last_granted = _maybe_grant_freeze(
        state, study_day_local, grant_freeze, next_freezes,
    )

    return StreakState(
        last_study_day_utc=study_day_utc,
        last_study_day_local=study_day_local,
        current_streak_days=next_current,
        best_streak_days=max(state.best_streak_days, next_current),
        freezes_available=next_freezes,
        last_freeze_granted_local=next_last_granted,
    )


def _maybe_grant_freeze(
    state: StreakState,
    study_day_local: date,
    grant_freeze: bool,
    current_freezes: int,
) -> tuple[int, date | None]:
    """Return (next_freezes, next_last_granted) after a possible weekly grant."""
    if not grant_freeze:
        return current_freezes, state.last_freeze_granted_local
    current_week = study_day_local.isocalendar()[:2]
    last_week = (
        state.last_freeze_granted_local.isocalendar()[:2]
        if state.last_freeze_granted_local else None
    )
    if last_week is None or current_week != last_week:
        return min(current_freezes + 1, MAX_FREEZES), study_day_local
    return current_freezes, state.last_freeze_granted_local
