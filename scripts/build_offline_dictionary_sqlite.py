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

DEFAULT_INPUT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/jmdict-eng-3.6.2.json"),
    Path("data/external_sources/offline_dictionary/jmdict-eng-common-3.6.2.json"),
]
DEFAULT_OUTPUT = Path("data/external_sources/offline_dictionary/jmdict_lookup.sqlite")
DEFAULT_PITCH_ACCENT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/pitch-accent.json"),
]


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
) -> dict[str, int]:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    words = payload.get("words") if isinstance(payload, dict) else None
    if not isinstance(words, list):
        raise ValueError("Input JSON is missing a top-level 'words' array")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    conn = sqlite3.connect(output_path)
    try:
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
            """
        )

        entries_used = 0

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
            entries_used += 1

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
            "schema_version": "3",
        }
        conn.executemany(
            "INSERT INTO dictionary_metadata (key, value) VALUES (?, ?)",
            list(metadata.items()),
        )
        conn.commit()
        return {
            "word_count": len(words),
            "entries_used": entries_used,
            "lookup_rows": entries_used,
            "pitch_accent_entries": len(pitch_accent_rows),
        }
    finally:
        conn.close()


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
    args = parser.parse_args()

    input_path = resolve_input_path(args.input_path)
    output_path = Path(args.output_path)
    pitch_accent_path = resolve_pitch_accent_path(args.pitch_accent_path)

    stats = build_lookup_db(
        input_path=input_path,
        output_path=output_path,
        pitch_accent_path=pitch_accent_path,
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
