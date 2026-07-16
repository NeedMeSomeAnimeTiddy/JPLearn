"""Regression checks for the committed offline handwriting-data subset."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from domain import decks


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "electron-frontend" / "src" / "lib" / "handwriting-data"


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


def test_offline_handwriting_data_covers_every_eligible_character() -> None:
    manifest = json.loads((DATA_ROOT / "manifest.json").read_text(encoding="utf-8"))
    expected = _eligible_characters()

    assert manifest["coverage"]["decks"] == expected
    assert manifest["coverage"]["eligibleCharacters"] == len(
        set().union(*[set(characters) for characters in expected.values()]),
    )
    assert set(manifest["characters"]) == set().union(*[set(characters) for characters in expected.values()])
    assert all(len(character) == 1 for character in manifest["characters"])


def test_offline_handwriting_data_is_valid_and_hash_verified() -> None:
    manifest = json.loads((DATA_ROOT / "manifest.json").read_text(encoding="utf-8"))

    for entry in manifest["characters"].values():
        path = DATA_ROOT / entry["path"]
        raw = path.read_bytes()
        data = json.loads(raw.decode("utf-8"))
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
        assert isinstance(data["strokes"], list) and data["strokes"]
        assert isinstance(data["medians"], list) and len(data["medians"]) == len(data["strokes"])
        assert all(isinstance(stroke, str) and stroke for stroke in data["strokes"])
        assert all(isinstance(median, list) and median for median in data["medians"])


def test_offline_handwriting_data_includes_upstream_notices() -> None:
    licenses = DATA_ROOT / "licenses"
    assert (licenses / "ATTRIBUTION.md").is_file()
    assert (licenses / "hanzi-writer-MIT.txt").is_file()
    assert (licenses / "hanzi-writer-data-youyin-MIT.txt").is_file()
    assert (licenses / "hanzi-writer-data-jp" / "LGPL.txt").is_file()
    assert (licenses / "hanzi-writer-data-jp" / "ARPHICPL.TXT").is_file()
