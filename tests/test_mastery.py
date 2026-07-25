"""Tests for the per-card mastery counter (issue #66)."""

import pytest

from domain.mastery import (
    CARD_MASTERY_MAX,
    clamp_card_score,
    is_card_mastered,
    next_card_score,
)


def test_correct_answer_steps_up_one() -> None:
    assert next_card_score(0, is_correct=True) == 1
    assert next_card_score(2, is_correct=True) == 3


def test_wrong_answer_steps_down_one() -> None:
    assert next_card_score(3, is_correct=False) == 2
    assert next_card_score(1, is_correct=False) == 0


def test_score_is_capped_at_the_maximum() -> None:
    assert next_card_score(CARD_MASTERY_MAX, is_correct=True) == CARD_MASTERY_MAX


def test_score_is_floored_at_zero() -> None:
    assert next_card_score(0, is_correct=False) == 0


def test_four_correct_answers_reach_mastery_from_scratch() -> None:
    """The in-session progression the counter exists to provide.

    FSRS cannot express this: six correct answers in one day leave ``interval``
    pinned at 6, so a bar derived from scheduling state would not move at all
    during a session. See the module docstring in ``domain/mastery.py``.
    """
    score = 0
    for _ in range(CARD_MASTERY_MAX):
        score = next_card_score(score, is_correct=True)
    assert score == CARD_MASTERY_MAX
    assert is_card_mastered(score)


def test_a_single_lapse_costs_one_step_not_everything() -> None:
    """Contrast with FSRS ``repetitions``, which resets to 0 on any Again rating."""
    assert next_card_score(CARD_MASTERY_MAX, is_correct=False) == CARD_MASTERY_MAX - 1


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(-5, 0), (-1, 0), (0, 0), (2, 2), (4, 4), (9, 4)],
)
def test_out_of_range_scores_are_clamped(raw: int, expected: int) -> None:
    assert clamp_card_score(raw) == expected


@pytest.mark.parametrize("raw", [-3, 99])
def test_out_of_range_input_cannot_escape_the_scale(raw: int) -> None:
    """A legacy or corrupted stored value must not step outside 0..MAX."""
    assert 0 <= next_card_score(raw, is_correct=True) <= CARD_MASTERY_MAX
    assert 0 <= next_card_score(raw, is_correct=False) <= CARD_MASTERY_MAX


def test_mastered_only_at_the_top_of_the_scale() -> None:
    assert not is_card_mastered(CARD_MASTERY_MAX - 1)
    assert is_card_mastered(CARD_MASTERY_MAX)
    assert is_card_mastered(CARD_MASTERY_MAX + 10)
