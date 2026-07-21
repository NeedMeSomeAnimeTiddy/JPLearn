"""Deterministic review-count milestone badge logic.

Domain rules:
- Pure functions; totals and thresholds are always injected by the caller.
- No XP, no database access, no UI.
- Milestones are sticky by construction: ``total_reviews`` only grows over
  time (review events are never deleted), so a descriptor earned once is
  earned at every higher total too. No separate "earned_at" persistence is
  needed for correctness.
"""
from __future__ import annotations

REVIEW_COUNT_MILESTONES: tuple[int, ...] = (100, 500, 1000)
"""Total-reviews-completed thresholds that grant a badge."""

STREAK_MILESTONES: tuple[int, ...] = (3, 7, 14, 30, 100)
"""Best-streak-days thresholds that grant a badge.

Matches the thresholds already used by the app's ``streak_milestone``
assistant toast events (3/7/14/30 days), plus 100 as a flagship milestone.
"""


def milestone_descriptor(threshold: int) -> str:
    """Return the badge descriptor for a review-count threshold."""
    return f"reviews_{threshold}"


def streak_milestone_descriptor(threshold: int) -> str:
    """Return the badge descriptor for a best-streak-days threshold."""
    return f"streak_{threshold}"


def earned_review_milestones(total_reviews: int) -> tuple[str, ...]:
    """Return descriptors for every milestone reached at ``total_reviews``."""
    return tuple(
        milestone_descriptor(threshold)
        for threshold in REVIEW_COUNT_MILESTONES
        if total_reviews >= threshold
    )


def newly_crossed_review_milestones(previous_total: int, new_total: int) -> tuple[str, ...]:
    """Return descriptors for milestones crossed in the (previous_total, new_total] range."""
    return tuple(
        milestone_descriptor(threshold)
        for threshold in REVIEW_COUNT_MILESTONES
        if previous_total < threshold <= new_total
    )


def earned_streak_milestones(best_streak_days: int) -> tuple[str, ...]:
    """Return descriptors for every streak milestone reached at ``best_streak_days``."""
    return tuple(
        streak_milestone_descriptor(threshold)
        for threshold in STREAK_MILESTONES
        if best_streak_days >= threshold
    )


def newly_crossed_streak_milestones(previous_best: int, new_best: int) -> tuple[str, ...]:
    """Return descriptors for streak milestones crossed in (previous_best, new_best]."""
    return tuple(
        streak_milestone_descriptor(threshold)
        for threshold in STREAK_MILESTONES
        if previous_best < threshold <= new_best
    )
