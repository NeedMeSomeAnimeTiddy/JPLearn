"""Audit 4, F1/F2: a session end refreshes problem cards and stages from block-progress.

``deck-cards`` ranks distractors and looks up the dictionary for every card, which takes
seconds for the larger vocabulary decks on the serial bridge. The renderer re-reads only
``block-progress`` after a session, so that payload carries the two per-card fields a saved
answer can change, and they must agree with what ``deck-cards`` would send.
"""

from __future__ import annotations

from pathlib import Path
from typing import cast

from data import database
from domain.decks import ALL_DECKS
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-block-progress.db")
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)
    database.init_db()


def _with_card_state(monkeypatch, slug: str, leeches: set[int], stages: dict[int, int]) -> None:
    deck_name = ALL_DECKS[slug]().name
    monkeypatch.setattr(
        desktop_bridge,
        "load_active_leech_card_ids",
        lambda name: set(leeches) if name == deck_name else set(),
    )
    monkeypatch.setattr(
        desktop_bridge,
        "load_curriculum_stages",
        lambda name, mode, card_ids: {cid: s for cid, s in stages.items() if cid in card_ids},
    )


def test_block_progress_carries_the_per_card_fields_deck_cards_sends(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    cards = ALL_DECKS["hiragana"]().cards
    leeches = {cards[3].id, cards[4].id}
    stages = {cards[0].id: 3, cards[3].id: 2}
    _with_card_state(monkeypatch, "hiragana", leeches, stages)

    blocks = desktop_bridge.build_block_progress("hiragana")
    deck = desktop_bridge.build_deck_cards("hiragana")

    assert blocks["leech_card_ids"] == sorted(leeches)
    stored = cast(dict[str, int], blocks["curriculum_stages"])
    for card in cast(list[dict[str, object]], deck["cards"]):
        card_id = cast(int, card["id"])
        assert card["is_leech"] == (card_id in blocks["leech_card_ids"])
        assert card["curriculum_stage"] == stored.get(str(card_id), 1)


def test_leech_ids_are_limited_to_the_deck(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    cards = ALL_DECKS["hiragana"]().cards
    _with_card_state(monkeypatch, "hiragana", {cards[0].id, 999_999}, {})

    blocks = desktop_bridge.build_block_progress("hiragana")

    assert blocks["leech_card_ids"] == [cards[0].id]
    assert blocks["curriculum_stages"] == {}
