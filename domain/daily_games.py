"""Pure contracts for deterministic Daily Games selection and streaks."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from hashlib import sha256
from typing import Literal
from unicodedata import normalize


DAILY_POOL_ALGORITHM_VERSION = 1
"""Version included in deterministic pool and puzzle seeds."""

DEFAULT_DAILY_POOL_LIMIT = 20
"""Maximum number of words shared by the day's games."""

DEFAULT_RECENT_WINDOW_DAYS = 7
"""Number of calendar days, including today, eligible as recently reviewed."""

MAX_MONTHLY_FREEZES = 3
"""Maximum missed days a Daily Games streak may cover in one calendar month."""

DailyGameWordSource = Literal["due", "recent", "new"]


@dataclass(frozen=True)
class DailyGameWordCandidate:
    """Vocabulary and review metadata available to the Daily Games selector.

    ``has_persisted_state`` is deliberately explicit. The active data layer can
    fabricate default ``ReviewState`` instances for missing rows, and those
    defaults must not be treated as genuinely due cards.
    """

    deck_slug: str
    deck_name: str
    card_id: int
    character: str
    romaji: str
    meaning: str
    has_persisted_state: bool
    repetitions: int = 0
    next_review: date | None = None
    last_review: date | None = None

    def stable_key(self) -> str:
        """Return a stable unique identity for deterministic ordering."""
        return "|".join(
            (
                self.deck_slug,
                self.deck_name,
                str(self.card_id),
                _normalized_text(self.character),
                _normalized_text(self.romaji),
                _normalized_text(self.meaning),
            )
        )

    def duplicate_key(self) -> str:
        """Return the display identity used to collapse duplicate vocabulary."""
        return "|".join(
            (
                _normalized_text(self.character),
                _normalized_text(self.romaji),
                _normalized_text(self.meaning),
            )
        )


@dataclass(frozen=True)
class DailyGameWord:
    """A selected vocabulary word and the reason it entered the daily pool."""

    deck_slug: str
    deck_name: str
    card_id: int
    character: str
    romaji: str
    meaning: str
    source: DailyGameWordSource

    def stable_key(self) -> str:
        """Return the source card identity used by persisted daily snapshots."""
        return "|".join(
            (
                self.deck_slug,
                self.deck_name,
                str(self.card_id),
                _normalized_text(self.character),
                _normalized_text(self.romaji),
                _normalized_text(self.meaning),
            )
        )


@dataclass(frozen=True)
class DailyWordPool:
    """A deterministic collection of words shared by every daily game."""

    day: date
    algorithm_version: int
    words: tuple[DailyGameWord, ...]


@dataclass(frozen=True)
class DailyGamesStreakState:
    """Persistent state for a streak earned by completing daily games.

    A new calendar month starts with ``MAX_MONTHLY_FREEZES`` available. Unused
    freezes do not carry into the next month, and a freeze covers one missed
    local calendar day.
    """

    last_completed_day: date | None = None
    current_streak_days: int = 0
    best_streak_days: int = 0
    freezes_available: int = 0
    freeze_month: date | None = None


def select_daily_word_pool(
    candidates: list[DailyGameWordCandidate],
    reference_date: date,
    *,
    limit: int = DEFAULT_DAILY_POOL_LIMIT,
    recent_window_days: int = DEFAULT_RECENT_WINDOW_DAYS,
    algorithm_version: int = DAILY_POOL_ALGORITHM_VERSION,
) -> DailyWordPool:
    """Select a deterministic due, recent, then new vocabulary pool.

    A due word needs a real persisted state, at least one completed review, and
    a next-review date on or before ``reference_date``. Recent eligibility is
    the inclusive ``recent_window_days`` calendar-day range ending on that day.
    Duplicate display vocabulary is retained only once, favouring higher-priority
    sources before deterministic candidate ranking.
    """
    if limit <= 0:
        raise ValueError("limit must be positive")
    if recent_window_days <= 0:
        raise ValueError("recent_window_days must be positive")
    if algorithm_version <= 0:
        raise ValueError("algorithm_version must be positive")

    buckets: dict[DailyGameWordSource, list[DailyGameWordCandidate]] = {
        "due": [],
        "recent": [],
        "new": [],
    }
    for candidate in candidates:
        # Named apart from the bucket-ordering `source` below: that one is always
        # one of the three literals, while this one is None for a candidate that
        # belongs in no bucket at all.
        candidate_source = _source_for_candidate(candidate, reference_date, recent_window_days)
        if candidate_source is not None:
            buckets[candidate_source].append(candidate)

    selected: list[DailyGameWord] = []
    seen_duplicates: set[str] = set()
    bucket_order: tuple[DailyGameWordSource, ...] = ("due", "recent", "new")
    for source in bucket_order:
        ranked = sorted(
            buckets[source],
            key=lambda candidate: _selection_rank(
                candidate,
                reference_date,
                source,
                algorithm_version,
            ),
        )
        for candidate in ranked:
            duplicate_key = candidate.duplicate_key()
            if duplicate_key in seen_duplicates:
                continue
            seen_duplicates.add(duplicate_key)
            selected.append(_selected_word(candidate, source))
            if len(selected) == limit:
                return DailyWordPool(
                    day=reference_date,
                    algorithm_version=algorithm_version,
                    words=tuple(selected),
                )

    return DailyWordPool(
        day=reference_date,
        algorithm_version=algorithm_version,
        words=tuple(selected),
    )


def daily_pool_fingerprint(pool: DailyWordPool) -> str:
    """Return a stable fingerprint for seed derivation and later persistence."""
    parts = [str(pool.algorithm_version), pool.day.isoformat()]
    parts.extend(f"{word.source}:{word.stable_key()}" for word in pool.words)
    return sha256("\n".join(parts).encode("utf-8")).hexdigest()


def daily_game_seed(
    pool: DailyWordPool,
    game_type: str,
) -> int:
    """Return a stable integer seed for one game built from a daily pool."""
    normalized_game_type = game_type.strip().lower()
    if not normalized_game_type:
        raise ValueError("game_type must not be empty")
    material = f"{daily_pool_fingerprint(pool)}|{normalized_game_type}"
    return int.from_bytes(sha256(material.encode("utf-8")).digest()[:8], "big")


def apply_daily_game_completion(
    state: DailyGamesStreakState,
    completed_day: date,
) -> DailyGamesStreakState:
    """Return the next streak state after completing at least one daily game.

    The completion day is local time supplied by the caller. A regression is
    stale input and is ignored. On the first completion in a calendar month,
    the month's three freezes replace any unused prior-month freezes.
    """
    if state.last_completed_day is not None and completed_day < state.last_completed_day:
        return state

    freeze_month = _month_start(completed_day)
    freezes_available = (
        min(max(state.freezes_available, 0), MAX_MONTHLY_FREEZES)
        if state.freeze_month == freeze_month
        else MAX_MONTHLY_FREEZES
    )

    if state.last_completed_day is None:
        return DailyGamesStreakState(
            last_completed_day=completed_day,
            current_streak_days=1,
            best_streak_days=max(1, state.best_streak_days),
            freezes_available=freezes_available,
            freeze_month=freeze_month,
        )

    delta_days = (completed_day - state.last_completed_day).days
    if delta_days == 0:
        next_streak = state.current_streak_days
    elif delta_days == 1:
        next_streak = state.current_streak_days + 1
    else:
        missed_days_by_month = _count_missed_days_by_month(
            state.last_completed_day,
            completed_day,
        )
        monthly_allowances = {
            month: (
                min(max(state.freezes_available, 0), MAX_MONTHLY_FREEZES)
                if state.freeze_month == month
                else MAX_MONTHLY_FREEZES
            )
            for month, _missed_days in missed_days_by_month
        }
        if all(
            monthly_allowances[month] >= missed_days
            for month, missed_days in missed_days_by_month
        ):
            freezes_available -= next(
                (
                    missed_days
                    for month, missed_days in missed_days_by_month
                    if month == freeze_month
                ),
                0,
            )
            next_streak = state.current_streak_days + 1
        else:
            next_streak = 1

    return DailyGamesStreakState(
        last_completed_day=completed_day,
        current_streak_days=next_streak,
        best_streak_days=max(state.best_streak_days, next_streak),
        freezes_available=freezes_available,
        freeze_month=freeze_month,
    )


def _source_for_candidate(
    candidate: DailyGameWordCandidate,
    reference_date: date,
    recent_window_days: int,
) -> DailyGameWordSource | None:
    if (
        candidate.has_persisted_state
        and candidate.repetitions > 0
        and candidate.next_review is not None
        and candidate.next_review <= reference_date
    ):
        return "due"

    earliest_recent_day = reference_date - timedelta(days=recent_window_days - 1)
    if (
        candidate.has_persisted_state
        and candidate.last_review is not None
        and earliest_recent_day <= candidate.last_review <= reference_date
    ):
        return "recent"

    if not candidate.has_persisted_state or candidate.repetitions <= 0:
        return "new"

    return None


def _selection_rank(
    candidate: DailyGameWordCandidate,
    reference_date: date,
    source: DailyGameWordSource,
    algorithm_version: int,
) -> tuple[bytes, str]:
    key = candidate.stable_key()
    material = f"{algorithm_version}|{reference_date.isoformat()}|{source}|{key}"
    return sha256(material.encode("utf-8")).digest(), key


def _selected_word(
    candidate: DailyGameWordCandidate,
    source: DailyGameWordSource,
) -> DailyGameWord:
    return DailyGameWord(
        deck_slug=candidate.deck_slug,
        deck_name=candidate.deck_name,
        card_id=candidate.card_id,
        character=candidate.character,
        romaji=candidate.romaji,
        meaning=candidate.meaning,
        source=source,
    )


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _count_missed_days_by_month(
    last_completed_day: date,
    completed_day: date,
) -> tuple[tuple[date, int], ...]:
    """Return missed local days grouped by their own calendar month."""
    current_day = last_completed_day + timedelta(days=1)
    counts: list[tuple[date, int]] = []
    while current_day < completed_day:
        month = _month_start(current_day)
        next_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_end = min(next_month, completed_day)
        counts.append((month, (month_end - current_day).days))
        current_day = month_end
    return tuple(counts)


def _normalized_text(value: str) -> str:
    return normalize("NFC", value).strip().casefold()
