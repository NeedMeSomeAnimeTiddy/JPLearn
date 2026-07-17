from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from scripts.build_offline_dictionary_sqlite import SCHEMA_VERSION, build_lookup_db
from scripts.get_offline_dictionary import (
    PITCH_ACCENT_READY_FILENAME,
    build_downloaded_index,
)


def _write_json(path: Path, payload: object) -> Path:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def _dictionary_payload(words: list[dict[str, Any]] | None = None) -> dict[str, object]:
    return {
        "words": words
        if words is not None
        else [
            {
                "id": "test-entry",
                "kanji": [{"common": True, "text": "日"}],
                "kana": [{"common": True, "text": "ひ"}],
                "sense": [{"gloss": [{"text": "day"}, {"text": "sun"}]}],
            }
        ]
    }


def _kanjidic_payload() -> dict[str, object]:
    return {
        "version": "test-kanjidic-v1",
        "characters": [
            {
                "literal": "本",
                "radicals": [{"type": "classical", "value": 75}],
                "misc": {"strokeCounts": [5], "jlptLevel": 5},
                "readingMeaning": {
                    "groups": [
                        {
                            "readings": [
                                {"type": "ja_on", "value": "ホン"},
                                {"type": "ja_kun", "value": "もと"},
                            ],
                            "meanings": [
                                {"lang": "en", "value": "book"},
                                {"lang": "en", "value": "origin"},
                            ],
                        }
                    ]
                },
            },
            {
                "literal": "日",
                "radicals": [
                    {"type": "classical", "value": 72},
                    {"type": "nelson_c", "value": 1},
                ],
                "misc": {"strokeCounts": [4], "jlptLevel": 4},
                "readingMeaning": {
                    "groups": [
                        {
                            "readings": [
                                {"type": "ja_on", "value": "ニチ"},
                                {"type": "ja_on", "value": "ニチ"},
                                {"type": "ja_kun", "value": "ひ"},
                                {"type": "pinyin", "value": "ri4"},
                            ],
                            "meanings": [
                                {"lang": "en", "value": "day"},
                                {"lang": "en", "value": "sun"},
                                {"lang": "fr", "value": "jour"},
                            ],
                        }
                    ]
                },
            },
        ],
    }


def _kradfile_payload() -> dict[str, object]:
    return {
        "version": "test-krad-v1",
        "kanji": {
            "本": ["木", "一"],
            "日": ["日", "一"],
            "語": ["言", "口"],
        },
    }


def _radkfile_payload() -> dict[str, object]:
    return {
        "version": "test-radk-v1",
        "radicals": {
            "一": {"strokeCount": 1, "code": None, "kanji": ["日", "本"]},
            "口": {"strokeCount": 3, "code": None, "kanji": ["語"]},
            "日": {"strokeCount": 4, "code": "js72", "kanji": ["日"]},
            "木": {"strokeCount": 4, "code": None, "kanji": ["本"]},
            "言": {"strokeCount": 7, "code": None, "kanji": ["語"]},
        },
    }


def _pitch_payload() -> dict[str, object]:
    return {
        "metadata": {"source": "Kanjium test data"},
        "entries": [
            {
                "word": "日",
                "reading": "ひ",
                "pitch_positions": [1, 0],
                "mora_count": 1,
            }
        ],
    }


def _write_sources(
    tmp_path: Path,
    *,
    words: list[dict[str, Any]] | None = None,
) -> dict[str, Path]:
    return {
        "dictionary": _write_json(tmp_path / "jmdict.json", _dictionary_payload(words)),
        "kanjidic": _write_json(tmp_path / "kanjidic.json", _kanjidic_payload()),
        "kradfile": _write_json(tmp_path / "kradfile.json", _kradfile_payload()),
        "radkfile": _write_json(tmp_path / "radkfile.json", _radkfile_payload()),
        "pitch": _write_json(tmp_path / "pitch-accent.json", _pitch_payload()),
    }


def _build(tmp_path: Path, sources: dict[str, Path]) -> tuple[Path, dict[str, int]]:
    output_path = tmp_path / "dictionary.sqlite"
    stats = build_lookup_db(
        input_path=sources["dictionary"],
        output_path=output_path,
        pitch_accent_path=sources["pitch"],
        kanjidic_path=sources["kanjidic"],
        kradfile_path=sources["kradfile"],
        radkfile_path=sources["radkfile"],
    )
    return output_path, stats


def test_build_lookup_db_preserves_search_and_imports_v4_kanji_data(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)

    output_path, stats = _build(tmp_path, sources)

    assert stats == {
        "word_count": 1,
        "entries_used": 1,
        "lookup_rows": 1,
        "pitch_accent_entries": 1,
        "kanji_details_count": 2,
        "kanji_radicals_count": 4,
        "dictionary_kanji_index_count": 1,
    }
    with sqlite3.connect(output_path) as conn:
        dictionary_row = conn.execute(
            "SELECT japanese, reading, gloss, is_common FROM dictionary_entries"
        ).fetchone()
        fts_row = conn.execute(
            """
            SELECT e.japanese
            FROM dictionary_fts
            JOIN dictionary_entries e ON e.entry_id = dictionary_fts.rowid
            WHERE dictionary_fts MATCH 'sun'
            """
        ).fetchone()
        pitch_row = conn.execute(
            """
            SELECT word, reading, pitch_positions, mora_count, source
            FROM dictionary_pitch_accents
            """
        ).fetchone()
        detail_rows = conn.execute(
            """
            SELECT character, meanings_json, on_readings_json, kun_readings_json,
                   jlpt_level, stroke_count, classical_radical_number
            FROM kanji_details
            ORDER BY character
            """
        ).fetchall()
        radical_rows = conn.execute(
            """
            SELECT character, position, radical, stroke_count, code
            FROM kanji_radicals
            ORDER BY character, position
            """
        ).fetchall()
        metadata = dict(conn.execute("SELECT key, value FROM dictionary_metadata"))

    assert dictionary_row == ("日", "ひ", "day; sun", 1)
    assert fts_row == ("日",)
    assert pitch_row == ("日", "ひ", "[0, 1]", 1, "Kanjium test data")
    assert detail_rows == [
        ("日", '["day","sun"]', '["ニチ"]', '["ひ"]', "N4", 4, 72),
        ("本", '["book","origin"]', '["ホン"]', '["もと"]', "N5", 5, 75),
    ]
    assert radical_rows == [
        ("日", 0, "日", 4, "js72"),
        ("日", 1, "一", 1, None),
        ("本", 0, "木", 4, None),
        ("本", 1, "一", 1, None),
    ]
    assert metadata["schema_version"] == str(SCHEMA_VERSION)
    assert metadata["kanjidic_version"] == "test-kanjidic-v1"
    assert metadata["kradfile_version"] == "test-krad-v1"
    assert metadata["radkfile_version"] == "test-radk-v1"
    assert metadata["kanji_details_count"] == "2"
    assert metadata["kanji_radicals_count"] == "4"
    assert metadata["dictionary_kanji_index_count"] == "1"


def test_dictionary_kanji_index_deduplicates_each_entry_deterministically(tmp_path: Path) -> None:
    sources = _write_sources(
        tmp_path,
        words=[
            {
                "id": "compound",
                "kanji": [{"common": True, "text": "日本日"}],
                "kana": [{"common": True, "text": "にほんにち"}],
                "sense": [{"gloss": [{"text": "compound"}]}],
            },
            {
                "id": "repeated",
                "kanji": [{"common": False, "text": "本本"}],
                "kana": [{"common": False, "text": "ほんほん"}],
                "sense": [{"gloss": [{"text": "repeated"}]}],
            },
            {
                "id": "kana-only",
                "kana": [{"common": True, "text": "かな"}],
                "sense": [{"gloss": [{"text": "kana"}]}],
            },
        ],
    )

    output_path, stats = _build(tmp_path, sources)

    with sqlite3.connect(output_path) as conn:
        rows = conn.execute(
            """
            SELECT i.character, e.source_id
            FROM dictionary_kanji_index i
            JOIN dictionary_entries e ON e.entry_id = i.entry_id
            ORDER BY i.entry_id, i.character
            """
        ).fetchall()

    assert rows == [("日", "compound"), ("本", "compound"), ("本", "repeated")]
    assert stats["dictionary_kanji_index_count"] == 3


def test_build_lookup_db_fails_before_replacing_output_when_required_source_is_missing(
    tmp_path: Path,
) -> None:
    sources = _write_sources(tmp_path)
    output_path = tmp_path / "dictionary.sqlite"
    output_path.write_bytes(b"existing-index")

    with pytest.raises(FileNotFoundError, match="KANJIDIC2"):
        build_lookup_db(
            input_path=sources["dictionary"],
            output_path=output_path,
            pitch_accent_path=sources["pitch"],
            kanjidic_path=tmp_path / "missing-kanjidic.json",
            kradfile_path=sources["kradfile"],
            radkfile_path=sources["radkfile"],
        )

    assert output_path.read_bytes() == b"existing-index"
    assert not (tmp_path / "dictionary.sqlite.part").exists()


@pytest.mark.parametrize(
    ("source_key", "malformed_payload", "message"),
    [
        ("kanjidic", {"version": "bad", "characters": {}}, "KANJIDIC2"),
        ("kradfile", {"version": "bad", "kanji": []}, "kradfile"),
        ("radkfile", {"version": "bad", "radicals": []}, "radkfile"),
    ],
)
def test_build_lookup_db_rejects_malformed_required_sources(
    tmp_path: Path,
    source_key: str,
    malformed_payload: object,
    message: str,
) -> None:
    sources = _write_sources(tmp_path)
    _write_json(sources[source_key], malformed_payload)

    with pytest.raises(ValueError, match=message):
        _build(tmp_path, sources)

    assert not (tmp_path / "dictionary.sqlite").exists()
    assert not (tmp_path / "dictionary.sqlite.part").exists()


def test_ready_marker_is_written_only_after_a_complete_v4_build(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    downloaded_files = {
        "jmdict-eng": sources["dictionary"].name,
        "kanjidic2-en": sources["kanjidic"].name,
        "kradfile": sources["kradfile"].name,
        "radkfile": sources["radkfile"].name,
        "pitch-accent": sources["pitch"].name,
    }

    output_path, stats = build_downloaded_index(tmp_path, downloaded_files, sources["pitch"])
    ready_path = tmp_path / PITCH_ACCENT_READY_FILENAME
    marker = json.loads(ready_path.read_text(encoding="utf-8"))

    assert output_path.is_file()
    assert marker["schema_version"] == SCHEMA_VERSION
    assert marker["kanji_details_count"] == stats["kanji_details_count"]
    assert marker["kanji_radicals_count"] == stats["kanji_radicals_count"]
    assert marker["dictionary_kanji_index_count"] == stats["dictionary_kanji_index_count"]

    previous_index = output_path.read_bytes()
    _write_json(sources["kradfile"], {"version": "bad", "kanji": []})
    with pytest.raises(ValueError, match="kradfile"):
        build_downloaded_index(tmp_path, downloaded_files, sources["pitch"])

    assert not ready_path.exists()
    assert output_path.read_bytes() == previous_index


def test_ready_marker_is_not_written_when_required_download_is_absent(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    ready_path = tmp_path / PITCH_ACCENT_READY_FILENAME
    ready_path.write_text("stale", encoding="utf-8")

    with pytest.raises(FileNotFoundError, match="radkfile"):
        build_downloaded_index(
            tmp_path,
            {
                "jmdict-eng": sources["dictionary"].name,
                "kanjidic2-en": sources["kanjidic"].name,
                "kradfile": sources["kradfile"].name,
            },
            sources["pitch"],
        )

    assert not ready_path.exists()
