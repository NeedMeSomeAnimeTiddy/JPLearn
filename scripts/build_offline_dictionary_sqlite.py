#!/usr/bin/env python3
"""Build a compact SQLite lookup index from JMdict-simplified JSON.

The index uses a real SQLite FTS5 virtual table (external-content) over the
English gloss text, which gives us proper tokenization, prefix queries and
bm25 relevance ranking instead of a hand-rolled per-token lookup table. See
https://www.sqlite.org/fts5.html for the reference this design follows.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import unicodedata
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 4

DEFAULT_INPUT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/jmdict-eng-3.6.2.json"),
    Path("data/external_sources/offline_dictionary/jmdict-eng-common-3.6.2.json"),
]
DEFAULT_OUTPUT = Path("data/external_sources/offline_dictionary/jmdict_lookup.sqlite")
DEFAULT_PITCH_ACCENT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/pitch-accent.json"),
]
DEFAULT_KANJIDIC_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/kanjidic2-en-3.6.2.json"),
]
DEFAULT_KRADFILE_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/kradfile-3.6.2.json"),
]
DEFAULT_RADKFILE_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/radkfile-3.6.2.json"),
]

KanjiDetailRow = tuple[str, str, str, str, str | None, int | None, int | None]
KanjiRadicalRow = tuple[str, int, str, int | None, str | None]
RadicalMetadata = tuple[int, str | None]


def first_gloss(entry: dict[str, Any]) -> str:
    senses = entry.get("sense")
    if not isinstance(senses, list):
        return ""
    for sense in senses:
        if not isinstance(sense, dict):
            continue
        glosses = sense.get("gloss")
        if not isinstance(glosses, list):
            continue
        for gloss in glosses:
            if isinstance(gloss, str) and gloss.strip():
                return gloss.strip()
            if isinstance(gloss, dict):
                text = gloss.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
    return ""


def all_glosses(entry: dict[str, Any]) -> list[str]:
    results: list[str] = []
    senses = entry.get("sense")
    if not isinstance(senses, list):
        return results
    for sense in senses:
        if not isinstance(sense, dict):
            continue
        glosses = sense.get("gloss")
        if not isinstance(glosses, list):
            continue
        for gloss in glosses:
            if isinstance(gloss, str) and gloss.strip():
                results.append(gloss.strip())
            elif isinstance(gloss, dict):
                text = gloss.get("text")
                if isinstance(text, str) and text.strip():
                    results.append(text.strip())
    return results


def is_common_entry(entry: dict[str, Any]) -> bool:
    """An entry is "common" if any of its kanji or kana forms are flagged common by JMdict."""
    for key in ("kanji", "kana"):
        items = entry.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and item.get("common"):
                return True
    return False



def preferred_japanese(entry: dict[str, Any]) -> tuple[str, str]:
    kanji = entry.get("kanji") if isinstance(entry.get("kanji"), list) else []
    kana = entry.get("kana") if isinstance(entry.get("kana"), list) else []

    preferred_kanji = next(
        (
            item
            for item in kanji
            if isinstance(item, dict)
            and item.get("common")
            and isinstance(item.get("text"), str)
            and item["text"].strip()
        ),
        None,
    )
    if preferred_kanji is None:
        preferred_kanji = next(
            (
                item
                for item in kanji
                if isinstance(item, dict)
                and isinstance(item.get("text"), str)
                and item["text"].strip()
            ),
            None,
        )

    preferred_kana = next(
        (
            item
            for item in kana
            if isinstance(item, dict)
            and item.get("common")
            and isinstance(item.get("text"), str)
            and item["text"].strip()
        ),
        None,
    )
    if preferred_kana is None:
        preferred_kana = next(
            (
                item
                for item in kana
                if isinstance(item, dict)
                and isinstance(item.get("text"), str)
                and item["text"].strip()
            ),
            None,
        )

    japanese = ""
    if isinstance(preferred_kanji, dict):
        japanese = str(preferred_kanji.get("text", "")).strip()
    if not japanese and isinstance(preferred_kana, dict):
        japanese = str(preferred_kana.get("text", "")).strip()

    reading = ""
    if isinstance(preferred_kana, dict):
        reading = str(preferred_kana.get("text", "")).strip()

    return japanese, reading


def resolve_input_path(cli_input: str | None) -> Path:
    if cli_input:
        candidate = Path(cli_input)
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Input file not found: {candidate}")
    for candidate in DEFAULT_INPUT_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No JMdict input file found. Expected one of: " + ", ".join(str(p) for p in DEFAULT_INPUT_CANDIDATES))


def resolve_pitch_accent_path(cli_input: str | None) -> Path | None:
    if cli_input:
        candidate = Path(cli_input)
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Pitch accent file not found: {candidate}")
    return next((path for path in DEFAULT_PITCH_ACCENT_CANDIDATES if path.exists()), None)


def resolve_required_source_path(
    cli_input: str | None,
    candidates: list[Path],
    label: str,
) -> Path:
    if cli_input:
        candidate = Path(cli_input)
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"{label} input file not found: {candidate}")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    expected = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"No {label} input file found. Expected one of: {expected}")


def _load_required_json(input_path: Path, label: str) -> dict[str, Any]:
    if not input_path.is_file():
        raise FileNotFoundError(f"{label} input file not found: {input_path}")
    try:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed {label} JSON: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Malformed {label} JSON: expected a top-level object")
    return payload


def _required_source_version(payload: dict[str, Any], label: str) -> str:
    version = payload.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError(f"Malformed {label} JSON: missing a non-empty version")
    return version.strip()


def _dedupe_strings(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _compact_json(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False, separators=(",", ":"))


def is_han_character(value: str) -> bool:
    if len(value) != 1:
        return False
    name = unicodedata.name(value, "")
    return name.startswith("CJK UNIFIED IDEOGRAPH-") or name.startswith(
        "CJK COMPATIBILITY IDEOGRAPH-"
    )


def load_kanji_details(input_path: Path) -> tuple[list[KanjiDetailRow], str]:
    payload = _load_required_json(input_path, "KANJIDIC2")
    version = _required_source_version(payload, "KANJIDIC2")
    characters = payload.get("characters")
    if not isinstance(characters, list) or not characters:
        raise ValueError("Malformed KANJIDIC2 JSON: missing a non-empty characters array")

    rows: list[KanjiDetailRow] = []
    seen_literals: set[str] = set()
    for index, raw_character in enumerate(characters):
        if not isinstance(raw_character, dict):
            raise ValueError(f"Malformed KANJIDIC2 character at index {index}: expected an object")

        literal = raw_character.get("literal")
        if not isinstance(literal, str) or not is_han_character(literal):
            raise ValueError(f"Malformed KANJIDIC2 character at index {index}: invalid literal")
        if literal in seen_literals:
            raise ValueError(f"Malformed KANJIDIC2 JSON: duplicate literal {literal}")
        seen_literals.add(literal)

        raw_radicals = raw_character.get("radicals")
        if not isinstance(raw_radicals, list):
            raise ValueError(f"Malformed KANJIDIC2 character {literal}: radicals must be an array")
        classical_radical_number: int | None = None
        for raw_radical in raw_radicals:
            if not isinstance(raw_radical, dict):
                raise ValueError(f"Malformed KANJIDIC2 character {literal}: invalid radical")
            radical_type = raw_radical.get("type")
            radical_value = raw_radical.get("value")
            if not isinstance(radical_type, str):
                raise ValueError(f"Malformed KANJIDIC2 character {literal}: invalid radical type")
            if radical_type == "classical":
                if not isinstance(radical_value, int) or isinstance(radical_value, bool) or radical_value <= 0:
                    raise ValueError(
                        f"Malformed KANJIDIC2 character {literal}: invalid classical radical number"
                    )
                if classical_radical_number is None:
                    classical_radical_number = radical_value

        misc = raw_character.get("misc")
        if not isinstance(misc, dict):
            raise ValueError(f"Malformed KANJIDIC2 character {literal}: misc must be an object")
        stroke_counts = misc.get("strokeCounts")
        if not isinstance(stroke_counts, list):
            raise ValueError(f"Malformed KANJIDIC2 character {literal}: strokeCounts must be an array")
        valid_stroke_counts = [
            value
            for value in stroke_counts
            if isinstance(value, int) and not isinstance(value, bool) and value > 0
        ]
        if len(valid_stroke_counts) != len(stroke_counts):
            raise ValueError(f"Malformed KANJIDIC2 character {literal}: invalid stroke count")
        stroke_count = valid_stroke_counts[0] if valid_stroke_counts else None

        raw_jlpt_level = misc.get("jlptLevel")
        if raw_jlpt_level is None:
            jlpt_level = None
        elif (
            isinstance(raw_jlpt_level, int)
            and not isinstance(raw_jlpt_level, bool)
            and 1 <= raw_jlpt_level <= 5
        ):
            jlpt_level = f"N{raw_jlpt_level}"
        else:
            raise ValueError(f"Malformed KANJIDIC2 character {literal}: invalid JLPT level")

        meanings: list[str] = []
        on_readings: list[str] = []
        kun_readings: list[str] = []
        reading_meaning = raw_character.get("readingMeaning")
        if reading_meaning is not None:
            if not isinstance(reading_meaning, dict):
                raise ValueError(
                    f"Malformed KANJIDIC2 character {literal}: readingMeaning must be an object"
                )
            groups = reading_meaning.get("groups")
            if not isinstance(groups, list):
                raise ValueError(
                    f"Malformed KANJIDIC2 character {literal}: readingMeaning.groups must be an array"
                )
            for group_index, group in enumerate(groups):
                if not isinstance(group, dict):
                    raise ValueError(
                        f"Malformed KANJIDIC2 character {literal}: invalid reading group {group_index}"
                    )
                readings = group.get("readings")
                group_meanings = group.get("meanings")
                if not isinstance(readings, list) or not isinstance(group_meanings, list):
                    raise ValueError(
                        f"Malformed KANJIDIC2 character {literal}: invalid reading group arrays"
                    )
                for reading in readings:
                    if not isinstance(reading, dict):
                        raise ValueError(
                            f"Malformed KANJIDIC2 character {literal}: invalid reading"
                        )
                    reading_type = reading.get("type")
                    reading_value = reading.get("value")
                    if not isinstance(reading_type, str) or not isinstance(reading_value, str):
                        raise ValueError(
                            f"Malformed KANJIDIC2 character {literal}: invalid reading fields"
                        )
                    normalized_reading = reading_value.strip()
                    if reading_type == "ja_on" and normalized_reading:
                        on_readings.append(normalized_reading)
                    elif reading_type == "ja_kun" and normalized_reading:
                        kun_readings.append(normalized_reading)
                for meaning in group_meanings:
                    if not isinstance(meaning, dict):
                        raise ValueError(
                            f"Malformed KANJIDIC2 character {literal}: invalid meaning"
                        )
                    language = meaning.get("lang")
                    meaning_value = meaning.get("value")
                    if language not in (None, "en"):
                        continue
                    if not isinstance(meaning_value, str):
                        raise ValueError(
                            f"Malformed KANJIDIC2 character {literal}: invalid English meaning"
                        )
                    normalized_meaning = meaning_value.strip()
                    if normalized_meaning:
                        meanings.append(normalized_meaning)

        rows.append(
            (
                literal,
                _compact_json(_dedupe_strings(meanings)),
                _compact_json(_dedupe_strings(on_readings)),
                _compact_json(_dedupe_strings(kun_readings)),
                jlpt_level,
                stroke_count,
                classical_radical_number,
            )
        )

    rows.sort(key=lambda row: row[0])
    return rows, version


def load_radical_catalog(input_path: Path) -> tuple[dict[str, RadicalMetadata], str]:
    payload = _load_required_json(input_path, "radkfile")
    version = _required_source_version(payload, "radkfile")
    radicals = payload.get("radicals")
    if not isinstance(radicals, dict) or not radicals:
        raise ValueError("Malformed radkfile JSON: missing a non-empty radicals object")

    catalog: dict[str, RadicalMetadata] = {}
    for radical, raw_metadata in radicals.items():
        if not isinstance(radical, str) or not radical:
            raise ValueError("Malformed radkfile JSON: invalid radical key")
        if not isinstance(raw_metadata, dict):
            raise ValueError(f"Malformed radkfile radical {radical}: expected an object")
        stroke_count = raw_metadata.get("strokeCount")
        if not isinstance(stroke_count, int) or isinstance(stroke_count, bool) or stroke_count <= 0:
            raise ValueError(f"Malformed radkfile radical {radical}: invalid stroke count")
        code = raw_metadata.get("code")
        if code is not None and not isinstance(code, str):
            raise ValueError(f"Malformed radkfile radical {radical}: invalid code")
        kanji = raw_metadata.get("kanji")
        if not isinstance(kanji, list) or not all(isinstance(value, str) for value in kanji):
            raise ValueError(f"Malformed radkfile radical {radical}: invalid kanji array")
        catalog[radical] = (stroke_count, code.strip() if isinstance(code, str) else None)
    return catalog, version


def load_kanji_radicals(
    input_path: Path,
    radical_catalog: dict[str, RadicalMetadata],
    detail_characters: set[str],
) -> tuple[list[KanjiRadicalRow], str]:
    payload = _load_required_json(input_path, "kradfile")
    version = _required_source_version(payload, "kradfile")
    kanji = payload.get("kanji")
    if not isinstance(kanji, dict) or not kanji:
        raise ValueError("Malformed kradfile JSON: missing a non-empty kanji object")

    rows: list[KanjiRadicalRow] = []
    for character in sorted(kanji):
        if not isinstance(character, str) or not is_han_character(character):
            raise ValueError("Malformed kradfile JSON: invalid kanji key")
        raw_radicals = kanji[character]
        if not isinstance(raw_radicals, list):
            raise ValueError(f"Malformed kradfile character {character}: radicals must be an array")
        if not all(isinstance(radical, str) and radical for radical in raw_radicals):
            raise ValueError(f"Malformed kradfile character {character}: invalid radical")
        if character not in detail_characters:
            continue
        for position, radical in enumerate(raw_radicals):
            radical_metadata = radical_catalog.get(radical)
            stroke_count = radical_metadata[0] if radical_metadata else None
            code = radical_metadata[1] if radical_metadata else None
            rows.append((character, position, radical, stroke_count, code))
    return rows, version


def _normalize_pitch_text(value: object) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip().lower()


def load_pitch_accents(input_path: Path | None) -> list[tuple[str, str, str, int, str]]:
    if input_path is None:
        return []

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    entries = payload.get("entries") if isinstance(payload, dict) else None
    metadata = payload.get("metadata") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise ValueError("Pitch accent JSON is missing a top-level 'entries' array")

    source = "Kanjium"
    if isinstance(metadata, dict) and isinstance(metadata.get("source"), str):
        source = metadata["source"].strip() or source

    merged: dict[tuple[str, str], tuple[set[int], int]] = {}
    for raw_entry in entries:
        if not isinstance(raw_entry, dict):
            continue
        word = _normalize_pitch_text(raw_entry.get("word"))
        reading = _normalize_pitch_text(raw_entry.get("reading"))
        raw_positions = raw_entry.get("pitch_positions")
        raw_mora_count = raw_entry.get("mora_count")
        if not word or not reading or not isinstance(raw_positions, list):
            continue
        positions = {
            position
            for position in raw_positions
            if isinstance(position, int) and not isinstance(position, bool) and position >= 0
        }
        if not positions or not isinstance(raw_mora_count, int) or raw_mora_count <= 0:
            continue
        valid_positions = {position for position in positions if position <= raw_mora_count}
        if not valid_positions:
            continue

        key = (word, reading)
        previous_positions, previous_mora_count = merged.get(key, (set(), raw_mora_count))
        previous_positions.update(valid_positions)
        merged[key] = (previous_positions, max(previous_mora_count, raw_mora_count))

    return [
        (word, reading, json.dumps(sorted(positions)), mora_count, source)
        for (word, reading), (positions, mora_count) in sorted(merged.items())
    ]


def build_lookup_db(
    input_path: Path,
    output_path: Path,
    pitch_accent_path: Path | None = None,
    *,
    kanjidic_path: Path,
    kradfile_path: Path,
    radkfile_path: Path,
) -> dict[str, int]:
    if not input_path.is_file():
        raise FileNotFoundError(f"JMdict input file not found: {input_path}")
    try:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed JMdict JSON: {exc.msg}") from exc
    words = payload.get("words") if isinstance(payload, dict) else None
    if not isinstance(words, list):
        raise ValueError("Input JSON is missing a top-level 'words' array")

    kanji_detail_rows, kanjidic_version = load_kanji_details(kanjidic_path)
    radical_catalog, radkfile_version = load_radical_catalog(radkfile_path)
    detail_characters = {row[0] for row in kanji_detail_rows}
    kanji_radical_rows, kradfile_version = load_kanji_radicals(
        kradfile_path,
        radical_catalog,
        detail_characters,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_output_path = output_path.with_suffix(f"{output_path.suffix}.part")
    temporary_output_path.unlink(missing_ok=True)

    conn = sqlite3.connect(temporary_output_path)
    build_succeeded = False
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = OFF")
        conn.execute("PRAGMA synchronous = OFF")
        conn.execute("PRAGMA temp_store = MEMORY")

        conn.executescript(
            """
            CREATE TABLE dictionary_entries (
              entry_id INTEGER PRIMARY KEY,
              source_id TEXT,
              japanese TEXT NOT NULL,
              reading TEXT NOT NULL,
              gloss TEXT NOT NULL,
              is_common INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX idx_dictionary_entries_japanese ON dictionary_entries(japanese);
            CREATE INDEX idx_dictionary_entries_reading ON dictionary_entries(reading);
            CREATE INDEX idx_dictionary_entries_common ON dictionary_entries(is_common);

            -- External-content FTS5 index over the English gloss text. Porter
            -- stemming lets "run" match "running"/"runs", and FTS5 gives us
            -- prefix queries + bm25 relevance ranking for free.
            CREATE VIRTUAL TABLE dictionary_fts USING fts5(
              gloss,
              content='dictionary_entries',
              content_rowid='entry_id',
              tokenize='porter unicode61'
            );

            CREATE TABLE dictionary_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE dictionary_pitch_accents (
              word TEXT NOT NULL,
              reading TEXT NOT NULL,
              pitch_positions TEXT NOT NULL,
              mora_count INTEGER NOT NULL,
              source TEXT NOT NULL,
              PRIMARY KEY (word, reading)
            );

            CREATE INDEX idx_dictionary_pitch_accents_reading
              ON dictionary_pitch_accents(reading);

            CREATE TABLE kanji_details (
              character TEXT PRIMARY KEY,
              meanings_json TEXT NOT NULL,
              on_readings_json TEXT NOT NULL,
              kun_readings_json TEXT NOT NULL,
              jlpt_level TEXT,
              stroke_count INTEGER,
              classical_radical_number INTEGER
            );

            CREATE TABLE kanji_radicals (
              character TEXT NOT NULL,
              position INTEGER NOT NULL,
              radical TEXT NOT NULL,
              stroke_count INTEGER,
              code TEXT,
              PRIMARY KEY (character, position),
              FOREIGN KEY (character) REFERENCES kanji_details(character)
            );

            CREATE INDEX idx_kanji_radicals_character
              ON kanji_radicals(character);

            CREATE TABLE dictionary_kanji_index (
              character TEXT NOT NULL,
              entry_id INTEGER NOT NULL,
              PRIMARY KEY (character, entry_id),
              FOREIGN KEY (entry_id) REFERENCES dictionary_entries(entry_id)
            );

            CREATE INDEX idx_dictionary_kanji_index_character_entry
              ON dictionary_kanji_index(character, entry_id);
            """
        )

        entries_used = 0
        kanji_index_rows = 0

        for raw_entry in words:
            if not isinstance(raw_entry, dict):
                continue

            japanese, reading = preferred_japanese(raw_entry)
            if not japanese:
                continue

            glosses = all_glosses(raw_entry)
            if not glosses:
                continue

            gloss = "; ".join(dict.fromkeys(glosses))[:240]
            source_id = str(raw_entry.get("id", ""))
            common_flag = 1 if is_common_entry(raw_entry) else 0

            cursor = conn.execute(
                """
                INSERT INTO dictionary_entries (source_id, japanese, reading, gloss, is_common)
                VALUES (?, ?, ?, ?, ?)
                """,
                (source_id, japanese, reading, gloss, common_flag),
            )
            entry_id = cursor.lastrowid
            conn.execute(
                "INSERT INTO dictionary_fts (rowid, gloss) VALUES (?, ?)",
                (entry_id, gloss),
            )
            if entry_id is None:
                raise RuntimeError("SQLite did not return an entry id for a dictionary row")
            indexed_characters = sorted({character for character in japanese if is_han_character(character)})
            conn.executemany(
                "INSERT INTO dictionary_kanji_index (character, entry_id) VALUES (?, ?)",
                [(character, entry_id) for character in indexed_characters],
            )
            kanji_index_rows += len(indexed_characters)
            entries_used += 1

        conn.executemany(
            """
            INSERT INTO kanji_details
              (character, meanings_json, on_readings_json, kun_readings_json,
               jlpt_level, stroke_count, classical_radical_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            kanji_detail_rows,
        )
        conn.executemany(
            """
            INSERT INTO kanji_radicals
              (character, position, radical, stroke_count, code)
            VALUES (?, ?, ?, ?, ?)
            """,
            kanji_radical_rows,
        )

        pitch_accent_rows = load_pitch_accents(pitch_accent_path)
        conn.executemany(
            """
            INSERT INTO dictionary_pitch_accents
              (word, reading, pitch_positions, mora_count, source)
            VALUES (?, ?, ?, ?, ?)
            """,
            pitch_accent_rows,
        )

        metadata = {
            "source": str(input_path.name),
            "word_count": str(len(words)),
            "entries_used": str(entries_used),
            "pitch_accent_source": str(pitch_accent_path.name) if pitch_accent_path else "none",
            "pitch_accent_entries": str(len(pitch_accent_rows)),
            "kanjidic_source": kanjidic_path.name,
            "kanjidic_version": kanjidic_version,
            "kradfile_source": kradfile_path.name,
            "kradfile_version": kradfile_version,
            "radkfile_source": radkfile_path.name,
            "radkfile_version": radkfile_version,
            "kanji_details_count": str(len(kanji_detail_rows)),
            "kanji_radicals_count": str(len(kanji_radical_rows)),
            "dictionary_kanji_index_count": str(kanji_index_rows),
            "schema_version": str(SCHEMA_VERSION),
        }
        conn.executemany(
            "INSERT INTO dictionary_metadata (key, value) VALUES (?, ?)",
            list(metadata.items()),
        )
        conn.commit()
        build_succeeded = True
        stats = {
            "word_count": len(words),
            "entries_used": entries_used,
            "lookup_rows": entries_used,
            "pitch_accent_entries": len(pitch_accent_rows),
            "kanji_details_count": len(kanji_detail_rows),
            "kanji_radicals_count": len(kanji_radical_rows),
            "dictionary_kanji_index_count": kanji_index_rows,
        }
    finally:
        conn.close()
        if not build_succeeded:
            temporary_output_path.unlink(missing_ok=True)

    temporary_output_path.replace(output_path)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Build offline JMdict lookup SQLite database")
    parser.add_argument("--input", dest="input_path", default=None, help="Path to JMdict JSON file")
    parser.add_argument(
        "--output",
        dest="output_path",
        default=str(DEFAULT_OUTPUT),
        help="Output path for generated SQLite lookup database",
    )
    parser.add_argument(
        "--pitch-accent",
        dest="pitch_accent_path",
        default=None,
        help="Optional pitch-accent JSON path",
    )
    parser.add_argument(
        "--kanjidic",
        dest="kanjidic_path",
        default=None,
        help="Path to the required KANJIDIC2 JSON file",
    )
    parser.add_argument(
        "--kradfile",
        dest="kradfile_path",
        default=None,
        help="Path to the required kradfile JSON file",
    )
    parser.add_argument(
        "--radkfile",
        dest="radkfile_path",
        default=None,
        help="Path to the required radkfile JSON file",
    )
    args = parser.parse_args()

    input_path = resolve_input_path(args.input_path)
    output_path = Path(args.output_path)
    pitch_accent_path = resolve_pitch_accent_path(args.pitch_accent_path)
    kanjidic_path = resolve_required_source_path(
        args.kanjidic_path,
        DEFAULT_KANJIDIC_CANDIDATES,
        "KANJIDIC2",
    )
    kradfile_path = resolve_required_source_path(
        args.kradfile_path,
        DEFAULT_KRADFILE_CANDIDATES,
        "kradfile",
    )
    radkfile_path = resolve_required_source_path(
        args.radkfile_path,
        DEFAULT_RADKFILE_CANDIDATES,
        "radkfile",
    )

    stats = build_lookup_db(
        input_path=input_path,
        output_path=output_path,
        pitch_accent_path=pitch_accent_path,
        kanjidic_path=kanjidic_path,
        kradfile_path=kradfile_path,
        radkfile_path=radkfile_path,
    )
    print(
        json.dumps(
            {
                "ok": True,
                "input": str(input_path),
                "output": str(output_path),
                **stats,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
