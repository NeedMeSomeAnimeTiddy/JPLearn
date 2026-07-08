"""Bridge script used by Electron to query JPLearn data.

This script is intentionally small and command-driven so the desktop shell can
request JSON payloads over a subprocess boundary.
"""

from __future__ import annotations

import json
import importlib
import inspect
import os
import re
import urllib.request
import sqlite3
import sys
import csv
import tempfile
import subprocess
import base64
from time import perf_counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
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
    load_assistant_snapshot,
    load_curriculum_stage_summary,
    load_narrative_chapter_summary,
    load_pending_assistant_events,
    load_recent_assistant_chat_turns,
    load_item_history,
    load_mistake_breakdown,
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
from domain.blocks import (  # noqa: E402
    blocks_for_slug,
    compute_block_mastery,
    compute_unlocked_count,
    unlock_threshold_for_slug,
)
from domain.cards import Card, Deck  # noqa: E402
from domain.distractors import rank_distractor_ids  # noqa: E402
from domain.decks import ALL_DECKS  # noqa: E402
from domain.scheduler import ReviewState, update  # noqa: E402
from domain.queue_builder import build_study_queue  # noqa: E402
from domain.decks import (  # noqa: E402
    VOCAB_N1_EXTERNAL_DATA,
    VOCAB_N2_EXTERNAL_DATA,
    VOCAB_N3_EXTERNAL_DATA,
    VOCAB_N4_EXTERNAL_DATA,
    VOCAB_N5_EXTERNAL_DATA,
)
from domain.progression import NodeProgressionState, ProgressionState  # noqa: E402
from domain.progression_curriculum import JPLEARN_GRAPH  # noqa: E402
from domain.progression_service import (  # noqa: E402
    build_initial_state,
    reachable_nodes,
)
from domain.feature_catalog import JPLEARN_FEATURES  # noqa: E402
from domain.feature_service import evaluate_features  # noqa: E402
from domain.features import FeatureState  # noqa: E402
from domain.xp import DEFAULT_CURVE, XP_CORRECT_ANSWER, UserProgress, XPEvent  # noqa: E402
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
    load_feature_unlocks,
    load_tutor_seen_keys,
    load_user_progression,
    load_user_xp,
    save_feature_unlock,
    save_tutor_seen_key,
    save_user_xp,
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
from data.settings_repository import get_setting, set_setting  # noqa: E402
from domain.readiness import (  # noqa: E402
    LEARNING_PATHS,
    build_learning_path_status,
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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

_assets_dir = os.environ.get("JPLEARN_ASSETS_DIR", "").strip() or os.environ.get("JPLEARN_USER_DATA_DIR", "").strip()
_docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
OFFLINE_DICTIONARY_DIR = (
    Path(_assets_dir) / "data" / "external_sources" / "offline_dictionary"
    if _assets_dir
    else Path(_docs_dir) / "data" / "external_sources" / "offline_dictionary"
    if _docs_dir
    else PROJECT_ROOT / "data" / "external_sources" / "offline_dictionary"
)
OFFLINE_DICTIONARY_DB_CANDIDATES = (
    OFFLINE_DICTIONARY_DIR / "jmdict_lookup.sqlite",
    PROJECT_ROOT / "data" / "external_sources" / "offline_dictionary" / "jmdict_lookup.sqlite",
)
OCR_MODEL_DIR_CANDIDATES = (
    Path(_assets_dir) / "ocr" / "standard"
    if _assets_dir
    else Path(_docs_dir) / "ocr" / "standard"
    if _docs_dir
    else PROJECT_ROOT / "data" / "ocr" / "standard",
    PROJECT_ROOT / "data" / "ocr" / "standard",
)
OCR_PRIMARY_DET_MODEL_NAME = "PP-OCRv6_medium_det"
OCR_PRIMARY_REC_MODEL_NAME = "PP-OCRv6_medium_rec"
OCR_PREPROCESS_ENABLED = os.environ.get("JPLEARN_OCR_PREPROCESS", "1").strip().lower() not in {"0", "false", "no", "off"}
OCR_DET_CANVAS_SIZE = 1024
OCR_DUAL_PASS_ACCEPT_CONFIDENCE = 0.88
OCR_LOW_CONFIDENCE_NOISE_THRESHOLD = 0.50
OCR_RETENTION_GUARD_MIN_RATIO = 0.70
OCR_BBOX_HORIZONTAL_PADDING_RATIO = 0.03

TRANSLATION_RUNTIME_DIR = (
    Path(_assets_dir)
    if _assets_dir
    else Path(_docs_dir)
    if _docs_dir
    else PROJECT_ROOT / "data"
)
FASTTEXT_LID_MODEL_PATH = TRANSLATION_RUNTIME_DIR / "translation" / "fasttext" / "lid.176.ftz"
FASTTEXT_LID_MODEL_URL = "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.ftz"
OCR_REMOTE_TRANSLATE_URL = os.environ.get("JPLEARN_OCR_REMOTE_TRANSLATE_URL", "").strip()
OCR_REMOTE_TRANSLATE_TIMEOUT_MS = int(os.environ.get("JPLEARN_OCR_REMOTE_TRANSLATE_TIMEOUT_MS", "7000").strip() or "7000")
OCR_REMOTE_FALLBACK_ENABLED = os.environ.get("JPLEARN_OCR_REMOTE_FALLBACK", "0").strip().lower() in {"1", "true", "yes", "on"}
LLAMA_TRANSLATION_TIMEOUT_MS = int(os.environ.get("JPLEARN_OCR_LLM_TIMEOUT_MS", "90000").strip() or "90000")
LLAMA_TRANSLATION_MODEL_FILENAME = os.environ.get("JPLEARN_OCR_LLM_MODEL", "Qwen3.5-0.8B-JP-Q4_K_M.gguf").strip() or "Qwen3.5-0.8B-JP-Q4_K_M.gguf"
LLAMA_TRANSLATION_STRICT = os.environ.get("JPLEARN_OCR_LLM_STRICT", "0").strip().lower() in {"1", "true", "yes", "on"}
LLAMA_TRANSLATION_GPU_LAYERS = int(os.environ.get("JPLEARN_OCR_LLM_GPU_LAYERS", "99").strip() or "99")
ACTIVE_TRANSLATION_MODEL_STATE_CANDIDATES = (
    Path(_assets_dir) / "translation" / "active-translation-model.json"
    if _assets_dir
    else Path(_docs_dir) / "translation" / "active-translation-model.json"
    if _docs_dir
    else PROJECT_ROOT / "data" / "translation" / "active-translation-model.json",
    PROJECT_ROOT / "data" / "translation" / "active-translation-model.json",
)
TRANSLATION_TIER_ORDER = ("qwen_ja_en",)

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


def _normalize_dictionary_query(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def _dictionary_db_path() -> Path | None:
    for candidate in OFFLINE_DICTIONARY_DB_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def _dictionary_query_terms(query: str) -> list[str]:
    normalized = _normalize_dictionary_query(query)
    if not normalized:
        return []
    if _DICTIONARY_JAPANESE_RE.search(normalized):
        parts = [part for part in re.split(r"\s+", normalized) if part]
    else:
        # English queries benefit from word-token extraction so punctuation
        # like "hello!" still matches the intended gloss term "hello".
        parts = re.findall(r"[a-z0-9']+", normalized)
    return parts or [normalized]


def _escape_fts5_term(term: str) -> str:
    """Escape a term for safe use inside an FTS5 double-quoted string token.

    See https://www.sqlite.org/fts5.html#fts5_strings - embedded double quotes
    are escaped SQL-style by doubling them.
    """
    return term.replace('"', '""')


_DICTIONARY_RESULT_LIMIT = 120
# If the common-word tier returns fewer than this many hits, also search the
# rest of the dictionary (rare/obscure entries, foreign-greeting loanwords,
# etc.) and append those below the common results.
_DICTIONARY_COMMON_FALLBACK_THRESHOLD = 5
_DICTIONARY_JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]")
_DICTIONARY_KATAKANA_ONLY_RE = re.compile(r"^[\u30a0-\u30ffー・\s]+$")
_DICTIONARY_SEMANTIC_RERANK_LIMIT = 80
_DICTIONARY_GREETINGS_QUERY_BOOST = {
    "hello",
    "hi",
    "good day",
    "good afternoon",
    "greetings",
}


def _dictionary_has_supported_schema(conn: sqlite3.Connection) -> bool:
    table_names = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
    }
    return "dictionary_entries" in table_names and "dictionary_fts" in table_names


def _search_dictionary_rows(conn: sqlite3.Connection, normalized_query: str) -> list[tuple]:
    if _DICTIONARY_JAPANESE_RE.search(normalized_query):
        return _search_dictionary_japanese(conn, normalized_query)
    return _search_dictionary_english(conn, normalized_query)


def _dictionary_results_from_rows(rows: list[tuple]) -> list[dict[str, object]]:
    return [
        {
            "id": int(row[0]),
            "character": row[1],
            "romaji": row[2],
            "meaning": row[3],
            "tags": ["offline_dictionary"],
            "example_sentence": None,
        }
        for row in rows
    ]


def _split_dictionary_glosses(gloss_text: str) -> list[str]:
    return [part.strip() for part in gloss_text.split(";") if part.strip()]


def _should_enrich_card_from_dictionary(tags: list[str]) -> bool:
    normalized_tags = {tag.strip().lower() for tag in tags}
    return "hiragana" not in normalized_tags and "katakana" not in normalized_tags


def _select_dictionary_row(rows: list[tuple], character: str, meaning: str) -> tuple | None:
    normalized_character = _normalize_dictionary_query(character)
    normalized_meaning = _normalize_dictionary_query(meaning)

    def _score(row: tuple) -> tuple[int, int, int]:
        row_character = _normalize_dictionary_query(str(row[1]))
        row_gloss = _normalize_dictionary_query(str(row[3]))
        exact_character = 1 if row_character == normalized_character else 0
        meaning_match = 1 if normalized_meaning and normalized_meaning in row_gloss else 0
        starts_with_character = 1 if row_character.startswith(normalized_character) else 0
        return (exact_character, meaning_match, starts_with_character)

    ranked_rows = sorted(
        rows,
        key=lambda row: (_score(row), -len(str(row[1]))),
        reverse=True,
    )
    return ranked_rows[0] if ranked_rows else None


def _lookup_card_dictionary_summary(
    conn: sqlite3.Connection | None,
    *,
    character: str,
    meaning: str,
    tags: list[str],
) -> DictionaryCardSummary | None:
    if conn is None or not _should_enrich_card_from_dictionary(tags):
        return None

    normalized_character = _normalize_dictionary_query(character)
    if not normalized_character or not _DICTIONARY_JAPANESE_RE.search(normalized_character):
        return None

    rows = _search_dictionary_japanese(conn, normalized_character)
    match = _select_dictionary_row(rows, character, meaning)
    if match is None:
        return None

    glosses = _split_dictionary_glosses(str(match[3]))
    if not glosses:
        return None

    return DictionaryCardSummary(
        character=str(match[1]),
        reading=str(match[2]),
        primary_gloss=glosses[0],
        glosses=glosses,
        source="offline_dictionary",
    )


def _search_dictionary_japanese(conn: sqlite3.Connection, normalized_query: str) -> list[tuple]:
    base_sql = (
        "SELECT entry_id, japanese, reading, gloss "
        "FROM dictionary_entries "
        "WHERE (japanese = ? OR japanese LIKE ? OR reading = ? OR reading LIKE ?) AND is_common = ? "
        "ORDER BY LENGTH(japanese), entry_id "
        "LIMIT ?"
    )
    match_params = [
        normalized_query,
        f"{normalized_query}%",
        normalized_query,
        f"{normalized_query}%",
    ]

    rows = conn.execute(base_sql, [*match_params, 1, _DICTIONARY_RESULT_LIMIT]).fetchall()

    if len(rows) < _DICTIONARY_COMMON_FALLBACK_THRESHOLD:
        seen_ids = {row[0] for row in rows}
        remaining = _DICTIONARY_RESULT_LIMIT - len(rows)
        extra_rows = conn.execute(base_sql, [*match_params, 0, remaining]).fetchall()
        rows.extend(row for row in extra_rows if row[0] not in seen_ids)

    return rows


def _search_dictionary_english(conn: sqlite3.Connection, normalized_query: str) -> list[tuple]:
    # Each word must appear as a prefix somewhere in the gloss, ranked by bm25
    # within each tier first, then re-ranked with learner-friendly heuristics.
    query_terms = _dictionary_query_terms(normalized_query)
    match_expr = " AND ".join(f'"{_escape_fts5_term(term)}"*' for term in query_terms)

    candidate_limit = max(_DICTIONARY_RESULT_LIMIT * 4, 40)

    base_sql = (
        "SELECT e.entry_id, e.japanese, e.reading, e.gloss, bm25(dictionary_fts) AS score "
        "FROM dictionary_fts "
        "JOIN dictionary_entries e ON e.entry_id = dictionary_fts.rowid "
        "WHERE dictionary_fts MATCH ? AND e.is_common = ? "
        "ORDER BY bm25(dictionary_fts) "
        "LIMIT ?"
    )

    try:
        rows = conn.execute(base_sql, [match_expr, 1, candidate_limit]).fetchall()
    except sqlite3.OperationalError:
        return []

    if len(rows) < _DICTIONARY_COMMON_FALLBACK_THRESHOLD:
        seen_ids = {row[0] for row in rows}
        remaining = candidate_limit - len(rows)
        try:
            extra_rows = conn.execute(base_sql, [match_expr, 0, remaining]).fetchall()
        except sqlite3.OperationalError:
            extra_rows = []
        rows.extend(row for row in extra_rows if row[0] not in seen_ids)

    semantic_scores_by_id: dict[int, float] = {}
    semantic_embed = _resolve_dictionary_semantic_embedder()
    if semantic_embed and rows:
        semantic_candidates = rows[: min(len(rows), _DICTIONARY_SEMANTIC_RERANK_LIMIT)]
        semantic_texts = [str(row[3]) for row in semantic_candidates]
        try:
            semantic_scores = semantic_embed(normalized_query, semantic_texts)
            for row, score in zip(semantic_candidates, semantic_scores):
                semantic_scores_by_id[int(row[0])] = float(score)
        except Exception:
            # Semantic scoring is an optional ranking enhancement; lexical
            # ranking remains authoritative when embedder inference fails.
            semantic_scores_by_id = {}

    def _rank_row(row: tuple) -> tuple:
        japanese = str(row[1])
        reading = str(row[2])
        gloss_text = str(row[3])
        bm25_score = float(row[4]) if len(row) > 4 and row[4] is not None else 0.0

        glosses = [_normalize_dictionary_query(part) for part in _split_dictionary_glosses(gloss_text)]
        exact_gloss_match = 1 if normalized_query in glosses else 0
        prefix_gloss_match = 1 if any(gloss.startswith(normalized_query) for gloss in glosses) else 0
        whole_word_hits = sum(
            1
            for term in query_terms
            if re.search(rf"\\b{re.escape(term)}\\b", _normalize_dictionary_query(gloss_text))
        )

        has_native_script = 1 if re.search(r"[\u3040-\u309f\u4e00-\u9fff]", japanese) else 0
        katakana_only = 1 if _DICTIONARY_KATAKANA_ONLY_RE.fullmatch(japanese or "") else 0
        native_script_bonus = has_native_script - katakana_only

        greetings_bonus = 0
        if normalized_query in _DICTIONARY_GREETINGS_QUERY_BOOST:
            if "こんにちは" in japanese or reading.startswith("こんにち"):
                greetings_bonus = 2

        semantic_score = semantic_scores_by_id.get(int(row[0]), -1.0)

        # Sort by strongest lexical match first, then native-script preference,
        # then FTS relevance and stable deterministic tie-breakers.
        return (
            greetings_bonus,
            semantic_score,
            exact_gloss_match,
            prefix_gloss_match,
            whole_word_hits,
            native_script_bonus,
            -bm25_score,
            -len(japanese),
            -int(row[0]),
        )

    ranked_rows = sorted(rows, key=_rank_row, reverse=True)
    return [tuple(row[:4]) for row in ranked_rows[:_DICTIONARY_RESULT_LIMIT]]


def build_dictionary_search_payload(query: str) -> dict[str, object]:
    normalized_query = _normalize_dictionary_query(query)
    if not normalized_query:
        raise ValueError("Dictionary query must not be empty")

    db_path = _dictionary_db_path()
    if db_path is None:
        raise FileNotFoundError("Offline dictionary index is not installed")

    conn = sqlite3.connect(db_path)
    try:
        if not _dictionary_has_supported_schema(conn):
            # Older index build (pre-FTS5 schema) - treat as not installed so the
            # UI prompts a re-download instead of hitting a SQL error.
            raise FileNotFoundError("Offline dictionary index is outdated; please re-download it")

        fetched_rows = _search_dictionary_rows(conn, normalized_query)
    finally:
        conn.close()

    results = _dictionary_results_from_rows(fetched_rows)
    return {
        "query": normalized_query,
        "source": "offline_dictionary",
        "results": results,
    }


def _resolve_ocr_model_root() -> Path | None:
    for candidate in OCR_MODEL_DIR_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def _resolve_infer_dir(model_root: Path, phase: str) -> Path | None:
    phase_root = model_root / phase
    if not phase_root.exists():
        return None

    def _looks_like_infer_dir(directory: Path) -> bool:
        return (
            any(path.suffix == ".pdmodel" for path in directory.glob("*.pdmodel"))
            or any(path.suffix == ".onnx" for path in directory.glob("*.onnx"))
            or (directory / "inference.yml").exists()
            or ((directory / "inference.json").exists() and (directory / "inference.pdiparams").exists())
        )

    if _looks_like_infer_dir(phase_root):
        return phase_root

    for child in phase_root.iterdir():
        if not child.is_dir():
            continue
        if _looks_like_infer_dir(child):
            return child
    return None


def _is_supported_image_magic(image_path: Path) -> bool:
    try:
        header = image_path.read_bytes()[:16]
    except OSError:
        return False

    signatures = (
        b"\x89PNG\r\n\x1a\n",  # PNG
        b"\xff\xd8\xff",  # JPEG
        b"BM",  # BMP
        b"GIF87a",  # GIF87a
        b"GIF89a",  # GIF89a
        b"II*\x00",  # TIFF little-endian
        b"MM\x00*",  # TIFF big-endian
    )
    if any(header.startswith(signature) for signature in signatures):
        return True
    # WEBP: RIFF....WEBP
    return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"


def _mean_confidence(lines: list[dict[str, object]]) -> float:
    confidences: list[float] = []
    for entry in lines:
        try:
            confidence = float(entry.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidences.append(confidence)
    if not confidences:
        return 0.0
    return sum(confidences) / len(confidences)


def _parse_ocr_lines(raw_result: object) -> list[dict[str, object]]:
    lines: list[dict[str, object]] = []
    for block in raw_result or []:
        if hasattr(block, "get"):
            rec_texts = block.get("rec_texts")
            rec_scores = block.get("rec_scores")
            if isinstance(rec_texts, list) and isinstance(rec_scores, list):
                for text_raw, score_raw in zip(rec_texts, rec_scores):
                    text = str(text_raw or "").strip()
                    try:
                        confidence = float(score_raw)
                    except (TypeError, ValueError):
                        confidence = 0.0
                    if text:
                        lines.append({"text": text, "confidence": round(confidence, 4)})
                continue

        if not isinstance(block, list):
            continue
        for entry in block:
            if not isinstance(entry, list) or len(entry) < 2:
                continue
            line_meta = entry[1]
            if not isinstance(line_meta, (list, tuple)) or len(line_meta) < 2:
                continue
            text = str(line_meta[0] or "").strip()
            try:
                confidence = float(line_meta[1])
            except (TypeError, ValueError):
                confidence = 0.0
            if text:
                lines.append({"text": text, "confidence": round(confidence, 4)})
    return lines


def _build_ocr_payload_from_lines(lines: list[dict[str, object]], min_confidence: float) -> dict[str, object]:
    extracted_lines: list[str] = []
    all_lines: list[str] = []

    for entry in lines:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(entry.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        all_lines.append(text)
        if confidence >= min_confidence:
            extracted_lines.append(text)

    selected_lines = extracted_lines
    if lines:
        selected_lines = []
        for entry in lines:
            text = str(entry.get("text") or "").strip()
            if not text:
                continue
            try:
                confidence = float(entry.get("confidence", 0.0))
            except (TypeError, ValueError):
                confidence = 0.0

            # Keep Japanese-script lines even when confidence is low;
            # OCR confidence underestimates mixed/complex JP glyphs.
            keep_line = confidence >= min_confidence or _contains_japanese_script(text)
            if keep_line:
                selected_lines.append(text)

    if all_lines:
        retained_ratio = (len(selected_lines) / len(all_lines)) if all_lines else 0.0
        if not selected_lines or retained_ratio < 0.55:
            selected_lines = all_lines

    extracted_text = _join_ocr_lines_for_translation(selected_lines)
    return {
        "ok": True,
        "text": extracted_text,
        "lineCount": len(selected_lines),
        "lines": lines,
    }


def _run_ocr_with_engine(
    engine: object,
    image_path: Path,
    ocr_signature: inspect.Signature,
    selected_enable_cls: bool,
    min_confidence: float,
) -> dict[str, object]:
    if "cls" in ocr_signature.parameters:
        raw_result = engine.ocr(str(image_path), cls=selected_enable_cls)
    else:
        raw_result = engine.ocr(str(image_path))
    lines = _parse_ocr_lines(raw_result)
    return _build_ocr_payload_from_lines(lines, min_confidence=min_confidence)


def _preprocess_image_for_ocr(source_path: Path) -> Path | None:
    try:
        cv2 = importlib.import_module("cv2")
        np = importlib.import_module("numpy")
        image_module = importlib.import_module("PIL.Image")
        image_ops_module = importlib.import_module("PIL.ImageOps")
        image_open = getattr(image_module, "open")
        exif_transpose = getattr(image_ops_module, "exif_transpose")
        image_fromarray = getattr(image_module, "fromarray")
    except Exception:
        return None

    try:
        with image_open(source_path) as raw_image:
            image = exif_transpose(raw_image).convert("RGB")
            rgb = np.asarray(image)
    except Exception:
        return None

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    height, width = gray.shape[:2]
    longest_side = max(height, width)
    if longest_side < 1700:
        scale = min(2.0, 1700.0 / max(1.0, float(longest_side)))
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    normalized = clahe.apply(gray)
    denoised = cv2.bilateralFilter(normalized, d=5, sigmaColor=35, sigmaSpace=35)
    sharpened = cv2.addWeighted(denoised, 1.2, cv2.GaussianBlur(denoised, (0, 0), 1.0), -0.2, 0)
    final_rgb = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2RGB)

    try:
        tmp = tempfile.NamedTemporaryFile(prefix="jplearn_ocr_", suffix=".png", delete=False)
        tmp_path = Path(tmp.name)
        tmp.close()
        image_fromarray(final_rgb).save(tmp_path, format="PNG")
        return tmp_path
    except Exception:
        return None


def _choose_preferred_ocr_payload(primary: dict[str, object], secondary: dict[str, object]) -> dict[str, object]:
    primary_lines = primary.get("lines") if isinstance(primary.get("lines"), list) else []
    secondary_lines = secondary.get("lines") if isinstance(secondary.get("lines"), list) else []
    primary_mean = _mean_confidence(primary_lines)
    secondary_mean = _mean_confidence(secondary_lines)
    primary_count = int(primary.get("lineCount", 0) or 0)
    secondary_count = int(secondary.get("lineCount", 0) or 0)

    if secondary_mean > primary_mean + 0.002:
        return secondary
    if secondary_mean >= primary_mean and secondary_count > primary_count:
        return secondary
    return primary


def _payload_mean_confidence(payload: dict[str, object]) -> float:
    payload_lines = payload.get("lines") if isinstance(payload.get("lines"), list) else []
    return _mean_confidence(payload_lines)


def _select_best_ocr_payload(candidates: list[tuple[str, dict[str, object]]]) -> dict[str, object]:
    if not candidates:
        return {"ok": False, "text": "", "lineCount": 0, "lines": []}

    def _candidate_rank(candidate: tuple[str, dict[str, object]]) -> tuple[float, int]:
        _name, payload = candidate
        mean_conf = _payload_mean_confidence(payload)
        line_count = int(payload.get("lineCount", 0) or 0)
        return (mean_conf, line_count)

    winner_name, winner_payload = max(candidates, key=_candidate_rank)
    winner_payload = dict(winner_payload)
    winner_payload["pipeline"] = winner_name
    winner_payload["confidenceMean"] = round(_payload_mean_confidence(winner_payload), 4)
    winner_payload["candidateCount"] = len(candidates)
    return winner_payload


def _order_quad_points(points: object) -> object:
    np = importlib.import_module("numpy")
    pts = np.array(points, dtype="float32")
    if pts.shape != (4, 2):
        return pts
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(-1)
    ordered = np.zeros((4, 2), dtype="float32")
    ordered[0] = pts[np.argmin(sums)]
    ordered[2] = pts[np.argmax(sums)]
    ordered[1] = pts[np.argmin(diffs)]
    ordered[3] = pts[np.argmax(diffs)]
    return ordered


def _crop_quad_bgr(image_bgr: object, quad_points: object) -> object | None:
    cv2 = importlib.import_module("cv2")
    np = importlib.import_module("numpy")
    pts = _order_quad_points(quad_points)
    if getattr(pts, "shape", None) != (4, 2):
        return None

    width_top = float(np.linalg.norm(pts[1] - pts[0]))
    width_bottom = float(np.linalg.norm(pts[2] - pts[3]))
    max_width = int(max(width_top, width_bottom))

    height_right = float(np.linalg.norm(pts[2] - pts[1]))
    height_left = float(np.linalg.norm(pts[3] - pts[0]))
    max_height = int(max(height_right, height_left))

    if max_width < 2 or max_height < 2:
        return None

    dst = np.array(
        [
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1],
        ],
        dtype="float32",
    )
    transform = cv2.getPerspectiveTransform(pts, dst)
    return cv2.warpPerspective(image_bgr, transform, (max_width, max_height))


def _recognize_crop_text(recognizer: object, crop_bgr: object) -> tuple[str, float]:
    if crop_bgr is None:
        return "", 0.0
    try:
        result = recognizer.predict(crop_bgr)
    except Exception:
        return "", 0.0
    if not isinstance(result, list) or not result:
        return "", 0.0
    first = result[0]
    if not hasattr(first, "get"):
        return "", 0.0
    text = str(first.get("rec_text") or "").strip()
    try:
        score = float(first.get("rec_score", 0.0))
    except (TypeError, ValueError):
        score = 0.0
    return text, score


def _prepare_ocr_image_variants(source_path: Path) -> tuple[object, object, float] | None:
    try:
        cv2 = importlib.import_module("cv2")
        np = importlib.import_module("numpy")
        image_module = importlib.import_module("PIL.Image")
        image_ops_module = importlib.import_module("PIL.ImageOps")
        image_open = getattr(image_module, "open")
        exif_transpose = getattr(image_ops_module, "exif_transpose")
    except Exception:
        return None

    try:
        with image_open(source_path) as raw_image:
            image = exif_transpose(raw_image).convert("RGB")
            rgb = np.asarray(image)
    except Exception:
        return None

    stream_b = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    stream_b = cv2.bilateralFilter(stream_b, d=5, sigmaColor=35, sigmaSpace=35)

    gray = cv2.cvtColor(stream_b, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    stream_a_gray = cv2.resize(binary, (OCR_DET_CANVAS_SIZE, OCR_DET_CANVAS_SIZE), interpolation=cv2.INTER_AREA)
    stream_a = cv2.cvtColor(stream_a_gray, cv2.COLOR_GRAY2BGR)
    return stream_a, stream_b, 1.0


def _crop_bbox_with_padding(image_bgr: object, bbox: tuple[float, float, float, float], pad_ratio: float = 0.0) -> object | None:
    np = importlib.import_module("numpy")
    x1, y1, x2, y2 = bbox
    height, width = image_bgr.shape[:2]
    pad = (x2 - x1) * max(0.0, pad_ratio)

    left = max(0, int(np.floor(x1 - pad)))
    right = min(width, int(np.ceil(x2 + pad)))
    top = max(0, int(np.floor(y1)))
    bottom = min(height, int(np.ceil(y2)))
    if right - left < 2 or bottom - top < 2:
        return None
    return image_bgr[top:bottom, left:right]


def _poly_to_bbox(poly: object) -> tuple[float, float, float, float] | None:
    np = importlib.import_module("numpy")
    points = np.array(poly, dtype="float32")
    if points.shape != (4, 2):
        return None
    x1 = float(np.min(points[:, 0]))
    y1 = float(np.min(points[:, 1]))
    x2 = float(np.max(points[:, 0]))
    y2 = float(np.max(points[:, 1]))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def _is_vertical_layout(lines: list[dict[str, object]]) -> bool:
    if not lines:
        return False
    tall = 0
    for entry in lines:
        width = float(entry.get("_w", 0.0))
        height = float(entry.get("_h", 0.0))
        if height > width:
            tall += 1
    return (tall / max(1, len(lines))) > 0.60


def _sort_layout_lines(lines: list[dict[str, object]]) -> list[dict[str, object]]:
    vertical = _is_vertical_layout(lines)
    if vertical:
        return sorted(lines, key=lambda row: (-float(row.get("_x", 0.0)), float(row.get("_y", 0.0))))
    return sorted(lines, key=lambda row: (float(row.get("_y", 0.0)), float(row.get("_x", 0.0))) )


def _contains_kana(text: str) -> bool:
    return bool(re.search(r"[\u3040-\u309f\u30a0-\u30ff]", text))


def _fuse_lines_for_translation(lines: list[dict[str, object]]) -> list[str]:
    if not lines:
        return []

    vertical = _is_vertical_layout(lines)
    fused: list[str] = []
    current = str(lines[0].get("text") or "").strip()
    prev = lines[0]

    for entry in lines[1:]:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue

        if vertical:
            gap = float(entry.get("_y1", 0.0)) - float(prev.get("_y2", 0.0))
            char_unit = max(6.0, float(prev.get("_h", 0.0)) / max(1.0, float(len(str(prev.get("text") or "").strip()))))
        else:
            gap = float(entry.get("_x1", 0.0)) - float(prev.get("_x2", 0.0))
            char_unit = max(6.0, float(prev.get("_w", 0.0)) / max(1.0, float(len(str(prev.get("text") or "").strip()))))

        should_fuse = gap <= (1.5 * char_unit)
        if should_fuse:
            current = f"{current}{text}"
        else:
            fused.append(current.strip())
            current = text
        prev = entry

    if current.strip():
        fused.append(current.strip())
    return fused


def _extract_dual_pass_ocr_payload(
    image_path: Path,
    min_confidence: float,
    paddleocr_module: object,
) -> dict[str, object] | None:
    if not OCR_PREPROCESS_ENABLED:
        return None

    variants = _prepare_ocr_image_variants(image_path)
    if variants is None:
        return None
    stream_a_bgr, stream_b_bgr, _ = variants

    try:
        TextDetection = getattr(paddleocr_module, "TextDetection")
        TextRecognition = getattr(paddleocr_module, "TextRecognition")
        detector = TextDetection(model_name=OCR_PRIMARY_DET_MODEL_NAME, engine="onnxruntime")
        recognizer = TextRecognition(model_name=OCR_PRIMARY_REC_MODEL_NAME, engine="onnxruntime")
    except Exception:
        return None

    try:
        det_result = detector.predict(stream_a_bgr)
    except Exception:
        return None
    if not isinstance(det_result, list) or not det_result:
        return None

    first = det_result[0]
    if not hasattr(first, "get"):
        return None
    dt_polys = first.get("dt_polys")
    if dt_polys is None:
        return None

    np = importlib.import_module("numpy")
    try:
        polys = np.array(dt_polys, dtype="float32")
    except Exception:
        return None
    if polys.ndim != 3 or polys.shape[1:] != (4, 2):
        return None

    line_rows: list[dict[str, object]] = []
    stream_a_h, stream_a_w = stream_a_bgr.shape[:2]
    stream_b_h, stream_b_w = stream_b_bgr.shape[:2]
    scale_x = float(stream_b_w) / max(1.0, float(stream_a_w))
    scale_y = float(stream_b_h) / max(1.0, float(stream_a_h))

    for poly in polys:
        stream_a_poly = np.array(poly, dtype="float32")
        stream_b_poly = np.array(poly, dtype="float32")
        stream_b_poly[:, 0] *= scale_x
        stream_b_poly[:, 1] *= scale_y

        stream_a_bbox = _poly_to_bbox(stream_a_poly)
        stream_b_bbox = _poly_to_bbox(stream_b_poly)
        if stream_a_bbox is None or stream_b_bbox is None:
            continue

        pass_a_crop = _crop_bbox_with_padding(stream_a_bgr, stream_a_bbox, pad_ratio=OCR_BBOX_HORIZONTAL_PADDING_RATIO)
        pass_a_text, pass_a_score = _recognize_crop_text(recognizer, pass_a_crop)

        chosen_text = pass_a_text
        chosen_score = pass_a_score
        if pass_a_score < OCR_DUAL_PASS_ACCEPT_CONFIDENCE:
            pass_b_crop = _crop_bbox_with_padding(stream_b_bgr, stream_b_bbox, pad_ratio=OCR_BBOX_HORIZONTAL_PADDING_RATIO)
            pass_b_text, pass_b_score = _recognize_crop_text(recognizer, pass_b_crop)
            if pass_b_score > pass_a_score:
                chosen_text, chosen_score = pass_b_text, pass_b_score

        chosen_text = chosen_text.strip()
        if not chosen_text:
            continue

        x1, y1, x2, y2 = stream_b_bbox
        center_x = (x1 + x2) / 2.0
        center_y = (y1 + y2) / 2.0
        line_rows.append(
            {
                "text": chosen_text,
                "confidence": round(float(chosen_score), 4),
                "_y": center_y,
                "_x": center_x,
                "_x1": x1,
                "_x2": x2,
                "_y1": y1,
                "_y2": y2,
                "_w": x2 - x1,
                "_h": y2 - y1,
            }
        )

    if not line_rows:
        return None

    ordered_rows = _sort_layout_lines(line_rows)
    if not ordered_rows:
        return None

    filtered_rows: list[dict[str, object]] = []
    for row in ordered_rows:
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        confidence = float(row.get("confidence", 0.0))
        has_cjk = _contains_japanese_script(text)
        has_kana = _contains_kana(text)
        if has_kana:
            filtered_rows.append(row)
            continue
        if confidence < OCR_LOW_CONFIDENCE_NOISE_THRESHOLD and not has_cjk:
            continue
        filtered_rows.append(row)

    if ordered_rows and (len(filtered_rows) / len(ordered_rows)) < OCR_RETENTION_GUARD_MIN_RATIO:
        filtered_rows = list(ordered_rows)

    selected_rows = [
        row
        for row in filtered_rows
        if float(row.get("confidence", 0.0)) >= min_confidence
        or _contains_japanese_script(str(row.get("text") or ""))
    ]
    if filtered_rows and not selected_rows:
        selected_rows = list(filtered_rows)

    raw_lines = [
        {
            "text": str(row.get("text") or "").strip(),
            "confidence": round(float(row.get("confidence", 0.0)), 4),
        }
        for row in ordered_rows
        if str(row.get("text") or "").strip()
    ]
    final_rows = [
        {
            "text": str(row.get("text") or "").strip(),
            "confidence": round(float(row.get("confidence", 0.0)), 4),
            "_x1": float(row.get("_x1", 0.0)),
            "_x2": float(row.get("_x2", 0.0)),
            "_y1": float(row.get("_y1", 0.0)),
            "_y2": float(row.get("_y2", 0.0)),
            "_w": float(row.get("_w", 0.0)),
            "_h": float(row.get("_h", 0.0)),
        }
        for row in selected_rows
        if str(row.get("text") or "").strip()
    ]

    fused_blocks = _fuse_lines_for_translation(final_rows)
    stitched_text = "\n".join(block for block in fused_blocks if block).strip()
    if not stitched_text:
        stitched_text = _join_ocr_lines_for_translation([str(row.get("text") or "") for row in final_rows])

    payload = {
        "ok": True,
        "text": stitched_text,
        "lineCount": len(final_rows),
        "lines": raw_lines,
    }
    payload_lines = payload.get("lines") if isinstance(payload.get("lines"), list) else []
    if payload_lines and _mean_confidence(payload_lines) < 0.75:
        return None
    return payload


def extract_assistant_chat_ocr_payload(image_path_raw: str, min_confidence: float = 0.30) -> dict[str, object]:
    global _PADDLE_OCR_ENGINE_CACHE
    global _PADDLE_OCR_ENGINE_CACHE_KEY

    image_path = Path(image_path_raw).expanduser().resolve()
    if not image_path.exists() or not image_path.is_file():
        raise ValueError(f"Image file does not exist: {image_path}")
    if not _is_supported_image_magic(image_path):
        raise ValueError(f"Unsupported or corrupted image format: {image_path.name}")

    model_root = _resolve_ocr_model_root()
    det_model_dir: Path | None = None
    rec_model_dir: Path | None = None
    cls_model_dir: Path | None = None
    if model_root is not None:
        det_model_dir = _resolve_infer_dir(model_root, "det")
        rec_model_dir = _resolve_infer_dir(model_root, "rec")
        cls_model_dir = _resolve_infer_dir(model_root, "cls")

    try:
        # PaddleOCR/PaddlePaddle 3.3.x has a known PIR+oneDNN regression on CPU
        # (ConvertPirAttribute2RuntimeAttribute...). Disable those paths before
        # importing PaddleOCR to keep inference stable across environments.
        os.environ.setdefault("FLAGS_enable_pir_api", "0")
        os.environ.setdefault("FLAGS_use_mkldnn", "0")
        paddleocr_module = importlib.import_module("paddleocr")
        PaddleOCR = getattr(paddleocr_module, "PaddleOCR")
    except Exception as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            "PaddleOCR runtime is unavailable in this environment. Install Python package 'paddleocr'."
        ) from exc

    init_signature = inspect.signature(PaddleOCR.__init__)
    accepted_params = set(init_signature.parameters.keys())
    accepts_var_kwargs = any(
        param.kind == inspect.Parameter.VAR_KEYWORD
        for param in init_signature.parameters.values()
    )

    base_kwargs: dict[str, object] = {}
    if "lang" in accepted_params:
        base_kwargs["lang"] = "japan"
    if "show_log" in accepted_params:
        base_kwargs["show_log"] = False
    if "enable_mkldnn" in accepted_params or accepts_var_kwargs:
        base_kwargs["enable_mkldnn"] = False
    if "engine" in accepted_params or accepts_var_kwargs:
        base_kwargs["engine"] = "onnxruntime"
    if "use_doc_orientation_classify" in accepted_params or accepts_var_kwargs:
        base_kwargs["use_doc_orientation_classify"] = False
    if "use_doc_unwarping" in accepted_params or accepts_var_kwargs:
        base_kwargs["use_doc_unwarping"] = False

    init_candidates: list[tuple[dict[str, object], bool]] = []

    supports_legacy_model_dirs = (
        "det_model_dir" in accepted_params
        and "rec_model_dir" in accepted_params
        and "cls_model_dir" in accepted_params
    )
    supports_new_model_dirs = (
        "text_detection_model_dir" in accepted_params
        and "text_recognition_model_dir" in accepted_params
    )

    # Main pipeline: use PP-OCRv6 ONNX medium det/rec model names.
    onnx_kwargs = dict(base_kwargs)
    onnx_kwargs.pop("lang", None)
    if "text_detection_model_name" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["text_detection_model_name"] = OCR_PRIMARY_DET_MODEL_NAME
    if "text_recognition_model_name" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["text_recognition_model_name"] = OCR_PRIMARY_REC_MODEL_NAME
    if "use_textline_orientation" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["use_textline_orientation"] = False
    init_candidates.append((onnx_kwargs, False))

    if supports_legacy_model_dirs and det_model_dir is not None and rec_model_dir is not None and cls_model_dir is not None:
        legacy_kwargs = dict(base_kwargs)
        legacy_kwargs.pop("lang", None)
        legacy_kwargs["det_model_dir"] = str(det_model_dir)
        legacy_kwargs["rec_model_dir"] = str(rec_model_dir)
        legacy_kwargs["cls_model_dir"] = str(cls_model_dir)
        enable_cls = False
        if "use_angle_cls" in accepted_params:
            legacy_kwargs["use_angle_cls"] = True
            enable_cls = True
        init_candidates.append((legacy_kwargs, enable_cls))

    det_has_inference_yaml = bool(det_model_dir and (det_model_dir / "inference.yml").exists())
    rec_has_inference_yaml = bool(rec_model_dir and (rec_model_dir / "inference.yml").exists())
    cls_has_inference_yaml = bool(cls_model_dir and (cls_model_dir / "inference.yml").exists())
    if (
        supports_new_model_dirs
        and det_model_dir is not None
        and rec_model_dir is not None
        and det_has_inference_yaml
        and rec_has_inference_yaml
    ):
        new_kwargs = dict(base_kwargs)
        new_kwargs.pop("lang", None)
        new_kwargs["text_detection_model_dir"] = str(det_model_dir)
        new_kwargs["text_recognition_model_dir"] = str(rec_model_dir)

        det_name = det_model_dir.name.replace("_infer", "") if det_model_dir.name else ""
        rec_name = rec_model_dir.name.replace("_infer", "") if rec_model_dir.name else ""
        if det_name and ("text_detection_model_name" in accepted_params or accepts_var_kwargs):
            new_kwargs["text_detection_model_name"] = det_name
        if rec_name and ("text_recognition_model_name" in accepted_params or accepts_var_kwargs):
            new_kwargs["text_recognition_model_name"] = rec_name

        enable_cls = False
        if "use_textline_orientation" in accepted_params:
            if cls_model_dir is not None and cls_has_inference_yaml and "textline_orientation_model_dir" in accepted_params:
                new_kwargs["use_textline_orientation"] = True
                new_kwargs["textline_orientation_model_dir"] = str(cls_model_dir)
                cls_name = cls_model_dir.name.replace("_infer", "") if cls_model_dir.name else ""
                if cls_name and ("textline_orientation_model_name" in accepted_params or accepts_var_kwargs):
                    new_kwargs["textline_orientation_model_name"] = cls_name
                enable_cls = True
            else:
                new_kwargs["use_textline_orientation"] = False
        init_candidates.append((new_kwargs, enable_cls))

    # Final fallback: let PaddleOCR use its own bundled/default model resolution.
    # This prevents hard-failing when local model files are from an older format.
    auto_kwargs = dict(base_kwargs)
    auto_kwargs["lang"] = "japan"
    enable_cls = False
    if "use_textline_orientation" in accepted_params:
        auto_kwargs["use_textline_orientation"] = False
    elif "use_angle_cls" in accepted_params:
        auto_kwargs["use_angle_cls"] = False
    init_candidates.append((auto_kwargs, enable_cls))

    cache_key = "|".join(
        [
            str(det_model_dir or ""),
            str(rec_model_dir or ""),
            str(cls_model_dir or ""),
            "with_orientation" if "use_textline_orientation" in accepted_params else "no_orientation",
        ]
    )

    if _PADDLE_OCR_ENGINE_CACHE is not None and _PADDLE_OCR_ENGINE_CACHE_KEY == cache_key:
        engine, selected_enable_cls, ocr_signature = _PADDLE_OCR_ENGINE_CACHE
    else:
        engine = None
        selected_enable_cls = False
        init_errors: list[str] = []
        for kwargs, candidate_enable_cls in init_candidates:
            try:
                engine = PaddleOCR(**kwargs)
                selected_enable_cls = candidate_enable_cls
                break
            except Exception as exc:
                init_errors.append(str(exc))

        if engine is None:
            details = " | ".join(error for error in init_errors if error)
            raise RuntimeError(
                "Unable to initialize PaddleOCR runtime with available model configuration. "
                f"Details: {details or '(no details)'}"
            )

        ocr_signature = inspect.signature(engine.ocr)
        _PADDLE_OCR_ENGINE_CACHE = (engine, selected_enable_cls, ocr_signature)
        _PADDLE_OCR_ENGINE_CACHE_KEY = cache_key

    return _run_ocr_with_engine(
        engine,
        image_path,
        ocr_signature,
        selected_enable_cls,
        min_confidence,
    )


def _contains_japanese_script(text: str) -> bool:
    return bool(re.search(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]", text))


def _contains_latin_letters(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text))


def _repair_common_mojibake(text: str) -> str:
    raw = str(text or "")
    if not raw:
        return ""

    # Heuristic: OCR text should usually contain Japanese script. If not, and it
    # contains common UTF-8-as-latin1 artifacts, try recovering original UTF-8.
    if _contains_japanese_script(raw):
        return raw
    if not any(token in raw for token in ("Ò", "Ã", "Â", "Ê")):
        return raw

    try:
        repaired = raw.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return raw

    return repaired if _contains_japanese_script(repaired) else raw


def _split_ocr_text_for_translation(text: str, *, max_chars: int, max_lines: int, overlap_lines: int) -> list[str]:
    lines = [line.strip() for line in str(text or "").splitlines() if line and line.strip()]
    if not lines:
        return []

    single = _join_ocr_lines_for_translation(lines)
    if len(single) <= max_chars and len(lines) <= max_lines:
        return [single]

    chunks: list[str] = []
    index = 0
    last_index = len(lines)
    overlap = max(0, overlap_lines)

    while index < last_index:
        end = index
        total = 0
        while end < last_index:
            line_len = len(lines[end]) + 1
            line_count = end - index + 1
            if end > index and (total + line_len > max_chars or line_count > max_lines):
                break
            total += line_len
            end += 1

        if end <= index:
            end = min(index + 1, last_index)

        chunk = _join_ocr_lines_for_translation(lines[index:end])
        if chunk:
            chunks.append(chunk)

        if end >= last_index:
            break
        index = max(index + 1, end - overlap)

    return chunks or [single]


def _translate_text_unit_with_backend(
    unit: str,
    *,
    backend: str,
    source_lang: str,
    target_lang: str,
) -> tuple[str, bool]:
    if backend == "llama.cpp":
        return _translate_with_llama_cpp(unit, source_lang, target_lang), False
    raise ValueError(f"Unsupported translation backend: {backend}")


def _split_japanese_sentences(text: str) -> list[str]:
    compact = re.sub(r"\s+", " ", str(text or "")).strip()
    if not compact:
        return []

    rough = re.split(r"(?<=[。！？!?」』])\s+", compact)
    sentences = [segment.strip() for segment in rough if segment and segment.strip()]
    return sentences or [compact]


def _translate_ocr_text_by_sentence(
    text: str,
    *,
    backend: str,
    source_lang: str,
    target_lang: str,
) -> tuple[str, dict[str, object]]:
    sentences = _split_japanese_sentences(text)
    translated_sentences: list[str] = []
    fallback_sentences = 0

    for sentence in sentences:
        translated_sentence, used_fallback = _translate_text_unit_with_backend(
            sentence,
            backend=backend,
            source_lang=source_lang,
            target_lang=target_lang,
        )
        translated_sentences.append(str(translated_sentence or "").strip())
        if used_fallback:
            fallback_sentences += 1

    merged = "\n".join(line for line in translated_sentences if line).strip()
    return merged, {
        "strategy": "sentence",
        "sentenceCount": len(sentences),
        "fallbackSentenceCount": fallback_sentences,
    }


def _translate_ocr_text_with_backend(
    text: str,
    *,
    backend: str,
    source_lang: str,
    target_lang: str,
    chunk_max_chars: int,
    chunk_max_lines: int,
    chunk_overlap_lines: int,
) -> tuple[str, dict[str, object]]:
    chunks = _split_ocr_text_for_translation(
        text,
        max_chars=chunk_max_chars,
        max_lines=chunk_max_lines,
        overlap_lines=chunk_overlap_lines,
    )
    translated_chunks: list[str] = []
    fallback_chunks = 0
    for chunk in chunks:
        translated_chunk, used_fallback = _translate_text_unit_with_backend(
            chunk,
            backend=backend,
            source_lang=source_lang,
            target_lang=target_lang,
        )
        if used_fallback:
            fallback_chunks += 1

        translated_chunks.append(str(translated_chunk or "").strip())

    merged = _dedupe_overlap_lines(translated_chunks)
    return merged, {
        "strategy": "chunk",
        "chunkCount": len(chunks),
        "chunkMaxChars": chunk_max_chars,
        "chunkMaxLines": chunk_max_lines,
        "chunkOverlapLines": chunk_overlap_lines,
        "fallbackChunkCount": fallback_chunks,
    }


def _translation_quality_score(source_text: str, translated_text: str) -> tuple[float, list[str]]:
    source = str(source_text or "")
    translated = str(translated_text or "")
    if not translated.strip():
        return 0.0, ["empty-output"]

    score = 1.0
    flags: list[str] = []
    source_lines = [line.strip() for line in source.splitlines() if line.strip()]
    translated_lines = [line.strip() for line in translated.splitlines() if line.strip()]
    source_compact_len = len(re.sub(r"\s+", "", source))
    translated_compact_len = len(re.sub(r"\s+", "", translated))

    if _contains_japanese_script(translated):
        score -= 0.55
        flags.append("contains-japanese-script")
    if not _contains_latin_letters(translated):
        score -= 0.40
        flags.append("missing-latin-letters")

    if len(source_lines) >= 6 and len(translated_lines) <= max(2, len(source_lines) // 4):
        score -= 0.35
        flags.append("line-collapse")

    if source_compact_len >= 120:
        ratio = translated_compact_len / max(1, source_compact_len)
        if ratio < 0.25:
            score -= 0.45
            flags.append("too-short-vs-source")
        elif ratio < 0.4:
            score -= 0.35
            flags.append("short-vs-source")
        elif ratio < 0.55:
            score -= 0.2
            flags.append("borderline-short-vs-source")

    words = re.findall(r"[A-Za-z']+", translated.casefold())
    if len(words) >= 16:
        diversity = len(set(words)) / len(words)
        if diversity < 0.35:
            score -= 0.15
            flags.append("low-lexical-diversity")

    if len(words) >= 20:
        counts: dict[str, int] = {}
        for word in words:
            counts[word] = counts.get(word, 0) + 1
        max_ratio = max(counts.values()) / max(1, len(words))
        if max_ratio >= 0.2:
            score -= 0.3
            flags.append("dominant-word-repetition")

    if len(words) >= 24:
        repeated_bigrams = 0
        seen_bigrams: dict[tuple[str, str], int] = {}
        for idx in range(len(words) - 1):
            key = (words[idx], words[idx + 1])
            seen_bigrams[key] = seen_bigrams.get(key, 0) + 1
        for value in seen_bigrams.values():
            if value >= 3:
                repeated_bigrams += 1
        if repeated_bigrams >= 2:
            score -= 0.45
            flags.append("looped-phrase-repetition")

    if "�" in translated:
        score -= 0.25
        flags.append("replacement-char")

    quote_count = translated.count('"') + translated.count("'")
    if quote_count % 2 == 1:
        score -= 0.15
        flags.append("unbalanced-quotes")

    if translated_lines:
        tail = translated_lines[-1].strip()
        if tail and not re.search(r'[.!?)"]$', tail):
            score -= 0.15
            flags.append("abrupt-ending")

    ui_artifact_count = 0
    for line in translated_lines:
        lowered = line.casefold().strip("\"'“”‘’ ")
        if lowered in {"back", "close", "home", "kindle"}:
            ui_artifact_count += 1
        elif "time left in chapter" in lowered:
            ui_artifact_count += 1
    if ui_artifact_count:
        score -= min(0.4, 0.12 * ui_artifact_count)
        flags.append("ui-artifacts-in-output")

    return max(0.0, min(1.0, score)), flags


def _join_ocr_lines_for_translation(lines: list[str]) -> str:
    """Reflow OCR line fragments into readable paragraph text for translation."""
    cleaned = [line.strip() for line in lines if line and line.strip()]
    if not cleaned:
        return ""

    deduped: list[str] = []
    for line in cleaned:
        if deduped and deduped[-1] == line:
            continue
        deduped.append(line)

    # Preserve visual OCR line boundaries to avoid accidental token fusion
    # that can hurt deterministic JA->EN translation quality.
    return "\n".join(deduped).strip()


def _reflow_wrapped_japanese_lines(lines: list[str]) -> list[str]:
    """Merge hard-wrapped OCR lines into sentence-like units before translation."""
    cleaned = [line.strip() for line in lines if line and line.strip()]
    if not cleaned:
        return []

    merged: list[str] = []
    strong_end_pattern = re.compile(r"[。！？!?」』）)]$")

    for line in cleaned:
        if not merged:
            merged.append(line)
            continue

        previous = merged[-1]
        should_join = (
            _contains_japanese_script(previous)
            and _contains_japanese_script(line)
            and not strong_end_pattern.search(previous)
        )

        if should_join:
            merged[-1] = previous + line
        else:
            merged.append(line)

    return merged


def _dedupe_overlap_lines(translated_chunks: list[str]) -> str:
    merged_lines: list[str] = []
    seen_recent: list[str] = []

    for chunk in translated_chunks:
        for raw_line in str(chunk or "").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            key = line.casefold()

            # Overlap chunking can repeat neighboring lines; keep first occurrence
            # within a small sliding window while preserving global order.
            if key in seen_recent:
                continue

            merged_lines.append(line)
            seen_recent.append(key)
            if len(seen_recent) > 8:
                seen_recent.pop(0)

    return "\n".join(merged_lines).strip()


def _collapse_ocr_text_to_single_line(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _is_ocr_ui_noise_line(line: str) -> bool:
    text = str(line or "").strip()
    if not text:
        return True
    lowered = text.casefold()

    if _contains_japanese_script(text):
        return False

    if lowered in {"kindle", "home", "close", "back"}:
        return True
    if lowered.endswith("mins") and "time left in chapter" in lowered:
        return True
    if re.fullmatch(r"\d{1,3}%", lowered):
        return True
    if re.fullmatch(r"\d{1,2}:\d{2}", lowered):
        return True

    return False


def _prepare_ocr_text_for_translation(text_raw: str) -> str:
    repaired = _repair_common_mojibake(text_raw)
    lines = [line.strip() for line in str(repaired or "").splitlines() if line and line.strip()]
    if not lines:
        return ""

    filtered = [line for line in lines if not _is_ocr_ui_noise_line(line)]
    candidate = _reflow_wrapped_japanese_lines(filtered if filtered else lines)
    joined = _join_ocr_lines_for_translation(candidate)
    return _collapse_ocr_text_to_single_line(joined)


def _translation_tier_model_dir_candidates(tier: str) -> tuple[Path, ...]:
    return (
        Path(_assets_dir) / "translation" / tier
        if _assets_dir
        else Path(_docs_dir) / "translation" / tier
        if _docs_dir
        else PROJECT_ROOT / "data" / "translation" / tier,
        PROJECT_ROOT / "data" / "translation" / tier,
    )


def _translation_tier_is_installed(tier: str) -> bool:
    normalized_tier = _normalize_translation_backend_tier(tier)
    if normalized_tier != "qwen_ja_en":
        return False

    for base in _translation_tier_model_dir_candidates(tier):
        if (base / "model.ready").exists():
            return True

        # Allow direct GGUF installs without model.ready marker.
        for candidate in (
            base.parent.parent / "models" / "llama" / "Qwen3.5-0.8B-JP-Q4_K_M.gguf",
            base.parent.parent / "models" / "llama" / "Qwen3.5-0.8B-JP-Q6_K.gguf",
            PROJECT_ROOT / "models" / "llama" / "Qwen3.5-0.8B-JP-Q4_K_M.gguf",
            PROJECT_ROOT / "models" / "llama" / "Qwen3.5-0.8B-JP-Q6_K.gguf",
        ):
            if candidate.exists():
                return True
    return False


def _normalize_translation_backend_tier(tier: str) -> str:
    normalized = str(tier or "").strip().lower()
    alias_map = {
        "qwen": "qwen_ja_en",
    }
    return alias_map.get(normalized, normalized)


def _resolve_active_translation_backend() -> str:
    for state_path in ACTIVE_TRANSLATION_MODEL_STATE_CANDIDATES:
        if not state_path.exists():
            continue
        try:
            payload = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        tier = _normalize_translation_backend_tier(payload.get("tier") or "")
        if tier in TRANSLATION_TIER_ORDER and _translation_tier_is_installed(tier):
            return "llama.cpp"

    for tier in TRANSLATION_TIER_ORDER:
        if _translation_tier_is_installed(tier):
            return "llama.cpp"
    return "llama.cpp"


def _ensure_fasttext_lid_model_path() -> Path:
    if FASTTEXT_LID_MODEL_PATH.exists():
        return FASTTEXT_LID_MODEL_PATH
    FASTTEXT_LID_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(FASTTEXT_LID_MODEL_URL, timeout=30) as response:
            data = response.read()
    except Exception as exc:  # pragma: no cover - network dependent
        raise RuntimeError(
            "Unable to download fastText language ID model (lid.176.ftz). "
            "Check internet connection and retry."
        ) from exc

    FASTTEXT_LID_MODEL_PATH.write_bytes(data)
    return FASTTEXT_LID_MODEL_PATH


def _detect_language_fasttext(text: str) -> tuple[str, float]:
    try:
        fasttext = importlib.import_module("fasttext")
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError(
            "fastText runtime is unavailable. Install Python package 'fasttext-wheel' or 'fasttext'."
        ) from exc

    model_path = _ensure_fasttext_lid_model_path()
    try:
        detector = fasttext.load_model(str(model_path))
        labels, scores = detector.predict(text.replace("\n", " "), k=1)
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError(f"fastText language detection failed: {exc}") from exc

    label = labels[0] if labels else ""
    score = float(scores[0]) if scores else 0.0
    normalized = str(label).replace("__label__", "")
    if "_" in normalized:
        normalized = normalized.split("_", 1)[0]
    return normalized.lower(), score


_PADDLE_OCR_ENGINE_CACHE: tuple[object, bool, inspect.Signature] | None = None
_PADDLE_OCR_ENGINE_CACHE_KEY: str | None = None


def _translate_with_remote_service(text: str, source_lang: str, target_lang: str) -> str:
    if not OCR_REMOTE_TRANSLATE_URL:
        raise RuntimeError("Remote OCR translation URL is not configured.")

    payload = json.dumps(
        {
            "q": str(text or ""),
            "source": source_lang,
            "target": target_lang,
            "format": "text",
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        OCR_REMOTE_TRANSLATE_URL,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    timeout_seconds = max(1.0, float(OCR_REMOTE_TRANSLATE_TIMEOUT_MS) / 1000.0)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise RuntimeError(f"Remote OCR translation request failed: {exc}") from exc

    try:
        parsed = json.loads(body)
    except Exception as exc:
        raise RuntimeError("Remote OCR translation returned non-JSON response.") from exc

    translated_text = ""
    if isinstance(parsed, dict):
        translated_text = str(
            parsed.get("translatedText")
            or parsed.get("translation")
            or parsed.get("text")
            or ""
        ).strip()

    if not translated_text:
        raise RuntimeError("Remote OCR translation returned empty text.")
    return translated_text


def _resolve_llama_cli_path() -> Path:
    configured = os.environ.get("JPLEARN_LLAMA_CPP_PATH", "").strip()
    if configured:
        candidate = Path(configured)
        if candidate.exists():
            return candidate

    candidates = (
        Path(_assets_dir) / "tools" / "llama.cpp" / "build" / "bin" / "Release" / "llama-cli.exe"
        if _assets_dir
        else None,
        Path(_docs_dir) / "tools" / "llama.cpp" / "build" / "bin" / "Release" / "llama-cli.exe"
        if _docs_dir
        else None,
        PROJECT_ROOT / "tools" / "llama.cpp" / "build" / "bin" / "Release" / "llama-cli.exe",
        PROJECT_ROOT / "tools" / "llama.cpp" / "build" / "bin" / "llama-cli.exe",
    )
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    raise RuntimeError("llama-cli.exe not found. Install llama.cpp binaries first.")


def _resolve_llama_translation_model_path() -> Path:
    configured = os.environ.get("JPLEARN_LLAMA_MODEL_PATH", "").strip()
    if configured:
        candidate = Path(configured)
        if candidate.exists():
            return candidate

    model_file = LLAMA_TRANSLATION_MODEL_FILENAME
    candidates = (
        Path(_assets_dir) / "models" / "llama" / model_file
        if _assets_dir
        else None,
        Path(_docs_dir) / "models" / "llama" / model_file
        if _docs_dir
        else None,
        PROJECT_ROOT / "models" / "llama" / model_file,
    )
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    raise RuntimeError(f"llama translation model not found: {model_file}")


def _extract_llama_english_from_output(output: str) -> str:
    text = str(output or "")
    if not text.strip():
        return ""

    # Try to find the marker-delimited English section first.
    for marker in ("### English\n", "### English Translation\n"):
        if marker in text:
            text = text.split(marker, 1)[1]
            break

    lines = [line.strip() for line in text.splitlines() if line and line.strip()]
    if not lines:
        return ""

    filtered: list[str] = []
    for line in lines:
        lowered = line.lower()
        if lowered.startswith("llama_"):
            continue
        if lowered.startswith("main:") or lowered.startswith("sampling"):
            continue
        if lowered.startswith("### "):
            break
        filtered.append(line)

    return "\n".join(filtered).strip()


def _translate_with_llama_cpp(text: str, source_lang: str, target_lang: str) -> str:
    if source_lang != "ja" or target_lang != "en":
        raise ValueError("Only ja->en OCR translation is currently supported.")

    llama_cli = _resolve_llama_cli_path()
    model_path = _resolve_llama_translation_model_path()
    prompt = (
        "You are a Japanese to English translation engine.\n"
        "Translate the Japanese text below into natural English.\n"
        "Output only the English translation. Nothing else.\n"
        "Do not explain. Do not repeat the Japanese. Do not add notes.\n"
        "Do not output reasoning or thinking text.\n\n"
        "### Japanese\n"
        f"{text}\n\n"
        "### English\n"
    )
    command = [
        str(llama_cli),
        "-m",
        str(model_path),
        "-n",
        "160",
        "-c",
        "1536",
        "--temp",
        "0.0",
        "--top-p",
        "0.82",
        "--top-k",
        "24",
        "--repeat-penalty",
        "1.08",
        "-p",
        prompt,
    ]
    if LLAMA_TRANSLATION_GPU_LAYERS >= 0:
        command[3:3] = ["-ngl", str(LLAMA_TRANSLATION_GPU_LAYERS)]

    primary_timeout_seconds = max(5.0, float(LLAMA_TRANSLATION_TIMEOUT_MS) / 1000.0)

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=primary_timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        if LLAMA_TRANSLATION_STRICT:
            raise RuntimeError(f"llama.cpp translation timed out after {primary_timeout_seconds:.1f} seconds.")

        retry_command = list(command)
        if "-ngl" in retry_command:
            ngl_index = retry_command.index("-ngl")
            if ngl_index + 1 < len(retry_command):
                retry_command[ngl_index + 1] = "0"
        if "-n" in retry_command:
            n_index = retry_command.index("-n")
            if n_index + 1 < len(retry_command):
                retry_command[n_index + 1] = "96"
        if "-c" in retry_command:
            c_index = retry_command.index("-c")
            if c_index + 1 < len(retry_command):
                retry_command[c_index + 1] = "1024"

        try:
            result = subprocess.run(
                retry_command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=max(20.0, min(primary_timeout_seconds, 60.0)),
                check=False,
            )
        except Exception as exc:
            raise RuntimeError(f"llama.cpp translation failed after timeout recovery: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"llama.cpp translation failed: {exc}") from exc

    if result.returncode != 0:
        stderr_text = (result.stderr or "").strip()
        raise RuntimeError(f"llama.cpp translation exited with code {result.returncode}: {stderr_text}")

    translated_text = _extract_llama_english_from_output(result.stdout)
    if not translated_text:
        raise RuntimeError("llama.cpp translation returned empty text.")
    return translated_text


def translate_assistant_chat_ocr_payload(
    text_raw: str,
    source_lang: str = "ja",
    target_lang: str = "en",
    fast_mode: bool = False,
) -> dict[str, object]:
    total_start = perf_counter()
    timing: dict[str, object] = {}

    preprocess_start = perf_counter()
    text = _prepare_ocr_text_for_translation(text_raw)
    timing["preprocessMs"] = round((perf_counter() - preprocess_start) * 1000.0, 2)
    if not text:
        raise ValueError("OCR text is empty.")

    source = (source_lang or "ja").strip().lower()
    target = (target_lang or "en").strip().lower()
    if source != "ja" or target != "en":
        raise ValueError("Only ja->en OCR translation is currently supported.")

    # OCR sometimes produces mojibake/non-Japanese text. In that case, skip
    # model translation entirely and return a safe pass-through payload.
    if not _contains_japanese_script(text):
        timing["languageGateMs"] = 0.0
        timing["totalMs"] = round((perf_counter() - total_start) * 1000.0, 2)
        timing["debug"] = {
            "rawHadMultipleLines": "\n" in str(text_raw or ""),
            "preparedLength": len(text),
            "qualityThreshold": None,
            "appliedMultilineThreshold": False,
            "fastMode": fast_mode,
            "remoteFallbackConfigured": bool(OCR_REMOTE_TRANSLATE_URL),
            "remoteFallbackEnabled": OCR_REMOTE_FALLBACK_ENABLED,
            "remoteFallbackApplied": False,
        }
        return {
            "ok": True,
            "text": text,
            "backend": "pass-through",
            "timing": timing,
            "pipeline": {
                "applied": False,
                "reason": "source-not-japanese-pass-through",
            },
            "translation": {
                "chunking": {
                    "strategy": "pass-through",
                    "chunkCount": 1,
                },
                "quality": {
                    "score": 1.0,
                    "flags": ["source-not-japanese-pass-through"],
                    "retryCount": 0,
                    "retries": [],
                },
            },
            "languageGate": {
                "model": "fasttext-lid.176",
                "detectedLanguage": "unknown",
                "confidence": 0.0,
                "sourceContainsJapaneseScript": False,
                "containsJapaneseScript": False,
                "passed": True,
                "mode": "source-pass-through",
                "threshold": 0.45,
            },
        }

    configured_backend = os.environ.get("JPLEARN_TRANSLATION_BACKEND", "").strip().lower()
    backend = "llama.cpp" if configured_backend in {"", "llama", "llama.cpp", "llm", "qwen", "qwen_ja_en"} else _resolve_active_translation_backend()

    raw_ocr_text = str(text_raw or "")
    raw_had_multiple_lines = "\n" in raw_ocr_text
    # After one-line normalization, only treat as "multiline passage" when the
    # remaining content is still long enough to justify stricter quality checks.
    is_multiline_ocr = raw_had_multiple_lines and len(text) >= 180
    chunk_max_chars = 340 if is_multiline_ocr or len(text) > 220 else 520
    chunk_max_lines = 6 if is_multiline_ocr else 12
    chunk_overlap_lines = 1 if "\n" in text else 0

    initial_translation_start = perf_counter()
    translated_text, translation_meta = _translate_ocr_text_with_backend(
        text,
        backend=backend,
        source_lang=source,
        target_lang=target,
        chunk_max_chars=chunk_max_chars,
        chunk_max_lines=chunk_max_lines,
        chunk_overlap_lines=chunk_overlap_lines,
    )
    if backend == "llama.cpp" and int(translation_meta.get("fallbackChunkCount") or 0) > 0:
        backend = "llama.cpp+fallback"
    timing["initialTranslationMs"] = round((perf_counter() - initial_translation_start) * 1000.0, 2)

    pipeline_meta = {
        "applied": False,
        "reason": "legacy-pipeline-removed",
    }
    timing["pipelineMs"] = 0.0

    quality_start = perf_counter()
    quality_score, quality_flags = _translation_quality_score(text, translated_text)
    timing["qualityScoreMs"] = round((perf_counter() - quality_start) * 1000.0, 2)
    retries: list[dict[str, object]] = []

    quality_threshold = 0.64 if is_multiline_ocr else 0.48
    retry_total_start = perf_counter()
    if quality_score < quality_threshold:
        retry_specs: list[tuple[str, int, int, str]] = []
        if is_multiline_ocr or len(text) > 260:
            retry_specs.append((backend, 240, 2, "smaller-chunks"))

        best_candidate = {
            "text": translated_text,
            "backend": backend,
            "score": quality_score,
            "flags": quality_flags,
            "meta": translation_meta,
        }

        for retry_backend, retry_max_chars, retry_overlap, retry_reason in retry_specs:
            retry_start = perf_counter()
            try:
                retry_text, retry_meta = _translate_ocr_text_with_backend(
                    text,
                    backend=retry_backend,
                    source_lang=source,
                    target_lang=target,
                    chunk_max_chars=retry_max_chars,
                    chunk_max_lines=5 if is_multiline_ocr else 10,
                    chunk_overlap_lines=retry_overlap,
                )
            except Exception as exc:
                retries.append({
                    "reason": retry_reason,
                    "backend": retry_backend,
                    "ok": False,
                    "error": str(exc),
                    "durationMs": round((perf_counter() - retry_start) * 1000.0, 2),
                })
                continue

            retry_score, retry_flags = _translation_quality_score(text, retry_text)
            retries.append({
                "reason": retry_reason,
                "backend": retry_backend,
                "ok": True,
                "score": round(retry_score, 4),
                "flags": retry_flags,
                "chunking": retry_meta,
                "durationMs": round((perf_counter() - retry_start) * 1000.0, 2),
            })

            if retry_score > float(best_candidate["score"]):
                best_candidate = {
                    "text": retry_text,
                    "backend": retry_backend,
                    "score": retry_score,
                    "flags": retry_flags,
                    "meta": retry_meta,
                }

        if not fast_mode:
            for sentence_backend, sentence_reason in [(backend, "sentence-split")]:
                sentence_start = perf_counter()
                try:
                    sentence_text, sentence_meta = _translate_ocr_text_by_sentence(
                        text,
                        backend=sentence_backend,
                        source_lang=source,
                        target_lang=target,
                    )
                except Exception as exc:
                    retries.append({
                        "reason": sentence_reason,
                        "backend": sentence_backend,
                        "ok": False,
                        "error": str(exc),
                        "durationMs": round((perf_counter() - sentence_start) * 1000.0, 2),
                    })
                    continue

                sentence_score, sentence_flags = _translation_quality_score(text, sentence_text)
                retries.append({
                    "reason": sentence_reason,
                    "backend": sentence_backend,
                    "ok": True,
                    "score": round(sentence_score, 4),
                    "flags": sentence_flags,
                    "chunking": sentence_meta,
                    "durationMs": round((perf_counter() - sentence_start) * 1000.0, 2),
                })

                if sentence_score > float(best_candidate["score"]):
                    best_candidate = {
                        "text": sentence_text,
                        "backend": sentence_backend,
                        "score": sentence_score,
                        "flags": sentence_flags,
                        "meta": sentence_meta,
                    }
        else:
            retries.append({
                "reason": "sentence-split-skipped-fast-mode",
                "backend": backend,
                "ok": True,
                "skipped": True,
                "durationMs": 0.0,
            })

        translated_text = str(best_candidate["text"])
        backend = str(best_candidate["backend"])
        quality_score = float(best_candidate["score"])
        quality_flags = list(best_candidate["flags"])
        translation_meta = dict(best_candidate["meta"])
    timing["retryTotalMs"] = round((perf_counter() - retry_total_start) * 1000.0, 2)

    severe_quality_failure = quality_score < 0.32 or (
        "looped-phrase-repetition" in quality_flags
        and ("\n" in text or len(text) >= 140)
    ) or (
        "looped-phrase-repetition" in quality_flags
        and "dominant-word-repetition" in quality_flags
    )

    remote_fallback_applied = False
    if severe_quality_failure and OCR_REMOTE_FALLBACK_ENABLED and OCR_REMOTE_TRANSLATE_URL:
        remote_start = perf_counter()
        try:
            remote_text = _translate_with_remote_service(text, source, target)
            remote_score, remote_flags = _translation_quality_score(text, remote_text)
            retries.append({
                "reason": "remote-service-fallback",
                "backend": "remote",
                "ok": True,
                "score": round(remote_score, 4),
                "flags": remote_flags,
                "durationMs": round((perf_counter() - remote_start) * 1000.0, 2),
            })
            translated_text = remote_text
            backend = "remote"
            quality_score = remote_score
            quality_flags = remote_flags
            remote_fallback_applied = True
            severe_quality_failure = quality_score < 0.28
        except Exception as exc:
            retries.append({
                "reason": "remote-service-fallback",
                "backend": "remote",
                "ok": False,
                "error": str(exc),
                "durationMs": round((perf_counter() - remote_start) * 1000.0, 2),
            })

    if severe_quality_failure:
        # Preserve best-effort output instead of always replacing with a generic
        # failure message, which was overly strict for messy OCR passages.
        translated_text = str(translated_text or "").strip() or (
            "Translation quality is too low for a reliable result. "
            "Try a tighter OCR crop or a shorter passage."
        )
        pipeline_meta = {
            "applied": False,
            "reason": "quality-gate-best-effort-output",
        }
        quality_flags = list(dict.fromkeys([*quality_flags, "quality-gate-best-effort-output"]))
        quality_score = min(quality_score, 0.47)

    language_gate_start = perf_counter()
    detected_lang, detected_confidence = _detect_language_fasttext(translated_text)
    source_has_japanese_script = _contains_japanese_script(text)
    has_japanese_script = _contains_japanese_script(translated_text)
    english_gate_passed = detected_lang == "en" and detected_confidence >= 0.45 and not has_japanese_script

    # Mixed-script OCR snippets (JP + product names/acronyms) can yield low
    # fastText confidence even when translation output is valid English. Keep a
    # narrow fallback that still rejects Japanese output and non-JP sources.
    fallback_gate_passed = (
        not english_gate_passed
        and source_has_japanese_script
        and not has_japanese_script
        and _contains_latin_letters(translated_text)
        and len(translated_text) <= 120
        and translated_text.casefold() != text.casefold()
    )
    gate_passed = english_gate_passed or fallback_gate_passed

    if not gate_passed:
        # Do not hard-fail packaged/UI flows when OCR includes mixed or noisy text.
        # Return the best available output so the renderer can still show text.
        fallback_text = str(translated_text or "").strip() or str(text or "").strip()
        translated_text = fallback_text
        quality_flags = list(dict.fromkeys([*quality_flags, "language-gate-pass-through"]))
    timing["languageGateMs"] = round((perf_counter() - language_gate_start) * 1000.0, 2)
    timing["totalMs"] = round((perf_counter() - total_start) * 1000.0, 2)
    timing["debug"] = {
        "rawHadMultipleLines": raw_had_multiple_lines,
        "preparedLength": len(text),
        "qualityThreshold": quality_threshold,
        "appliedMultilineThreshold": is_multiline_ocr,
        "fastMode": fast_mode,
        "remoteFallbackConfigured": bool(OCR_REMOTE_TRANSLATE_URL),
        "remoteFallbackEnabled": OCR_REMOTE_FALLBACK_ENABLED,
        "remoteFallbackApplied": remote_fallback_applied,
    }

    return {
        "ok": True,
        "text": translated_text,
        "backend": backend,
        "timing": timing,
        "pipeline": pipeline_meta,
        "translation": {
            "chunking": translation_meta,
            "quality": {
                "score": round(quality_score, 4),
                "flags": quality_flags,
                "retryCount": len(retries),
                "retries": retries,
            },
        },
        "languageGate": {
            "model": "fasttext-lid.176",
            "detectedLanguage": detected_lang,
            "confidence": round(detected_confidence, 4),
            "sourceContainsJapaneseScript": source_has_japanese_script,
            "containsJapaneseScript": has_japanese_script,
            "passed": gate_passed,
            "mode": "strict" if english_gate_passed else "fallback-mixed-ocr" if fallback_gate_passed else "pass-through",
            "threshold": 0.45,
        },
    }

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


@dataclass(frozen=True)
class DictionaryCardSummary:
    character: str
    reading: str
    primary_gloss: str
    glosses: list[str]
    source: str

@dataclass(frozen=True)
class GameCard:
    id: int
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
    dictionary_conn: sqlite3.Connection | None = None
    if not use_lightweight_enrichment:
        db_path = _dictionary_db_path()
        if db_path is not None:
            candidate_conn = sqlite3.connect(db_path)
            if _dictionary_has_supported_schema(candidate_conn):
                dictionary_conn = candidate_conn
            else:
                candidate_conn.close()

    try:
        cards = [
            GameCard(
                id=card.id,
                character=card.character,
                romaji=card.romaji,
                meaning=card.meaning,
                tags=card.tags,
                example_sentence=card.example_sentence,
                dictionary_summary=(
                    None
                    if use_lightweight_enrichment
                    else _lookup_card_dictionary_summary(
                        dictionary_conn,
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
    finally:
        if dictionary_conn is not None:
            dictionary_conn.close()

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

_VALID_LEARNING_PATH_IDS: frozenset[str] = frozenset(LEARNING_PATHS.keys())


def build_learning_path_status_payload() -> dict[str, object]:
    """Return the learner's current learning path status."""
    init_study_db()
    path_id_raw = get_setting("active_learning_path")
    path_id = path_id_raw if path_id_raw in _VALID_LEARNING_PATH_IDS else None
    onboarding_raw = get_setting("onboarding_complete")
    onboarding_complete = onboarding_raw == "1"
    prog_state = _load_progression_state()
    status = build_learning_path_status(
        path_id=path_id,  # type: ignore[arg-type]
        onboarding_complete=onboarding_complete,
        state=prog_state,
    )
    return {
        "path_id": status.path_id,
        "path_name": status.path_name,
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


def set_learning_path_handler(path_id: str) -> dict[str, object]:
    """Persist the learner's chosen path and return the updated status."""
    if path_id not in _VALID_LEARNING_PATH_IDS:
        raise ValueError(f"Unknown learning path: {path_id!r}")
    init_study_db()
    set_setting("active_learning_path", path_id)
    set_setting("onboarding_complete", "1")
    return build_learning_path_status_payload()


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
    """Resolve semantic scorer for dictionary reranking.

    Prefers the installed ONNX embedder mapped to the active chatbot tier.
    Falls back to the deterministic hashed embedder so semantic reranking still
    works in development/test environments without optional ML dependencies.
    """

    from domain.retrieval import cosine_similarity, embed_text

    try:
        import embedder_runtime
    except ImportError:
        embedder_runtime = None

    active_tier = _read_active_chatbot_tier()
    embedder_tier = (
        embedder_runtime.resolve_embedder_tier_for_chatbot_tier(active_tier)
        if embedder_runtime and active_tier
        else None
    )

    if embedder_runtime and embedder_tier and embedder_runtime.is_available(embedder_tier):
        def _score_with_real_embedder(query: str, candidates: list[str]) -> list[float]:
            if not candidates:
                return []
            query_vector = embedder_runtime.encode_text(query, embedder_tier, is_query=True)
            candidate_vectors = embedder_runtime.encode_texts(candidates, embedder_tier, is_query=False)
            return [cosine_similarity(query_vector, vector) for vector in candidate_vectors]

        return _score_with_real_embedder

    def _score_with_hashed_embedder(query: str, candidates: list[str]) -> list[float]:
        if not candidates:
            return []
        query_vector = embed_text(query)
        return [cosine_similarity(query_vector, embed_text(candidate)) for candidate in candidates]

    return _score_with_hashed_embedder


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

    if command == "grammar-minigame-data":
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

    if command == "dictionary-search":
        if len(argv) < 2:
            return 2, {"error": "Usage: dictionary-search <query>"}
        try:
            return 0, build_dictionary_search_payload(argv[1])
        except (FileNotFoundError, ValueError) as exc:
            return 2, {"error": str(exc)}

    if command == "lookup-sentence":
        if len(argv) < 2:
            return 2, {"error": "Usage: lookup-sentence <query>"}
        return 0, lookup_sentence(argv[1])

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

    if command == "assistant-chat-context-v2":
        session_id = argv[1].strip() if len(argv) > 1 and argv[1].strip() else None
        user_message = argv[2] if len(argv) > 2 and argv[2].strip() else None
        return 0, get_assistant_chat_context_v2(session_id=session_id, user_message=user_message)

    if command == "assistant-chat-ocr":
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

    if command == "assistant-chat-translate-ocr":
        if len(argv) < 2:
            return 2, {"error": "Usage: assistant-chat-translate-ocr <text> [source_lang] [target_lang] [fast_mode]"}
        text_arg = argv[1]
        if text_arg.startswith("base64:"):
            encoded = text_arg[len("base64:"):]
            try:
                decoded_bytes = base64.b64decode(encoded.encode("ascii"), validate=True)
                text_arg = decoded_bytes.decode("utf-8", errors="replace")
            except Exception:
                return 2, {"error": "Invalid base64 OCR text payload."}
        source_lang = argv[2] if len(argv) > 2 and argv[2].strip() else "ja"
        target_lang = argv[3] if len(argv) > 3 and argv[3].strip() else "en"
        fast_mode_raw = argv[4].strip().lower() if len(argv) > 4 else ""
        fast_mode = fast_mode_raw in {"1", "true", "yes", "on"}
        try:
            return 0, translate_assistant_chat_ocr_payload(
                text_arg,
                source_lang=source_lang,
                target_lang=target_lang,
                fast_mode=fast_mode,
            )
        except (RuntimeError, ValueError) as exc:
            return 2, {"error": str(exc)}

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

    if command == "jlpt-readiness":
        try:
            return 0, build_jlpt_readiness_payload()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "jlpt-exam-queue":
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

    if command == "jlpt-save-result":
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

    if command == "jlpt-exam-history":
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

    if command == "learning-path-status":
        try:
            return 0, build_learning_path_status_payload()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "set-learning-path":
        if len(argv) < 2:
            return 2, {"error": "Usage: set-learning-path <path_id>"}
        try:
            return 0, set_learning_path_handler(argv[1])
        except ValueError as exc:
            return 2, {"error": str(exc)}

    if command == "complete-onboarding":
        try:
            goal = argv[1] if len(argv) > 1 and argv[1].strip() else None
            daily_minutes = argv[2] if len(argv) > 2 and argv[2].strip() else None
            target_level = argv[3] if len(argv) > 3 and argv[3].strip() else None
            return 0, complete_onboarding_handler(goal, daily_minutes, target_level)
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "mark-onboarding-pending":
        try:
            return 0, mark_onboarding_pending_handler()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "analytics-export":
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

    if command == "diagnostics":
        try:
            return 0, build_diagnostics_report()
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "snapshot":
        try:
            return 0, build_snapshot(max_files=50)
        except Exception as exc:
            return 2, {"error": str(exc)}

    if command == "run-check":
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
