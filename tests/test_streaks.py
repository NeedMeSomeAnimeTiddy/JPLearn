from datetime import date

from domain.streaks import StreakState, apply_study_day


def test_first_study_starts_streak() -> None:
    state = StreakState()
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 10), study_day_local=date(2026, 1, 10))
    assert next_state.current_streak_days == 1
    assert next_state.best_streak_days == 1


def test_same_local_day_does_not_increment_streak() -> None:
    state = StreakState(
        last_study_day_utc=date(2026, 1, 10),
        last_study_day_local=date(2026, 1, 10),
        current_streak_days=3,
        best_streak_days=5,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 10), study_day_local=date(2026, 1, 10))
    assert next_state.current_streak_days == 3
    assert next_state.best_streak_days == 5


def test_consecutive_local_day_increments_streak() -> None:
    state = StreakState(
        last_study_day_utc=date(2026, 1, 10),
        last_study_day_local=date(2026, 1, 10),
        current_streak_days=3,
        best_streak_days=4,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 11), study_day_local=date(2026, 1, 11))
    assert next_state.current_streak_days == 4
    assert next_state.best_streak_days == 4


def test_skipped_local_day_resets_current_streak() -> None:
    state = StreakState(
        last_study_day_utc=date(2026, 1, 10),
        last_study_day_local=date(2026, 1, 10),
        current_streak_days=6,
        best_streak_days=8,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 13), study_day_local=date(2026, 1, 13))
    assert next_state.current_streak_days == 1
    assert next_state.best_streak_days == 8


def test_utc_regression_is_ignored() -> None:
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=4,
        best_streak_days=7,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 11), study_day_local=date(2026, 1, 13))
    assert next_state == state
