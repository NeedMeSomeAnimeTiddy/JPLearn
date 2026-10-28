from __future__ import annotations

from pathlib import Path

from data import database
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-deck-cache-test.db")


def _uncached_deck_cards(monkeypatch, slug: str) -> dict[str, object]:
    with monkeypatch.context() as patch:
        patch.setattr(desktop_bridge, "_HEAVY_DECK_ENRICHMENT_CACHE", {})
        return desktop_bridge.build_deck_cards(slug)


def test_cached_heavy_deck_cards_match_an_uncached_build(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(desktop_bridge, "_HEAVY_DECK_ENRICHMENT_CACHE", {})

    first = desktop_bridge.build_deck_cards("kanji_n5")
    assert "kanji_n5" in desktop_bridge._HEAVY_DECK_ENRICHMENT_CACHE
    second = desktop_bridge.build_deck_cards("kanji_n5")

    assert second == first
    assert second == _uncached_deck_cards(monkeypatch, "kanji_n5")


def test_cached_deck_cards_still_read_learner_state_each_call(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(desktop_bridge, "_HEAVY_DECK_ENRICHMENT_CACHE", {})
    first = desktop_bridge.build_deck_cards("kanji_n5")
    first_cards = first["cards"]
    assert isinstance(first_cards, list)
    leech_id = first_cards[0]["id"]

    monkeypatch.setattr(desktop_bridge, "load_active_leech_card_ids", lambda _deck_name: {leech_id})
    monkeypatch.setattr(
        desktop_bridge,
        "load_curriculum_stages",
        lambda _deck_name, _mode, ids: {card_id: 3 for card_id in ids},
    )
    second = desktop_bridge.build_deck_cards("kanji_n5")
    second_cards = second["cards"]
    assert isinstance(second_cards, list)

    assert second_cards[0]["is_leech"] is True
    assert all(card["curriculum_stage"] == 3 for card in second_cards)
    assert [card["meaning_distractor_ids"] for card in second_cards] == [
        card["meaning_distractor_ids"] for card in first_cards
    ]


def test_heavy_deck_enrichment_is_rebuilt_when_the_dictionary_changes(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(desktop_bridge, "_HEAVY_DECK_ENRICHMENT_CACHE", {})
    sessions_opened: list[int] = []
    real_session = desktop_bridge.open_enrichment_session

    def counting_session():
        sessions_opened.append(1)
        return real_session()

    monkeypatch.setattr(desktop_bridge, "open_enrichment_session", counting_session)
    monkeypatch.setattr(desktop_bridge, "dictionary_cache_key", lambda: ("dictionary-a", 1, 1))
    desktop_bridge.build_deck_cards("kanji_n5")
    desktop_bridge.build_deck_cards("kanji_n5")
    assert len(sessions_opened) == 1

    monkeypatch.setattr(desktop_bridge, "dictionary_cache_key", lambda: ("dictionary-a", 2, 2))
    desktop_bridge.build_deck_cards("kanji_n5")
    assert len(sessions_opened) == 2

    monkeypatch.setattr(desktop_bridge, "dictionary_cache_key", lambda: None)
    desktop_bridge.build_deck_cards("kanji_n5")
    assert len(sessions_opened) == 3


def test_lightweight_decks_are_not_cached(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(desktop_bridge, "_HEAVY_DECK_ENRICHMENT_CACHE", {})

    desktop_bridge.build_deck_cards("sentence_examples")

    assert desktop_bridge._HEAVY_DECK_ENRICHMENT_CACHE == {}
