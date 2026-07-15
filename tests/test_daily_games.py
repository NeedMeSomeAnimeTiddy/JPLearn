"""Tests for deterministic Daily Games domain contracts."""

from datetime import date, timedelta

import pytest

from domain.daily_games import (
    DAILY_POOL_ALGORITHM_VERSION,
    DailyGameWordCandidate,
    DailyGamesStreakState,
    DailyWordPool,
    apply_daily_game_completion,
    daily_game_seed,
    daily_pool_fingerprint,
    select_daily_word_pool,
)


def _candidate(
    card_id: int,
    *,
    deck_slug: str = "vocab_n5",
    deck_name: str = "Vocabulary N5",
    character: str | None = None,
    romaji: str | None = None,
    meaning: str | None = None,
    persisted: bool = False,
    repetitions: int = 0,
    next_review: date | None = None,
    last_review: date | None = None,
) -> DailyGameWordCandidate:
    return DailyGameWordCandidate(
        deck_slug=deck_slug,
        deck_name=deck_name,
        card_id=card_id,
        character=character or f"word-{card_id}",
        romaji=romaji or f"reading-{card_id}",
        meaning=meaning or f"meaning-{card_id}",
        has_persisted_state=persisted,
        repetitions=repetitions,
        next_review=next_review,
        last_review=last_review,
    )


def _word_ids(pool: DailyWordPool) -> list[int]:
    return [word.card_id for word in pool.words]


def test_same_date_and_candidates_produce_identical_pool() -> None:
    today = date(2026, 7, 15)
    candidates = [_candidate(card_id) for card_id in range(30)]

    first = select_daily_word_pool(candidates, today)
    second = select_daily_word_pool(candidates, today)

    assert first == second
    assert len(first.words) == 20


def test_candidate_input_order_does_not_change_pool() -> None:
    today = date(2026, 7, 15)
    candidates = [_candidate(card_id) for card_id in range(30)]

    first = select_daily_word_pool(candidates, today)
    second = select_daily_word_pool(list(reversed(candidates)), today)

    assert first == second


def test_different_dates_change_seed_and_can_change_pool_order() -> None:
    candidates = [_candidate(card_id) for card_id in range(30)]
    first = select_daily_word_pool(candidates, date(2026, 7, 15))
    second = select_daily_word_pool(candidates, date(2026, 7, 16))

    assert daily_pool_fingerprint(first) != daily_pool_fingerprint(second)
    assert daily_game_seed(first, "match_pairs") != daily_game_seed(second, "match_pairs")
    assert _word_ids(first) != _word_ids(second)


def test_due_words_fill_the_pool_before_recent_or_new_words() -> None:
    today = date(2026, 7, 15)
    due = [
        _candidate(
            card_id,
            persisted=True,
            repetitions=1,
            next_review=today,
        )
        for card_id in range(25)
    ]
    recent = _candidate(
        100,
        persisted=True,
        repetitions=1,
        next_review=today + timedelta(days=4),
        last_review=today,
    )
    new = _candidate(101)

    pool = select_daily_word_pool([*due, recent, new], today)

    assert len(pool.words) == 20
    assert {word.source for word in pool.words} == {"due"}


def test_recent_words_fill_after_due_words_before_new_words() -> None:
    today = date(2026, 7, 15)
    due = _candidate(1, persisted=True, repetitions=1, next_review=today)
    recent = [
        _candidate(
            card_id,
            persisted=True,
            repetitions=1,
            next_review=today + timedelta(days=4),
            last_review=today - timedelta(days=card_id),
        )
        for card_id in range(2, 5)
    ]
    new = [_candidate(card_id) for card_id in range(5, 9)]

    pool = select_daily_word_pool([due, *recent, *new], today, limit=6)

    assert [word.source for word in pool.words] == ["due", "recent", "recent", "recent", "new", "new"]


def test_recent_window_includes_today_and_previous_six_days() -> None:
    today = date(2026, 7, 15)
    in_window = _candidate(
        1,
        persisted=True,
        repetitions=1,
        next_review=today + timedelta(days=1),
        last_review=today - timedelta(days=6),
    )
    out_of_window = _candidate(
        2,
        persisted=True,
        repetitions=1,
        next_review=today + timedelta(days=1),
        last_review=today - timedelta(days=7),
    )

    pool = select_daily_word_pool([in_window, out_of_window], today)

    assert [(word.card_id, word.source) for word in pool.words] == [(1, "recent")]


def test_fabricated_default_state_is_new_not_due() -> None:
    today = date(2026, 7, 15)
    candidate = _candidate(
        1,
        persisted=False,
        repetitions=0,
        next_review=today,
    )

    pool = select_daily_word_pool([candidate], today)

    assert [(word.card_id, word.source) for word in pool.words] == [(1, "new")]


def test_persisted_unreviewed_state_is_new_not_due() -> None:
    today = date(2026, 7, 15)
    candidate = _candidate(
        1,
        persisted=True,
        repetitions=0,
        next_review=today,
    )

    pool = select_daily_word_pool([candidate], today)

    assert [(word.card_id, word.source) for word in pool.words] == [(1, "new")]


def test_duplicate_display_words_keep_the_higher_priority_source() -> None:
    today = date(2026, 7, 15)
    due = _candidate(
        1,
        deck_slug="vocab_n5",
        persisted=True,
        repetitions=2,
        next_review=today,
        character="same",
        romaji="same",
        meaning="same",
    )
    duplicate_new = _candidate(
        2,
        deck_slug="vocab_n4",
        character="same",
        romaji="same",
        meaning="same",
    )

    pool = select_daily_word_pool([duplicate_new, due], today)

    assert [(word.card_id, word.source) for word in pool.words] == [(1, "due")]


def test_same_card_id_from_different_decks_remains_distinct() -> None:
    today = date(2026, 7, 15)
    first = _candidate(
        1,
        deck_slug="vocab_n5",
        deck_name="Vocabulary N5",
        character="first",
    )
    second = _candidate(
        1,
        deck_slug="vocab_n4",
        deck_name="Vocabulary N4",
        character="second",
    )

    pool = select_daily_word_pool([first, second], today)

    assert {(word.deck_slug, word.card_id) for word in pool.words} == {
        ("vocab_n5", 1),
        ("vocab_n4", 1),
    }


def test_unicode_equivalent_duplicate_words_are_collapsed() -> None:
    today = date(2026, 7, 15)
    composed = _candidate(1, character="e\u0301", romaji="reading", meaning="meaning")
    precomposed = _candidate(2, character="\u00e9", romaji="reading", meaning="meaning")

    pool = select_daily_word_pool([composed, precomposed], today)

    assert len(pool.words) == 1


@pytest.mark.parametrize(
    ("limit", "recent_window_days", "algorithm_version"),
    [(0, 7, 1), (20, 0, 1), (20, 7, 0)],
)
def test_invalid_pool_configuration_is_rejected(
    limit: int,
    recent_window_days: int,
    algorithm_version: int,
) -> None:
    with pytest.raises(ValueError):
        select_daily_word_pool(
            [],
            date(2026, 7, 15),
            limit=limit,
            recent_window_days=recent_window_days,
            algorithm_version=algorithm_version,
        )


def test_seed_is_stable_per_game_and_varies_by_game_type() -> None:
    pool = select_daily_word_pool([_candidate(1)], date(2026, 7, 15))

    assert daily_game_seed(pool, "Match_Pairs") == daily_game_seed(pool, "match_pairs")
    assert daily_game_seed(pool, "match_pairs") != daily_game_seed(pool, "word_search")
    assert pool.algorithm_version == DAILY_POOL_ALGORITHM_VERSION


def test_empty_game_type_is_rejected() -> None:
    pool = select_daily_word_pool([], date(2026, 7, 15))

    with pytest.raises(ValueError):
        daily_game_seed(pool, " ")


def test_first_completion_starts_streak_with_monthly_freezes() -> None:
    completed = apply_daily_game_completion(DailyGamesStreakState(), date(2026, 7, 15))

    assert completed.current_streak_days == 1
    assert completed.best_streak_days == 1
    assert completed.freezes_available == 3
    assert completed.freeze_month == date(2026, 7, 1)


def test_same_day_completion_does_not_increment_streak() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 15),
        current_streak_days=4,
        best_streak_days=6,
        freezes_available=2,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 7, 15))

    assert completed == state


def test_consecutive_completion_increments_streak() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 15),
        current_streak_days=4,
        best_streak_days=4,
        freezes_available=3,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 7, 16))

    assert completed.current_streak_days == 5
    assert completed.freezes_available == 3


def test_monthly_freezes_cover_a_gap_when_sufficient() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 15),
        current_streak_days=4,
        best_streak_days=4,
        freezes_available=3,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 7, 18))

    assert completed.current_streak_days == 5
    assert completed.freezes_available == 1


def test_insufficient_monthly_freezes_reset_streak_without_consuming_them() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 15),
        current_streak_days=4,
        best_streak_days=7,
        freezes_available=1,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 7, 18))

    assert completed.current_streak_days == 1
    assert completed.best_streak_days == 7
    assert completed.freezes_available == 1


def test_new_month_replaces_unused_freezes_with_monthly_allowance() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 31),
        current_streak_days=4,
        best_streak_days=4,
        freezes_available=1,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 8, 2))

    assert completed.current_streak_days == 5
    assert completed.freezes_available == 2
    assert completed.freeze_month == date(2026, 8, 1)


def test_cross_month_gap_consumes_each_months_own_freezes() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 30),
        current_streak_days=4,
        best_streak_days=4,
        freezes_available=1,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 8, 2))

    assert completed.current_streak_days == 5
    assert completed.freezes_available == 2
    assert completed.freeze_month == date(2026, 8, 1)


def test_new_month_freezes_cannot_cover_prior_month_when_exhausted() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 30),
        current_streak_days=4,
        best_streak_days=6,
        freezes_available=0,
        freeze_month=date(2026, 7, 1),
    )

    completed = apply_daily_game_completion(state, date(2026, 8, 2))

    assert completed.current_streak_days == 1
    assert completed.best_streak_days == 6
    assert completed.freezes_available == 3
    assert completed.freeze_month == date(2026, 8, 1)


def test_stale_completion_day_is_ignored() -> None:
    state = DailyGamesStreakState(
        last_completed_day=date(2026, 7, 15),
        current_streak_days=4,
        best_streak_days=6,
        freezes_available=2,
        freeze_month=date(2026, 7, 1),
    )

    assert apply_daily_game_completion(state, date(2026, 7, 14)) == state
