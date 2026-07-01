from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, cast

from data import database
from domain.decks import ALL_DECKS
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-bridge-test.db")


def _build_dictionary_db(path: Path, *, japanese: str, reading: str, gloss: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE dictionary_entries (
              entry_id INTEGER PRIMARY KEY,
              source_id TEXT NOT NULL,
              japanese TEXT NOT NULL,
              reading TEXT NOT NULL,
              gloss TEXT NOT NULL,
              is_common INTEGER NOT NULL DEFAULT 1
            );
            CREATE VIRTUAL TABLE dictionary_fts USING fts5(
              gloss,
              content='dictionary_entries',
              content_rowid='entry_id'
            );
            """
        )
        cursor = conn.execute(
            """
            INSERT INTO dictionary_entries (source_id, japanese, reading, gloss, is_common)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("test-entry", japanese, reading, gloss, 1),
        )
        conn.execute(
            "INSERT INTO dictionary_fts (rowid, gloss) VALUES (?, ?)",
            (cursor.lastrowid, gloss),
        )
        conn.commit()
    finally:
        conn.close()


def test_record_game_result_persists_review_event(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=2,
    )

    assert payload["ok"] is True
    assert payload["card_id"] == 0
    assert payload["curriculum_stage"] == 3

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT quality, script_tag, tags_csv
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 0),
        ).fetchone()

    assert row is not None
    assert row["quality"] == 4
    assert row["script_tag"] == "hiragana"
    assert row["tags_csv"] == "minigame,context_cloze"


def test_record_game_result_persists_session_id_when_provided(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    desktop_bridge.start_session_goal(target_items=3, session_id="session-abc")
    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=2,
        session_id="session-abc",
    )

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT session_id
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 0),
        ).fetchone()

    assert row is not None
    assert row["session_id"] == "session-abc"


def test_record_game_result_persists_confidence_score_when_provided(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="meaning_match",
        confidence_score=5,
    )

    assert payload["confidence_score"] == 5

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT confidence_score
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 0),
        ).fetchone()

    assert row is not None
    assert row["confidence_score"] == 5


def test_start_session_goal_and_load_summary(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    start_payload = desktop_bridge.start_session_goal(
        target_items=2,
        target_accuracy=50,
        session_id="session-1",
    )
    assert start_payload["ok"] is True

    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="context_cloze",
        session_id="session-1",
    )
    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=1,
        is_correct=False,
        minigame="context_cloze",
        session_id="session-1",
    )

    summary_payload = desktop_bridge.get_session_goal_summary("session-1")
    assert summary_payload["ok"] is True
    summary = cast(dict[str, Any], summary_payload["summary"])
    assert summary["completed_items"] == 2
    assert summary["reviewed"] == 2
    assert summary["correct"] == 1
    assert summary["accuracy"] == 50
    assert summary["goal_met"] is True


def test_build_study_queue_payload_returns_card_ids_and_indices(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.build_study_queue_payload("hiragana")
    assert payload["ok"] is True

    queue = cast(dict[str, Any], payload["queue"])
    assert queue["slug"] == "hiragana"

    card_ids = cast(list[int], queue["card_ids"])
    indices = cast(list[int], queue["indices"])
    assert len(card_ids) == len(indices)
    assert len(card_ids) > 0


def test_build_deck_cards_includes_curriculum_stage(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=3,
    )

    payload = desktop_bridge.build_deck_cards("hiragana")
    cards = cast(list[dict[str, object]], payload["cards"])
    first_card = next(card for card in cards if card["id"] == 0)
    assert first_card["curriculum_stage"] == 3
    assert first_card["example_sentence"]
    assert first_card["dictionary_summary"] is None


def test_build_deck_cards_includes_dictionary_summary_when_available(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    target_card = ALL_DECKS["kanji_n5"]().cards[0]
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_dictionary_db(
        dictionary_db_path,
        japanese=target_card.character,
        reading="にち",
        gloss=f"{target_card.meaning}; calendar day; sun marker",
    )
    monkeypatch.setattr(
        desktop_bridge,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = desktop_bridge.build_deck_cards("kanji_n5")
    cards = cast(list[dict[str, object]], payload["cards"])
    enriched_card = next(card for card in cards if card["character"] == target_card.character)
    dictionary_summary = cast(dict[str, object], enriched_card["dictionary_summary"])

    assert dictionary_summary["character"] == target_card.character
    assert dictionary_summary["reading"] == "にち"
    assert dictionary_summary["primary_gloss"] == target_card.meaning
    assert dictionary_summary["glosses"] == [target_card.meaning, "calendar day", "sun marker"]
    assert dictionary_summary["source"] == "offline_dictionary"


def test_build_block_progress_includes_new_phase_one_decks(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    sentence_progress = desktop_bridge.build_block_progress("sentence_examples")
    conjugation_progress = desktop_bridge.build_block_progress("conjugation_training")

    assert sentence_progress["slug"] == "sentence_examples"
    assert conjugation_progress["slug"] == "conjugation_training"
    assert len(sentence_progress["blocks"]) >= 2
    assert len(conjugation_progress["blocks"]) >= 2

    first_sentence_block = sentence_progress["blocks"][0]
    first_conjugation_block = conjugation_progress["blocks"][0]
    assert first_sentence_block["unlocked"] is True
    assert first_conjugation_block["unlocked"] is True
    assert first_sentence_block["card_ids"]
    assert first_conjugation_block["card_ids"]


def test_record_game_result_narrative_tags_chapter_and_updates_context_stage(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=1,
        is_correct=True,
        minigame="narrative_story",
        curriculum_stage=2,
    )

    assert payload["curriculum_stage"] == 3

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT tags_csv
            FROM review_events
            WHERE deck=? AND card_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("Hiragana", 1),
        ).fetchone()

    assert row is not None
    assert row["tags_csv"] == "minigame,narrative_story,chapter_2"


def test_record_game_result_rejects_unknown_card() -> None:
    try:
        desktop_bridge.record_game_result("hiragana", 999999, True, minigame="interleave_mix")
    except ValueError as exc:
        assert "Unknown card id" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown card id")


def test_main_record_result_invalid_boolean_exits_with_error(tmp_path: Path, monkeypatch, capsys) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(
        desktop_bridge.sys,
        "argv",
        [
            "desktop_bridge.py",
            "record-result",
            "hiragana",
            "0",
            "notabool",
            "interleave_mix",
        ],
    )

    code = desktop_bridge.main()
    output = capsys.readouterr().out.strip()

    assert code == 2
    parsed = json.loads(output)
    assert "Invalid boolean flag" in parsed["error"]


def test_main_unknown_command_exits_with_error(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        desktop_bridge.sys,
        "argv",
        [
            "desktop_bridge.py",
            "unknown-cmd",
        ],
    )

    code = desktop_bridge.main()
    output = capsys.readouterr().out.strip()

    assert code == 2
    parsed = json.loads(output)
    assert "Unknown command" in parsed["error"]


def test_build_summary_includes_extended_script_curriculum_maps(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    summary = cast(dict[str, Any], desktop_bridge.build_summary())
    curriculum = cast(dict[str, Any], summary["curriculum"])
    context_by_script = cast(dict[str, object], curriculum["context_cloze_by_script"])
    narrative_by_script = cast(dict[str, object], curriculum["narrative_story_by_script"])

    context_keys = set(context_by_script.keys())
    narrative_keys = set(narrative_by_script.keys())

    expected = {"hiragana", "katakana", "kanji_n5", "vocab_n5", "grammar_patterns"}
    assert context_keys == expected
    assert narrative_keys == expected


def test_build_summary_resolves_legacy_vocab_prompt_text(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    database.init_db()

    database.log_review(
        "Vocabulary N5",
        496,
        4,
        script_tag="vocab_n5",
        prompt_text="",
    )

    summary = cast(dict[str, Any], desktop_bridge.build_summary())
    item_history = cast(list[dict[str, Any]], summary["item_history"])
    assert item_history, "Expected at least one timeline item"
    assert item_history[0]["card_id"] == 496
    assert item_history[0]["prompt"] != "Vocabulary N5 item #496"


def test_build_summary_contract_shape(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.build_summary()
    expected_top_level = {
        "decks",
        "streak",
        "activity",
        "mistakes",
        "curriculum",
        "item_history",
    }
    assert expected_top_level.issubset(payload.keys())

    decks = cast(list[dict[str, Any]], payload["decks"])
    assert decks
    first = decks[0]
    assert {"slug", "name", "total", "mastered", "due_today", "completed_today"}.issubset(first.keys())
    slugs = {deck["slug"] for deck in decks}
    assert {"sentence_examples", "conjugation_training"}.issubset(slugs)


def test_apply_expertise_level_n5_foundation_marks_target_decks_mastered(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    response = desktop_bridge.apply_expertise_level("jlpt_n5_foundation")
    assert response["ok"] is True
    assert response["level"] == "jlpt_n5_foundation"

    summary = cast(dict[str, Any], desktop_bridge.build_summary())
    decks = cast(list[dict[str, Any]], summary["decks"])
    by_slug = {deck["slug"]: deck for deck in decks}

    for slug in (
        "hiragana",
        "katakana",
        "kanji_n5",
        "kanji_numbers_time",
        "vocab_n5",
        "vocab_greetings",
        "vocab_numbers",
    ):
        deck = by_slug[slug]
        assert deck["total"] > 0
        assert deck["mastered"] == deck["total"]


def test_start_session_goal_contract_shape(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.start_session_goal(target_items=3, target_minutes=15, target_accuracy=70, session_id="shape-session")
    assert payload["ok"] is True

    goal = cast(dict[str, Any], payload["goal"])
    expected_goal_keys = {
        "session_id",
        "target_items",
        "target_minutes",
        "target_accuracy",
        "started_at_utc",
    }
    assert expected_goal_keys.issubset(goal.keys())
    assert goal["session_id"] == "shape-session"


def test_track_assistant_event_persists_interaction(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.track_assistant_event(
        event_id=3,
        interaction_type="clicked",
        metadata={"reason": "cta", "target_mode": "context_cloze"},
    )

    assert payload["ok"] is True

    with database._connect() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            """
            SELECT event_id, interaction_type, metadata_json
            FROM assistant_event_interactions
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    assert row is not None
    assert row["event_id"] == 3
    assert row["interaction_type"] == "clicked"
    metadata = cast(dict[str, str], json.loads(str(row["metadata_json"])))
    assert metadata["reason"] == "cta"
    assert metadata["target_mode"] == "context_cloze"


def test_get_assistant_chat_context_returns_compact_context(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.get_assistant_chat_context(user_message="need kanji help")
    assert payload["ok"] is True

    context = cast(dict[str, str], payload["context"])
    assert "persona" in context
    assert "emotional_state" in context
    assert "memory" in context


def test_record_game_result_contract_shape(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="context_cloze",
        curriculum_stage=1,
        confidence_score=4,
    )

    expected_keys = {
        "ok",
        "card_id",
        "repetitions",
        "interval",
        "next_review",
        "ease_factor",
        "confidence_score",
        "curriculum_stage",
    }
    assert expected_keys.issubset(payload.keys())
    assert payload["ok"] is True
    assert payload["card_id"] == 0


