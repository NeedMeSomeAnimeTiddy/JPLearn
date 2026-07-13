"""Tests for domain/word_of_the_day.py."""

from datetime import date, timedelta

from domain.cards import Card
from domain.scheduler import ReviewState
from domain.word_of_the_day import WordOfDay, select_word_of_the_day


def _card(cid: int, character: str = "日本語", romaji: str = "nihongo", meaning: str = "Japanese") -> Card:
    return Card(id=cid, character=character, romaji=romaji, meaning=meaning)


def _state(
    cid: int,
    *,
    ease_factor: float = 2.5,
    interval: int = 1,
    repetitions: int = 0,
    stability: float = 0.0,
    next_review: date | None = None,
) -> ReviewState:
    return ReviewState(
        card_id=cid,
        ease_factor=ease_factor,
        interval=interval,
        repetitions=repetitions,
        stability=stability,
        next_review=next_review or date.today(),
    )


# ── Empty / edge cases ─────────────────────────────────────────────────


def test_empty_cards_returns_none() -> None:
    assert select_word_of_the_day([], {}, "vocab_n5", date(2026, 1, 1)) is None


def test_all_mastered_with_no_due_returns_deterministic() -> None:
    today = date(2026, 6, 1)
    cards = [_card(1, "山", "yama", "mountain"), _card(2, "川", "kawa", "river")]
    states = {
        1: _state(1, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5)),
        2: _state(2, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5)),
    }
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.reason == "discovery"
    assert result.character in ("山", "川")


def test_deterministic_same_date_same_word() -> None:
    today = date(2026, 6, 1)
    cards = [_card(i, str(i), str(i), str(i)) for i in range(10)]
    result1 = select_word_of_the_day(cards, {}, "test", today)
    result2 = select_word_of_the_day(cards, {}, "test", today)
    assert result1 is not None and result2 is not None
    assert result1.character == result2.character


def test_different_date_different_discovery() -> None:
    today = date(2026, 6, 1)
    cards = [_card(i, str(i), str(i), str(i)) for i in range(10)]
    states = {i: _state(i, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5)) for i in range(10)}
    r1 = select_word_of_the_day(cards, states, "test", date(2026, 6, 1))
    r2 = select_word_of_the_day(cards, states, "test", date(2026, 6, 2))
    assert r1 is not None and r2 is not None
    assert r1.reason == "discovery"
    # yday 152 % 10 = 2, yday 153 % 10 = 3
    assert r1.character != r2.character


# ── Priority tiers ─────────────────────────────────────────────────────


def test_due_card_wins_over_new() -> None:
    today = date(2026, 6, 15)
    cards = [_card(1, "古い", "furui", "old"), _card(2, "新しい", "atarashii", "new")]
    states = {
        1: _state(1, ease_factor=1.5, interval=1, repetitions=2, stability=2.0, next_review=today - timedelta(days=1)),
    }
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.reason == "due_for_review"
    assert result.character == "古い"


def test_due_card_weakest_ease_factor_wins() -> None:
    today = date(2026, 6, 15)
    cards = [
        _card(1, "弱い", "yowai", "weak"),
        _card(2, "強い", "tsuyoi", "strong"),
        _card(3, "普通", "futsuu", "normal"),
    ]
    states = {
        1: _state(1, ease_factor=1.3, interval=1, repetitions=1, stability=1.0, next_review=today - timedelta(days=1)),
        2: _state(2, ease_factor=2.5, interval=1, repetitions=1, stability=1.0, next_review=today - timedelta(days=1)),
        3: _state(3, ease_factor=2.8, interval=1, repetitions=1, stability=1.5, next_review=today - timedelta(days=1)),
    }
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.character == "弱い"  # weakest ease_factor (1.3)


def test_new_card_when_no_due() -> None:
    today = date(2026, 6, 15)
    cards = [_card(1, "本", "hon", "book"), _card(2, "ペン", "pen", "pen")]
    states = {1: _state(1, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5))}
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.reason == "new_item"
    assert result.character == "ペン"  # card 2 has no state


def test_new_card_deterministic_order() -> None:
    today = date(2026, 6, 15)
    cards = [_card(5, "五", "go", "five"), _card(3, "三", "san", "three")]
    result = select_word_of_the_day(cards, {}, "vocab_n5", today)
    assert result is not None
    assert result.reason == "new_item"
    assert result.character == "三"  # card id 3 < 5


def test_only_mastered_discovery() -> None:
    today = date(2026, 6, 15)
    cards = [_card(1, "山", "yama", "mountain")]
    states = {
        1: _state(1, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5)),
    }
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.reason == "discovery"


def test_example_sentence_included() -> None:
    today = date(2026, 6, 15)
    cards = [Card(id=1, character="猫", romaji="neko", meaning="cat", example_sentence="猫が好きです")]
    states = {
        1: _state(1, ease_factor=2.5, interval=30, repetitions=10, stability=42.0, next_review=today + timedelta(days=5)),
    }
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is not None
    assert result.example_sentence == "猫が好きです"


def test_deck_name_passed_through() -> None:
    today = date(2026, 6, 15)
    cards = [_card(1, "犬", "inu", "dog")]
    result = select_word_of_the_day(cards, {}, "vocab_n5", today)
    assert result is not None
    assert result.deck_name == "vocab_n5"


def test_no_valid_cards_returns_none() -> None:
    today = date(2026, 6, 15)
    # Card with state that is neither due, nor new, nor mastered
    cards = [_card(1, "test", "test", "test")]
    states = {1: _state(1, ease_factor=2.5, interval=5, repetitions=1, stability=3.0, next_review=today + timedelta(days=2))}
    result = select_word_of_the_day(cards, states, "vocab_n5", today)
    assert result is None
