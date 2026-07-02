from __future__ import annotations

import argparse
import csv
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

try:
    from pykakasi import kakasi as _kakasi_factory
except ImportError:
    _kakasi_factory = None

try:
    from fugashi import Tagger as _FugashiTagger
except ImportError:
    _FugashiTagger = None

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "external_sources" / "jotoba_sentences.tsv"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "external_sources" / "staging"

JP_SCRIPT_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u3005々〆ヵヶ]")
URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
HTML_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
JP_PARTICLE_HINT_RE = re.compile(r"(は|が|を|に|で|と|も|の|へ|か)")


@dataclass
class SentenceRow:
    source_line: int
    jp_id: str
    jp: str
    en_id: str
    en: str


_KAKASI_CONVERTER = _kakasi_factory() if _kakasi_factory is not None else None
_FUGASHI_TAGGER = _FugashiTagger() if _FugashiTagger is not None else None


def _normalize_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text.strip())


def _contains_japanese(text: str) -> bool:
    return bool(JP_SCRIPT_RE.search(text))


def _symbol_ratio(text: str) -> float:
    visible = [ch for ch in text if not ch.isspace()]
    if not visible:
        return 1.0
    symbol_count = 0
    for ch in visible:
        if ch.isalnum():
            continue
        if JP_SCRIPT_RE.match(ch):
            continue
        if ch in "。、，．・！？!?.,:;'\"()[]{}-_/〜~":
            continue
        symbol_count += 1
    return symbol_count / len(visible)


def _has_noise(text: str) -> bool:
    if "�" in text:
        return True
    if URL_RE.search(text):
        return True
    if HTML_RE.search(text):
        return True
    if CONTROL_RE.search(text):
        return True
    if _symbol_ratio(text) > 0.35:
        return True
    return False


def _english_quality_score(en: str) -> int:
    score = 0
    if re.search(r"[A-Za-z]", en):
        score += 25
    if en.endswith((".", "!", "?")):
        score += 10
    if 10 <= len(en) <= 140:
        score += 15
    if ";" in en:
        score -= 1
    if URL_RE.search(en) or HTML_RE.search(en):
        score -= 40
    if CONTROL_RE.search(en):
        score -= 30
    score -= int(_symbol_ratio(en) * 100)
    return score


def _japanese_learnability_score(row: SentenceRow) -> int:
    score = 0
    jp_len = len(row.jp)
    en_len = len(row.en)

    # Prefer concise but complete training sentences.
    if 8 <= jp_len <= 35:
        score += 20
    elif 5 <= jp_len <= 60:
        score += 10
    else:
        score -= 10

    if 8 <= en_len <= 90:
        score += 12
    elif 5 <= en_len <= 140:
        score += 5
    else:
        score -= 8

    if JP_PARTICLE_HINT_RE.search(row.jp):
        score += 6

    digit_count = sum(ch.isdigit() for ch in row.jp)
    latin_count = sum(ch.isascii() and ch.isalpha() for ch in row.jp)
    score -= min(10, digit_count * 2)
    score -= min(12, latin_count)
    score -= int(_symbol_ratio(row.jp) * 50)
    score += _english_quality_score(row.en)
    return score


def _romanize_japanese(text: str) -> str:
    if _KAKASI_CONVERTER is None:
        raise RuntimeError(
            "Romaji generation requires pykakasi. Install it with: pip install pykakasi"
        )

    tokens: list[str] = []
    for jp_token in _tokenize_for_romaji(text):
        token_parts: list[str] = []
        for item in _KAKASI_CONVERTER.convert(jp_token):
            hepburn = _normalize_text(str(item.get("hepburn", ""))).lower()
            if hepburn:
                token_parts.append(hepburn)
        if token_parts:
            tokens.append("".join(token_parts))

    romaji = " ".join(tokens).strip()
    romaji = WHITESPACE_RE.sub(" ", romaji)
    if not romaji:
        raise RuntimeError(f"Failed to generate romaji for sentence: {text}")
    return romaji


def _tokenize_for_romaji(text: str) -> list[str]:
    if _FUGASHI_TAGGER is not None:
        return [word.surface for word in _FUGASHI_TAGGER(text) if word.surface.strip()]

    # Fallback without morphological tokenizer: split into contiguous script runs.
    return [
        part
        for part in re.findall(r"[一-龯々〆ヵヶぁ-ゟァ-ヿーA-Za-z0-9]+|[^\s]", text)
        if part.strip()
    ]


def _format_romaji(romaji: str, style: str) -> str:
    if style == "compact":
        return romaji.replace(" ", "")
    return romaji


def _write_delimited(path: Path, rows: list[list[str]], delimiter: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=delimiter, lineterminator="\n")
        for row in rows:
            writer.writerow(row)


def _drop_row(
    dropped: list[list[str]],
    row: SentenceRow,
    reason: str,
    details: str = "",
) -> None:
    dropped.append(
        [
            str(row.source_line),
            reason,
            row.jp_id,
            row.jp,
            row.en_id,
            row.en,
            details,
        ]
    )


def clean_tsv(
    input_path: Path,
    output_dir: Path,
    min_jp_len: int,
    max_jp_len: int,
    min_en_len: int,
    max_en_len: int,
    max_rows: int,
    eval_sample_size: int,
    seed: int,
    rank_by_learnability: bool,
    keep_ids: bool,
    write_csv: bool,
    write_import_csv: bool,
    romaji_style: str,
) -> dict[str, int]:
    curated: list[SentenceRow] = []
    dropped_rows: list[list[str]] = [
        [
            "source_line",
            "reason",
            "jp_id",
            "jp",
            "en_id",
            "en",
            "details",
        ]
    ]
    stats = {
        "input_rows": 0,
        "kept_rows": 0,
        "dropped_bad_columns": 0,
        "dropped_empty": 0,
        "dropped_length": 0,
        "dropped_no_japanese": 0,
        "dropped_noise": 0,
        "dropped_duplicate_pair": 0,
        "dropped_duplicate_jp": 0,
        "replaced_duplicate_jp": 0,
        "trimmed_for_max_rows": 0,
        "ranked_by_learnability": 0,
        "ids_kept": 1,
        "csv_written": 0,
        "import_csv_written": 0,
        "romaji_style_spaced": 1,
    }

    seen_pairs: set[tuple[str, str]] = set()
    jp_to_index: dict[str, int] = {}

    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter="\t")
        for source_line, raw in enumerate(reader, start=1):
            stats["input_rows"] += 1

            if len(raw) != 4:
                stats["dropped_bad_columns"] += 1
                dropped_rows.append(
                    [
                        str(source_line),
                        "bad_columns",
                        "",
                        "",
                        "",
                        "",
                        f"expected_4_columns_got_{len(raw)}",
                    ]
                )
                continue

            row = SentenceRow(
                source_line=source_line,
                jp_id=_normalize_text(raw[0]),
                jp=_normalize_text(raw[1]),
                en_id=_normalize_text(raw[2]),
                en=_normalize_text(raw[3]),
            )

            if not row.jp_id or not row.jp or not row.en_id or not row.en:
                stats["dropped_empty"] += 1
                _drop_row(dropped_rows, row, "empty_required_field")
                continue

            jp_len = len(row.jp)
            en_len = len(row.en)
            if not (min_jp_len <= jp_len <= max_jp_len) or not (min_en_len <= en_len <= max_en_len):
                stats["dropped_length"] += 1
                _drop_row(
                    dropped_rows,
                    row,
                    "length_out_of_range",
                    f"jp_len={jp_len};en_len={en_len}",
                )
                continue

            if not _contains_japanese(row.jp):
                stats["dropped_no_japanese"] += 1
                _drop_row(dropped_rows, row, "jp_has_no_japanese_script")
                continue

            if _has_noise(row.jp) or _has_noise(row.en):
                stats["dropped_noise"] += 1
                _drop_row(dropped_rows, row, "noise_or_encoding_artifact")
                continue

            pair_key = (row.jp, row.en)
            if pair_key in seen_pairs:
                stats["dropped_duplicate_pair"] += 1
                _drop_row(dropped_rows, row, "duplicate_exact_pair")
                continue

            existing_index = jp_to_index.get(row.jp)
            if existing_index is not None:
                existing = curated[existing_index]
                existing_score = _english_quality_score(existing.en)
                candidate_score = _english_quality_score(row.en)

                if candidate_score > existing_score:
                    stats["replaced_duplicate_jp"] += 1
                    _drop_row(
                        dropped_rows,
                        existing,
                        "duplicate_jp_replaced",
                        f"replaced_by_line_{row.source_line}",
                    )
                    seen_pairs.discard((existing.jp, existing.en))
                    curated[existing_index] = row
                    seen_pairs.add(pair_key)
                else:
                    stats["dropped_duplicate_jp"] += 1
                    _drop_row(
                        dropped_rows,
                        row,
                        "duplicate_jp_lower_quality",
                        f"kept_line_{existing.source_line}",
                    )
                continue

            seen_pairs.add(pair_key)
            jp_to_index[row.jp] = len(curated)
            curated.append(row)

    if rank_by_learnability:
        curated.sort(key=lambda row: (-_japanese_learnability_score(row), row.source_line))
        stats["ranked_by_learnability"] = 1

    if max_rows > 0 and len(curated) > max_rows:
        stats["trimmed_for_max_rows"] = len(curated) - max_rows
        curated = curated[:max_rows]

    stats["kept_rows"] = len(curated)
    stats["ids_kept"] = 1 if keep_ids else 0
    stats["csv_written"] = 1 if write_csv else 0
    stats["import_csv_written"] = 1 if write_import_csv else 0
    stats["romaji_style_spaced"] = 1 if romaji_style == "spaced" else 0

    if keep_ids:
        curated_rows = [[row.jp_id, row.jp, row.en_id, row.en] for row in curated]
    else:
        curated_rows = [[row.jp, row.en] for row in curated]

    eval_size = min(eval_sample_size, len(curated))
    rng = random.Random(seed)
    eval_indexes = sorted(rng.sample(range(len(curated)), eval_size)) if eval_size > 0 else []
    eval_rows = [curated_rows[idx] for idx in eval_indexes]

    curated_path = output_dir / "curated.tsv"
    dropped_path = output_dir / "dropped_rows_report.tsv"
    eval_path = output_dir / "eval_sample.tsv"
    stats_path = output_dir / "cleaning_stats.json"

    _write_delimited(curated_path, curated_rows, "\t")
    _write_delimited(dropped_path, dropped_rows, "\t")
    _write_delimited(eval_path, eval_rows, "\t")

    if write_csv:
        _write_delimited(output_dir / "curated.csv", curated_rows, ",")
        _write_delimited(output_dir / "dropped_rows_report.csv", dropped_rows, ",")
        _write_delimited(output_dir / "eval_sample.csv", eval_rows, ",")

    if write_import_csv:
        import_rows = [["character", "romaji", "meaning"]]
        for row in curated:
            raw_romaji = _romanize_japanese(row.jp)
            import_rows.append([row.jp, _format_romaji(raw_romaji, romaji_style), row.en])
        _write_delimited(output_dir / "sentence_examples_import.csv", import_rows, ",")

    stats_path.write_text(json.dumps(stats, indent=2), encoding="utf-8")

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Clean a Jotoba sentence TSV (JP-ID, JP sentence, EN-ID, EN sentence) into "
            "curated, dropped-report, and eval-sample outputs."
        )
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to source TSV")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for curated/report outputs",
    )
    parser.add_argument("--min-jp-len", type=int, default=5)
    parser.add_argument("--max-jp-len", type=int, default=90)
    parser.add_argument("--min-en-len", type=int, default=5)
    parser.add_argument("--max-en-len", type=int, default=160)
    parser.add_argument(
        "--max-rows",
        type=int,
        default=80000,
        help="Maximum rows to keep after cleaning (0 disables cap)",
    )
    parser.add_argument(
        "--eval-sample-size",
        type=int,
        default=3000,
        help="Number of rows to randomly sample for eval_sample.tsv",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for eval sample")
    parser.add_argument(
        "--rank-by-learnability",
        action="store_true",
        help="Rank cleaned rows by a simple learnability heuristic before max-row trimming",
    )
    parser.add_argument(
        "--drop-ids",
        action="store_true",
        help="Output curated/eval as JP+EN columns only (IDs omitted)",
    )
    parser.add_argument(
        "--write-csv",
        action="store_true",
        help="Also write curated/report/eval files in CSV format",
    )
    parser.add_argument(
        "--no-import-csv",
        action="store_true",
        help="Disable writing sentence_examples_import.csv",
    )
    parser.add_argument(
        "--romaji-style",
        choices=("spaced", "compact"),
        default="spaced",
        help="Romaji style in sentence_examples_import.csv (default: spaced)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"Input TSV not found: {args.input}")

    stats = clean_tsv(
        input_path=args.input,
        output_dir=args.output_dir,
        min_jp_len=args.min_jp_len,
        max_jp_len=args.max_jp_len,
        min_en_len=args.min_en_len,
        max_en_len=args.max_en_len,
        max_rows=args.max_rows,
        eval_sample_size=args.eval_sample_size,
        seed=args.seed,
        rank_by_learnability=args.rank_by_learnability,
        keep_ids=not args.drop_ids,
        write_csv=args.write_csv,
        write_import_csv=not args.no_import_csv,
        romaji_style=args.romaji_style,
    )

    print("Cleaning complete")
    for key in sorted(stats.keys()):
        print(f"{key}: {stats[key]}")
    print(f"Output directory: {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
