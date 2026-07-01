#!/usr/bin/env python3
"""Build a compact SQLite lookup index from JMdict-simplified JSON."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_INPUT_CANDIDATES = [
    Path("data/external_sources/offline_dictionary/jmdict-eng-3.6.2.json"),
    Path("data/external_sources/offline_dictionary/jmdict-eng-common-3.6.2.json"),
]
DEFAULT_OUTPUT = Path("data/external_sources/offline_dictionary/jmdict_lookup.sqlite")

NON_ASCII_PATTERN = re.compile(r"[^a-z\s]")
MULTISPACE_PATTERN = re.compile(r"\s+")


def normalize_ascii_token(value: str) -> str:
    lowered = str(value or "").lower()
    lowered = NON_ASCII_PATTERN.sub(" ", lowered)
    lowered = MULTISPACE_PATTERN.sub(" ", lowered).strip()
    return lowered


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
            CREATE TABLE dictionary_lookup (
              lookup_key TEXT PRIMARY KEY,
              japanese TEXT NOT NULL,
              reading TEXT NOT NULL,
              gloss TEXT NOT NULL,
              entry_id TEXT
            );

            CREATE INDEX idx_dictionary_lookup_japanese ON dictionary_lookup(japanese);

            CREATE TABLE dictionary_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )

        lookup_rows_inserted = 0
        entries_used = 0

        for raw_entry in words:
            if not isinstance(raw_entry, dict):
                continue

            japanese, reading = preferred_japanese(raw_entry)
            if not japanese:
                continue

            gloss = first_gloss(raw_entry)
            entry_id = str(raw_entry.get("id", ""))
            keys_for_entry: set[str] = set()
            for gloss_text in all_glosses(raw_entry):
                normalized = normalize_ascii_token(gloss_text)
                if not normalized:
                    continue
                keys_for_entry.add(normalized)
                for token in normalized.split(" "):
                    if len(token) >= 3:
                        keys_for_entry.add(token)

            if not keys_for_entry:
                continue

            entries_used += 1
            for key in keys_for_entry:
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO dictionary_lookup (lookup_key, japanese, reading, gloss, entry_id)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (key, japanese, reading, gloss, entry_id),
                )
                if cursor.rowcount > 0:
                    lookup_rows_inserted += 1

        metadata = {
            "source": str(input_path.name),
            "word_count": str(len(words)),
            "entries_used": str(entries_used),
            "lookup_rows": str(lookup_rows_inserted),
            "schema_version": "1",
        }
        conn.executemany(
            "INSERT INTO dictionary_metadata (key, value) VALUES (?, ?)",
            list(metadata.items()),
        )
        conn.commit()
        return {
            "word_count": len(words),
            "entries_used": entries_used,
            "lookup_rows": lookup_rows_inserted,
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
