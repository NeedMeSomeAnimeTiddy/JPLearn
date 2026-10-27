"""Onboarding counters, the correct-once block rule and JLPT accuracy (audit 3, 2026-10-27).

F1: claiming a level wrote mastered schedules but set the 0-4 counters only in the renderer, so the
first restart after any answer lost them, and N4-N1 never had any.
F3: a card stopped counting toward its block at its next wrong answer, so a studied block could
close again. Robbie's ruling: a card counts once it has been answered correctly.
F6: the JLPT mock exam and weak-area drill queried accuracy by deck slug against a log keyed by deck
name, so every card read as 50%.
"""

from __future__ import annotations

from typing import Any

import pytest

from data import database
from data.study_pipeline import review_minigame_result
from domain.blocks import blocks_for_slug
from domain.decks import ALL_DECKS
from scripts import desktop_bridge


@pytest.fixture(autouse=True)
def _fresh_mastery_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)


def _scores() -> dict[str, dict[int, int]]:
    return desktop_bridge.build_card_mastery_scores()["scores"]  # type: ignore[return-value]


# --- F1 --------------------------------------------------------------------------------------


def test_claiming_a_level_stores_full_counters_for_every_seeded_card() -> None:
    response = desktop_bridge.apply_expertise_level("jlpt_n4_foundation")
    scores = _scores()

    for slug in ("hiragana", "katakana", "kanji_n5", "vocab_n5", "kanji_n4", "vocab_n4"):
        ids = {card.id for card in ALL_DECKS[slug]().cards}
        assert set(scores[slug]) == ids, slug
        assert set(scores[slug].values()) == {4}, slug
    assert not any(desktop_bridge.parent_slug_for_category(slug) for slug in scores)
    assert sum(len(cards) for cards in scores.values()) == response["seeded_cards"]


def test_seeding_leaves_a_studied_cards_counter_alone() -> None:
    database.init_db()
    deck = ALL_DECKS["hiragana"]()
    card_id = deck.cards[0].id
    desktop_bridge.record_game_result("hiragana", card_id, False, minigame="meaning_match")

    desktop_bridge.apply_expertise_level("know_hiragana")

    assert _scores()["hiragana"][card_id] == 0
    assert len(_scores()["hiragana"]) == len(deck.cards)


# --- F3 --------------------------------------------------------------------------------------


def _unlocked(slug: str) -> list[bool]:
    return [block["unlocked"] for block in desktop_bridge.build_block_progress(slug)["blocks"][:3]]


def test_a_studied_block_stays_open_after_misses() -> None:
    database.init_db()
    name = ALL_DECKS["hiragana"]().name
    first, second = (block.card_ids for block in blocks_for_slug("hiragana")[:2])
    for card_id in first:
        review_minigame_result(name, card_id, True)
    review_minigame_result(name, second[0], False)
    assert _unlocked("hiragana") == [True, True, False]

    for card_id in first:
        review_minigame_result(name, card_id, False)

    assert _unlocked("hiragana") == [True, True, False]


def test_a_card_answered_correctly_once_keeps_counting_toward_its_block() -> None:
    database.init_db()
    name = ALL_DECKS["hiragana"]().name
    block = blocks_for_slug("hiragana")[0]
    for card_id in block.card_ids:
        review_minigame_result(name, card_id, True)
        review_minigame_result(name, card_id, False)

    progress: dict[str, Any] = desktop_bridge.build_block_progress("hiragana")["blocks"][0]
    assert progress["mastery"] == 1.0


def test_a_card_only_ever_missed_does_not_count_toward_its_block() -> None:
    database.init_db()
    name = ALL_DECKS["hiragana"]().name
    block = blocks_for_slug("hiragana")[0]
    review_minigame_result(name, block.card_ids[0], False)

    assert desktop_bridge.build_block_progress("hiragana")["blocks"][0]["mastery"] == 0.0


# --- F6 --------------------------------------------------------------------------------------


@pytest.mark.parametrize("mode", ["mock_exam", "weak_area_drill"])
def test_jlpt_queues_put_the_cards_answered_worst_first(mode: str) -> None:
    database.init_db()
    deck = ALL_DECKS["vocab_n5"]()
    later = deck.cards[-1].id
    for card in deck.cards[:-1]:
        database.log_review(deck.name, card.id, 4)
    database.log_review(deck.name, later, 1)

    payload = desktop_bridge.build_jlpt_exam_queue_payload("n5", mode, 10)
    questions: list[dict[str, Any]] = payload["questions"]  # type: ignore[assignment]

    assert (questions[0]["deck"], questions[0]["card_id"]) == ("vocab_n5", later)
