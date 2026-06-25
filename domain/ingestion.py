from __future__ import annotations

from dataclasses import dataclass
from typing import List


# -----------------------------
# Domain entity (NOT script DTO)
# -----------------------------
@dataclass(frozen=True)
class LearningItem:
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
    return [ingest_card(c) for c in cards]