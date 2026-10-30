"""The Drills screen's per-mode record, rebuilt from review history (audit 17, F1)."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest

from data import database
from domain.mistakes import MinigameModeRecord, minigame_mode_from_tags, summarize_minigame_answers
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> Path:
    db_path = tmp_path / "jplearn-test.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    database.init_db()
    return db_path


def _add_events(db_path: Path, rows: list[tuple[str, str, int]]) -> None:
    """Append ``(deck, tags_csv, quality)`` review events in the given order."""
    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            "INSERT INTO review_events (deck, card_id, quality, reviewed_on, tags_csv) VALUES (?, 1, ?, '2026-10-30', ?)",
            [(deck, quality, tags) for deck, tags, quality in rows],
        )


# ---- the pure fold ----

def test_mode_is_the_second_tag() -> None:
    assert minigame_mode_from_tags("minigame,imposter,chapter_2") == "imposter"
    assert minigame_mode_from_tags("minigame,meaning_match") == "meaning_match"
    assert minigame_mode_from_tags("review") is None
    assert minigame_mode_from_tags("minigame") is None
    assert minigame_mode_from_tags("minigame,") is None


def test_best_run_is_the_longest_correct_run_per_mode() -> None:
    answers = [
        ("meaning_match", True),
        ("romaji_sprint", False),  # another mode in between does not break meaning_match's run
        ("meaning_match", True),
        ("meaning_match", True),
        ("meaning_match", False),
        ("meaning_match", True),
        ("romaji_sprint", True),
    ]

    records = summarize_minigame_answers(answers)

    assert records == [
        MinigameModeRecord(mode="meaning_match", attempted=5, correct=4, best_run=3),
        MinigameModeRecord(mode="romaji_sprint", attempted=2, correct=1, best_run=1),
    ]


def test_no_answers_no_records() -> None:
    assert summarize_minigame_answers([]) == []


# ---- the database read ----

def test_records_read_named_decks_and_prefixes_in_answer_order(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    _add_events(db_path, [
        ("Kanji N3", "minigame,imposter,chapter_2", 4),
        ("Kanji: N3 · Governance", "minigame,imposter", 4),
        ("Kanji N3", "minigame,imposter", 1),
        ("Kanji N4", "minigame,imposter", 4),  # an adjacent level is not read
        ("Kanji N3", "review", 4),  # not a minigame answer
    ])

    records = database.load_minigame_mode_records(["Kanji N3"], ["Kanji: N3 · "])

    assert records == [MinigameModeRecord(mode="imposter", attempted=3, correct=2, best_run=2)]


def test_records_with_no_names_read_nothing(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    assert database.load_minigame_mode_records([], []) == []


def test_breakdown_joins_chapter_tags_to_their_mode(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    _add_events(db_path, [
        ("Hiragana", "minigame,imposter", 4),
        ("Hiragana", "minigame,imposter,chapter_1", 1),
        ("Hiragana", "minigame,imposter,chapter_2", 4),
        ("Hiragana", "minigame,meaning_match", 4),
    ])

    rows = database.load_minigame_breakdown()

    assert [(row.minigame, row.attempts, row.correct, row.accuracy) for row in rows] == [
        ("imposter", 3, 2, 67),
        ("meaning_match", 1, 1, 100),
    ]


# ---- the bridge command ----

def test_level_and_topic_slugs_read_the_same_level_record(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    old_topic_name = desktop_bridge.CATEGORY_SOURCE_DECKS["vocab_greetings"]().name
    _add_events(db_path, [
        ("Vocabulary N5", "minigame,meaning_match", 4),
        (old_topic_name, "minigame,meaning_match", 4),  # recorded under the topic deck before #78
        ("Vocabulary N4", "minigame,meaning_match", 1),
    ])

    level = desktop_bridge.build_minigame_records_payload("vocab_n5")
    topic = desktop_bridge.build_minigame_records_payload("vocab_greetings")

    assert level == topic == {
        "records": [{"mode": "meaning_match", "attempted": 2, "correct": 2, "best_run": 2}]
    }


def test_retired_kanji_topics_count_for_their_level(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    _add_events(db_path, [
        ("Kanji: N5 · Numbers & Time", "minigame,romaji_sprint", 4),
        ("Kanji N5", "minigame,romaji_sprint", 4),
        ("Kanji: N4 · Daily Life", "minigame,romaji_sprint", 1),
    ])

    n5 = desktop_bridge.build_minigame_records_payload("kanji_n5")
    n4 = desktop_bridge.build_minigame_records_payload("kanji_n4")

    assert n5["records"] == [{"mode": "romaji_sprint", "attempted": 2, "correct": 2, "best_run": 2}]
    assert n4["records"] == [{"mode": "romaji_sprint", "attempted": 1, "correct": 0, "best_run": 0}]


@pytest.mark.parametrize("slug", ["vocab_n9", "kanji_n5_made_up", "", "../hiragana"])
def test_unknown_slug_is_refused(slug: str) -> None:
    with pytest.raises(ValueError):
        desktop_bridge.build_minigame_records_payload(slug)

    code, payload = desktop_bridge._cmd_minigame_records(["minigame-records", slug])
    assert code == 2
    assert "error" in payload


def test_command_needs_a_slug() -> None:
    code, payload = desktop_bridge._cmd_minigame_records(["minigame-records"])

    assert code == 2
    assert "Usage" in str(payload["error"])


def test_a_large_history_reads_quickly(tmp_path: Path, monkeypatch) -> None:
    """The read runs on the serial bridge, so it must stay well under a second."""
    db_path = _use_temp_db(tmp_path, monkeypatch)
    modes = ["meaning_match", "romaji_sprint", "imposter", "typed_recall"]
    _add_events(db_path, [
        ("Vocabulary N5" if index % 2 else "Vocabulary N4", f"minigame,{modes[index % 4]}", 4 if index % 3 else 1)
        for index in range(50_000)
    ])

    started = time.perf_counter()
    payload = desktop_bridge.build_minigame_records_payload("vocab_n5")
    elapsed = time.perf_counter() - started

    assert sum(record["attempted"] for record in payload["records"]) == 25_000
    assert elapsed < 1.0
