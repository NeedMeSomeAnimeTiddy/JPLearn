"""Regression checks for committed, lazy-loaded handwriting data chunks."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, cast

from domain import decks
from scripts.build_handwriting_assets import repack_assets


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "electron-frontend" / "public" / "handwriting-data"
MANIFEST_MODULE = ROOT / "electron-frontend" / "src" / "lib" / "handwriting-data-manifest.json"


def _eligible_characters() -> dict[str, list[str]]:
    factories = (
        decks.get_hiragana_deck,
        decks.get_katakana_deck,
        decks.get_kanji_n5_deck,
        decks.get_kanji_n4_deck,
        decks.get_kanji_n3_deck,
        decks.get_kanji_n2_deck,
        decks.get_kanji_n1_deck,
    )
    return {
        deck.name: sorted({card.character for card in deck.cards if len(card.character) == 1})
        for deck in (factory() for factory in factories)
    }


def _manifest() -> dict[str, object]:
    return json.loads((DATA_ROOT / "manifest.json").read_text(encoding="utf-8"))


def _chunks(manifest: dict[str, object]) -> dict[str, dict[str, Any]]:
    """Chunk name -> {path, sha256, characterCount}, narrowed from the parsed JSON."""
    return cast(dict[str, dict[str, Any]], manifest["chunks"])


def _characters(manifest: dict[str, object]) -> dict[str, dict[str, str]]:
    """Character -> {chunk}, narrowed from the parsed JSON."""
    return cast(dict[str, dict[str, str]], manifest["characters"])


def test_offline_handwriting_data_covers_every_eligible_character_once() -> None:
    """Every single-character deck entry either has stroke data or is listed as lacking it.

    Upstream has no stroke data for a handful of deck characters — mostly the
    basic numerals that joined ``Kanji N5`` with issue #78's deck supplements.
    The renderer already gates on ``manifest.characters[character]``
    (``features/handwriting/utils.ts``), so those are simply not offered for
    practice. Asserting the partition rather than total coverage keeps the gap
    explicit: a character may be missing data, but it may not go unaccounted for.
    """
    manifest = _manifest()
    expected = _eligible_characters()
    coverage = cast(dict[str, Any], manifest["coverage"])
    characters = _characters(manifest)
    chunks = _chunks(manifest)
    all_eligible = set().union(*map(set, expected.values()))
    missing_data = set(coverage["excludedMissingData"])

    assert manifest["formatVersion"] == 2
    assert coverage["decks"] == expected
    assert missing_data <= all_eligible
    assert set(characters) == all_eligible - missing_data
    assert coverage["eligibleCharacters"] == len(characters)
    assert all(set(entry) == {"chunk"} and entry["chunk"] in chunks for entry in characters.values())


def test_chunk_payloads_are_valid_hashed_and_match_manifest_assignments() -> None:
    manifest = _manifest()
    chunks = _chunks(manifest)
    assignments_by_chunk: dict[str, set[str]] = {name: set() for name in chunks}
    for character, entry in _characters(manifest).items():
        assignments_by_chunk[entry["chunk"]].add(character)

    assert 8 <= len(chunks) <= 12
    for name, entry in chunks.items():
        raw = (DATA_ROOT / entry["path"]).read_bytes()
        payload = json.loads(raw.decode("utf-8"))
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
        assert len(payload) == entry["characterCount"] == len(assignments_by_chunk[name])
        assert set(payload) == assignments_by_chunk[name]
        for data in payload.values():
            assert isinstance(data["strokes"], list) and data["strokes"]
            assert isinstance(data["medians"], list) and len(data["medians"]) == len(data["strokes"])


def test_repacking_the_committed_assets_is_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    repack_assets(DATA_ROOT, first, tmp_path / "first-manifest.json")
    repack_assets(DATA_ROOT, second, tmp_path / "second-manifest.json")

    first_files = sorted(path.relative_to(first) for path in first.rglob("*") if path.is_file())
    second_files = sorted(path.relative_to(second) for path in second.rglob("*") if path.is_file())
    assert first_files == second_files
    assert all((first / path).read_bytes() == (second / path).read_bytes() for path in first_files)


def test_static_manifest_module_and_required_notices_are_committed() -> None:
    assert json.loads(MANIFEST_MODULE.read_text(encoding="utf-8")) == _manifest()
    notices = DATA_ROOT / "notices"
    assert (notices / "ATTRIBUTION.md").is_file()
    assert (notices / "hanzi-writer-MIT.txt").is_file()
    assert (notices / "hanzi-writer-data-youyin-MIT.txt").is_file()
    assert (notices / "hanzi-writer-data-jp" / "LGPL.txt").is_file()
    assert (notices / "hanzi-writer-data-jp" / "ARPHICPL.TXT").is_file()
    assert not (ROOT / "electron-frontend" / "src" / "lib" / "handwriting-data").exists()
    loader = (ROOT / "electron-frontend" / "src" / "features" / "handwriting" / "utils.ts").read_text(encoding="utf-8")
    assert "import.meta.glob" not in loader
