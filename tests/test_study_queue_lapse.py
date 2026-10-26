"""Lapsed cards stay studied in queue, summary and new-word feed readers."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast

import pytest

from data import database
from data.repetitions_backfill import BackfillPlan, PlannedCorrection, apply_backfill
from domain.cards import Card, Deck
from domain.review_replay import ReplayedReview, rebuild_review_state
from domain.scheduler import AGAIN, GOOD, ReviewState, has_been_reviewed, update
from scripts import desktop_bridge


@pytest.mark.parametrize(
    ("days_since_lapse", "due_count", "overdue_count", "review_count"),
    [(1, 1, 0, 0), (2, 0, 1, 0), (0, 0, 0, 1)],
)
def test_lapsed_card_is_studied_in_queue_and_summary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    days_since_lapse: int,
    due_count: int,
    overdue_count: int,
    review_count: int,
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "lapse.db")
    database.init_db()
    today = date.today()
    deck = Deck(
        name="Study lapse",
        cards=[
            Card(id=1, character="あ", romaji="a", meaning="a"),
            Card(id=2, character="い", romaji="i", meaning="i"),
        ],
    )
    monkeypatch.setitem(desktop_bridge.ALL_DECKS, "study_lapse", lambda: deck)
    monkeypatch.setattr(desktop_bridge, "_section_deck_slugs", lambda *args, **kwargs: ["study_lapse"])
    lapse_day = today - timedelta(days=days_since_lapse)
    state = update(ReviewState(card_id=2), GOOD, today=lapse_day - timedelta(days=1))
    update(state, AGAIN, today=lapse_day)
    assert state.repetitions == 0
    assert state.next_review == lapse_day + timedelta(days=1)
    database.save_state(deck.name, state)

    # Card 1 has no stored state and must remain new even though its default is due.
    queue = cast(dict[str, Any], desktop_bridge.build_study_queue_payload("study_lapse")["queue"])
    assert queue["buckets_new"] == 1
    assert queue["buckets_due"] == due_count + overdue_count
    assert queue["buckets_review"] == review_count
    assert queue["card_ids"] == ([1, 2] if review_count else [2, 1])

    metrics = desktop_bridge._build_category_metrics_for_node("hiragana")
    assert metrics.total_items == 2
    assert metrics.new_count == 1
    assert metrics.due_count == due_count
    assert metrics.overdue_count == overdue_count


def test_lapsed_word_does_not_use_new_word_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "feed-lapse.db")
    database.init_db()
    deck = Deck(
        name="Feed lapse",
        cards=[
            Card(id=1, character="あ", romaji="a", meaning="a"),
            Card(id=2, character="い", romaji="i", meaning="i"),
        ],
    )
    monkeypatch.setitem(desktop_bridge.ALL_DECKS, "feed_lapse", lambda: deck)
    monkeypatch.setattr(desktop_bridge, "_known_kanji", lambda: set())
    state = update(ReviewState(card_id=1), GOOD, today=date(2026, 3, 1))
    update(state, AGAIN, today=date(2026, 3, 2))
    database.save_state(deck.name, state)

    payload = desktop_bridge.build_vocab_feed("feed_lapse", budget=1)

    assert payload["started"] == 1
    assert [word["card_id"] for word in cast(list[dict[str, Any]], payload["words"])] == [2]


def test_seeded_and_rebuilt_states_count_as_reviewed() -> None:
    assert has_been_reviewed(desktop_bridge._mastered_seed_state(1))
    rebuilt = rebuild_review_state(
        2,
        [
            ReplayedReview(day=date(2026, 3, 1), quality=GOOD),
            ReplayedReview(day=date(2026, 3, 2), quality=AGAIN),
        ],
    )
    assert rebuilt.repetitions == 0
    assert has_been_reviewed(rebuilt)


def test_backfilled_legacy_state_counts_as_reviewed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "backfill-seen.db")
    database.init_db()
    # Pre-FSRS rows have successful repetitions but no date or stability.
    database.save_state("Legacy", ReviewState(card_id=1, repetitions=4))
    plan = BackfillPlan(corrections=[PlannedCorrection(
        deck="Legacy", card_id=1, stored=4, corrected=1, reviews=4,
    )])
    with database._connect() as conn:
        assert apply_backfill(conn, plan) == 1

    state = database.load_states("Legacy", [1])[1]
    assert state.repetitions == 1
    assert state.last_review is None
    assert state.stability == 0.0
    assert has_been_reviewed(state)
