"""Import/export helpers for deck progress portability."""

from __future__ import annotations

import csv
import io
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from collections.abc import Generator
from typing import Any

from data import database
from data.text_normalization import normalize_japanese_text, normalize_storage_text
from domain.daily_games import DEFAULT_DAILY_POOL_LIMIT, MAX_MONTHLY_FREEZES

FORMAT_VERSION = 1

_DAILY_GAME_TYPES = frozenset({"crossword", "word_search", "match_pairs", "typing_blitz"})
_DAILY_GAME_MODES = frozenset({"daily", "practice"})
_DAILY_GAME_OUTCOMES = frozenset({"correct", "incorrect"})
_DAILY_WORD_SOURCES = frozenset({"due", "recent", "new"})
_MAX_CROSSWORD_CLUE_LENGTH = 500
_ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


@contextmanager
def _connect() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(database.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _normalize_deck_name(value: str) -> str:
    return normalize_storage_text(value)


def _normalize_script_tag(value: str) -> str:
    return normalize_storage_text(value).lower()


def _normalize_row_list(snapshot: dict[str, Any], key: str) -> list[dict[str, Any]]:
    raw = snapshot.get(key, [])
    if not isinstance(raw, list):
        raise ValueError(f"snapshot field '{key}' must be a list")
    rows: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError(f"snapshot field '{key}' must contain objects")
        rows.append(entry)
    return rows


def _required_text(value: object, field: str, *, japanese: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    normalized = normalize_japanese_text(value) if japanese else normalize_storage_text(value)
    if not normalized:
        raise ValueError(f"{field} must not be empty")
    return normalized


def _required_nonnegative_int(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")
    return value


def _required_date_only(value: object, field: str, *, allow_none: bool = False) -> str | None:
    if value is None and allow_none:
        return None
    if not isinstance(value, str) or _ISO_DATE_PATTERN.fullmatch(value) is None:
        raise ValueError(f"{field} must use an ISO date in YYYY-MM-DD form")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field} must use an ISO date in YYYY-MM-DD form") from exc
    return parsed.isoformat()


def _required_utc_datetime(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO datetime string")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO datetime string") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError(f"{field} must be timezone-aware and use UTC")
    return parsed.isoformat()


def _required_supported_value(
    value: object,
    field: str,
    supported: frozenset[str],
) -> str:
    if not isinstance(value, str) or value not in supported:
        choices = ", ".join(sorted(supported))
        raise ValueError(f"{field} must be one of: {choices}")
    return value


def _required_crossword_clue_text(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    has_japanese_script = any(
        "\u3040" <= character <= "\u30ff" or "\u3400" <= character <= "\u9fff"
        for character in value
    )
    normalized = (
        normalize_japanese_text(value) if has_japanese_script else normalize_storage_text(value)
    )
    if not normalized:
        raise ValueError(f"{field} must not be empty")
    if len(normalized) > _MAX_CROSSWORD_CLUE_LENGTH:
        raise ValueError(f"{field} must be at most {_MAX_CROSSWORD_CLUE_LENGTH} characters")
    return normalized


def _normalize_daily_games_section(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    """Validate the optional Daily Games export section before opening a transaction."""
    daily_games = snapshot.get("daily_games")
    if daily_games is None:
        return None
    if not isinstance(daily_games, dict):
        raise ValueError("snapshot field 'daily_games' must be an object")
    return {
        "word_pools": _normalize_row_list(daily_games, "word_pools"),
        "attempts": _normalize_row_list(daily_games, "attempts"),
        "streak_state": daily_games.get("streak_state"),
        "crossword_clues": _normalize_row_list(daily_games, "crossword_clues"),
        "miss_signals": _normalize_row_list(daily_games, "miss_signals"),
    }


def _event_key(row: sqlite3.Row | dict[str, Any]) -> tuple[Any, ...]:
    return (
        str(row["deck"]),
        int(row["card_id"]),
        int(row["quality"]),
        str(row["reviewed_on"]),
        str(row["reviewed_at_utc"]),
        str(row["script_tag"]),
        None if row["curriculum_stage"] is None else int(row["curriculum_stage"]),
        str(row["prompt_text"]),
        str(row["tags_csv"]),
        str(row["session_id"]),
        None if row["confidence_score"] is None else int(row["confidence_score"]),
    )


def export_progress_snapshot() -> dict[str, Any]:
    """Export persisted progress and custom deck payload placeholders as JSON-ready data."""
    database.init_db()
    exported_at_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        review_states = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, ease_factor, interval, repetitions, next_review,
                       stability, difficulty, last_review
                FROM review_states
                ORDER BY deck ASC, card_id ASC
                """
            ).fetchall()
        ]
        review_events = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, quality, reviewed_on, reviewed_at_utc,
                       script_tag, curriculum_stage, prompt_text, tags_csv,
                       session_id, confidence_score
                FROM review_events
                ORDER BY id ASC
                """
            ).fetchall()
        ]
        curriculum_stages = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, mode, stage, updated_at_utc
                FROM curriculum_stages
                ORDER BY deck ASC, card_id ASC, mode ASC
                """
            ).fetchall()
        ]
        leech_items = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc
                FROM leech_items
                ORDER BY deck ASC, card_id ASC
                """
            ).fetchall()
        ]
        session_goals = [
            dict(row)
            for row in conn.execute(
                """
                SELECT session_id, target_items, target_minutes, target_accuracy, started_at_utc
                FROM session_goals
                ORDER BY session_id ASC
                """
            ).fetchall()
        ]
        daily_word_pools = [
            dict(row)
            for row in conn.execute(
                """
                SELECT pool_day, algorithm_version
                FROM daily_word_pools
                ORDER BY pool_day ASC
                """
            ).fetchall()
        ]
        pool_words_by_day: dict[str, list[dict[str, Any]]] = {}
        for row in conn.execute(
            """
            SELECT pool_day, pool_position, deck_slug, deck_name, card_id,
                   character, romaji, meaning, source
            FROM daily_word_pool_words
            ORDER BY pool_day ASC, pool_position ASC
            """
        ).fetchall():
            word = dict(row)
            pool_words_by_day.setdefault(str(word.pop("pool_day")), []).append(word)
        daily_attempts: list[dict[str, Any]] = []
        for row in conn.execute(
            """
            SELECT id, pool_day, game_type, mode, score, completed, duration_seconds,
                   completed_at_utc, completion_key
            FROM daily_game_attempts
            ORDER BY id ASC
            """
        ).fetchall():
            attempt = dict(row)
            attempt["attempt_id"] = attempt.pop("id")
            attempt["outcomes"] = [
                dict(outcome)
                for outcome in conn.execute(
                    """
                    SELECT pool_position, outcome
                    FROM daily_game_attempt_word_outcomes
                    WHERE attempt_id = ?
                    ORDER BY pool_position ASC
                    """,
                    (attempt["attempt_id"],),
                ).fetchall()
            ]
            daily_attempts.append(attempt)
        streak_row = conn.execute(
            """
            SELECT last_completed_day, current_streak_days, best_streak_days,
                   freezes_available, freeze_month
            FROM daily_games_streak_state WHERE id = 1
            """
        ).fetchone()
        crossword_clues = [
            dict(row)
            for row in conn.execute(
                """
                SELECT pool_day, pool_position, clue
                FROM daily_crossword_clues
                ORDER BY pool_day ASC, pool_position ASC
                """
            ).fetchall()
        ]
        miss_signals = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck_name, card_id, missed_on
                FROM daily_game_miss_signals
                ORDER BY deck_name ASC, card_id ASC
                """
            ).fetchall()
        ]

    return {
        "format_version": FORMAT_VERSION,
        "exported_at_utc": exported_at_utc,
        "progress": {
            "review_states": review_states,
            "review_events": review_events,
            "curriculum_stages": curriculum_stages,
            "leech_items": leech_items,
            "session_goals": session_goals,
        },
        "custom_decks": [],
        "daily_games": {
            "word_pools": [
                {**pool, "words": pool_words_by_day.get(pool["pool_day"], [])}
                for pool in daily_word_pools
            ],
            "attempts": daily_attempts,
            "streak_state": dict(streak_row) if streak_row is not None else None,
            "crossword_clues": crossword_clues,
            "miss_signals": miss_signals,
        },
    }


def import_progress_snapshot(snapshot: dict[str, Any], conflict_mode: str = "merge") -> dict[str, int]:
    """Import progress snapshot with merge or overwrite conflict handling."""
    if conflict_mode not in {"merge", "overwrite"}:
        raise ValueError("conflict_mode must be 'merge' or 'overwrite'")

    if int(snapshot.get("format_version", 0)) != FORMAT_VERSION:
        raise ValueError(
            f"unsupported snapshot format_version {snapshot.get('format_version')}; expected {FORMAT_VERSION}"
        )

    progress = snapshot.get("progress")
    if not isinstance(progress, dict):
        raise ValueError("snapshot field 'progress' must be an object")

    review_states = _normalize_row_list(progress, "review_states")
    review_events = _normalize_row_list(progress, "review_events")
    curriculum_stages = _normalize_row_list(progress, "curriculum_stages")
    leech_items = _normalize_row_list(progress, "leech_items")
    session_goals = _normalize_row_list(progress, "session_goals")
    custom_decks = _normalize_row_list(snapshot, "custom_decks")
    daily_games = _normalize_daily_games_section(snapshot)

    database.init_db()

    imported_events = 0
    with _connect() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        if conflict_mode == "overwrite":
            conn.execute("DELETE FROM review_events")
            conn.execute("DELETE FROM review_states")
            conn.execute("DELETE FROM leech_items")
            conn.execute("DELETE FROM curriculum_stages")
            conn.execute("DELETE FROM session_goals")
            if daily_games is not None:
                conn.execute("DELETE FROM daily_game_attempt_word_outcomes")
                conn.execute("DELETE FROM daily_game_attempts")
                conn.execute("DELETE FROM daily_game_miss_signals")
                conn.execute("DELETE FROM daily_crossword_clues")
                conn.execute("DELETE FROM daily_word_pool_words")
                conn.execute("DELETE FROM daily_word_pools")
                conn.execute("DELETE FROM daily_games_streak_state")

        conn.executemany(
            """
            INSERT INTO review_states (
                deck, card_id, ease_factor, interval, repetitions, next_review,
                stability, difficulty, last_review
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                ease_factor=excluded.ease_factor,
                interval=excluded.interval,
                repetitions=excluded.repetitions,
                next_review=excluded.next_review,
                stability=excluded.stability,
                difficulty=excluded.difficulty,
                last_review=excluded.last_review
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    float(row["ease_factor"]),
                    int(row["interval"]),
                    int(row["repetitions"]),
                    normalize_storage_text(str(row["next_review"])),
                    float(row.get("stability", 0.0) or 0.0),
                    float(row.get("difficulty", 0.0) or 0.0),
                    (
                        normalize_storage_text(str(row["last_review"]))
                        if row.get("last_review")
                        else None
                    ),
                )
                for row in review_states
            ],
        )

        conn.executemany(
            """
            INSERT INTO curriculum_stages (deck, card_id, mode, stage, updated_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id, mode) DO UPDATE SET
                stage=excluded.stage,
                updated_at_utc=excluded.updated_at_utc
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    normalize_storage_text(str(row["mode"])).lower(),
                    max(1, min(3, int(row["stage"]))),
                    normalize_storage_text(str(row["updated_at_utc"])),
                )
                for row in curriculum_stages
            ],
        )

        conn.executemany(
            """
            INSERT INTO leech_items (deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                is_active=excluded.is_active,
                attempts_recent=excluded.attempts_recent,
                failures_recent=excluded.failures_recent,
                last_evaluated_utc=excluded.last_evaluated_utc
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    1 if int(row["is_active"]) else 0,
                    int(row["attempts_recent"]),
                    int(row["failures_recent"]),
                    normalize_storage_text(str(row["last_evaluated_utc"])),
                )
                for row in leech_items
            ],
        )

        conn.executemany(
            """
            INSERT INTO session_goals (session_id, target_items, target_minutes, target_accuracy, started_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                target_items=excluded.target_items,
                target_minutes=excluded.target_minutes,
                target_accuracy=excluded.target_accuracy,
                started_at_utc=excluded.started_at_utc
            """,
            [
                (
                    normalize_storage_text(str(row["session_id"])),
                    int(row["target_items"]),
                    None if row["target_minutes"] is None else int(row["target_minutes"]),
                    None if row["target_accuracy"] is None else int(row["target_accuracy"]),
                    normalize_storage_text(str(row["started_at_utc"])),
                )
                for row in session_goals
            ],
        )

        existing_event_keys: set[tuple[Any, ...]] = set()
        if conflict_mode == "merge":
            existing_rows = conn.execute(
                """
                SELECT deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag,
                       curriculum_stage, prompt_text, tags_csv, session_id, confidence_score
                FROM review_events
                """
            ).fetchall()
            existing_event_keys = {_event_key(row) for row in existing_rows}

        event_params: list[tuple[Any, ...]] = []
        for row in review_events:
            record = {
                "deck": _normalize_deck_name(str(row["deck"])),
                "card_id": int(row["card_id"]),
                "quality": int(row["quality"]),
                "reviewed_on": normalize_storage_text(str(row["reviewed_on"])),
                "reviewed_at_utc": normalize_storage_text(str(row["reviewed_at_utc"])),
                "script_tag": _normalize_script_tag(str(row["script_tag"])),
                "curriculum_stage": None if row["curriculum_stage"] is None else int(row["curriculum_stage"]),
                "prompt_text": normalize_japanese_text(str(row["prompt_text"])),
                "tags_csv": normalize_storage_text(str(row["tags_csv"])),
                "session_id": normalize_storage_text(str(row["session_id"])),
                "confidence_score": None if row["confidence_score"] is None else int(row["confidence_score"]),
            }
            signature = _event_key(record)
            if conflict_mode == "merge" and signature in existing_event_keys:
                continue
            event_params.append(
                (
                    record["deck"],
                    record["card_id"],
                    record["quality"],
                    record["reviewed_on"],
                    record["reviewed_at_utc"],
                    record["script_tag"],
                    record["curriculum_stage"],
                    record["prompt_text"],
                    record["tags_csv"],
                    record["session_id"],
                    record["confidence_score"],
                )
            )
            if conflict_mode == "merge":
                existing_event_keys.add(signature)

        if event_params:
            conn.executemany(
                """
                INSERT INTO review_events (
                    deck, card_id, quality, reviewed_on, reviewed_at_utc,
                    script_tag, curriculum_stage, prompt_text, tags_csv,
                    session_id, confidence_score
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                event_params,
            )
            imported_events = len(event_params)

        if daily_games is not None:
            _import_daily_games(conn, daily_games, conflict_mode)

    return {
        "review_states": len(review_states),
        "review_events": imported_events,
        "curriculum_stages": len(curriculum_stages),
        "leech_items": len(leech_items),
        "session_goals": len(session_goals),
        "custom_decks": len(custom_decks),
        "daily_games": 0 if daily_games is None else len(daily_games["attempts"]),
    }


def _import_daily_games(
    conn: sqlite3.Connection,
    daily_games: dict[str, Any],
    conflict_mode: str,
) -> None:
    """Restore Daily Games rows in foreign-key order without touching SRS rows."""
    for pool in daily_games["word_pools"]:
        pool_day = _required_date_only(
            pool.get("pool_day"), "daily_games.word_pools.pool_day"
        )
        assert pool_day is not None
        algorithm_version = _required_nonnegative_int(
            pool.get("algorithm_version"), "daily_games.word_pools.algorithm_version"
        )
        if algorithm_version == 0:
            raise ValueError("daily_games.word_pools.algorithm_version must be positive")
        words = _normalize_row_list(pool, "words")
        if len(words) > DEFAULT_DAILY_POOL_LIMIT:
            raise ValueError(
                "daily_games.word_pools.words must contain at most "
                f"{DEFAULT_DAILY_POOL_LIMIT} words"
            )
        # Spelled out rather than tuple[object, ...] so the pool_position sort below
        # can use the int the validator already returned instead of re-parsing it.
        normalized_words: list[tuple[int, str, str, int, str, str, str, str]] = []
        positions: set[int] = set()
        for word in words:
            position = _required_nonnegative_int(
                word.get("pool_position"), "daily_games.word_pools.words.pool_position"
            )
            if position in positions:
                raise ValueError("daily_games.word_pools.words must not repeat pool_position")
            positions.add(position)
            source = _required_supported_value(
                word.get("source"),
                "daily_games.word_pools.words.source",
                _DAILY_WORD_SOURCES,
            )
            normalized_words.append(
                (
                    position,
                    _required_text(
                        word.get("deck_slug"), "daily_games.word_pools.words.deck_slug"
                    ),
                    _required_text(
                        word.get("deck_name"), "daily_games.word_pools.words.deck_name"
                    ),
                    _required_nonnegative_int(
                        word.get("card_id"), "daily_games.word_pools.words.card_id"
                    ),
                    _required_text(
                        word.get("character"),
                        "daily_games.word_pools.words.character",
                        japanese=True,
                    ),
                    _required_text(
                        word.get("romaji"), "daily_games.word_pools.words.romaji"
                    ),
                    _required_text(
                        word.get("meaning"), "daily_games.word_pools.words.meaning"
                    ),
                    source,
                )
            )
        if positions != set(range(len(normalized_words))):
            raise ValueError(
                "daily_games.word_pools.words.pool_position values must be contiguous from zero"
            )
        normalized_words.sort(key=lambda word: word[0])
        imported_signature = (algorithm_version, tuple(normalized_words))
        existing_header = conn.execute(
            "SELECT algorithm_version FROM daily_word_pools WHERE pool_day = ?",
            (pool_day,),
        ).fetchone()
        if existing_header is not None:
            existing_words = conn.execute(
                """
                SELECT pool_position, deck_slug, deck_name, card_id, character,
                       romaji, meaning, source
                FROM daily_word_pool_words
                WHERE pool_day = ?
                ORDER BY pool_position ASC
                """,
                (pool_day,),
            ).fetchall()
            existing_signature = (
                int(existing_header["algorithm_version"]),
                tuple(
                    (
                        int(word["pool_position"]),
                        str(word["deck_slug"]),
                        str(word["deck_name"]),
                        int(word["card_id"]),
                        str(word["character"]),
                        str(word["romaji"]),
                        str(word["meaning"]),
                        str(word["source"]),
                    )
                    for word in existing_words
                ),
            )
            if existing_signature != imported_signature:
                action = "merge" if conflict_mode == "merge" else "import"
                raise ValueError(
                    f"cannot {action} Daily Games pool for {pool_day}: "
                    "the existing immutable pool differs from the imported pool"
                )
            continue
        conn.execute(
            "INSERT INTO daily_word_pools (pool_day, algorithm_version) VALUES (?, ?)",
            (pool_day, algorithm_version),
        )
        conn.executemany(
            """INSERT INTO daily_word_pool_words (
                pool_day, pool_position, deck_slug, deck_name, card_id, character, romaji, meaning, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [(pool_day, *word) for word in normalized_words],
        )

    seen_clues: set[tuple[str, int]] = set()
    for clue in daily_games["crossword_clues"]:
        pool_day = _required_date_only(
            clue.get("pool_day"), "daily_games.crossword_clues.pool_day"
        )
        assert pool_day is not None
        position = _required_nonnegative_int(
            clue.get("pool_position"), "daily_games.crossword_clues.pool_position"
        )
        clue_key = (pool_day, position)
        if clue_key in seen_clues:
            raise ValueError("daily_games.crossword_clues must not repeat a pool position")
        seen_clues.add(clue_key)
        pool_positions = _saved_daily_pool_positions(conn, pool_day, "crossword clue")
        if position not in pool_positions:
            raise ValueError("daily_games.crossword_clues references a word outside the saved pool")
        conn.execute(
            """INSERT INTO daily_crossword_clues (pool_day, pool_position, clue) VALUES (?, ?, ?)
               ON CONFLICT(pool_day, pool_position) DO NOTHING""",
            (
                pool_day,
                position,
                _required_crossword_clue_text(
                    clue.get("clue"), "daily_games.crossword_clues.clue"
                ),
            ),
        )

    seen_attempt_ids: set[int] = set()
    seen_completion_keys: set[str] = set()
    for attempt in daily_games["attempts"]:
        attempt_id = _required_nonnegative_int(
            attempt.get("attempt_id"), "daily_games.attempts.attempt_id"
        )
        if attempt_id == 0:
            raise ValueError("daily_games.attempts.attempt_id must be positive")
        if attempt_id in seen_attempt_ids:
            raise ValueError("daily_games.attempts must not repeat attempt_id")
        seen_attempt_ids.add(attempt_id)
        pool_day = _required_date_only(
            attempt.get("pool_day"), "daily_games.attempts.pool_day"
        )
        assert pool_day is not None
        game_type = _required_supported_value(
            attempt.get("game_type"),
            "daily_games.attempts.game_type",
            _DAILY_GAME_TYPES,
        )
        mode = _required_supported_value(
            attempt.get("mode"), "daily_games.attempts.mode", _DAILY_GAME_MODES
        )
        completed_value = attempt.get("completed")
        if not (
            isinstance(completed_value, bool)
            or type(completed_value) is int and completed_value in (0, 1)
        ):
            raise ValueError("daily_games.attempts.completed must be a boolean")
        completed = bool(completed_value)
        score = _required_nonnegative_int(attempt.get("score"), "daily_games.attempts.score")
        duration = attempt.get("duration_seconds")
        if duration is not None:
            duration = _required_nonnegative_int(duration, "daily_games.attempts.duration_seconds")
        outcomes = _normalize_row_list(attempt, "outcomes")
        if not outcomes:
            raise ValueError("daily_games.attempts.outcomes must not be empty")
        outcome_params: list[tuple[int, str]] = []
        seen_positions: set[int] = set()
        for outcome in outcomes:
            position = _required_nonnegative_int(
                outcome.get("pool_position"),
                "daily_games.attempts.outcomes.pool_position",
            )
            result = _required_supported_value(
                outcome.get("outcome"),
                "daily_games.attempts.outcomes.outcome",
                _DAILY_GAME_OUTCOMES,
            )
            if position in seen_positions:
                raise ValueError("daily_games.attempts.outcomes must not repeat pool_position")
            seen_positions.add(position)
            outcome_params.append((position, result))
        pool_positions = _saved_daily_pool_positions(conn, pool_day, "attempt")
        if not seen_positions <= pool_positions:
            raise ValueError("daily_games.attempts.outcomes reference words outside the saved pool")
        outcome_params.sort(key=lambda outcome: outcome[0])
        completed_at_utc = _required_utc_datetime(
            attempt.get("completed_at_utc"), "daily_games.attempts.completed_at_utc"
        )
        expected_completion_key = (
            f"daily:{pool_day}:{game_type}" if mode == "daily" and completed else None
        )
        imported_completion_key = attempt.get("completion_key")
        if expected_completion_key is None:
            if imported_completion_key is not None:
                raise ValueError(
                    "daily_games.attempts.completion_key must be null unless the daily attempt is completed"
                )
            completion_key = None
        else:
            if imported_completion_key is not None and imported_completion_key != expected_completion_key:
                raise ValueError(
                    "daily_games.attempts.completion_key is inconsistent with the completed daily attempt"
                )
            completion_key = expected_completion_key
            if completion_key in seen_completion_keys:
                raise ValueError(
                    "daily_games.attempts repeats a completed daily attempt completion_key"
                )
            seen_completion_keys.add(completion_key)

        existing_rows = conn.execute(
            """SELECT id FROM daily_game_attempts
               WHERE pool_day = ? AND game_type = ? AND mode = ? AND score = ? AND completed = ?
                 AND duration_seconds IS ? AND completed_at_utc = ? AND completion_key IS ?
               ORDER BY id ASC""",
            (
                pool_day,
                game_type,
                mode,
                score,
                int(completed),
                duration,
                completed_at_utc,
                completion_key,
            ),
        ).fetchall()
        if conflict_mode == "merge" and any(
            _daily_attempt_outcomes(conn, int(existing["id"])) == tuple(outcome_params)
            for existing in existing_rows
        ):
            continue
        if completion_key is not None and conflict_mode == "merge":
            existing_completion = conn.execute(
                "SELECT id FROM daily_game_attempts WHERE completion_key = ?",
                (completion_key,),
            ).fetchone()
            if existing_completion is not None:
                continue
        attempt_values = (
            pool_day,
            game_type,
            mode,
            score,
            int(completed),
            duration,
            completed_at_utc,
            completion_key,
        )
        if conflict_mode == "overwrite":
            conn.execute(
                """INSERT INTO daily_game_attempts (
                    id, pool_day, game_type, mode, score, completed, duration_seconds,
                    completed_at_utc, completion_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (attempt_id, *attempt_values),
            )
            saved_attempt_id = attempt_id
        else:
            cursor = conn.execute(
                """INSERT INTO daily_game_attempts (
                    pool_day, game_type, mode, score, completed, duration_seconds,
                    completed_at_utc, completion_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                attempt_values,
            )
            if cursor.lastrowid is None:
                raise RuntimeError("Daily Games attempt import did not return an id")
            saved_attempt_id = int(cursor.lastrowid)
        conn.executemany(
            "INSERT INTO daily_game_attempt_word_outcomes (attempt_id, pool_position, outcome) VALUES (?, ?, ?)",
            [(saved_attempt_id, position, result) for position, result in outcome_params],
        )

    streak_values = _normalize_daily_games_streak(daily_games["streak_state"])
    if streak_values is not None and conflict_mode == "overwrite":
        conn.execute(
            """INSERT INTO daily_games_streak_state (
                id, last_completed_day, current_streak_days, best_streak_days, freezes_available, freeze_month
            ) VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET last_completed_day=excluded.last_completed_day,
                current_streak_days=excluded.current_streak_days, best_streak_days=excluded.best_streak_days,
                freezes_available=excluded.freezes_available, freeze_month=excluded.freeze_month""",
            streak_values,
        )

    for signal in daily_games["miss_signals"]:
        _required_text(signal.get("deck_name"), "daily_games.miss_signals.deck_name")
        _required_nonnegative_int(
            signal.get("card_id"), "daily_games.miss_signals.card_id"
        )
        _required_date_only(
            signal.get("missed_on"), "daily_games.miss_signals.missed_on"
        )

    _rebuild_daily_game_miss_signals(conn)


def _normalize_daily_games_streak(
    streak: object,
) -> tuple[str | None, int, int, int, str | None] | None:
    """Validate an exported streak singleton without using it as merge history."""
    if streak is None:
        return None
    if not isinstance(streak, dict):
        raise ValueError("daily_games.streak_state must be an object or null")

    last_completed_day = _required_date_only(
        streak.get("last_completed_day"),
        "daily_games.streak_state.last_completed_day",
        allow_none=True,
    )
    current_streak_days = _required_nonnegative_int(
        streak.get("current_streak_days"),
        "daily_games.streak_state.current_streak_days",
    )
    best_streak_days = _required_nonnegative_int(
        streak.get("best_streak_days"),
        "daily_games.streak_state.best_streak_days",
    )
    freezes_available = _required_nonnegative_int(
        streak.get("freezes_available"),
        "daily_games.streak_state.freezes_available",
    )
    freeze_month = _required_date_only(
        streak.get("freeze_month"),
        "daily_games.streak_state.freeze_month",
        allow_none=True,
    )

    if best_streak_days < current_streak_days:
        raise ValueError(
            "daily_games.streak_state.best_streak_days must be at least current_streak_days"
        )
    if freezes_available > MAX_MONTHLY_FREEZES:
        raise ValueError(
            "daily_games.streak_state.freezes_available must be at most "
            f"{MAX_MONTHLY_FREEZES}"
        )
    if last_completed_day is None:
        if any((current_streak_days, best_streak_days, freezes_available)) or freeze_month is not None:
            raise ValueError(
                "daily_games.streak_state must be empty when last_completed_day is null"
            )
    else:
        if current_streak_days == 0:
            raise ValueError(
                "daily_games.streak_state.current_streak_days must be positive "
                "when last_completed_day is set"
            )
        expected_freeze_month = date.fromisoformat(last_completed_day).replace(day=1).isoformat()
        if freeze_month != expected_freeze_month:
            raise ValueError(
                "daily_games.streak_state.freeze_month must be the first day of "
                "last_completed_day's month"
            )

    return (
        last_completed_day,
        current_streak_days,
        best_streak_days,
        freezes_available,
        freeze_month,
    )


def _rebuild_daily_game_miss_signals(conn: sqlite3.Connection) -> None:
    """Replay all persisted outcomes chronologically into current miss signals."""
    conn.execute("DELETE FROM daily_game_miss_signals")
    rows = conn.execute(
        """
        SELECT attempt.pool_day, word.deck_name, word.card_id, outcome.outcome
        FROM daily_game_attempts AS attempt
        JOIN daily_game_attempt_word_outcomes AS outcome
          ON outcome.attempt_id = attempt.id
        JOIN daily_word_pool_words AS word
          ON word.pool_day = attempt.pool_day
         AND word.pool_position = outcome.pool_position
        ORDER BY attempt.completed_at_utc ASC, attempt.id ASC, outcome.pool_position ASC
        """
    ).fetchall()
    for row in rows:
        signal_key = (str(row["deck_name"]), int(row["card_id"]))
        if row["outcome"] == "incorrect":
            conn.execute(
                """
                INSERT INTO daily_game_miss_signals (deck_name, card_id, missed_on)
                VALUES (?, ?, ?)
                ON CONFLICT(deck_name, card_id) DO UPDATE SET missed_on = excluded.missed_on
                """,
                (*signal_key, str(row["pool_day"])),
            )
        else:
            conn.execute(
                """
                DELETE FROM daily_game_miss_signals
                WHERE deck_name = ? AND card_id = ?
                """,
                signal_key,
            )


def _saved_daily_pool_positions(
    conn: sqlite3.Connection,
    pool_day: str,
    dependent: str,
) -> set[int]:
    if conn.execute(
        "SELECT 1 FROM daily_word_pools WHERE pool_day = ?", (pool_day,)
    ).fetchone() is None:
        raise ValueError(f"daily_games {dependent} pool_day has no saved Daily Games pool")
    return {
        int(row["pool_position"])
        for row in conn.execute(
            "SELECT pool_position FROM daily_word_pool_words WHERE pool_day = ?",
            (pool_day,),
        ).fetchall()
    }


def _daily_attempt_outcomes(
    conn: sqlite3.Connection,
    attempt_id: int,
) -> tuple[tuple[int, str], ...]:
    return tuple(
        (int(row["pool_position"]), str(row["outcome"]))
        for row in conn.execute(
            """
            SELECT pool_position, outcome
            FROM daily_game_attempt_word_outcomes
            WHERE attempt_id = ?
            ORDER BY pool_position ASC
            """,
            (attempt_id,),
        ).fetchall()
    )


# ---------------------------------------------------------------------------
# CSV analytics exports
# ---------------------------------------------------------------------------

def export_review_history_csv() -> str:
    """Return all review events as a CSV string."""
    database.init_db()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, deck, card_id, quality, confidence_score, reviewed_on,"
            " reviewed_at_utc, session_id, tags_csv"
            " FROM review_events ORDER BY reviewed_at_utc"
        ).fetchall()
    fieldnames = ["id", "deck", "card_id", "quality", "confidence_score",
                  "reviewed_on", "reviewed_at_utc", "session_id", "tags_csv"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()


def export_accuracy_trends_csv() -> str:
    """Return per-day accuracy aggregate as a CSV string."""
    database.init_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT reviewed_on AS date,
                   COUNT(*) AS total_reviews,
                   SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct_count,
                   ROUND(100.0 * SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) / COUNT(*), 1)
                       AS accuracy_pct
            FROM review_events
            GROUP BY reviewed_on
            ORDER BY reviewed_on
            """
        ).fetchall()
    fieldnames = ["date", "total_reviews", "correct_count", "accuracy_pct"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()


def export_mastery_snapshot_csv() -> str:
    """Return current card mastery state as a CSV string.

    Mastered threshold: repetitions >= 3 and interval >= 21.
    """
    database.init_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT deck, card_id, interval, repetitions, ease_factor, next_review,
                   CASE WHEN repetitions >= 3 AND interval >= 21 THEN 1 ELSE 0 END AS is_mastered
            FROM review_states
            ORDER BY deck, card_id
            """
        ).fetchall()
    fieldnames = ["deck", "card_id", "interval", "repetitions",
                  "ease_factor", "next_review", "is_mastered"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()
