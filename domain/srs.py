from __future__ import annotations

from dataclasses import dataclass


# -----------------------------
# Domain input state
# -----------------------------
@dataclass(frozen=True)
class SRSState:
    last_interval: int
    ease_factor: float


# -----------------------------
# Domain output state
# -----------------------------
@dataclass(frozen=True)
class SRSResult:
    next_interval: int
    new_ease_factor: float


# -----------------------------
# Core deterministic rule
# -----------------------------
def update_srs(
    state: SRSState,
    performance: int,
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
        next_interval = max(1, int(li * ef))

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