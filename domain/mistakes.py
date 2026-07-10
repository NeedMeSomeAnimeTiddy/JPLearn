"""Domain model for grouped mistake breakdown metrics."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MistakeBreakdownRow:
    """Aggregated mistake metrics for one script/tag bucket."""

    key: str
    attempts: int
    mistakes: int
    error_rate: int


@dataclass(frozen=True)
class MinigamePerformanceRow:
    """Aggregated performance metrics for one minigame type."""

    minigame: str
    attempts: int
    correct: int
    accuracy: int


@dataclass(frozen=True)
class SessionHistoryRow:
    """Summary of a single completed study session."""

    session_id: str
    started_at_utc: str
    target_items: int
    reviewed: int
    correct: int
    accuracy: int
    goal_met: bool
