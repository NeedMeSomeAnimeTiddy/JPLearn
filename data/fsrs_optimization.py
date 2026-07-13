"""FSRS weight optimization — loads review history, calls domain optimizer, persists results."""

from __future__ import annotations

from datetime import datetime
from collections.abc import Generator
from typing import Any

from data.database import _connect, init_db
from data.settings_repository import get_setting, set_setting
from domain.fsrs_optimizer import (
    CardReviewSequence,
    DEFAULT_WEIGHTS,
    ReviewLog,
    compute_loss,
    optimize_weights,
)
from domain.scheduler import get_weights, set_weights as set_active_weights, reset_weights as reset_active_weights

_SETTINGS_KEY = "fsrs_weights"


def _parse_review_date(raw: str | None) -> datetime | None:
    """Parse review timestamp strings to datetime, returning None on failure."""
    if not raw:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S+00:00",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=None)
        except (ValueError, OverflowError):
            continue
    return None


def load_review_sequences(
    max_cards: int | None = None,
) -> list[CardReviewSequence]:
    """Load review events grouped by card, sorted chronologically.

    Args:
        max_cards: If set, only the most recently reviewed *max_cards* cards
            are included. This caps runtime while preserving complete card
            review sequences. ``None`` means unlimited.

    Returns:
        A list of :class:`CardReviewSequence`, one per (deck, card_id) pair
        that has at least 2 review events. Cards with only 1 review are
        excluded (no prior state to predict from).
    """
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT deck, card_id, quality, reviewed_at_utc
            FROM review_events
            ORDER BY deck, card_id, reviewed_at_utc
            """
        ).fetchall()

    groups: dict[tuple[str, int], list[tuple[int, datetime | None]]] = {}
    for row in rows:
        key = (row["deck"], int(row["card_id"]))
        quality = int(row["quality"])
        ts = _parse_review_date(row["reviewed_at_utc"])
        groups.setdefault(key, []).append((quality, ts))

    entries: list[tuple[datetime, CardReviewSequence]] = []
    for (deck, card_id), events in groups.items():
        if len(events) < 2:
            continue
        logs: list[ReviewLog] = []
        prev_ts: datetime | None = None
        max_ts: datetime | None = None
        for quality, ts in events:
            if prev_ts is not None and ts is not None:
                delta = (ts - prev_ts).days
            else:
                delta = 0
            logs.append(ReviewLog(quality=quality, elapsed_days=delta))
            prev_ts = ts
            if ts is not None:
                max_ts = ts
        if max_ts is None:
            continue
        entries.append(
            (max_ts, CardReviewSequence(card_id=card_id, deck=deck, logs=logs))
        )

    entries.sort(key=lambda e: e[0], reverse=True)
    if max_cards is not None and len(entries) > max_cards:
        entries = entries[:max_cards]

    return [seq for _, seq in entries]


def load_saved_weights() -> tuple[float, ...] | None:
    """Load previously optimized weights from user_settings, or None."""
    raw = get_setting(_SETTINGS_KEY)
    if not raw:
        return None
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
        if len(parts) != 17:
            return None
        return tuple(parts)
    except (ValueError, TypeError):
        return None


def save_weights(weights: tuple[float, ...]) -> None:
    """Persist weights to user_settings and activate them in the scheduler."""
    serialized = ",".join(str(round(w, 6)) for w in weights)
    set_setting(_SETTINGS_KEY, serialized)
    set_active_weights(weights)


def reset_saved_weights() -> None:
    """Remove saved weights and revert to defaults."""
    set_setting(_SETTINGS_KEY, "")
    reset_active_weights()


def run_optimization(
    iterations: int = 200,
    learning_rate: float = 0.01,
    max_cards: int | None = 200,
) -> dict[str, Any] | None:
    """Load review history, optimize FSRS weights, persist the result.

    Args:
        iterations: Max gradient descent steps.
        learning_rate: Step size for weight updates.
        max_cards: Cap on cards loaded from the DB; ``None`` for unlimited.

    Returns:
        A summary dict with keys ``previous_weights``, ``new_weights``,
        ``loss_before``, ``loss_after``, ``log_count``, ``card_count``,
        or ``None`` if there is insufficient review data.
    """
    sequences = load_review_sequences(max_cards=max_cards)
    if len(sequences) < 5:
        return None

    log_count = sum(len(s["logs"]) - 1 for s in sequences)

    initial = load_saved_weights() or get_weights()
    loss_before = compute_loss(initial, sequences)

    optimized = optimize_weights(
        initial,
        sequences,
        iterations=iterations,
        learning_rate=learning_rate,
    )
    loss_after = compute_loss(optimized, sequences)

    save_weights(optimized)

    return {
        "previous_weights": initial,
        "new_weights": optimized,
        "loss_before": round(loss_before, 6),
        "loss_after": round(loss_after, 6),
        "log_count": log_count,
        "card_count": len(sequences),
    }
