"""Audit 3, F5: the Kanji and Vocabulary level bars read the 0..4 counters per level.

The bridge sums them per level deck so the renderer does not have to fetch every
level's cards through the serial bridge just to draw the bar.
"""

from __future__ import annotations

from pathlib import Path
from typing import cast

from data import database
from data.mastery_repository import CardMasteryRepository
from domain.block_mapping import resolve_category_card_ids
from domain.decks import ALL_DECKS
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-level-progress.db")
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)
    database.init_db()


def _levels_by_slug() -> dict[str, dict[str, object]]:
    code, payload = desktop_bridge._COMMAND_HANDLERS["level-progress"](["level-progress"])
    assert code == 0
    levels = cast(list[dict[str, object]], payload["levels"])
    return {str(entry["slug"]): entry for entry in levels}


def test_reports_every_kanji_and_vocab_level_with_its_deck_size(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    by_slug = _levels_by_slug()

    expected = [f"{family}_{level}" for family in ("kanji", "vocab") for level in ("n5", "n4", "n3", "n2", "n1")]
    assert list(by_slug) == expected
    for slug, entry in by_slug.items():
        assert entry["total"] == len(ALL_DECKS[slug]().cards)
        assert entry["total"] > 0
        assert entry["score_sum"] == 0
        family, level = slug.split("_")
        assert (entry["family"], entry["level"]) == (family, level)


def test_sums_the_stored_counters_for_each_level(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    n5 = ALL_DECKS["kanji_n5"]().cards
    n4 = ALL_DECKS["vocab_n4"]().cards
    repo = CardMasteryRepository()
    repo.set_deck_scores("kanji_n5", {n5[0].id: 4, n5[1].id: 3})
    repo.set_deck_scores("vocab_n4", {n4[0].id: 2})

    by_slug = _levels_by_slug()

    assert by_slug["kanji_n5"]["score_sum"] == 7
    assert by_slug["vocab_n4"]["score_sum"] == 2
    assert by_slug["kanji_n4"]["score_sum"] == 0
    assert by_slug["vocab_n5"]["score_sum"] == 0


def test_topic_deck_answers_count_for_their_level(tmp_path: Path, monkeypatch) -> None:
    """A topic deck stores its answers under the level slug, so the level bar includes them."""
    _use_temp_db(tmp_path, monkeypatch)
    card_id = resolve_category_card_ids("vocab_greetings")[0]

    desktop_bridge.record_game_result("vocab_greetings", card_id, True, minigame="meaning_match")

    assert _levels_by_slug()["vocab_n5"]["score_sum"] == 1


def test_ignores_counters_for_cards_the_level_no_longer_serves(tmp_path: Path, monkeypatch) -> None:
    """A stored row for a card outside the deck (a hidden repeat, or a card since removed)
    must not push the level past what its cards can earn."""
    _use_temp_db(tmp_path, monkeypatch)
    served = {card.id for card in ALL_DECKS["vocab_n4"]().cards}
    stale_id = max(served) + 1
    CardMasteryRepository().set_deck_scores("vocab_n4", {stale_id: 4})

    assert _levels_by_slug()["vocab_n4"]["score_sum"] == 0
