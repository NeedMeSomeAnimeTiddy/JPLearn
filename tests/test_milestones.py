from domain.milestones import (
    REVIEW_COUNT_MILESTONES,
    STREAK_MILESTONES,
    earned_review_milestones,
    earned_streak_milestones,
    milestone_descriptor,
    newly_crossed_review_milestones,
    newly_crossed_streak_milestones,
    streak_milestone_descriptor,
)


def test_milestone_descriptor_format() -> None:
    assert milestone_descriptor(100) == "reviews_100"


def test_earned_review_milestones_below_first_threshold() -> None:
    assert earned_review_milestones(0) == ()
    assert earned_review_milestones(99) == ()


def test_earned_review_milestones_at_and_above_thresholds() -> None:
    assert earned_review_milestones(100) == ("reviews_100",)
    assert earned_review_milestones(499) == ("reviews_100",)
    assert earned_review_milestones(500) == ("reviews_100", "reviews_500")
    assert earned_review_milestones(1000) == ("reviews_100", "reviews_500", "reviews_1000")
    assert earned_review_milestones(5000) == ("reviews_100", "reviews_500", "reviews_1000")


def test_earned_review_milestones_covers_all_defined_thresholds() -> None:
    assert earned_review_milestones(10_000) == tuple(
        milestone_descriptor(t) for t in REVIEW_COUNT_MILESTONES
    )


def test_newly_crossed_review_milestones_no_crossing() -> None:
    assert newly_crossed_review_milestones(50, 99) == ()
    assert newly_crossed_review_milestones(150, 200) == ()


def test_newly_crossed_review_milestones_single_crossing() -> None:
    assert newly_crossed_review_milestones(99, 100) == ("reviews_100",)


def test_newly_crossed_review_milestones_skips_multiple_at_once() -> None:
    # e.g. imported history or a batch catch-up jumping past several thresholds
    assert newly_crossed_review_milestones(0, 1000) == ("reviews_100", "reviews_500", "reviews_1000")


def test_newly_crossed_review_milestones_exact_boundary() -> None:
    assert newly_crossed_review_milestones(499, 500) == ("reviews_500",)
    assert newly_crossed_review_milestones(500, 500) == ()


def test_streak_milestone_descriptor_format() -> None:
    assert streak_milestone_descriptor(7) == "streak_7"


def test_earned_streak_milestones_below_first_threshold() -> None:
    assert earned_streak_milestones(0) == ()
    assert earned_streak_milestones(2) == ()


def test_earned_streak_milestones_at_and_above_thresholds() -> None:
    assert earned_streak_milestones(3) == ("streak_3",)
    assert earned_streak_milestones(7) == ("streak_3", "streak_7")
    assert earned_streak_milestones(30) == ("streak_3", "streak_7", "streak_14", "streak_30")
    assert earned_streak_milestones(365) == tuple(
        streak_milestone_descriptor(t) for t in STREAK_MILESTONES
    )


def test_newly_crossed_streak_milestones_no_crossing() -> None:
    assert newly_crossed_streak_milestones(1, 2) == ()
    assert newly_crossed_streak_milestones(10, 13) == ()


def test_newly_crossed_streak_milestones_single_crossing() -> None:
    assert newly_crossed_streak_milestones(2, 3) == ("streak_3",)


def test_newly_crossed_streak_milestones_skips_multiple_at_once() -> None:
    assert newly_crossed_streak_milestones(0, 30) == ("streak_3", "streak_7", "streak_14", "streak_30")


def test_newly_crossed_streak_milestones_same_value_is_not_a_crossing() -> None:
    assert newly_crossed_streak_milestones(7, 7) == ()
