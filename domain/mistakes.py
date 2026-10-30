"""Domain model for grouped mistake breakdown metrics."""

from __future__ import annotations

from collections.abc import Iterable
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
class MinigameModeRecord:
    """One drill mode's record on one deck, as the Drills screen shows it (audit 17, F1)."""

    mode: str
    attempted: int
    correct: int
    best_run: int


def minigame_mode_from_tags(tags_csv: str) -> str | None:
    """Return the mode a minigame answer's tags name, or ``None`` for a non-minigame row.

    The tags are ``minigame,<mode>`` with optional extras after it (``minigame,imposter,chapter_2``),
    so the mode is the second tag, never everything after the first comma.
    """
    tags = [tag.strip() for tag in tags_csv.split(",")]
    if len(tags) < 2 or tags[0] != "minigame" or not tags[1]:
        return None
    return tags[1]


def summarize_minigame_answers(answers: Iterable[tuple[str, bool]]) -> list[MinigameModeRecord]:
    """Fold ``(mode, correct)`` answers, oldest first, into one record per mode.

    ``best_run`` is the longest run of correct answers in a row within a mode; another mode's
    answers in between do not break it. Modes come back in order of most answers, then by name.
    """
    attempted: dict[str, int] = {}
    correct: dict[str, int] = {}
    run: dict[str, int] = {}
    best: dict[str, int] = {}
    for mode, is_correct in answers:
        attempted[mode] = attempted.get(mode, 0) + 1
        if is_correct:
            correct[mode] = correct.get(mode, 0) + 1
            run[mode] = run.get(mode, 0) + 1
            best[mode] = max(best.get(mode, 0), run[mode])
        else:
            run[mode] = 0
    return [
        MinigameModeRecord(
            mode=mode,
            attempted=count,
            correct=correct.get(mode, 0),
            best_run=best.get(mode, 0),
        )
        for mode, count in sorted(attempted.items(), key=lambda item: (-item[1], item[0]))
    ]


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
