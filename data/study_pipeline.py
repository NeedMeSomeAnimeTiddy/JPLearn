"""Review-flow orchestration used by the Qt UI."""

from __future__ import annotations

from datetime import date

from data import database
from domain.scheduler import ReviewState, update


def init_study_db() -> None:
    """Ensure review-flow tables exist."""
    database.init_db()


def load_review_states(deck_name: str, card_ids: list[int]) -> dict[int, ReviewState]:
    """Load review states for deck cards, creating defaults for missing rows."""
    return database.load_states(deck_name, card_ids)


def review_card(deck_name: str, state: ReviewState, quality: int) -> ReviewState:
    """Apply one review outcome, persist state/event, and return updated state."""
    updated_state = update(state, quality)
    database.save_state(deck_name, updated_state)
    database.log_review(deck_name, updated_state.card_id, quality)
    return updated_state


def load_today_progress(
    deck_name: str, card_ids: list[int], on_date: date | None = None
) -> tuple[int, int]:
    """Return ``(due_today, completed_today)`` for the selected deck cards."""
    return database.load_today_progress(deck_name, card_ids, on_date=on_date)
