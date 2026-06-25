from __future__ import annotations

import json
from pathlib import Path

from data import database
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-bridge-test.db")


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
    first_card = next(card for card in payload["cards"] if card["id"] == 0)
    assert first_card["curriculum_stage"] == 3


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
