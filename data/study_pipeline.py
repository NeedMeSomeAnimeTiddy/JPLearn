"""Review-flow orchestration used by the Qt UI."""

from __future__ import annotations

from datetime import date, datetime, timezone

from data import database
from domain.activity import ActivitySummary
from domain.history import ItemHistory, RawItemHistoryBucket, classify_review_trend
from domain.mistakes import MistakeBreakdownRow
from domain.scheduler import ReviewState, update
from domain.streaks import StreakState, apply_study_day


def init_study_db() -> None:
    """Ensure review-flow tables exist."""
    database.init_db()


def reset_study_db() -> None:
    """Clear all review-flow progress data from persistence."""
    database.reset_db()


def load_review_states(deck_name: str, card_ids: list[int]) -> dict[int, ReviewState]:
    """Load review states for deck cards, creating defaults for missing rows."""
    return database.load_states(deck_name, card_ids)


def review_card(
    deck_name: str,
    state: ReviewState,
    quality: int,
    script_tag: str = "",
    tags: list[str] | None = None,
    reviewed_on_local: date | None = None,
    reviewed_on_utc: date | None = None,
) -> ReviewState:
    """Apply one review outcome, persist state/event, and return updated state."""
    review_day_local = reviewed_on_local or date.today()
    review_day_utc = reviewed_on_utc or datetime.now(timezone.utc).date()
    review_timestamp_utc = (
        f"{review_day_utc.isoformat()}T00:00:00+00:00"
        if reviewed_on_utc is not None
        else datetime.now(timezone.utc).isoformat(timespec="seconds")
    )
    normalized_script_tag = script_tag.strip().lower() if script_tag.strip() else deck_name.strip().lower().replace(" ", "_")

    updated_state = update(state, quality)
    database.save_state(deck_name, updated_state)
    database.log_review(
        deck_name,
        updated_state.card_id,
        quality,
        reviewed_on=review_day_local,
        reviewed_at_utc=review_timestamp_utc,
        script_tag=normalized_script_tag,
        tags=tags,
    )
    database.update_leech_state_for_card(deck_name, updated_state.card_id)
    next_streak = apply_study_day(database.load_streak_state(), review_day_utc, review_day_local)
    database.save_streak_state(next_streak)
    return updated_state


def load_today_progress(
    deck_name: str, card_ids: list[int], on_date: date | None = None
) -> tuple[int, int]:
    """Return ``(due_today, completed_today)`` for the selected deck cards."""
    return database.load_today_progress(deck_name, card_ids, on_date=on_date)


def load_streak_state() -> StreakState:
    """Return persisted daily streak information."""
    return database.load_streak_state()


def load_activity_summary(window_days: int, on_date: date | None = None) -> ActivitySummary:
    """Return aggregated activity metrics for a rolling day window."""
    return database.load_activity_summary(window_days, on_date=on_date)


def load_mistake_breakdown(limit: int = 6) -> list[MistakeBreakdownRow]:
    """Return grouped mistake metrics ordered by weakest buckets first."""
    return database.load_mistake_breakdown(limit=limit)


def load_item_history(limit_items: int = 8, events_per_item: int = 8) -> list[ItemHistory]:
    """Return per-item timeline payloads with deterministic trend classification."""
    raw: list[RawItemHistoryBucket] = database.load_raw_item_history(
        limit_items=limit_items,
        events_per_item=events_per_item,
    )

    histories: list[ItemHistory] = []
    for bucket in raw:
        # Data layer returns newest-first events; trend logic expects oldest-first.
        oldest_to_newest_successes = list(reversed(bucket.successes))
        trend = classify_review_trend(oldest_to_newest_successes)
        histories.append(
            ItemHistory(
                key=bucket.key,
                script_tag=bucket.script_tag,
                deck=bucket.deck,
                card_id=bucket.card_id,
                prompt=bucket.prompt,
                trend=trend,
                events=bucket.events,
            )
        )

    return histories


def load_active_leech_card_ids(deck_name: str) -> set[int]:
    """Return active leech card ids for one deck."""
    return database.load_active_leech_card_ids(deck_name)
