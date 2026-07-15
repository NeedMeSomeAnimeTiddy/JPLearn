from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from scripts.build_offline_dictionary_sqlite import build_lookup_db


def test_build_lookup_db_imports_pitch_accent_variants(tmp_path: Path) -> None:
    dictionary_path = tmp_path / "jmdict.json"
    dictionary_path.write_text(
        json.dumps(
            {
                "words": [
                    {
                        "id": "test-entry",
                        "kanji": [{"common": True, "text": "箸"}],
                        "kana": [{"common": True, "text": "はし"}],
                        "sense": [{"gloss": [{"text": "chopsticks"}]}],
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    pitch_path = tmp_path / "pitch-accent.json"
    pitch_path.write_text(
        json.dumps(
            {
                "metadata": {"source": "Kanjium test data"},
                "entries": [
                    {
                        "word": "箸",
                        "reading": "はし",
                        "pitch_positions": [1, 0],
                        "mora_count": 2,
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    output_path = tmp_path / "dictionary.sqlite"

    stats = build_lookup_db(dictionary_path, output_path, pitch_path)

    assert stats["pitch_accent_entries"] == 1
    with sqlite3.connect(output_path) as conn:
        row = conn.execute(
            """
            SELECT word, reading, pitch_positions, mora_count, source
            FROM dictionary_pitch_accents
            """
        ).fetchone()
        metadata = dict(conn.execute("SELECT key, value FROM dictionary_metadata"))

    assert row == ("箸", "はし", "[0, 1]", 2, "Kanjium test data")
    assert metadata["schema_version"] == "3"
    assert metadata["pitch_accent_entries"] == "1"
