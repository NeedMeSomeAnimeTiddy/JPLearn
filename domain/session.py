"""Domain models for per-session goal tracking."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SessionGoal:
    """Configured targets for one study session."""

    session_id: str
    target_items: int
    target_minutes: int | None = None
    target_accuracy: int | None = None
    started_at_utc: str = ""


@dataclass(frozen=True)
class SessionSummary:
    """Computed completion metrics for one study session."""

    session_id: str
    target_items: int
    completed_items: int
    reviewed: int
    correct: int
    accuracy: int
    target_accuracy: int | None
    goal_met: bool
