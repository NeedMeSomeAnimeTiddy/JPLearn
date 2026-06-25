"""Domain models and deterministic trend rules for item review history."""

from __future__ import annotations

from dataclasses import dataclass


ReviewTrend = str


@dataclass(frozen=True)
class ItemHistoryEvent:
    """One review event in an item timeline."""

    reviewed_at_utc: str
    outcome: str
    points_delta: int


@dataclass(frozen=True)
class ItemHistory:
    """Timeline payload for one item."""

    key: str
    script_tag: str
    deck: str
    card_id: int
    prompt: str
    trend: ReviewTrend
    events: list[ItemHistoryEvent]


@dataclass(frozen=True)
class RawItemHistoryBucket:
    """Raw grouped item history from persistence before trend classification."""

    key: str
    script_tag: str
    deck: str
    card_id: int
    prompt: str
    events: list[ItemHistoryEvent]
    successes: list[int]


def classify_review_trend(successes: list[int]) -> ReviewTrend:
    """Classify trend as improving/stable/declining using deterministic windows.

    Input must be ordered oldest -> newest and contain 0/1 values.
    """

    if not successes:
        return "stable"

    if len(successes) < 3:
        return "stable"

    recent_window = successes[-3:]
    recent_avg = sum(recent_window) / len(recent_window)
    prior_window = successes[-6:-3]

    if not prior_window:
        if recent_avg >= 0.67:
            return "improving"
        if recent_avg <= 0.33:
            return "declining"
        return "stable"

    prior_avg = sum(prior_window) / len(prior_window)
    delta = recent_avg - prior_avg

    if delta >= 0.34:
        return "improving"
    if delta <= -0.34:
        return "declining"
    return "stable"
