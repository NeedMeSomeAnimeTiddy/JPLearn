"""Queries against the offline dictionary index (jmdict_lookup.sqlite).

This is a separate, read-only external database under
``data/external_sources/offline_dictionary`` — not ``data/jplearn.db``. It has
no migrations; the index is downloaded/installed as a prebuilt file.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import unicodedata
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from data.card_notes_repository import build_offline_note_key, canonical_jmdict_source_id
from data.text_normalization import contains_japanese_script
from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS
from domain.retrieval import cosine_similarity, embed_text

PROJECT_ROOT = Path(__file__).resolve().parents[1]

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

_DICTIONARY_RESULT_LIMIT = 120
_KANJI_DETAIL_SCHEMA_VERSION = "4"
_KANJI_COMPOUND_LIMIT = 12
_KANJI_READING_EXAMPLE_LIMIT = 2
_KANJI_DETAIL_REQUIRED_COLUMNS = {
    "kanji_details": {
        "character",
        "meanings_json",
        "on_readings_json",
        "kun_readings_json",
        "jlpt_level",
        "stroke_count",
        "classical_radical_number",
    },
    "kanji_radicals": {
        "character",
        "position",
        "radical",
        "stroke_count",
        "code",
    },
    "dictionary_kanji_index": {"character", "entry_id"},
}
_KANJI_DETAIL_REQUIRED_METADATA = {
    "schema_version",
    "kanji_details_count",
    "kanji_radicals_count",
    "dictionary_kanji_index_count",
}
# If the common-word tier returns fewer than this many hits, also search the
# rest of the dictionary (rare/obscure entries, foreign-greeting loanwords,
# etc.) and append those below the common results.
_DICTIONARY_COMMON_FALLBACK_THRESHOLD = 5
_DICTIONARY_KATAKANA_ONLY_RE = re.compile(r"^[゠-ヿー・\s]+$")
_KATAKANA_TO_HIRAGANA_SHIFT = 0x60
_DICTIONARY_SEMANTIC_RERANK_LIMIT = 80
_DICTIONARY_GREETINGS_QUERY_BOOST = {
    "hello",
    "hi",
    "good day",
    "good afternoon",
    "greetings",
}

# Lazy-loaded fugashi tagger for dictionary query deinflection.
_fugashi_tagger: object | None = None


@dataclass(frozen=True)
class PitchAccent:
    reading: str
    pitch_positions: list[int]
    mora_count: int
    source: str


@dataclass(frozen=True)
class DictionaryCardSummary:
    character: str
    reading: str
    primary_gloss: str
    glosses: list[str]
    source: str
    pitch_accents: list[PitchAccent]


@dataclass(frozen=True)
class KanjiRadical:
    position: int
    radical: str
    stroke_count: int | None
    code: str | None


@dataclass(frozen=True)
class KanjiReadingExample:
    word: str
    reading: str
    meanings: list[str]
    is_common: bool


@dataclass(frozen=True)
class KanjiReading:
    reading: str
    examples: list[KanjiReadingExample]


@dataclass(frozen=True)
class KanjiCompound:
    word: str
    reading: str
    meanings: list[str]
    is_common: bool


@dataclass(frozen=True)
class KanjiDetailPayload:
    character: str
    meanings: list[str]
    on_readings: list[KanjiReading]
    kun_readings: list[KanjiReading]
    radicals: list[KanjiRadical]
    jlpt_level: str | None
    jlpt_level_source: str | None
    stroke_count: int | None
    classical_radical_number: int | None
    tags: list[str]
    categories: list[str]
    compounds: list[KanjiCompound]
    has_more_compounds: bool
    source: str


# A callable that scores each candidate gloss text against a query, returning
# one similarity score per candidate (same order, same length).
SemanticEmbedder = Callable[[str, list[str]], list[float]]


def _default_semantic_embedder(query: str, candidates: list[str]) -> list[float]:
    """Dependency-free hashed embedder fallback (no optional ML dependencies)."""
    if not candidates:
        return []
    query_vector = embed_text(query)
    return [cosine_similarity(query_vector, embed_text(candidate)) for candidate in candidates]


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
    if contains_japanese_script(normalized):
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


def _get_fugashi_tagger() -> object | None:
    """Return a fugashi Tagger instance (cached), or None if unavailable."""
    global _fugashi_tagger
    if _fugashi_tagger is None:
        try:
            import fugashi  # type: ignore[import-untyped]

            _fugashi_tagger = fugashi.Tagger()
        except Exception:
            return None
    return _fugashi_tagger


def _deinflect_query(query: str) -> list[str]:
    """Use fugashi to find base (dictionary) forms for a Japanese query.
    Returns lemmas for content words (nouns, verbs, adjectives).
    """
    tagger = _get_fugashi_tagger()
    if tagger is None:
        return []

    from typing import Any

    tagger_any: Any = tagger
    lemmas: list[str] = []
    for word in tagger_any(query):
        pos1 = word.feature.pos1
        if pos1 in ("名詞", "動詞", "形容詞", "形容動詞"):
            lemma = getattr(word.feature, "orthBase", "") or getattr(word.feature, "lemma", "")
            if lemma and lemma not in lemmas:
                lemmas.append(lemma)
    return lemmas


def _katakana_to_hiragana(text: str) -> str:
    """Convert katakana to hiragana using the Unicode code point offset."""
    result: list[str] = []
    for ch in text:
        cp = ord(ch)
        if 0x30A1 <= cp <= 0x30F6:  # standard katakana range
            result.append(chr(cp - _KATAKANA_TO_HIRAGANA_SHIFT))
        else:
            result.append(ch)
    return "".join(result)


def _dictionary_has_supported_schema(conn: sqlite3.Connection) -> bool:
    table_names = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
    }
    return "dictionary_entries" in table_names and "dictionary_fts" in table_names


def _dictionary_has_kanji_detail_schema(conn: sqlite3.Connection) -> bool:
    table_names = {
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    required_tables = {
        "dictionary_entries",
        "dictionary_metadata",
        *_KANJI_DETAIL_REQUIRED_COLUMNS,
    }
    if not required_tables.issubset(table_names):
        return False

    index_row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?",
        ("idx_dictionary_kanji_index_character_entry",),
    ).fetchone()
    if index_row is None:
        return False

    metadata = dict(
        conn.execute(
            "SELECT key, value FROM dictionary_metadata WHERE key IN (?, ?, ?, ?)",
            tuple(sorted(_KANJI_DETAIL_REQUIRED_METADATA)),
        )
    )
    if set(metadata) != _KANJI_DETAIL_REQUIRED_METADATA:
        return False
    if str(metadata["schema_version"]) != _KANJI_DETAIL_SCHEMA_VERSION:
        return False
    try:
        if any(int(metadata[key]) < 0 for key in _KANJI_DETAIL_REQUIRED_METADATA - {"schema_version"}):
            return False
    except (TypeError, ValueError):
        return False

    for table_name, required_columns in _KANJI_DETAIL_REQUIRED_COLUMNS.items():
        columns = {
            str(row[1])
            for row in conn.execute(f"PRAGMA table_info({table_name})")
        }
        if not required_columns.issubset(columns):
            return False
    return True


def _is_han_character(value: str) -> bool:
    if len(value) != 1:
        return False
    name = unicodedata.name(value, "")
    return name.startswith("CJK UNIFIED IDEOGRAPH-") or name.startswith(
        "CJK COMPATIBILITY IDEOGRAPH-"
    )


def _validate_kanji_detail_character(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).strip()
    if not _is_han_character(normalized):
        raise ValueError("Kanji detail character must be exactly one Unicode Han character")
    return normalized


def _load_string_list_json(raw_value: object, field_name: str) -> list[str]:
    try:
        decoded = json.loads(str(raw_value))
    except json.JSONDecodeError as exc:
        raise sqlite3.DatabaseError(
            f"Offline dictionary {field_name} contains malformed JSON"
        ) from exc
    if not isinstance(decoded, list) or not all(isinstance(item, str) for item in decoded):
        raise sqlite3.DatabaseError(
            f"Offline dictionary {field_name} must contain a JSON string array"
        )
    return list(dict.fromkeys(item.strip() for item in decoded if item.strip()))


def _normalize_kanji_reading_for_match(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    normalized = re.sub(r"[.・･\-‐‑‒–—―]", "", normalized)
    return _katakana_to_hiragana(normalized)


def _deck_metadata_for_kanji(character: str) -> tuple[list[str], list[str], str | None]:
    tags: list[str] = []
    categories: list[str] = []
    for slug, factory in ALL_DECKS.items():
        if not slug.startswith("kanji_"):
            continue
        deck = factory()
        matching_cards = [card for card in deck.cards if card.character == character]
        if not matching_cards:
            continue
        # Thematic categories are views over their parent level deck since issue
        # #78, so they report the parent's name. The authored label ("Kanji: N5 ·
        # Numbers & Time") is what belongs in a detail panel, so read it from the
        # source builder rather than the view.
        source = CATEGORY_SOURCE_DECKS.get(slug)
        display_name = source().name if source is not None else deck.name
        if display_name not in categories:
            categories.append(display_name)
        for card in matching_cards:
            for tag in card.tags:
                if tag not in tags:
                    tags.append(tag)

    fallback_level = next(
        (tag.upper() for tag in tags if re.fullmatch(r"n[1-5]", tag.lower())),
        None,
    )
    return tags, categories, fallback_level


def _reading_examples_by_normalized_reading(
    conn: sqlite3.Connection,
    character: str,
) -> dict[str, list[KanjiReadingExample]]:
    rows = conn.execute(
        """
        SELECT japanese, reading, gloss, is_common
        FROM dictionary_entries
        WHERE japanese = ?
        ORDER BY is_common DESC, entry_id
        """,
        (character,),
    ).fetchall()
    examples: dict[str, list[KanjiReadingExample]] = {}
    for word, reading, gloss, is_common in rows:
        normalized_reading = _normalize_kanji_reading_for_match(str(reading))
        if not normalized_reading:
            continue
        bucket = examples.setdefault(normalized_reading, [])
        if len(bucket) >= _KANJI_READING_EXAMPLE_LIMIT:
            continue
        bucket.append(
            KanjiReadingExample(
                word=str(word),
                reading=str(reading),
                meanings=_split_dictionary_glosses(str(gloss)),
                is_common=bool(is_common),
            )
        )
    return examples


def _build_kanji_readings(
    readings: list[str],
    examples_by_reading: dict[str, list[KanjiReadingExample]],
) -> list[KanjiReading]:
    return [
        KanjiReading(
            reading=reading,
            examples=list(
                examples_by_reading.get(_normalize_kanji_reading_for_match(reading), [])
            ),
        )
        for reading in readings
    ]


def _load_kanji_compounds(
    conn: sqlite3.Connection,
    character: str,
) -> tuple[list[KanjiCompound], bool]:
    rows = conn.execute(
        """
        SELECT e.japanese, e.reading, e.gloss, e.is_common
        FROM dictionary_kanji_index AS i
             INDEXED BY idx_dictionary_kanji_index_character_entry
        JOIN dictionary_entries AS e ON e.entry_id = i.entry_id
        WHERE i.character = ? AND e.japanese <> ?
        ORDER BY e.is_common DESC, LENGTH(e.japanese), e.entry_id
        LIMIT ?
        """,
        (character, character, _KANJI_COMPOUND_LIMIT + 1),
    ).fetchall()
    compounds = [
        KanjiCompound(
            word=str(word),
            reading=str(reading),
            meanings=_split_dictionary_glosses(str(gloss)),
            is_common=bool(is_common),
        )
        for word, reading, gloss, is_common in rows[:_KANJI_COMPOUND_LIMIT]
    ]
    return compounds, len(rows) > _KANJI_COMPOUND_LIMIT


def _dictionary_has_pitch_accent_data(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dictionary_pitch_accents'"
    ).fetchone()
    return row is not None


def _lookup_pitch_accents(
    conn: sqlite3.Connection | None,
    *,
    word: str,
    reading: str,
    available: bool | None = None,
) -> list[PitchAccent]:
    if conn is None or available is False:
        return []
    if available is None and not _dictionary_has_pitch_accent_data(conn):
        return []

    row = conn.execute(
        """
        SELECT reading, pitch_positions, mora_count, source
        FROM dictionary_pitch_accents
        WHERE word = ? AND reading = ?
        """,
        (_normalize_dictionary_query(word), _normalize_dictionary_query(reading)),
    ).fetchone()
    if row is None:
        return []

    try:
        raw_positions = json.loads(str(row[1]))
    except json.JSONDecodeError:
        return []
    if not isinstance(raw_positions, list):
        return []
    pitch_positions = [
        position
        for position in raw_positions
        if isinstance(position, int) and not isinstance(position, bool) and position >= 0
    ]
    mora_count = int(row[2])
    if not pitch_positions or mora_count <= 0:
        return []

    return [
        PitchAccent(
            reading=str(row[0]),
            pitch_positions=pitch_positions,
            mora_count=mora_count,
            source=str(row[3]),
        )
    ]


def _search_dictionary_rows(
    conn: sqlite3.Connection,
    normalized_query: str,
    *,
    semantic_embed: SemanticEmbedder,
) -> list[tuple]:
    if contains_japanese_script(normalized_query):
        return _search_dictionary_japanese(conn, normalized_query)
    return _search_dictionary_english(conn, normalized_query, semantic_embed=semantic_embed)


def _dictionary_results_from_rows(
    rows: list[tuple],
    conn: sqlite3.Connection,
) -> list[dict[str, object]]:
    pitch_accent_available = _dictionary_has_pitch_accent_data(conn)
    return [
        {
            "id": int(row[0]),
            "source_id": canonical_jmdict_source_id(
                str(row[1]) if row[1] is not None else None
            ),
            "note_key": build_offline_note_key(
                str(row[1]) if row[1] is not None else None,
                str(row[2]),
                str(row[3]),
            ),
            "character": row[2],
            "romaji": row[3],
            "meaning": row[4],
            "tags": ["offline_dictionary"],
            "example_sentence": None,
            "pitch_accents": [
                asdict(accent)
                for accent in _lookup_pitch_accents(
                    conn,
                    word=str(row[2]),
                    reading=str(row[3]),
                    available=pitch_accent_available,
                )
            ],
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
        row_character = _normalize_dictionary_query(str(row[2]))
        row_gloss = _normalize_dictionary_query(str(row[4]))
        exact_character = 1 if row_character == normalized_character else 0
        meaning_match = 1 if normalized_meaning and normalized_meaning in row_gloss else 0
        starts_with_character = 1 if row_character.startswith(normalized_character) else 0
        return (exact_character, meaning_match, starts_with_character)

    ranked_rows = sorted(
        rows,
        key=lambda row: (_score(row), -len(str(row[2]))),
        reverse=True,
    )
    return ranked_rows[0] if ranked_rows else None


def _lookup_card_dictionary_summary(
    conn: sqlite3.Connection | None,
    *,
    character: str,
    meaning: str,
    tags: list[str],
    pitch_accent_available: bool | None = None,
) -> DictionaryCardSummary | None:
    if conn is None or not _should_enrich_card_from_dictionary(tags):
        return None

    normalized_character = _normalize_dictionary_query(character)
    if not normalized_character or not contains_japanese_script(normalized_character):
        return None

    rows = _search_dictionary_japanese(conn, normalized_character)
    match = _select_dictionary_row(rows, character, meaning)
    if match is None:
        return None

    glosses = _split_dictionary_glosses(str(match[4]))
    if not glosses:
        return None

    return DictionaryCardSummary(
        character=str(match[2]),
        reading=str(match[3]),
        primary_gloss=glosses[0],
        glosses=glosses,
        source="offline_dictionary",
        pitch_accents=_lookup_pitch_accents(
            conn,
            word=str(match[2]),
            reading=str(match[3]),
            available=pitch_accent_available,
        ),
    )


# Upper bound for a prefix range. U+FFFF is a permanent noncharacter, so no
# dictionary headword can sort between "<prefix>" and "<prefix>￿".
_PREFIX_RANGE_SENTINEL = "￿"

# Prefix search as an explicit half-open range over each indexed column,
# unioned, rather than one `OR` chain of `=`/`LIKE`.
#
# The `OR` across two columns made SQLite fall back to the two-valued
# `idx_dictionary_entries_common`, scanning ~half of 217k rows and then sorting
# through a temp B-tree — 12ms per lookup, which is 40 seconds across a
# 744-card vocabulary deck (issue #78 made the whole level deck load at once,
# which is what surfaced it). Splitting into a UNION lets each branch use its
# own index, and `>= ? AND < ?` is range-optimisable where `LIKE ?` is not:
# SQLite only converts `LIKE 'x%'` into a range when `case_sensitive_like` is
# on, which it is not by default. Measured at 0.18ms, and `+is_common`
# keeps the planner off the low-cardinality index. The range subsumes the
# equality case, so the `=` branches are gone.
#
# One deliberate narrowing: this is now case-sensitive where `LIKE` was not.
# Callers reach here only for queries containing Japanese script, where case
# does not apply; a mixed headword like "Tシャツ" now needs matching case.
_DICTIONARY_PREFIX_SQL = (
    "SELECT entry_id, source_id, japanese, reading, gloss FROM ("
    "SELECT entry_id, source_id, japanese, reading, gloss FROM dictionary_entries "
    "WHERE japanese >= ? AND japanese < ? AND +is_common = ? "
    "UNION "
    "SELECT entry_id, source_id, japanese, reading, gloss FROM dictionary_entries "
    "WHERE reading >= ? AND reading < ? AND +is_common = ?"
    ") ORDER BY LENGTH(japanese), entry_id "
    "LIMIT ?"
)


def _search_dictionary_japanese(conn: sqlite3.Connection, normalized_query: str) -> list[tuple]:
    def _run_search(query: str) -> list[tuple]:
        upper = f"{query}{_PREFIX_RANGE_SENTINEL}"

        def _params(is_common: int, limit: int) -> list[object]:
            return [query, upper, is_common, query, upper, is_common, limit]

        rows = conn.execute(
            _DICTIONARY_PREFIX_SQL, _params(1, _DICTIONARY_RESULT_LIMIT)
        ).fetchall()
        if len(rows) < _DICTIONARY_COMMON_FALLBACK_THRESHOLD:
            seen_ids = {row[0] for row in rows}
            remaining = _DICTIONARY_RESULT_LIMIT - len(rows)
            extra_rows = conn.execute(_DICTIONARY_PREFIX_SQL, _params(0, remaining)).fetchall()
            rows.extend(row for row in extra_rows if row[0] not in seen_ids)
        return rows

    def _try_queries(queries: list[str]) -> list[tuple]:
        for q in queries:
            rows = _run_search(q)
            if rows:
                return rows
        return []

    # Build a list of queries to try: deinflected lemmas first (exact
    # dictionary forms), then hiragana form, then katakana original, then
    # progressively shorter prefixes to find the root word.
    candidates: list[str] = []

    # Try fugashi lemmas first — they give exact dictionary headwords.
    lemma_candidates = _deinflect_query(normalized_query)
    candidates.extend(lemma_candidates)

    is_katakana = _DICTIONARY_KATAKANA_ONLY_RE.fullmatch(normalized_query)
    if is_katakana:
        hiragana_query = _katakana_to_hiragana(normalized_query)
        if hiragana_query != normalized_query:
            candidates.append(hiragana_query)

    candidates.append(normalized_query)

    # Add progressively shorter prefixes of the first candidates (lemma or
    # hiragana form if available, otherwise original).
    base = candidates[0] if candidates else normalized_query
    prefix_len = len(base) - 1
    while prefix_len >= 2:
        if base[:prefix_len] not in candidates:
            candidates.append(base[:prefix_len])
        prefix_len -= 1

    return _try_queries(candidates)


def _search_dictionary_english(
    conn: sqlite3.Connection,
    normalized_query: str,
    *,
    semantic_embed: SemanticEmbedder,
) -> list[tuple]:
    # Each word must appear as a prefix somewhere in the gloss, ranked by bm25
    # within each tier first, then re-ranked with learner-friendly heuristics.
    query_terms = _dictionary_query_terms(normalized_query)
    match_expr = " AND ".join(f'"{_escape_fts5_term(term)}"*' for term in query_terms)

    candidate_limit = max(_DICTIONARY_RESULT_LIMIT * 4, 40)

    base_sql = (
        "SELECT e.entry_id, e.source_id, e.japanese, e.reading, e.gloss, "
        "bm25(dictionary_fts) AS score "
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
    if rows:
        semantic_candidates = rows[: min(len(rows), _DICTIONARY_SEMANTIC_RERANK_LIMIT)]
        semantic_texts = [str(row[4]) for row in semantic_candidates]
        try:
            semantic_scores = semantic_embed(normalized_query, semantic_texts)
            for row, score in zip(semantic_candidates, semantic_scores):
                semantic_scores_by_id[int(row[0])] = float(score)
        except Exception:
            # Semantic scoring is an optional ranking enhancement; lexical
            # ranking remains authoritative when embedder inference fails.
            semantic_scores_by_id = {}

    def _rank_row(row: tuple) -> tuple:
        japanese = str(row[2])
        reading = str(row[3])
        gloss_text = str(row[4])
        bm25_score = float(row[5]) if len(row) > 5 and row[5] is not None else 0.0

        glosses = [_normalize_dictionary_query(part) for part in _split_dictionary_glosses(gloss_text)]
        exact_gloss_match = 1 if normalized_query in glosses else 0
        prefix_gloss_match = 1 if any(gloss.startswith(normalized_query) for gloss in glosses) else 0
        whole_word_hits = sum(
            1
            for term in query_terms
            if re.search(rf"\\b{re.escape(term)}\\b", _normalize_dictionary_query(gloss_text))
        )

        has_native_script = 1 if re.search(r"[぀-ゟ一-鿿]", japanese) else 0
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
    return [tuple(row[:5]) for row in ranked_rows[:_DICTIONARY_RESULT_LIMIT]]


def build_dictionary_search_payload(
    query: str,
    *,
    semantic_embed: SemanticEmbedder | None = None,
) -> dict[str, object]:
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

        fetched_rows = _search_dictionary_rows(
            conn,
            normalized_query,
            semantic_embed=semantic_embed or _default_semantic_embedder,
        )
        results = _dictionary_results_from_rows(fetched_rows, conn)
    finally:
        conn.close()

    return {
        "query": normalized_query,
        "source": "offline_dictionary",
        "results": results,
    }


def build_kanji_detail_payload(character: str) -> dict[str, object]:
    validated_character = _validate_kanji_detail_character(character)
    db_path = _dictionary_db_path()
    if db_path is None:
        raise FileNotFoundError("Offline dictionary index is not installed")

    database_uri = f"{db_path.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(database_uri, uri=True)
    try:
        if not _dictionary_has_kanji_detail_schema(conn):
            raise FileNotFoundError(
                "Offline dictionary kanji detail index is outdated; please re-download it"
            )

        detail_row = conn.execute(
            """
            SELECT meanings_json, on_readings_json, kun_readings_json,
                   jlpt_level, stroke_count, classical_radical_number
            FROM kanji_details
            WHERE character = ?
            """,
            (validated_character,),
        ).fetchone()
        if detail_row is None:
            meanings: list[str] = []
            on_reading_values: list[str] = []
            kun_reading_values: list[str] = []
            kanjidic_jlpt_level = None
            stroke_count = None
            classical_radical_number = None
        else:
            meanings = _load_string_list_json(detail_row[0], "meanings_json")
            on_reading_values = _load_string_list_json(detail_row[1], "on_readings_json")
            kun_reading_values = _load_string_list_json(detail_row[2], "kun_readings_json")
            kanjidic_jlpt_level = str(detail_row[3]) if detail_row[3] is not None else None
            stroke_count = int(detail_row[4]) if detail_row[4] is not None else None
            classical_radical_number = int(detail_row[5]) if detail_row[5] is not None else None

        radicals = [
            KanjiRadical(
                position=int(position),
                radical=str(radical),
                stroke_count=int(radical_stroke_count)
                if radical_stroke_count is not None
                else None,
                code=str(code) if code is not None else None,
            )
            for position, radical, radical_stroke_count, code in conn.execute(
                """
                SELECT position, radical, stroke_count, code
                FROM kanji_radicals
                WHERE character = ?
                ORDER BY position
                """,
                (validated_character,),
            )
        ]
        examples_by_reading = _reading_examples_by_normalized_reading(
            conn,
            validated_character,
        )
        compounds, has_more_compounds = _load_kanji_compounds(conn, validated_character)
    finally:
        conn.close()

    tags, categories, deck_jlpt_level = _deck_metadata_for_kanji(validated_character)
    jlpt_level = kanjidic_jlpt_level or deck_jlpt_level
    jlpt_level_source = (
        "kanjidic" if kanjidic_jlpt_level else "deck" if deck_jlpt_level else None
    )
    payload = KanjiDetailPayload(
        character=validated_character,
        meanings=meanings,
        on_readings=_build_kanji_readings(on_reading_values, examples_by_reading),
        kun_readings=_build_kanji_readings(kun_reading_values, examples_by_reading),
        radicals=radicals,
        jlpt_level=jlpt_level,
        jlpt_level_source=jlpt_level_source,
        stroke_count=stroke_count,
        classical_radical_number=classical_radical_number,
        tags=tags,
        categories=categories,
        compounds=compounds,
        has_more_compounds=has_more_compounds,
        source="offline_dictionary",
    )
    return asdict(payload)


@contextmanager
def open_enrichment_session() -> Generator[
    Callable[..., DictionaryCardSummary | None] | None, None, None
]:
    """Open one dictionary connection reused across many per-card lookups.

    Yields a ``lookup(*, character, meaning, tags)`` callable, or None when
    the offline dictionary isn't installed or has an unsupported schema.
    """
    conn: sqlite3.Connection | None = None
    try:
        db_path = _dictionary_db_path()
        if db_path is not None:
            candidate_conn = sqlite3.connect(db_path)
            if _dictionary_has_supported_schema(candidate_conn):
                conn = candidate_conn
            else:
                candidate_conn.close()

        if conn is None:
            yield None
            return

        pitch_accent_available = _dictionary_has_pitch_accent_data(conn)

        def _lookup(*, character: str, meaning: str, tags: list[str]) -> DictionaryCardSummary | None:
            return _lookup_card_dictionary_summary(
                conn,
                character=character,
                meaning=meaning,
                tags=tags,
                pitch_accent_available=pitch_accent_available,
            )

        yield _lookup
    finally:
        if conn is not None:
            conn.close()
