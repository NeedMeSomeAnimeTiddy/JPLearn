"""Deterministic leech-state evaluation rules."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LeechEvaluation:
    """Evaluation result for one card's recent attempts."""

    attempts_recent: int
    failures_recent: int
    is_active: bool


def evaluate_leech_state(
    qualities_newest_first: list[int],
    window_size: int = 5,
    fail_threshold: int = 3,
) -> LeechEvaluation:
    """Evaluate leech status from recent quality scores.

    Rules:
    - Use the most recent ``window_size`` attempts.
    - A failure is quality < 3.
    - Card is leech only when there are at least ``window_size`` attempts
      and failures in that window are >= ``fail_threshold``.
    """

    if window_size <= 0:
        raise ValueError("window_size must be positive")
    if fail_threshold <= 0:
        raise ValueError("fail_threshold must be positive")

    window = qualities_newest_first[:window_size]
    attempts_recent = len(window)
    failures_recent = sum(1 for quality in window if quality < 3)
    is_active = attempts_recent >= window_size and failures_recent >= fail_threshold

    return LeechEvaluation(
        attempts_recent=attempts_recent,
        failures_recent=failures_recent,
        is_active=is_active,
    )
