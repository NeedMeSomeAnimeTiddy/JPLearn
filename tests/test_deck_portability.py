from __future__ import annotations

from datetime import date
from pathlib import Path

from data import database
from data.deck_portability import export_progress_snapshot, import_progress_snapshot
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def test_export_progress_snapshot_includes_progress_and_custom_decks(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=2, interval=4, next_review=date(2026, 7, 1)),
    )
    database.log_review(
        "Hiragana",
        1,
        4,
        reviewed_on=date(2026, 6, 26),
        reviewed_at_utc="2026-06-26T12:00:00+00:00",
        script_tag="hiragana",
        prompt_text="あ",
        tags=["review"],
        session_id="s1",
    )
    database.save_curriculum_stage("Hiragana", 1, "context_cloze", 2)
    database.save_session_goal("s1", target_items=10)
    database.update_leech_state_for_card("Hiragana", 1)

    snapshot = export_progress_snapshot()

    assert snapshot["format_version"] == 1
    assert snapshot["custom_decks"] == []
    progress = snapshot["progress"]
    assert len(progress["review_states"]) == 1
    assert len(progress["review_events"]) == 1
    assert len(progress["curriculum_stages"]) == 1
    assert len(progress["session_goals"]) == 1
    assert len(progress["leech_items"]) == 1


def test_import_progress_snapshot_merge_updates_and_dedupes_events(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=1, interval=2, next_review=date(2026, 6, 30)),
    )
    database.log_review(
        "Hiragana",
        1,
        4,
        reviewed_on=date(2026, 6, 26),
        reviewed_at_utc="2026-06-26T12:00:00+00:00",
        script_tag="hiragana",
        prompt_text="あ",
    )

    payload = {
        "format_version": 1,
        "progress": {
            "review_states": [
                {
                    "deck": "Hiragana",
                    "card_id": 1,
                    "ease_factor": 2.5,
                    "interval": 8,
                    "repetitions": 4,
                    "next_review": "2026-07-05",
                }
            ],
            "review_events": [
                {
                    "deck": "Hiragana",
                    "card_id": 1,
                    "quality": 4,
                    "reviewed_on": "2026-06-26",
                    "reviewed_at_utc": "2026-06-26T12:00:00+00:00",
                    "script_tag": "hiragana",
                    "curriculum_stage": None,
                    "prompt_text": "あ",
                    "tags_csv": "",
                    "session_id": "",
                    "confidence_score": None,
                },
                {
                    "deck": "Hiragana",
                    "card_id": 1,
                    "quality": 2,
                    "reviewed_on": "2026-06-27",
                    "reviewed_at_utc": "2026-06-27T12:00:00+00:00",
                    "script_tag": "hiragana",
                    "curriculum_stage": 2,
                    "prompt_text": "あ",
                    "tags_csv": "review",
                    "session_id": "",
                    "confidence_score": None,
                },
            ],
            "curriculum_stages": [],
            "leech_items": [],
            "session_goals": [],
        },
        "custom_decks": [{"name": "User Deck"}],
    }

    summary = import_progress_snapshot(payload, conflict_mode="merge")
    assert summary["review_states"] == 1
    assert summary["review_events"] == 1
    assert summary["custom_decks"] == 1

    state = database.load_states("Hiragana", [1])[1]
    assert state.interval == 8
    history = database.load_raw_item_history(limit_items=8, events_per_item=8)
    assert len(history) == 1
    assert len(history[0].events) == 2


def test_import_progress_snapshot_overwrite_replaces_existing_progress(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    database.save_state(
        "Old Deck",
        ReviewState(card_id=9, repetitions=1, interval=2, next_review=date(2026, 7, 1)),
    )

    payload = {
        "format_version": 1,
        "progress": {
            "review_states": [
                {
                    "deck": "New Deck",
                    "card_id": 3,
                    "ease_factor": 2.5,
                    "interval": 3,
                    "repetitions": 2,
                    "next_review": "2026-07-02",
                }
            ],
            "review_events": [],
            "curriculum_stages": [],
            "leech_items": [],
            "session_goals": [],
        },
        "custom_decks": [],
    }

    import_progress_snapshot(payload, conflict_mode="overwrite")

    old_state = database.load_states("Old Deck", [9])[9]
    new_state = database.load_states("New Deck", [3])[3]
    assert old_state.repetitions == 0
    assert new_state.repetitions == 2


def test_import_progress_snapshot_rejects_invalid_conflict_mode(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload = {
        "format_version": 1,
        "progress": {
            "review_states": [],
            "review_events": [],
            "curriculum_stages": [],
            "leech_items": [],
            "session_goals": [],
        },
        "custom_decks": [],
    }

    try:
        import_progress_snapshot(payload, conflict_mode="replace")
    except ValueError as exc:
        assert "conflict_mode" in str(exc)
    else:
        raise AssertionError("Expected ValueError for invalid conflict mode")
