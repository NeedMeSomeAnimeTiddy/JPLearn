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
from pathlib import Path
from typing import Any

DEFAULT_INPUT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/jmdict-eng-3.6.2.json"),
    Path("data/external_sources/offline_dictionary/jmdict-eng-common-3.6.2.json"),
]
DEFAULT_OUTPUT = Path("data/external_sources/offline_dictionary/jmdict_lookup.sqlite")


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


def build_lookup_db(input_path: Path, output_path: Path) -> dict[str, int]:
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

        metadata = {
            "source": str(input_path.name),
            "word_count": str(len(words)),
            "entries_used": str(entries_used),
            "schema_version": "2",
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
    args = parser.parse_args()

    input_path = resolve_input_path(args.input_path)
    output_path = Path(args.output_path)

    stats = build_lookup_db(input_path=input_path, output_path=output_path)
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
