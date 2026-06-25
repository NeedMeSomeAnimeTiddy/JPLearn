"""Domain model for aggregated activity windows."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ActivitySummary:
    """Aggregated review activity for a fixed day window."""

    days: int
    reviewed: int
    correct: int
    incorrect: int
    accuracy: int
    points_earned: int
    active_days: int
