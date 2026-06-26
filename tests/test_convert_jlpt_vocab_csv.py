from __future__ import annotations

import csv
from pathlib import Path

from scripts.convert_jlpt_vocab_csv import convert_jlpt_vocab_csv


def _read_rows(path: Path) -> list[list[str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.reader(handle))


def test_convert_jlpt_vocab_csv_normalizes_japanese_fields(tmp_path: Path) -> None:
    input_csv = tmp_path / "jlpt.csv"
    output_dir = tmp_path / "out"

    input_csv.write_text(
        "\n".join(
            [
                "Original,Furigana,English,JLPT Level",
                " ｶｰﾄﾞ—､｡ , ｶｰﾄﾞ , card , n5 ",
            ]
        ),
        encoding="utf-8",
    )

    counts = convert_jlpt_vocab_csv(input_csv, output_dir)

    assert counts["N5"] == 1
    n5_rows = _read_rows(output_dir / "words_n5.csv")
    assert n5_rows[0] == ["character", "romaji", "meaning"]
    assert n5_rows[1][0] == "カードー、。"
    assert n5_rows[1][1] == "kaado"
    assert n5_rows[1][2] == "card"
