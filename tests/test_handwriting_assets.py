"""Regression checks for committed, lazy-loaded handwriting data chunks."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

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


def test_offline_handwriting_data_covers_every_eligible_character_once() -> None:
    manifest = _manifest()
    expected = _eligible_characters()
    characters = manifest["characters"]

    assert manifest["formatVersion"] == 2
    assert manifest["coverage"]["decks"] == expected
    assert manifest["coverage"]["eligibleCharacters"] == len(set().union(*map(set, expected.values())))
    assert set(characters) == set().union(*map(set, expected.values()))
    assert all(set(entry) == {"chunk"} and entry["chunk"] in manifest["chunks"] for entry in characters.values())


def test_chunk_payloads_are_valid_hashed_and_match_manifest_assignments() -> None:
    manifest = _manifest()
    assignments_by_chunk: dict[str, set[str]] = {name: set() for name in manifest["chunks"]}
    for character, entry in manifest["characters"].items():
        assignments_by_chunk[entry["chunk"]].add(character)

    assert 8 <= len(manifest["chunks"]) <= 12
    for name, entry in manifest["chunks"].items():
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
