"""Bridge-level behaviour for the per-card mastery counter (issue #66)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from data import database
from domain.decks import ALL_DECKS
from domain.mastery import CARD_MASTERY_MAX
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-mastery-bridge.db")
    # The bridge caches one repository per process; drop it so each test binds to
    # its own temporary database rather than whichever ran first.
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)
    database.init_db()


def _first_card_id(slug: str) -> int:
    return ALL_DECKS[slug]().cards[0].id


def _stored_scores() -> dict[str, dict[int, int]]:
    """The persisted counters, narrowed from the bridge's dict[str, object] payload."""
    return cast(dict[str, dict[int, int]], desktop_bridge.build_card_mastery_scores()["scores"])


def test_record_result_returns_and_persists_the_counter(tmp_path: Path, monkeypatch) -> None:
    """The counter rides on the existing write call, so no extra round-trip."""
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")

    first = desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match")
    second = desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match")

    assert first["mastery_score"] == 1
    assert second["mastery_score"] == 2
    stored = _stored_scores()
    assert stored["hiragana"][card_id] == 2


def test_wrong_answer_steps_the_counter_down(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")

    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match")
    result = desktop_bridge.record_game_result("hiragana", card_id, False, minigame="meaning_match")

    assert result["mastery_score"] == 0


def test_card_scores_starts_empty(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    assert desktop_bridge.build_card_mastery_scores() == {"scores": {}}


def test_import_resolves_legacy_sections_to_owning_decks(tmp_path: Path, monkeypatch) -> None:
    """The migration that makes existing mastery survive the move.

    Legacy data was keyed by ``ScriptKey`` section, so every kanji score N5–N1 sat
    in one ``kanji_n5`` bucket. Each card id has to be resolved to the deck that
    actually owns it, which only Python can do.

    A card reached through a thematic category resolves to the *level* deck that
    owns it: since issue #78 vocabulary categories are views over their parent, so
    ``vocab_greetings`` and ``vocab_n5`` name the same card ids. That single owner
    is the point — it is what stops one word carrying two independent mastery
    values. Kanji no longer has category decks at all; its themes are block
    definitions that allocate no ids, so the level deck is the only owner there.
    """
    _use_temp_db(tmp_path, monkeypatch)
    kanji_card = _first_card_id("kanji_n5")
    vocab_card = _first_card_id("vocab_greetings")

    result = desktop_bridge.import_legacy_card_scores(
        {
            "kanji_n5": {str(kanji_card): 3},
            "vocab_n5": {str(vocab_card): CARD_MASTERY_MAX},
        }
    )

    assert result["imported"] is True
    assert result["cards_imported"] == 2
    assert result["cards_unresolved"] == 0

    stored = _stored_scores()
    assert stored["kanji_n5"][kanji_card] == 3
    assert stored["vocab_n5"][vocab_card] == CARD_MASTERY_MAX
    assert "vocab_greetings" not in stored


def test_import_counts_unresolvable_card_ids_instead_of_failing(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    result = desktop_bridge.import_legacy_card_scores({"kanji_n5": {"99999999": 2}})

    assert result["imported"] is True
    assert result["cards_imported"] == 0
    assert result["cards_unresolved"] == 1


def test_import_ignores_unknown_sections_and_malformed_entries(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")

    result = desktop_bridge.import_legacy_card_scores(
        {
            "not_a_section": {"1": 2},
            "hiragana": {str(card_id): 2, "not_a_number": 3},
        }
    )

    assert result["cards_imported"] == 1
    assert result["cards_unresolved"] == 2


def test_import_clamps_out_of_range_legacy_values(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")

    desktop_bridge.import_legacy_card_scores({"hiragana": {str(card_id): 999}})

    stored = _stored_scores()
    assert stored["hiragana"][card_id] == CARD_MASTERY_MAX


def test_import_will_not_overwrite_progress_recorded_since(tmp_path: Path, monkeypatch) -> None:
    """Replaying the import must not clobber newer scores.

    Without this gate a stale localStorage blob replayed after a few sessions
    would roll mastery backwards — a fresh instance of the drift #66 is about.
    """
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")
    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match")

    result = desktop_bridge.import_legacy_card_scores({"hiragana": {str(card_id): CARD_MASTERY_MAX}})

    assert result["imported"] is False
    assert result["cards_imported"] == 0
    stored = _stored_scores()
    assert stored["hiragana"][card_id] == 1


def test_import_command_rejects_malformed_json(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    code, payload = desktop_bridge._cmd_import_card_scores(["import-card-scores", "{not json"])
    assert code == 2
    assert "error" in payload

    code, payload = desktop_bridge._cmd_import_card_scores(["import-card-scores", "[]"])
    assert code == 2
    assert "error" in payload


def test_import_command_round_trips_json(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    card_id = _first_card_id("hiragana")

    code, payload = desktop_bridge._cmd_import_card_scores(
        ["import-card-scores", json.dumps({"hiragana": {str(card_id): 2}})]
    )

    assert code == 0
    assert payload["cards_imported"] == 1


def test_card_scores_command_is_registered(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    code, payload = desktop_bridge._cmd_card_scores(["card-scores"])
    assert code == 0
    assert payload == {"scores": {}}
