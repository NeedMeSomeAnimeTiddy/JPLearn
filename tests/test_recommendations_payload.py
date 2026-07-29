"""The Home "Up next" block payload.

Covers the seam between the ranking engine (domain/recommendation_service.py),
the routing rules (domain/study_route.py), and the renderer: every row must
carry a launchable section and drill, and the block must never be empty on a
screen a learner has just arrived at.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from domain.decks import ALL_DECKS
from domain.scheduler import ReviewState
from data import database
from scripts import desktop_bridge


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
        assert payload["recommendations"]
        for row in payload["recommendations"]:
            assert row["section"] in desktop_bridge._SECTION_LABELS
            assert row["minigame"]
            assert row["section_label"]


class TestDeckScoping:
    # Vocabulary is still measured over its category decks: the level decks are
    # registered but receive no reviews under that routing, which pinned
    # `mastered_ratio` at 0 and `new_count` at the deck size forever.
    def test_the_vocabulary_section_excludes_its_level_decks(self) -> None:
        slugs = desktop_bridge._section_deck_slugs("vocab_n5")
        for level in range(1, 6):
            assert f"vocab_n{level}" not in slugs

    # Kanji is the opposite, and deliberately so. Its categories became block
    # definitions that allocate no ids, and `useStudySession` records every
    # review against `activeDeckSlug` — `kanji_n5`..`kanji_n1`. The level decks
    # are exactly where kanji reviews land, so that is what the section measures.
    def test_the_kanji_section_is_measured_over_the_decks_reviews_land_in(self) -> None:
        slugs = desktop_bridge._section_deck_slugs("kanji_n5")
        assert slugs == ["kanji_n1", "kanji_n2", "kanji_n3", "kanji_n4", "kanji_n5"]

    def test_the_kanji_n5_scope_is_just_the_n5_deck(self) -> None:
        assert desktop_bridge._section_deck_slugs("kanji_n5", n5_only=True) == ["kanji_n5"]

    # `vocab_numbers` and `vocab_nouns` begin `vocab_n` without being levelled,
    # so an N5 scope that matched a bare prefix would silently drop them.
    def test_the_n5_scope_keeps_categories_whose_name_merely_starts_with_n(self) -> None:
        n5 = desktop_bridge._section_deck_slugs("vocab_n5", n5_only=True)
        for slug in ("vocab_numbers", "vocab_nouns"):
            if slug in ALL_DECKS:
                assert slug in n5

    @pytest.mark.parametrize("section", ["vocab_n5", "kanji_n5"])
    def test_the_n5_scope_is_a_strict_subset_of_the_whole_track(self, section: str) -> None:
        whole = set(desktop_bridge._section_deck_slugs(section))
        n5 = set(desktop_bridge._section_deck_slugs(section, n5_only=True))
        assert n5 < whole
        assert not any("_n1_" in slug or "_n4_" in slug for slug in n5)


class TestColdStart:
    # A fresh account has every node but the root locked, so nothing is rankable.
    # The block must still name somewhere to begin — it is the only call to
    # action on the screen a new learner lands on.
    def test_a_fresh_account_still_gets_a_row(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        rows = payload["recommendations"]

        assert len(rows) >= 1
        assert rows[0]["section"] == desktop_bridge._COLD_START_SECTION
        assert payload["session_minutes"] > 0
        assert payload["session_note"]

    def test_a_fresh_account_reads_as_starter(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        assert payload["learner_stage"] == "starter"
        assert payload["stage_label"] == "Starter-safe"

    # The cold-start row is a recognition reason, so it must never launch a
    # production drill on cards the learner has never seen.
    def test_the_cold_start_row_launches_a_recognition_drill(self, bridge_db) -> None:
        row = desktop_bridge.build_recommendations_payload()["recommendations"][0]
        assert row["minigame"] in ("meaning_match", "character_match")
        assert row["leech_focus_enabled"] is None


class TestSessionShape:
    def test_minutes_reflect_the_work_the_rows_contain(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        total = sum(row["review_count"] for row in payload["recommendations"])
        assert payload["session_minutes"] == desktop_bridge.session_minutes(total)

    def test_the_note_names_the_top_row(self, bridge_db) -> None:
        payload = desktop_bridge.build_recommendations_payload()
        rows = payload["recommendations"]
        assert rows[0]["section_label"] in payload["session_note"]


class TestOverdueBacklog:
    # The engine reads state the renderer's deck aggregates never could: an
    # overdue backlog is invisible to a mastery percentage.
    def test_an_overdue_backlog_is_ranked_and_launchable(self, bridge_db) -> None:
        _seed_reviews("hiragana", count=20, repetitions=4, interval=25, days_overdue=9)
        database.upsert_progression_node("hiragana", "unlocked", 0, 104, None, None)

        payload = desktop_bridge.build_recommendations_payload()
        rows = payload["recommendations"]

        hiragana = [row for row in rows if row["section"] == "hiragana"]
        assert hiragana, [row["section"] for row in rows]
        assert hiragana[0]["review_count"] > 0
        assert hiragana[0]["minigame"]
