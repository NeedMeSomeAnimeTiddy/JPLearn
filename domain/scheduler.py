"""FSRS (Free Spaced Repetition Scheduler) spaced repetition scheduler.

Implements the FSRS v4 forgetting-curve model (stability/difficulty state,
power-law retrievability, default optimizer weights) using only stdlib
primitives, per domain layer purity rules. See
https://github.com/open-spaced-repetition/awesome-fsrs for the reference
algorithm this module implements.
"""

import math
from dataclasses import dataclass, field
from datetime import date, timedelta


@dataclass
class ReviewState:
    """Mutable FSRS scheduling state for one card.

    Attributes:
        card_id: Matches :attr:`~domain.cards.Card.id` within its deck.
        ease_factor: Legacy display-compatible value derived from
            ``difficulty`` (min 1.3, max 2.8). Retained so schema/UI code that
            reads an "ease factor" keeps working; FSRS itself does not use it.
        interval: Days until the next scheduled review (derived from stability).
        repetitions: Number of reviews since the last "forgot" (Again) outcome.
        next_review: Date on which this card is next due.
        stability: FSRS memory stability in days. ``0.0`` means "never reviewed".
        difficulty: FSRS difficulty on a 1 (easiest) to 10 (hardest) scale.
            ``0.0`` means "never reviewed".
        last_review: Date this card was last reviewed, or ``None`` if never.
    """

    card_id: int
    ease_factor: float = 2.5
    interval: int = 1        # days until next review
    repetitions: int = 0
    next_review: date = field(default_factory=date.today)
    stability: float = 0.0
    difficulty: float = 0.0
    last_review: date | None = None

    def is_due(self) -> bool:
        """Return ``True`` if this card is due for review today or earlier."""
        return date.today() >= self.next_review


# Quality ratings (Anki-style, 0-5 scale kept for call-site compatibility).
AGAIN = 0
HARD = 2
GOOD = 4
EASY = 5

# Target long-term recall probability used to size the next interval.
_TARGET_RETENTION = 0.9

# Elapsed-time floor, in days, applied to a successful review that lands on the
# same calendar day as the previous one.
#
# FSRS only grows stability when time has elapsed: at elapsed_days == 0 the
# retrievability is 1, the `exp(w10 * (1 - R)) - 1` term collapses to zero, and
# the review has no effect on scheduling at all. Reference FSRS implementations
# pair the long-term model with a separate short-term scheduler (learning steps)
# for same-day repeats; this app has none, so without a floor a card drilled ten
# times in one session is scheduled exactly as if it had been answered once.
#
# Treating a same-day repeat as ~72 minutes of elapsed time routes it through
# the existing forgetting curve instead of adding a second model. The
# `stability ** -w9` damping in _next_stability then makes repeats saturate
# rather than compound, so drilling earns real but sharply diminishing credit
# and stays far below what the same number of reviews spaced across due dates
# would produce. Kept deliberately small: at this value a card needs 37
# consecutive same-day Easy answers (167 Good) to reach the `interval >= 21`
# half of the mastered rule, which puts in-session mastery out of reach.
#
# domain/fsrs_optimizer.py imports this so replayed history advances state the
# same way the live scheduler does.
SAME_DAY_ELAPSED_DAYS = 0.05

# FSRS-4.5 default optimizer weights (17 values). See
# https://github.com/open-spaced-repetition/fsrs4anki for derivation.
_DEFAULT_W: tuple[float, ...] = (
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
    0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
)

# Active weights — may be overridden via set_weights() (e.g. by the FSRS
# optimizer in domain/fsrs_optimizer.py). Module-level mutable state by design
# so existing callers are unaffected.
_W: tuple[float, ...] = _DEFAULT_W


def get_weights() -> tuple[float, ...]:
    """Return the currently active FSRS weights (custom or default)."""
    return _W


def set_weights(weights: tuple[float, ...]) -> None:
    """Override the active FSRS weights.

    Call :func:`reset_weights` to revert to the default values.
    """
    global _W
    _W = weights


def reset_weights() -> None:
    """Revert to the default FSRS-4.5 weights."""
    global _W
    _W = _DEFAULT_W

_MIN_DIFFICULTY = 1.0
_MAX_DIFFICULTY = 10.0
_MIN_EASE_FACTOR = 1.3
_MAX_EASE_FACTOR = 2.8


def _quality_to_fsrs_rating(quality: int) -> int:
    """Map the legacy 0-5 quality scale to an FSRS rating (1=Again..4=Easy).

    Anything below 3 is treated as "forgotten" (matches the historical
    threshold used by this app's quality scale, including minigame
    incorrect-answer quality=1 and the HARD=2 constant). 3/4/5 map to the
    remaining FSRS grades Hard/Good/Easy respectively.
    """
    if quality < 3:
        return 1
    if quality == 3:
        return 2
    if quality == 4:
        return 3
    return 4


def _initial_stability(rating: int) -> float:
    return max(0.1, _W[rating - 1])


def _initial_difficulty(rating: int) -> float:
    difficulty = _W[4] - (rating - 3) * _W[5]
    return min(_MAX_DIFFICULTY, max(_MIN_DIFFICULTY, difficulty))


def _next_difficulty(difficulty: float, rating: int) -> float:
    updated = difficulty - _W[6] * (rating - 3)
    reverted = _W[7] * _initial_difficulty(4) + (1 - _W[7]) * updated
    return min(_MAX_DIFFICULTY, max(_MIN_DIFFICULTY, reverted))


def _retrievability(elapsed_days: float, stability: float) -> float:
    """Power forgetting-curve: probability of recall after elapsed_days."""
    if stability <= 0:
        return 0.0
    return (1 + elapsed_days / (9 * stability)) ** -1


def _next_stability(stability: float, difficulty: float, retrievability: float, rating: int) -> float:
    if rating == 1:  # Again: forgotten, apply the post-lapse stability formula.
        return (
            _W[11]
            * (difficulty ** -_W[12])
            * (((stability + 1) ** _W[13]) - 1)
            * math.exp(_W[14] * (1 - retrievability))
        )

    stability_gain = (
        math.exp(_W[8])
        * (11 - difficulty)
        * (stability ** -_W[9])
        * (math.exp(_W[10] * (1 - retrievability)) - 1)
    )
    if rating == 2:  # Hard
        stability_gain *= _W[15]
    elif rating == 4:  # Easy
        stability_gain *= _W[16]
    return stability * (1 + stability_gain)


def _interval_for_stability(stability: float, target_retention: float = _TARGET_RETENTION) -> int:
    if stability <= 0:
        return 1
    days = 9 * stability * (1 / target_retention - 1)
    return max(1, round(days))


def _ease_factor_for_difficulty(difficulty: float) -> float:
    """Derive a legacy-compatible ease factor from FSRS difficulty (1-10)."""
    span = _MAX_EASE_FACTOR - _MIN_EASE_FACTOR
    ease = _MIN_EASE_FACTOR + (_MAX_DIFFICULTY - difficulty) * (span / (_MAX_DIFFICULTY - _MIN_DIFFICULTY))
    return round(min(_MAX_EASE_FACTOR, max(_MIN_EASE_FACTOR, ease)), 4)


def update(
    state: ReviewState,
    quality: int,
    *,
    confidence: int | None = None,
    today: date | None = None,
) -> ReviewState:
    """Apply one FSRS review. quality must be 0-5 (legacy Anki-style scale).

    confidence: optional 1-5 self-assessed confidence score. When provided,
        the effective quality is blended: round(quality * 0.7 + confidence * 0.3).
        Defaults to None (no blending; existing behaviour preserved).
    today: optional review date, injected for testability and replay. Defaults
        to :func:`datetime.date.today`.

    A successful review on the same calendar day as the previous one is scored
    against :data:`SAME_DAY_ELAPSED_DAYS` of elapsed time rather than zero, so
    in-session repeats earn diminishing credit instead of none. Lapses are
    unaffected — they already respond to same-day reviews via the post-lapse
    formula.
    """
    effective_quality = (
        round(quality * 0.7 + confidence * 0.3) if confidence is not None else quality
    )
    rating = _quality_to_fsrs_rating(effective_quality)
    review_day = today if today is not None else date.today()

    if state.stability <= 0:
        # First review for this card: seed stability/difficulty from the rating.
        state.stability = _initial_stability(rating)
        state.difficulty = _initial_difficulty(rating)
    else:
        elapsed_days = float(max(0, (review_day - (state.last_review or review_day)).days))
        if rating != 1:
            elapsed_days = max(SAME_DAY_ELAPSED_DAYS, elapsed_days)
        retrievability = _retrievability(elapsed_days, state.stability)
        state.stability = max(
            0.1, _next_stability(state.stability, state.difficulty, retrievability, rating)
        )
        state.difficulty = _next_difficulty(state.difficulty, rating)

    state.repetitions = 0 if rating == 1 else state.repetitions + 1
    state.interval = _interval_for_stability(state.stability)
    state.ease_factor = _ease_factor_for_difficulty(state.difficulty)
    state.last_review = review_day
    state.next_review = review_day + timedelta(days=state.interval)
    return state
