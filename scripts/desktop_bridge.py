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
from uuid import uuid4

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.study_pipeline import (
    append_assistant_chat_turn,
    consume_assistant_events,
    init_study_db,
    load_activity_summary,
    load_active_leech_card_ids,
    load_assistant_snapshot,
    load_curriculum_stage_summary,
    load_narrative_chapter_summary,
    load_pending_assistant_events,
    load_recent_assistant_chat_turns,
    load_item_history,
    load_mistake_breakdown,
    load_curriculum_stages,
    load_review_states,
    load_streak_state,
    load_today_progress,
    reset_study_db,
    review_minigame_result,
    save_session_goal,
    load_session_summary,
    track_assistant_event_interaction,
)
from data.database import save_state
from domain.blocks import (
    blocks_for_slug,
    compute_block_mastery,
    compute_unlocked_count,
)
from domain.distractors import rank_distractor_ids
from domain.decks import ALL_DECKS
from domain.scheduler import ReviewState, update
from domain.queue_builder import build_study_queue
from domain.decks import (
    VOCAB_N1_EXTERNAL_DATA,
    VOCAB_N2_EXTERNAL_DATA,
    VOCAB_N3_EXTERNAL_DATA,
    VOCAB_N4_EXTERNAL_DATA,
    VOCAB_N5_EXTERNAL_DATA,
)

SUMMARY_SCRIPT_TAGS = (
    "hiragana",
    "katakana",
    "kanji_n5",
    "vocab_n5",
    "grammar_patterns",
)

EXPERTISE_LEVEL_TO_SLUGS: dict[str, tuple[str, ...]] = {
    "total_beginner": (),
    "know_hiragana": ("hiragana",),
    "know_kana": ("hiragana", "katakana"),
    "jlpt_n5_foundation": ("hiragana", "katakana", "kanji_n5", "vocab_n5"),
}

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
    example_sentence: str | None
    is_leech: bool
    curriculum_stage: int
    meaning_distractor_ids: list[int]
    character_distractor_ids: list[int]


@dataclass(frozen=True)
class OverviewCharacterCard:
    id: int
    character: str
    romaji: str
    meaning: str
    tags: list[str]
    example_sentence: str | None


@dataclass(frozen=True)
class SessionGoalPayload:
    session_id: str
    target_items: int
    target_minutes: int | None
    target_accuracy: int | None
    started_at_utc: str


@dataclass(frozen=True)
class SessionSummaryPayload:
    session_id: str
    target_items: int
    completed_items: int
    reviewed: int
    correct: int
    accuracy: int
    target_accuracy: int | None
    goal_met: bool


@dataclass(frozen=True)
class StudyQueuePayload:
    slug: str
    card_ids: list[int]
    indices: list[int]


def _normalize_deck_key(value: str) -> str:
    return value.strip().lower().replace("_", " ")


def _legacy_prompt_label(deck_name: str, card_id: int) -> str:
    normalized_deck = deck_name.strip() or "Review"
    return f"{normalized_deck} item #{card_id}"


def _build_legacy_prompt_lookup() -> dict[tuple[str, int], str]:
    """Build fallback prompt map for historical vocab ids beyond current deck limits."""
    lookup: dict[tuple[str, int], str] = {}
    vocab_specs = [
        ("Vocabulary N5", "vocab_n5", 0, VOCAB_N5_EXTERNAL_DATA),
        ("Vocabulary N4", "vocab_n4", 10000, VOCAB_N4_EXTERNAL_DATA),
        ("Vocabulary N3", "vocab_n3", 20000, VOCAB_N3_EXTERNAL_DATA),
        ("Vocabulary N2", "vocab_n2", 30000, VOCAB_N2_EXTERNAL_DATA),
        ("Vocabulary N1", "vocab_n1", 40000, VOCAB_N1_EXTERNAL_DATA),
    ]
    for deck_name, slug, id_offset, rows in vocab_specs:
        normalized_deck = _normalize_deck_key(deck_name)
        normalized_slug = _normalize_deck_key(slug)
        for index, row in enumerate(rows):
            character = row[0].strip()
            if not character:
                continue
            card_id = id_offset + index
            lookup[(normalized_deck, card_id)] = character
            lookup[(normalized_slug, card_id)] = character
    return lookup


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
    prompt_lookup_by_id: dict[int, str] = {}
    legacy_prompt_lookup = _build_legacy_prompt_lookup()
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
            prompt_text = card.character
            prompt_lookup[(_normalize_deck_key(deck.name), card.id)] = prompt_text
            prompt_lookup[(_normalize_deck_key(slug), card.id)] = prompt_text
            prompt_lookup_by_id[card.id] = prompt_text
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
                "prompt": (
                    prompt_lookup.get((_normalize_deck_key(item.deck), item.card_id))
                    or legacy_prompt_lookup.get((_normalize_deck_key(item.deck), item.card_id))
                    or prompt_lookup_by_id.get(item.card_id)
                    or item.prompt
                    or _legacy_prompt_label(item.deck, item.card_id)
                ),
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
            example_sentence=card.example_sentence,
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


def build_overview_character_mastery() -> dict[str, object]:
    """Return the overview's character mastery data in one payload.

    The overview only needs block metadata plus lightweight kanji card fields,
    so avoid the heavier per-deck distractor and curriculum work used by minigames.
    """
    init_study_db()

    overview_blocks = {
        "hiragana": build_block_progress("hiragana")["blocks"],
        "katakana": build_block_progress("katakana")["blocks"],
    }

    kanji_cards: list[OverviewCharacterCard] = []
    for slug in ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1"):
        factory = ALL_DECKS.get(slug)
        if factory is None:
            raise ValueError(f"Unknown deck slug: {slug}")
        deck = factory()
        kanji_cards.extend(
            OverviewCharacterCard(
                id=card.id,
                character=card.character,
                romaji=card.romaji,
                meaning=card.meaning,
                tags=card.tags,
                example_sentence=card.example_sentence,
            )
            for card in deck.cards
        )

    return {
        "blocks": overview_blocks,
        "kanji_cards": [asdict(card) for card in kanji_cards],
    }


def reset_progress() -> dict[str, object]:
    reset_study_db()
    return {"ok": True}


def _mastered_seed_state(card_id: int) -> ReviewState:
    state = ReviewState(card_id=card_id)
    # The app treats mastered as repetitions >= 3 and interval >= 21.
    # Four successful reviews reaches interval >= 21 with current scheduler settings.
    for _ in range(4):
        state = update(state, quality=4)
    return state


def apply_expertise_level(level: str) -> dict[str, object]:
    init_study_db()
    normalized_level = level.strip().lower()
    target_slugs = EXPERTISE_LEVEL_TO_SLUGS.get(normalized_level)
    if target_slugs is None:
        raise ValueError(f"Unknown expertise level: {level}")

    seeded_cards = 0
    touched_decks: list[str] = []
    for slug in target_slugs:
        factory = ALL_DECKS.get(slug)
        if factory is None:
            continue
        deck = factory()
        target_state_by_id = {card.id: _mastered_seed_state(card.id) for card in deck.cards}
        states = load_review_states(deck.name, list(target_state_by_id.keys()))

        for card_id, target_state in target_state_by_id.items():
            current = states.get(card_id)
            if current is None:
                save_state(deck.name, target_state)
                seeded_cards += 1
                continue
            if current.repetitions >= target_state.repetitions and current.interval >= target_state.interval:
                continue
            save_state(deck.name, target_state)
            seeded_cards += 1

        touched_decks.append(deck.name)

    return {
        "ok": True,
        "level": normalized_level,
        "seeded_cards": seeded_cards,
        "decks": touched_decks,
    }


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
    session_id: str = "",
    confidence_score: int | None = None,
) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    matching_card = next((card for card in deck.cards if card.id == card_id), None)
    if matching_card is None:
        raise ValueError(f"Unknown card id {card_id} for deck slug: {slug}")

    normalized_minigame = minigame.strip().lower()
    stage_mode = "context_cloze" if normalized_minigame == "narrative_story" else normalized_minigame
    normalized_stage = None if curriculum_stage is None else max(1, min(3, curriculum_stage))
    tags = [tag for tag in ["minigame", normalized_minigame] if tag]
    if normalized_minigame == "narrative_story" and normalized_stage is not None:
        tags.append(f"chapter_{normalized_stage}")

    if slug.startswith("kanji_n"):
        script_tag = "kanji_n5"
    elif slug.startswith("vocab_n"):
        script_tag = "vocab_n5"
    else:
        script_tag = slug

    updated_state = review_minigame_result(
        deck_name=deck.name,
        card_id=card_id,
        is_correct=is_correct,
        minigame=normalized_minigame,
        curriculum_stage=curriculum_stage,
        script_tag=script_tag,
        prompt_text=matching_card.character,
        tags=tags,
        session_id=session_id.strip(),
        confidence_score=confidence_score,
    )

    return {
        "ok": True,
        "card_id": updated_state.card_id,
        "repetitions": updated_state.repetitions,
        "interval": updated_state.interval,
        "next_review": updated_state.next_review.isoformat(),
        "ease_factor": updated_state.ease_factor,
        "confidence_score": None if confidence_score is None else max(1, min(5, int(confidence_score))),
        "curriculum_stage": load_curriculum_stages(deck.name, stage_mode, [card_id]).get(card_id, 1)
        if stage_mode
        else None,
    }


def start_session_goal(
    target_items: int,
    target_minutes: int | None = None,
    target_accuracy: int | None = None,
    session_id: str | None = None,
) -> dict[str, object]:
    init_study_db()
    normalized_session_id = (session_id or "").strip() or str(uuid4())
    goal = save_session_goal(
        session_id=normalized_session_id,
        target_items=target_items,
        target_minutes=target_minutes,
        target_accuracy=target_accuracy,
    )
    return {"ok": True, "goal": asdict(SessionGoalPayload(**asdict(goal)))}


def get_session_goal_summary(session_id: str) -> dict[str, object]:
    init_study_db()
    summary = load_session_summary(session_id)
    if summary is None:
        return {"ok": False, "error": f"Unknown session id: {session_id}"}
    return {"ok": True, "summary": asdict(SessionSummaryPayload(**asdict(summary)))}


def build_study_queue_payload(slug: str) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    card_ids = [card.id for card in deck.cards]
    states = load_review_states(deck.name, card_ids)
    due_card_ids = {card_id for card_id, state in states.items() if state.is_due()}
    new_card_ids = {card_id for card_id, state in states.items() if state.repetitions <= 0}
    leech_card_ids = load_active_leech_card_ids(deck.name)

    queue_card_ids = build_study_queue(
        card_ids=card_ids,
        due_card_ids=due_card_ids,
        leech_card_ids=leech_card_ids,
        new_card_ids=new_card_ids,
    )
    id_to_index = {card_id: index for index, card_id in enumerate(card_ids)}
    queue_indices = [id_to_index[card_id] for card_id in queue_card_ids if card_id in id_to_index]
    return {
        "ok": True,
        "queue": asdict(
            StudyQueuePayload(
                slug=slug,
                card_ids=queue_card_ids,
                indices=queue_indices,
            )
        ),
    }


def build_assistant_snapshot(session_id: str | None = None) -> dict[str, object]:
    init_study_db()
    return {
        "ok": True,
        "snapshot": load_assistant_snapshot(session_id=session_id),
    }


def get_pending_assistant_events(limit: int = 8) -> dict[str, object]:
    init_study_db()
    return {
        "ok": True,
        "events": load_pending_assistant_events(limit=limit),
    }


def consume_pending_assistant_events(event_ids: list[int]) -> dict[str, object]:
    init_study_db()
    consume_assistant_events(event_ids)
    return {
        "ok": True,
        "consumed": len(event_ids),
    }


def track_assistant_event(
    event_id: int,
    interaction_type: str,
    metadata: Mapping[str, str] | None = None,
) -> dict[str, object]:
    init_study_db()
    track_assistant_event_interaction(
        event_id=event_id,
        interaction_type=interaction_type,
        metadata=None if metadata is None else dict(metadata),
    )
    return {"ok": True}


def append_chat_turn(role: str, content: str) -> dict[str, object]:
    init_study_db()
    append_assistant_chat_turn(role, content)
    return {"ok": True}


def get_recent_chat_turns(limit: int = 20) -> dict[str, object]:
    init_study_db()
    return {
        "ok": True,
        "turns": load_recent_assistant_chat_turns(limit=limit),
    }


def _run_command(argv: list[str]) -> tuple[int, dict[str, object]]:
    if not argv:
        return 2, {"error": "Missing command"}

    command = argv[0]

    if command == "summary":
        return 0, build_summary()

    if command == "deck-cards":
        if len(argv) < 2:
            return 2, {"error": "Missing deck slug"}
        slug = argv[1]
        try:
            return 0, build_deck_cards(slug)
        except ValueError as exc:
            return 2, {"error": str(exc)}

    if command == "block-progress":
        if len(argv) < 2:
            return 2, {"error": "Missing deck slug"}
        slug = argv[1]
        try:
            return 0, build_block_progress(slug)
        except ValueError as exc:
            return 2, {"error": str(exc)}

    if command == "overview-character-mastery":
        return 0, build_overview_character_mastery()

    if command == "reset-db":
        return 0, reset_progress()

    if command == "record-result":
        if len(argv) < 4:
            return 2, {
                "error": "Usage: record-result <slug> <card_id> <is_correct> [minigame] [curriculum_stage] [session_id] [confidence_score]"
            }
        slug = argv[1]
        try:
            card_id = int(argv[2])
            is_correct = _parse_bool_flag(argv[3])
            minigame = argv[4] if len(argv) > 4 else ""
            curriculum_stage = int(argv[5]) if len(argv) > 5 and argv[5].strip() else None
            session_id = argv[6] if len(argv) > 6 else ""
            confidence_score = int(argv[7]) if len(argv) > 7 and argv[7].strip() else None
            payload = record_game_result(
                slug,
                card_id,
                is_correct,
                minigame=minigame,
                curriculum_stage=curriculum_stage,
                session_id=session_id,
                confidence_score=confidence_score,
            )
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "session-start":
        if len(argv) < 2:
            return 2, {"error": "Usage: session-start <target_items> [target_minutes] [target_accuracy] [session_id]"}
        try:
            target_items = int(argv[1])
            target_minutes = int(argv[2]) if len(argv) > 2 and argv[2].strip() else None
            target_accuracy = int(argv[3]) if len(argv) > 3 and argv[3].strip() else None
            session_goal_id = argv[4] if len(argv) > 4 else None
            payload = start_session_goal(
                target_items=target_items,
                target_minutes=target_minutes,
                target_accuracy=target_accuracy,
                session_id=session_goal_id,
            )
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "session-summary":
        if len(argv) < 2:
            return 2, {"error": "Usage: session-summary <session_id>"}
        return 0, get_session_goal_summary(argv[1])

    if command == "apply-expertise-level":
        if len(argv) < 2:
            return 2, {"error": "Usage: apply-expertise-level <level>"}
        try:
            payload = apply_expertise_level(argv[1])
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "study-queue":
        if len(argv) < 2:
            return 2, {"error": "Usage: study-queue <slug>"}
        try:
            payload = build_study_queue_payload(argv[1])
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "assistant-snapshot":
        session_id = argv[1] if len(argv) > 1 and argv[1].strip() else None
        return 0, build_assistant_snapshot(session_id=session_id)

    if command == "assistant-events":
        try:
            limit = int(argv[1]) if len(argv) > 1 and argv[1].strip() else 8
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, get_pending_assistant_events(limit=limit)

    if command == "assistant-events-consume":
        if len(argv) < 2:
            return 2, {"error": "Usage: assistant-events-consume <id_csv>"}
        try:
            event_ids = [
                int(value)
                for value in argv[1].split(",")
                if value.strip()
            ]
            payload = consume_pending_assistant_events(event_ids)
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "assistant-events-track":
        if len(argv) < 3:
            return 2, {"error": "Usage: assistant-events-track <event_id> <interaction_type> [metadata_json]"}
        try:
            event_id = int(argv[1])
            interaction_type = argv[2]
            metadata: Mapping[str, str] | None = None
            if len(argv) > 3 and argv[3].strip():
                decoded = json.loads(argv[3])
                if not isinstance(decoded, dict):
                    raise ValueError("metadata_json must decode to object")
                metadata = {str(key): str(value) for key, value in decoded.items()}
            payload = track_assistant_event(event_id, interaction_type, metadata)
        except (ValueError, json.JSONDecodeError) as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "assistant-chat-append":
        if len(argv) < 3:
            return 2, {"error": "Usage: assistant-chat-append <role> <content>"}
        try:
            payload = append_chat_turn(argv[1], argv[2])
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, payload

    if command == "assistant-chat-history":
        try:
            limit = int(argv[1]) if len(argv) > 1 and argv[1].strip() else 20
        except ValueError as exc:
            return 2, {"error": str(exc)}
        return 0, get_recent_chat_turns(limit=limit)

    return 2, {"error": f"Unknown command: {command}"}


def _run_server() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id: object = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            args = request.get("args")
            if not isinstance(args, list) or not all(isinstance(item, str) for item in args):
                raise ValueError("Invalid worker request args")
            code, payload = _run_command(args)
        except Exception as exc:  # pragma: no cover - defensive worker envelope.
            code = 2
            payload = {"error": str(exc)}

        response = {
            "id": request_id,
            "ok": code == 0,
            "code": code,
            "payload": payload,
        }
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    return 0


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--server":
        return _run_server()

    code, payload = _run_command(args)
    print(json.dumps(payload, ensure_ascii=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
