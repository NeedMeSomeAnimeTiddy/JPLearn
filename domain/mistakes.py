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
