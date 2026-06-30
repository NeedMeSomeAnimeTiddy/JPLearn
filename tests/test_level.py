"""Tests for the XP and leveling system.

Coverage:
- LevelCurve: validation, field defaults
- xp_for_level_up: level 1, level 2, level 3+, scaling consistency
- cumulative_xp_for_level: level 1 anchor, level 2, multi-level
- compute_level: zero XP, exact boundaries, just below/above, max_level cap
- xp_to_next_level: mid-level, at boundary, at max_level
- apply_xp: XP accumulation, level field updated, dedup_key recorded,
            no-level-up events, level-up event, multi-level jump, dedup protection
- apply_xp_batch: sequential accumulation, duplicate dedup in batch, ordering
- LevelCurve variants: flat curve (scaling=1.0), custom base_xp
- Edge cases: zero-amount event, single-XP-to-level-up, large single grant
"""
from __future__ import annotations

from datetime import date

import pytest

from domain.level_service import (
    apply_xp,
    apply_xp_batch,
    compute_level,
    cumulative_xp_for_level,
    xp_for_level_up,
    xp_to_next_level,
)
from domain.xp import (
    DEFAULT_CURVE,
    XP_CORRECT_ANSWER,
    XP_DAILY_COMPLETION,
    XP_FEATURE_UNLOCK_BONUS,
    XP_MASTERY_MILESTONE,
    XP_STREAK_BONUS,
    LevelCurve,
    LevelEvent,
    UserProgress,
    XPEvent,
)

TODAY = date(2026, 1, 1)

# Precomputed thresholds for the DEFAULT_CURVE (base_xp=100, scaling=1.5):
#   Level 1 → 2: 100 XP
#   Level 2 → 3: 150 XP   (floor(100*1.5))
#   Level 3 → 4: 225 XP   (floor(150*1.5))
#   Level 4 → 5: 337 XP   (floor(225*1.5))
#   Level 5 → 6: 505 XP   (floor(337*1.5))
#
# Cumulative to reach each level:
#   Level 1: 0
#   Level 2: 100
#   Level 3: 250
#   Level 4: 475
#   Level 5: 812


def _event(
    amount: int = 10,
    key: str = "key1",
    source: str = "correct_answer",
) -> XPEvent:
    return XPEvent(
        source=source,  # type: ignore[arg-type]
        amount=amount,
        dedup_key=key,
        date=TODAY,
    )


# ---------------------------------------------------------------------------
# LevelCurve
# ---------------------------------------------------------------------------


class TestLevelCurve:
    def test_defaults(self):
        c = LevelCurve()
        assert c.base_xp == 100
        assert c.scaling_factor == 1.5
        assert c.max_level == 100

    def test_invalid_base_xp(self):
        with pytest.raises(ValueError, match="base_xp"):
            LevelCurve(base_xp=0)

    def test_invalid_scaling_factor(self):
        with pytest.raises(ValueError, match="scaling_factor"):
            LevelCurve(scaling_factor=0.9)

    def test_invalid_max_level(self):
        with pytest.raises(ValueError, match="max_level"):
            LevelCurve(max_level=0)

    def test_flat_curve_allowed(self):
        c = LevelCurve(scaling_factor=1.0)
        assert c.scaling_factor == 1.0

    def test_custom_values(self):
        c = LevelCurve(base_xp=50, scaling_factor=2.0, max_level=10)
        assert c.base_xp == 50


# ---------------------------------------------------------------------------
# xp_for_level_up
# ---------------------------------------------------------------------------


class TestXpForLevelUp:
    def test_level_1_equals_base_xp(self):
        assert xp_for_level_up(1, DEFAULT_CURVE) == 100

    def test_level_2_applies_scaling_once(self):
        assert xp_for_level_up(2, DEFAULT_CURVE) == 150  # floor(100*1.5)

    def test_level_3_applies_scaling_twice(self):
        assert xp_for_level_up(3, DEFAULT_CURVE) == 225  # floor(150*1.5)

    def test_level_4(self):
        assert xp_for_level_up(4, DEFAULT_CURVE) == 337  # floor(225*1.5)

    def test_level_invalid_raises(self):
        with pytest.raises(ValueError, match="level"):
            xp_for_level_up(0, DEFAULT_CURVE)

    def test_flat_curve_all_levels_equal(self):
        flat = LevelCurve(base_xp=100, scaling_factor=1.0)
        assert xp_for_level_up(1, flat) == 100
        assert xp_for_level_up(5, flat) == 100
        assert xp_for_level_up(10, flat) == 100

    def test_consistent_with_cumulative(self):
        """xp_for_level_up(N) == cumulative(N+1) - cumulative(N)."""
        for level in range(1, 8):
            step = xp_for_level_up(level, DEFAULT_CURVE)
            diff = (
                cumulative_xp_for_level(level + 1, DEFAULT_CURVE)
                - cumulative_xp_for_level(level, DEFAULT_CURVE)
            )
            assert step == diff, f"mismatch at level {level}"


# ---------------------------------------------------------------------------
# cumulative_xp_for_level
# ---------------------------------------------------------------------------


class TestCumulativeXpForLevel:
    def test_level_1_is_zero(self):
        assert cumulative_xp_for_level(1, DEFAULT_CURVE) == 0

    def test_level_2(self):
        assert cumulative_xp_for_level(2, DEFAULT_CURVE) == 100

    def test_level_3(self):
        assert cumulative_xp_for_level(3, DEFAULT_CURVE) == 250

    def test_level_4(self):
        assert cumulative_xp_for_level(4, DEFAULT_CURVE) == 475

    def test_level_5(self):
        assert cumulative_xp_for_level(5, DEFAULT_CURVE) == 812

    def test_monotonically_increasing(self):
        thresholds = [cumulative_xp_for_level(lv, DEFAULT_CURVE) for lv in range(1, 10)]
        assert thresholds == sorted(thresholds)
        assert len(set(thresholds)) == len(thresholds)

    def test_flat_curve_linear(self):
        flat = LevelCurve(base_xp=100, scaling_factor=1.0)
        assert cumulative_xp_for_level(2, flat) == 100
        assert cumulative_xp_for_level(3, flat) == 200
        assert cumulative_xp_for_level(4, flat) == 300


# ---------------------------------------------------------------------------
# compute_level
# ---------------------------------------------------------------------------


class TestComputeLevel:
    def test_zero_xp_is_level_1(self):
        assert compute_level(0, DEFAULT_CURVE) == 1

    def test_just_below_level_2(self):
        assert compute_level(99, DEFAULT_CURVE) == 1

    def test_exactly_at_level_2(self):
        assert compute_level(100, DEFAULT_CURVE) == 2

    def test_just_above_level_2(self):
        assert compute_level(101, DEFAULT_CURVE) == 2

    def test_exactly_at_level_3(self):
        assert compute_level(250, DEFAULT_CURVE) == 3

    def test_just_below_level_3(self):
        assert compute_level(249, DEFAULT_CURVE) == 2

    def test_exactly_at_level_5(self):
        assert compute_level(812, DEFAULT_CURVE) == 5

    def test_just_below_level_5(self):
        assert compute_level(811, DEFAULT_CURVE) == 4

    def test_max_level_capped(self):
        tiny = LevelCurve(base_xp=1, scaling_factor=1.0, max_level=5)
        # With base_xp=1 and flat scaling, we'd level infinitely — should cap at 5
        assert compute_level(1_000_000, tiny) == 5

    def test_single_level_curve(self):
        single = LevelCurve(max_level=1)
        assert compute_level(10_000, single) == 1

    def test_negative_xp_treated_as_zero(self):
        # Negative total_xp: the loop never executes, so level=1
        assert compute_level(-50, DEFAULT_CURVE) == 1

    def test_consistent_with_cumulative(self):
        """compute_level(cumulative(N)) == N for all N up to 10."""
        for level in range(1, 11):
            xp = cumulative_xp_for_level(level, DEFAULT_CURVE)
            assert compute_level(xp, DEFAULT_CURVE) == level


# ---------------------------------------------------------------------------
# xp_to_next_level
# ---------------------------------------------------------------------------


class TestXpToNextLevel:
    def test_from_level_1_zero_xp(self):
        assert xp_to_next_level(0, DEFAULT_CURVE) == 100

    def test_mid_level(self):
        assert xp_to_next_level(50, DEFAULT_CURVE) == 50

    def test_exactly_at_boundary(self):
        # At exactly level 2 (100 XP): need 150 more for level 3
        assert xp_to_next_level(100, DEFAULT_CURVE) == 150

    def test_at_max_level_returns_zero(self):
        tiny = LevelCurve(base_xp=1, scaling_factor=1.0, max_level=2)
        assert xp_to_next_level(1_000, tiny) == 0

    def test_one_xp_below_next_level(self):
        assert xp_to_next_level(99, DEFAULT_CURVE) == 1


# ---------------------------------------------------------------------------
# apply_xp
# ---------------------------------------------------------------------------


class TestApplyXp:
    def test_xp_added_to_total(self):
        progress = UserProgress()
        new_p, _ = apply_xp(progress, _event(10, "k1"), DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 10

    def test_dedup_key_recorded(self):
        progress = UserProgress()
        new_p, _ = apply_xp(progress, _event(10, "k1"), DEFAULT_CURVE, TODAY)
        assert "k1" in new_p.applied_dedup_keys

    def test_level_updated_after_threshold(self):
        progress = UserProgress()
        new_p, _ = apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert new_p.level == 2

    def test_level_unchanged_below_threshold(self):
        progress = UserProgress()
        new_p, _ = apply_xp(progress, _event(50, "k1"), DEFAULT_CURVE, TODAY)
        assert new_p.level == 1

    def test_no_level_event_below_threshold(self):
        progress = UserProgress()
        _, events = apply_xp(progress, _event(50, "k1"), DEFAULT_CURVE, TODAY)
        assert events == ()

    def test_level_event_emitted_on_level_up(self):
        progress = UserProgress()
        _, events = apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert len(events) == 1
        assert events[0].new_level == 2
        assert events[0].date == TODAY
        assert events[0].xp_at_level_up == 100

    def test_multi_level_jump_emits_all_events(self):
        """A single large grant crossing two boundaries emits two LevelEvents."""
        # Need 100 + 150 = 250 XP to reach level 3; grant 250 in one shot
        progress = UserProgress()
        _, events = apply_xp(progress, _event(250, "k1"), DEFAULT_CURVE, TODAY)
        assert len(events) == 2
        assert events[0].new_level == 2
        assert events[1].new_level == 3

    def test_multi_level_events_in_ascending_order(self):
        progress = UserProgress()
        _, events = apply_xp(progress, _event(812, "k1"), DEFAULT_CURVE, TODAY)
        levels = [e.new_level for e in events]
        assert levels == sorted(levels)

    def test_dedup_same_key_returns_original(self):
        progress = UserProgress()
        p1, _ = apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        p2, events = apply_xp(p1, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert p2.total_xp == p1.total_xp
        assert p2.level == p1.level
        assert events == ()

    def test_dedup_same_key_no_duplicate_key_entry(self):
        progress = UserProgress()
        p1, _ = apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        p2, _ = apply_xp(p1, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert p2.applied_dedup_keys == p1.applied_dedup_keys

    def test_different_keys_both_applied(self):
        progress = UserProgress()
        p1, _ = apply_xp(progress, _event(50, "k1"), DEFAULT_CURVE, TODAY)
        p2, _ = apply_xp(p1, _event(50, "k2"), DEFAULT_CURVE, TODAY)
        assert p2.total_xp == 100
        assert "k1" in p2.applied_dedup_keys
        assert "k2" in p2.applied_dedup_keys

    def test_original_progress_not_mutated(self):
        progress = UserProgress()
        apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert progress.total_xp == 0
        assert progress.level == 1
        assert progress.applied_dedup_keys == frozenset()

    def test_zero_amount_event_applied_but_no_level_up(self):
        progress = UserProgress()
        new_p, events = apply_xp(progress, _event(0, "k1"), DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 0
        assert events == ()
        assert "k1" in new_p.applied_dedup_keys

    def test_event_reaching_exactly_max_level(self):
        tiny = LevelCurve(base_xp=10, scaling_factor=1.0, max_level=3)
        progress = UserProgress()
        # Need 10 (level 2) + 10 (level 3) = 20 XP
        new_p, events = apply_xp(progress, _event(20, "k1"), tiny, TODAY)
        assert new_p.level == 3
        assert len(events) == 2

    def test_inconsistent_progress_level_is_corrected(self):
        """apply_xp recomputes level from total_xp, not from .level field."""
        # total_xp=200 → should be level 2 but .level is wrong
        bad_progress = UserProgress(total_xp=200, level=99)
        new_p, _ = apply_xp(bad_progress, _event(10, "k1"), DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 210
        assert new_p.level == compute_level(210, DEFAULT_CURVE)


# ---------------------------------------------------------------------------
# apply_xp_batch
# ---------------------------------------------------------------------------


class TestApplyXpBatch:
    def test_empty_batch_returns_original(self):
        progress = UserProgress()
        new_p, events = apply_xp_batch(progress, [], DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 0
        assert events == ()

    def test_single_event_same_as_apply_xp(self):
        progress = UserProgress()
        batch_p, batch_ev = apply_xp_batch(
            progress, [_event(100, "k1")], DEFAULT_CURVE, TODAY
        )
        single_p, single_ev = apply_xp(progress, _event(100, "k1"), DEFAULT_CURVE, TODAY)
        assert batch_p.total_xp == single_p.total_xp
        assert batch_p.level == single_p.level
        assert batch_ev == single_ev

    def test_sequential_accumulation(self):
        events = [_event(50, "k1"), _event(50, "k2"), _event(50, "k3")]
        progress = UserProgress()
        new_p, _ = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 150
        assert new_p.level == 2

    def test_all_keys_recorded(self):
        events = [_event(10, "k1"), _event(10, "k2"), _event(10, "k3")]
        progress = UserProgress()
        new_p, _ = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        assert new_p.applied_dedup_keys == {"k1", "k2", "k3"}

    def test_duplicate_key_in_batch_ignored(self):
        events = [_event(100, "k1"), _event(100, "k1"), _event(100, "k1")]
        progress = UserProgress()
        new_p, events_out = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == 100  # only applied once
        assert len(events_out) == 1   # one level-up

    def test_level_events_in_order(self):
        events = [
            _event(100, "k1"),  # → level 2
            _event(150, "k2"),  # → level 3
            _event(225, "k3"),  # → level 4
        ]
        progress = UserProgress()
        _, level_events = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        levels = [e.new_level for e in level_events]
        assert levels == [2, 3, 4]

    def test_multi_level_jump_within_batch(self):
        events = [_event(812, "k1")]  # jumps to level 5
        progress = UserProgress()
        _, level_events = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        assert len(level_events) == 4  # levels 2, 3, 4, 5

    def test_original_not_mutated(self):
        progress = UserProgress()
        apply_xp_batch(progress, [_event(200, "k1")], DEFAULT_CURVE, TODAY)
        assert progress.total_xp == 0

    def test_mixed_sources_accumulate(self):
        """One event per XP source type; all should accumulate correctly."""
        events = [
            XPEvent(source="correct_answer", amount=XP_CORRECT_ANSWER,
                    dedup_key="ca", date=TODAY),
            XPEvent(source="streak_bonus", amount=XP_STREAK_BONUS,
                    dedup_key="sb", date=TODAY),
            XPEvent(source="mastery_milestone", amount=XP_MASTERY_MILESTONE,
                    dedup_key="mm", date=TODAY),
            XPEvent(source="daily_completion", amount=XP_DAILY_COMPLETION,
                    dedup_key="dc", date=TODAY),
            XPEvent(source="feature_unlock_bonus", amount=XP_FEATURE_UNLOCK_BONUS,
                    dedup_key="fu", date=TODAY),
        ]
        expected_total = (
            XP_CORRECT_ANSWER + XP_STREAK_BONUS + XP_MASTERY_MILESTONE
            + XP_DAILY_COMPLETION + XP_FEATURE_UNLOCK_BONUS
        )
        progress = UserProgress()
        new_p, _ = apply_xp_batch(progress, events, DEFAULT_CURVE, TODAY)
        assert new_p.total_xp == expected_total


# ---------------------------------------------------------------------------
# LevelCurve variants
# ---------------------------------------------------------------------------


class TestLevelCurveVariants:
    def test_flat_curve_linear_levels(self):
        flat = LevelCurve(base_xp=50, scaling_factor=1.0, max_level=20)
        # Every level requires 50 XP
        assert compute_level(49, flat) == 1
        assert compute_level(50, flat) == 2
        assert compute_level(99, flat) == 2
        assert compute_level(100, flat) == 3
        assert compute_level(950, flat) == 20  # capped
        assert compute_level(10_000, flat) == 20

    def test_steep_curve(self):
        steep = LevelCurve(base_xp=10, scaling_factor=3.0, max_level=5)
        # Level 1→2: 10 XP
        # Level 2→3: 30 XP (cumulative: 40)
        # Level 3→4: 90 XP (cumulative: 130)
        assert compute_level(9, steep) == 1
        assert compute_level(10, steep) == 2
        assert compute_level(39, steep) == 2
        assert compute_level(40, steep) == 3

    def test_single_max_level_always_returns_1(self):
        single = LevelCurve(max_level=1)
        for xp in [0, 100, 10_000, 1_000_000]:
            assert compute_level(xp, single) == 1


# ---------------------------------------------------------------------------
# Standard XP constants sanity checks
# ---------------------------------------------------------------------------


class TestXpConstants:
    def test_all_positive(self):
        for val in (
            XP_CORRECT_ANSWER,
            XP_STREAK_BONUS,
            XP_MASTERY_MILESTONE,
            XP_DAILY_COMPLETION,
            XP_FEATURE_UNLOCK_BONUS,
        ):
            assert val > 0

    def test_relative_ordering(self):
        # Milestones and completions should be worth more than single answers
        assert XP_MASTERY_MILESTONE > XP_CORRECT_ANSWER
        assert XP_DAILY_COMPLETION > XP_CORRECT_ANSWER
        assert XP_FEATURE_UNLOCK_BONUS > XP_CORRECT_ANSWER
