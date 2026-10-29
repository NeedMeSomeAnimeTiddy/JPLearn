"""Audit 12 (progression and onboarding): the checklist seeds only what is ticked (F1), the seals
for steps nothing measures (F3), and a step's mastered date surviving later syncs (F4)."""
from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path

import pytest

from data import database
from domain.decks import ALL_DECKS
from domain.progression_curriculum import JPLEARN_GRAPH, MEASURED_NODE_IDS
from scripts import desktop_bridge


@pytest.fixture(autouse=True)
def _temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn.db")
    database.init_db()


def _seeded_decks() -> set[str]:
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        return {row[0] for row in conn.execute("SELECT DISTINCT deck FROM review_states")}


def _master(slug: str) -> None:
    for card in ALL_DECKS[slug]().cards:
        desktop_bridge.record_game_result(slug=slug, card_id=card.id, is_correct=True, minigame="meaning_match")


# --- F1 --------------------------------------------------------------------------------------


def test_one_tick_seeds_only_its_own_decks() -> None:
    response = desktop_bridge.apply_known_items(["vocab_n5"])

    decks = _seeded_decks()
    assert ALL_DECKS["vocab_n5"]().name in decks
    for slug in ("hiragana", "katakana", "kanji_n5"):
        assert ALL_DECKS[slug]().name not in decks, slug
    assert response["items"] == ["vocab_n5"]
    assert response["seeded_cards"] > 0


def test_n3_ticks_seed_n3_alone() -> None:
    desktop_bridge.apply_known_items(["kanji_n3"])
    assert _seeded_decks() == {ALL_DECKS["kanji_n3"]().name}


def test_duplicate_ticks_seed_once_and_no_ticks_seed_nothing() -> None:
    assert desktop_bridge.apply_known_items([]) == {"ok": True, "items": [], "seeded_cards": 0, "decks": []}
    response = desktop_bridge.apply_known_items(["hiragana", "HIRAGANA "])
    assert response["items"] == ["hiragana"]
    assert response["decks"] == [ALL_DECKS["hiragana"]().name]


def test_an_unknown_tick_is_refused_before_anything_is_written() -> None:
    with pytest.raises(ValueError):
        desktop_bridge.apply_known_items(["hiragana", "n3_plus"])
    assert _seeded_decks() == set()
    code, payload = desktop_bridge._cmd_apply_known_items(["apply-known-items", "jlpt_n5_foundation"])
    assert code == 2
    assert "Unknown checklist item" in str(payload["error"])


# --- F3 --------------------------------------------------------------------------------------


def test_only_measured_steps_and_the_two_reached_steps_carry_seals() -> None:
    with_seals = {
        node_id
        for node_id, node in JPLEARN_GRAPH.nodes.items()
        if any(reward.reward_type == "milestone" for reward in node.rewards)
    }
    unmeasured_with_seals = with_seals - MEASURED_NODE_IDS
    assert unmeasured_with_seals == {"free_conv", "reading"}


def test_reaching_free_conversation_and_reading_earns_their_seals() -> None:
    desktop_bridge.set_setting("onboarding_complete", "1")
    for slug in ("hiragana", "katakana", "vocab_n5", "grammar_patterns", "kanji_n5"):
        for _ in range(3):
            _master(slug)

    status = desktop_bridge.build_achievement_milestones_status()
    by_descriptor = {b["descriptor"]: b for b in status["node_mastery_badges"]}

    assert by_descriptor["free_conversation_unlocked"]["earned"] is True
    assert by_descriptor["reading_unlocked"]["earned"] is True
    for hidden in ("scripted_conversation_complete", "jlpt_n5_passed", "jlpt_n1_passed"):
        assert hidden not in by_descriptor
    assert "jlpt_n5_passed" not in database.load_badges()


# --- F4 --------------------------------------------------------------------------------------


def test_a_steps_mastered_date_survives_later_syncs() -> None:
    desktop_bridge.set_setting("onboarding_complete", "1")
    _master("hiragana")

    dates = []
    for _ in range(3):
        desktop_bridge.build_progression_status()
        row = next(r for r in database.load_user_progression() if r["node_id"] == "hiragana")
        dates.append(row["mastered_at"])
    assert dates == [date.today().isoformat()] * 3


def test_an_unreadable_stored_date_reads_as_none() -> None:
    assert desktop_bridge._stored_date("not a date") is None
    assert desktop_bridge._stored_date(None) is None
    assert desktop_bridge._stored_date("2026-10-29T00:00:00") == date(2026, 10, 29)
