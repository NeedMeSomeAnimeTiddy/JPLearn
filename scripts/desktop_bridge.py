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

from data.study_pipeline import (
    init_study_db,
    load_activity_summary,
    load_active_leech_card_ids,
    load_item_history,
    load_mistake_breakdown,
    load_review_states,
    load_streak_state,
    load_today_progress,
    reset_study_db,
)
from domain.distractors import rank_distractor_ids
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
class StudyStreak:
    current_days: int
    best_days: int


@dataclass(frozen=True)
class GameCard:
    id: int
    character: str
    romaji: str
    meaning: str
    tags: list[str]
    is_leech: bool
    meaning_distractor_ids: list[int]
    character_distractor_ids: list[int]


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
    prompt_lookup: dict[tuple[str, int], str] = {}
    streak = load_streak_state()
    activity_week = load_activity_summary(7)
    activity_month = load_activity_summary(30)
    mistakes = load_mistake_breakdown(limit=6)
    item_history = load_item_history(limit_items=8, events_per_item=8)

    for slug, factory in ALL_DECKS.items():
        deck = factory()
        card_ids = [card.id for card in deck.cards]
        states = load_review_states(deck.name, card_ids)
        due_today, completed_today = load_today_progress(deck.name, card_ids)
        for card in deck.cards:
            prompt_lookup[(deck.name, card.id)] = card.character
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
        "streak": asdict(
            StudyStreak(
                current_days=streak.current_streak_days,
                best_days=streak.best_streak_days,
            )
        ),
        "activity": {
            "week": asdict(activity_week),
            "month": asdict(activity_month),
        },
        "mistakes": [asdict(item) for item in mistakes],
        "item_history": [
            {
                **asdict(item),
                "prompt": prompt_lookup.get((item.deck, item.card_id), item.prompt or f"Card {item.card_id}"),
            }
            for item in item_history
        ],
    }


def build_deck_cards(slug: str) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    active_leech_ids = load_active_leech_card_ids(deck.name)
    cards = [
        GameCard(
            id=card.id,
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
            tags=card.tags,
            is_leech=card.id in active_leech_ids,
            meaning_distractor_ids=rank_distractor_ids(deck.cards, card, mode="meaning")[:8],
            character_distractor_ids=rank_distractor_ids(deck.cards, card, mode="character")[:8],
        )
        for card in deck.cards
    ]
    return {
        "slug": slug,
        "name": deck.name,
        "cards": [asdict(card) for card in cards],
    }


def reset_progress() -> dict[str, object]:
    reset_study_db()
    return {"ok": True}


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

    if command == "reset-db":
        print(json.dumps(reset_progress(), ensure_ascii=False))
        return 0

    print(json.dumps({"error": f"Unknown command: {command}"}))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
