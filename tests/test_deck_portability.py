from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from data import database
from data.deck_portability import export_progress_snapshot, import_progress_snapshot
from data.daily_games_repository import (
    DailyCrosswordClue,
    DailyGameAttempt,
    DailyGameWordOutcome,
    DailyGamesRepository,
)
from domain.daily_games import DailyGameWord, DailyGamesStreakState, DailyWordPool
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def _daily_games_snapshot() -> dict[str, Any]:
    return {
        "format_version": 1,
        "progress": {
            "review_states": [],
            "review_events": [],
            "curriculum_stages": [],
            "leech_items": [],
            "session_goals": [],
        },
        "custom_decks": [],
        "daily_games": {
            "word_pools": [
                {
                    "pool_day": "2026-07-15",
                    "algorithm_version": 1,
                    "words": [
                        {
                            "pool_position": 0,
                            "deck_slug": "n5",
                            "deck_name": "Vocabulary N5",
                            "card_id": 4,
                            "character": "パーティ",
                            "romaji": "paatii",
                            "meaning": "party",
                            "source": "due",
                        }
                    ],
                }
            ],
            "attempts": [
                {
                    "attempt_id": 1,
                    "pool_day": "2026-07-15",
                    "game_type": "crossword",
                    "mode": "daily",
                    "score": 100,
                    "completed": 1,
                    "duration_seconds": 30,
                    "completed_at_utc": "2026-07-15T12:00:00+00:00",
                    "completion_key": "daily:2026-07-15:crossword",
                    "outcomes": [{"pool_position": 0, "outcome": "correct"}],
                }
            ],
            "streak_state": {
                "last_completed_day": "2026-07-15",
                "current_streak_days": 1,
                "best_streak_days": 1,
                "freezes_available": 3,
                "freeze_month": "2026-07-01",
            },
            "crossword_clues": [
                {
                    "pool_day": "2026-07-15",
                    "pool_position": 0,
                    "clue": "An English clue.",
                }
            ],
            "miss_signals": [
                {"deck_name": "Vocabulary N5", "card_id": 4, "missed_on": "2026-07-15"}
            ],
        },
    }


def _set_nested(payload: dict[str, Any], path: tuple[str | int, ...], value: object) -> None:
    target: Any = payload
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value


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
    database.save_curriculum_stage("Hiragana", 1, "particle_cloze", 2)
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


def test_progress_snapshot_round_trips_daily_games_data(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    source = DailyGamesRepository()
    pool = source.save_word_pool(
        DailyWordPool(
            day=date(2026, 7, 15),
            algorithm_version=1,
            words=(
                DailyGameWord("n5", "Vocabulary N5", 4, "パーティ", "paatii", "party", "due"),
                DailyGameWord("n4", "Vocabulary N4", 8, "猫", "neko", "cat", "recent"),
            ),
        )
    )
    saved_attempt = source.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="daily",
            score=120,
            completed=True,
            duration_seconds=30,
            completed_at_utc=datetime(2026, 7, 15, 12, tzinfo=timezone.utc),
            outcomes=(
                DailyGameWordOutcome(pool_position=1, outcome="incorrect"),
                DailyGameWordOutcome(pool_position=0, outcome="correct"),
            ),
        )
    )
    source.save_crossword_clues(
        pool.day,
        (
            DailyCrosswordClue(pool_position=1, clue="A feline"),
            DailyCrosswordClue(pool_position=0, clue="A party"),
        ),
    )
    streak = DailyGamesStreakState(pool.day, 3, 5, 1, date(2026, 7, 1))
    source.save_streak_state(streak)
    snapshot = export_progress_snapshot()

    assert snapshot["daily_games"]["attempts"][0]["attempt_id"] == saved_attempt.attempt_id
    assert snapshot["daily_games"]["word_pools"][0]["words"][0]["pool_position"] == 0
    database.reset_db()

    summary = import_progress_snapshot(snapshot, conflict_mode="overwrite")
    restored = DailyGamesRepository()

    assert summary["daily_games"] == 1
    assert restored.load_word_pool(pool.day) == pool
    restored_attempt = restored.load_attempts(pool.day)[0]
    assert restored_attempt.attempt_id == saved_attempt.attempt_id
    assert restored_attempt.outcomes == (
        DailyGameWordOutcome(pool_position=0, outcome="correct"),
        DailyGameWordOutcome(pool_position=1, outcome="incorrect"),
    )
    assert restored.load_crossword_clues(pool.day) == (
        DailyCrosswordClue(pool_position=0, clue="A party"),
        DailyCrosswordClue(pool_position=1, clue="A feline"),
    )
    assert restored.load_streak_state() == streak
    assert restored.load_active_game_miss_card_ids("Vocabulary N4", pool.day) == {8}


def test_merge_rejects_a_different_existing_immutable_daily_pool_transactionally(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool_day = date(2026, 7, 15)
    repository.save_word_pool(
        DailyWordPool(
            day=pool_day,
            algorithm_version=1,
            words=(DailyGameWord("n5", "Vocabulary N5", 4, "猫", "neko", "cat", "due"),),
        )
    )
    repository.save_crossword_clues(
        pool_day, (DailyCrosswordClue(pool_position=0, clue="A feline."),)
    )
    database.save_state(
        "Existing Deck",
        ReviewState(card_id=8, repetitions=2, interval=4, next_review=date(2026, 7, 20)),
    )
    before = export_progress_snapshot()
    payload = _daily_games_snapshot()
    payload["progress"]["review_states"] = [
        {
            "deck": "Imported Deck",
            "card_id": 10,
            "ease_factor": 2.5,
            "interval": 3,
            "repetitions": 2,
            "next_review": "2026-07-18",
        }
    ]

    with pytest.raises(ValueError, match="existing immutable pool differs"):
        import_progress_snapshot(payload, conflict_mode="merge")

    after = export_progress_snapshot()
    assert after["progress"] == before["progress"]
    assert after["daily_games"] == before["daily_games"]


def test_merge_identical_daily_pool_safely_imports_dependents_and_derives_completion_key(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool_day = date(2026, 7, 15)
    repository.save_word_pool(
        DailyWordPool(
            day=pool_day,
            algorithm_version=1,
            words=(
                DailyGameWord("n5", "Vocabulary N5", 4, "パーティ", "paatii", "party", "due"),
            ),
        )
    )
    payload = _daily_games_snapshot()
    payload["daily_games"]["word_pools"][0]["words"][0]["character"] = " パ—ティ "
    payload["daily_games"]["crossword_clues"][0]["clue"] = " Definition, with punctuation. "
    payload["daily_games"]["attempts"][0].pop("completion_key")

    summary = import_progress_snapshot(payload, conflict_mode="merge")

    assert summary["daily_games"] == 1
    assert repository.load_crossword_clues(pool_day) == (
        DailyCrosswordClue(pool_position=0, clue="Definition, with punctuation."),
    )
    assert repository.load_attempts(pool_day)[0].outcomes == (
        DailyGameWordOutcome(pool_position=0, outcome="correct"),
    )
    exported_attempt = export_progress_snapshot()["daily_games"]["attempts"][0]
    assert exported_attempt["completion_key"] == "daily:2026-07-15:crossword"


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        pytest.param(
            ("daily_games", "word_pools", 0, "pool_day"),
            "2026-07-15T00:00:00",
            "YYYY-MM-DD",
            id="pool-day-must-be-date-only",
        ),
        pytest.param(
            ("daily_games", "word_pools", 0, "words", 0, "source"),
            " due ",
            "source must be one of",
            id="word-source-is-strict",
        ),
        pytest.param(
            ("daily_games", "word_pools", 0, "words", 0, "pool_position"),
            1,
            "contiguous from zero",
            id="pool-positions-match-repository-ordering",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "pool_day"),
            "2026-07-15T00:00:00",
            "YYYY-MM-DD",
            id="attempt-pool-day-must-be-date-only",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "game_type"),
            "Crossword",
            "game_type must be one of",
            id="game-type-is-strict",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "mode"),
            "Daily",
            "mode must be one of",
            id="mode-is-strict",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "completed_at_utc"),
            "2026-07-15T12:00:00",
            "timezone-aware and use UTC",
            id="completion-time-must-be-aware",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "completed_at_utc"),
            "2026-07-15T12:00:00+09:00",
            "timezone-aware and use UTC",
            id="completion-time-must-use-utc",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "outcomes"),
            [],
            "outcomes must not be empty",
            id="outcomes-must-not-be-empty",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "outcomes", 0, "pool_position"),
            9,
            "outside the saved pool",
            id="outcome-position-must-belong-to-pool",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "outcomes", 0, "outcome"),
            "Correct",
            "outcome must be one of",
            id="outcome-value-is-strict",
        ),
        pytest.param(
            ("daily_games", "crossword_clues", 0, "pool_position"),
            9,
            "outside the saved pool",
            id="clue-position-must-belong-to-pool",
        ),
        pytest.param(
            ("daily_games", "crossword_clues", 0, "clue"),
            "x" * 501,
            "at most 500",
            id="clue-length-matches-repository",
        ),
        pytest.param(
            ("daily_games", "attempts", 0, "completion_key"),
            "daily:2026-07-15:typing_blitz",
            "completion_key is inconsistent",
            id="completed-daily-key-must-be-consistent",
        ),
        pytest.param(
            ("daily_games", "streak_state", "last_completed_day"),
            "2026-07-15T12:00:00",
            "YYYY-MM-DD",
            id="streak-day-must-be-date-only",
        ),
        pytest.param(
            ("daily_games", "miss_signals", 0, "missed_on"),
            "2026-07-15T12:00:00",
            "YYYY-MM-DD",
            id="miss-day-must-be-date-only",
        ),
    ],
)
def test_import_rejects_daily_games_rows_outside_repository_invariants(
    tmp_path: Path,
    monkeypatch,
    path: tuple[str | int, ...],
    value: object,
    message: str,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload = _daily_games_snapshot()
    _set_nested(payload, path, value)

    with pytest.raises(ValueError, match=message):
        import_progress_snapshot(payload, conflict_mode="overwrite")


def test_late_daily_games_validation_failure_rolls_back_overwrite(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    original = _daily_games_snapshot()
    import_progress_snapshot(original, conflict_mode="overwrite")
    database.save_state(
        "Existing Deck",
        ReviewState(card_id=3, repetitions=2, interval=5, next_review=date(2026, 7, 20)),
    )
    before = export_progress_snapshot()
    invalid = deepcopy(original)
    invalid["progress"]["review_states"] = []
    invalid["daily_games"]["word_pools"][0]["words"][0]["character"] = "置換"
    invalid["daily_games"]["miss_signals"][0]["missed_on"] = "2026-07-15T12:00:00"

    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        import_progress_snapshot(invalid, conflict_mode="overwrite")

    after = export_progress_snapshot()
    assert after["progress"] == before["progress"]
    assert after["daily_games"] == before["daily_games"]


def test_import_legacy_progress_snapshot_leaves_daily_games_untouched(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(
        DailyWordPool(
            day=date(2026, 7, 15), algorithm_version=1,
            words=(DailyGameWord("n5", "Vocabulary N5", 4, "猫", "neko", "cat", "due"),),
        )
    )
    legacy_snapshot = {
        "format_version": 1,
        "progress": {
            "review_states": [], "review_events": [], "curriculum_stages": [],
            "leech_items": [], "session_goals": [],
        },
        "custom_decks": [],
    }

    summary = import_progress_snapshot(legacy_snapshot, conflict_mode="overwrite")

    assert summary["daily_games"] == 0
    assert repository.load_word_pool(pool.day) == pool


@pytest.mark.parametrize(
    (
        "local_outcome",
        "local_hour",
        "imported_outcome",
        "imported_hour",
        "expected_missed",
    ),
    [
        pytest.param("correct", 12, "incorrect", 10, False, id="older-imported-miss"),
        pytest.param("incorrect", 10, "correct", 12, False, id="newer-imported-correction"),
        pytest.param("correct", 12, "incorrect", 12, True, id="attempt-id-tie-break"),
    ],
)
def test_merge_rebuilds_miss_signals_in_completion_chronology(
    tmp_path: Path,
    monkeypatch,
    local_outcome: str,
    local_hour: int,
    imported_outcome: str,
    imported_hour: int,
    expected_missed: bool,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool_day = date(2026, 7, 15)
    repository.save_word_pool(
        DailyWordPool(
            day=pool_day,
            algorithm_version=1,
            words=(
                DailyGameWord(
                    "n5", "Vocabulary N5", 4, "パーティ", "paatii", "party", "due"
                ),
            ),
        )
    )
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool_day,
            game_type="typing_blitz",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 15, local_hour, tzinfo=timezone.utc),
            outcomes=(
                DailyGameWordOutcome(pool_position=0, outcome=local_outcome),  # type: ignore[arg-type]
            ),
        )
    )
    payload = _daily_games_snapshot()
    imported_attempt = payload["daily_games"]["attempts"][0]
    imported_attempt.update(
        {
            "game_type": "typing_blitz",
            "mode": "practice",
            "score": 0,
            "completed": 0,
            "duration_seconds": None,
            "completed_at_utc": f"2026-07-15T{imported_hour:02d}:00:00+00:00",
            "completion_key": None,
            "outcomes": [{"pool_position": 0, "outcome": imported_outcome}],
        }
    )
    payload["daily_games"]["miss_signals"] = [
        {"deck_name": "Vocabulary N5", "card_id": 4, "missed_on": "2026-07-14"}
    ]

    import_progress_snapshot(payload, conflict_mode="merge")

    expected_card_ids = {4} if expected_missed else set()
    expected_signals = (
        [{"deck_name": "Vocabulary N5", "card_id": 4, "missed_on": "2026-07-15"}]
        if expected_missed
        else []
    )
    assert repository.load_active_game_miss_card_ids(
        "Vocabulary N5", pool_day
    ) == expected_card_ids
    assert export_progress_snapshot()["daily_games"]["miss_signals"] == expected_signals


def test_merge_rebuilt_miss_signal_uses_pool_day_not_completion_utc_day(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload = _daily_games_snapshot()
    attempt = payload["daily_games"]["attempts"][0]
    attempt.update(
        {
            "mode": "practice",
            "completed": 0,
            "completed_at_utc": "2026-07-16T01:00:00+00:00",
            "completion_key": None,
            "outcomes": [{"pool_position": 0, "outcome": "incorrect"}],
        }
    )
    payload["daily_games"]["miss_signals"] = []

    import_progress_snapshot(payload, conflict_mode="merge")

    assert export_progress_snapshot()["daily_games"]["miss_signals"] == [
        {"deck_name": "Vocabulary N5", "card_id": 4, "missed_on": "2026-07-15"}
    ]


def test_import_rejects_daily_pool_larger_than_renderer_contract(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload = _daily_games_snapshot()
    template = payload["daily_games"]["word_pools"][0]["words"][0]
    payload["daily_games"]["word_pools"][0]["words"] = [
        {
            **template,
            "pool_position": position,
            "card_id": position,
            "character": f"語{position}",
        }
        for position in range(21)
    ]
    payload["daily_games"]["attempts"] = []
    payload["daily_games"]["crossword_clues"] = []
    payload["daily_games"]["miss_signals"] = []

    with pytest.raises(ValueError, match="at most 20 words"):
        import_progress_snapshot(payload, conflict_mode="overwrite")


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        pytest.param("best_streak_days", 0, "at least current", id="best-below-current"),
        pytest.param("current_streak_days", 0, "must be positive", id="zero-current"),
        pytest.param("freezes_available", 4, "at most 3", id="too-many-freezes"),
        pytest.param("freeze_month", "2026-07-02", "first day", id="invalid-freeze-month"),
    ],
)
def test_import_rejects_invalid_daily_games_streak_invariants(
    tmp_path: Path,
    monkeypatch,
    field: str,
    value: object,
    message: str,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    payload = _daily_games_snapshot()
    payload["daily_games"]["streak_state"][field] = value

    with pytest.raises(ValueError, match=message):
        import_progress_snapshot(payload, conflict_mode="overwrite")
