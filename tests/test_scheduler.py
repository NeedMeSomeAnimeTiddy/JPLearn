"""Tests for the FSRS-based scheduler in domain/scheduler.py."""

from datetime import date, timedelta

from domain.scheduler import (
    AGAIN,
    EASY,
    GOOD,
    HARD,
    ReviewState,
    get_weights,
    reset_weights,
    set_weights,
    update,
)


def test_first_review_seeds_stability_and_difficulty() -> None:
    state = ReviewState(card_id=1)
    assert state.stability == 0.0
    assert state.difficulty == 0.0

    result = update(state, quality=GOOD)

    assert result.stability > 0.0
    assert 1.0 <= result.difficulty <= 10.0
    assert result.repetitions == 1
    assert result.interval >= 1
    assert result.next_review == date.today() + timedelta(days=result.interval)


def test_again_rating_resets_repetitions_but_keeps_positive_stability() -> None:
    state = ReviewState(card_id=1)
    result = update(state, quality=AGAIN)

    assert result.repetitions == 0
    assert result.stability > 0.0  # FSRS lapse formula, never zero/negative
    assert result.interval >= 1


def test_minigame_incorrect_quality_one_resets_like_again() -> None:
    """quality=1 is used by review_minigame_result for incorrect answers and
    must behave like a forgotten (Again) review, not a partial success."""
    state = ReviewState(card_id=1, stability=5.0, difficulty=5.0, repetitions=3)
    result = update(state, quality=1)

    assert result.repetitions == 0


def test_repeated_good_reviews_grow_interval() -> None:
    state = ReviewState(card_id=1)
    intervals = []
    for _ in range(4):
        state = update(state, quality=GOOD)
        # Force enough elapsed time so retrievability reflects true decay.
        state.last_review = date.today() - timedelta(days=state.interval)
        intervals.append(state.interval)

    assert intervals == sorted(intervals)
    assert intervals[-1] > intervals[0]


def test_easy_rating_grows_stability_more_than_hard() -> None:
    easy_state = update(ReviewState(card_id=1), quality=EASY)
    hard_state = update(ReviewState(card_id=2), quality=HARD)

    assert easy_state.stability > hard_state.stability


def test_ease_factor_stays_within_legacy_bounds() -> None:
    for quality in (AGAIN, HARD, GOOD, EASY):
        result = update(ReviewState(card_id=1), quality=quality)
        assert 1.3 <= result.ease_factor <= 2.8


def test_confidence_blend_still_supported() -> None:
    state = ReviewState(card_id=1)
    result = update(state, quality=GOOD, confidence=5)
    assert result.repetitions == 1
    assert result.interval >= 1


class TestWeightOverride:
    """Verify set_weights / reset_weights / get_weights change behaviour."""

    def setup_method(self) -> None:
        reset_weights()

    def teardown_method(self) -> None:
        reset_weights()

    def test_get_weights_returns_defaults_initially(self) -> None:
        w = get_weights()
        assert len(w) == 17
        assert w[0] == 0.4

    def test_custom_weights_produce_different_interval(self) -> None:
        default = update(ReviewState(card_id=1), quality=GOOD)
        custom_w = tuple(0.1 for _ in range(17))
        set_weights(custom_w)
        custom_result = update(ReviewState(card_id=1), quality=GOOD)
        assert default.interval != custom_result.interval

    def test_reset_restores_defaults(self) -> None:
        custom_w = tuple(0.1 for _ in range(17))
        set_weights(custom_w)
        assert get_weights() != (0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61)
        reset_weights()
        assert get_weights() == (0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61)

    def test_small_weights_still_produce_valid_metrics(self) -> None:
        """Even extreme weights should keep difficulty/ease within bounds."""
        tiny = tuple(0.05 for _ in range(17))
        set_weights(tiny)
        result = update(ReviewState(card_id=1), quality=GOOD)
        assert 1.0 <= result.difficulty <= 10.0
        assert 1.3 <= result.ease_factor <= 2.8
        assert result.interval >= 1
