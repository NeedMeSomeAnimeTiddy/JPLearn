"""XP and leveling system domain models.

A meta-progression layer that rewards learning activity with XP and levels.
It does NOT unlock content or replace the progression or feature unlock systems.

Domain rules:
- All dataclasses are frozen (value objects).
- No XP grants are applied automatically; callers drive all events.
- Reproducibility: the same sequence of XPEvents always produces the same
  UserProgress regardless of wall-clock time.
- No UI, database, or file I/O.
- Time is always injected by the caller.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

XPSource = Literal[
    "correct_answer",
    "streak_bonus",
    "mastery_milestone",
    "daily_completion",
    "feature_unlock_bonus",
]


# ---------------------------------------------------------------------------
# Standard XP amounts
# ---------------------------------------------------------------------------

#: XP granted for a correct answer during a review.
XP_CORRECT_ANSWER: int = 10
#: XP granted for a daily streak bonus.
XP_STREAK_BONUS: int = 25
#: XP granted when a learning node reaches mastery.
XP_MASTERY_MILESTONE: int = 100
#: XP granted for completing a full daily session.
XP_DAILY_COMPLETION: int = 50
#: XP granted when a feature is first unlocked.
XP_FEATURE_UNLOCK_BONUS: int = 75


# ---------------------------------------------------------------------------
# Level curve
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LevelCurve:
    """Defines the XP required to advance between levels.

    The XP needed to advance from level N to level N+1 uses iterative scaling:

    .. code-block::

        threshold(1) = base_xp
        threshold(N) = max(1, floor(threshold(N-1) * scaling_factor))

    This ensures results are identical whether computed via
    :func:`~domain.level_service.xp_for_level_up` or the step-by-step
    loop inside :func:`~domain.level_service.compute_level`.

    Attributes:
        base_xp: XP to advance from level 1 to level 2.  Must be >= 1.
        scaling_factor: Multiplier applied to each successive threshold.
            Must be >= 1.0 so levels always require more XP as they increase.
        max_level: Hard cap on the highest attainable level.
    """

    base_xp: int = 100
    scaling_factor: float = 1.5
    max_level: int = 100

    def __post_init__(self) -> None:
        if self.base_xp < 1:
            raise ValueError("base_xp must be >= 1")
        if self.scaling_factor < 1.0:
            raise ValueError("scaling_factor must be >= 1.0")
        if self.max_level < 1:
            raise ValueError("max_level must be >= 1")


#: Default level curve for JPLearn.
DEFAULT_CURVE: LevelCurve = LevelCurve()


# ---------------------------------------------------------------------------
# XP event
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class XPEvent:
    """A single XP grant to be applied to :class:`UserProgress`.

    Attributes:
        source: Category of activity that earned the XP.
        amount: XP to grant.  Callers may override the standard amount for
            bonus or partial grants.
        dedup_key: Unique key preventing this event from being applied twice.
            Callers construct a meaningful key, for example:
            ``"correct:card_42:2026-01-01"`` or ``"mastery:hiragana"``.
        date: Caller-supplied date of the event.
        context: Optional machine-readable context (node_id, feature_id, etc.).
    """

    source: XPSource
    amount: int
    dedup_key: str
    date: date
    context: str = ""


# ---------------------------------------------------------------------------
# User progress
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class UserProgress:
    """Immutable snapshot of a learner's XP and level state.

    ``level`` is always consistent with ``total_xp`` when this object is
    produced by :func:`~domain.level_service.apply_xp` or
    :func:`~domain.level_service.apply_xp_batch`.  Manually constructed
    instances with inconsistent ``total_xp``/``level`` are handled gracefully
    by the service (it recomputes from ``total_xp``).

    Attributes:
        total_xp: Cumulative XP earned across all applied events.
        level: Current level derived from ``total_xp`` at the time this
            progress snapshot was created.
        applied_dedup_keys: Immutable set of dedup_keys already applied.
            Prevents double-counting.
    """

    total_xp: int = 0
    level: int = 1
    applied_dedup_keys: frozenset[str] = field(default_factory=frozenset)


# ---------------------------------------------------------------------------
# Level event
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LevelEvent:
    """Emitted when the learner advances to a new level.

    Attributes:
        new_level: The level just reached.
        date: Caller-supplied date of the level-up.
        xp_at_level_up: Total XP at the moment this level was reached.
    """

    new_level: int
    date: date
    xp_at_level_up: int
