"""Bridge script used by Electron to query JPLearn data.

This script is intentionally small and command-driven so the desktop shell can
request JSON payloads over a subprocess boundary.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import csv
import subprocess
import secrets
from contextlib import nullcontext
from time import perf_counter
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
import unicodedata
from typing import Callable, Mapping
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.study_pipeline import (  # noqa: E402
    append_assistant_chat_turn,
    assemble_assistant_chat_context,
    assemble_assistant_chat_context_v2_with_embeddings,
    clear_assistant_chat,
    consume_assistant_events,
    init_study_db,
    load_activity_summary,
    load_active_leech_card_ids,
    load_daily_counts,
    load_assistant_snapshot,
    load_curriculum_stage_summary,
    load_narrative_chapter_summary,
    load_pending_assistant_events,
    load_recent_assistant_chat_turns,
    load_item_history,
    load_mistake_breakdown,
    load_minigame_breakdown,
    load_session_history,
    load_curriculum_stages,
    load_deck_summary_counts,
    load_review_states,
    load_streak_state,
    reset_study_db,
    review_minigame_result,
    save_session_goal,
    load_session_summary,
    track_assistant_event_interaction,
)
from data.database import save_state  # noqa: E402
from data.card_notes_repository import (  # noqa: E402
    CardNoteRecord,
    CardNotesRepository,
    build_builtin_note_key,
    validate_note_key,
)
from data.mastery_repository import CardMasteryRepository  # noqa: E402
from data.dictionary_repository import (  # noqa: E402
    DictionaryCardSummary,
    build_dictionary_search_payload as _repo_build_dictionary_search_payload,
    build_kanji_detail_payload,
    open_enrichment_session,
)
from data.scenario_repository import (  # noqa: E402
    ScenarioRepository,
    ScenarioSessionRecord,
    ScenarioSrsCardRecord,
)
from domain.blocks import (  # noqa: E402
    blocks_for_slug,
    compute_block_mastery,
    compute_unlocked_count,
    unlock_threshold_for_slug,
)
from domain.cards import Card, Deck  # noqa: E402
from domain.distractors import rank_distractor_ids  # noqa: E402
from domain.decks import ALL_DECKS  # noqa: E402
from domain.scheduler import ReviewState, get_weights, set_weights as set_scheduler_weights, update  # noqa: E402
from domain.word_of_the_day import WordOfDay, select_word_of_the_day  # noqa: E402
from domain.queue_builder import build_study_queue  # noqa: E402
from domain.decks import (  # noqa: E402
    VOCAB_N1_EXTERNAL_DATA,
    VOCAB_N2_EXTERNAL_DATA,
    VOCAB_N3_EXTERNAL_DATA,
    VOCAB_N4_EXTERNAL_DATA,
    VOCAB_N5_EXTERNAL_DATA,
)
from domain.progression import NodeProgressionState, ProgressionEvent, ProgressionState  # noqa: E402
from domain.progression_curriculum import JPLEARN_GRAPH  # noqa: E402
from domain.progression_service import (  # noqa: E402
    build_initial_state,
    reachable_nodes,
    record_mastery,
)
from domain.feature_catalog import JPLEARN_FEATURES  # noqa: E402
from domain.feature_service import evaluate_features  # noqa: E402
from domain.features import FeatureState  # noqa: E402
from domain.milestones import (  # noqa: E402
    REVIEW_COUNT_MILESTONES,
    STREAK_MILESTONES,
    earned_review_milestones,
    earned_streak_milestones,
    milestone_descriptor,
    newly_crossed_review_milestones,
    newly_crossed_streak_milestones,
    streak_milestone_descriptor,
)
from domain.xp import DEFAULT_CURVE, XP_CORRECT_ANSWER, UserProgress, XPEvent  # noqa: E402
from domain.daily_goal import DailyGoal, default_card_target, PRESET_CARD_GOALS  # noqa: E402
from domain.level_service import (  # noqa: E402
    apply_xp,
    compute_level as compute_xp_level,
    xp_for_level_up,
    xp_to_next_level as xp_left,
)
from domain.recommendation import CategoryMetrics, StudySnapshot  # noqa: E402
from domain.recommendation_service import generate_recommendations  # noqa: E402
from domain.tutor_service import (  # noqa: E402
    active_reactions,
    from_feature_event,
    from_level_event,
    from_progression_event,
    from_recommendation,
    generate_reactions,
)
from data.database import (  # noqa: E402
    count_total_reviews,
    load_badges,
    load_daily_counts,
    load_feature_unlocks,
    load_tutor_seen_keys,
    load_user_progression,
    load_user_xp,
    save_badge,
    save_feature_unlock,
    save_tutor_seen_key,
    save_user_xp,
    upsert_progression_node,
)
from data.jlpt_repository import (  # noqa: E402
    load_card_accuracy_map,
    load_jlpt_exam_history,
    save_jlpt_exam_result,
)
from data import deck_portability  # noqa: E402
from data.grammar_minigame_generator import (  # noqa: E402
    generate_assembly_data,
    generate_imposter_data,
    generate_particle_cloze_data,
    generate_vibe_check_data,
)
from data.conjugation_drill import generate_conjugation_drill_data  # noqa: E402
from data.settings_repository import get_setting, set_setting  # noqa: E402
from data.daily_games_repository import (  # noqa: E402
    DailyGameAttempt,
    DailyCrosswordClue,
    DailyGameWordOutcome,
    DailyGamesRepository,
)
from data.fsrs_optimization import (  # noqa: E402
    load_saved_weights as load_fsrs_weights,
    run_optimization as run_fsrs_optimization,
    reset_saved_weights as reset_fsrs_saved_weights,
)
from domain.readiness import (  # noqa: E402
    build_learning_path_status,
)
from domain.daily_games import (  # noqa: E402
    DailyGameWord,
    DailyGameWordCandidate,
    DailyGamesStreakState,
    DailyWordPool,
    apply_daily_game_completion,
    daily_game_seed,
    select_daily_word_pool,
)
from domain.jlpt_readiness import (  # noqa: E402
    JLPT_LEVEL_SPECS,
    LEVEL_ORDER,
    compute_readiness_report,
)
from domain.jlpt_sessions import (  # noqa: E402
    build_adaptive_review_queue,
    build_diagnostic_queue,
    build_mock_exam_queue,
    build_weak_area_queue,
)

from scripts.debug_tools import build_diagnostics_report, build_snapshot  # noqa: E402
# OCR lives in its own module and its own process (see scripts/ocr_server.py and
# electron/ocr_runtime.cjs). The bridge keeps the `assistant-chat-ocr` command as
# a thin CLI delegation; the desktop app does not route OCR through here (#74).
from scripts.ocr_extraction import extract_assistant_chat_ocr_payload  # noqa: E402

def _apply_persisted_fsrs_weights() -> None:
    """Load persisted FSRS weights on backend startup.

    Called from main() rather than at import time: reading the weights opens
    data/jplearn.db, so doing it on import gave merely importing this module a
    side effect on the real database — it created the file when absent, and
    when present it pushed the machine's saved weights into the scheduler's
    module global for every importer, including the test suite.
    """
    try:
        saved = load_fsrs_weights()
        if saved is not None:
            set_scheduler_weights(saved)
    except Exception:
        pass


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

_assets_dir = os.environ.get("JPLEARN_ASSETS_DIR", "").strip() or os.environ.get("JPLEARN_USER_DATA_DIR", "").strip()
_docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
SENTENCE_EXAMPLES_CSV_CANDIDATES = (
    Path(_assets_dir) / "data" / "external_sources" / "sentence_examples.csv"
    if _assets_dir
    else Path(_docs_dir) / "data" / "external_sources" / "sentence_examples.csv"
    if _docs_dir
    else PROJECT_ROOT / "data" / "external_sources" / "sentence_examples.csv",
    PROJECT_ROOT / "data" / "external_sources" / "sentence_examples.csv",
)
_SENTENCE_EXAMPLES_ROWS_CACHE: list[tuple[str, str, str]] | None = None
_SENTENCE_EXAMPLES_TAGS = ["sentence", "example", "grammar"]
_SENTENCE_EXAMPLES_FALLBACK_FACTORY: Callable[[], Deck] | None = ALL_DECKS.get("sentence_examples")


def _load_sentence_examples_rows() -> list[tuple[str, str, str]]:
    """Load sentence examples from CSV once and cache parsed rows."""
    global _SENTENCE_EXAMPLES_ROWS_CACHE
    if _SENTENCE_EXAMPLES_ROWS_CACHE is not None:
        return _SENTENCE_EXAMPLES_ROWS_CACHE

    for candidate in SENTENCE_EXAMPLES_CSV_CANDIDATES:
        if not candidate.exists():
            continue
        try:
            rows: list[tuple[str, str, str]] = []
            with candidate.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                for index, raw in enumerate(reader):
                    if len(raw) < 3:
                        continue
                    character = raw[0].strip()
                    reading = raw[1].strip()
                    meaning = raw[2].strip()
                    if not character or not meaning:
                        continue
                    if (
                        index == 0
                        and character.lower() in {"character", "japanese", "text", "sentence"}
                        and reading.lower() in {"romaji", "reading", "kana", "romanization"}
                    ):
                        continue
                    rows.append((character, reading, meaning))
            if rows:
                _SENTENCE_EXAMPLES_ROWS_CACHE = rows
                return rows
        except (OSError, csv.Error):
            continue

    _SENTENCE_EXAMPLES_ROWS_CACHE = []
    return _SENTENCE_EXAMPLES_ROWS_CACHE


def lookup_sentence(query: str) -> dict[str, object]:
    """Find a sentence pair from sentence_examples.csv containing *query*."""
    query = (query or "").strip()
    if not query:
        return {"jp": None, "en": None, "romaji": None}

    rows = _load_sentence_examples_rows()
    if not rows:
        return {"jp": None, "en": None, "romaji": None}

    for character, reading, meaning in rows:
        if query in character:
            return {"jp": character, "en": meaning, "romaji": reading}

    return {"jp": None, "en": None, "romaji": None}


def _sentence_examples_deck_factory() -> Deck:
    rows = _load_sentence_examples_rows()
    if rows:
        cards = [
            Card(
                id=index,
                character=character,
                romaji=reading,
                meaning=meaning,
                tags=list(_SENTENCE_EXAMPLES_TAGS),
                # Surface the full Japanese sentence as contextual hint text.
                example_sentence=character,
            )
            for index, (character, reading, meaning) in enumerate(rows)
        ]
        return Deck(name="Sentence Examples", cards=cards)

    if _SENTENCE_EXAMPLES_FALLBACK_FACTORY is not None:
        return _SENTENCE_EXAMPLES_FALLBACK_FACTORY()

    return Deck(name="Sentence Examples", cards=[])


ALL_DECKS["sentence_examples"] = _sentence_examples_deck_factory


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

KANJI_N4_CATEGORY_SLUGS: tuple[str, ...] = (
    "kanji_n4_society_roles",
    "kanji_n4_mind_thought",
    "kanji_n4_daily_life",
    "kanji_n4_time_action",
)

KANJI_N3_CATEGORY_SLUGS: tuple[str, ...] = (
    "kanji_n3_governance",
    "kanji_n3_communication",
    "kanji_n3_movement",
    "kanji_n3_achievement",
)

KANJI_N2_CATEGORY_SLUGS: tuple[str, ...] = (
    "kanji_n2_professionalism",
    "kanji_n2_economics",
    "kanji_n2_analysis",
)

KANJI_N1_CATEGORY_SLUGS: tuple[str, ...] = (
    "kanji_n1_law_order",
    "kanji_n1_ideology",
    "kanji_n1_literary",
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
    "jlpt_n4_foundation": (
        "hiragana",
        "katakana",
        "kanji_n5",
        *KANJI_N5_CATEGORY_SLUGS,
        "vocab_n5",
        *VOCAB_N5_CATEGORY_SLUGS,
        "kanji_n4",
        *KANJI_N4_CATEGORY_SLUGS,
        "vocab_n4",
    ),
    "jlpt_n3_foundation": (
        "hiragana",
        "katakana",
        "kanji_n5",
        *KANJI_N5_CATEGORY_SLUGS,
        "vocab_n5",
        *VOCAB_N5_CATEGORY_SLUGS,
        "kanji_n4",
        *KANJI_N4_CATEGORY_SLUGS,
        "vocab_n4",
        "kanji_n3",
        *KANJI_N3_CATEGORY_SLUGS,
        "vocab_n3",
    ),
    "jlpt_n2_foundation": (
        "hiragana",
        "katakana",
        "kanji_n5",
        *KANJI_N5_CATEGORY_SLUGS,
        "vocab_n5",
        *VOCAB_N5_CATEGORY_SLUGS,
        "kanji_n4",
        *KANJI_N4_CATEGORY_SLUGS,
        "vocab_n4",
        "kanji_n3",
        *KANJI_N3_CATEGORY_SLUGS,
        "vocab_n3",
        "kanji_n2",
        *KANJI_N2_CATEGORY_SLUGS,
        "vocab_n2",
    ),
    "jlpt_n1_foundation": (
        "hiragana",
        "katakana",
        "kanji_n5",
        *KANJI_N5_CATEGORY_SLUGS,
        "vocab_n5",
        *VOCAB_N5_CATEGORY_SLUGS,
        "kanji_n4",
        *KANJI_N4_CATEGORY_SLUGS,
        "vocab_n4",
        "kanji_n3",
        *KANJI_N3_CATEGORY_SLUGS,
        "vocab_n3",
        "kanji_n2",
        *KANJI_N2_CATEGORY_SLUGS,
        "vocab_n2",
        "kanji_n1",
        *KANJI_N1_CATEGORY_SLUGS,
        "vocab_n1",
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
    freezes_available: int


@dataclass(frozen=True)
class CardNotePayload:
    note_key: str
    note_text: str
    created_at_utc: str
    updated_at_utc: str


@dataclass(frozen=True)
class CardNoteLookupPayload:
    note: CardNotePayload | None


@dataclass(frozen=True)
class CardNoteDeletePayload:
    note_key: str
    deleted: bool


def _card_note_payload(record: CardNoteRecord) -> CardNotePayload:
    return CardNotePayload(
        note_key=record.note_key,
        note_text=record.note_text,
        created_at_utc=record.created_at_utc,
        updated_at_utc=record.updated_at_utc,
    )


def load_card_note(note_key: str) -> dict[str, object]:
    """Load a personal note by its validated opaque identity."""
    record = CardNotesRepository().load(note_key)
    payload = CardNoteLookupPayload(
        note=_card_note_payload(record) if record is not None else None
    )
    return asdict(payload)


def save_card_note(note_key: str, note_text: str) -> dict[str, object]:
    """Create or replace a personal note and return its normalized payload."""
    record = CardNotesRepository().save(note_key, note_text)
    return asdict(_card_note_payload(record))


def delete_card_note(note_key: str) -> dict[str, object]:
    """Delete a personal note and report whether a row existed."""
    validated_key = validate_note_key(note_key)
    deleted = CardNotesRepository().delete(validated_key)
    return asdict(CardNoteDeletePayload(note_key=validated_key, deleted=deleted))


@dataclass(frozen=True)
class ScenarioSessionPayload:
    id: str
    scenario_id: str
    scenario_version: int
    learner_level: str
    started_at_utc: str
    completed_at_utc: str
    transcript: list[object]
    summary: dict[str, object]


@dataclass(frozen=True)
class ScenarioSessionListPayload:
    sessions: list[ScenarioSessionPayload]


@dataclass(frozen=True)
class ScenarioSessionLookupPayload:
    session: ScenarioSessionPayload | None


@dataclass(frozen=True)
class ScenarioSessionDeletePayload:
    id: str
    deleted: bool


@dataclass(frozen=True)
class ScenarioSessionsClearPayload:
    cleared: int


@dataclass(frozen=True)
class ScenarioSrsCardPayload:
    id: str
    session_id: str
    scenario_id: str
    front: str
    back: str
    reading: str
    notes: str
    created_at_utc: str


def _scenario_session_payload(record: ScenarioSessionRecord) -> ScenarioSessionPayload:
    return ScenarioSessionPayload(
        id=record.id,
        scenario_id=record.scenario_id,
        scenario_version=record.scenario_version,
        learner_level=record.learner_level,
        started_at_utc=record.started_at_utc,
        completed_at_utc=record.completed_at_utc,
        transcript=json.loads(record.transcript_json),
        summary=json.loads(record.summary_json),
    )


def _scenario_srs_card_payload(record: ScenarioSrsCardRecord) -> ScenarioSrsCardPayload:
    return ScenarioSrsCardPayload(
        id=record.id,
        session_id=record.session_id,
        scenario_id=record.scenario_id,
        front=record.front,
        back=record.back,
        reading=record.reading,
        notes=record.notes,
        created_at_utc=record.created_at_utc,
    )


def save_scenario_session(payload_path: str) -> dict[str, object]:
    """Persist a completed scenario session from a JSON file written by the
    Electron main process (large transcripts are handed off via a temp file,
    the same pattern used for OCR image payloads)."""
    with open(payload_path, "r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise ValueError("Scenario session payload must be a JSON object")
    record = ScenarioRepository().save_session(
        session_id=str(raw.get("session_id", "")),
        scenario_id=str(raw.get("scenario_id", "")),
        scenario_version=int(raw.get("scenario_version", 0)),
        learner_level=str(raw.get("learner_level", "")),
        started_at_utc=str(raw.get("started_at_utc", "")),
        transcript_json=json.dumps(raw.get("transcript", [])),
        summary_json=json.dumps(raw.get("summary", {})),
    )
    return asdict(_scenario_session_payload(record))


def list_scenario_sessions() -> dict[str, object]:
    """List completed scenario sessions, most recently completed first."""
    records = ScenarioRepository().list_sessions()
    return asdict(ScenarioSessionListPayload(
        sessions=[_scenario_session_payload(record) for record in records],
    ))


def get_scenario_session(session_id: str) -> dict[str, object]:
    """Look up one completed scenario session by id."""
    record = ScenarioRepository().get_session(session_id)
    payload = ScenarioSessionLookupPayload(
        session=_scenario_session_payload(record) if record is not None else None,
    )
    return asdict(payload)


def delete_scenario_session(session_id: str) -> dict[str, object]:
    """Delete one completed scenario session and its SRS drafts."""
    deleted = ScenarioRepository().delete_session(session_id)
    return asdict(ScenarioSessionDeletePayload(id=session_id, deleted=deleted))


def clear_scenario_sessions() -> dict[str, object]:
    """Delete every completed scenario session and SRS draft."""
    cleared = ScenarioRepository().clear_sessions()
    return asdict(ScenarioSessionsClearPayload(cleared=cleared))


def save_scenario_srs_card(payload_path: str) -> dict[str, object]:
    """Persist one learner-accepted SRS draft from a JSON file (same temp-file
    handoff pattern as save_scenario_session)."""
    with open(payload_path, "r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise ValueError("Scenario SRS card payload must be a JSON object")
    record = ScenarioRepository().save_srs_card(
        card_id=str(raw.get("id", "")),
        session_id=str(raw.get("session_id", "")),
        scenario_id=str(raw.get("scenario_id", "")),
        front=str(raw.get("front", "")),
        back=str(raw.get("back", "")),
        reading=str(raw.get("reading", "")),
        notes=str(raw.get("notes", "")),
    )
    return asdict(_scenario_srs_card_payload(record))


@dataclass(frozen=True)
class GameCard:
    id: int
    note_key: str
    character: str
    romaji: str
    meaning: str
    tags: list[str]
    example_sentence: str | None
    dictionary_summary: DictionaryCardSummary | None
    is_leech: bool
    curriculum_stage: int
    meaning_distractor_ids: list[int]
    character_distractor_ids: list[int]


@dataclass(frozen=True)
class OverviewCharacterCard:
    id: int
    note_key: str
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
    buckets_due: int
    buckets_leech: int
    buckets_new: int
    buckets_review: int


@dataclass(frozen=True)
class ProgressionNodeStatusPayload:
    node_id: str
    name: str
    category: str
    status: str
    mastered_ratio: float
    is_reachable: bool
    #: Items counted toward this node's mastery. Both zero when untracked.
    mastered_count: int = 0
    total_count: int = 0
    #: False when nothing in the backend can measure this node's progress, so
    #: the renderer shows no ratio at all rather than a 0% that reads as "you
    #: have done none of this". See _PROGRESSION_SYNC_DECK_SLUGS.
    is_tracked: bool = True


@dataclass(frozen=True)
class FeatureStatusPayload:
    feature_id: str
    name: str
    category: str
    is_unlocked: bool
    badges: tuple[str, ...] = ()


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


@dataclass(frozen=True)
class DailyGamesWordPayload:
    deck_slug: str
    deck_name: str
    card_id: int
    character: str
    romaji: str
    meaning: str
    source: str


@dataclass(frozen=True)
class DailyGamesPoolPayload:
    day: str
    algorithm_version: int
    words: list[DailyGamesWordPayload]
    game_seeds: dict[str, int]


@dataclass(frozen=True)
class DailyGamesStreakPayload:
    last_completed_day: str | None
    current_streak_days: int
    best_streak_days: int
    freezes_available: int
    freeze_month: str | None


@dataclass(frozen=True)
class DailyGamesAttemptOutcomePayload:
    pool_position: int
    outcome: str


@dataclass(frozen=True)
class DailyGamesAttemptPayload:
    attempt_id: int
    pool_day: str
    game_type: str
    mode: str
    score: int
    completed: bool
    duration_seconds: int | None
    completed_at_utc: str
    outcomes: list[DailyGamesAttemptOutcomePayload]


@dataclass(frozen=True)
class DailyGamesMissedWordPayload:
    word: DailyGamesWordPayload
    miss_count: int


@dataclass(frozen=True)
class DailyGamesProgressPayload:
    attempt_count: int
    completed_daily_game_types: list[str]
    missed_words: list[DailyGamesMissedWordPayload]


@dataclass(frozen=True)
class DailyGamesStatePayload:
    pool: DailyGamesPoolPayload
    streak: DailyGamesStreakPayload
    attempts: list[DailyGamesAttemptPayload]
    progress: DailyGamesProgressPayload


@dataclass(frozen=True)
class DailyGamesPracticeSeedPayload:
    pool_day: str
    game_type: str
    seed: int


_DAILY_GAME_TYPES = ("crossword", "word_search", "match_pairs", "typing_blitz")
_DAILY_GAME_MODES = ("daily", "practice")


def _parse_daily_games_day(value: str) -> date:
    """Parse the strict ISO local day used to identify a Daily Games pool."""
    if not isinstance(value, str) or re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is None:
        raise ValueError("pool_day must use YYYY-MM-DD format")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("pool_day must be a valid calendar date") from exc


def _require_daily_game_type(value: str) -> str:
    if value not in _DAILY_GAME_TYPES:
        raise ValueError("game_type must be one of: crossword, word_search, match_pairs, typing_blitz")
    return value


def _require_daily_game_mode(value: str) -> str:
    if value not in _DAILY_GAME_MODES:
        raise ValueError("mode must be daily or practice")
    return value


def _require_daily_games_nonnegative_int(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")
    return value


def _daily_games_word_payload(word: DailyGameWord) -> DailyGamesWordPayload:
    return DailyGamesWordPayload(
        deck_slug=word.deck_slug,
        deck_name=word.deck_name,
        card_id=word.card_id,
        character=word.character,
        romaji=word.romaji,
        meaning=word.meaning,
        source=word.source,
    )


def _daily_games_pool_payload(pool: DailyWordPool) -> DailyGamesPoolPayload:
    return DailyGamesPoolPayload(
        day=pool.day.isoformat(),
        algorithm_version=pool.algorithm_version,
        words=[_daily_games_word_payload(word) for word in pool.words],
        game_seeds={
            game_type: daily_game_seed(pool, game_type)
            for game_type in _DAILY_GAME_TYPES
        },
    )


def _daily_games_attempt_payload(attempt: DailyGameAttempt) -> DailyGamesAttemptPayload:
    if attempt.attempt_id is None:
        raise RuntimeError("Persisted Daily Games attempt has no id")
    return DailyGamesAttemptPayload(
        attempt_id=attempt.attempt_id,
        pool_day=attempt.pool_day.isoformat(),
        game_type=attempt.game_type,
        mode=attempt.mode,
        score=attempt.score,
        completed=attempt.completed,
        duration_seconds=attempt.duration_seconds,
        completed_at_utc=attempt.completed_at_utc.isoformat(),
        outcomes=[
            DailyGamesAttemptOutcomePayload(
                pool_position=outcome.pool_position,
                outcome=outcome.outcome,
            )
            for outcome in attempt.outcomes
        ],
    )


def _daily_games_candidates(repository: DailyGamesRepository) -> list[DailyGameWordCandidate]:
    """Join static vocabulary cards with persisted metadata for domain selection."""
    candidates: list[DailyGameWordCandidate] = []
    for deck_slug, factory in ALL_DECKS.items():
        if not deck_slug.startswith("vocab_"):
            continue
        deck = factory()
        metadata_by_card_id = repository.load_persisted_review_metadata(
            deck.name,
            [card.id for card in deck.cards],
        )
        for card in deck.cards:
            metadata = metadata_by_card_id.get(card.id)
            candidates.append(
                DailyGameWordCandidate(
                    deck_slug=deck_slug,
                    deck_name=deck.name,
                    card_id=card.id,
                    character=card.character,
                    romaji=card.romaji,
                    meaning=card.meaning,
                    has_persisted_state=metadata is not None,
                    repetitions=metadata.repetitions if metadata is not None else 0,
                    next_review=metadata.next_review if metadata is not None else None,
                    last_review=metadata.latest_review_date if metadata is not None else None,
                )
            )
    return candidates


def _ensure_daily_games_pool(pool_day: date, repository: DailyGamesRepository) -> DailyWordPool:
    saved_pool = repository.load_word_pool(pool_day)
    if saved_pool is not None:
        return saved_pool
    selected_pool = select_daily_word_pool(_daily_games_candidates(repository), pool_day)
    return repository.save_word_pool(selected_pool)


def _daily_games_state_payload(
    pool_day: date,
    repository: DailyGamesRepository,
) -> DailyGamesStatePayload:
    pool = _ensure_daily_games_pool(pool_day, repository)
    attempts = repository.load_attempts(pool_day)
    streak = _reconcile_daily_games_streak(repository)
    words_by_position = dict(enumerate(pool.words))
    miss_counts: dict[int, int] = {}
    for attempt in sorted(
        attempts,
        key=lambda saved_attempt: (
            saved_attempt.completed_at_utc,
            saved_attempt.attempt_id if saved_attempt.attempt_id is not None else -1,
        ),
    ):
        for outcome in attempt.outcomes:
            if outcome.outcome == "incorrect":
                miss_counts[outcome.pool_position] = miss_counts.get(outcome.pool_position, 0) + 1
            else:
                miss_counts.pop(outcome.pool_position, None)

    missed_words = [
        DailyGamesMissedWordPayload(
            word=_daily_games_word_payload(words_by_position[position]),
            miss_count=miss_counts[position],
        )
        for position in sorted(miss_counts)
        if position in words_by_position
    ]
    completed_daily_game_types = [
        game_type
        for game_type in _DAILY_GAME_TYPES
        if any(
            attempt.game_type == game_type and attempt.mode == "daily" and attempt.completed
            for attempt in attempts
        )
    ]
    return DailyGamesStatePayload(
        pool=_daily_games_pool_payload(pool),
        streak=DailyGamesStreakPayload(
            last_completed_day=(
                streak.last_completed_day.isoformat() if streak.last_completed_day else None
            ),
            current_streak_days=streak.current_streak_days,
            best_streak_days=streak.best_streak_days,
            freezes_available=streak.freezes_available,
            freeze_month=streak.freeze_month.isoformat() if streak.freeze_month else None,
        ),
        attempts=[_daily_games_attempt_payload(attempt) for attempt in attempts],
        progress=DailyGamesProgressPayload(
            attempt_count=len(attempts),
            completed_daily_game_types=completed_daily_game_types,
            missed_words=missed_words,
        ),
    )


def _reconcile_daily_games_streak(
    repository: DailyGamesRepository,
) -> DailyGamesStreakState:
    """Idempotently rebuild streak state from persisted completed daily days."""
    saved_streak = repository.load_streak_state()
    completed_days = sorted(
        {
            attempt.pool_day
            for attempt in repository.load_attempts()
            if attempt.mode == "daily" and attempt.completed
        }
    )
    reconciled = DailyGamesStreakState()
    for completed_day in completed_days:
        reconciled = apply_daily_game_completion(reconciled, completed_day)
    if reconciled != saved_streak:
        repository.save_streak_state(reconciled)
    return reconciled


def build_daily_games_state(pool_day_raw: str) -> dict[str, object]:
    """Get or create the immutable pool and current Daily Games-only progress."""
    pool_day = _parse_daily_games_day(pool_day_raw)
    return asdict(_daily_games_state_payload(pool_day, DailyGamesRepository()))


def build_daily_games_practice_seed(
    pool_day_raw: str,
    game_type: str,
) -> dict[str, object]:
    """Ensure the daily pool exists and return a fresh non-negative practice seed."""
    pool_day = _parse_daily_games_day(pool_day_raw)
    validated_game_type = _require_daily_game_type(game_type)
    repository = DailyGamesRepository()
    _ensure_daily_games_pool(pool_day, repository)
    return asdict(
        DailyGamesPracticeSeedPayload(
            pool_day=pool_day.isoformat(),
            game_type=validated_game_type,
            seed=secrets.randbelow(1 << 63),
        )
    )


def get_daily_games_crossword_clues(pool_day_raw: str) -> dict[str, object]:
    """Return accepted stable crossword clues for one persisted Daily Games pool."""
    pool_day = _parse_daily_games_day(pool_day_raw)
    clues = DailyGamesRepository().load_crossword_clues(pool_day)
    return {
        "day": pool_day.isoformat(),
        "clues": [
            {"pool_position": clue.pool_position, "clue": clue.clue}
            for clue in clues
        ],
    }


def save_daily_games_crossword_clues(
    pool_day_raw: str,
    clues: tuple[DailyCrosswordClue, ...],
) -> dict[str, object]:
    """Save accepted crossword clues without changing the pool or SRS data."""
    pool_day = _parse_daily_games_day(pool_day_raw)
    saved_clues = DailyGamesRepository().save_crossword_clues(pool_day, clues)
    return {
        "day": pool_day.isoformat(),
        "clues": [
            {"pool_position": clue.pool_position, "clue": clue.clue}
            for clue in saved_clues
        ],
    }


def record_daily_games_attempt(
    pool_day_raw: str,
    game_type: str,
    mode: str,
    score: int,
    completed: bool,
    duration_seconds: int | None,
    outcomes: tuple[DailyGameWordOutcome, ...],
) -> dict[str, object]:
    """Persist one Daily Games attempt without touching review, SRS, or XP data."""
    pool_day = _parse_daily_games_day(pool_day_raw)
    validated_game_type = _require_daily_game_type(game_type)
    validated_mode = _require_daily_game_mode(mode)
    _require_daily_games_nonnegative_int(score, "score")
    if not isinstance(completed, bool):
        raise ValueError("completed must be a boolean")
    if duration_seconds is not None:
        _require_daily_games_nonnegative_int(duration_seconds, "duration_seconds")
    if not isinstance(outcomes, tuple) or not outcomes:
        raise ValueError("outcomes must be a non-empty tuple")
    outcome_positions: set[int] = set()
    for outcome in outcomes:
        if not isinstance(outcome, DailyGameWordOutcome):
            raise ValueError("outcomes must contain DailyGameWordOutcome records")
        _require_daily_games_nonnegative_int(outcome.pool_position, "outcome.pool_position")
        if not isinstance(outcome.outcome, str) or outcome.outcome not in {
            "correct",
            "incorrect",
        }:
            raise ValueError("outcome.outcome must be correct or incorrect")
        if outcome.pool_position in outcome_positions:
            raise ValueError("outcomes must not repeat a pool position")
        outcome_positions.add(outcome.pool_position)

    repository = DailyGamesRepository()
    _ensure_daily_games_pool(pool_day, repository)
    repository.save_attempt_result(
        DailyGameAttempt(
            pool_day=pool_day,
            game_type=validated_game_type,
            mode=validated_mode,
            score=score,
            completed=completed,
            duration_seconds=duration_seconds,
            completed_at_utc=datetime.now(timezone.utc),
            outcomes=outcomes,
        )
    )
    return asdict(_daily_games_state_payload(pool_day, repository))


def _parse_daily_games_outcomes_json(raw: str) -> tuple[DailyGameWordOutcome, ...]:
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("outcomes_json must be valid JSON") from exc
    if not isinstance(decoded, list) or not decoded:
        raise ValueError("outcomes_json must decode to a non-empty array")

    outcomes: list[DailyGameWordOutcome] = []
    for index, item in enumerate(decoded):
        if not isinstance(item, dict) or set(item) != {"pool_position", "outcome"}:
            raise ValueError(
                f"outcomes_json entry {index} must contain only pool_position and outcome"
            )
        pool_position = _require_daily_games_nonnegative_int(
            item["pool_position"],
            f"outcomes_json entry {index}.pool_position",
        )
        outcome = item["outcome"]
        if not isinstance(outcome, str) or outcome not in {"correct", "incorrect"}:
            raise ValueError(
                f"outcomes_json entry {index}.outcome must be correct or incorrect"
            )
        outcomes.append(DailyGameWordOutcome(pool_position=pool_position, outcome=outcome))
    return tuple(outcomes)


def _parse_daily_games_crossword_clues_json(raw: str) -> tuple[DailyCrosswordClue, ...]:
    """Parse the strict IPC wire shape for accepted crossword clues."""
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("clues_json must be valid JSON") from exc
    if not isinstance(decoded, list) or not decoded:
        raise ValueError("clues_json must decode to a non-empty array")

    clues: list[DailyCrosswordClue] = []
    for index, item in enumerate(decoded):
        if not isinstance(item, dict) or set(item) != {"pool_position", "clue"}:
            raise ValueError(
                f"clues_json entry {index} must contain only pool_position and clue"
            )
        pool_position = _require_daily_games_nonnegative_int(
            item["pool_position"],
            f"clues_json entry {index}.pool_position",
        )
        clue = item["clue"]
        if not isinstance(clue, str):
            raise ValueError(f"clues_json entry {index}.clue must be a string")
        clues.append(DailyCrosswordClue(pool_position=pool_position, clue=clue))
    return tuple(clues)


HEAVY_DECK_ENRICHMENT_CARD_THRESHOLD = 800


def _lightweight_distractor_ids(
    card_ids: list[int],
    id_to_index: dict[int, int],
    target_id: int,
    *,
    limit: int,
) -> list[int]:
    """Return deterministic nearby ids in O(limit) for large-deck payloads."""
    total = len(card_ids)
    if total <= 1 or limit <= 0:
        return []

    start_index = id_to_index.get(target_id)
    if start_index is None:
        return []

    distractors: list[int] = []
    step = 1
    while len(distractors) < limit and step < total:
        candidate_id = card_ids[(start_index + step) % total]
        if candidate_id != target_id:
            distractors.append(candidate_id)
        step += 1
    return distractors


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
    minigame_perf = load_minigame_breakdown()
    session_history = load_session_history(limit=8)
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

    particle_cloze_summary = {**curriculum_context_cloze, "mode": "particle_cloze"}
    particle_cloze_by_script = {
        script_tag: {**summary, "mode": "particle_cloze"}
        for script_tag, summary in curriculum_by_script.items()
    }
    imposter_summary = {**narrative_story, "mode": "imposter"}
    imposter_by_script = {
        script_tag: {**summary, "mode": "imposter"}
        for script_tag, summary in narrative_story_by_script.items()
    }

    for slug, factory in ALL_DECKS.items():
        deck = factory()
        card_ids = [card.id for card in deck.cards]
        mastered_count, due_today, completed_today = load_deck_summary_counts(deck.name, card_ids)
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
                mastered=mastered_count,
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
                freezes_available=streak.freezes_available,
            )
        ),
        "activity": {
            "week": asdict(activity_week),
            "month": asdict(activity_month),
        },
        "mistakes": [asdict(item) for item in mistakes],
        "minigame_performance": [asdict(item) for item in minigame_perf],
        "session_history": [asdict(item) for item in session_history],
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
            "particle_cloze": particle_cloze_summary,
            "particle_cloze_by_script": particle_cloze_by_script,
            "imposter": imposter_summary,
            "imposter_by_script": imposter_by_script,
        },
    }


def build_deck_cards(slug: str) -> dict[str, object]:
    init_study_db()
    factory = ALL_DECKS.get(slug)
    if factory is None:
        raise ValueError(f"Unknown deck slug: {slug}")

    deck = factory()
    active_leech_ids = load_active_leech_card_ids(deck.name)
    card_ids = [card.id for card in deck.cards]
    curriculum_stages = load_curriculum_stages(deck.name, "context_cloze", card_ids)
    use_lightweight_enrichment = (
        slug == "sentence_examples" or len(deck.cards) > HEAVY_DECK_ENRICHMENT_CARD_THRESHOLD
    )
    id_to_index = {card_id: index for index, card_id in enumerate(card_ids)}

    enrichment_session = (
        nullcontext(None) if use_lightweight_enrichment else open_enrichment_session()
    )
    with enrichment_session as lookup_dictionary_summary:
        cards = [
            GameCard(
                id=card.id,
                note_key=build_builtin_note_key(card.character, card.romaji),
                character=card.character,
                romaji=card.romaji,
                meaning=card.meaning,
                tags=card.tags,
                example_sentence=card.example_sentence,
                dictionary_summary=(
                    None
                    if lookup_dictionary_summary is None
                    else lookup_dictionary_summary(
                        character=card.character,
                        meaning=card.meaning,
                        tags=card.tags,
                    )
                ),
                is_leech=card.id in active_leech_ids,
                curriculum_stage=curriculum_stages.get(card.id, 1),
                meaning_distractor_ids=(
                    _lightweight_distractor_ids(card_ids, id_to_index, card.id, limit=8)
                    if use_lightweight_enrichment
                    else rank_distractor_ids(deck.cards, card, mode="meaning")[:8]
                ),
                character_distractor_ids=(
                    _lightweight_distractor_ids(card_ids, id_to_index, card.id, limit=8)
                    if use_lightweight_enrichment
                    else rank_distractor_ids(deck.cards, card, mode="character")[:8]
                ),
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
                note_key=build_builtin_note_key(card.character, card.romaji),
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
    set_setting("onboarding_complete", "0")
    return {"ok": True}


def complete_onboarding_handler(
    goal: str | None = None,
    daily_minutes: str | None = None,
    target_level: str | None = None,
) -> dict[str, object]:
    """Mark onboarding complete and persist optional preference answers."""
    init_study_db()
    if goal:
        set_setting("onboarding_goal", goal)
    if daily_minutes:
        set_setting("onboarding_daily_minutes", daily_minutes)
    if target_level:
        set_setting("onboarding_target_level", target_level)
    set_setting("onboarding_complete", "1")
    return build_learning_path_status_payload()


def mark_onboarding_pending_handler() -> dict[str, object]:
    """Mark onboarding as pending while preserving all existing study data."""
    init_study_db()
    set_setting("onboarding_complete", "0")
    return build_learning_path_status_payload()


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
# Learning path bridge helpers
# ---------------------------------------------------------------------------

def build_learning_path_status_payload() -> dict[str, object]:
    """Return the learner's readiness across the curriculum.

    There is one curriculum and it is derived from ``JPLEARN_GRAPH``, so nothing
    is selected here any more — the ``active_learning_path`` setting and the
    ``set-learning-path`` command went with issue #78 Phase 5.
    """
    init_study_db()
    onboarding_raw = get_setting("onboarding_complete")
    onboarding_complete = onboarding_raw == "1"
    prog_state = _load_progression_state()
    status = build_learning_path_status(
        onboarding_complete=onboarding_complete,
        state=prog_state,
    )
    return {
        "onboarding_complete": status.onboarding_complete,
        "suggested_next": status.suggested_next,
        "steps": [
            {
                "section_id": step.section_id,
                "label": step.label,
                "readiness": step.readiness,
                "mastery_pct": round(step.mastery_pct, 3),
            }
            for step in status.steps
        ],
    }


# ---------------------------------------------------------------------------
# Progression sync
# ---------------------------------------------------------------------------
#
# A node is synced only when something in the backend can actually measure it.
#
# Every node below is backed by a deck, so "mastered" means the same thing
# everywhere: cards answered correctly at least once, the definition
# build_block_progress() already uses.
#
# The other nine nodes (scripted_conv, listening, free_conv, reading,
# jlpt_n5..jlpt_n1) are deliberately *not* here. A signal exists for some of
# them — `review_events.tags_csv` records `minigame,<key>`, `scenario_sessions`
# records conversation runs, `jlpt_exam_results` records mock exams — but none
# of them carries a defensible denominator. There is no answer to "listening is
# N of how many?", and inventing one renders a progress bar derived from
# nothing, which is worse than showing no progress: a wrong number cannot be
# recognised as wrong. They report `is_tracked=False` and no ratio instead.
_PROGRESSION_SYNC_DECK_SLUGS: dict[str, str] = {
    "hiragana": "hiragana",
    "katakana": "katakana",
    "vocabulary_n5": "vocab_n5",
    "grammar_n5": "grammar_patterns",
    # An omission rather than a decision — kanji_n5 has had a deck all along,
    # and its 0.8-of-99 requirement is a gate a learner actually reaches.
    "kanji_n5": "kanji_n5",
}

# `sentence_examples` is deliberately absent despite having a deck: this module
# replaces it with the full 60,000-sentence corpus (see
# `_sentence_examples_deck_factory` above, and `limitRuntimeDeckCards` on the
# renderer side, which caps what a session draws from). Its node asks for 80%
# mastery, which against 60,000 sentences is not a threshold anyone crosses.
# A denominator that large is the same failure as no denominator at all.

_PROGRESSION_SYNC_ORDER: tuple[str, ...] = ("tutorial", *_PROGRESSION_SYNC_DECK_SLUGS)

#: Nodes the graph defines but nothing can measure yet.
UNTRACKED_PROGRESSION_NODES: frozenset[str] = frozenset(
    node_id for node_id in JPLEARN_GRAPH.nodes if node_id not in _PROGRESSION_SYNC_ORDER
)


def _tutorial_is_complete() -> bool:
    """Whether the learner is past the tutorial.

    Onboarding is skippable, so the stored flag alone would strand anyone who
    skipped it behind a locked tutorial — and because every other node chains
    off this one, that locks the entire curriculum for someone who has been
    studying for months.

    Existing review *states* are therefore also accepted as proof. Deliberately
    not review *events*: a seeded development database carries thousands of
    those, which would mark the tutorial complete on a fresh install.
    """
    if get_setting("onboarding_complete") == "1":
        return True
    # Counted, not merely fetched: `load_review_states` fabricates a default
    # state for cards that have never been seen, so a non-empty result proves
    # nothing. `repetitions > 0` is the same "has actually been studied" test
    # node mastery uses.
    return any(
        _compute_node_mastery_counts(node_id)[0] > 0
        for node_id in _PROGRESSION_SYNC_DECK_SLUGS
    )


def _compute_node_mastery_counts(node_id: str) -> tuple[int, int]:
    """Return (mastered_count, total_count) for one synced progression node.

    A card counts as mastered once it has been answered correctly at least
    once (repetitions > 0) — the same definition already used for block
    mastery in build_block_progress().
    """
    if node_id == "tutorial":
        return (1, 1) if _tutorial_is_complete() else (0, 1)

    slug = _PROGRESSION_SYNC_DECK_SLUGS[node_id]
    deck = ALL_DECKS[slug]()
    card_ids = [card.id for card in deck.cards]
    states = load_review_states(deck.name, card_ids)
    mastered = sum(1 for cid in card_ids if getattr(states.get(cid), "repetitions", 0) > 0)
    return mastered, len(card_ids)


def sync_progression_state() -> tuple[ProgressionState, tuple[ProgressionEvent, ...]]:
    """Recompute mastery for the synced nodes and persist any transitions.

    Follows the same recompute-on-read convention as build_feature_unlock_status:
    reload stored state, re-evaluate against current data, persist any newly
    reached transitions, and return the resulting state plus emitted events.
    """
    init_study_db()
    state = _load_progression_state()
    today = date.today()
    all_events: list[ProgressionEvent] = []
    for node_id in _PROGRESSION_SYNC_ORDER:
        mastered_count, total_count = _compute_node_mastery_counts(node_id)
        state, events = record_mastery(JPLEARN_GRAPH, state, node_id, mastered_count, total_count, today)
        all_events.extend(events)

    for node_id in _PROGRESSION_SYNC_ORDER:
        ns = state.node_states[node_id]
        upsert_progression_node(
            node_id=ns.node_id,
            status=ns.status,
            mastered_item_count=ns.mastered_item_count,
            total_item_count=ns.total_item_count,
            first_activated_at=ns.first_activated_date.isoformat() if ns.first_activated_date else None,
            mastered_at=ns.mastered_date.isoformat() if ns.mastered_date else None,
        )

    return state, tuple(all_events)


# ---------------------------------------------------------------------------
# New bridge commands
# ---------------------------------------------------------------------------


def build_progression_status() -> dict[str, object]:
    """Return the learner's current progression state for all nodes."""
    init_study_db()
    prog_state, _events = sync_progression_state()
    reachable = reachable_nodes(JPLEARN_GRAPH, prog_state)
    result = []
    for node_id, node in JPLEARN_GRAPH.nodes.items():
        ns = prog_state.node_states.get(node_id)
        tracked = node_id not in UNTRACKED_PROGRESSION_NODES
        status = ns.status if ns else "locked"
        mastered_count = ns.mastered_item_count if ns and tracked else 0
        total_count = ns.total_item_count if ns and tracked else 0
        mastered_ratio = mastered_count / total_count if total_count > 0 else 0.0
        result.append(
            asdict(
                ProgressionNodeStatusPayload(
                    node_id=node_id,
                    name=node.name,
                    category=node.category,
                    status=status,
                    mastered_ratio=round(mastered_ratio, 3),
                    is_reachable=node_id in reachable,
                    mastered_count=mastered_count,
                    total_count=total_count,
                    is_tracked=tracked,
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
    today = __import__("datetime").date.today()
    feat_state, events = evaluate_features(JPLEARN_FEATURES, prog_state, feat_state, today)
    # Persist any newly unlocked features and badge rewards
    now = _NOW_UTC()
    for ev in events:
        save_feature_unlock(ev.feature_id, now)
        for reward in ev.unlock.rewards:
            if reward.reward_type == "badge":
                save_badge(reward.descriptor, now)
    result = []
    for feat in JPLEARN_FEATURES:
        badge_descriptors = tuple(
            r.descriptor for r in feat.unlock.rewards if r.reward_type == "badge"
        )
        result.append(
            asdict(
                FeatureStatusPayload(
                    feature_id=feat.feature_id,
                    name=feat.name,
                    category=feat.category,
                    is_unlocked=feat_state.statuses.get(feat.feature_id) == "unlocked",
                    badges=badge_descriptors,
                )
            )
        )
    return {"features": result}


def build_achievement_milestones_status() -> dict[str, object]:
    """Return review-count, streak, and node-mastery achievement badges.

    Backfills any already-earned badge (review/streak thresholds already
    crossed, progression nodes already mastered) so this is safe to call
    fresh on every load, matching build_feature_unlock_status's convention.
    """
    init_study_db()
    total_reviews = count_total_reviews()
    best_streak_days = load_streak_state().best_streak_days
    now = _NOW_UTC()

    for descriptor in earned_review_milestones(total_reviews):
        save_badge(descriptor, now)
    for descriptor in earned_streak_milestones(best_streak_days):
        save_badge(descriptor, now)

    prog_state, _events = sync_progression_state()
    for node_id in _PROGRESSION_SYNC_ORDER:
        ns = prog_state.node_states.get(node_id)
        if ns is None or ns.status != "mastered":
            continue
        for reward in JPLEARN_GRAPH.nodes[node_id].rewards:
            if reward.reward_type == "milestone":
                save_badge(reward.descriptor, now)

    earned_badges = load_badges()

    node_mastery_badges = [
        {
            "descriptor": reward.descriptor,
            "node_id": node_id,
            "earned": reward.descriptor in earned_badges,
        }
        for node_id, node in JPLEARN_GRAPH.nodes.items()
        for reward in node.rewards
        if reward.reward_type == "milestone"
    ]

    return {
        "total_reviews": total_reviews,
        "best_streak_days": best_streak_days,
        "milestones": [
            {
                "descriptor": milestone_descriptor(threshold),
                "threshold": threshold,
                "earned": milestone_descriptor(threshold) in earned_badges,
            }
            for threshold in REVIEW_COUNT_MILESTONES
        ],
        "streak_milestones": [
            {
                "descriptor": streak_milestone_descriptor(threshold),
                "threshold": threshold,
                "earned": streak_milestone_descriptor(threshold) in earned_badges,
            }
            for threshold in STREAK_MILESTONES
        ],
        "node_mastery_badges": node_mastery_badges,
    }


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
    from datetime import date as _date
    from datetime import timedelta as _timedelta

    state = ReviewState(card_id=card_id)
    # The app treats mastered as repetitions >= 3 and interval >= 21.
    # FSRS only grows stability when time has actually elapsed since the last
    # review, so backdate last_review to simulate reviewing on the due date
    # each time; four successful reviews reaches interval >= 21 this way.
    for _ in range(4):
        state = update(state, quality=4)
        state.last_review = _date.today() - _timedelta(days=state.interval)
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


_CARD_MASTERY_REPOSITORY: CardMasteryRepository | None = None


def _card_mastery_repository() -> CardMasteryRepository:
    """Return a process-wide mastery repository.

    Cached rather than constructed per call because ``__init__`` runs the schema
    migration check and this sits on the answer path, which the long-lived bridge
    worker hits once per review.
    """
    global _CARD_MASTERY_REPOSITORY
    if _CARD_MASTERY_REPOSITORY is None:
        _CARD_MASTERY_REPOSITORY = CardMasteryRepository()
    return _CARD_MASTERY_REPOSITORY


@dataclass
class CardMasteryScoresPayload:
    """Every stored per-card mastery counter, grouped by deck slug.

    Rows exist only for cards that have been answered or seeded, so this is far
    smaller than the card corpus and cheap to send in one call.
    """

    scores: dict[str, dict[int, int]]


@dataclass
class CardMasteryImportPayload:
    """Outcome of adopting legacy renderer mastery counters (issue #66)."""

    imported: bool
    cards_imported: int
    cards_unresolved: int
    decks_written: int


# Which deck slugs each legacy `ScriptKey` bucket covered. The kanji and vocab
# sections fanned out across every level and category deck, which is why all
# N5–N1 kanji scores shared one bucket (findings A3/A4).
_LEGACY_SECTION_PREFIXES: dict[str, tuple[str, ...]] = {
    "hiragana": ("hiragana",),
    "katakana": ("katakana",),
    "grammar_patterns": ("grammar_patterns",),
    "sentence_examples": ("sentence_examples",),
    "kanji_n5": ("kanji_",),
    "vocab_n5": ("vocab_",),
}


def build_card_mastery_scores() -> dict[str, object]:
    """Return all per-card mastery counters for the renderer to hydrate from."""
    init_study_db()
    payload = CardMasteryScoresPayload(scores=_card_mastery_repository().load_all_scores())
    return asdict(payload)


def _slugs_for_legacy_section(section: str) -> list[str]:
    prefixes = _LEGACY_SECTION_PREFIXES.get(section)
    if prefixes is None:
        return []
    return [
        slug
        for slug in ALL_DECKS
        if any(slug == prefix or slug.startswith(prefix) for prefix in prefixes)
    ]


def import_legacy_card_scores(legacy_scores: dict[str, dict[str, int]]) -> dict[str, object]:
    """Adopt renderer-held mastery counters into SQLite, once (issue #66).

    The counter cannot be recomputed from FSRS state (see ``domain/mastery.py``),
    so an existing learner's visible mastery only survives the move if it is
    imported. Skipping this would zero every bar — the exact failure the issue was
    filed about.

    Legacy data was keyed by ``ScriptKey`` section, and a section spans many decks,
    so each card id has to be resolved to its owning deck. Only Python knows that
    mapping, which is why the import runs here rather than in the renderer.

    Adopting is gated on the table being empty, so replaying the import can never
    overwrite progress recorded since.

    Args:
        legacy_scores: ``section → {card_id → score}`` as held in localStorage.
    """
    init_study_db()
    repository = _card_mastery_repository()
    if repository.has_any_scores():
        return asdict(
            CardMasteryImportPayload(
                imported=False, cards_imported=0, cards_unresolved=0, decks_written=0
            )
        )

    by_deck: dict[str, dict[int, int]] = {}
    unresolved = 0
    for section, entries in legacy_scores.items():
        if not isinstance(entries, dict):
            continue
        card_to_slug: dict[int, str] = {}
        for slug in _slugs_for_legacy_section(section):
            factory = ALL_DECKS.get(slug)
            if factory is None:
                continue
            for card in factory().cards:
                # First writer wins. Ids are disjoint by hand-allocation, so a
                # collision here means the id ranges in domain/decks.py have
                # overlapped — see finding A1.
                card_to_slug.setdefault(card.id, slug)
        for raw_card_id, raw_score in entries.items():
            try:
                card_id = int(raw_card_id)
                score = int(raw_score)
            except (TypeError, ValueError):
                unresolved += 1
                continue
            slug = card_to_slug.get(card_id)
            if slug is None:
                unresolved += 1
                continue
            by_deck.setdefault(slug, {})[card_id] = score

    cards_imported = sum(
        repository.set_deck_scores(slug, scores) for slug, scores in by_deck.items()
    )
    return asdict(
        CardMasteryImportPayload(
            imported=True,
            cards_imported=cards_imported,
            cards_unresolved=unresolved,
            decks_written=len(by_deck),
        )
    )


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

    previous_best_streak = load_streak_state().best_streak_days

    deck = factory()
    matching_card = next((card for card in deck.cards if card.id == card_id), None)
    if matching_card is None:
        raise ValueError(f"Unknown card id {card_id} for deck slug: {slug}")

    normalized_minigame = minigame.strip().lower()
    stage_mode = (
        "context_cloze"
        if normalized_minigame in {"particle_cloze", "imposter"}
        else normalized_minigame
    )
    normalized_stage = None if curriculum_stage is None else max(1, min(3, curriculum_stage))
    tags = [tag for tag in ["minigame", normalized_minigame] if tag]
    if normalized_minigame == "imposter" and normalized_stage is not None:
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

    # Step the per-card mastery counter on the same call that persisted the review
    # (issue #66). It rides here rather than in its own command because the bridge
    # is strictly serial — a second round-trip would cost latency on every answer,
    # and a counter written independently of the review is the drift the issue is
    # about. The new value goes back in the payload so the renderer displays stored
    # state instead of recomputing its own.
    mastery_score = _card_mastery_repository().apply_result(slug, card_id, is_correct=is_correct)

    # review_minigame_result() above logs exactly one review_events row, so
    # the pre-review total is always one less than the post-review total.
    total_reviews_after = count_total_reviews()
    new_best_streak = load_streak_state().best_streak_days
    milestones_reached = list(
        newly_crossed_review_milestones(total_reviews_after - 1, total_reviews_after)
    ) + list(
        newly_crossed_streak_milestones(previous_best_streak, new_best_streak)
    )
    for descriptor in milestones_reached:
        save_badge(descriptor, _NOW_UTC())

    return {
        "ok": True,
        "card_id": updated_state.card_id,
        "repetitions": updated_state.repetitions,
        "interval": updated_state.interval,
        "next_review": updated_state.next_review.isoformat(),
        "ease_factor": updated_state.ease_factor,
        "mastery_score": mastery_score,
        "confidence_score": None if confidence_score is None else max(1, min(5, int(confidence_score))),
        "curriculum_stage": load_curriculum_stages(deck.name, stage_mode, [card_id]).get(card_id, 1)
        if stage_mode
        else None,
        "xp_gained": xp_gained,
        "level_before": level_before,
        "level_after": level_after,
        "milestones_reached": milestones_reached,
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


def build_daily_goal() -> dict[str, object]:
    init_study_db()
    onboarding_minutes_raw = get_setting("onboarding_daily_minutes")
    onboarding_minutes = int(onboarding_minutes_raw) if onboarding_minutes_raw else None

    explicit_goal_raw = get_setting("daily_goal_items")
    target = int(explicit_goal_raw) if explicit_goal_raw else default_card_target(onboarding_minutes)

    daily_counts = load_daily_counts(1)
    today_count = daily_counts[0].count if daily_counts else 0

    goal = DailyGoal(target_items=target, current_items=today_count)
    return {
        "target": goal.target_items,
        "current": goal.current_items,
        "goal_met": goal.goal_met,
        "presets": list(PRESET_CARD_GOALS),
    }


def build_word_of_the_day() -> dict[str, object]:
    """Return the Word of the Day payload from a suitable vocab deck."""
    init_study_db()
    from datetime import date as _date
    today = _date.today()
    # Try vocab decks from N5 up; fall back to any deck with content.
    candidate_slugs = ["vocab_n5", "vocab_n4", "hiragana", "vocab_n3"]
    for slug in candidate_slugs:
        factory = ALL_DECKS.get(slug)
        if factory is None:
            continue
        deck = factory()
        if not deck.cards:
            continue
        card_ids = [card.id for card in deck.cards]
        states = load_review_states(deck.name, card_ids)
        result = select_word_of_the_day(deck.cards, states, deck.name, today)
        if result is not None:
            return asdict(result)
    return {"character": "", "romaji": "", "meaning": "", "deck_name": "", "reason": "", "example_sentence": None}


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
    game_miss_card_ids = DailyGamesRepository().load_active_game_miss_card_ids(
        deck.name,
        date.today(),
    )

    queue_card_ids, queue_buckets = build_study_queue(
        card_ids=card_ids,
        due_card_ids=due_card_ids,
        leech_card_ids=leech_card_ids,
        new_card_ids=new_card_ids,
        game_miss_card_ids=game_miss_card_ids,
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
                buckets_due=len(queue_buckets.due),
                buckets_leech=len(queue_buckets.leech),
                buckets_new=len(queue_buckets.new),
                buckets_review=len(queue_buckets.review),
            )
        ),
    }


def build_grammar_minigame_data(
    game_type: str,
    sentence: str | None = None,
    *,
    seed: int = 0,
) -> dict[str, object]:
    """Generate grammar minigame data payloads from sentence examples or input."""
    normalized_type = game_type.strip().lower()
    if normalized_type not in {
        "sentence_assembly",
        "particle_cloze",
        "vibe_check",
        "imposter",
    }:
        raise ValueError(f"Unsupported grammar minigame type: {game_type}")

    normalized_sentence = (sentence or "").strip()
    if not normalized_sentence:
        rows = _load_sentence_examples_rows()
        if not rows:
            raise ValueError("No sentence examples available for grammar minigames")
        selected = rows[seed % len(rows)]
        normalized_sentence = selected[0]

    if normalized_type == "sentence_assembly":
        payload = generate_assembly_data(normalized_sentence, seed=seed)
    elif normalized_type == "particle_cloze":
        payload = generate_particle_cloze_data(normalized_sentence, seed=seed)
    elif normalized_type == "vibe_check":
        payload = generate_vibe_check_data(normalized_sentence)
    else:
        payload = generate_imposter_data(normalized_sentence, seed=seed)

    return {
        "ok": True,
        "game_type": normalized_type,
        "sentence": normalized_sentence,
        "seed": seed,
        "data": payload,
    }


def build_conjugation_drill_data(
    word: str,
    *,
    stage: int = 1,
    seed: int = 0,
) -> dict[str, object]:
    """Generate one conjugation drill round for a dictionary-form word.

    Raises ``ValueError`` for anything not confidently conjugatable; the
    renderer treats that as "use a different minigame for this card".
    """
    payload = generate_conjugation_drill_data(word, stage=stage, seed=seed)
    return {
        "ok": True,
        "game_type": payload.game_type,
        "seed": seed,
        "data": asdict(payload),
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


def get_assistant_chat_context_v2(session_id: str | None = None, user_message: str | None = None) -> dict[str, object]:
    init_study_db()
    embed_fn = _resolve_real_embed_fn()
    return {
        "ok": True,
        "context": assemble_assistant_chat_context_v2_with_embeddings(
            session_id=session_id, user_message=user_message, embed_fn=embed_fn
        ),
    }


def _read_active_chatbot_tier() -> str | None:
    """Read the tutor tier selected via Setup/Settings (see setup_runtime.cjs
    setActiveModelTier), if any. Returns None in dev/test environments where
    no Electron-managed model selection exists yet.
    """
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    base = Path(docs_dir) if docs_dir else PROJECT_ROOT
    state_path = base / "models" / "active-model.json"
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    tier = payload.get("tier") if isinstance(payload, dict) else None
    return tier if isinstance(tier, str) else None


def _resolve_real_embed_fn():
    """Best-effort: use the real ONNX embedder mapped to the active chatbot
    tier if onnxruntime/tokenizers and the model files are installed;
    otherwise return None so callers fall back to the dependency-free hashed
    embedder in domain.retrieval.
    """
    try:
        import embedder_runtime
    except ImportError:
        return None

    active_tier = _read_active_chatbot_tier()
    if not active_tier:
        return None
    embedder_tier = embedder_runtime.resolve_embedder_tier_for_chatbot_tier(active_tier)
    if not embedder_tier or not embedder_runtime.is_available(embedder_tier):
        return None

    def _embed(text: str) -> list[float]:
        return embedder_runtime.encode_text(text, embedder_tier)

    return _embed


def _resolve_dictionary_semantic_embedder() -> Callable[[str, list[str]], list[float]] | None:
    """Resolve the real ONNX embedder for dictionary reranking, if installed.

    Returns None when unavailable so callers fall back to the dependency-free
    hashed embedder that is dictionary_repository's own default.
    """
    try:
        import embedder_runtime
    except ImportError:
        return None

    active_tier = _read_active_chatbot_tier()
    if not active_tier:
        return None
    embedder_tier = embedder_runtime.resolve_embedder_tier_for_chatbot_tier(active_tier)
    if not embedder_tier or not embedder_runtime.is_available(embedder_tier):
        return None

    from domain.retrieval import cosine_similarity

    def _score_with_real_embedder(query: str, candidates: list[str]) -> list[float]:
        if not candidates:
            return []
        query_vector = embedder_runtime.encode_text(query, embedder_tier, is_query=True)
        candidate_vectors = embedder_runtime.encode_texts(candidates, embedder_tier, is_query=False)
        return [cosine_similarity(query_vector, vector) for vector in candidate_vectors]

    return _score_with_real_embedder


# ---------------------------------------------------------------------------
# JLPT preparation commands
# ---------------------------------------------------------------------------

_VALID_JLPT_LEVELS = frozenset(LEVEL_ORDER)
_VALID_JLPT_MODES: frozenset[str] = frozenset(
    ["mock_exam", "diagnostic", "adaptive_review", "weak_area_drill"]
)


def build_jlpt_readiness_payload() -> dict[str, object]:
    """Return readiness report for all 5 JLPT levels."""
    init_study_db()
    states_by_deck: dict[str, dict[int, object]] = {}
    for level_key in LEVEL_ORDER:
        spec = JLPT_LEVEL_SPECS[level_key]
        for deck_name in (spec.vocab_deck, spec.kanji_deck):
            factory = ALL_DECKS.get(deck_name)
            if factory is None:
                states_by_deck[deck_name] = {}
                continue
            deck = factory()
            card_ids = [card.id for card in deck.cards]
            states_by_deck[deck_name] = load_review_states(deck.name, card_ids)

    report = compute_readiness_report(states_by_deck)  # type: ignore[arg-type]
    return {
        "recommended_target": report.recommended_target,
        "levels": {
            key: {
                "level": lr.level,
                "mastered_vocab": lr.mastered_vocab,
                "total_vocab": lr.total_vocab,
                "mastered_kanji": lr.mastered_kanji,
                "total_kanji": lr.total_kanji,
                "readiness_pct": lr.readiness_pct,
                "is_ready": lr.is_ready,
                "pass_mark": JLPT_LEVEL_SPECS[key].pass_mark,
                "vocab_grammar_section_max": JLPT_LEVEL_SPECS[key].vocab_grammar_section_max,
                "vocab_grammar_pass_mark": JLPT_LEVEL_SPECS[key].vocab_grammar_pass_mark,
            }
            for key, lr in report.levels.items()
        },
    }


def build_jlpt_exam_queue_payload(
    level: str, mode: str, count: int
) -> dict[str, object]:
    """Return an enriched exam question queue for the given level and mode."""
    init_study_db()

    # Load cards for both decks of this level (or all levels for diagnostic)
    target_levels = list(LEVEL_ORDER) if mode == "diagnostic" else [level]
    cards_by_deck: dict[str, list] = {}
    states_by_deck: dict[str, dict[int, object]] = {}
    leech_ids_by_deck: dict[str, set[int]] = {}

    for lv in target_levels:
        spec = JLPT_LEVEL_SPECS[lv]
        for deck_name in (spec.vocab_deck, spec.kanji_deck):
            factory = ALL_DECKS.get(deck_name)
            if factory is None:
                cards_by_deck[deck_name] = []
                states_by_deck[deck_name] = {}
                leech_ids_by_deck[deck_name] = set()
                continue
            deck = factory()
            card_ids = [card.id for card in deck.cards]
            cards_by_deck[deck_name] = deck.cards
            states_by_deck[deck_name] = load_review_states(deck.name, card_ids)
            if mode in ("weak_area_drill",):
                leech_ids_by_deck[deck_name] = load_active_leech_card_ids(deck.name)

    # Load accuracy map for modes that need it
    accuracy_map: dict[tuple[str, int], float] = {}
    if mode in ("mock_exam", "weak_area_drill"):
        all_deck_names = list(cards_by_deck.keys())
        accuracy_map = load_card_accuracy_map(all_deck_names)

    # Build queue
    if mode == "mock_exam":
        queue = build_mock_exam_queue(level, cards_by_deck, accuracy_map, count)
    elif mode == "diagnostic":
        queue = build_diagnostic_queue(cards_by_deck, states_by_deck)  # type: ignore[arg-type]
    elif mode == "adaptive_review":
        queue = build_adaptive_review_queue(level, cards_by_deck, states_by_deck, count=count)  # type: ignore[arg-type]
    else:  # weak_area_drill
        queue = build_weak_area_queue(level, cards_by_deck, leech_ids_by_deck, accuracy_map, count)

    # Enrich each question with card data and meaning distractors
    card_lookup: dict[tuple[str, int], object] = {}
    distractor_pool_by_deck: dict[str, list] = {}
    for deck_name, cards in cards_by_deck.items():
        distractor_pool_by_deck[deck_name] = cards
        for card in cards:
            card_lookup[(deck_name, card.id)] = card

    enriched: list[dict[str, object]] = []
    for q in queue:
        card = card_lookup.get((q.deck, q.card_id))
        if card is None:
            continue
        pool = distractor_pool_by_deck.get(q.deck, [])
        distractor_ids = rank_distractor_ids(pool, card, mode="meaning")[:3]
        distractor_cards = [c for c in pool if c.id in distractor_ids]
        enriched.append({
            "card_id": q.card_id,
            "deck": q.deck,
            "question_type": q.question_type,
            "level": q.level,
            "card": {
                "id": card.id,
                "character": card.character,
                "romaji": card.romaji,
                "meaning": card.meaning,
                "tags": card.tags,
                "example_sentence": card.example_sentence,
            },
            "distractor_meanings": [c.meaning for c in distractor_cards],
            "distractor_card_ids": distractor_ids,
        })

    return {"level": level, "mode": mode, "questions": enriched}


CommandHandler = Callable[[list[str]], tuple[int, dict[str, object]]]


def _cmd_summary(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_summary()


def _cmd_daily_activity(argv: list[str]) -> tuple[int, dict[str, object]]:
    days = int(argv[1]) if len(argv) > 1 else 365
    try:
        from dataclasses import asdict
        counts = load_daily_counts(days)
        return 0, {"ok": True, "days": [asdict(c) for c in counts]}
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_deck_cards(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Missing deck slug"}
    slug = argv[1]
    try:
        return 0, build_deck_cards(slug)
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_block_progress(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Missing deck slug"}
    slug = argv[1]
    try:
        return 0, build_block_progress(slug)
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_overview_character_mastery(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_overview_character_mastery()


def _cmd_reset_db(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, reset_progress()


def _cmd_record_result(argv: list[str]) -> tuple[int, dict[str, object]]:
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


def _cmd_card_scores(argv: list[str]) -> tuple[int, dict[str, object]]:
    del argv
    return 0, build_card_mastery_scores()


def _cmd_import_card_scores(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: import-card-scores <legacy_scores_json>"}
    try:
        parsed = json.loads(argv[1])
    except (TypeError, ValueError) as exc:
        return 2, {"error": f"Invalid legacy scores JSON: {exc}"}
    if not isinstance(parsed, dict):
        return 2, {"error": "Legacy scores JSON must be an object keyed by section"}
    return 0, import_legacy_card_scores(parsed)


def _cmd_session_start(argv: list[str]) -> tuple[int, dict[str, object]]:
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


def _cmd_session_summary(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: session-summary <session_id>"}
    return 0, get_session_goal_summary(argv[1])


def _cmd_daily_goal(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_daily_goal()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_games_state(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: daily-games-state <YYYY-MM-DD>"}
    try:
        return 0, build_daily_games_state(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_games_practice_seed(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 3:
        return 2, {
            "error": "Usage: daily-games-practice-seed <YYYY-MM-DD> <game_type>"
        }
    try:
        return 0, build_daily_games_practice_seed(argv[1], argv[2])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_games_crossword_clues(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: daily-games-crossword-clues <YYYY-MM-DD>"}
    try:
        return 0, get_daily_games_crossword_clues(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_games_save_crossword_clues(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 3:
        return 2, {
            "error": (
                "Usage: daily-games-save-crossword-clues <YYYY-MM-DD> <clues_json>"
            )
        }
    try:
        clues = _parse_daily_games_crossword_clues_json(argv[2])
        return 0, save_daily_games_crossword_clues(argv[1], clues)
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_games_record_attempt(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 8:
        return 2, {
            "error": (
                "Usage: daily-games-record-attempt <YYYY-MM-DD> <game_type> "
                "<mode> <score> <completed_flag> <duration_seconds_or_empty> "
                "<outcomes_json>"
            )
        }
    try:
        score = int(argv[4])
        completed = _parse_bool_flag(argv[5])
        duration_seconds = int(argv[6]) if argv[6] else None
        outcomes = _parse_daily_games_outcomes_json(argv[7])
        return 0, record_daily_games_attempt(
            argv[1],
            argv[2],
            argv[3],
            score,
            completed,
            duration_seconds,
            outcomes,
        )
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_word_of_the_day(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_word_of_the_day()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_daily_goal_set(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: daily-goal-set <target_items>"}
    try:
        target = int(argv[1])
        set_setting("daily_goal_items", str(target))
        return 0, build_daily_goal()
    except ValueError as exc:
        return 2, {"error": f"Invalid target: {exc}"}


def _cmd_apply_expertise_level(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: apply-expertise-level <level>"}
    try:
        payload = apply_expertise_level(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, payload


def _cmd_study_queue(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: study-queue <slug>"}
    try:
        payload = build_study_queue_payload(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, payload


def _cmd_grammar_minigame_data(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {
            "error": "Usage: grammar-minigame-data <game_type> [sentence] [seed]"
        }
    try:
        game_type = argv[1]
        sentence = argv[2] if len(argv) > 2 and argv[2].strip() else None
        seed = int(argv[3]) if len(argv) > 3 and argv[3].strip() else 0
        payload = build_grammar_minigame_data(game_type, sentence, seed=seed)
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, payload


def _cmd_conjugation_drill_data(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: conjugation-drill-data <word> [stage] [seed]"}
    try:
        word = argv[1]
        stage = int(argv[2]) if len(argv) > 2 and argv[2].strip() else 1
        seed = int(argv[3]) if len(argv) > 3 and argv[3].strip() else 0
        payload = build_conjugation_drill_data(word, stage=stage, seed=seed)
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, payload


def _cmd_card_note_get(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: card-note-get <note_key>"}
    try:
        return 0, load_card_note(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_card_note_save(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 3:
        return 2, {"error": "Usage: card-note-save <note_key> <note_text>"}
    try:
        return 0, save_card_note(argv[1], argv[2])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_card_note_delete(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: card-note-delete <note_key>"}
    try:
        return 0, delete_card_note(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_session_save(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: scenario-session-save <payload_path>"}
    try:
        return 0, save_scenario_session(argv[1])
    except (FileNotFoundError, ValueError, OSError) as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_session_list(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 1:
        return 2, {"error": "Usage: scenario-session-list"}
    try:
        return 0, list_scenario_sessions()
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_session_get(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: scenario-session-get <session_id>"}
    try:
        return 0, get_scenario_session(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_session_delete(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: scenario-session-delete <session_id>"}
    try:
        return 0, delete_scenario_session(argv[1])
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_sessions_clear(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 1:
        return 2, {"error": "Usage: scenario-sessions-clear"}
    try:
        return 0, clear_scenario_sessions()
    except ValueError as exc:
        return 2, {"error": str(exc)}


def _cmd_scenario_srs_save(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: scenario-srs-save <payload_path>"}
    try:
        return 0, save_scenario_srs_card(argv[1])
    except (FileNotFoundError, ValueError, OSError) as exc:
        return 2, {"error": str(exc)}


def _cmd_dictionary_search(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: dictionary-search <query>"}
    try:
        return 0, _repo_build_dictionary_search_payload(
            argv[1],
            semantic_embed=_resolve_dictionary_semantic_embedder(),
        )
    except (FileNotFoundError, ValueError) as exc:
        return 2, {"error": str(exc)}


def _cmd_kanji_detail(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) != 2:
        return 2, {"error": "Usage: kanji-detail <character>"}
    try:
        return 0, build_kanji_detail_payload(argv[1])
    except (FileNotFoundError, ValueError) as exc:
        return 2, {"error": str(exc)}


def _cmd_lookup_sentence(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: lookup-sentence <query>"}
    return 0, lookup_sentence(argv[1])


def _cmd_assistant_snapshot(argv: list[str]) -> tuple[int, dict[str, object]]:
    session_id = argv[1] if len(argv) > 1 and argv[1].strip() else None
    return 0, build_assistant_snapshot(session_id=session_id)


def _cmd_assistant_events(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        limit = int(argv[1]) if len(argv) > 1 and argv[1].strip() else 8
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, get_pending_assistant_events(limit=limit)


def _cmd_assistant_events_consume(argv: list[str]) -> tuple[int, dict[str, object]]:
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


def _cmd_assistant_events_track(argv: list[str]) -> tuple[int, dict[str, object]]:
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


def _cmd_assistant_chat_append(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 3:
        return 2, {"error": "Usage: assistant-chat-append <role> <content>"}
    try:
        payload = append_chat_turn(argv[1], argv[2])
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, payload


def _cmd_assistant_chat_history(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        limit = int(argv[1]) if len(argv) > 1 and argv[1].strip() else 20
    except ValueError as exc:
        return 2, {"error": str(exc)}
    return 0, get_recent_chat_turns(limit=limit)


def _cmd_assistant_chat_clear(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, clear_chat_history()


def _cmd_assistant_chat_context(argv: list[str]) -> tuple[int, dict[str, object]]:
    session_id = argv[1].strip() if len(argv) > 1 and argv[1].strip() else None
    user_message = argv[2] if len(argv) > 2 and argv[2].strip() else None
    return 0, get_assistant_chat_context(session_id=session_id, user_message=user_message)


def _cmd_assistant_chat_context_v2(argv: list[str]) -> tuple[int, dict[str, object]]:
    session_id = argv[1].strip() if len(argv) > 1 and argv[1].strip() else None
    user_message = argv[2] if len(argv) > 2 and argv[2].strip() else None
    return 0, get_assistant_chat_context_v2(session_id=session_id, user_message=user_message)


def _cmd_assistant_chat_ocr(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: assistant-chat-ocr <image_path> [min_confidence]"}
    min_confidence = 0.30
    if len(argv) > 2:
        try:
            min_confidence = float(argv[2])
        except ValueError:
            return 2, {"error": "min_confidence must be a number between 0 and 1"}
        if min_confidence < 0 or min_confidence > 1:
            return 2, {"error": "min_confidence must be between 0 and 1"}
    try:
        return 0, extract_assistant_chat_ocr_payload(argv[1], min_confidence=min_confidence)
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        return 2, {"error": str(exc)}


def _cmd_progression(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_progression_status()


def _cmd_feature_unlocks(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_feature_unlock_status()


def _cmd_achievement_milestones(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_achievement_milestones_status()


def _cmd_passages_list(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        from pathlib import Path
        passages_path = Path("data/external_sources/passages/aozora/passages.json")
        if not passages_path.exists():
            return 2, {"error": "Passages data not found. Run build_passages_db.py first."}
        passages = json.loads(passages_path.read_text(encoding="utf-8"))
        return 0, {"passages": passages}
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_xp_progress(argv: list[str]) -> tuple[int, dict[str, object]]:
    return 0, build_xp_progress()


def _cmd_recommendations(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_recommendations_payload()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_tutor_reactions(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_tutor_reactions_payload()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_tutor_dismiss(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: tutor-dismiss <dedup_key>"}
    return 0, dismiss_tutor_reaction_key(argv[1])


def _cmd_jlpt_readiness(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_jlpt_readiness_payload()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_jlpt_exam_queue(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 3:
        return 2, {"error": "Usage: jlpt-exam-queue <level> <mode> [count]"}
    lv = argv[1].lower()
    md = argv[2].lower()
    if lv not in _VALID_JLPT_LEVELS:
        return 2, {"error": f"Invalid JLPT level: {lv}"}
    if md not in _VALID_JLPT_MODES:
        return 2, {"error": f"Invalid JLPT mode: {md}"}
    try:
        cnt = int(argv[3]) if len(argv) > 3 and argv[3].strip() else 30
        return 0, build_jlpt_exam_queue_payload(lv, md, cnt)
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_jlpt_save_result(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 6:
        return 2, {"error": "Usage: jlpt-save-result <level> <mode> <questions_answered> <correct> <accuracy> [projected_score]"}
    try:
        lv = argv[1].lower()
        md = argv[2].lower()
        if lv not in _VALID_JLPT_LEVELS:
            return 2, {"error": f"Invalid JLPT level: {lv}"}
        if md not in _VALID_JLPT_MODES:
            return 2, {"error": f"Invalid JLPT mode: {md}"}
        qa = int(argv[3])
        correct = int(argv[4])
        accuracy = float(argv[5])
        projected: int | None = int(argv[6]) if len(argv) > 6 and argv[6].strip() else None
        row_id = save_jlpt_exam_result(lv, md, qa, correct, accuracy, projected)
        return 0, {"ok": True, "id": row_id}
    except (ValueError, IndexError) as exc:
        return 2, {"error": str(exc)}


def _cmd_jlpt_exam_history(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        lv = argv[1].lower() if len(argv) > 1 and argv[1].strip() else None
        md = argv[2].lower() if len(argv) > 2 and argv[2].strip() else None
        if lv and lv not in _VALID_JLPT_LEVELS:
            return 2, {"error": f"Invalid JLPT level: {lv}"}
        if md and md not in _VALID_JLPT_MODES:
            return 2, {"error": f"Invalid JLPT mode: {md}"}
        results = load_jlpt_exam_history(level=lv, mode=md)
        return 0, {"results": results}
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_learning_path_status(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_learning_path_status_payload()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_complete_onboarding(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        goal = argv[1] if len(argv) > 1 and argv[1].strip() else None
        daily_minutes = argv[2] if len(argv) > 2 and argv[2].strip() else None
        target_level = argv[3] if len(argv) > 3 and argv[3].strip() else None
        return 0, complete_onboarding_handler(goal, daily_minutes, target_level)
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_mark_onboarding_pending(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, mark_onboarding_pending_handler()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_analytics_export(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Missing analytics export type"}
    export_type = argv[1]
    try:
        if export_type == "review_history":
            return 0, {"csv": deck_portability.export_review_history_csv(), "type": export_type}
        if export_type == "accuracy_trends":
            return 0, {"csv": deck_portability.export_accuracy_trends_csv(), "type": export_type}
        if export_type == "mastery_snapshot":
            return 0, {"csv": deck_portability.export_mastery_snapshot_csv(), "type": export_type}
        return 2, {"error": f"Unknown analytics export type: {export_type}"}
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_analytics_export_json(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        snapshot = deck_portability.export_progress_snapshot()
        return 0, {"json": snapshot}
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_analytics_import_json(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Usage: analytics-import-json <file_path> [merge|overwrite]"}
    file_path = argv[1]
    conflict_mode = argv[2] if len(argv) > 2 else "merge"
    if conflict_mode not in ("merge", "overwrite"):
        return 2, {"error": f"Invalid conflict_mode: {conflict_mode}. Use 'merge' or 'overwrite'."}
    try:
        import json as _json
        with open(file_path, "r", encoding="utf-8") as f:
            snapshot = _json.load(f)
        result = deck_portability.import_progress_snapshot(snapshot, conflict_mode=conflict_mode)
        return 0, {"ok": True, "imported": result, "conflict_mode": conflict_mode}
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_diagnostics(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_diagnostics_report()
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_snapshot(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        return 0, build_snapshot(max_files=50)
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_run_check(argv: list[str]) -> tuple[int, dict[str, object]]:
    if len(argv) < 2:
        return 2, {"error": "Missing check name (arch, db, or srs)"}
    check_name = argv[1]
    valid_checks = {"arch", "db", "srs"}
    if check_name not in valid_checks:
        return 2, {"error": f"Unknown check: {check_name}. Valid: arch, db, srs"}
    try:
        result = subprocess.run(
            [sys.executable, f"scripts/{check_name}_check.py"],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return 0, {
            "check": check_name,
            "passed": result.returncode == 0,
            "exitCode": result.returncode,
            "output": output[:20000],
        }
    except subprocess.TimeoutExpired:
        return 0, {
            "check": check_name,
            "passed": False,
            "exitCode": -1,
            "output": "Check timed out after 30 seconds.",
            "error": "timeout",
        }
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_fsrs_get_weights(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        saved = load_fsrs_weights()
        current = list(saved) if saved is not None else list(get_weights())
        return 0, {
            "weights": current,
            "is_custom": saved is not None,
        }
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_fsrs_optimize(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        result = run_fsrs_optimization()
        if result is None:
            return 0, {"ok": False, "error": "Insufficient review data (need 5+ cards with 2+ reviews)."}
        return 0, {
            "ok": True,
            "previous_weights": list(result["previous_weights"]),
            "new_weights": list(result["new_weights"]),
            "loss_before": result["loss_before"],
            "loss_after": result["loss_after"],
            "log_count": result["log_count"],
            "card_count": result["card_count"],
        }
    except Exception as exc:
        return 2, {"error": str(exc)}


def _cmd_fsrs_reset_weights(argv: list[str]) -> tuple[int, dict[str, object]]:
    try:
        reset_fsrs_saved_weights()
        return 0, {"ok": True, "weights": list(get_weights())}
    except Exception as exc:
        return 2, {"error": str(exc)}


_COMMAND_HANDLERS: dict[str, CommandHandler] = {
    "summary": _cmd_summary,
    "daily-activity": _cmd_daily_activity,
    "deck-cards": _cmd_deck_cards,
    "block-progress": _cmd_block_progress,
    "overview-character-mastery": _cmd_overview_character_mastery,
    "reset-db": _cmd_reset_db,
    "record-result": _cmd_record_result,
    "card-scores": _cmd_card_scores,
    "import-card-scores": _cmd_import_card_scores,
    "session-start": _cmd_session_start,
    "session-summary": _cmd_session_summary,
    "daily-goal": _cmd_daily_goal,
    "daily-games-state": _cmd_daily_games_state,
    "daily-games-practice-seed": _cmd_daily_games_practice_seed,
    "daily-games-crossword-clues": _cmd_daily_games_crossword_clues,
    "daily-games-save-crossword-clues": _cmd_daily_games_save_crossword_clues,
    "daily-games-record-attempt": _cmd_daily_games_record_attempt,
    "word-of-the-day": _cmd_word_of_the_day,
    "daily-goal-set": _cmd_daily_goal_set,
    "apply-expertise-level": _cmd_apply_expertise_level,
    "study-queue": _cmd_study_queue,
    "grammar-minigame-data": _cmd_grammar_minigame_data,
    "conjugation-drill-data": _cmd_conjugation_drill_data,
    "card-note-get": _cmd_card_note_get,
    "card-note-save": _cmd_card_note_save,
    "card-note-delete": _cmd_card_note_delete,
    "scenario-session-save": _cmd_scenario_session_save,
    "scenario-session-list": _cmd_scenario_session_list,
    "scenario-session-get": _cmd_scenario_session_get,
    "scenario-session-delete": _cmd_scenario_session_delete,
    "scenario-sessions-clear": _cmd_scenario_sessions_clear,
    "scenario-srs-save": _cmd_scenario_srs_save,
    "dictionary-search": _cmd_dictionary_search,
    "kanji-detail": _cmd_kanji_detail,
    "lookup-sentence": _cmd_lookup_sentence,
    "assistant-snapshot": _cmd_assistant_snapshot,
    "assistant-events": _cmd_assistant_events,
    "assistant-events-consume": _cmd_assistant_events_consume,
    "assistant-events-track": _cmd_assistant_events_track,
    "assistant-chat-append": _cmd_assistant_chat_append,
    "assistant-chat-history": _cmd_assistant_chat_history,
    "assistant-chat-clear": _cmd_assistant_chat_clear,
    "assistant-chat-context": _cmd_assistant_chat_context,
    "assistant-chat-context-v2": _cmd_assistant_chat_context_v2,
    "assistant-chat-ocr": _cmd_assistant_chat_ocr,
    "progression": _cmd_progression,
    "feature-unlocks": _cmd_feature_unlocks,
    "achievement-milestones": _cmd_achievement_milestones,
    "passages:list": _cmd_passages_list,
    "xp-progress": _cmd_xp_progress,
    "recommendations": _cmd_recommendations,
    "tutor-reactions": _cmd_tutor_reactions,
    "tutor-dismiss": _cmd_tutor_dismiss,
    "jlpt-readiness": _cmd_jlpt_readiness,
    "jlpt-exam-queue": _cmd_jlpt_exam_queue,
    "jlpt-save-result": _cmd_jlpt_save_result,
    "jlpt-exam-history": _cmd_jlpt_exam_history,
    "learning-path-status": _cmd_learning_path_status,
    "complete-onboarding": _cmd_complete_onboarding,
    "mark-onboarding-pending": _cmd_mark_onboarding_pending,
    "analytics-export": _cmd_analytics_export,
    "analytics-export-json": _cmd_analytics_export_json,
    "analytics-import-json": _cmd_analytics_import_json,
    "diagnostics": _cmd_diagnostics,
    "snapshot": _cmd_snapshot,
    "run-check": _cmd_run_check,
    "fsrs-get-weights": _cmd_fsrs_get_weights,
    "fsrs-optimize": _cmd_fsrs_optimize,
    "fsrs-reset-weights": _cmd_fsrs_reset_weights,
}


def _run_command(argv: list[str]) -> tuple[int, dict[str, object]]:
    if not argv:
        return 2, {"error": "Missing command"}

    command = argv[0]
    handler = _COMMAND_HANDLERS.get(command)
    if handler is not None:
        return handler(argv)

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
        except sqlite3.DatabaseError as exc:
            code = 2
            payload = {"error": f"Database unavailable: {exc}"}
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
    _apply_persisted_fsrs_weights()
    args = sys.argv[1:]
    if args and args[0] == "--server":
        return _run_server()

    try:
        code, payload = _run_command(args)
    except sqlite3.DatabaseError as exc:
        code, payload = 2, {"error": f"Database unavailable: {exc}"}
    print(json.dumps(payload, ensure_ascii=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
