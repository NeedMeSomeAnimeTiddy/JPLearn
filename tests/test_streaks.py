from datetime import date

from domain.streaks import MAX_FREEZES, StreakState, apply_study_day


def test_first_study_starts_streak() -> None:
    state = StreakState()
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 10), study_day_local=date(2026, 1, 10))
    assert next_state.current_streak_days == 1
    assert next_state.best_streak_days == 1
    assert next_state.freezes_available == 0


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
    assert next_state.freezes_available == 0


def test_utc_regression_is_ignored() -> None:
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=4,
        best_streak_days=7,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 11), study_day_local=date(2026, 1, 13))
    assert next_state == state


# ---------------------------------------------------------------------------
# Streak freeze tests
# ---------------------------------------------------------------------------


def test_freeze_saves_one_missed_day() -> None:
    """Miss 1 day (Tue), 1 freeze available → freeze consumed, streak continues."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=1,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 14), study_day_local=date(2026, 1, 14))
    assert next_state.current_streak_days == 6
    assert next_state.freezes_available == 0
    assert next_state.best_streak_days == 10


def test_freeze_saves_two_missed_days() -> None:
    """Miss 2 days (Tue+Wed), 2 freezes available → both consumed, streak continues."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=2,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 15), study_day_local=date(2026, 1, 15))
    assert next_state.current_streak_days == 6
    assert next_state.freezes_available == 0


def test_freeze_saves_three_missed_days() -> None:
    """Miss 3 days (Tue–Thu), 3 freezes available (cap) → all 3 consumed."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=3,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 16), study_day_local=date(2026, 1, 16))
    assert next_state.current_streak_days == 6
    assert next_state.freezes_available == 0


def test_insufficient_freezes_resets_streak() -> None:
    """Miss 3 days, only 2 freezes → not enough, streak resets, freezes untouched."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=2,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 16), study_day_local=date(2026, 1, 16))
    assert next_state.current_streak_days == 1
    assert next_state.freezes_available == 2


def test_no_freeze_resets_streak() -> None:
    """Gap with 0 freezes → streak resets (existing behavior, freeze fields included)."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 12),
        last_study_day_local=date(2026, 1, 12),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=0,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 15), study_day_local=date(2026, 1, 15))
    assert next_state.current_streak_days == 1
    assert next_state.freezes_available == 0


def test_weekly_freeze_grant_new_week() -> None:
    """First study of a new ISO week grants 1 freeze."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 11),
        last_study_day_local=date(2026, 1, 11),
        current_streak_days=3,
        best_streak_days=5,
        freezes_available=0,
        last_freeze_granted_local=date(2026, 1, 5),
    )
    next_state = apply_study_day(
        state,
        study_day_utc=date(2026, 1, 12),
        study_day_local=date(2026, 1, 12),
        grant_freeze=True,
    )
    assert next_state.current_streak_days == 4
    assert next_state.freezes_available == 1
    assert next_state.last_freeze_granted_local == date(2026, 1, 12)


def test_same_week_does_not_grant_another() -> None:
    """Studying on consecutive days in the same ISO week does not grant an additional freeze."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 6),
        last_study_day_local=date(2026, 1, 6),
        current_streak_days=3,
        best_streak_days=5,
        freezes_available=1,
        last_freeze_granted_local=date(2026, 1, 6),
    )
    next_state = apply_study_day(
        state,
        study_day_utc=date(2026, 1, 7),
        study_day_local=date(2026, 1, 7),
        grant_freeze=True,
    )
    assert next_state.freezes_available == 1
    assert next_state.last_freeze_granted_local == date(2026, 1, 6)


def test_backward_compat_no_new_params() -> None:
    """Calling without freeze params works identically to before (freezes_available=0)."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 10),
        last_study_day_local=date(2026, 1, 10),
        current_streak_days=3,
        best_streak_days=5,
    )
    next_state = apply_study_day(state, study_day_utc=date(2026, 1, 11), study_day_local=date(2026, 1, 11))
    assert next_state.current_streak_days == 4
    assert next_state.freezes_available == 0
    assert next_state.last_freeze_granted_local is None


def test_grant_respects_cap() -> None:
    """Already at MAX_FREEZES → grant does not exceed cap."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 11),
        last_study_day_local=date(2026, 1, 11),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=MAX_FREEZES,
        last_freeze_granted_local=date(2026, 1, 5),
    )
    next_state = apply_study_day(
        state,
        study_day_utc=date(2026, 1, 12),
        study_day_local=date(2026, 1, 12),
        grant_freeze=True,
    )
    assert next_state.freezes_available == MAX_FREEZES


def test_grant_and_consume_same_event() -> None:
    """New week with a 2-day gap: 2 freezes consumed, 1 granted back. Net: freezes=1, streak saved."""
    state = StreakState(
        last_study_day_utc=date(2026, 1, 10),
        last_study_day_local=date(2026, 1, 10),
        current_streak_days=5,
        best_streak_days=10,
        freezes_available=2,
        last_freeze_granted_local=date(2026, 1, 5),
    )
    next_state = apply_study_day(
        state,
        study_day_utc=date(2026, 1, 13),
        study_day_local=date(2026, 1, 13),
        grant_freeze=True,
    )
    assert next_state.current_streak_days == 6
    assert next_state.freezes_available == 1
    assert next_state.last_freeze_granted_local == date(2026, 1, 13)
