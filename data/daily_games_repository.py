"""SQLite persistence for immutable Daily Games snapshots and results."""

from __future__ import annotations

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from data import database
from data.text_normalization import normalize_japanese_text, normalize_storage_text
from domain.daily_games import DailyGameWord, DailyGamesStreakState, DailyWordPool


DailyGameType = Literal["crossword", "word_search", "match_pairs", "typing_blitz"]
DailyGameMode = Literal["daily", "practice"]
DailyGameOutcomeValue = Literal["correct", "incorrect"]

_GAME_TYPES: frozenset[str] = frozenset(
    {"crossword", "word_search", "match_pairs", "typing_blitz"}
)
_GAME_MODES: frozenset[str] = frozenset({"daily", "practice"})
_OUTCOME_VALUES: frozenset[str] = frozenset({"correct", "incorrect"})
_WORD_SOURCES: frozenset[str] = frozenset({"due", "recent", "new"})
_MAX_CROSSWORD_CLUE_LENGTH = 500
_MISS_SIGNAL_RETENTION_DAYS = 7


@dataclass(frozen=True)
class DailyGameWordOutcome:
    """The result for one zero-based word position in a daily pool."""

    pool_position: int
    outcome: DailyGameOutcomeValue


@dataclass(frozen=True)
class DailyCrosswordClue:
    """One accepted crossword clue, fixed to a Daily Games pool word."""

    pool_position: int
    clue: str


@dataclass(frozen=True)
class DailyGameAttempt:
    """One recorded Daily Games attempt and its per-word outcomes."""

    pool_day: date
    game_type: DailyGameType
    mode: DailyGameMode
    score: int
    completed: bool
    duration_seconds: int | None
    completed_at_utc: datetime
    outcomes: tuple[DailyGameWordOutcome, ...]
    attempt_id: int | None = None


@dataclass(frozen=True)
class DailyGameAttemptSaveResult:
    """The persisted attempt and whether this call created it.

    Completed daily attempts are idempotent per pool day and game type. Practice
    attempts, and incomplete daily attempts, are always independently recorded.
    """

    attempt: DailyGameAttempt
    created: bool


@dataclass(frozen=True)
class PersistedReviewMetadata:
    """Review metadata for one genuinely persisted vocabulary card state."""

    card_id: int
    repetitions: int
    next_review: date
    latest_review_date: date | None


class DailyGamesRepository:
    """Persist Daily Games data in the active ``jplearn.db`` database only."""

    def __init__(self) -> None:
        database.init_db()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        with database._connect() as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            yield conn

    def load_word_pool(self, pool_day: date) -> DailyWordPool | None:
        """Return the immutable snapshot for ``pool_day``, if one exists."""
        _require_date(pool_day, "pool_day")
        with self._connect() as conn:
            header = conn.execute(
                """
                SELECT pool_day, algorithm_version
                FROM daily_word_pools
                WHERE pool_day = ?
                """,
                (pool_day.isoformat(),),
            ).fetchone()
            if header is None:
                return None
            rows = conn.execute(
                """
                SELECT deck_slug, deck_name, card_id, character, romaji, meaning, source
                FROM daily_word_pool_words
                WHERE pool_day = ?
                ORDER BY pool_position ASC
                """,
                (pool_day.isoformat(),),
            ).fetchall()
        return DailyWordPool(
            day=date.fromisoformat(header["pool_day"]),
            algorithm_version=int(header["algorithm_version"]),
            words=tuple(_word_from_row(row) for row in rows),
        )

    def save_word_pool(self, pool: DailyWordPool) -> DailyWordPool:
        """Store a pool once, returning the original snapshot for a repeated day.

        A pre-existing day is deliberately never updated, including its algorithm
        version and word ordering.
        """
        normalized_pool = _normalized_pool(pool)
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO daily_word_pools (pool_day, algorithm_version)
                VALUES (?, ?)
                ON CONFLICT(pool_day) DO NOTHING
                """,
                (normalized_pool.day.isoformat(), normalized_pool.algorithm_version),
            )
            if cursor.rowcount == 0:
                return self._load_word_pool_in_connection(conn, normalized_pool.day)
            conn.executemany(
                """
                INSERT INTO daily_word_pool_words (
                    pool_day, pool_position, deck_slug, deck_name, card_id,
                    character, romaji, meaning, source
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        normalized_pool.day.isoformat(),
                        position,
                        word.deck_slug,
                        word.deck_name,
                        word.card_id,
                        word.character,
                        word.romaji,
                        word.meaning,
                        word.source,
                    )
                    for position, word in enumerate(normalized_pool.words)
                ],
            )
        return normalized_pool

    def load_crossword_clues(self, pool_day: date) -> tuple[DailyCrosswordClue, ...]:
        """Return accepted crossword clues for a pool day in position order."""
        _require_date(pool_day, "pool_day")
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT pool_position, clue
                FROM daily_crossword_clues
                WHERE pool_day = ?
                ORDER BY pool_position ASC
                """,
                (pool_day.isoformat(),),
            ).fetchall()
        return tuple(
            DailyCrosswordClue(pool_position=int(row["pool_position"]), clue=row["clue"])
            for row in rows
        )

    def save_crossword_clues(
        self,
        pool_day: date,
        clues: tuple[DailyCrosswordClue, ...],
    ) -> tuple[DailyCrosswordClue, ...]:
        """Save accepted clues once; retain the first clue for every position.

        Clues must reference positions in an already persisted pool.  This keeps
        the cache isolated from SRS data and prevents orphaned cache entries.
        """
        _require_date(pool_day, "pool_day")
        normalized_clues = _normalized_crossword_clues(clues)
        with self._connect() as conn:
            positions = {
                int(row["pool_position"])
                for row in conn.execute(
                    "SELECT pool_position FROM daily_word_pool_words WHERE pool_day = ?",
                    (pool_day.isoformat(),),
                ).fetchall()
            }
            if not positions:
                raise ValueError("crossword clue pool_day has no saved Daily Games pool")
            invalid_positions = {
                clue.pool_position
                for clue in normalized_clues
                if clue.pool_position not in positions
            }
            if invalid_positions:
                raise ValueError("crossword clues reference words outside the saved pool")
            conn.executemany(
                """
                INSERT INTO daily_crossword_clues (pool_day, pool_position, clue)
                VALUES (?, ?, ?)
                ON CONFLICT(pool_day, pool_position) DO NOTHING
                """,
                [
                    (pool_day.isoformat(), clue.pool_position, clue.clue)
                    for clue in normalized_clues
                ],
            )
            rows = conn.execute(
                """
                SELECT pool_position, clue
                FROM daily_crossword_clues
                WHERE pool_day = ?
                ORDER BY pool_position ASC
                """,
                (pool_day.isoformat(),),
            ).fetchall()
        return tuple(
            DailyCrosswordClue(pool_position=int(row["pool_position"]), clue=row["clue"])
            for row in rows
        )

    def save_attempt(self, attempt: DailyGameAttempt) -> DailyGameAttempt:
        """Persist an attempt, returning an existing completed daily attempt if any."""
        return self.save_attempt_result(attempt).attempt

    def save_attempt_result(self, attempt: DailyGameAttempt) -> DailyGameAttemptSaveResult:
        """Persist an attempt, update its miss signals, and report whether it was created.

        A duplicate completed daily attempt returns the existing immutable attempt
        without reapplying the submitted outcomes or their miss signals.
        """
        normalized_attempt = _normalized_attempt(attempt)
        with self._connect() as conn:
            positions = {
                int(row["pool_position"])
                for row in conn.execute(
                    """
                    SELECT pool_position
                    FROM daily_word_pool_words
                    WHERE pool_day = ?
                    """,
                    (normalized_attempt.pool_day.isoformat(),),
                ).fetchall()
            }
            if not positions and conn.execute(
                "SELECT 1 FROM daily_word_pools WHERE pool_day = ?",
                (normalized_attempt.pool_day.isoformat(),),
            ).fetchone() is None:
                raise ValueError("attempt pool_day has no saved Daily Games pool")
            invalid_positions = {
                outcome.pool_position
                for outcome in normalized_attempt.outcomes
                if outcome.pool_position not in positions
            }
            if invalid_positions:
                raise ValueError("attempt outcomes reference words outside the saved pool")

            try:
                cursor = conn.execute(
                    """
                    INSERT INTO daily_game_attempts (
                        pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc,
                        completion_key
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        normalized_attempt.pool_day.isoformat(),
                        normalized_attempt.game_type,
                        normalized_attempt.mode,
                        normalized_attempt.score,
                        int(normalized_attempt.completed),
                        normalized_attempt.duration_seconds,
                        normalized_attempt.completed_at_utc.isoformat(),
                        _completion_key(normalized_attempt),
                    ),
                )
            except sqlite3.IntegrityError:
                existing = self._load_completed_daily_attempt_in_connection(
                    conn,
                    normalized_attempt.pool_day,
                    normalized_attempt.game_type,
                )
                if existing is None:
                    raise
                return DailyGameAttemptSaveResult(attempt=existing, created=False)
            attempt_id = cursor.lastrowid
            if attempt_id is None:
                raise RuntimeError("Daily Games attempt insert did not return an id")
            conn.executemany(
                """
                INSERT INTO daily_game_attempt_word_outcomes (attempt_id, pool_position, outcome)
                VALUES (?, ?, ?)
                """,
                [
                    (attempt_id, outcome.pool_position, outcome.outcome)
                    for outcome in normalized_attempt.outcomes
                ],
            )
            self._record_attempt_miss_signals_in_connection(conn, normalized_attempt)
        return DailyGameAttemptSaveResult(
            attempt=DailyGameAttempt(
                pool_day=normalized_attempt.pool_day,
                game_type=normalized_attempt.game_type,
                mode=normalized_attempt.mode,
                score=normalized_attempt.score,
                completed=normalized_attempt.completed,
                duration_seconds=normalized_attempt.duration_seconds,
                completed_at_utc=normalized_attempt.completed_at_utc,
                outcomes=normalized_attempt.outcomes,
                attempt_id=int(attempt_id),
            ),
            created=True,
        )

    def load_active_game_miss_card_ids(self, deck_name: str, today: date) -> set[int]:
        """Return card ids with a non-expired Daily Games miss for one deck.

        A signal remains active through the seventh day after its recorded miss.
        ``today`` is required so callers can inject their local calendar date.
        """
        normalized_deck_name = _required_text(deck_name, "deck_name")
        _require_date(today, "today")
        active_since = today - timedelta(days=_MISS_SIGNAL_RETENTION_DAYS)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT card_id
                FROM daily_game_miss_signals
                WHERE deck_name = ? AND missed_on >= ? AND missed_on <= ?
                """,
                (normalized_deck_name, active_since.isoformat(), today.isoformat()),
            ).fetchall()
        return {int(row["card_id"]) for row in rows}

    def load_attempt(self, attempt_id: int) -> DailyGameAttempt | None:
        """Return one attempt with ordered outcomes, if it exists."""
        _require_nonnegative_int(attempt_id, "attempt_id")
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc
                FROM daily_game_attempts
                WHERE id = ?
                """,
                (attempt_id,),
            ).fetchone()
            if row is None:
                return None
            return self._attempt_from_row(conn, row)

    def load_attempts(self, pool_day: date | None = None) -> list[DailyGameAttempt]:
        """Return attempts in insertion order, optionally for one pool day."""
        if pool_day is not None:
            _require_date(pool_day, "pool_day")
        with self._connect() as conn:
            if pool_day is None:
                rows = conn.execute(
                    """
                    SELECT id, pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc
                    FROM daily_game_attempts
                    ORDER BY id ASC
                    """
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc
                    FROM daily_game_attempts
                    WHERE pool_day = ?
                    ORDER BY id ASC
                    """,
                    (pool_day.isoformat(),),
                ).fetchall()
            return [self._attempt_from_row(conn, row) for row in rows]

    def load_persisted_review_metadata(
        self,
        deck_name: str,
        card_ids: list[int],
    ) -> dict[int, PersistedReviewMetadata]:
        """Return stored review metadata without fabricating missing card states.

        This is deliberately a read-only persistence boundary for Daily Games
        candidate construction. Selection priority remains in the domain layer.
        """
        if not isinstance(deck_name, str):
            raise ValueError("deck_name must be a string")
        normalized_deck_name = normalize_storage_text(deck_name)
        if not normalized_deck_name:
            raise ValueError("deck_name must not be empty")
        if not isinstance(card_ids, list):
            raise ValueError("card_ids must be a list")
        for card_id in card_ids:
            _require_nonnegative_int(card_id, "card_ids entries")
        if not card_ids:
            return {}

        metadata: dict[int, PersistedReviewMetadata] = {}
        with self._connect() as conn:
            for card_id_chunk in _iter_chunks(card_ids):
                placeholders = ",".join("?" * len(card_id_chunk))
                rows = conn.execute(
                    f"""
                    SELECT state.card_id, state.repetitions, state.next_review,
                           CASE
                               WHEN state.last_review IS NULL THEN MAX(event.reviewed_on)
                               WHEN MAX(event.reviewed_on) IS NULL THEN state.last_review
                               WHEN state.last_review >= MAX(event.reviewed_on) THEN state.last_review
                               ELSE MAX(event.reviewed_on)
                           END AS latest_review_date
                    FROM review_states AS state
                    LEFT JOIN review_events AS event
                      ON event.deck = state.deck AND event.card_id = state.card_id
                    WHERE state.deck = ? AND state.card_id IN ({placeholders})
                    GROUP BY state.card_id, state.repetitions, state.next_review, state.last_review
                    """,
                    [normalized_deck_name, *card_id_chunk],
                ).fetchall()
                for row in rows:
                    metadata[int(row["card_id"])] = PersistedReviewMetadata(
                        card_id=int(row["card_id"]),
                        repetitions=int(row["repetitions"]),
                        next_review=date.fromisoformat(row["next_review"]),
                        latest_review_date=(
                            date.fromisoformat(row["latest_review_date"])
                            if row["latest_review_date"]
                            else None
                        ),
                    )
        return metadata

    def load_streak_state(self) -> DailyGamesStreakState:
        """Return the Daily Games streak singleton, or an unpersisted default."""
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT last_completed_day, current_streak_days, best_streak_days,
                       freezes_available, freeze_month
                FROM daily_games_streak_state
                WHERE id = 1
                """
            ).fetchone()
        if row is None:
            return DailyGamesStreakState()
        return DailyGamesStreakState(
            last_completed_day=(
                date.fromisoformat(row["last_completed_day"])
                if row["last_completed_day"]
                else None
            ),
            current_streak_days=int(row["current_streak_days"]),
            best_streak_days=int(row["best_streak_days"]),
            freezes_available=int(row["freezes_available"]),
            freeze_month=date.fromisoformat(row["freeze_month"]) if row["freeze_month"] else None,
        )

    def save_streak_state(self, state: DailyGamesStreakState) -> None:
        """Insert or replace the separate Daily Games streak singleton."""
        _validate_streak_state(state)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO daily_games_streak_state (
                    id, last_completed_day, current_streak_days, best_streak_days,
                    freezes_available, freeze_month
                )
                VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    last_completed_day = excluded.last_completed_day,
                    current_streak_days = excluded.current_streak_days,
                    best_streak_days = excluded.best_streak_days,
                    freezes_available = excluded.freezes_available,
                    freeze_month = excluded.freeze_month
                """,
                (
                    state.last_completed_day.isoformat() if state.last_completed_day else None,
                    state.current_streak_days,
                    state.best_streak_days,
                    state.freezes_available,
                    state.freeze_month.isoformat() if state.freeze_month else None,
                ),
            )

    def _load_word_pool_in_connection(
        self,
        conn: sqlite3.Connection,
        pool_day: date,
    ) -> DailyWordPool:
        header = conn.execute(
            """
            SELECT pool_day, algorithm_version
            FROM daily_word_pools
            WHERE pool_day = ?
            """,
            (pool_day.isoformat(),),
        ).fetchone()
        if header is None:
            raise RuntimeError("Daily Games pool disappeared during save")
        rows = conn.execute(
            """
            SELECT deck_slug, deck_name, card_id, character, romaji, meaning, source
            FROM daily_word_pool_words
            WHERE pool_day = ?
            ORDER BY pool_position ASC
            """,
            (pool_day.isoformat(),),
        ).fetchall()
        return DailyWordPool(
            day=date.fromisoformat(header["pool_day"]),
            algorithm_version=int(header["algorithm_version"]),
            words=tuple(_word_from_row(row) for row in rows),
        )

    def _record_attempt_miss_signals_in_connection(
        self,
        conn: sqlite3.Connection,
        attempt: DailyGameAttempt,
    ) -> None:
        """Map persisted pool outcomes to isolated miss-priority records."""
        words_by_position = {
            int(row["pool_position"]): (row["deck_name"], int(row["card_id"]))
            for row in conn.execute(
                """
                SELECT pool_position, deck_name, card_id
                FROM daily_word_pool_words
                WHERE pool_day = ?
                """,
                (attempt.pool_day.isoformat(),),
            ).fetchall()
        }
        missed_on = attempt.pool_day.isoformat()
        for outcome in attempt.outcomes:
            deck_name, card_id = words_by_position[outcome.pool_position]
            if outcome.outcome == "incorrect":
                conn.execute(
                    """
                    INSERT INTO daily_game_miss_signals (deck_name, card_id, missed_on)
                    VALUES (?, ?, ?)
                    ON CONFLICT(deck_name, card_id) DO UPDATE SET
                        missed_on = excluded.missed_on
                    """,
                    (deck_name, card_id, missed_on),
                )
            else:
                conn.execute(
                    """
                    DELETE FROM daily_game_miss_signals
                    WHERE deck_name = ? AND card_id = ?
                    """,
                    (deck_name, card_id),
                )

    def _load_completed_daily_attempt_in_connection(
        self,
        conn: sqlite3.Connection,
        pool_day: date,
        game_type: DailyGameType,
    ) -> DailyGameAttempt | None:
        row = conn.execute(
            """
            SELECT id, pool_day, game_type, mode, score, completed, duration_seconds, completed_at_utc
            FROM daily_game_attempts
            WHERE pool_day = ? AND game_type = ? AND mode = 'daily' AND completed = 1
            ORDER BY id ASC
            LIMIT 1
            """,
            (pool_day.isoformat(), game_type),
        ).fetchone()
        return self._attempt_from_row(conn, row) if row is not None else None

    def _attempt_from_row(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> DailyGameAttempt:
        outcome_rows = conn.execute(
            """
            SELECT pool_position, outcome
            FROM daily_game_attempt_word_outcomes
            WHERE attempt_id = ?
            ORDER BY pool_position ASC
            """,
            (row["id"],),
        ).fetchall()
        return DailyGameAttempt(
            attempt_id=int(row["id"]),
            pool_day=date.fromisoformat(row["pool_day"]),
            game_type=row["game_type"],
            mode=row["mode"],
            score=int(row["score"]),
            completed=bool(row["completed"]),
            duration_seconds=(
                None if row["duration_seconds"] is None else int(row["duration_seconds"])
            ),
            completed_at_utc=datetime.fromisoformat(row["completed_at_utc"]),
            outcomes=tuple(
                DailyGameWordOutcome(
                    pool_position=int(outcome_row["pool_position"]),
                    outcome=outcome_row["outcome"],
                )
                for outcome_row in outcome_rows
            ),
        )


def _word_from_row(row: sqlite3.Row) -> DailyGameWord:
    """Map a stored pool-word row to the Phase 1 domain record."""
    return DailyGameWord(
        deck_slug=row["deck_slug"],
        deck_name=row["deck_name"],
        card_id=int(row["card_id"]),
        character=row["character"],
        romaji=row["romaji"],
        meaning=row["meaning"],
        source=row["source"],
    )


def _normalized_pool(pool: DailyWordPool) -> DailyWordPool:
    if not isinstance(pool, DailyWordPool):
        raise ValueError("pool must be a DailyWordPool")
    _require_date(pool.day, "pool.day")
    _require_positive_int(pool.algorithm_version, "pool.algorithm_version")
    return DailyWordPool(
        day=pool.day,
        algorithm_version=pool.algorithm_version,
        words=tuple(_normalized_word(word) for word in pool.words),
    )


def _normalized_word(word: DailyGameWord) -> DailyGameWord:
    if not isinstance(word, DailyGameWord):
        raise ValueError("pool.words must contain DailyGameWord records")
    _require_nonnegative_int(word.card_id, "word.card_id")
    if word.source not in _WORD_SOURCES:
        raise ValueError("word.source must be one of: due, recent, new")
    return DailyGameWord(
        deck_slug=_required_text(word.deck_slug, "word.deck_slug"),
        deck_name=_required_text(word.deck_name, "word.deck_name"),
        card_id=word.card_id,
        character=_required_text(word.character, "word.character", japanese=True),
        romaji=_required_text(word.romaji, "word.romaji"),
        meaning=_required_text(word.meaning, "word.meaning"),
        source=word.source,
    )


def _normalized_attempt(attempt: DailyGameAttempt) -> DailyGameAttempt:
    if not isinstance(attempt, DailyGameAttempt):
        raise ValueError("attempt must be a DailyGameAttempt")
    _require_date(attempt.pool_day, "attempt.pool_day")
    if attempt.attempt_id is not None:
        raise ValueError("attempt.attempt_id must be None when saving a new attempt")
    if attempt.game_type not in _GAME_TYPES:
        raise ValueError("attempt.game_type is not a supported Daily Games type")
    if attempt.mode not in _GAME_MODES:
        raise ValueError("attempt.mode must be daily or practice")
    _require_nonnegative_int(attempt.score, "attempt.score")
    if not isinstance(attempt.completed, bool):
        raise ValueError("attempt.completed must be a boolean")
    if attempt.duration_seconds is not None:
        _require_nonnegative_int(attempt.duration_seconds, "attempt.duration_seconds")
    if not isinstance(attempt.completed_at_utc, datetime):
        raise ValueError("attempt.completed_at_utc must be a datetime")
    if attempt.completed_at_utc.utcoffset() != timedelta(0):
        raise ValueError("attempt.completed_at_utc must use UTC")
    if not attempt.outcomes:
        raise ValueError("attempt.outcomes must not be empty")
    normalized_outcomes = tuple(_normalized_outcome(outcome) for outcome in attempt.outcomes)
    if len({outcome.pool_position for outcome in normalized_outcomes}) != len(normalized_outcomes):
        raise ValueError("attempt outcomes must not repeat a pool position")
    return DailyGameAttempt(
        pool_day=attempt.pool_day,
        game_type=attempt.game_type,
        mode=attempt.mode,
        score=attempt.score,
        completed=attempt.completed,
        duration_seconds=attempt.duration_seconds,
        completed_at_utc=attempt.completed_at_utc,
        outcomes=normalized_outcomes,
    )


def _normalized_outcome(outcome: DailyGameWordOutcome) -> DailyGameWordOutcome:
    if not isinstance(outcome, DailyGameWordOutcome):
        raise ValueError("attempt.outcomes must contain DailyGameWordOutcome records")
    _require_nonnegative_int(outcome.pool_position, "outcome.pool_position")
    if outcome.outcome not in _OUTCOME_VALUES:
        raise ValueError("outcome.outcome must be correct or incorrect")
    return outcome


def _normalized_crossword_clues(
    clues: tuple[DailyCrosswordClue, ...],
) -> tuple[DailyCrosswordClue, ...]:
    if not isinstance(clues, tuple) or not clues:
        raise ValueError("clues must be a non-empty tuple")
    normalized_clues: list[DailyCrosswordClue] = []
    positions: set[int] = set()
    for clue in clues:
        if not isinstance(clue, DailyCrosswordClue):
            raise ValueError("clues must contain DailyCrosswordClue records")
        _require_nonnegative_int(clue.pool_position, "clue.pool_position")
        if clue.pool_position in positions:
            raise ValueError("clues must not repeat a pool position")
        normalized_text = _required_crossword_clue_text(clue.clue)
        if len(normalized_text) > _MAX_CROSSWORD_CLUE_LENGTH:
            raise ValueError(f"clue.clue must be at most {_MAX_CROSSWORD_CLUE_LENGTH} characters")
        positions.add(clue.pool_position)
        normalized_clues.append(
            DailyCrosswordClue(pool_position=clue.pool_position, clue=normalized_text)
        )
    return tuple(normalized_clues)


def _completion_key(attempt: DailyGameAttempt) -> str | None:
    """Return the persisted uniqueness key for a completed daily attempt only."""
    if attempt.mode == "daily" and attempt.completed:
        return f"daily:{attempt.pool_day.isoformat()}:{attempt.game_type}"
    return None


def _validate_streak_state(state: DailyGamesStreakState) -> None:
    if not isinstance(state, DailyGamesStreakState):
        raise ValueError("state must be a DailyGamesStreakState")
    if state.last_completed_day is not None:
        _require_date(state.last_completed_day, "state.last_completed_day")
    if state.freeze_month is not None:
        _require_date(state.freeze_month, "state.freeze_month")
    _require_nonnegative_int(state.current_streak_days, "state.current_streak_days")
    _require_nonnegative_int(state.best_streak_days, "state.best_streak_days")
    _require_nonnegative_int(state.freezes_available, "state.freezes_available")


def _required_text(value: object, field: str, *, japanese: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    normalized = normalize_japanese_text(value) if japanese else normalize_storage_text(value)
    if not normalized:
        raise ValueError(f"{field} must not be empty")
    return normalized


def _required_crossword_clue_text(value: object) -> str:
    """Normalize clue text, applying Japanese punctuation folding when needed."""
    if not isinstance(value, str):
        raise ValueError("clue.clue must be a string")
    has_japanese_script = any(
        "\u3040" <= character <= "\u30ff" or "\u3400" <= character <= "\u9fff"
        for character in value
    )
    normalized = (
        normalize_japanese_text(value) if has_japanese_script else normalize_storage_text(value)
    )
    if not normalized:
        raise ValueError("clue.clue must not be empty")
    return normalized


def _require_date(value: object, field: str) -> None:
    if not isinstance(value, date) or isinstance(value, datetime):
        raise ValueError(f"{field} must be a date")


def _require_positive_int(value: object, field: str) -> None:
    _require_nonnegative_int(value, field)
    if value == 0:
        raise ValueError(f"{field} must be positive")


def _require_nonnegative_int(value: object, field: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")


def _iter_chunks(values: list[int], size: int = 900) -> list[list[int]]:
    """Split SQLite IN-clause inputs without exposing persistence details."""
    return [values[index : index + size] for index in range(0, len(values), size)]
