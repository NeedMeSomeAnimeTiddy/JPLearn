"""FSRS weight optimizer — finds personalized weights from review history.

Pure domain-logic module: takes review logs as input, returns optimized weights
via gradient descent on the binary cross-entropy loss. No I/O, no DB, no UI.

FSRS formulas are duplicated from :mod:`domain.scheduler` rather than imported
so the optimizer can evaluate candidate weight sets without side effects.
"""

from __future__ import annotations

import math
from typing import TypedDict

# The one value that is imported rather than duplicated: it is a plain constant
# with none of the module-global weight state the duplication above avoids, and
# the optimizer must advance replayed state exactly as the live scheduler does
# or it fits weights against a model that is not the one scheduling cards.
from domain.scheduler import SAME_DAY_ELAPSED_DAYS


class ReviewLog(TypedDict):
    """One review event within a card's sequence.

    Attributes:
        quality: Legacy quality score (0-5).
        elapsed_days: Days since the previous review for this card.
            ``0`` for the first-ever review.
    """

    quality: int
    elapsed_days: int


class CardReviewSequence(TypedDict):
    """Ordered review history for one card.

    Attributes:
        card_id: Card identifier within its deck.
        deck: Deck name (for diagnostic purposes).
        logs: Review events in chronological order.
    """

    card_id: int
    deck: str
    logs: list[ReviewLog]


# FSRS-4.5 default weights (17 values).
DEFAULT_WEIGHTS: tuple[float, ...] = (
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
    0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
)

# Parameter lower/upper bounds for the 17 weights.
PARAM_BOUNDS: tuple[tuple[float, float], ...] = (
    (0.01, 1.0),    # 0: initial stability for Again
    (0.01, 2.0),    # 1: initial stability for Hard
    (0.01, 5.0),    # 2: initial stability for Good
    (0.1, 15.0),    # 3: initial stability for Easy
    (1.0, 10.0),    # 4: initial difficulty offset
    (0.1, 4.0),     # 5: initial difficulty slope
    (0.01, 1.0),    # 6: next-difficulty decrement
    (0.0, 0.5),     # 7: difficulty reversion weight
    (0.01, 4.0),    # 8: stability multiplier (exp)
    (0.01, 0.75),   # 9: stability exponent
    (0.01, 2.5),    # 10: retrievability boost
    (0.1, 5.0),     # 11: post-lapse stability multiplier
    (0.01, 1.0),    # 12: post-lapse difficulty exponent
    (0.01, 1.0),    # 13: post-lapse stability increment
    (0.01, 3.0),    # 14: post-lapse retrievability factor
    (0.0, 1.0),     # 15: hard-penalty multiplier
    (1.0, 6.0),     # 16: easy-bonus multiplier
)

_MIN_D = 1.0
_MAX_D = 10.0
_EPS_R = 1e-4


def _rating(quality: int) -> int:
    """Map legacy quality 0-5 to FSRS rating 1-4."""
    if quality < 3:
        return 1
    if quality == 3:
        return 2
    if quality == 4:
        return 3
    return 4


def _init_stability(w: tuple[float, ...], rating: int) -> float:
    return max(0.1, w[rating - 1])


def _init_difficulty(w: tuple[float, ...], rating: int) -> float:
    d = w[4] - (rating - 3) * w[5]
    return min(_MAX_D, max(_MIN_D, d))


def _next_difficulty(w: tuple[float, ...], d: float, rating: int) -> float:
    updated = d - w[6] * (rating - 3)
    reverted = w[7] * _init_difficulty(w, 4) + (1 - w[7]) * updated
    return min(_MAX_D, max(_MIN_D, reverted))


def _retrievability(elapsed_days: float, stability: float) -> float:
    if stability <= 0:
        return 0.0
    return (1 + elapsed_days / (9 * stability)) ** -1


def _next_stability(
    w: tuple[float, ...],
    stability: float,
    difficulty: float,
    retrievability: float,
    rating: int,
) -> float:
    if rating == 1:
        return (
            w[11]
            * (difficulty ** -w[12])
            * (((stability + 1) ** w[13]) - 1)
            * math.exp(w[14] * (1 - retrievability))
        )
    gain = (
        math.exp(w[8])
        * (11 - difficulty)
        * (stability ** -w[9])
        * (math.exp(w[10] * (1 - retrievability)) - 1)
    )
    if rating == 2:
        gain *= w[15]
    elif rating == 4:
        gain *= w[16]
    return stability * (1 + gain)


def compute_loss(
    weights: tuple[float, ...],
    sequences: list[CardReviewSequence],
) -> float:
    """Mean binary cross-entropy loss over all review sequences.

    For each review of a card, computes the predicted recall probability
    from the elapsed time and prior stability, then compares to the actual
    binary outcome (recalled = rating > 1, forgotten = rating == 1).

    The first review of each card contributes no loss (no prior state).
    """
    total_loss = 0.0
    count = 0
    for seq in sequences:
        stability = 0.0
        difficulty = 0.0
        for log in seq["logs"]:
            r = _rating(log["quality"])
            elapsed = float(log["elapsed_days"])
            if stability > 0:
                r_pred = _retrievability(elapsed, stability)
                r_pred = max(_EPS_R, min(1.0 - _EPS_R, r_pred))
                y = 1.0 if r > 1 else 0.0
                total_loss += -(y * math.log(r_pred) + (1 - y) * math.log(1 - r_pred))
                count += 1
            if stability <= 0:
                stability = _init_stability(weights, r)
                difficulty = _init_difficulty(weights, r)
            else:
                # Mirror the scheduler's same-day floor so replayed state
                # advances the way the live scheduler would. The loss term
                # above deliberately keeps the raw elapsed time: it scores a
                # prediction about actual recall, and is already guarded
                # against the degenerate elapsed == 0 case by _EPS_R.
                elapsed_for_update = (
                    max(SAME_DAY_ELAPSED_DAYS, elapsed) if r > 1 else elapsed
                )
                r_for_update = _retrievability(elapsed_for_update, stability)
                stability = max(0.1, _next_stability(weights, stability, difficulty, r_for_update, r))
                difficulty = _next_difficulty(weights, difficulty, r)
    return total_loss / max(1, count)


def optimize_weights(
    initial: tuple[float, ...],
    sequences: list[CardReviewSequence],
    iterations: int = 200,
    learning_rate: float = 0.01,
    momentum: float = 0.9,
) -> tuple[float, ...]:
    """Gradient descent with momentum and forward-difference numerical gradients.

    Uses forward finite differences (one evaluation per parameter) for speed,
    momentum-accelerated gradient descent with parameter bounds clamping,
    and early stopping when the gradient norm drops below a threshold.

    Args:
        initial: Starting weights (typically :data:`DEFAULT_WEIGHTS`).
        sequences: Card review histories to train on.
        iterations: Max gradient descent steps.
        learning_rate: Step size for each weight update.
        momentum: Velocity retention factor (0 = no momentum).

    Returns:
        Optimized 17-value weight tuple.
    """
    w = list(initial)
    velocity = [0.0] * 17
    epsilon = 1e-5
    best_loss = float("inf")
    best_weights = tuple(w)
    patience = max(10, iterations // 10)
    stale = 0

    base_loss = compute_loss(tuple(w), sequences)

    for _ in range(iterations):
        grad = [0.0] * 17
        for i in range(17):
            w_plus = list(w)
            w_plus[i] += epsilon
            l_plus = compute_loss(tuple(w_plus), sequences)
            grad[i] = (l_plus - base_loss) / epsilon

        grad_norm = math.sqrt(sum(g * g for g in grad))
        if grad_norm < 1e-7:
            break

        for i in range(17):
            velocity[i] = momentum * velocity[i] - learning_rate * grad[i]
            w[i] += velocity[i]
            low, high = PARAM_BOUNDS[i]
            w[i] = max(low, min(high, w[i]))

        base_loss = compute_loss(tuple(w), sequences)
        if base_loss < best_loss:
            best_loss = base_loss
            best_weights = tuple(w)
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break

    return best_weights
