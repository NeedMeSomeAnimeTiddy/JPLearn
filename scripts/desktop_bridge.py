"""Bridge script used by Electron to query JPLearn data.

This script is intentionally small and command-driven so the desktop shell can
request JSON payloads over a subprocess boundary.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
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
    assemble_assistant_chat_context,
    clear_assistant_chat,
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
    unlock_threshold_for_slug,
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
from domain.progression import NodeProgressionState, ProgressionState
from domain.progression_curriculum import JPLEARN_GRAPH
from domain.progression_service import (
    build_initial_state,
    reachable_nodes,
)
from domain.feature_catalog import JPLEARN_FEATURES
from domain.feature_service import build_feature_state, evaluate_features
from domain.features import FeatureState
from domain.xp import DEFAULT_CURVE, XP_CORRECT_ANSWER, UserProgress, XPEvent
from domain.level_service import (
    apply_xp,
    compute_level as compute_xp_level,
    xp_for_level_up,
    xp_to_next_level as xp_left,
)
from domain.recommendation import CategoryMetrics, StudySnapshot
from domain.recommendation_service import generate_recommendations
from domain.tutor_service import (
    active_reactions,
    from_feature_event,
    from_level_event,
    from_progression_event,
    from_recommendation,
    generate_reactions,
)
from data.database import (
    load_feature_unlocks,
    load_tutor_seen_keys,
    load_user_progression,
    load_user_xp,
    save_feature_unlock,
    save_tutor_seen_key,
    save_user_xp,
    upsert_progression_node,
)

SUMMARY_SCRIPT_TAGS = (
    "hiragana",
    "katakana",
    "kanji_n5",
    "vocab_n5",
    "grammar_patterns",
)

OVERVIEW_WORDS_CATEGORY_SPECS: tuple[tuple[str, str], ...] = (
    ("Greetings", "vocab_greetings"),
    ("Numbers", "vocab_numbers"),
    ("Time & Days", "vocab_time_days"),
    ("Family", "vocab_family"),
    ("Body", "vocab_body"),
    ("Food & Drink", "vocab_food_drink"),
    ("School & Study", "vocab_school_study"),
    ("Places", "vocab_places"),
    ("Transport", "vocab_transport"),
    ("Adjectives", "vocab_adjectives"),
    ("Verbs", "vocab_verbs"),
    ("Common Nouns", "vocab_nouns"),
)

VOCAB_N5_CATEGORY_SLUGS: tuple[str, ...] = tuple(
    slug for _, slug in OVERVIEW_WORDS_CATEGORY_SPECS
)

KANJI_N5_CATEGORY_SLUGS: tuple[str, ...] = (
    "kanji_numbers_time",
    "kanji_nature_world",
    "kanji_people_body",
    "kanji_study_language",
    "kanji_actions_travel",
)

EXPERTISE_LEVEL_TO_SLUGS: dict[str, tuple[str, ...]] = {
    "total_beginner": (),
    "know_hiragana": ("hiragana",),
    "know_kana": ("hiragana", "katakana"),
    "jlpt_n5_foundation": (
        "hiragana",
        "katakana",
        "kanji_n5",
        *KANJI_N5_CATEGORY_SLUGS,
        "vocab_n5",
        *VOCAB_N5_CATEGORY_SLUGS,
    ),
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


@dataclass(frozen=True)
class ProgressionNodeStatusPayload:
    node_id: str
    name: str
    status: str
    mastered_ratio: float
    is_reachable: bool


@dataclass(frozen=True)
class FeatureStatusPayload:
    feature_id: str
    name: str
    category: str
    is_unlocked: bool


@dataclass(frozen=True)
class XPProgressPayload:
    level: int
    total_xp: int
    xp_to_next_level: int
    xp_for_current_level: int


@dataclass(frozen=True)
class RecommendationPayload:
    node_id: str
    display_label: str
    review_count: int
    difficulty: str
    reason: str
    priority: int


@dataclass(frozen=True)
class TutorReactionPayload:
    dedup_key: str
    event_type: str
    priority: str
    message_type: str
    headline: str
    body: str
    cta: str


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

    unlocked_count = compute_unlocked_count(blocks, repetitions_map, unlock_threshold_for_slug(slug))
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

    words_category_blocks: list[dict[str, object]] = []
    can_unlock_next = True
    for index, (label, slug) in enumerate(OVERVIEW_WORDS_CATEGORY_SPECS):
        factory = ALL_DECKS.get(slug)
        if factory is None:
            continue
        deck = factory()
        card_ids = [card.id for card in deck.cards]
        states = load_review_states(deck.name, card_ids)
        repetitions_map: dict[int, int] = {
            cid: getattr(states.get(cid), "repetitions", 0) for cid in card_ids
        }
        total = len(card_ids)
        passed = sum(1 for cid in card_ids if repetitions_map.get(cid, 0) >= 1)
        mastery = (passed / total) if total > 0 else 0.0
        unlocked = can_unlock_next
        if total > 0 and mastery < 0.7:
            can_unlock_next = False

        words_category_blocks.append(
            {
                "index": index,
                "name": label,
                "card_ids": card_ids,
                "sample_chars": [card.character for card in deck.cards[:3]],
                "characters": [card.character for card in deck.cards],
                "meanings": [card.meaning for card in deck.cards],
                "romajis": [card.romaji for card in deck.cards],
                "mastery": round(mastery, 3),
                "unlocked": unlocked,
            }
        )

    category_blocks = {
        "vocab_n5": words_category_blocks,
        "grammar_patterns": build_block_progress("grammar_patterns").get("blocks", []),
    }

    return {
        "blocks": overview_blocks,
        "category_blocks": category_blocks,
        "kanji_cards": [asdict(card) for card in kanji_cards],
    }


def reset_progress() -> dict[str, object]:
    reset_study_db()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Node → deck slug mapping for recommendations
# ---------------------------------------------------------------------------

_NODE_TO_DECK_SLUG: dict[str, str] = {
    "hiragana": "hiragana",
    "katakana": "katakana",
    "vocabulary_n5": "vocab_n5",
    "grammar_n5": "grammar_patterns",
    "kanji_n5": "kanji_n5",
}

_NOW_UTC = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731


# ---------------------------------------------------------------------------
# Helpers to reconstruct domain state from database
# ---------------------------------------------------------------------------


def _load_progression_state() -> ProgressionState:
    rows = load_user_progression()
    if not rows:
        return build_initial_state(JPLEARN_GRAPH)
    node_states: dict[str, NodeProgressionState] = {}
    for row in rows:
        node_states[row["node_id"]] = NodeProgressionState(
            node_id=row["node_id"],
            status=row["status"],
            mastered_item_count=row["mastered_item_count"],
            total_item_count=row["total_item_count"],
        )
    # Fill any missing nodes with locked defaults
    for node_id in JPLEARN_GRAPH.nodes:
        if node_id not in node_states:
            status = "unlocked" if node_id == JPLEARN_GRAPH.root_id else "locked"
            node_states[node_id] = NodeProgressionState(node_id=node_id, status=status)
    return ProgressionState(node_states=node_states)


def _load_feature_state() -> FeatureState:
    unlocked_ids = load_feature_unlocks()
    statuses: dict[str, str] = {}
    for feat in JPLEARN_FEATURES:
        statuses[feat.feature_id] = "unlocked" if feat.feature_id in unlocked_ids else "locked"
    return FeatureState(statuses=statuses)


def _load_user_progress() -> UserProgress:
    row = load_user_xp()
    total_xp = int(row["total_xp"])
    level = int(row["level"])
    try:
        keys = frozenset(json.loads(str(row["applied_dedup_keys_json"])))
    except Exception:
        keys = frozenset()
    return UserProgress(total_xp=total_xp, level=level, applied_dedup_keys=keys)


def _save_user_progress(progress: UserProgress) -> None:
    keys_json = json.dumps(sorted(progress.applied_dedup_keys))
    save_user_xp(progress.total_xp, progress.level, keys_json)


# ---------------------------------------------------------------------------
# New bridge commands
# ---------------------------------------------------------------------------


def build_progression_status() -> dict[str, object]:
    """Return the learner's current progression state for all nodes."""
    init_study_db()
    prog_state = _load_progression_state()
    reachable = reachable_nodes(JPLEARN_GRAPH, prog_state)
    result = []
    for node_id, node in JPLEARN_GRAPH.nodes.items():
        ns = prog_state.node_states.get(node_id)
        status = ns.status if ns else "locked"
        mastered_ratio = (
            ns.mastered_item_count / ns.total_item_count
            if ns and ns.total_item_count > 0
            else 0.0
        )
        result.append(
            asdict(
                ProgressionNodeStatusPayload(
                    node_id=node_id,
                    name=node.name,
                    status=status,
                    mastered_ratio=round(mastered_ratio, 3),
                    is_reachable=node_id in reachable,
                )
            )
        )
    return {"nodes": result}


def build_feature_unlock_status() -> dict[str, object]:
    """Return unlock status for all features in the catalog."""
    init_study_db()
    feat_state = _load_feature_state()
    # Evaluate in case progression unlocks new features
    prog_state = _load_progression_state()
    feat_state, events = evaluate_features(JPLEARN_FEATURES, prog_state, feat_state, __import__("datetime").date.today())
    # Persist any newly unlocked features
    now = _NOW_UTC()
    for ev in events:
        save_feature_unlock(ev.feature_id, now)
    result = []
    for feat in JPLEARN_FEATURES:
        result.append(
            asdict(
                FeatureStatusPayload(
                    feature_id=feat.feature_id,
                    name=feat.name,
                    category=feat.category,
                    is_unlocked=feat_state.statuses.get(feat.feature_id) == "unlocked",
                )
            )
        )
    return {"features": result}


def build_xp_progress() -> dict[str, object]:
    """Return the learner's current XP and level data."""
    init_study_db()
    progress = _load_user_progress()
    level = compute_xp_level(progress.total_xp, DEFAULT_CURVE)
    remaining = xp_left(progress.total_xp, DEFAULT_CURVE)
    level_threshold = xp_for_level_up(level, DEFAULT_CURVE)
    return asdict(
        XPProgressPayload(
            level=level,
            total_xp=progress.total_xp,
            xp_to_next_level=remaining,
            xp_for_current_level=level_threshold,
        )
    )


def _build_category_metrics_for_node(node_id: str) -> CategoryMetrics:
    """Aggregate SRS metrics for a single progression node."""
    deck_slug = _NODE_TO_DECK_SLUG.get(node_id)
    if deck_slug is None:
        return CategoryMetrics(
            node_id=node_id,
            due_count=0,
            overdue_count=0,
            new_count=0,
            leech_count=0,
            accuracy_7d=1.0,
            mastered_ratio=0.0,
            total_items=0,
        )
    factory = ALL_DECKS.get(deck_slug)
    if factory is None:
        return CategoryMetrics(
            node_id=node_id,
            due_count=0,
            overdue_count=0,
            new_count=0,
            leech_count=0,
            accuracy_7d=1.0,
            mastered_ratio=0.0,
            total_items=0,
        )
    deck = factory()
    card_ids = [card.id for card in deck.cards]
    states = load_review_states(deck.name, card_ids)

    from datetime import date as _date
    today = _date.today()
    due_count = 0
    overdue_count = 0
    new_count = 0
    mastered_count = 0
    for cid, state in states.items():
        if state.repetitions <= 0:
            new_count += 1
        elif state.next_review <= today:
            if state.next_review < today:
                overdue_count += 1
            else:
                due_count += 1
        if state.repetitions >= 3 and state.interval >= 21:
            mastered_count += 1

    from data.study_pipeline import load_active_leech_card_ids
    leech_ids = load_active_leech_card_ids(deck.name)
    leech_count = len(leech_ids)

    # 7-day accuracy from review events
    from data.database import _connect, init_db
    init_db()
    import sqlite3
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT
                SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct,
                COUNT(*) AS total
            FROM review_events
            WHERE deck = ?
              AND reviewed_on >= date('now', '-7 days')
            """,
            (_normalize_deck_key(deck.name),),
        ).fetchone()
    correct = row["correct"] or 0
    total_reviews = row["total"] or 0
    accuracy_7d = (correct / total_reviews) if total_reviews > 0 else 1.0

    return CategoryMetrics(
        node_id=node_id,
        due_count=due_count,
        overdue_count=overdue_count,
        new_count=new_count,
        leech_count=leech_count,
        accuracy_7d=round(accuracy_7d, 3),
        mastered_ratio=round(mastered_count / len(card_ids), 3) if card_ids else 0.0,
        total_items=len(card_ids),
    )


def build_recommendations_payload() -> dict[str, object]:
    """Return prioritised study recommendations for the current learner state."""
    init_study_db()
    prog_state = _load_progression_state()
    streak = load_streak_state()
    activity = load_activity_summary(7)

    # Build CategoryMetrics for mapped nodes only
    metrics = [
        _build_category_metrics_for_node(node_id)
        for node_id in _NODE_TO_DECK_SLUG
    ]
    # Filter to nodes that have items
    metrics = [m for m in metrics if m.total_items > 0]

    from datetime import date as _date
    snapshot = StudySnapshot(
        date=_date.today(),
        category_metrics=tuple(metrics),
        progression_state=prog_state,
        days_since_last_study=(
            max(0, (_date.today() - streak.last_study_day_utc).days)
            if streak.last_study_day_utc
            else 0
        ),
        current_streak=streak.current_streak_days,
        xp_last_7_days=activity.points_earned,
    )
    recs = generate_recommendations(snapshot, JPLEARN_GRAPH)
    return {
        "recommendations": [
            asdict(RecommendationPayload(
                node_id=r.node_id,
                display_label=r.display_label,
                review_count=r.review_count,
                difficulty=r.difficulty,
                reason=r.reason,
                priority=r.priority,
            ))
            for r in recs
        ]
    }


def build_tutor_reactions_payload() -> dict[str, object]:
    """Return active tutor reactions based on recent progression and state."""
    init_study_db()
    seen_keys = load_tutor_seen_keys()
    tutor_events = []

    # Recent mastery events (nodes mastered in DB)
    rows = load_user_progression()
    for row in rows:
        if row["status"] == "mastered" and row["mastered_at"]:
            from domain.progression import ProgressionEvent as PE
            import datetime as _dt
            try:
                d = _dt.date.fromisoformat(row["mastered_at"][:10])
            except Exception:
                d = _dt.date.today()
            pe = PE(event_type="node_mastered", node_id=row["node_id"], date=d)
            ev = from_progression_event(pe, JPLEARN_GRAPH)
            if ev:
                tutor_events.append(ev)

    # Feature unlock events
    unlocked_ids = load_feature_unlocks()
    for feat in JPLEARN_FEATURES:
        if feat.feature_id in unlocked_ids:
            from domain.features import FeatureEvent as FE, FeatureUnlock as FU
            import datetime as _dt
            fe = FE(
                event_type="feature_unlocked",
                feature_id=feat.feature_id,
                date=_dt.date.today(),
                unlock=FU(access_descriptor=f"{feat.feature_id}_access"),
            )
            ev = from_feature_event(fe, features=JPLEARN_FEATURES)
            if ev is not None:
                tutor_events.append(ev)

    # XP level event (if level > 1)
    progress = _load_user_progress()
    if progress.level > 1:
        import datetime as _dt
        from domain.xp import LevelEvent as LE
        lev = LE(new_level=progress.level, date=_dt.date.today(), xp_at_level_up=progress.total_xp)
        tutor_events.append(from_level_event(lev))

    # Top recommendation as a tutor event
    recs_payload = build_recommendations_payload()
    for r in recs_payload.get("recommendations", [])[:1]:
        rec_obj = generate_recommendations.__module__  # just to get the type
        # Reconstruct StudyRecommendation from payload dict
        from domain.recommendation import StudyRecommendation as SR
        sr = SR(
            node_id=r["node_id"],
            display_label=r["display_label"],
            review_count=r["review_count"],
            difficulty=r["difficulty"],
            reason=r["reason"],
            focus_areas=(),
            priority=r["priority"],
        )
        import datetime as _dt
        tutor_events.append(from_recommendation(sr, _dt.date.today(), graph=JPLEARN_GRAPH))

    reactions = generate_reactions(tutor_events, seen_dedup_keys=frozenset(seen_keys))
    active = active_reactions(reactions)
    return {
        "reactions": [
            asdict(TutorReactionPayload(
                dedup_key=r.dedup_key,
                event_type=r.event.event_type,
                priority=r.event.priority,
                message_type=r.message.message_type,
                headline=r.message.headline,
                body=r.message.body,
                cta=r.message.cta,
            ))
            for r in active
        ]
    }


def dismiss_tutor_reaction_key(dedup_key: str) -> dict[str, object]:
    """Persist a tutor reaction dedup key as seen."""
    init_study_db()
    save_tutor_seen_key(dedup_key, _NOW_UTC())
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

    # Q1: Award XP piggybacked on this call (correct answer only).
    xp_gained = 0
    level_before = 1
    level_after = 1
    if is_correct:
        progress = _load_user_progress()
        level_before = progress.level
        dedup = f"correct:{slug}:{card_id}:{updated_state.next_review.isoformat()}"
        xp_event = XPEvent(
            source="correct_answer",
            amount=XP_CORRECT_ANSWER,
            dedup_key=dedup,
            date=updated_state.next_review,
        )
        new_progress, _ = apply_xp(progress, xp_event, DEFAULT_CURVE, updated_state.next_review)
        _save_user_progress(new_progress)
        xp_gained = XP_CORRECT_ANSWER if dedup not in progress.applied_dedup_keys else 0
        level_after = new_progress.level

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
        "xp_gained": xp_gained,
        "level_before": level_before,
        "level_after": level_after,
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


def clear_chat_history() -> dict[str, object]:
    init_study_db()
    removed = clear_assistant_chat()
    return {"ok": True, "removed": removed}


def get_assistant_chat_context(session_id: str | None = None, user_message: str | None = None) -> dict[str, object]:
    init_study_db()
    return {
        "ok": True,
        "context": assemble_assistant_chat_context(session_id=session_id, user_message=user_message),
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

    if command == "assistant-chat-clear":
        return 0, clear_chat_history()

    if command == "assistant-chat-context":
        session_id = argv[1].strip() if len(argv) > 1 and argv[1].strip() else None
        user_message = argv[2] if len(argv) > 2 and argv[2].strip() else None
        return 0, get_assistant_chat_context(session_id=session_id, user_message=user_message)

    if command == "progression":
        return 0, build_progression_status()

    if command == "feature-unlocks":
        return 0, build_feature_unlock_status()

    if command == "xp-progress":
        return 0, build_xp_progress()

    if command == "recommendations":
        try:
            return 0, build_recommendations_payload()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "tutor-reactions":
        try:
            return 0, build_tutor_reactions_payload()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "tutor-dismiss":
        if len(argv) < 2:
            return 2, {"error": "Usage: tutor-dismiss <dedup_key>"}
        return 0, dismiss_tutor_reaction_key(argv[1])

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
