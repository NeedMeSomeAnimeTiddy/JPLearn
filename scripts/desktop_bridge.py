"""Bridge script used by Electron to query JPLearn data.

This script is intentionally small and command-driven so the desktop shell can
request JSON payloads over a subprocess boundary.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping

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
    load_curriculum_stage_summary,
    load_narrative_chapter_summary,
    load_item_history,
    load_mistake_breakdown,
    load_curriculum_stages,
    load_review_states,
    load_streak_state,
    load_today_progress,
    reset_study_db,
    review_minigame_result,
)
from domain.blocks import (
    blocks_for_slug,
    compute_block_mastery,
    compute_unlocked_count,
)
from domain.distractors import rank_distractor_ids
from domain.decks import ALL_DECKS

SUMMARY_SCRIPT_TAGS = (
    "hiragana",
    "katakana",
    "kanji_n5",
    "vocab_n5",
    "grammar_patterns",
)


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
    curriculum_stage: int
    meaning_distractor_ids: list[int]
    character_distractor_ids: list[int]


def _mastered_count(states: Mapping[int, object]) -> int:
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
    curriculum_context_cloze = load_curriculum_stage_summary("context_cloze")
    curriculum_by_script = {
        script_tag: load_curriculum_stage_summary("context_cloze", script_tag=script_tag)
        for script_tag in SUMMARY_SCRIPT_TAGS
    }
    narrative_story = load_narrative_chapter_summary()
    narrative_story_by_script = {
        script_tag: load_narrative_chapter_summary(script_tag=script_tag)
        for script_tag in SUMMARY_SCRIPT_TAGS
    }

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
        "curriculum": {
            "context_cloze": curriculum_context_cloze,
            "context_cloze_by_script": curriculum_by_script,
            "narrative_story": narrative_story,
            "narrative_story_by_script": narrative_story_by_script,
        },
    }


def build_deck_cards(slug: str) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    active_leech_ids = load_active_leech_card_ids(deck.name)
    curriculum_stages = load_curriculum_stages(deck.name, "context_cloze", [card.id for card in deck.cards])
    cards = [
        GameCard(
            id=card.id,
            character=card.character,
            romaji=card.romaji,
            meaning=card.meaning,
            tags=card.tags,
            is_leech=card.id in active_leech_ids,
            curriculum_stage=curriculum_stages.get(card.id, 1),
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


def build_block_progress(slug: str) -> dict[str, object]:
    """Return block definitions with unlock status and per-block mastery."""
    init_study_db()
    blocks = blocks_for_slug(slug)
    if not blocks:
        return {"slug": slug, "blocks": []}

    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    card_ids = [card.id for card in deck.cards]
    states = load_review_states(deck.name, card_ids)
    repetitions_map: dict[int, int] = {
        cid: getattr(states.get(cid), "repetitions", 0) for cid in card_ids
    }

    unlocked_count = compute_unlocked_count(blocks, repetitions_map)
    char_map: dict[int, str] = {card.id: card.character for card in deck.cards}
    meaning_map: dict[int, str] = {card.id: card.meaning for card in deck.cards}
    romaji_map: dict[int, str] = {card.id: card.romaji for card in deck.cards}

    result = []
    for block in blocks:
        mastery = compute_block_mastery(block, repetitions_map)
        result.append(
            {
                "index": block.index,
                "name": block.name,
                "card_ids": block.card_ids,
                "sample_chars": block.sample_chars,
                "characters": [char_map[cid] for cid in block.card_ids if cid in char_map],
                "meanings": [meaning_map[cid] for cid in block.card_ids if cid in meaning_map],
                "romajis": [romaji_map[cid] for cid in block.card_ids if cid in romaji_map],
                "mastery": round(mastery, 3),
                "unlocked": block.index < unlocked_count,
            }
        )

    return {"slug": slug, "blocks": result}


def reset_progress() -> dict[str, object]:
    reset_study_db()
    return {"ok": True}


def _parse_bool_flag(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    raise ValueError(f"Invalid boolean flag: {value}")


def record_game_result(
    slug: str,
    card_id: int,
    is_correct: bool,
    minigame: str = "",
    curriculum_stage: int | None = None,
) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    if not any(card.id == card_id for card in deck.cards):
        raise ValueError(f"Unknown card id {card_id} for deck slug: {slug}")

    normalized_minigame = minigame.strip().lower()
    stage_mode = "context_cloze" if normalized_minigame == "narrative_story" else normalized_minigame
    normalized_stage = None if curriculum_stage is None else max(1, min(3, curriculum_stage))
    tags = [tag for tag in ["minigame", normalized_minigame] if tag]
    if normalized_minigame == "narrative_story" and normalized_stage is not None:
        tags.append(f"chapter_{normalized_stage}")

    script_tag = "kanji_n5" if slug.startswith("kanji_n") else slug

    updated_state = review_minigame_result(
        deck_name=deck.name,
        card_id=card_id,
        is_correct=is_correct,
        minigame=normalized_minigame,
        curriculum_stage=curriculum_stage,
        script_tag=script_tag,
        tags=tags,
    )

    return {
        "ok": True,
        "card_id": updated_state.card_id,
        "repetitions": updated_state.repetitions,
        "interval": updated_state.interval,
        "next_review": updated_state.next_review.isoformat(),
        "ease_factor": updated_state.ease_factor,
        "curriculum_stage": load_curriculum_stages(deck.name, stage_mode, [card_id]).get(card_id, 1)
        if stage_mode
        else None,
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

    if command == "block-progress":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Missing deck slug"}))
            return 2
        slug = sys.argv[2]
        try:
            payload = build_block_progress(slug)
        except ValueError as exc:
            print(json.dumps({"error": str(exc)}))
            return 2
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    if command == "reset-db":
        print(json.dumps(reset_progress(), ensure_ascii=False))
        return 0

    if command == "record-result":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: record-result <slug> <card_id> <is_correct> [minigame] [curriculum_stage]"}))
            return 2
        slug = sys.argv[2]
        try:
            card_id = int(sys.argv[3])
            is_correct = _parse_bool_flag(sys.argv[4])
            minigame = sys.argv[5] if len(sys.argv) > 5 else ""
            curriculum_stage = int(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6].strip() else None
            payload = record_game_result(
                slug,
                card_id,
                is_correct,
                minigame=minigame,
                curriculum_stage=curriculum_stage,
            )
        except ValueError as exc:
            print(json.dumps({"error": str(exc)}))
            return 2
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    print(json.dumps({"error": f"Unknown command: {command}"}))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
