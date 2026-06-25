"""Bridge script used by Electron to query JPLearn data.

This script is intentionally small and command-driven so the desktop shell can
request JSON payloads over a subprocess boundary.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.study_pipeline import init_study_db, load_review_states, load_today_progress
from domain.decks import ALL_DECKS


@dataclass(frozen=True)
class DeckSummary:
    slug: str
    name: str
    total: int
    mastered: int
    due_today: int
    completed_today: int


@dataclass(frozen=True)
class GameCard:
    id: int
    character: str
    romaji: str
    meaning: str


def _mastered_count(states: dict[int, object]) -> int:
    # Shared repository rule: mastered means repetitions >= 3 and interval >= 21.
    return sum(
        1
        for state in states.values()
        if getattr(state, "repetitions", 0) >= 3 and getattr(state, "interval", 0) >= 21
    )


def build_summary() -> dict[str, object]:
    init_study_db()
    decks: list[DeckSummary] = []

    for slug, factory in ALL_DECKS.items():
        deck = factory()
        card_ids = [card.id for card in deck.cards]
        states = load_review_states(deck.name, card_ids)
        due_today, completed_today = load_today_progress(deck.name, card_ids)
        decks.append(
            DeckSummary(
                slug=slug,
                name=deck.name,
                total=len(deck.cards),
                mastered=_mastered_count(states),
                due_today=due_today,
                completed_today=completed_today,
            )
        )

    return {
        "decks": [asdict(deck) for deck in decks],
    }


def build_deck_cards(slug: str) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    cards = [
        GameCard(
            id=card.id,
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
        )
        for card in deck.cards
    ]
    return {
        "slug": slug,
        "name": deck.name,
        "cards": [asdict(card) for card in cards],
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command"}))
        return 2

    command = sys.argv[1]

    if command == "summary":
        print(json.dumps(build_summary(), ensure_ascii=False))
        return 0

    if command == "deck-cards":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Missing deck slug"}))
            return 2
        slug = sys.argv[2]
        try:
            payload = build_deck_cards(slug)
        except ValueError as exc:
            print(json.dumps({"error": str(exc)}))
            return 2
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    print(json.dumps({"error": f"Unknown command: {command}"}))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
