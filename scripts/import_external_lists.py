from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from data.text_normalization import normalize_japanese_text, normalize_storage_text

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORDS_N5_CSV = ROOT / "data" / "external_sources" / "words_n5.csv"
DEFAULT_WORDS_N4_CSV = ROOT / "data" / "external_sources" / "words_n4.csv"
DEFAULT_WORDS_N3_CSV = ROOT / "data" / "external_sources" / "words_n3.csv"
DEFAULT_WORDS_N2_CSV = ROOT / "data" / "external_sources" / "words_n2.csv"
DEFAULT_WORDS_N1_CSV = ROOT / "data" / "external_sources" / "words_n1.csv"
DEFAULT_CONVERSATIONAL_CSV = ROOT / "data" / "external_sources" / "conversational_n5.csv"
DEFAULT_KANJI_N5_CSV = ROOT / "data" / "external_sources" / "kanji_n5.csv"
DEFAULT_KANJI_N4_CSV = ROOT / "data" / "external_sources" / "kanji_n4.csv"
DEFAULT_KANJI_N3_CSV = ROOT / "data" / "external_sources" / "kanji_n3.csv"
DEFAULT_KANJI_N2_CSV = ROOT / "data" / "external_sources" / "kanji_n2.csv"
DEFAULT_KANJI_N1_CSV = ROOT / "data" / "external_sources" / "kanji_n1.csv"
OUTPUT_MODULE = ROOT / "domain" / "external_deck_data.py"


def _normalize_text(value: str) -> str:
    return normalize_storage_text(value)


def _display_source_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _read_csv(path: Path) -> list[tuple[str, str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing source file: {path}")

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"character", "romaji", "meaning"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(
                f"CSV {path} must include headers: character, romaji, meaning"
            )

        rows: list[tuple[str, str, str]] = []
        seen: set[tuple[str, str]] = set()
        for line_index, row in enumerate(reader, start=2):
            character = normalize_japanese_text(row.get("character", ""))
            romaji = _normalize_text(row.get("romaji", ""))
            meaning = _normalize_text(row.get("meaning", ""))

            if not character or not romaji or not meaning:
                raise ValueError(f"{path}:{line_index} has empty required fields")

            key = (character, romaji)
            if key in seen:
                continue
            seen.add(key)
            rows.append((character, romaji, meaning))

    return rows


def _format_rows(name: str, rows: list[tuple[str, str, str]]) -> str:
    lines = [f"{name}: list[tuple[str, str, str]] = ["]
    for character, romaji, meaning in rows:
        lines.append(f"    ({character!r}, {romaji!r}, {meaning!r}),")
    lines.append("]")
    return "\n".join(lines)


def _render_module(
    words_n5_rows: list[tuple[str, str, str]],
    words_n4_rows: list[tuple[str, str, str]],
    words_n3_rows: list[tuple[str, str, str]],
    words_n2_rows: list[tuple[str, str, str]],
    words_n1_rows: list[tuple[str, str, str]],
    conversational_rows: list[tuple[str, str, str]],
    kanji_n5_rows: list[tuple[str, str, str]],
    kanji_n4_rows: list[tuple[str, str, str]],
    kanji_n3_rows: list[tuple[str, str, str]],
    kanji_n2_rows: list[tuple[str, str, str]],
    kanji_n1_rows: list[tuple[str, str, str]],
    words_n5_source: Path,
    words_n4_source: Path,
    words_n3_source: Path,
    words_n2_source: Path,
    words_n1_source: Path,
    conversational_source: Path,
    kanji_n5_source: Path,
    kanji_n4_source: Path,
    kanji_n3_source: Path,
    kanji_n2_source: Path,
    kanji_n1_source: Path,
) -> str:
    header = [
        '"""Auto-generated external deck data. Do not edit by hand."""',
        "",
        f"# Generated from: {_display_source_path(words_n5_source)}",
        f"# Generated from: {_display_source_path(words_n4_source)}",
        f"# Generated from: {_display_source_path(words_n3_source)}",
        f"# Generated from: {_display_source_path(words_n2_source)}",
        f"# Generated from: {_display_source_path(words_n1_source)}",
        f"# Generated from: {_display_source_path(conversational_source)}",
        f"# Generated from: {_display_source_path(kanji_n5_source)}",
        f"# Generated from: {_display_source_path(kanji_n4_source)}",
        f"# Generated from: {_display_source_path(kanji_n3_source)}",
        f"# Generated from: {_display_source_path(kanji_n2_source)}",
        f"# Generated from: {_display_source_path(kanji_n1_source)}",
        "",
    ]
    body = [
        _format_rows("VOCAB_N5_EXTERNAL_DATA", words_n5_rows),
        "",
        _format_rows("VOCAB_N4_EXTERNAL_DATA", words_n4_rows),
        "",
        _format_rows("VOCAB_N3_EXTERNAL_DATA", words_n3_rows),
        "",
        _format_rows("VOCAB_N2_EXTERNAL_DATA", words_n2_rows),
        "",
        _format_rows("VOCAB_N1_EXTERNAL_DATA", words_n1_rows),
        "",
        _format_rows("GRAMMAR_PATTERNS_EXTERNAL_DATA", conversational_rows),
        "",
        _format_rows("KANJI_N5_EXTERNAL_DATA", kanji_n5_rows),
        "",
        _format_rows("KANJI_N4_EXTERNAL_DATA", kanji_n4_rows),
        "",
        _format_rows("KANJI_N3_EXTERNAL_DATA", kanji_n3_rows),
        "",
        _format_rows("KANJI_N2_EXTERNAL_DATA", kanji_n2_rows),
        "",
        _format_rows("KANJI_N1_EXTERNAL_DATA", kanji_n1_rows),
        "",
    ]
    return "\n".join(header + body)


def generate_external_deck_module(
    words_n5_csv: Path,
    words_n4_csv: Path,
    words_n3_csv: Path,
    words_n2_csv: Path,
    words_n1_csv: Path,
    conversational_csv: Path,
    output_module: Path = OUTPUT_MODULE,
    kanji_n5_csv: Path = DEFAULT_KANJI_N5_CSV,
    kanji_n4_csv: Path = DEFAULT_KANJI_N4_CSV,
    kanji_n3_csv: Path = DEFAULT_KANJI_N3_CSV,
    kanji_n2_csv: Path = DEFAULT_KANJI_N2_CSV,
    kanji_n1_csv: Path = DEFAULT_KANJI_N1_CSV,
) -> tuple[int, int, int, int, int, int, int, int, int, int, int]:
    words_n5_rows = _read_csv(words_n5_csv)
    words_n4_rows = _read_csv(words_n4_csv)
    words_n3_rows = _read_csv(words_n3_csv)
    words_n2_rows = _read_csv(words_n2_csv)
    words_n1_rows = _read_csv(words_n1_csv)
    conversational_rows = _read_csv(conversational_csv)
    kanji_n5_rows = _read_csv(kanji_n5_csv)
    kanji_n4_rows = _read_csv(kanji_n4_csv)
    kanji_n3_rows = _read_csv(kanji_n3_csv)
    kanji_n2_rows = _read_csv(kanji_n2_csv)
    kanji_n1_rows = _read_csv(kanji_n1_csv)

    if len(words_n5_rows) < 80:
        raise ValueError("Words N5 source must contain at least 80 rows")
    if len(words_n4_rows) < 80:
        raise ValueError("Words N4 source must contain at least 80 rows")
    if len(words_n3_rows) < 80:
        raise ValueError("Words N3 source must contain at least 80 rows")
    if len(words_n2_rows) < 80:
        raise ValueError("Words N2 source must contain at least 80 rows")
    if len(words_n1_rows) < 50:
        raise ValueError("Words N1 source must contain at least 50 rows")
    if len(conversational_rows) < 40:
        raise ValueError("Conversational source must contain at least 40 rows")
    if len(kanji_n5_rows) < 80:
        raise ValueError("Kanji N5 source must contain at least 80 rows")
    if len(kanji_n4_rows) < 20:
        raise ValueError("Kanji N4 source must contain at least 20 rows")
    if len(kanji_n3_rows) < 20:
        raise ValueError("Kanji N3 source must contain at least 20 rows")
    if len(kanji_n2_rows) < 20:
        raise ValueError("Kanji N2 source must contain at least 20 rows")
    if len(kanji_n1_rows) < 20:
        raise ValueError("Kanji N1 source must contain at least 20 rows")

    content = _render_module(
        words_n5_rows,
        words_n4_rows,
        words_n3_rows,
        words_n2_rows,
        words_n1_rows,
        conversational_rows,
        kanji_n5_rows,
        kanji_n4_rows,
        kanji_n3_rows,
        kanji_n2_rows,
        kanji_n1_rows,
        words_n5_csv,
        words_n4_csv,
        words_n3_csv,
        words_n2_csv,
        words_n1_csv,
        conversational_csv,
        kanji_n5_csv,
        kanji_n4_csv,
        kanji_n3_csv,
        kanji_n2_csv,
        kanji_n1_csv,
    )

    output_module.write_text(content, encoding="utf-8")
    return (
        len(words_n5_rows),
        len(words_n4_rows),
        len(words_n3_rows),
        len(words_n2_rows),
        len(words_n1_rows),
        len(conversational_rows),
        len(kanji_n5_rows),
        len(kanji_n4_rows),
        len(kanji_n3_rows),
        len(kanji_n2_rows),
        len(kanji_n1_rows),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate domain/external_deck_data.py from external CSV sources.",
    )
    parser.add_argument(
        "--words-n5-csv",
        type=Path,
        default=DEFAULT_WORDS_N5_CSV,
        help="Path to JLPT N5 words CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--words-n4-csv",
        type=Path,
        default=DEFAULT_WORDS_N4_CSV,
        help="Path to JLPT N4 words CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--words-n3-csv",
        type=Path,
        default=DEFAULT_WORDS_N3_CSV,
        help="Path to JLPT N3 words CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--words-n2-csv",
        type=Path,
        default=DEFAULT_WORDS_N2_CSV,
        help="Path to JLPT N2 words CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--words-n1-csv",
        type=Path,
        default=DEFAULT_WORDS_N1_CSV,
        help="Path to JLPT N1 words CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--conversational-csv",
        type=Path,
        default=DEFAULT_CONVERSATIONAL_CSV,
        help="Path to conversational CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--kanji-n5-csv",
        type=Path,
        default=DEFAULT_KANJI_N5_CSV,
        help="Path to JLPT N5 kanji CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--kanji-n4-csv",
        type=Path,
        default=DEFAULT_KANJI_N4_CSV,
        help="Path to JLPT N4 kanji CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--kanji-n3-csv",
        type=Path,
        default=DEFAULT_KANJI_N3_CSV,
        help="Path to JLPT N3 kanji CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--kanji-n2-csv",
        type=Path,
        default=DEFAULT_KANJI_N2_CSV,
        help="Path to JLPT N2 kanji CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--kanji-n1-csv",
        type=Path,
        default=DEFAULT_KANJI_N1_CSV,
        help="Path to JLPT N1 kanji CSV (character,romaji,meaning)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_MODULE,
        help="Output Python module path",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        (
            words_n5_count,
            words_n4_count,
            words_n3_count,
            words_n2_count,
            words_n1_count,
            conversational_count,
            kanji_n5_count,
            kanji_n4_count,
            kanji_n3_count,
            kanji_n2_count,
            kanji_n1_count,
        ) = generate_external_deck_module(
            words_n5_csv=args.words_n5_csv,
            words_n4_csv=args.words_n4_csv,
            words_n3_csv=args.words_n3_csv,
            words_n2_csv=args.words_n2_csv,
            words_n1_csv=args.words_n1_csv,
            conversational_csv=args.conversational_csv,
            kanji_n5_csv=args.kanji_n5_csv,
            kanji_n4_csv=args.kanji_n4_csv,
            kanji_n3_csv=args.kanji_n3_csv,
            kanji_n2_csv=args.kanji_n2_csv,
            kanji_n1_csv=args.kanji_n1_csv,
            output_module=args.output,
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(
        f"Generated {args.output.relative_to(ROOT)} "
        f"(words_n5={words_n5_count}, words_n4={words_n4_count}, "
        f"words_n3={words_n3_count}, words_n2={words_n2_count}, words_n1={words_n1_count}, "
        f"conversational={conversational_count}, "
        f"kanji_n5={kanji_n5_count}, kanji_n4={kanji_n4_count}, "
        f"kanji_n3={kanji_n3_count}, kanji_n2={kanji_n2_count}, kanji_n1={kanji_n1_count})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
