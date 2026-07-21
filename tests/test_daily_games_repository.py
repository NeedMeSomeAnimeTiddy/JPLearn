"""Persistence tests for Daily Games V14 data."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path

from data import database
from data.daily_games_repository import (
    DailyGameAttempt,
    DailyCrosswordClue,
    DailyGameOutcomeValue,
    DailyGameWordOutcome,
    DailyGamesRepository,
)
from domain.daily_games import DailyGameWord, DailyGamesStreakState, DailyWordPool
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> Path:
    db_path = tmp_path / "jplearn-daily-games.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    return db_path


def _pool(
    pool_day: date = date(2026, 7, 15),
    *,
    algorithm_version: int = 1,
) -> DailyWordPool:
    return DailyWordPool(
        day=pool_day,
        algorithm_version=algorithm_version,
        words=(
            DailyGameWord(
                deck_slug=" vocab-n5 ",
                deck_name=" Vocabulary N5 ",
                card_id=4,
                character=" パ—ティ ",
                romaji=" paatii ",
                meaning=" party ",
                source="due",
            ),
            DailyGameWord(
                deck_slug="vocab-n4",
                deck_name="Vocabulary N4",
                card_id=8,
                character="猫",
                romaji="neko",
                meaning="cat",
                source="recent",
            ),
        ),
    )


def test_fresh_migration_creates_daily_games_schema(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)

    database.init_db()

    expected_tables = {
        "daily_word_pools",
        "daily_word_pool_words",
        "daily_game_attempts",
        "daily_game_attempt_word_outcomes",
        "daily_games_streak_state",
        "daily_crossword_clues",
        "daily_game_miss_signals",
    }
    with closing(sqlite3.connect(db_path)) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        attempt_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(daily_game_attempts)").fetchall()
        }
        version = conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()

    assert expected_tables <= tables
    assert attempt_columns == {
        "id",
        "pool_day",
        "game_type",
        "mode",
        "score",
        "completed",
        "duration_seconds",
        "completed_at_utc",
        "completion_key",
    }
    assert version == (database.LATEST_SCHEMA_VERSION,)


def test_upgrade_from_v13_preserves_review_rows(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    with closing(sqlite3.connect(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        database._ensure_schema_version_table(conn)
        for version in range(database.MIGRATION_V1, database.MIGRATION_V13 + 1):
            database.MIGRATIONS[version](conn)
            database._store_schema_version(conn, version)
        conn.execute(
            """
            INSERT INTO review_states (
                deck, card_id, ease_factor, interval, repetitions, next_review,
                stability, difficulty, last_review
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("Vocabulary N5", 4, 2.5, 3, 2, "2026-07-16", 1.2, 4.8, "2026-07-15"),
        )
        conn.execute(
            """
            INSERT INTO review_events (deck, card_id, quality, reviewed_on)
            VALUES (?, ?, ?, ?)
            """,
            ("Vocabulary N5", 4, 4, "2026-07-15"),
        )
        conn.commit()

    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
        state = conn.execute(
            "SELECT deck, card_id, repetitions FROM review_states"
        ).fetchone()
        event = conn.execute(
            "SELECT deck, card_id, quality, reviewed_on FROM review_events"
        ).fetchone()
        version = conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()
        daily_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daily_word_pools'"
        ).fetchone()

    assert state == ("Vocabulary N5", 4, 2)
    assert event == ("Vocabulary N5", 4, 4, "2026-07-15")
    assert version == (database.LATEST_SCHEMA_VERSION,)
    assert daily_table == ("daily_word_pools",)


def test_upgrade_from_v14_preserves_duplicate_completed_daily_attempts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    with closing(sqlite3.connect(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        database._ensure_schema_version_table(conn)
        for version in range(database.MIGRATION_V1, database.MIGRATION_V14 + 1):
            database.MIGRATIONS[version](conn)
            database._store_schema_version(conn, version)
        conn.execute(
            "INSERT INTO daily_word_pools (pool_day, algorithm_version) VALUES (?, ?)",
            ("2026-07-15", 1),
        )
        conn.executemany(
            """
            INSERT INTO daily_game_attempts (
                pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("2026-07-15", "crossword", "daily", 10, 1, 20, "2026-07-15T12:00:00+00:00"),
                ("2026-07-15", "crossword", "daily", 20, 1, 10, "2026-07-15T13:00:00+00:00"),
            ],
        )
        conn.commit()

    database.init_db()

    with closing(sqlite3.connect(db_path)) as conn:
        attempts = conn.execute(
            "SELECT score, completed, completion_key FROM daily_game_attempts ORDER BY id ASC"
        ).fetchall()
        version = conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()

    assert attempts == [
        (10, 1, "daily:2026-07-15:crossword"),
        (20, 1, None),
    ]
    assert version == (database.LATEST_SCHEMA_VERSION,)


def test_pool_round_trip_normalizes_text_and_preserves_word_order(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()

    saved = repository.save_word_pool(_pool())

    assert saved == DailyWordPool(
        day=date(2026, 7, 15),
        algorithm_version=1,
        words=(
            DailyGameWord(
                deck_slug="vocab-n5",
                deck_name="Vocabulary N5",
                card_id=4,
                character="パーティ",
                romaji="paatii",
                meaning="party",
                source="due",
            ),
            DailyGameWord(
                deck_slug="vocab-n4",
                deck_name="Vocabulary N4",
                card_id=8,
                character="猫",
                romaji="neko",
                meaning="cat",
                source="recent",
            ),
        ),
    )
    assert repository.load_word_pool(date(2026, 7, 15)) == saved


def test_repeated_pool_save_preserves_original_snapshot(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    original = repository.save_word_pool(_pool())
    replacement = DailyWordPool(
        day=original.day,
        algorithm_version=2,
        words=(
            DailyGameWord(
                deck_slug="replacement",
                deck_name="Replacement",
                card_id=99,
                character="置換",
                romaji="chikan",
                meaning="replacement",
                source="new",
            ),
        ),
    )

    returned = repository.save_word_pool(replacement)

    assert returned == original
    assert repository.load_word_pool(original.day) == original


def test_attempt_outcomes_and_streak_round_trip(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())
    attempt = DailyGameAttempt(
        pool_day=pool.day,
        game_type="match_pairs",
        mode="daily",
        score=120,
        completed=True,
        duration_seconds=45,
        completed_at_utc=datetime(2026, 7, 15, 12, 30, tzinfo=timezone.utc),
        outcomes=(
            DailyGameWordOutcome(pool_position=1, outcome="incorrect"),
            DailyGameWordOutcome(pool_position=0, outcome="correct"),
        ),
    )
    streak = DailyGamesStreakState(
        last_completed_day=pool.day,
        current_streak_days=5,
        best_streak_days=7,
        freezes_available=2,
        freeze_month=date(2026, 7, 1),
    )

    saved_attempt = repository.save_attempt(attempt)
    repository.save_streak_state(streak)

    assert saved_attempt.attempt_id is not None
    assert repository.load_attempt(saved_attempt.attempt_id) == DailyGameAttempt(
        attempt_id=saved_attempt.attempt_id,
        pool_day=pool.day,
        game_type="match_pairs",
        mode="daily",
        score=120,
        completed=True,
        duration_seconds=45,
        completed_at_utc=datetime(2026, 7, 15, 12, 30, tzinfo=timezone.utc),
        outcomes=(
            DailyGameWordOutcome(pool_position=0, outcome="correct"),
            DailyGameWordOutcome(pool_position=1, outcome="incorrect"),
        ),
    )
    assert repository.load_attempts(pool.day) == [repository.load_attempt(saved_attempt.attempt_id)]
    assert repository.load_streak_state() == streak


def test_completed_daily_attempt_is_idempotent_per_pool_day_and_game_type(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())
    first = repository.save_attempt_result(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="daily",
            score=50,
            completed=True,
            duration_seconds=20,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="correct"),),
        )
    )
    repeated = repository.save_attempt_result(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="daily",
            score=99,
            completed=True,
            duration_seconds=10,
            completed_at_utc=datetime(2026, 7, 15, 1, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=1, outcome="incorrect"),),
        )
    )

    assert first.created is True
    assert repeated.created is False
    assert repeated.attempt == first.attempt
    assert repository.load_attempts(pool.day) == [first.attempt]
    assert repository.load_active_game_miss_card_ids("Vocabulary N4", pool.day) == set()


def test_daily_game_miss_signals_remain_tied_to_pool_day_and_expire_after_seven_days(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())

    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 20, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )

    assert repository.load_active_game_miss_card_ids(
        "Vocabulary N5", date(2026, 7, 22)
    ) == {4}
    assert repository.load_active_game_miss_card_ids(
        "Vocabulary N5", date(2026, 7, 23)
    ) == set()
    with closing(sqlite3.connect(tmp_path / "jplearn-daily-games.db")) as conn:
        assert conn.execute(
            "SELECT deck_name, card_id, missed_on FROM daily_game_miss_signals"
        ).fetchall() == [("Vocabulary N5", 4, "2026-07-15")]


def test_daily_game_miss_signal_uses_local_pool_day_at_utc_boundary(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool(date(2026, 7, 15)))

    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="crossword",
            mode="practice",
            score=0,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 16, 1, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )

    with closing(sqlite3.connect(db_path)) as conn:
        missed_on = conn.execute(
            "SELECT missed_on FROM daily_game_miss_signals WHERE deck_name = ? AND card_id = ?",
            ("Vocabulary N5", 4),
        ).fetchone()

    assert missed_on == ("2026-07-15",)
    assert repository.load_active_game_miss_card_ids("Vocabulary N5", date(2026, 7, 22)) == {4}


def test_correct_daily_game_outcome_clears_card_miss_signal(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())

    outcomes: tuple[tuple[DailyGameOutcomeValue, datetime], ...] = (
        ("incorrect", datetime(2026, 7, 15, tzinfo=timezone.utc)),
        ("correct", datetime(2026, 7, 16, tzinfo=timezone.utc)),
    )
    for outcome, completed_at in outcomes:
        repository.save_attempt(
            DailyGameAttempt(
                pool_day=pool.day,
                game_type="typing_blitz",
                mode="practice",
                score=0,
                completed=False,
                duration_seconds=None,
                completed_at_utc=completed_at,
                outcomes=(DailyGameWordOutcome(pool_position=0, outcome=outcome),),
            )
        )

    assert repository.load_active_game_miss_card_ids("Vocabulary N5", date(2026, 7, 16)) == set()


def test_daily_games_operations_do_not_change_srs_rows(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    database.init_db()
    database.save_state(
        "Vocabulary N5",
        ReviewState(card_id=4, repetitions=1, interval=2, next_review=date(2026, 7, 16)),
    )
    database.log_review("Vocabulary N5", 4, 4, reviewed_on=date(2026, 7, 15))
    with closing(sqlite3.connect(db_path)) as conn:
        before_states = conn.execute("SELECT * FROM review_states").fetchall()
        before_events = conn.execute("SELECT * FROM review_events").fetchall()

    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="word_search",
            mode="practice",
            score=10,
            completed=False,
            duration_seconds=None,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )
    repository.save_streak_state(DailyGamesStreakState(current_streak_days=1))
    with closing(sqlite3.connect(db_path)) as conn:
        after_states = conn.execute("SELECT * FROM review_states").fetchall()
        after_events = conn.execute("SELECT * FROM review_events").fetchall()

    assert after_states == before_states
    assert after_events == before_events
    assert repository.load_active_game_miss_card_ids("Vocabulary N5", date(2026, 7, 15)) == {4}


def test_crossword_clues_are_stable_per_pool_position_and_do_not_change_srs_rows(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    database.init_db()
    database.save_state(
        "Vocabulary N5",
        ReviewState(card_id=4, repetitions=1, interval=2, next_review=date(2026, 7, 16)),
    )
    database.log_review("Vocabulary N5", 4, 4, reviewed_on=date(2026, 7, 15))
    with closing(sqlite3.connect(db_path)) as conn:
        before_states = conn.execute("SELECT * FROM review_states").fetchall()
        before_events = conn.execute("SELECT * FROM review_events").fetchall()

    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())
    first = repository.save_crossword_clues(
        pool.day,
        (
            DailyCrosswordClue(pool_position=1, clue=" A feline "),
            DailyCrosswordClue(pool_position=0, clue=" パ—ティ "),
        ),
    )
    repeated = repository.save_crossword_clues(
        pool.day,
        (DailyCrosswordClue(pool_position=0, clue="replacement clue"),),
    )

    assert first == (
        DailyCrosswordClue(pool_position=0, clue="パーティ"),
        DailyCrosswordClue(pool_position=1, clue="A feline"),
    )
    assert repeated == first
    assert repository.load_crossword_clues(pool.day) == first
    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute("SELECT * FROM review_states").fetchall() == before_states
        assert conn.execute("SELECT * FROM review_events").fetchall() == before_events


def test_reset_clears_daily_games_tables(tmp_path: Path, monkeypatch) -> None:
    db_path = _use_temp_db(tmp_path, monkeypatch)
    repository = DailyGamesRepository()
    pool = repository.save_word_pool(_pool())
    repository.save_attempt(
        DailyGameAttempt(
            pool_day=pool.day,
            game_type="typing_blitz",
            mode="daily",
            score=5,
            completed=True,
            duration_seconds=15,
            completed_at_utc=datetime(2026, 7, 15, tzinfo=timezone.utc),
            outcomes=(DailyGameWordOutcome(pool_position=0, outcome="incorrect"),),
        )
    )
    repository.save_streak_state(DailyGamesStreakState(current_streak_days=1))

    database.reset_db()

    assert repository.load_word_pool(pool.day) is None
    assert repository.load_attempts() == []
    assert repository.load_streak_state() == DailyGamesStreakState()
    assert repository.load_active_game_miss_card_ids("Vocabulary N5", pool.day) == set()
    with closing(sqlite3.connect(db_path)) as conn:
        counts = {
            table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "daily_word_pools",
                "daily_word_pool_words",
                "daily_game_attempts",
                "daily_game_attempt_word_outcomes",
                "daily_games_streak_state",
                "daily_crossword_clues",
                "daily_game_miss_signals",
            )
        }
    assert counts == {table: 0 for table in counts}
