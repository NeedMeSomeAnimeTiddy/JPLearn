"""Pure functions for XP accumulation and level computation.

All functions are deterministic and side-effect free.
Time (``today``) is always injected by the caller — never read internally.

Level curve arithmetic uses iterative integer steps identical to the
``compute_level`` loop so all functions produce consistent results.
"""
from __future__ import annotations

from datetime import date
from typing import Sequence

from domain.xp import LevelCurve, LevelEvent, UserProgress, XPEvent


# ---------------------------------------------------------------------------
# Curve arithmetic
# ---------------------------------------------------------------------------


def xp_for_level_up(level: int, curve: LevelCurve) -> int:
    """XP required to advance from *level* to *level* + 1.

    Uses the same iterative formula as :func:`compute_level` to guarantee
    consistent boundaries.

    Raises:
        ValueError: If *level* < 1.
    """
    if level < 1:
        raise ValueError("level must be >= 1")
    threshold = curve.base_xp
    for _ in range(level - 1):
        threshold = max(1, int(threshold * curve.scaling_factor))
    return threshold


def cumulative_xp_for_level(level: int, curve: LevelCurve) -> int:
    """Total XP required to reach *level* from level 1.

    Returns 0 for level 1 (no XP required to start there).
    """
    if level <= 1:
        return 0
    total = 0
    threshold = curve.base_xp
    for _ in range(level - 1):
        total += threshold
        threshold = max(1, int(threshold * curve.scaling_factor))
    return total


def compute_level(total_xp: int, curve: LevelCurve) -> int:
    """Derive the current level from accumulated XP and the curve.

    Iterates through level thresholds until the remaining XP falls below
    the next requirement, then returns the reached level.  Capped at
    ``curve.max_level``.
    """
    level = 1
    xp_remaining = total_xp
    threshold = curve.base_xp
    while level < curve.max_level:
        if xp_remaining < threshold:
            break
        xp_remaining -= threshold
        level += 1
        threshold = max(1, int(threshold * curve.scaling_factor))
    return level


def xp_to_next_level(total_xp: int, curve: LevelCurve) -> int:
    """XP still needed to reach the next level.

    Returns 0 if already at ``curve.max_level``.
    """
    current = compute_level(total_xp, curve)
    if current >= curve.max_level:
        return 0
    return cumulative_xp_for_level(current + 1, curve) - total_xp


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


def apply_xp(
    progress: UserProgress,
    event: XPEvent,
    curve: LevelCurve,
    today: date,
) -> tuple[UserProgress, tuple[LevelEvent, ...]]:
    """Apply one XP event to *progress*, emitting level-up events if needed.

    Deduplication: if ``event.dedup_key`` is already recorded in
    ``progress.applied_dedup_keys``, the function returns the original
    progress unchanged and emits no events.

    Level-up events are emitted for every level boundary crossed, in ascending
    order.  If the event is large enough to cross multiple boundaries at once,
    all intermediate levels emit their own :class:`~domain.xp.LevelEvent`.

    The old level is always recomputed from ``progress.total_xp`` rather than
    trusting ``progress.level``, making the function robust against manually
    constructed :class:`~domain.xp.UserProgress` instances.

    Args:
        progress: Current learner state.
        event: XP grant to apply.
        curve: Level curve governing thresholds.
        today: Caller-supplied date (injected; never read internally).

    Returns:
        ``(new_progress, level_events)`` — if no level-up occurred,
        ``level_events`` is an empty tuple.
    """
    if event.dedup_key in progress.applied_dedup_keys:
        return progress, ()

    old_level = compute_level(progress.total_xp, curve)
    new_total = progress.total_xp + event.amount
    new_level = compute_level(new_total, curve)

    level_events: tuple[LevelEvent, ...] = tuple(
        LevelEvent(new_level=lv, date=today, xp_at_level_up=new_total)
        for lv in range(old_level + 1, new_level + 1)
    )

    new_progress = UserProgress(
        total_xp=new_total,
        level=new_level,
        applied_dedup_keys=frozenset({*progress.applied_dedup_keys, event.dedup_key}),
    )

    return new_progress, level_events


def apply_xp_batch(
    progress: UserProgress,
    events: Sequence[XPEvent],
    curve: LevelCurve,
    today: date,
) -> tuple[UserProgress, tuple[LevelEvent, ...]]:
    """Apply multiple XP events in sequence.

    Each event is passed through :func:`apply_xp` individually so that
    deduplication is applied per-event.  Duplicate ``dedup_key`` values within
    the batch are silently ignored after the first occurrence.

    Args:
        progress: Starting learner state.
        events: Events to apply in order.
        curve: Level curve governing thresholds.
        today: Caller-supplied date (injected; never read internally).

    Returns:
        ``(final_progress, all_level_events)`` — level events from all
        individual applications, in the order they were emitted.
    """
    current = progress
    all_level_events: list[LevelEvent] = []
    for event in events:
        current, level_events = apply_xp(current, event, curve, today)
        all_level_events.extend(level_events)
    return current, tuple(all_level_events)
