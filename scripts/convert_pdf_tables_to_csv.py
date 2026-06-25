from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ExtractedTable:
    page_number: int
    table_number: int
    rows: list[list[str]]


LINE_TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
}

TEXT_TABLE_SETTINGS = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
}

TABLE_STRATEGIES = {"auto", "lines", "text"}


def _normalize_cell(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\xa0", " ").split())


def _normalize_row(row: Iterable[object]) -> list[str]:
    if row is None:
        return []
    cells = [_normalize_cell(value) for value in row]
    while cells and not cells[-1]:
        cells.pop()
    return cells


def _table_has_content(rows: list[list[str]]) -> bool:
    return any(any(cell for cell in row) for row in rows)


def _extract_page_tables(page) -> list[list[list[object]]]:
    tables = page.extract_tables(table_settings=LINE_TABLE_SETTINGS) or []
    if tables:
        return tables
    return page.extract_tables(table_settings=TEXT_TABLE_SETTINGS) or []


def _extract_page_tables_with_mode(page, table_mode: str) -> list[list[list[object]]]:
    if table_mode == "lines":
        return page.extract_tables(table_settings=LINE_TABLE_SETTINGS) or []
    if table_mode == "text":
        return page.extract_tables(table_settings=TEXT_TABLE_SETTINGS) or []
    return _extract_page_tables(page)


def _parse_page_selection(page_spec: str | None) -> set[int] | None:
    if page_spec is None:
        return None

    selected_pages: set[int] = set()
    for chunk in page_spec.split(","):
        piece = chunk.strip()
        if not piece:
            continue
        if "-" in piece:
            start_text, end_text = piece.split("-", maxsplit=1)
            start_page = int(start_text)
            end_page = int(end_text)
            if start_page < 1 or end_page < start_page:
                raise ValueError(f"invalid page range: {piece}")
            selected_pages.update(range(start_page, end_page + 1))
            continue
        page_number = int(piece)
        if page_number < 1:
            raise ValueError(f"invalid page number: {piece}")
        selected_pages.add(page_number)

    if not selected_pages:
        raise ValueError("page selection is empty")
    return selected_pages


def extract_tables(pdf_path: Path, page_numbers: set[int] | None = None, table_mode: str = "auto") -> list[ExtractedTable]:
    tables: list[ExtractedTable] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            if page_numbers is not None and page_number not in page_numbers:
                continue
            page_tables = _extract_page_tables_with_mode(page, table_mode)
            for table_number, raw_table in enumerate(page_tables, start=1):
                rows = [_normalize_row(row) for row in raw_table]
                rows = [row for row in rows if any(cell for cell in row)]
                if not _table_has_content(rows):
                    continue
                tables.append(
                    ExtractedTable(
                        page_number=page_number,
                        table_number=table_number,
                        rows=rows,
                    )
                )
    return tables


def _output_name(input_pdf: Path, table: ExtractedTable) -> str:
    return f"{input_pdf.stem}_page{table.page_number:03d}_table{table.table_number:02d}.csv"


def write_tables(pdf_path: Path, output_dir: Path, page_numbers: set[int] | None = None, table_mode: str = "auto") -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    tables = extract_tables(pdf_path, page_numbers=page_numbers, table_mode=table_mode)
    if not tables:
        raise ValueError(f"No tables found in {pdf_path}")

    output_paths: list[Path] = []
    for table in tables:
        output_path = output_dir / _output_name(pdf_path, table)
        with output_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerows(table.rows)
        output_paths.append(output_path)
    return output_paths


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract tables from a PDF into one CSV per detected table.",
    )
    parser.add_argument(
        "input_pdf",
        type=Path,
        help="Path to the PDF file containing one or more tables.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory to write CSV files into. Defaults to <pdf-stem>_tables next to the PDF.",
    )
    parser.add_argument(
        "--pages",
        help="Optional page selection like '1,3-5' to limit extraction to specific pages.",
    )
    parser.add_argument(
        "--strategy",
        choices=sorted(TABLE_STRATEGIES),
        default="auto",
        help="Table detection strategy: auto, lines, or text.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    pdf_path = args.input_pdf
    if not pdf_path.exists():
        print(f"error: input PDF not found: {pdf_path}")
        return 2

    output_dir = args.output_dir or pdf_path.with_name(f"{pdf_path.stem}_tables")

    try:
        page_numbers = _parse_page_selection(args.pages)
    except ValueError as exc:
        print(f"error: {exc}")
        return 2

    try:
        outputs = write_tables(pdf_path, output_dir, page_numbers=page_numbers, table_mode=args.strategy)
    except Exception as exc:  # pragma: no cover - CLI guard
        print(f"error: {exc}")
        return 2

    print(f"Wrote {len(outputs)} CSV file(s) to {output_dir}")
    for path in outputs:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())