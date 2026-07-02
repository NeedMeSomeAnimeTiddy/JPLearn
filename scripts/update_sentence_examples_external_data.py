from __future__ import annotations

import argparse
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "external_sources" / "sentence_examples.csv"
DEFAULT_MODULE = ROOT / "domain" / "external_deck_data.py"
DEFAULT_SYMBOL = "SENTENCE_EXAMPLES_EXTERNAL_DATA"
EXPECTED_HEADERS = ("character", "romaji", "meaning")


def _load_rows(csv_path: Path) -> list[tuple[str, str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = tuple((reader.fieldnames or []))
        if fieldnames != EXPECTED_HEADERS:
            raise ValueError(
                f"CSV must have exact headers {EXPECTED_HEADERS}; found {fieldnames}"
            )

        rows: list[tuple[str, str, str]] = []
        for line_no, row in enumerate(reader, start=2):
            character = (row.get("character") or "").strip()
            romaji = (row.get("romaji") or "").strip()
            meaning = (row.get("meaning") or "").strip()
            if not character or not romaji or not meaning:
                raise ValueError(f"{csv_path}:{line_no} has empty required fields")
            rows.append((character, romaji, meaning))
    return rows


def _render_symbol(symbol: str, rows: list[tuple[str, str, str]]) -> list[str]:
    lines = [f"{symbol}: list[tuple[str, str, str]] = ["]
    for character, romaji, meaning in rows:
        lines.append(f"    ({character!r}, {romaji!r}, {meaning!r}),")
    lines.append("]")
    return lines


def _replace_or_append_symbol(module_path: Path, symbol: str, rendered: list[str]) -> tuple[bool, int]:
    source_lines = module_path.read_text(encoding="utf-8").splitlines()
    start_prefix = f"{symbol}: list[tuple[str, str, str]] = ["

    start_index = next((i for i, line in enumerate(source_lines) if line.startswith(start_prefix)), None)
    if start_index is None:
        updated_lines = source_lines + ["", ""] + rendered
        module_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
        return False, len(rendered)

    end_index = None
    for i in range(start_index + 1, len(source_lines)):
        if source_lines[i] == "]":
            end_index = i
            break
    if end_index is None:
        raise ValueError(f"Could not find closing bracket for symbol {symbol} in {module_path}")

    updated_lines = source_lines[:start_index] + rendered + source_lines[end_index + 1 :]
    module_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
    return True, len(rendered)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Insert or replace sentence examples list in domain/external_deck_data.py from CSV.",
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Input CSV path")
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE, help="Target Python module path")
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL, help="Target symbol name")
    args = parser.parse_args()

    if not args.csv.exists():
        raise FileNotFoundError(f"CSV not found: {args.csv}")
    if not args.module.exists():
        raise FileNotFoundError(f"Module not found: {args.module}")

    rows = _load_rows(args.csv)
    rendered = _render_symbol(args.symbol, rows)
    replaced, written_line_count = _replace_or_append_symbol(args.module, args.symbol, rendered)

    action = "Replaced" if replaced else "Appended"
    print(f"{action} {args.symbol} in {args.module}")
    print(f"Rows imported: {len(rows)}")
    print(f"Lines written for symbol: {written_line_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
