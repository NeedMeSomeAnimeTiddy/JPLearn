"""Vendor and verify the offline handwriting character-data subset.

The source directory must be a pinned checkout of
``madladsquad/hanzi-writer-data-youyin`` with its
``ThirdParty/hanzi-writer-data-jp`` submodule initialised. The generated data
is intentionally committed so packaged Electron builds never request a CDN.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domain import decks
from domain.cards import Deck


UPSTREAM_REPOSITORY = "https://github.com/madladsquad/hanzi-writer-data-youyin"
UPSTREAM_REVISION = "7d4aaeebe35b4cd9c251ecf17d0bbb6742644327"
JAPANESE_DATA_REPOSITORY = "https://github.com/chanind/hanzi-writer-data-jp"
JAPANESE_DATA_REVISION = "efbea0cb93ba0301475ae92f9d3e512b9e4cd2ca"

DECK_FACTORIES = (
    decks.get_hiragana_deck,
    decks.get_katakana_deck,
    decks.get_kanji_n5_deck,
    decks.get_kanji_n4_deck,
    decks.get_kanji_n3_deck,
    decks.get_kanji_n2_deck,
    decks.get_kanji_n1_deck,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _validate_character_data(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Malformed handwriting data in {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Malformed handwriting data in {path}: expected object")
    strokes = data.get("strokes")
    medians = data.get("medians")
    if not isinstance(strokes, list) or not isinstance(medians, list) or not strokes:
        raise ValueError(f"Malformed handwriting data in {path}: missing strokes or medians")
    if len(strokes) != len(medians):
        raise ValueError(f"Malformed handwriting data in {path}: stroke and median counts differ")
    if not all(isinstance(stroke, str) and stroke for stroke in strokes):
        raise ValueError(f"Malformed handwriting data in {path}: invalid SVG stroke path")
    if not all(isinstance(median, list) and median for median in medians):
        raise ValueError(f"Malformed handwriting data in {path}: invalid stroke median")
    return data


def _eligible_characters(deck_set: Iterable[Deck]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    characters_by_deck: dict[str, list[str]] = {}
    excluded_by_deck: dict[str, list[str]] = {}
    for deck in deck_set:
        characters_by_deck[deck.name] = sorted({card.character for card in deck.cards if len(card.character) == 1})
        excluded_by_deck[deck.name] = sorted({card.character for card in deck.cards if len(card.character) != 1})
    return characters_by_deck, excluded_by_deck


def _source_path(source_data_dir: Path, character: str) -> Path | None:
    japanese = source_data_dir / f"{character}-jp.json"
    generic = source_data_dir / f"{character}.json"
    if japanese.is_file():
        return japanese
    if generic.is_file():
        return generic
    return None


def build_assets(source_dir: Path, destination: Path) -> dict[str, Any]:
    """Build a verified, local-only subset and return its manifest."""
    source_data_dir = source_dir / "data"
    japanese_submodule = source_dir / "ThirdParty" / "hanzi-writer-data-jp"
    if not source_data_dir.is_dir() or not japanese_submodule.is_dir():
        raise ValueError("source_dir must contain data/ and initialised ThirdParty/hanzi-writer-data-jp/")
    if destination.exists():
        raise ValueError(f"Refusing to overwrite existing destination: {destination}")

    deck_set = tuple(factory() for factory in DECK_FACTORIES)
    characters_by_deck, excluded_by_deck = _eligible_characters(deck_set)
    eligible = sorted({character for characters in characters_by_deck.values() for character in characters})

    character_dir = destination / "characters"
    licences_dir = destination / "licenses"
    character_dir.mkdir(parents=True)
    licences_dir.mkdir(parents=True)

    files: dict[str, dict[str, str]] = {}
    missing: list[str] = []
    for character in eligible:
        source_path = _source_path(source_data_dir, character)
        if source_path is None:
            missing.append(character)
            continue
        _validate_character_data(source_path)
        filename = f"{ord(character):05x}.json"
        destination_path = character_dir / filename
        shutil.copyfile(source_path, destination_path)
        files[character] = {
            "path": f"characters/{filename}",
            "source": source_path.name,
            "sha256": _sha256(destination_path),
        }

    if missing:
        missing_points = ", ".join(f"U+{ord(character):04X}" for character in missing)
        raise ValueError(f"Missing handwriting data for eligible characters: {missing_points}")

    shutil.copyfile(source_dir / "LICENSE", licences_dir / "hanzi-writer-data-youyin-MIT.txt")
    shutil.copyfile(japanese_submodule / "README.md", licences_dir / "hanzi-writer-data-jp-README.md")
    shutil.copytree(japanese_submodule / "licenses", licences_dir / "hanzi-writer-data-jp")
    (licences_dir / "ATTRIBUTION.md").write_text(
        """# Japanese handwriting data attribution

This directory contains a generated subset of `hanzi-writer-data-youyin` for
JPLearn's offline handwriting minigame.

- Aggregator: MadLadSquad, `hanzi-writer-data-youyin` at revision
  7d4aaeebe35b4cd9c251ecf17d0bbb6742644327 (MIT for aggregator code).
- Japanese data: `hanzi-writer-data-jp` at revision
  efbea0cb93ba0301475ae92f9d3e512b9e4cd2ca.
- The Japanese data is derived from AnimCJK (Francois Mizessyn, LGPL-3.0-or-later)
  and Make Me A Hanzi / Arphic fonts (Arphic Public License).

The copied upstream notices in this directory govern the character data. The
JPLearn application source remains Apache-2.0; this separately stored data is
not relicensed by that application licence.
""",
        encoding="utf-8",
    )

    manifest: dict[str, Any] = {
        "formatVersion": 1,
        "upstream": {
            "repository": UPSTREAM_REPOSITORY,
            "revision": UPSTREAM_REVISION,
            "japaneseDataRepository": JAPANESE_DATA_REPOSITORY,
            "japaneseDataRevision": JAPANESE_DATA_REVISION,
        },
        "coverage": {
            "eligibleCharacters": len(eligible),
            "decks": characters_by_deck,
            "excludedMultiCharacterCards": excluded_by_deck,
        },
        "characters": files,
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument(
        "--destination",
        type=Path,
        default=Path("electron-frontend/src/lib/handwriting-data"),
    )
    args = parser.parse_args()
    manifest = build_assets(args.source_dir.resolve(), args.destination.resolve())
    print(f"Wrote {manifest['coverage']['eligibleCharacters']} verified handwriting character files.")


if __name__ == "__main__":
    main()
