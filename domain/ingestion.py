"""Domain ingestion: convert raw script DTOs into domain entities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


# -----------------------------
# Domain entity (NOT script DTO)
# -----------------------------
@dataclass(frozen=True)
class LearningItem:
    """Immutable domain representation of one reviewable item.

    Attributes:
        front: The prompt shown to the learner (e.g. a kana character).
        back: The expected answer (e.g. romaji reading).
        tags: Immutable tuple of classification labels.
    """

    front: str
    back: str
    tags: tuple[str, ...]


def ingest_card(card: dict) -> LearningItem:
    """
    Converts script-level Card DTO → domain entity.

    This is the ONLY bridge between scripts and domain.
    """

    return LearningItem(
        front=card["front"],
        back=card["back"],
        tags=tuple(card.get("tags", [])),
    )


def ingest_batch(cards: list[dict]) -> list[LearningItem]:
    """Convert a list of raw card dicts into :class:`LearningItem` instances."""
    return [ingest_card(c) for c in cards]