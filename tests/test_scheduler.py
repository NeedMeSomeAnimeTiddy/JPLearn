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


class TestSameDayReviews:
    """Same-day repeats must earn diminishing credit, never full credit.

    Before the same-day elapsed-time floor, a successful review on the same
    calendar day saw elapsed_days == 0, retrievability == 1, and produced no
    stability change at all — drilling a card ten times in one session left it
    scheduled exactly as if it had been answered once.
    """

    DAY = date(2026, 3, 1)

    def _same_day_stabilities(self, quality: int, count: int) -> list[float]:
        state = ReviewState(card_id=1)
        out = []
        for _ in range(count):
            state = update(state, quality=quality, today=self.DAY)
            out.append(state.stability)
        return out

    def _spaced_stabilities(self, quality: int, count: int) -> list[float]:
        state = ReviewState(card_id=2)
        day = self.DAY
        out = []
        for _ in range(count):
            state = update(state, quality=quality, today=day)
            out.append(state.stability)
            day = day + timedelta(days=state.interval)
        return out

    def test_second_same_day_review_grows_stability_and_interval(self) -> None:
        first = update(ReviewState(card_id=1), quality=GOOD, today=self.DAY)
        stability_after_first, interval_after_first = first.stability, first.interval

        second = update(first, quality=GOOD, today=self.DAY)

        assert second.stability > stability_after_first
        assert second.interval > interval_after_first
        assert second.next_review == self.DAY + timedelta(days=second.interval)

    def test_same_day_repeats_saturate_rather_than_compound(self) -> None:
        stabilities = self._same_day_stabilities(GOOD, 6)
        deltas = [b - a for a, b in zip(stabilities, stabilities[1:])]

        assert all(d > 0 for d in deltas), "each same-day repeat must still earn credit"
        assert deltas == sorted(deltas, reverse=True), "credit must diminish, not compound"

    def test_same_day_drilling_stays_below_spaced_reviews(self) -> None:
        """The invariant that keeps this SRS rather than a cheat code."""
        for quality in (GOOD, EASY):
            same_day = self._same_day_stabilities(quality, 6)
            spaced = self._spaced_stabilities(quality, 6)
            # First review is identical (no prior state); every later one must
            # be strictly worse for drilling than for spaced review.
            assert same_day[0] == spaced[0]
            for drilled, waited in zip(same_day[1:], spaced[1:]):
                assert drilled < waited

    def test_same_day_drilling_cannot_reach_the_mastered_interval(self) -> None:
        """Mastered is repetitions >= 3 AND interval >= 21. Same-day drilling is
        now blocked at both halves — repetitions stops at 1 — but the interval
        half is the one this floor governs, so pin it independently.

        Pins the exact repeat count that crosses the threshold rather than just
        asserting "not yet", so raising SAME_DAY_ELAPSED_DAYS cannot quietly
        bring mastery within reach while leaving the documented figures in
        domain/scheduler.py stale and the suite green.
        """
        for quality, expected_crossing in ((EASY, 37), (GOOD, 167)):
            state = ReviewState(card_id=1)
            crossed_at = None
            for n in range(1, expected_crossing + 1):
                state = update(state, quality=quality, today=self.DAY)
                if crossed_at is None and state.interval >= 21:
                    crossed_at = n

            assert crossed_at == expected_crossing

    def test_same_day_repeats_do_not_advance_repetitions(self) -> None:
        """`repetitions` counts distinct successful days, so drilling cannot
        inflate the `repetitions >= 3` half of the mastered rule."""
        state = ReviewState(card_id=1)
        for _ in range(10):
            state = update(state, quality=GOOD, today=self.DAY)

        assert state.repetitions == 1

    def test_repetitions_advance_on_each_new_day(self) -> None:
        state = ReviewState(card_id=1)
        counts = []
        for offset in range(4):
            # Two answers per day: the second must not count again.
            day = self.DAY + timedelta(days=offset)
            state = update(state, quality=GOOD, today=day)
            state = update(state, quality=GOOD, today=day)
            counts.append(state.repetitions)

        assert counts == [1, 2, 3, 4]

    def test_same_day_recovery_after_lapse_still_reads_as_seen(self) -> None:
        """Several call sites treat `repetitions > 0` as "this card has been
        seen", so a successful review must never leave it at zero."""
        state = update(ReviewState(card_id=1), quality=GOOD, today=self.DAY)
        state = update(state, quality=AGAIN, today=self.DAY)
        assert state.repetitions == 0

        state = update(state, quality=GOOD, today=self.DAY)

        assert state.repetitions == 1

    def test_spaced_learner_reaches_mastery_unchanged(self) -> None:
        """The desync fix must only bite drilling. Someone reviewing on due
        dates still crosses both halves of the mastered rule on review 3."""
        for quality in (GOOD, EASY):
            state = ReviewState(card_id=1)
            day = self.DAY
            mastered_on = None
            for n in range(1, 6):
                state = update(state, quality=quality, today=day)
                if mastered_on is None and state.repetitions >= 3 and state.interval >= 21:
                    mastered_on = n
                day = day + timedelta(days=state.interval)

            assert mastered_on == 3

    def test_same_day_again_still_resets_and_is_not_floored(self) -> None:
        """Lapses already respond to same-day reviews via the post-lapse
        formula; the floor is success-path only and must not soften them."""
        state = update(ReviewState(card_id=1), quality=GOOD, today=self.DAY)
        stability_before = state.stability

        lapsed = update(state, quality=AGAIN, today=self.DAY)

        assert lapsed.repetitions == 0
        assert lapsed.stability < stability_before

    def test_today_defaults_to_date_today(self) -> None:
        result = update(ReviewState(card_id=1), quality=GOOD)
        assert result.last_review == date.today()
        assert result.next_review == date.today() + timedelta(days=result.interval)


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
