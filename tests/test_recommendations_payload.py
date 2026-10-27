"""The Home "Up next" block payload.

Covers the seam between the ranking engine (domain/recommendation_service.py),
the routing rules (domain/study_route.py), and the renderer: every row must
carry a launchable section and drill, and the block must never be empty on a
screen a learner has just arrived at.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, cast

import pytest

from domain.decks import ALL_DECKS
from domain.scheduler import ReviewState
from data import database
from scripts import desktop_bridge


def _rows(payload: dict[str, object]) -> list[dict[str, Any]]:
    """The recommendation rows, narrowed from the bridge's dict[str, object] payload."""
    return cast(list[dict[str, Any]], payload["recommendations"])


@pytest.fixture
def bridge_db():
    """Initialise the per-test database the autouse conftest fixture points at."""
    database.init_db()
    return database


def _seed_reviews(deck_slug: str, *, count: int, repetitions: int, interval: int, days_overdue: int = 0) -> None:
    """Record *count* review states on a deck, so it stops reading as untouched."""
    deck = ALL_DECKS[deck_slug]()
    due = date.today() - timedelta(days=days_overdue)
    for card in deck.cards[:count]:
        database.save_state(
            deck.name,
            ReviewState(
                card_id=card.id,
                repetitions=repetitions,
                interval=interval,
                ease_factor=2.5,
                next_review=due,
            ),
        )


class TestSectionResolution:
    # Every graph node the payload can emit must resolve to a section the
    # renderer can launch. A row without one used to render a Start button that
    # silently did nothing, because App.tsx mapped node ids through a five-entry
    # object and dropped the rest behind an `if (script)` guard.
    def test_every_mapped_node_resolves_to_a_known_section(self) -> None:
        sections = set(desktop_bridge._NODE_TO_SECTION.values())
        assert sections == set(desktop_bridge._SECTION_LABELS)

    def test_every_section_resolves_to_at_least_one_registered_deck(self) -> None:
        for section in desktop_bridge._NODE_TO_SECTION.values():
            assert desktop_bridge._section_deck_slugs(section), section

    def test_every_row_carries_a_launchable_section_and_drill(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        assert _rows(payload)
        for row in _rows(payload):
            assert row["section"] in desktop_bridge._SECTION_LABELS
            assert row["minigame"]
            assert row["section_label"]


class TestDeckScoping:
    # Both tracks are measured over the level decks, because sessions study the
    # level slug (`vocab_${level}`, `kanji_${level}`) and that is where reviews
    # land. Vocabulary used to be measured over its 28 topic views, which cover
    # 545 of the 8,051 level cards (audit 2, F2).
    @pytest.mark.parametrize("track", ["vocab", "kanji"])
    def test_the_section_is_measured_over_the_decks_reviews_land_in(self, track: str) -> None:
        slugs = desktop_bridge._section_deck_slugs(f"{track}_n5")
        assert slugs == [f"{track}_n{level}" for level in range(1, 6)]

    @pytest.mark.parametrize("track", ["vocab", "kanji"])
    def test_the_n5_scope_is_just_the_n5_deck(self, track: str) -> None:
        assert desktop_bridge._section_deck_slugs(f"{track}_n5", n5_only=True) == [f"{track}_n5"]

    def test_the_vocabulary_section_excludes_topic_views(self) -> None:
        slugs = set(desktop_bridge._section_deck_slugs("vocab_n5"))
        for slug in ("vocab_greetings", "vocab_verbs", "vocab_numbers"):
            assert slug in ALL_DECKS
            assert slug not in slugs

    def test_vocabulary_metrics_count_every_level_card(self, bridge_db) -> None:
        total = sum(len(ALL_DECKS[f"vocab_n{level}"]().cards) for level in range(1, 6))
        metrics = desktop_bridge._build_category_metrics_for_node("vocabulary_n5")
        assert metrics.total_items == total
        n5 = desktop_bridge._build_category_metrics_for_node("vocabulary_n5", n5_only=True)
        assert n5.total_items == len(ALL_DECKS["vocab_n5"]().cards)

    # A review on a level card outside every topic view never counted before.
    def test_a_level_card_outside_every_topic_view_counts_as_studied(self, bridge_db) -> None:
        topic_ids = {
            card.id
            for slug in ALL_DECKS
            if slug.startswith("vocab_") and slug not in {f"vocab_n{level}" for level in range(1, 6)}
            for card in ALL_DECKS[slug]().cards
        }
        deck = ALL_DECKS["vocab_n3"]()
        card = next(card for card in deck.cards if card.id not in topic_ids)
        before = desktop_bridge._build_category_metrics_for_node("vocabulary_n5")
        database.save_state(
            deck.name,
            ReviewState(card_id=card.id, repetitions=2, interval=6, ease_factor=2.5,
                        next_review=date.today()),
        )
        after = desktop_bridge._build_category_metrics_for_node("vocabulary_n5")
        assert after.new_count == before.new_count - 1
        assert after.due_count == before.due_count + 1

    @pytest.mark.parametrize("section", ["vocab_n5", "kanji_n5"])
    def test_the_n5_scope_is_a_strict_subset_of_the_whole_track(self, section: str) -> None:
        whole = set(desktop_bridge._section_deck_slugs(section))
        n5 = set(desktop_bridge._section_deck_slugs(section, n5_only=True))
        assert n5 < whole


class TestColdStart:
    # A fresh account has every node but the root locked, so nothing is rankable.
    # The block must still name somewhere to begin — it is the only call to
    # action on the screen a new learner lands on.
    def test_a_fresh_account_still_gets_a_row(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        rows = _rows(payload)

        assert len(rows) >= 1
        assert rows[0]["section"] == desktop_bridge._COLD_START_SECTION
        assert cast(int, payload["session_minutes"]) > 0
        assert payload["session_note"]

    def test_a_fresh_account_reads_as_starter(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        assert payload["learner_stage"] == "starter"
        assert payload["stage_label"] == "Starter-safe"

    # The cold-start row is a recognition reason, so it must never launch a
    # production drill on cards the learner has never seen.
    def test_the_cold_start_row_launches_a_recognition_drill(self, bridge_db) -> None:
        row = _rows(desktop_bridge.build_recommendations_payload())[0]
        assert row["minigame"] in ("meaning_match", "character_match")
        assert row["leech_focus_enabled"] is None


class TestSessionShape:
    def test_minutes_reflect_the_work_the_rows_contain(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        total = sum(row["review_count"] for row in _rows(payload))
        assert payload["session_minutes"] == desktop_bridge.session_minutes(total)

    def test_the_note_names_the_top_row(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        rows = _rows(payload)
        assert rows[0]["section_label"] in cast(str, payload["session_note"])


class TestOverdueBacklog:
    # The engine reads state the renderer's deck aggregates never could: an
    # overdue backlog is invisible to a mastery percentage.
    def test_an_overdue_backlog_is_ranked_and_launchable(self, bridge_db) -> None:
        _seed_reviews("hiragana", count=20, repetitions=4, interval=25, days_overdue=9)
        database.upsert_progression_node("hiragana", "unlocked", 0, 104, None, None)

        payload = desktop_bridge.build_recommendations_payload()
        rows = _rows(payload)

        hiragana = [row for row in rows if row["section"] == "hiragana"]
        assert hiragana, [row["section"] for row in rows]
        assert hiragana[0]["review_count"] > 0
        assert hiragana[0]["minigame"]
