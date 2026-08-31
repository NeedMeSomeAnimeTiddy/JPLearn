from __future__ import annotations

import json
import io
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, cast

import pytest

from data import database
from data import dictionary_repository
from data.daily_games_repository import DailyGameAttempt, DailyGameWordOutcome, DailyGamesRepository
from domain.cards import Card, Deck
from domain.decks import ALL_DECKS
from domain.daily_games import DailyGamesStreakState, DailyGameWord, DailyWordPool
from domain.scheduler import ReviewState
from scripts import desktop_bridge


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-bridge-test.db")


def _build_dictionary_db(
    path: Path,
    *,
    japanese: str,
    reading: str,
    gloss: str,
    source_id: str = "test-entry",
    entry_id: int = 1,
) -> None:
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
            INSERT INTO dictionary_entries
              (entry_id, source_id, japanese, reading, gloss, is_common)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (entry_id, source_id, japanese, reading, gloss, 1),
        )
        conn.execute(
            "INSERT INTO dictionary_fts (rowid, gloss) VALUES (?, ?)",
            (cursor.lastrowid, gloss),
        )
        conn.commit()
    finally:
        conn.close()


def _build_dictionary_db_many(path: Path, rows: list[tuple[str, str, str, int]]) -> None:
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
        for index, (japanese, reading, gloss, is_common) in enumerate(rows, start=1):
            cursor = conn.execute(
                """
                INSERT INTO dictionary_entries (source_id, japanese, reading, gloss, is_common)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"test-entry-{index}", japanese, reading, gloss, is_common),
            )
            conn.execute(
                "INSERT INTO dictionary_fts (rowid, gloss) VALUES (?, ?)",
                (cursor.lastrowid, gloss),
            )
        conn.commit()
    finally:
        conn.close()


def _build_kanji_detail_db(
    path: Path,
    *,
    character: str = "日",
    meanings_json: str = '["day", "sun"]',
    jlpt_level: str | None = "N5",
) -> None:
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
            CREATE TABLE dictionary_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE kanji_details (
              character TEXT PRIMARY KEY,
              meanings_json TEXT NOT NULL,
              on_readings_json TEXT NOT NULL,
              kun_readings_json TEXT NOT NULL,
              jlpt_level TEXT,
              stroke_count INTEGER,
              classical_radical_number INTEGER
            );
            CREATE TABLE kanji_radicals (
              character TEXT NOT NULL,
              position INTEGER NOT NULL,
              radical TEXT NOT NULL,
              stroke_count INTEGER,
              code TEXT,
              PRIMARY KEY (character, position)
            );
            CREATE TABLE dictionary_kanji_index (
              character TEXT NOT NULL,
              entry_id INTEGER NOT NULL,
              PRIMARY KEY (character, entry_id)
            );
            CREATE INDEX idx_dictionary_kanji_index_character_entry
              ON dictionary_kanji_index(character, entry_id);
            """
        )
        metadata = {
            "schema_version": "4",
            "kanji_details_count": "1",
            "kanji_radicals_count": "2" if character == "日" else "0",
            "dictionary_kanji_index_count": "13" if character == "日" else "0",
        }
        conn.executemany(
            "INSERT INTO dictionary_metadata (key, value) VALUES (?, ?)",
            metadata.items(),
        )
        conn.execute(
            """
            INSERT INTO kanji_details (
              character, meanings_json, on_readings_json, kun_readings_json,
              jlpt_level, stroke_count, classical_radical_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                character,
                meanings_json,
                '["ニチ", "ジツ"]' if character == "日" else "[]",
                '["ひ", "-び"]' if character == "日" else "[]",
                jlpt_level,
                4 if character == "日" else None,
                72 if character == "日" else None,
            ),
        )
        if character == "日":
            conn.executemany(
                """
                INSERT INTO kanji_radicals
                  (character, position, radical, stroke_count, code)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    ("日", 0, "日", 4, "js72"),
                    ("日", 1, "一", 1, None),
                ],
            )
            exact_entries = [
                (1, "exact-common-1", "日", "にち", "day", 1),
                (2, "exact-uncommon", "日", "にち", "counter for days", 0),
                (3, "exact-common-2", "日", "ニチ", "sun", 1),
                (4, "exact-kun", "日", "ひ", "sunlight", 1),
            ]
            compound_entries = [
                (
                    index,
                    f"compound-{index}",
                    word,
                    reading,
                    gloss,
                    0 if word == "日本" else 1,
                )
                for index, (word, reading, gloss) in enumerate(
                    [
                        ("日本", "にほん", "Japan"),
                        ("日光", "にっこう", "sunlight"),
                        ("毎日", "まいにち", "every day"),
                        ("休日", "きゅうじつ", "holiday"),
                        ("日記", "にっき", "diary"),
                        ("日程", "にってい", "schedule"),
                        ("本日", "ほんじつ", "today"),
                        ("明日", "あした", "tomorrow"),
                        ("平日", "へいじつ", "weekday"),
                        ("祝日", "しゅくじつ", "public holiday"),
                        ("日常", "にちじょう", "everyday life"),
                        ("近日", "きんじつ", "soon"),
                        ("先日", "せんじつ", "the other day"),
                    ],
                    start=5,
                )
            ]
            conn.executemany(
                """
                INSERT INTO dictionary_entries
                  (entry_id, source_id, japanese, reading, gloss, is_common)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [*exact_entries, *compound_entries],
            )
            conn.executemany(
                "INSERT INTO dictionary_kanji_index (character, entry_id) VALUES (?, ?)",
                [("日", entry[0]) for entry in compound_entries],
            )
        conn.commit()
    finally:
        conn.close()


def _add_pitch_accent(
    path: Path,
    *,
    word: str,
    reading: str,
    pitch_positions: list[int],
    mora_count: int,
) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE dictionary_pitch_accents (
              word TEXT NOT NULL,
              reading TEXT NOT NULL,
              pitch_positions TEXT NOT NULL,
              mora_count INTEGER NOT NULL,
              source TEXT NOT NULL,
              PRIMARY KEY (word, reading)
            );
            """
        )
        conn.execute(
            """
            INSERT INTO dictionary_pitch_accents
              (word, reading, pitch_positions, mora_count, source)
            VALUES (?, ?, ?, ?, ?)
            """,
            (word, reading, json.dumps(pitch_positions), mora_count, "Kanjium test data"),
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
        minigame="particle_cloze",
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
    assert row["tags_csv"] == "minigame,particle_cloze"


def test_record_game_result_persists_session_id_when_provided(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    desktop_bridge.start_session_goal(target_items=3, session_id="session-abc")
    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="particle_cloze",
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


def test_record_game_result_milestones_reached_empty_when_no_threshold_crossed(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
    )

    assert payload["milestones_reached"] == []


def test_record_game_result_reports_newly_crossed_review_milestone(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for _ in range(99):
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
        )

    payload = desktop_bridge.record_game_result(
        slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
    )

    assert payload["milestones_reached"] == ["reviews_100"]


def test_build_achievement_milestones_status_reports_totals_and_earned_state(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for _ in range(100):
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
        )

    status = desktop_bridge.build_achievement_milestones_status()

    assert status["total_reviews"] == 100
    milestones_by_descriptor = {m["descriptor"]: m for m in status["milestones"]}
    assert milestones_by_descriptor["reviews_100"]["earned"] is True
    assert milestones_by_descriptor["reviews_500"]["earned"] is False


def test_build_achievement_milestones_status_backfills_badge_from_existing_history(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    for _ in range(100):
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
        )

    desktop_bridge.build_achievement_milestones_status()

    assert "reviews_100" in database.load_badges()


def test_record_game_result_reports_newly_crossed_streak_milestone(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    from domain.streaks import StreakState

    call_count = {"n": 0}

    def fake_load_streak_state() -> StreakState:
        call_count["n"] += 1
        # First call (pre-review) sees best=2; second call (post-review,
        # after study_pipeline's real apply_study_day already ran) sees best=3.
        return StreakState(best_streak_days=2 if call_count["n"] == 1 else 3)

    monkeypatch.setattr(desktop_bridge, "load_streak_state", fake_load_streak_state)

    payload = desktop_bridge.record_game_result(
        slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
    )

    assert payload["milestones_reached"] == ["streak_3"]


def test_record_game_result_streak_milestones_reached_empty_when_streak_unchanged(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    from domain.streaks import StreakState

    monkeypatch.setattr(
        desktop_bridge, "load_streak_state", lambda: StreakState(best_streak_days=1),
    )

    payload = desktop_bridge.record_game_result(
        slug="hiragana", card_id=0, is_correct=True, minigame="meaning_match",
    )

    assert payload["milestones_reached"] == []



def _progression_nodes(status: dict[str, object]) -> list[dict[str, Any]]:
    """The node list from `build_progression_status`, typed for indexing."""
    return cast("list[dict[str, Any]]", status["nodes"])


def test_sync_progression_state_masters_tutorial_and_hiragana_after_reviews(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")

    hiragana_deck = ALL_DECKS["hiragana"]()
    for card in hiragana_deck.cards:
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=card.id, is_correct=True, minigame="meaning_match",
        )

    state, events = desktop_bridge.sync_progression_state()

    assert state.node_states["tutorial"].status == "mastered"
    assert state.node_states["hiragana"].status == "mastered"
    assert state.node_states["katakana"].status == "unlocked"
    event_node_ids = {e.node_id for e in events if e.event_type == "node_mastered"}
    assert {"tutorial", "hiragana"} <= event_node_ids


def test_existing_review_history_counts_as_finishing_the_tutorial(
    tmp_path: Path, monkeypatch,
) -> None:
    """Onboarding is skippable, so the stored flag cannot be the only proof.

    Every other node chains off ``tutorial``. Requiring the flag alone locked
    the whole curriculum for anyone who skipped onboarding, however long they
    had been studying — this asserts the replacement rule (issue #78 Phase 4).
    """
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.init_study_db()
    assert desktop_bridge.get_setting("onboarding_complete") != "1"

    hiragana_deck = ALL_DECKS["hiragana"]()
    for card in hiragana_deck.cards:
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=card.id, is_correct=True, minigame="meaning_match",
        )

    state, _events = desktop_bridge.sync_progression_state()

    assert state.node_states["tutorial"].status == "mastered"
    assert state.node_states["hiragana"].status == "mastered"


def test_a_fresh_install_still_starts_at_the_tutorial(tmp_path: Path, monkeypatch) -> None:
    """The flip side: no review history and no flag means nothing is unlocked yet."""
    _use_temp_db(tmp_path, monkeypatch)

    state, _events = desktop_bridge.sync_progression_state()

    assert state.node_states["tutorial"].status != "mastered"
    assert state.node_states["hiragana"].status == "locked"


def test_build_achievement_milestones_status_reports_node_mastery_badges(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")

    hiragana_deck = ALL_DECKS["hiragana"]()
    for card in hiragana_deck.cards:
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=card.id, is_correct=True, minigame="meaning_match",
        )

    status = desktop_bridge.build_achievement_milestones_status()

    badges_by_descriptor = {b["descriptor"]: b for b in status["node_mastery_badges"]}
    assert badges_by_descriptor["hiragana_mastered"]["earned"] is True
    assert badges_by_descriptor["tutorial_complete"]["earned"] is True
    assert badges_by_descriptor["katakana_mastered"]["earned"] is False
    # Not-yet-synced nodes (need completion-tracking that doesn't exist yet)
    # are reported as unearned, never dropped from the list.
    assert badges_by_descriptor["jlpt_n5_passed"]["earned"] is False
    assert "hiragana_mastered" in database.load_badges()


def test_build_progression_status_reflects_synced_node_state(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.set_setting("onboarding_complete", "1")

    hiragana_deck = ALL_DECKS["hiragana"]()
    for card in hiragana_deck.cards:
        desktop_bridge.record_game_result(
            slug="hiragana", card_id=card.id, is_correct=True, minigame="meaning_match",
        )

    status = desktop_bridge.build_progression_status()

    nodes_by_id = {n["node_id"]: n for n in _progression_nodes(status)}
    assert nodes_by_id["hiragana"]["status"] == "mastered"
    assert nodes_by_id["katakana"]["status"] == "unlocked"
    assert nodes_by_id["hiragana"]["mastered_count"] == len(hiragana_deck.cards)
    assert nodes_by_id["hiragana"]["total_count"] == len(hiragana_deck.cards)


def test_every_graph_node_appears_with_a_category(tmp_path: Path, monkeypatch) -> None:
    """The map renders the whole graph, so nothing may be missing from the payload."""
    _use_temp_db(tmp_path, monkeypatch)

    status = desktop_bridge.build_progression_status()
    nodes_by_id = {n["node_id"]: n for n in _progression_nodes(status)}

    assert set(nodes_by_id) == set(desktop_bridge.JPLEARN_GRAPH.nodes)
    assert all(node["category"] for node in _progression_nodes(status))


def test_untracked_nodes_report_no_progress_rather_than_zero_percent(
    tmp_path: Path, monkeypatch,
) -> None:
    """A fabricated 0% reads as "you have done none of this" — and cannot be spotted as wrong.

    Nine nodes have no defensible denominator. A signal exists for some of them
    (`review_events.tags_csv`, `scenario_sessions`, `jlpt_exam_results`) but
    none answers "N out of how many?", so they carry `is_tracked=False` and the
    renderer shows no ratio at all.
    """
    _use_temp_db(tmp_path, monkeypatch)

    status = desktop_bridge.build_progression_status()
    nodes_by_id = {n["node_id"]: n for n in _progression_nodes(status)}

    assert desktop_bridge.UNTRACKED_PROGRESSION_NODES, "expected some nodes to be untracked"
    for node_id in desktop_bridge.UNTRACKED_PROGRESSION_NODES:
        node = nodes_by_id[node_id]
        assert node["is_tracked"] is False, node_id
        assert node["total_count"] == 0, node_id
        assert node["mastered_count"] == 0, node_id
        assert node["mastered_ratio"] == 0.0, node_id

    for node_id in desktop_bridge._PROGRESSION_SYNC_ORDER:
        assert nodes_by_id[node_id]["is_tracked"] is True, node_id


def test_sentence_examples_is_untracked_because_its_corpus_is_the_whole_sentence_bank(
    tmp_path: Path, monkeypatch,
) -> None:
    """Regression guard for a denominator that is large enough to be meaningless.

    The bridge replaces the 64-card domain deck with the full sentence corpus
    (~60k rows). Syncing the node against that asks for 80% of 60,000 sentences,
    which no learner reaches — the progress bar would sit at 0% forever.
    """
    _use_temp_db(tmp_path, monkeypatch)

    assert "sentence_examples" in desktop_bridge.UNTRACKED_PROGRESSION_NODES
    assert "sentence_examples" not in desktop_bridge._PROGRESSION_SYNC_DECK_SLUGS
    assert len(ALL_DECKS["sentence_examples"]().cards) > 1000, (
        "the bridge override is gone — re-check whether this node can now be tracked"
    )


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
        minigame="particle_cloze",
        session_id="session-1",
    )
    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=1,
        is_correct=False,
        minigame="particle_cloze",
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


def test_study_queue_keeps_due_and_leech_ahead_of_daily_game_miss_reviews(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()
    deck = Deck(
        name="Phase 10 Priority",
        cards=[
            Card(id=1, character="あ", romaji="a", meaning="a"),
            Card(id=2, character="い", romaji="i", meaning="i"),
            Card(id=3, character="う", romaji="u", meaning="u"),
            Card(id=4, character="え", romaji="e", meaning="e"),
        ],
    )
    monkeypatch.setitem(ALL_DECKS, "phase10_priority", lambda: deck)
    database.init_db()
    database.save_state(
        deck.name,
        ReviewState(card_id=1, repetitions=1, interval=1, next_review=today),
    )
    for card_id in (2, 3, 4):
        database.save_state(
            deck.name,
            ReviewState(
                card_id=card_id,
                repetitions=1,
                interval=1,
                next_review=today + timedelta(days=1),
            ),
        )
    with database._connect() as conn:  # type: ignore[attr-defined]
        conn.execute(
            """
            INSERT INTO leech_items (
                deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc
            )
            VALUES (?, ?, 1, 3, 3, ?)
            """,
            (deck.name, 2, datetime.combine(today, time.min, timezone.utc).isoformat()),
        )

    repository = DailyGamesRepository()
    repository.save_word_pool(
        DailyWordPool(
            day=today,
            algorithm_version=1,
            words=(
                DailyGameWord(
                    deck_slug="phase10_priority",
                    deck_name=deck.name,
                    card_id=4,
                    character="え",
                    romaji="e",
                    meaning="e",
                    source="recent",
                ),
            ),
        )
    )
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=today,
            game_type="word_search",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime.combine(today, time.min, timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )

    payload = desktop_bridge.build_study_queue_payload("phase10_priority")

    assert payload["queue"]["card_ids"] == [1, 2, 4, 3]  # type: ignore[index]


def test_build_deck_cards_includes_curriculum_stage(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="particle_cloze",
        curriculum_stage=3,
    )

    payload = desktop_bridge.build_deck_cards("hiragana")
    cards = cast(list[dict[str, object]], payload["cards"])
    first_card = next(card for card in cards if card["id"] == 0)
    assert first_card["curriculum_stage"] == 3
    assert first_card["example_sentence"]
    assert first_card["dictionary_summary"] is None


def test_builtin_note_keys_share_across_decks_and_allow_empty_readings(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (tmp_path / "missing-dictionary.sqlite",),
    )
    first_deck = Deck(
        name="Shared learning item A",
        cards=[Card(id=7, character=" 学ぶ ", romaji="", meaning="to learn")],
    )
    second_deck = Deck(
        name="Shared learning item B",
        cards=[Card(id=9001, character="学ぶ", romaji="", meaning="study")],
    )
    monkeypatch.setitem(desktop_bridge.ALL_DECKS, "note_identity_a", lambda: first_deck)
    monkeypatch.setitem(desktop_bridge.ALL_DECKS, "note_identity_b", lambda: second_deck)

    first_payload = desktop_bridge.build_deck_cards("note_identity_a")
    second_payload = desktop_bridge.build_deck_cards("note_identity_b")
    first_card = cast(list[dict[str, object]], first_payload["cards"])[0]
    second_card = cast(list[dict[str, object]], second_payload["cards"])[0]

    assert first_card["id"] != second_card["id"]
    assert first_card["note_key"] == second_card["note_key"]
    assert str(first_card["note_key"]).startswith("note:v1:builtin:")


def test_overview_cards_expose_python_generated_note_keys(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.build_overview_character_mastery()
    cards = cast(list[dict[str, object]], payload["kanji_cards"])

    assert cards
    assert all(str(card["note_key"]).startswith("note:v1:builtin:") for card in cards)


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
    _add_pitch_accent(
        dictionary_db_path,
        word=target_card.character,
        reading="にち",
        pitch_positions=[1],
        mora_count=2,
    )
    monkeypatch.setattr(
        dictionary_repository,
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
    assert dictionary_summary["pitch_accents"] == [
        {
            "reading": "にち",
            "pitch_positions": [1],
            "mora_count": 2,
            "source": "Kanjium test data",
        }
    ]


def test_dictionary_search_includes_pitch_accent_when_available(tmp_path: Path, monkeypatch) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_dictionary_db(
        dictionary_db_path,
        japanese="箸",
        reading="はし",
        gloss="chopsticks",
    )
    _add_pitch_accent(
        dictionary_db_path,
        word="箸",
        reading="はし",
        pitch_positions=[1],
        mora_count=2,
    )
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = dictionary_repository.build_dictionary_search_payload("箸")
    results = cast(list[dict[str, object]], payload["results"])

    assert results[0]["source_id"] == "test-entry"
    assert results[0]["note_key"] == "note:v1:offline_dictionary:jmdict:test-entry"
    assert results[0]["pitch_accents"] == [
        {
            "reading": "はし",
            "pitch_positions": [1],
            "mora_count": 2,
            "source": "Kanjium test data",
        }
    ]


def test_offline_note_keys_prefer_source_id_and_ignore_local_entry_id(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def _search(path: Path) -> dict[str, object]:
        monkeypatch.setattr(dictionary_repository, "OFFLINE_DICTIONARY_DB_CANDIDATES", (path,))
        payload = dictionary_repository.build_dictionary_search_payload("箸")
        return cast(list[dict[str, object]], payload["results"])[0]

    first_path = tmp_path / "first.sqlite"
    second_path = tmp_path / "second.sqlite"
    distinct_path = tmp_path / "distinct.sqlite"
    for path, source_id, entry_id in (
        (first_path, "test-entry", 7),
        (second_path, "test-entry", 9001),
        (distinct_path, "another-entry", 7),
    ):
        _build_dictionary_db(
            path,
            japanese="箸",
            reading="はし",
            gloss="chopsticks",
            source_id=source_id,
            entry_id=entry_id,
        )

    first = _search(first_path)
    second = _search(second_path)
    distinct = _search(distinct_path)

    assert first["id"] != second["id"]
    assert first["source_id"] == second["source_id"] == "test-entry"
    assert first["note_key"] == second["note_key"]
    assert str(first["note_key"]).startswith("note:v1:offline_dictionary:jmdict:")
    assert distinct["note_key"] != first["note_key"]


def test_offline_note_key_uses_marked_fallback_only_for_missing_source_id(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def _search(path: Path) -> dict[str, object]:
        monkeypatch.setattr(dictionary_repository, "OFFLINE_DICTIONARY_DB_CANDIDATES", (path,))
        payload = dictionary_repository.build_dictionary_search_payload("箸")
        return cast(list[dict[str, object]], payload["results"])[0]

    first_path = tmp_path / "missing-source-first.sqlite"
    second_path = tmp_path / "missing-source-second.sqlite"
    malformed_path = tmp_path / "malformed-source.sqlite"
    for path, source_id, entry_id in (
        (first_path, "", 3),
        (second_path, "  ", 800),
        (malformed_path, "bad/source", 4),
    ):
        _build_dictionary_db(
            path,
            japanese="箸",
            reading="はし",
            gloss="chopsticks",
            source_id=source_id,
            entry_id=entry_id,
        )

    first = _search(first_path)
    second = _search(second_path)

    assert first["source_id"] is None
    assert second["source_id"] is None
    assert first["note_key"] == second["note_key"]
    assert str(first["note_key"]).startswith(
        "note:v1:offline_dictionary:fallback:"
    )
    with pytest.raises(ValueError, match="source_id"):
        _search(malformed_path)


def test_card_note_bridge_commands_round_trip_unicode_crud(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    note_key = desktop_bridge.build_builtin_note_key("学ぶ", "manabu")

    missing_code, missing = desktop_bridge._run_command(["card-note-get", note_key])
    save_code, saved = desktop_bridge._run_command(
        ["card-note-save", note_key, "  覚え方\r\ncafe\u0301 😀  "]
    )
    load_code, loaded = desktop_bridge._run_command(["card-note-get", note_key])
    update_code, updated = desktop_bridge._run_command(
        ["card-note-save", note_key, "更新したメモ\nsecond line"]
    )
    delete_code, deleted = desktop_bridge._run_command(["card-note-delete", note_key])
    repeat_delete_code, repeated = desktop_bridge._run_command(
        ["card-note-delete", note_key]
    )

    assert missing_code == save_code == load_code == update_code == 0
    assert delete_code == repeat_delete_code == 0
    assert missing == {"note": None}
    assert saved["note_key"] == note_key
    assert saved["note_text"] == "覚え方\ncafé 😀"
    assert loaded["note"] == saved
    assert updated["created_at_utc"] == saved["created_at_utc"]
    assert updated["note_text"] == "更新したメモ\nsecond line"
    assert deleted == {"note_key": note_key, "deleted": True}
    assert repeated == {"note_key": note_key, "deleted": False}


@pytest.mark.parametrize(
    "argv",
    [
        ["card-note-get"],
        ["card-note-get", "key", "extra"],
        ["card-note-save", "key"],
        ["card-note-save", "key", "text", "extra"],
        ["card-note-delete"],
        ["card-note-delete", "key", "extra"],
    ],
)
def test_card_note_bridge_commands_reject_wrong_argument_counts(argv: list[str]) -> None:
    code, payload = desktop_bridge._run_command(argv)

    assert code == 2
    assert str(payload["error"]).startswith("Usage: card-note-")


def test_card_note_bridge_commands_reject_invalid_keys_and_notes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    note_key = desktop_bridge.build_builtin_note_key("学ぶ", "manabu")

    malformed_key_code, malformed_key = desktop_bridge._run_command(
        ["card-note-get", "note:v1:builtin:not-a-digest"]
    )
    blank_code, blank = desktop_bridge._run_command(
        ["card-note-save", note_key, " \r\n\t "]
    )
    oversized_code, oversized = desktop_bridge._run_command(
        ["card-note-save", note_key, "😀" * 2001]
    )

    assert malformed_key_code == blank_code == oversized_code == 2
    assert "supported opaque v1" in str(malformed_key["error"])
    assert "must not be empty" in str(blank["error"])
    assert "at most 2000" in str(oversized["error"])


def _write_json_payload(tmp_path: Path, name: str, payload: dict) -> str:
    path = tmp_path / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return str(path)


def test_scenario_session_bridge_commands_round_trip(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    session_payload = {
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "cafe-order",
        "scenario_version": 1,
        "learner_level": "beginner",
        "started_at_utc": "2026-07-21T00:00:00+00:00",
        "transcript": [{"turnIndex": 0, "learnerInput": "こんにちは", "outcome": "correct"}],
        "summary": {"objectives": [], "corrections": [], "vocabularyPractised": []},
    }
    payload_path = _write_json_payload(tmp_path, "session.json", session_payload)

    save_code, saved = desktop_bridge._run_command(["scenario-session-save", payload_path])
    list_code, listed = desktop_bridge._run_command(["scenario-session-list"])
    get_code, fetched = desktop_bridge._run_command(
        ["scenario-session-get", "11111111-1111-1111-1111-111111111111"]
    )
    missing_code, missing = desktop_bridge._run_command(
        ["scenario-session-get", "99999999-9999-9999-9999-999999999999"]
    )
    delete_code, deleted = desktop_bridge._run_command(
        ["scenario-session-delete", "11111111-1111-1111-1111-111111111111"]
    )
    repeat_delete_code, repeated = desktop_bridge._run_command(
        ["scenario-session-delete", "11111111-1111-1111-1111-111111111111"]
    )

    assert save_code == list_code == get_code == missing_code == 0
    assert delete_code == repeat_delete_code == 0
    assert saved["id"] == "11111111-1111-1111-1111-111111111111"
    assert saved["scenario_id"] == "cafe-order"
    assert saved["transcript"] == session_payload["transcript"]
    assert saved["summary"] == session_payload["summary"]
    assert listed == {"sessions": [saved]}
    assert fetched == {"session": saved}
    assert missing == {"session": None}
    assert deleted == {"id": "11111111-1111-1111-1111-111111111111", "deleted": True}
    assert repeated == {"id": "11111111-1111-1111-1111-111111111111", "deleted": False}


def test_scenario_sessions_clear_removes_everything(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload_path = _write_json_payload(tmp_path, "session.json", {
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "cafe-order",
        "scenario_version": 1,
        "learner_level": "beginner",
        "started_at_utc": "2026-07-21T00:00:00+00:00",
        "transcript": [],
        "summary": {},
    })
    desktop_bridge._run_command(["scenario-session-save", payload_path])

    clear_code, cleared = desktop_bridge._run_command(["scenario-sessions-clear"])
    list_code, listed = desktop_bridge._run_command(["scenario-session-list"])

    assert clear_code == list_code == 0
    assert cleared == {"cleared": 1}
    assert listed == {"sessions": []}


def test_scenario_session_save_rejects_malformed_payload(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload_path = _write_json_payload(tmp_path, "session.json", {
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "NOT-A-VALID-SCENARIO-ID",
        "scenario_version": 1,
        "learner_level": "beginner",
        "started_at_utc": "2026-07-21T00:00:00+00:00",
        "transcript": [],
        "summary": {},
    })

    code, payload = desktop_bridge._run_command(["scenario-session-save", payload_path])

    assert code == 2
    assert "scenario_id" in str(payload["error"])


def test_scenario_session_save_rejects_missing_file(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    code, payload = desktop_bridge._run_command(
        ["scenario-session-save", str(tmp_path / "does-not-exist.json")]
    )

    assert code == 2
    assert "error" in payload


def test_scenario_srs_card_bridge_command_requires_existing_session(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload_path = _write_json_payload(tmp_path, "srs.json", {
        "id": "srs-1",
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "cafe-order",
        "front": "コーヒー",
        "back": "coffee",
        "reading": "こーひー",
        "notes": "",
    })

    code, payload = desktop_bridge._run_command(["scenario-srs-save", payload_path])

    assert code == 2
    assert "Unknown scenario session" in str(payload["error"])


def test_scenario_srs_card_bridge_command_saves_after_session_exists(
    tmp_path: Path, monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    session_path = _write_json_payload(tmp_path, "session.json", {
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "cafe-order",
        "scenario_version": 1,
        "learner_level": "beginner",
        "started_at_utc": "2026-07-21T00:00:00+00:00",
        "transcript": [],
        "summary": {},
    })
    desktop_bridge._run_command(["scenario-session-save", session_path])
    srs_path = _write_json_payload(tmp_path, "srs.json", {
        "id": "srs-1",
        "session_id": "11111111-1111-1111-1111-111111111111",
        "scenario_id": "cafe-order",
        "front": "コーヒー",
        "back": "coffee",
        "reading": "こーひー",
        "notes": "",
    })

    code, payload = desktop_bridge._run_command(["scenario-srs-save", srs_path])

    assert code == 0
    assert payload["id"] == "srs-1"
    assert payload["front"] == "コーヒー"


@pytest.mark.parametrize(
    "argv",
    [
        ["scenario-session-save"],
        ["scenario-session-save", "a", "b"],
        ["scenario-session-list", "extra"],
        ["scenario-session-get"],
        ["scenario-session-get", "id", "extra"],
        ["scenario-session-delete"],
        ["scenario-sessions-clear", "extra"],
        ["scenario-srs-save"],
    ],
)
def test_scenario_bridge_commands_reject_wrong_argument_counts(argv: list[str]) -> None:
    code, payload = desktop_bridge._run_command(argv)

    assert code == 2
    assert str(payload["error"]).startswith("Usage: scenario-")


def test_build_kanji_detail_payload_uses_indexed_compounds_and_verified_examples(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_kanji_detail_db(dictionary_db_path)
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = desktop_bridge.build_kanji_detail_payload("日")

    assert payload["character"] == "日"
    assert payload["meanings"] == ["day", "sun"]
    assert payload["jlpt_level"] == "N5"
    assert payload["jlpt_level_source"] == "kanjidic"
    assert payload["stroke_count"] == 4
    assert payload["classical_radical_number"] == 72
    assert payload["radicals"] == [
        {"position": 0, "radical": "日", "stroke_count": 4, "code": "js72"},
        {"position": 1, "radical": "一", "stroke_count": 1, "code": None},
    ]
    # Category slugs no longer ride along as tags: kanji categories are block
    # definitions now, not decks, so a card carries only its own tags.
    assert payload["tags"] == ["kanji", "n5"]
    # One entry per block the character sits in, named "<deck> · <theme>". The
    # bare deck name is gone: every kanji now belongs to a named theme, so a
    # level-only entry carried no information the level tag did not already.
    assert payload["categories"] == ["Kanji N5 · Numbers & Time"]

    on_readings = cast(list[dict[str, Any]], payload["on_readings"])
    assert on_readings[0]["reading"] == "ニチ"
    assert on_readings[0]["examples"] == [
        {"word": "日", "reading": "にち", "meanings": ["day"], "is_common": True},
        {"word": "日", "reading": "ニチ", "meanings": ["sun"], "is_common": True},
    ]
    assert on_readings[1] == {"reading": "ジツ", "examples": []}

    kun_readings = cast(list[dict[str, Any]], payload["kun_readings"])
    assert kun_readings[0]["examples"] == [
        {"word": "日", "reading": "ひ", "meanings": ["sunlight"], "is_common": True}
    ]
    assert kun_readings[1] == {"reading": "-び", "examples": []}
    assert all(
        example["word"] == "日"
        for reading in [*on_readings, *kun_readings]
        for example in cast(list[dict[str, Any]], reading["examples"])
    )

    compounds = cast(list[dict[str, Any]], payload["compounds"])
    assert len(compounds) == 12
    assert [compound["word"] for compound in compounds[:3]] == ["日光", "毎日", "休日"]
    assert all(compound["is_common"] is True for compound in compounds)
    assert all(compound["word"] != "日本" for compound in compounds)
    assert all(compound["word"] != "日" for compound in compounds)
    assert payload["has_more_compounds"] is True
    assert payload["source"] == "offline_dictionary"


def test_build_kanji_detail_payload_uses_deck_level_fallback(tmp_path: Path, monkeypatch) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_kanji_detail_db(dictionary_db_path, jlpt_level=None)
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = desktop_bridge.build_kanji_detail_payload("日")

    assert payload["jlpt_level"] == "N5"
    assert payload["jlpt_level_source"] == "deck"


def test_build_kanji_detail_payload_preserves_missing_optional_fields(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_kanji_detail_db(
        dictionary_db_path,
        character="龘",
        meanings_json="[]",
        jlpt_level=None,
    )
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = desktop_bridge.build_kanji_detail_payload("龘")

    assert payload["meanings"] == []
    assert payload["on_readings"] == []
    assert payload["kun_readings"] == []
    assert payload["radicals"] == []
    assert payload["jlpt_level"] is None
    assert payload["jlpt_level_source"] is None
    assert payload["stroke_count"] is None
    assert payload["classical_radical_number"] is None
    assert payload["tags"] == []
    assert payload["categories"] == []
    assert payload["compounds"] == []
    assert payload["has_more_compounds"] is False


def test_build_kanji_detail_payload_degrades_on_old_index_and_rejects_malformed_json(
    tmp_path: Path,
    monkeypatch,
) -> None:
    old_db_path = tmp_path / "old.sqlite"
    _build_kanji_detail_db(old_db_path)
    with sqlite3.connect(old_db_path) as conn:
        conn.execute(
            "UPDATE dictionary_metadata SET value = '3' WHERE key = 'schema_version'"
        )
    monkeypatch.setattr(dictionary_repository, "OFFLINE_DICTIONARY_DB_CANDIDATES", (old_db_path,))
    # An index predating the kanji tables used to raise, blanking the panel. It
    # now degrades to the committed deck data, which still carries components.
    degraded = desktop_bridge.build_kanji_detail_payload("日")
    assert degraded["source"] == "deck_only"
    assert degraded["on_readings"] == []

    malformed_db_path = tmp_path / "malformed.sqlite"
    _build_kanji_detail_db(malformed_db_path, meanings_json="not-json")
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (malformed_db_path,),
    )
    with pytest.raises(sqlite3.DatabaseError, match="meanings_json.*malformed JSON"):
        desktop_bridge.build_kanji_detail_payload("日")


def test_kanji_detail_bridge_command_validates_single_han_character(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_kanji_detail_db(dictionary_db_path)
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    code, payload = desktop_bridge._run_command(["kanji-detail", " 日 "])
    assert code == 0
    assert payload["character"] == "日"

    for invalid in ("", "日本", "ひ", "A", "々"):
        code, payload = desktop_bridge._run_command(["kanji-detail", invalid])
        assert code == 2
        assert "exactly one Unicode Han character" in str(payload["error"])


def test_dictionary_hello_prefers_konnichiwa_over_katakana_hello(tmp_path: Path, monkeypatch) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_dictionary_db_many(
        dictionary_db_path,
        rows=[
            ("ハロー", "はろー", "hello", 1),
            ("今日は", "こんにちは", "greetings; hello; good afternoon", 1),
            ("もしもし", "もしもし", "hello (e.g. on phone)", 1),
        ],
    )
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    payload = dictionary_repository.build_dictionary_search_payload("hello")
    results = cast(list[dict[str, object]], payload["results"])

    assert len(results) > 0
    assert results[0]["character"] == "今日は"
    assert results[0]["source_id"] == "test-entry-2"
    assert results[0]["note_key"] == (
        "note:v1:offline_dictionary:jmdict:test-entry-2"
    )
    assert any(result["character"] == "ハロー" for result in results)


def test_dictionary_semantic_rerank_can_change_lexical_order(tmp_path: Path, monkeypatch) -> None:
    dictionary_db_path = tmp_path / "dictionary.sqlite"
    _build_dictionary_db_many(
        dictionary_db_path,
        rows=[
            ("語彙A", "ごいA", "hello", 1),
            ("語彙B", "ごいB", "hello there", 1),
        ],
    )
    monkeypatch.setattr(
        dictionary_repository,
        "OFFLINE_DICTIONARY_DB_CANDIDATES",
        (dictionary_db_path,),
    )

    def fake_semantic_embedder(query: str, candidates: list[str]) -> list[float]:
        assert query == "hello"
        return [0.1 if candidate == "hello" else 0.9 for candidate in candidates]

    payload = dictionary_repository.build_dictionary_search_payload(
        "hello", semantic_embed=fake_semantic_embedder
    )
    results = cast(list[dict[str, object]], payload["results"])

    assert len(results) >= 2
    assert results[0]["character"] == "語彙B"


def test_build_deck_cards_sentence_examples_prefers_csv_runtime_source(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    csv_path = tmp_path / "sentence_examples.csv"
    csv_path.write_text(
        "character,romaji,meaning\n"
        "おはよう。,ohayou.,Good morning.\n"
        "今日はいい天気です。,kyou wa ii tenki desu.,The weather is nice today.\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(desktop_bridge, "SENTENCE_EXAMPLES_CSV_CANDIDATES", (csv_path,))
    monkeypatch.setattr(desktop_bridge, "_SENTENCE_EXAMPLES_ROWS_CACHE", None)

    payload = desktop_bridge.build_deck_cards("sentence_examples")
    cards = cast(list[dict[str, object]], payload["cards"])

    assert payload["name"] == "Sentence Examples"
    assert len(cards) == 2
    assert cards[0]["character"] == "おはよう。"
    assert cards[0]["meaning"] == "Good morning."
    assert cards[0]["example_sentence"] == "おはよう。"


def test_build_deck_cards_sentence_examples_falls_back_when_csv_unavailable(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    fallback_deck = Deck(
        name="Sentence Examples",
        cards=[
            Card(
                id=0,
                character="Fallback sentence",
                romaji="fallback sentence",
                meaning="fallback",
                tags=["sentence"],
                example_sentence="Fallback sentence",
            )
        ],
    )

    monkeypatch.setattr(desktop_bridge, "SENTENCE_EXAMPLES_CSV_CANDIDATES", (tmp_path / "missing.csv",))
    monkeypatch.setattr(desktop_bridge, "_SENTENCE_EXAMPLES_ROWS_CACHE", None)
    monkeypatch.setattr(desktop_bridge, "_SENTENCE_EXAMPLES_FALLBACK_FACTORY", lambda: fallback_deck)

    payload = desktop_bridge.build_deck_cards("sentence_examples")
    cards = cast(list[dict[str, object]], payload["cards"])

    assert len(cards) == 1
    assert cards[0]["character"] == "Fallback sentence"
    assert cards[0]["meaning"] == "fallback"


def test_build_block_progress_includes_new_phase_one_decks(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    sentence_progress = cast(dict[str, Any], desktop_bridge.build_block_progress("sentence_examples"))
    conjugation_progress = cast(dict[str, Any], desktop_bridge.build_block_progress("conjugation_training"))

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
        minigame="imposter",
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
    assert row["tags_csv"] == "minigame,imposter,chapter_2"


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


def test_main_returns_handled_error_for_corrupt_daily_games_database(
    tmp_path: Path,
    monkeypatch,
    capsys,
) -> None:
    db_path = tmp_path / "corrupt-jplearn.db"
    corrupted_contents = b"not a sqlite database"
    db_path.write_bytes(corrupted_contents)
    monkeypatch.setattr(database, "DB_PATH", db_path)
    monkeypatch.setattr(desktop_bridge.sys, "argv", ["desktop_bridge.py", "daily-games-state", "2026-07-15"])

    code = desktop_bridge.main()
    payload = json.loads(capsys.readouterr().out)

    assert code == 2
    assert payload["error"].startswith("Database unavailable:")
    assert db_path.read_bytes() == corrupted_contents


def test_worker_returns_handled_error_for_corrupt_daily_games_database(
    tmp_path: Path,
    monkeypatch,
    capsys,
) -> None:
    db_path = tmp_path / "corrupt-jplearn-worker.db"
    corrupted_contents = b"not a sqlite database"
    db_path.write_bytes(corrupted_contents)
    monkeypatch.setattr(database, "DB_PATH", db_path)
    monkeypatch.setattr(
        desktop_bridge.sys,
        "stdin",
        io.StringIO('{"id":1,"args":["daily-games-state","2026-07-15"]}\n'),
    )

    code = desktop_bridge._run_server()
    response = json.loads(capsys.readouterr().out)

    assert code == 0
    assert response["ok"] is False
    assert response["payload"]["error"].startswith("Database unavailable:")
    assert db_path.read_bytes() == corrupted_contents


def test_daily_games_state_creates_a_stable_same_day_pool(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    first = desktop_bridge.build_daily_games_state("2026-07-15")
    second = desktop_bridge.build_daily_games_state("2026-07-15")

    assert first["pool"] == second["pool"]
    assert first["pool"]["day"] == "2026-07-15"
    assert first["pool"]["words"]
    assert set(first["pool"]["game_seeds"]) == {
        "crossword",
        "word_search",
        "match_pairs",
        "typing_blitz",
    }


def test_daily_games_practice_seeds_are_fresh_and_nonnegative(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    first = desktop_bridge.build_daily_games_practice_seed("2026-07-15", "crossword")
    second = desktop_bridge.build_daily_games_practice_seed("2026-07-15", "crossword")

    assert first["pool_day"] == "2026-07-15"
    assert first["game_type"] == "crossword"
    assert isinstance(first["seed"], int)
    assert first["seed"] >= 0
    assert first["seed"] != second["seed"]


def test_daily_games_record_attempt_updates_daily_only_progress_and_streak(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    state = desktop_bridge.build_daily_games_state("2026-07-15")
    assert state["pool"]["words"]

    updated = desktop_bridge.record_daily_games_attempt(
        "2026-07-15",
        "crossword",
        "daily",
        125,
        True,
        42,
        (
            desktop_bridge.DailyGameWordOutcome(pool_position=0, outcome="incorrect"),
        ),
    )

    assert updated["progress"]["attempt_count"] == 1
    assert updated["progress"]["completed_daily_game_types"] == ["crossword"]
    assert updated["progress"]["missed_words"][0]["miss_count"] == 1
    assert updated["streak"]["current_streak_days"] == 1
    assert updated["attempts"][0]["outcomes"] == [
        {"pool_position": 0, "outcome": "incorrect"}
    ]


def test_daily_games_repeated_daily_completion_is_idempotent_and_practice_is_isolated(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    database.init_db()
    database.save_state(
        "Vocabulary N5",
        ReviewState(card_id=0, repetitions=1, interval=2, next_review=date(2026, 7, 16)),
    )
    database.log_review("Vocabulary N5", 0, 4, reviewed_on=date(2026, 7, 15))
    with database._connect() as conn:  # type: ignore[attr-defined]
        before_states = conn.execute("SELECT * FROM review_states").fetchall()
        before_events = conn.execute("SELECT * FROM review_events").fetchall()

    first = desktop_bridge.record_daily_games_attempt(
        "2026-07-15", "crossword", "daily", 125, True, 42,
        (desktop_bridge.DailyGameWordOutcome(pool_position=0, outcome="correct"),),
    )
    repeated = desktop_bridge.record_daily_games_attempt(
        "2026-07-15", "crossword", "daily", 99, True, 10,
        (desktop_bridge.DailyGameWordOutcome(pool_position=1, outcome="incorrect"),),
    )
    practiced = desktop_bridge.record_daily_games_attempt(
        "2026-07-15", "crossword", "practice", 50, True, 30,
        (desktop_bridge.DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
    )

    assert first["progress"]["attempt_count"] == 1
    assert repeated["progress"]["attempt_count"] == 1
    assert repeated["streak"]["current_streak_days"] == 1
    assert practiced["progress"]["attempt_count"] == 2
    assert practiced["progress"]["completed_daily_game_types"] == ["crossword"]
    assert practiced["streak"]["current_streak_days"] == 1
    with database._connect() as conn:  # type: ignore[attr-defined]
        assert conn.execute("SELECT * FROM review_states").fetchall() == before_states
        assert conn.execute("SELECT * FROM review_events").fetchall() == before_events


def test_daily_games_state_and_duplicate_retry_reconcile_stale_streak(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.build_daily_games_state("2026-07-15")
    repository = DailyGamesRepository()
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=date(2026, 7, 15),
            game_type="crossword",
            mode="daily",
            score=50,
            completed=True,
            duration_seconds=20,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="correct"),),
        )
    )
    repository.save_streak_state(DailyGamesStreakState())

    loaded = desktop_bridge.build_daily_games_state("2026-07-15")

    assert loaded["streak"]["current_streak_days"] == 1
    assert repository.load_streak_state().last_completed_day == date(2026, 7, 15)

    repository.save_streak_state(DailyGamesStreakState())
    retried = desktop_bridge.record_daily_games_attempt(
        "2026-07-15",
        "crossword",
        "daily",
        99,
        True,
        10,
        (DailyGameWordOutcome(pool_position=1, outcome="incorrect"),),
    )

    assert retried["progress"]["attempt_count"] == 1
    assert retried["streak"]["current_streak_days"] == 1
    assert repository.load_streak_state().last_completed_day == date(2026, 7, 15)


def test_daily_games_new_completion_reconstructs_streak_from_attempt_days(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.build_daily_games_state("2026-07-15")
    repository = DailyGamesRepository()
    repository.save_streak_state(
        DailyGamesStreakState(
            last_completed_day=date(2026, 7, 14),
            current_streak_days=4,
            best_streak_days=4,
            freezes_available=3,
            freeze_month=date(2026, 7, 1),
        )
    )
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=date(2026, 7, 15),
            game_type="crossword",
            mode="daily",
            score=50,
            completed=True,
            duration_seconds=20,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="correct"),),
        )
    )

    updated = desktop_bridge.record_daily_games_attempt(
        "2026-07-16",
        "crossword",
        "daily",
        60,
        True,
        18,
        (DailyGameWordOutcome(pool_position=0, outcome="correct"),),
    )

    assert updated["streak"]["last_completed_day"] == "2026-07-16"
    assert updated["streak"]["current_streak_days"] == 2
    assert updated["streak"]["freezes_available"] == 3

    save_calls: list[DailyGamesStreakState] = []
    monkeypatch.setattr(repository, "save_streak_state", save_calls.append)
    reconciled_again = desktop_bridge._reconcile_daily_games_streak(repository)

    assert save_calls == []
    assert reconciled_again == repository.load_streak_state()
    assert reconciled_again.current_streak_days == 2


def test_daily_games_state_resolves_misses_by_completion_time_not_insertion_order(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.build_daily_games_state("2026-07-15")
    repository = DailyGamesRepository()
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=date(2026, 7, 15),
            game_type="typing_blitz",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 15, 12, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=date(2026, 7, 15),
            game_type="typing_blitz",
            mode="practice",
            score=1,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 15, 10, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="correct"),),
        )
    )

    state = desktop_bridge.build_daily_games_state("2026-07-15")

    assert state["progress"]["missed_words"] == [
        {"word": state["pool"]["words"][0], "miss_count": 1}
    ]


def test_daily_games_state_clears_resolved_miss_summary(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    desktop_bridge.build_daily_games_state("2026-07-15")

    missed = desktop_bridge.record_daily_games_attempt(
        "2026-07-15",
        "typing_blitz",
        "practice",
        0,
        False,
        None,
        (DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
    )
    corrected = desktop_bridge.record_daily_games_attempt(
        "2026-07-15",
        "typing_blitz",
        "practice",
        1,
        False,
        None,
        (DailyGameWordOutcome(pool_position=0, outcome="correct"),),
    )

    assert missed["progress"]["missed_words"][0]["miss_count"] == 1
    assert corrected["progress"]["missed_words"] == []
    assert DailyGamesRepository().load_active_game_miss_card_ids(
        "Vocabulary N5", date(2026, 7, 15)
    ) == set()


def test_daily_games_commands_reject_malformed_arguments(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    invalid_day_code, invalid_day_payload = desktop_bridge._run_command(
        ["daily-games-state", "2026-7-15"]
    )
    invalid_type_code, invalid_type_payload = desktop_bridge._run_command(
        ["daily-games-practice-seed", "2026-07-15", "anagram"]
    )
    invalid_attempt_code, invalid_attempt_payload = desktop_bridge._run_command(
        [
            "daily-games-record-attempt",
            "2026-07-15",
            "crossword",
            "daily",
            "5",
            "true",
            "",
            "not-json",
        ]
    )

    assert invalid_day_code == invalid_type_code == invalid_attempt_code == 2
    assert "YYYY-MM-DD" in str(invalid_day_payload["error"])
    assert "game_type" in str(invalid_type_payload["error"])
    assert "outcomes_json" in str(invalid_attempt_payload["error"])


def test_daily_games_crossword_clue_commands_save_first_accepted_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    database.init_db()
    database.save_state(
        "Vocabulary N5",
        ReviewState(card_id=0, repetitions=1, interval=2, next_review=date(2026, 7, 16)),
    )
    database.log_review("Vocabulary N5", 0, 4, reviewed_on=date(2026, 7, 15))
    with database._connect() as conn:  # type: ignore[attr-defined]
        before_states = conn.execute("SELECT * FROM review_states").fetchall()
        before_events = conn.execute("SELECT * FROM review_events").fetchall()
    desktop_bridge.build_daily_games_state("2026-07-15")

    first_code, first = desktop_bridge._run_command(
        [
            "daily-games-save-crossword-clues",
            "2026-07-15",
            '[{"pool_position":1,"clue":"first feline clue"},{"pool_position":0,"clue":"first party clue"}]',
        ]
    )
    repeated_code, repeated = desktop_bridge._run_command(
        [
            "daily-games-save-crossword-clues",
            "2026-07-15",
            '[{"pool_position":0,"clue":"replacement clue"}]',
        ]
    )
    load_code, loaded = desktop_bridge._run_command(
        ["daily-games-crossword-clues", "2026-07-15"]
    )

    expected = {
        "day": "2026-07-15",
        "clues": [
            {"pool_position": 0, "clue": "first party clue"},
            {"pool_position": 1, "clue": "first feline clue"},
        ],
    }
    assert first_code == repeated_code == load_code == 0
    assert first == repeated == loaded == expected
    with database._connect() as conn:  # type: ignore[attr-defined]
        assert conn.execute("SELECT * FROM review_states").fetchall() == before_states
        assert conn.execute("SELECT * FROM review_events").fetchall() == before_events


def test_daily_games_crossword_clue_commands_reject_invalid_payloads(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    invalid_day_code, invalid_day = desktop_bridge._run_command(
        ["daily-games-crossword-clues", "2026-7-15"]
    )
    invalid_json_code, invalid_json = desktop_bridge._run_command(
        ["daily-games-save-crossword-clues", "2026-07-15", "not-json"]
    )
    invalid_shape_code, invalid_shape = desktop_bridge._run_command(
        [
            "daily-games-save-crossword-clues",
            "2026-07-15",
            '[{"pool_position":0,"clue":"x","extra":true}]',
        ]
    )

    assert invalid_day_code == invalid_json_code == invalid_shape_code == 2
    assert "YYYY-MM-DD" in str(invalid_day["error"])
    assert "clues_json" in str(invalid_json["error"])
    assert "only pool_position and clue" in str(invalid_shape["error"])


def test_daily_games_bridge_recording_does_not_change_review_data(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    database.init_db()
    database.save_state(
        "Vocabulary N5",
        ReviewState(
            card_id=0,
            repetitions=1,
            interval=2,
            next_review=date(2026, 7, 16),
            last_review=date(2026, 7, 15),
        ),
    )
    database.log_review("Vocabulary N5", 0, 4, reviewed_on=date(2026, 7, 15))
    with database._connect() as conn:  # type: ignore[attr-defined]
        before_states = conn.execute("SELECT * FROM review_states").fetchall()
        before_events = conn.execute("SELECT * FROM review_events").fetchall()

    desktop_bridge.record_daily_games_attempt(
        "2026-07-15",
        "typing_blitz",
        "daily",
        10,
        True,
        None,
        (
            desktop_bridge.DailyGameWordOutcome(pool_position=0, outcome="correct"),
        ),
    )

    with database._connect() as conn:  # type: ignore[attr-defined]
        after_states = conn.execute("SELECT * FROM review_states").fetchall()
        after_events = conn.execute("SELECT * FROM review_events").fetchall()

    assert after_states == before_states
    assert after_events == before_events


def test_build_summary_includes_extended_script_curriculum_maps(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    summary = cast(dict[str, Any], desktop_bridge.build_summary())
    curriculum = cast(dict[str, Any], summary["curriculum"])
    context_by_script = cast(dict[str, object], curriculum["particle_cloze_by_script"])
    narrative_by_script = cast(dict[str, object], curriculum["imposter_by_script"])

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


def test_build_grammar_minigame_data_uses_csv_when_sentence_missing(tmp_path: Path, monkeypatch) -> None:
    csv_path = tmp_path / "sentence_examples.csv"
    csv_path.write_text(
        "character,romaji,meaning\n"
        "今日はいい天気です。,kyou wa ii tenki desu.,The weather is nice today.\n"
        "私は日本語を勉強します。,watashi wa nihongo o benkyou shimasu.,I study Japanese.\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(desktop_bridge, "SENTENCE_EXAMPLES_CSV_CANDIDATES", (csv_path,))
    monkeypatch.setattr(desktop_bridge, "_SENTENCE_EXAMPLES_ROWS_CACHE", None)

    payload = desktop_bridge.build_grammar_minigame_data("particle_cloze", seed=1)

    assert payload["ok"] is True
    assert payload["game_type"] == "particle_cloze"
    data = cast(dict[str, Any], payload["data"])
    assert data["game_type"] == "particle_cloze"
    assert "___" in data["prompt"]


def test_build_grammar_minigame_data_accepts_explicit_sentence() -> None:
    payload = desktop_bridge.build_grammar_minigame_data(
        "imposter",
        "私は学校で日本語を勉強します",
        seed=0,
    )

    assert payload["ok"] is True
    assert payload["sentence"] == "私は学校で日本語を勉強します"
    data = cast(dict[str, Any], payload["data"])
    assert data["game_type"] == "imposter"
    assert data["mutated_sentence"] != data["sentence"]


def test_run_command_grammar_minigame_data_rejects_unknown_type() -> None:
    code, payload = desktop_bridge._run_command(["grammar-minigame-data", "not_a_mode"])

    assert code == 2
    assert "Unsupported grammar minigame type" in str(payload["error"])


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
        metadata={"reason": "cta", "target_mode": "particle_cloze"},
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
    assert metadata["target_mode"] == "particle_cloze"


def test_get_assistant_chat_context_returns_compact_context(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.get_assistant_chat_context(user_message="need kanji help")
    assert payload["ok"] is True

    context = cast(dict[str, str], payload["context"])
    assert "persona" in context
    assert "emotional_state" in context
    assert "memory" in context
    assert "memory_graph" in context


def test_record_game_result_contract_shape(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.record_game_result(
        slug="hiragana",
        card_id=0,
        is_correct=True,
        minigame="particle_cloze",
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





def test_build_conjugation_drill_data_returns_both_spellings() -> None:
    payload = desktop_bridge.build_conjugation_drill_data("食べる", stage=1, seed=0)

    assert payload["ok"] is True
    assert payload["game_type"] == "conjugation_drill"
    data = cast(dict[str, Any], payload["data"])
    assert data["word"] == "食べる"
    assert data["word_class"] == "ichidan"
    assert data["expected"] in data["accepted"]
    assert data["expected_reading"] in data["accepted"]


def test_run_command_conjugation_drill_data_parses_stage_and_seed() -> None:
    code, payload = desktop_bridge._run_command(["conjugation-drill-data", "会う", "1", "2"])

    assert code == 0
    assert payload["seed"] == 2
    data = cast(dict[str, Any], payload["data"])
    assert data["stage"] == 1


def test_run_command_conjugation_drill_data_rejects_a_non_conjugatable_word() -> None:
    """The renderer reads this failure as "use a different minigame for this card"."""
    code, payload = desktop_bridge._run_command(["conjugation-drill-data", "本"])

    assert code == 2
    assert "not a conjugatable dictionary form" in str(payload["error"])


def _feature(payload: dict[str, Any], feature_id: str) -> dict[str, Any]:
    features = cast(list[dict[str, Any]], payload["features"])
    return next(f for f in features if f["feature_id"] == feature_id)


def test_feature_unlock_status_reports_the_transition_it_causes(
    tmp_path: Path, monkeypatch,
) -> None:
    """`themes` has no requirement, so the first call is what unlocks it."""
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.build_feature_unlock_status()

    themes = _feature(payload, "themes")
    assert themes["is_unlocked"] is True
    assert themes["just_unlocked"] is True
    assert themes["unlocked_at"] is not None


def test_feature_unlock_status_reports_a_gated_feature_as_neither(
    tmp_path: Path, monkeypatch,
) -> None:
    """Nothing is mastered on a fresh database, so `listening_mode` stays shut."""
    _use_temp_db(tmp_path, monkeypatch)

    payload = desktop_bridge.build_feature_unlock_status()

    listening = _feature(payload, "listening_mode")
    assert listening["is_unlocked"] is False
    assert listening["just_unlocked"] is False
    assert listening["unlocked_at"] is None


def test_feature_unlock_status_only_claims_the_transition_once(
    tmp_path: Path, monkeypatch,
) -> None:
    """The regression this field exists for.

    The unlock is persisted by the call that evaluates it, so a second call finds
    nothing new and must say so — `just_unlocked` is a fact about THIS call, not a
    fact about the feature. `unlocked_at` is the half that survives, which is why a
    surface wanting to show an unlock exactly once should compare timestamps rather
    than race every other caller for the flag.
    """
    _use_temp_db(tmp_path, monkeypatch)

    first = desktop_bridge.build_feature_unlock_status()
    second = desktop_bridge.build_feature_unlock_status()

    assert _feature(first, "themes")["just_unlocked"] is True
    assert _feature(second, "themes")["just_unlocked"] is False
    assert _feature(second, "themes")["is_unlocked"] is True
    assert (
        _feature(second, "themes")["unlocked_at"]
        == _feature(first, "themes")["unlocked_at"]
    )
