"""Pure SRS state-transition logic (SM-2 variant)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


# -----------------------------
# Domain input state
# -----------------------------
@dataclass(frozen=True)
class SRSState:
    """Immutable snapshot of a card's SRS scheduling parameters.

    Attributes:
        last_interval: Days of the most recent review interval.
        ease_factor: Multiplier controlling interval growth. Min 1.3, max 2.8.
    """

    last_interval: int
    ease_factor: float


# -----------------------------
# Domain output state
# -----------------------------
@dataclass(frozen=True)
class SRSResult:
    """Immutable output of one SRS update step.

    Attributes:
        next_interval: Computed days until the next review.
        new_ease_factor: Updated ease factor after applying performance score.
    """

    next_interval: int
    new_ease_factor: float


@dataclass(frozen=True)
class SRSSettings:
    """User-tunable settings for interval sizing.

    Attributes:
        target_retention: Expected long-term recall target.
            Higher values produce shorter intervals.
        review_load: Desired daily workload profile.
            ``"light"`` lowers daily pressure, ``"heavy"`` increases it.
    """

    target_retention: float = 0.9
    review_load: Literal["light", "normal", "heavy"] = "normal"


def _retention_multiplier(target_retention: float) -> float:
    if not 0.7 <= target_retention <= 0.99:
        raise ValueError("target_retention must be between 0.70 and 0.99")
    # 0.90 is baseline; higher target recall means tighter review spacing.
    return 0.9 / target_retention


def _load_multiplier(review_load: Literal["light", "normal", "heavy"]) -> float:
    if review_load == "light":
        return 1.15
    if review_load == "normal":
        return 1.0
    if review_load == "heavy":
        return 0.9
    raise ValueError("review_load must be one of: light, normal, heavy")


# -----------------------------
# Core deterministic rule
# -----------------------------
def update_srs(
    state: SRSState,
    performance: int,
    settings: SRSSettings = SRSSettings(),
) -> SRSResult:
    """
    Pure deterministic SRS update.

    performance: 0–5 scale (or your chosen rubric)
    """

    li = state.last_interval
    ef = state.ease_factor

    # -----------------------------
    # Interval logic (simple spaced repetition growth model)
    # -----------------------------
    if performance <= 1:
        next_interval = 1
    elif performance == 2:
        next_interval = max(1, li)
    else:
        interval_multiplier = _retention_multiplier(settings.target_retention) * _load_multiplier(
            settings.review_load
        )
        next_interval = max(1, int(li * ef * interval_multiplier))

    # -----------------------------
    # Ease factor adjustment (deterministic)
    # -----------------------------
    if performance >= 4:
        new_ef = ef + 0.1
    elif performance == 3:
        new_ef = ef
    else:
        new_ef = ef - 0.2

    # clamp (important for stability)
    new_ef = max(1.3, min(new_ef, 2.8))

    return SRSResult(
        next_interval=next_interval,
        new_ease_factor=new_ef,
    )