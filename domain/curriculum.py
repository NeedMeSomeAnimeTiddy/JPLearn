"""Deterministic curriculum stage transitions for context-based practice."""

from __future__ import annotations


def clamp_stage(stage: int) -> int:
    """Clamp a curriculum stage into the supported 1..3 range."""
    if stage < 1:
        return 1
    if stage > 3:
        return 3
    return stage


def next_stage(current_stage: int, is_correct: bool) -> int:
    """Compute next stage using deterministic promotion/demotion rules.

    Rules:
    - Correct answers promote by 1 stage, capped at 3.
    - Incorrect answers demote by 1 stage, floored at 1.
    """
    stage = clamp_stage(current_stage)
    if is_correct:
        return clamp_stage(stage + 1)
    return clamp_stage(stage - 1)
