"""Summary totals count each servable card once (audit 3, F2 and F4).

F2: topic views reuse their level deck's cards, Conjugation Training cannot be
opened, and only the first SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT sentences are
served, so the totals leave out the first two and cap the third.
F4: ``remaining_due`` is what is still due now, so a card reviewed today counts
in ``completed_today`` but not in ``remaining_due``.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from typing import Any, cast

import pytest

from data import database
from domain.block_mapping import parent_slug_for_category
from domain.decks import ALL_DECKS
from scripts import desktop_bridge


@pytest.fixture(autouse=True)
def _fresh_mastery_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    # The repository is cached per process; each test has its own database.
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)


def _summary() -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    payload = cast(dict[str, Any], desktop_bridge.build_summary())
    decks = {deck["slug"]: deck for deck in cast(list[dict[str, Any]], payload["decks"])}
    return cast(dict[str, Any], payload["totals"]), decks


def _counted_slugs() -> list[str]:
    return [
        slug
        for slug in ALL_DECKS
        if parent_slug_for_category(slug) is None and slug != "conjugation_training"
    ]


def test_totals_count_level_and_standalone_decks_once_after_n5_seeding() -> None:
    assert desktop_bridge.apply_known_items(["hiragana", "katakana", "kanji_n5", "vocab_n5"])["ok"] is True
    totals, decks = _summary()

    counted = _counted_slugs()
    topic_slugs = [slug for slug in ALL_DECKS if parent_slug_for_category(slug) is not None]
    assert topic_slugs, "expected topic views over the level decks"
    assert "conjugation_training" not in counted
    assert not set(topic_slugs) & set(counted)

    limit = desktop_bridge.SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT
    assert limit == 1200
    assert len(ALL_DECKS["sentence_examples"]().cards) > limit
    # The per-deck entry agrees with the totals: only the served sentences.
    assert decks["sentence_examples"]["total"] == limit

    assert totals["total"] == sum(decks[slug]["total"] for slug in counted)
    assert totals["mastered"] == sum(decks[slug]["mastered"] for slug in counted)
    assert totals["due_today"] == sum(decks[slug]["due_today"] for slug in counted)
    assert totals["completed_today"] == sum(decks[slug]["completed_today"] for slug in counted)
    assert totals["deck_count"] == len(counted)
    # Seeding marks topic words mastered through their level deck, so the
    # overlap is real and would have been counted twice.
    assert totals["mastered"] > 0
    assert sum(decks[slug]["mastered"] for slug in topic_slugs) > 0
    assert totals["total"] == sum(
        min(len(ALL_DECKS[slug]().cards), limit) if slug == "sentence_examples" else len(ALL_DECKS[slug]().cards)
        for slug in counted
    )


def _unreviewed_card(slug: str) -> int:
    deck = ALL_DECKS[slug]()
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        seen = {
            int(row[0])
            for row in conn.execute(
                "SELECT card_id FROM review_states WHERE deck=?",
                (database._normalize_deck_name(deck.name),),
            )
        }
    return next(card.id for card in deck.cards if card.id not in seen)


def test_card_reviewed_today_is_completed_not_remaining() -> None:
    assert desktop_bridge.apply_known_items(["hiragana", "katakana", "kanji_n5", "vocab_n5"])["ok"] is True
    before, _ = _summary()
    assert before["completed_today"] == 0
    assert before["remaining_due"] == before["due_today"]

    card_id = _unreviewed_card("grammar_patterns")
    desktop_bridge.record_game_result("grammar_patterns", card_id, True, minigame="meaning_match")
    after, decks = _summary()

    assert after["completed_today"] == 1
    assert after["due_today"] == before["due_today"] + 1
    assert after["remaining_due"] == before["remaining_due"]
    assert after["remaining_due"] == after["due_today"] - after["completed_today"]
    assert decks["grammar_patterns"]["completed_today"] == 1
