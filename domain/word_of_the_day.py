"""Deterministic daily word selection for the Word of the Day widget."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from domain.cards import Card
from domain.scheduler import ReviewState


@dataclass(frozen=True)
class WordOfDay:
    """A single word selected for the Word of the Day display.

    Attributes:
        character: The Japanese word.
        romaji: Romanised reading.
        meaning: English meaning.
        deck_name: Source deck (e.g. ``"vocab_n5"``).
        reason: Why this word was selected
            (``"due_for_review"`` | ``"weakest"`` | ``"new_item"`` | ``"discovery"``).
        example_sentence: Optional example sentence.
    """

    character: str
    romaji: str
    meaning: str
    deck_name: str
    reason: str
    example_sentence: str | None = None


def select_word_of_the_day(
    cards: list[Card],
    states: dict[int, ReviewState],
    deck_name: str,
    reference_date: date,
) -> WordOfDay | None:
    """Pick a deterministic Word of the Day from the given cards.

    Priority:
    1. Cards due for review today (weakest ``ease_factor`` first).
    2. Never-reviewed cards (``stability <= 0``), deterministic order by id.
    3. Discovery — mastered cards, deterministic by day-of-year modulo.

    All selection is deterministic — no randomness per domain purity rules.
    ``reference_date`` seeds the "random" step via day-of-year modulo.
    """
    if not cards:
        return None

    # Build a map for fast lookup
    due: list[tuple[float, Card]] = []
    new_items: list[Card] = []
    mastered: list[Card] = []

    for card in cards:
        state = states.get(card.id)
        if state is None:
            new_items.append(card)
        elif reference_date >= state.next_review:
            due.append((state.ease_factor, card))
        elif state.repetitions >= 3 and state.interval >= 21:
            mastered.append(card)
        elif state.stability <= 0.0:
            new_items.append(card)

    # Tier 1: due cards, weakest ease_factor first
    if due:
        due.sort(key=lambda pair: pair[0])  # ascending ease_factor
        card = due[0][1]
        return WordOfDay(
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
            deck_name=deck_name,
            reason="due_for_review",
            example_sentence=card.example_sentence,
        )

    # Tier 2: new cards, deterministic by id
    if new_items:
        new_items.sort(key=lambda c: c.id)
        card = new_items[0]
        return WordOfDay(
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
            deck_name=deck_name,
            reason="new_item",
            example_sentence=card.example_sentence,
        )

    # Tier 3: discovery from mastered, deterministic by day-of-year
    if mastered:
        mastered.sort(key=lambda c: c.id)
        index = reference_date.timetuple().tm_yday % len(mastered)
        card = mastered[index]
        return WordOfDay(
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
            deck_name=deck_name,
            reason="discovery",
            example_sentence=card.example_sentence,
        )

    return None
