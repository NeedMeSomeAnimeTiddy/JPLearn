"""One card, one mastery counter, whichever deck slug it arrives under; and backups keep the counters.

Audit 2 (2026-10-27):
F1: the 28 vocabulary topic decks are views over their level deck's cards (#78). A daily-games pool
built from every ``vocab_`` slug could hand a word out under a topic slug, and a missed-word review
of it then stepped a second counter, keyed by the topic slug, beside the level deck's.
F5: the "full backup" left out ``card_mastery_scores``, which cannot be rebuilt from review history.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import date, timedelta
from typing import Any

import pytest

from data import database
from data.daily_games_repository import DailyGamesRepository
from data.deck_portability import FORMAT_VERSION, export_progress_snapshot, import_progress_snapshot
from data.mastery_repository import CardMasteryRepository
from domain.block_mapping import parent_slug_for_category
from domain.daily_games import select_daily_word_pool
from domain.decks import ALL_DECKS
from scripts import desktop_bridge

_LEVEL_SLUGS = {f"vocab_n{level}" for level in range(1, 6)}


@pytest.fixture(autouse=True)
def _fresh_mastery_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)


def _mastery_rows() -> list[tuple[Any, ...]]:
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        return sorted(conn.execute("SELECT deck, card_id, score FROM card_mastery_scores").fetchall())


def _topic_word() -> tuple[str, int]:
    """A topic deck and one of its cards (which is a vocab_n5 card)."""
    slug = "vocab_verbs"
    assert parent_slug_for_category(slug) == "vocab_n5"
    return slug, ALL_DECKS[slug]().cards[0].id


# --- F1 --------------------------------------------------------------------------------------


def test_daily_games_candidates_come_from_the_level_decks_only() -> None:
    database.init_db()
    candidates = desktop_bridge._daily_games_candidates(DailyGamesRepository())

    assert {candidate.deck_slug for candidate in candidates} == _LEVEL_SLUGS
    for offset in range(14):
        pool = select_daily_word_pool(candidates, date(2026, 10, 27) + timedelta(days=offset))
        assert {word.deck_slug for word in pool.words} <= _LEVEL_SLUGS


def test_an_answer_under_a_topic_slug_steps_the_level_decks_counter() -> None:
    topic_slug, card_id = _topic_word()

    level = desktop_bridge.record_game_result("vocab_n5", card_id, True, minigame="meaning_match")
    topic = desktop_bridge.record_game_result(topic_slug, card_id, True, minigame="meaning_match")

    assert _mastery_rows() == [("vocab_n5", card_id, 2)]
    assert (level["mastery_score"], topic["mastery_score"]) == (1, 2)


def test_the_xp_repeat_guard_keys_a_topic_answer_by_its_level_deck() -> None:
    topic_slug, card_id = _topic_word()

    desktop_bridge.record_game_result(topic_slug, card_id, True, minigame="meaning_match")

    keys = desktop_bridge._load_user_progress().applied_dedup_keys
    assert keys and all(key.startswith(f"correct:vocab_n5:{card_id}:") for key in keys)


# --- F5 --------------------------------------------------------------------------------------


def _snapshot(version: int, **progress: list[dict[str, Any]]) -> dict[str, Any]:
    base = {"review_states": [], "review_events": [], "curriculum_stages": [], "leech_items": [], "session_goals": []}
    return {"format_version": version, "progress": {**base, **progress}, "custom_decks": []}


def test_a_backup_carries_the_mastery_counters_and_restores_them() -> None:
    database.init_db()
    repository = CardMasteryRepository()
    repository.apply_result("hiragana", 3, is_correct=True)
    repository.apply_result("hiragana", 3, is_correct=True)
    repository.apply_result("vocab_n5", 647, is_correct=True)

    snapshot = export_progress_snapshot()
    assert snapshot["format_version"] == FORMAT_VERSION == 2
    assert snapshot["progress"]["card_mastery_scores"] == [
        {"deck_slug": "hiragana", "card_id": 3, "score": 2},
        {"deck_slug": "vocab_n5", "card_id": 647, "score": 1},
    ]

    database.reset_db()
    summary = import_progress_snapshot(snapshot, conflict_mode="merge")

    assert summary.counters_updated == 2
    assert _mastery_rows() == [("hiragana", 3, 2), ("vocab_n5", 647, 1)]


def test_an_overwrite_import_replaces_the_counters_it_carries() -> None:
    database.init_db()
    CardMasteryRepository().apply_result("katakana", 9, is_correct=True)

    import_progress_snapshot(
        _snapshot(2, card_mastery_scores=[{"deck_slug": "hiragana", "card_id": 1, "score": 4}]),
        conflict_mode="overwrite",
    )

    assert _mastery_rows() == [("hiragana", 1, 4)]


def test_a_version_1_backup_still_imports_and_leaves_the_counters_alone() -> None:
    database.init_db()
    CardMasteryRepository().apply_result("katakana", 9, is_correct=True)

    for mode in ("merge", "overwrite"):
        summary = import_progress_snapshot(_snapshot(1), conflict_mode=mode)
        assert summary.counters_updated == 0
        assert _mastery_rows() == [("katakana", 9, 1)]


def test_imported_counters_under_a_topic_slug_land_on_the_level_deck_and_stay_in_range() -> None:
    database.init_db()
    topic_slug, card_id = _topic_word()

    import_progress_snapshot(
        _snapshot(2, card_mastery_scores=[
            {"deck_slug": topic_slug, "card_id": card_id, "score": 3},
            {"deck_slug": "vocab_n5", "card_id": card_id, "score": 1},
            {"deck_slug": "hiragana", "card_id": 2, "score": 9},
        ]),
        conflict_mode="merge",
    )

    assert _mastery_rows() == [("hiragana", 2, 4), ("vocab_n5", card_id, 3)]


def test_an_imported_topic_counter_for_a_card_the_topic_lacks_keeps_its_own_slug() -> None:
    database.init_db()
    topic_slug, _ = _topic_word()
    stray = max(card.id for card in ALL_DECKS["vocab_n5"]().cards) + 1

    import_progress_snapshot(
        _snapshot(2, card_mastery_scores=[{"deck_slug": topic_slug, "card_id": stray, "score": 2}]),
        conflict_mode="merge",
    )

    assert _mastery_rows() == [(topic_slug, stray, 2)]


@pytest.mark.parametrize(
    "row",
    [
        {"deck_slug": "", "card_id": 1, "score": 1},
        {"deck_slug": "hiragana", "card_id": -1, "score": 1},
        {"deck_slug": "hiragana", "card_id": 1, "score": "2"},
    ],
)
def test_a_malformed_counter_row_refuses_the_whole_import(row: dict[str, Any]) -> None:
    database.init_db()
    with pytest.raises(ValueError):
        import_progress_snapshot(_snapshot(2, card_mastery_scores=[row]), conflict_mode="merge")
    assert _mastery_rows() == []
