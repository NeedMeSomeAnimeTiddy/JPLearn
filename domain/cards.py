"""Card and deck data models."""

from dataclasses import dataclass, field


@dataclass
class Card:
    """A single reviewable flash card.

    Attributes:
        id: Unique integer identifier within its deck.
        character: The Japanese character or string shown on the front.
        romaji: Romanised reading of the character.
        meaning: English meaning or gloss.
        tags: Arbitrary labels (e.g. ``"hiragana"``, ``"n5"``).
        example_word: Optional example word using this character.
        example_sentence: Optional example sentence showing the card in context.
    """

    id: int
    character: str
    romaji: str
    meaning: str
    tags: list[str] = field(default_factory=list)
    example_word: str | None = None
    example_sentence: str | None = None

    def __str__(self) -> str:
        return f"{self.character}  ({self.romaji})"


@dataclass
class Deck:
    """An ordered collection of :class:`Card` objects.

    Attributes:
        name: Human-readable deck name (e.g. ``"Hiragana"``).
        cards: Ordered list of cards belonging to this deck.
    """

    name: str
    cards: list[Card] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.cards)
