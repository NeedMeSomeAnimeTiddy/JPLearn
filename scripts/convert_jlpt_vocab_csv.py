from __future__ import annotations

import argparse
import csv
from collections.abc import Iterable
from pathlib import Path

from data.kana_romaji import kana_to_romaji
from data.text_normalization import normalize_japanese_text, normalize_storage_text

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "jlpt_vocab.csv"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "external_sources" / "staging"

_LEVELS = ("N1", "N2", "N3", "N4", "N5")

def _normalize(text: str) -> str:
    return normalize_storage_text(text)


def _iter_rows(path: Path) -> Iterable[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Original", "Furigana", "English", "JLPT Level"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(
                "Input CSV must include headers: Original, Furigana, English, JLPT Level"
            )
        for row in reader:
            yield row


def convert_jlpt_vocab_csv(input_csv: Path, output_dir: Path) -> dict[str, int]:
    output_dir.mkdir(parents=True, exist_ok=True)

    by_level: dict[str, list[tuple[str, str, str]]] = {level: [] for level in _LEVELS}
    seen_by_level: dict[str, set[tuple[str, str]]] = {level: set() for level in _LEVELS}

    for row in _iter_rows(input_csv):
        level = _normalize(row.get("JLPT Level", "")).upper()
        if level not in by_level:
            continue

        character = normalize_japanese_text(row.get("Original", ""))
        furigana = normalize_japanese_text(row.get("Furigana", ""))
        meaning = _normalize(row.get("English", ""))

        if not character or not furigana or not meaning:
            continue

        romaji = kana_to_romaji(furigana)
        if not romaji:
            continue

        key = (character, romaji)
        if key in seen_by_level[level]:
            continue

        seen_by_level[level].add(key)
        by_level[level].append((character, romaji, meaning))

    counts: dict[str, int] = {}
    for level in _LEVELS:
        output = output_dir / f"words_{level.lower()}.csv"
        with output.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["character", "romaji", "meaning"])
            writer.writerows(by_level[level])
        counts[level] = len(by_level[level])

    return counts


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert a JLPT vocabulary CSV into per-level external source CSV files.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to source CSV with headers: Original,Furigana,English,JLPT Level",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory for words_n1.csv ... words_n5.csv",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        counts = convert_jlpt_vocab_csv(args.input, args.output_dir)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}")
        return 2

    for level in _LEVELS:
        print(f"{level}: {counts[level]} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
