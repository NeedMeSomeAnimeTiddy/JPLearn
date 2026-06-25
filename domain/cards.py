"""Card and deck data models."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Card:
    id: int
    character: str
    romaji: str
    meaning: str
    tags: list[str] = field(default_factory=list)
    example_word: Optional[str] = None

    def __str__(self) -> str:
        return f"{self.character}  ({self.romaji})"


@dataclass
class Deck:
    name: str
    cards: list[Card] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.cards)
