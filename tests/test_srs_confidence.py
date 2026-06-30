"""Tests for confidence-score blending in SRS scheduling.

Rubric: effective = round(quality * 0.7 + confidence * 0.3)
confidence=None (default) → no blending; existing behaviour preserved.
"""

from pytest import approx

from domain.scheduler import ReviewState, update
from domain.srs import SRSState, update_srs


# ---------------------------------------------------------------------------
# domain/srs.py — update_srs
# ---------------------------------------------------------------------------


def test_update_srs_no_confidence_preserves_existing_behaviour() -> None:
    """Omitting confidence must not change any output (full backward compat)."""
    state = SRSState(last_interval=10, ease_factor=2.0)
    without = update_srs(state, performance=4)
    with_none = update_srs(state, performance=4, confidence=None)
    assert without == with_none


def test_update_srs_high_confidence_boosts_effective_performance() -> None:
    """quality=3, confidence=5 → effective=round(2.1+1.5)=4; EF should increase."""
    state = SRSState(last_interval=10, ease_factor=2.0)
    # effective_performance=4 is the "good" branch → EF += 0.1
    result = update_srs(state, performance=3, confidence=5)
    assert result.new_ease_factor == approx(2.1)
    assert result.next_interval > 10  # interval grows (performance ≥ 3 branch)


def test_update_srs_low_confidence_reduces_effective_performance() -> None:
    """quality=4, confidence=1 → effective=round(2.8+0.3)=3; EF unchanged (== 3 branch)."""
    state = SRSState(last_interval=10, ease_factor=2.0)
    result = update_srs(state, performance=4, confidence=1)
    assert result.new_ease_factor == approx(2.0)  # performance==3 → no EF change


def test_update_srs_ease_factor_clamp_respected_with_confidence() -> None:
    state = SRSState(last_interval=10, ease_factor=2.8)
    result = update_srs(state, performance=5, confidence=5)
    assert result.new_ease_factor <= 2.8


def test_update_srs_minimum_ease_factor_respected_with_confidence() -> None:
    state = SRSState(last_interval=10, ease_factor=1.3)
    result = update_srs(state, performance=0, confidence=1)
    assert result.new_ease_factor >= 1.3


def test_update_srs_neutral_confidence_matches_quality_exactly() -> None:
    """When confidence == quality, blend should round back to quality."""
    for q in range(0, 6):
        state = SRSState(last_interval=10, ease_factor=2.0)
        result_plain = update_srs(state, performance=q)
        result_same = update_srs(state, performance=q, confidence=q)
        # effective = round(q*0.7 + q*0.3) = round(q) = q
        assert result_plain == result_same, f"Failed for quality={q}"


# ---------------------------------------------------------------------------
# domain/scheduler.py — update
# ---------------------------------------------------------------------------


def test_scheduler_no_confidence_preserves_existing_behaviour() -> None:
    """Omitting confidence must not change any output."""
    s1 = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    s2 = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    r1 = update(s1, quality=4)
    r2 = update(s2, quality=4, confidence=None)
    assert r1.interval == r2.interval
    assert r1.ease_factor == r2.ease_factor
    assert r1.repetitions == r2.repetitions


def test_scheduler_high_confidence_boosts_effective_quality() -> None:
    """quality=3, confidence=5 → effective=4; interval grows (repetitions>=1 path)."""
    s_boosted = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    s_base = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    r_boosted = update(s_boosted, quality=3, confidence=5)
    r_base = update(s_base, quality=4)
    assert r_boosted.interval == r_base.interval
    assert round(r_boosted.ease_factor, 10) == round(r_base.ease_factor, 10)


def test_scheduler_low_confidence_reduces_effective_quality() -> None:
    """quality=4, confidence=1 → effective=3; result same as plain quality=3."""
    s_reduced = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    s_base = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=1)
    r_reduced = update(s_reduced, quality=4, confidence=1)
    r_base = update(s_base, quality=3)
    assert r_reduced.interval == r_base.interval
    assert round(r_reduced.ease_factor, 10) == round(r_base.ease_factor, 10)


def test_scheduler_failed_review_still_resets_with_low_confidence() -> None:
    """Low quality + low confidence stays in the 'failed' branch."""
    state = ReviewState(card_id=1, ease_factor=2.5, interval=10, repetitions=3)
    result = update(state, quality=2, confidence=2)
    # effective = round(2*0.7 + 2*0.3) = round(2.0) = 2 → <3 → reset
    assert result.repetitions == 0
    assert result.interval == 1


def test_scheduler_neutral_confidence_matches_quality_exactly() -> None:
    """When confidence == quality the blend rounds back to quality."""
    for q in range(0, 6):
        s1 = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=2)
        s2 = ReviewState(card_id=1, ease_factor=2.5, interval=6, repetitions=2)
        r1 = update(s1, quality=q)
        r2 = update(s2, quality=q, confidence=q)
        assert r1.interval == r2.interval, f"interval mismatch at quality={q}"
        assert round(r1.ease_factor, 10) == round(r2.ease_factor, 10), (
            f"ease_factor mismatch at quality={q}"
        )
