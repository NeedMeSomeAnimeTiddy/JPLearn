from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from scripts import convert_pdf_tables_to_csv as converter


class _FakePage:
    def __init__(self, tables: list[list[list[object]]]) -> None:
        self._tables = tables

    def extract_tables(self, table_settings=None):
        return self._tables


class _FakePdf:
    def __init__(self, pages: list[_FakePage]) -> None:
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_extract_tables_prefers_line_tables(monkeypatch) -> None:
    fake_pdf = _FakePdf([
        _FakePage([[["Header 1", "Header 2"], ["A", "B"], ["C", None]]]),
    ])

    monkeypatch.setattr(converter.pdfplumber, "open", lambda _path: fake_pdf)

    tables = converter.extract_tables(Path("sample.pdf"))

    assert len(tables) == 1
    assert tables[0].page_number == 1
    assert tables[0].table_number == 1
    assert tables[0].rows == [["Header 1", "Header 2"], ["A", "B"], ["C"]]


def test_write_tables_creates_one_csv_per_table(tmp_path: Path, monkeypatch) -> None:
    fake_pdf = _FakePdf([
        _FakePage([[["A", "B"], ["1", "2"]]]),
        _FakePage([[["X", "Y"], ["9", "8"]]]),
    ])
    monkeypatch.setattr(converter.pdfplumber, "open", lambda _path: fake_pdf)

    outputs = converter.write_tables(Path("report.pdf"), tmp_path)

    assert [path.name for path in outputs] == [
        "report_page001_table01.csv",
        "report_page002_table01.csv",
    ]
    assert outputs[0].read_text(encoding="utf-8").strip().splitlines() == ["A,B", "1,2"]
    assert outputs[1].read_text(encoding="utf-8").strip().splitlines() == ["X,Y", "9,8"]


def test_write_tables_can_filter_pages(tmp_path: Path, monkeypatch) -> None:
    fake_pdf = _FakePdf([
        _FakePage([[["A", "B"], ["1", "2"]]]),
        _FakePage([[["X", "Y"], ["9", "8"]]]),
        _FakePage([[["M", "N"], ["3", "4"]]]),
    ])
    monkeypatch.setattr(converter.pdfplumber, "open", lambda _path: fake_pdf)

    outputs = converter.write_tables(Path("report.pdf"), tmp_path, page_numbers={2, 3}, table_mode="text")

    assert [path.name for path in outputs] == [
        "report_page002_table01.csv",
        "report_page003_table01.csv",
    ]


def test_parse_page_selection_supports_ranges() -> None:
    assert converter._parse_page_selection("1, 3-5, 7") == {1, 3, 4, 5, 7}


def test_parse_page_selection_rejects_invalid_ranges() -> None:
    try:
        converter._parse_page_selection("4-2")
    except ValueError as exc:
        assert "invalid page range" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_main_errors_when_input_missing(monkeypatch, capsys) -> None:
    monkeypatch.setattr(converter, "build_parser", lambda: SimpleNamespace(parse_args=lambda: SimpleNamespace(input_pdf=Path("missing.pdf"), output_dir=None)))

    code = converter.main()
    output = capsys.readouterr().out.strip()

    assert code == 2
    assert "input PDF not found" in output