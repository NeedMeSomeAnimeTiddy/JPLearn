"""Generate committed, offline handwriting data chunks from pinned source data."""

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
DEFAULT_DESTINATION = Path("electron-frontend/public/handwriting-data")
DEFAULT_MANIFEST_MODULE = Path("electron-frontend/src/lib/handwriting-data-manifest.json")
DECK_FACTORIES = (
    decks.get_hiragana_deck,
    decks.get_katakana_deck,
    decks.get_kanji_n5_deck,
    decks.get_kanji_n4_deck,
    decks.get_kanji_n3_deck,
    decks.get_kanji_n2_deck,
    decks.get_kanji_n1_deck,
)
KANJI_CHUNKS = ("kanji-n5", "kanji-n4", "kanji-n3", "kanji-n2")
N1_SHARDS = ("kanji-n1-a", "kanji-n1-b", "kanji-n1-c", "kanji-n1-d")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_character_data(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Malformed handwriting data in {path}: {exc}") from exc
    return _read_character_data_from_value(data, str(path))


def _read_character_data_from_value(data: Any, label: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError(f"Malformed handwriting data in {label}: expected object")
    strokes = data.get("strokes")
    medians = data.get("medians")
    if not isinstance(strokes, list) or not isinstance(medians, list) or not strokes:
        raise ValueError(f"Malformed handwriting data in {label}: missing strokes or medians")
    if len(strokes) != len(medians):
        raise ValueError(f"Malformed handwriting data in {label}: stroke and median counts differ")
    if not all(isinstance(stroke, str) and stroke for stroke in strokes):
        raise ValueError(f"Malformed handwriting data in {label}: invalid SVG stroke path")
    if not all(isinstance(median, list) and median for median in medians):
        raise ValueError(f"Malformed handwriting data in {label}: invalid stroke median")
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


def _assign_chunks(characters_by_deck: dict[str, list[str]], available: set[str]) -> dict[str, str]:
    """Map each deck character with stroke data onto the chunk that carries it.

    Characters absent from *available* are skipped: upstream has no stroke data
    for them, so the handwriting minigame cannot draw them. They are recorded in
    the manifest under ``excludedMissingData`` instead of being dropped silently.
    """
    assignments: dict[str, str] = {}
    for deck_name, chunk in (("Hiragana", "hiragana"), ("Katakana", "katakana")):
        for character in characters_by_deck[deck_name]:
            if character in available:
                assignments[character] = chunk
    for deck_name, chunk in zip(("Kanji N5", "Kanji N4", "Kanji N3", "Kanji N2"), KANJI_CHUNKS, strict=True):
        for character in characters_by_deck[deck_name]:
            if character in available:
                assignments.setdefault(character, chunk)
    for character in characters_by_deck["Kanji N1"]:
        if character in available:
            assignments.setdefault(character, N1_SHARDS[ord(character) % len(N1_SHARDS)])
    return assignments


def _copy_notices(source_dir: Path, notices_dir: Path) -> None:
    if (source_dir / "manifest.json").is_file() and (source_dir / "notices").is_dir():
        shutil.copytree(source_dir / "notices", notices_dir)
        return
    if (source_dir / "manifest.json").is_file() and (source_dir / "licenses").is_dir():
        shutil.copytree(source_dir / "licenses", notices_dir)
        return
    japanese_submodule = source_dir / "ThirdParty" / "hanzi-writer-data-jp"
    package_root = Path(__file__).resolve().parents[1] / "electron-frontend" / "node_modules" / "hanzi-writer"
    notices_dir.mkdir(parents=True)
    shutil.copyfile(package_root / "LICENSE", notices_dir / "hanzi-writer-MIT.txt")
    shutil.copyfile(source_dir / "LICENSE", notices_dir / "hanzi-writer-data-youyin-MIT.txt")
    shutil.copyfile(japanese_submodule / "README.md", notices_dir / "hanzi-writer-data-jp-README.md")
    shutil.copytree(japanese_submodule / "licenses", notices_dir / "hanzi-writer-data-jp")
    (notices_dir / "ATTRIBUTION.md").write_text(
        """# Japanese handwriting data attribution

This directory contains a generated subset of `hanzi-writer-data-youyin` for
JPLearn's offline handwriting minigame.

- Runtime: `hanzi-writer` 3.6.0 (MIT).
- Aggregator: MadLadSquad, `hanzi-writer-data-youyin` at revision
  7d4aaeebe35b4cd9c251ecf17d0bbb6742644327 (MIT for aggregator code).
- Japanese data: `hanzi-writer-data-jp` at revision
  efbea0cb93ba0301475ae92f9d3e512b9e4cd2ca.
- The Japanese data is derived from AnimCJK (LGPL-3.0-or-later) and Make Me A
  Hanzi / Arphic fonts (Arphic Public License).

The copied upstream notices in this directory govern the character data.
""",
        encoding="utf-8",
    )


def _write_assets(
    destination: Path,
    manifest_module: Path,
    characters_by_deck: dict[str, list[str]],
    excluded_by_deck: dict[str, list[str]],
    data_by_character: dict[str, dict[str, Any]],
    notice_source_dir: Path,
) -> dict[str, Any]:
    if destination.exists():
        raise ValueError(f"Refusing to overwrite existing destination: {destination}")
    assignments = _assign_chunks(characters_by_deck, set(data_by_character))
    eligible = {character for values in characters_by_deck.values() for character in values if len(character) == 1}
    if set(assignments) != set(data_by_character) & eligible:
        raise ValueError("Chunk assignments do not exactly match verified character data")
    missing_data = sorted(eligible - set(assignments))

    chunk_data: dict[str, dict[str, dict[str, Any]]] = {}
    for character in assignments:
        chunk_data.setdefault(assignments[character], {})[character] = data_by_character[character]

    chunks_dir = destination / "chunks"
    chunks_dir.mkdir(parents=True)
    chunks: dict[str, dict[str, Any]] = {}
    for chunk_name in sorted(chunk_data):
        payload = json.dumps(chunk_data[chunk_name], ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        filename = f"{chunk_name}.json"
        (chunks_dir / filename).write_bytes(payload)
        chunks[chunk_name] = {
            "path": f"chunks/{filename}",
            "sha256": _sha256_bytes(payload),
            "characterCount": len(chunk_data[chunk_name]),
        }

    manifest: dict[str, Any] = {
        "formatVersion": 2,
        "upstream": {
            "repository": UPSTREAM_REPOSITORY,
            "revision": UPSTREAM_REVISION,
            "japaneseDataRepository": JAPANESE_DATA_REPOSITORY,
            "japaneseDataRevision": JAPANESE_DATA_REVISION,
        },
        "coverage": {
            "eligibleCharacters": len(assignments),
            "decks": characters_by_deck,
            "excludedMultiCharacterCards": excluded_by_deck,
            # Single-character deck entries upstream has no stroke data for. The
            # renderer already gates on `manifest.characters[character]`
            # (features/handwriting/utils.ts), so these are simply not offered
            # for handwriting practice — they are listed rather than dropped so
            # the gap is visible instead of inferred.
            "excludedMissingData": missing_data,
        },
        "chunks": chunks,
        "characters": {character: {"chunk": assignments[character]} for character in sorted(assignments)},
    }
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (destination / "manifest.json").write_text(manifest_text, encoding="utf-8")
    manifest_module.parent.mkdir(parents=True, exist_ok=True)
    manifest_module.write_text(manifest_text, encoding="utf-8")
    _copy_notices(notice_source_dir, destination / "notices")
    return manifest


def build_assets(source_dir: Path, destination: Path, manifest_module: Path) -> dict[str, Any]:
    """Build a verified subset from a pinned upstream checkout."""
    source_data_dir = source_dir / "data"
    japanese_submodule = source_dir / "ThirdParty" / "hanzi-writer-data-jp"
    if not source_data_dir.is_dir() or not japanese_submodule.is_dir():
        raise ValueError("source_dir must contain data/ and initialised ThirdParty/hanzi-writer-data-jp/")
    characters_by_deck, excluded_by_deck = _eligible_characters(factory() for factory in DECK_FACTORIES)
    data_by_character: dict[str, dict[str, Any]] = {}
    for character in sorted({character for values in characters_by_deck.values() for character in values}):
        source_path = _source_path(source_data_dir, character)
        if source_path is not None:
            data_by_character[character] = _read_character_data(source_path)
    return _write_assets(destination, manifest_module, characters_by_deck, excluded_by_deck, data_by_character, source_dir)


def repack_assets(source_assets: Path, destination: Path, manifest_module: Path) -> dict[str, Any]:
    """Repackage an already verified asset directory without upstream access.

    Coverage is recomputed from the current decks rather than copied from the
    source manifest, so a deck-composition change is picked up here without
    needing the pinned upstream checkout. Characters the source assets have no
    stroke data for are recorded as ``excludedMissingData``.
    """
    source_manifest = json.loads((source_assets / "manifest.json").read_text(encoding="utf-8"))
    if source_manifest["formatVersion"] == 1:
        data_by_character = {
            character: _read_character_data(source_assets / entry["path"])
            for character, entry in source_manifest["characters"].items()
        }
    else:
        chunk_payloads = {
            name: json.loads((source_assets / entry["path"]).read_text(encoding="utf-8"))
            for name, entry in source_manifest["chunks"].items()
        }
        data_by_character = {
            character: _read_character_data_from_value(chunk_payloads[entry["chunk"]][character], character)
            for character, entry in source_manifest["characters"].items()
        }
    characters_by_deck, excluded_by_deck = _eligible_characters(factory() for factory in DECK_FACTORIES)
    return _write_assets(
        destination,
        manifest_module,
        characters_by_deck,
        excluded_by_deck,
        data_by_character,
        source_assets,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path, nargs="?")
    parser.add_argument("--source-assets", type=Path, help="Repackage an existing v1 committed asset directory")
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument("--manifest-module", type=Path, default=DEFAULT_MANIFEST_MODULE)
    args = parser.parse_args()
    if bool(args.source_dir) == bool(args.source_assets):
        parser.error("provide exactly one of source_dir or --source-assets")
    if args.source_assets:
        manifest = repack_assets(args.source_assets.resolve(), args.destination.resolve(), args.manifest_module.resolve())
    else:
        manifest = build_assets(args.source_dir.resolve(), args.destination.resolve(), args.manifest_module.resolve())
    print(f"Wrote {len(manifest['chunks'])} chunks for {manifest['coverage']['eligibleCharacters']} verified characters.")


if __name__ == "__main__":
    main()
