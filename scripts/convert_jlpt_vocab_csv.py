from __future__ import annotations

import argparse
import csv
import re
from collections.abc import Iterable
from pathlib import Path

from data.text_normalization import normalize_japanese_text, normalize_storage_text

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "jlpt_vocab.csv"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "external_sources" / "staging"

_LEVELS = ("N1", "N2", "N3", "N4", "N5")

_KATAKANA_TO_HIRAGANA_START = ord("ァ")
_KATAKANA_TO_HIRAGANA_END = ord("ン")

_DIGRAPHS: dict[str, str] = {
    "きゃ": "kya",
    "きゅ": "kyu",
    "きょ": "kyo",
    "ぎゃ": "gya",
    "ぎゅ": "gyu",
    "ぎょ": "gyo",
    "しゃ": "sha",
    "しゅ": "shu",
    "しょ": "sho",
    "じゃ": "ja",
    "じゅ": "ju",
    "じょ": "jo",
    "ちゃ": "cha",
    "ちゅ": "chu",
    "ちょ": "cho",
    "にゃ": "nya",
    "にゅ": "nyu",
    "にょ": "nyo",
    "ひゃ": "hya",
    "ひゅ": "hyu",
    "ひょ": "hyo",
    "びゃ": "bya",
    "びゅ": "byu",
    "びょ": "byo",
    "ぴゃ": "pya",
    "ぴゅ": "pyu",
    "ぴょ": "pyo",
    "みゃ": "mya",
    "みゅ": "myu",
    "みょ": "myo",
    "りゃ": "rya",
    "りゅ": "ryu",
    "りょ": "ryo",
    "ゔぁ": "va",
    "ゔぃ": "vi",
    "ゔ": "vu",
    "ゔぇ": "ve",
    "ゔぉ": "vo",
}

_MONOGRAPHS: dict[str, str] = {
    "あ": "a",
    "い": "i",
    "う": "u",
    "え": "e",
    "お": "o",
    "か": "ka",
    "き": "ki",
    "く": "ku",
    "け": "ke",
    "こ": "ko",
    "が": "ga",
    "ぎ": "gi",
    "ぐ": "gu",
    "げ": "ge",
    "ご": "go",
    "さ": "sa",
    "し": "shi",
    "す": "su",
    "せ": "se",
    "そ": "so",
    "ざ": "za",
    "じ": "ji",
    "ず": "zu",
    "ぜ": "ze",
    "ぞ": "zo",
    "た": "ta",
    "ち": "chi",
    "つ": "tsu",
    "て": "te",
    "と": "to",
    "だ": "da",
    "ぢ": "ji",
    "づ": "zu",
    "で": "de",
    "ど": "do",
    "な": "na",
    "に": "ni",
    "ぬ": "nu",
    "ね": "ne",
    "の": "no",
    "は": "ha",
    "ひ": "hi",
    "ふ": "fu",
    "へ": "he",
    "ほ": "ho",
    "ば": "ba",
    "び": "bi",
    "ぶ": "bu",
    "べ": "be",
    "ぼ": "bo",
    "ぱ": "pa",
    "ぴ": "pi",
    "ぷ": "pu",
    "ぺ": "pe",
    "ぽ": "po",
    "ま": "ma",
    "み": "mi",
    "む": "mu",
    "め": "me",
    "も": "mo",
    "や": "ya",
    "ゆ": "yu",
    "よ": "yo",
    "ら": "ra",
    "り": "ri",
    "る": "ru",
    "れ": "re",
    "ろ": "ro",
    "わ": "wa",
    "を": "o",
    "ん": "n",
    "ぁ": "a",
    "ぃ": "i",
    "ぅ": "u",
    "ぇ": "e",
    "ぉ": "o",
    "ゎ": "wa",
}

_SPACE_LIKE = set(" 　\t\r\n/・,，、;；")


def _normalize(text: str) -> str:
    return normalize_storage_text(text)


def _katakana_to_hiragana(text: str) -> str:
    chars: list[str] = []
    for ch in text:
        code = ord(ch)
        if _KATAKANA_TO_HIRAGANA_START <= code <= _KATAKANA_TO_HIRAGANA_END:
            chars.append(chr(code - 0x60))
        else:
            chars.append(ch)
    return "".join(chars)


def _last_vowel(token: str) -> str:
    for ch in reversed(token):
        if ch in "aeiou":
            return ch
    return ""


def _next_consonant(roma: str) -> str:
    for ch in roma:
        if ch.isalpha() and ch not in "aeiou":
            return ch
    return ""


def kana_to_romaji(kana_text: str) -> str:
    text = _katakana_to_hiragana(_normalize(kana_text)).lower()
    tokens: list[str] = []
    i = 0

    while i < len(text):
        ch = text[i]

        if ch in _SPACE_LIKE:
            if tokens and tokens[-1] != " ":
                tokens.append(" ")
            i += 1
            continue

        if ch == "っ":
            nxt = text[i + 1 : i + 3]
            roma = _DIGRAPHS.get(nxt)
            if not roma:
                roma = _MONOGRAPHS.get(text[i + 1 : i + 2], "") if i + 1 < len(text) else ""
            lead = _next_consonant(roma)
            if lead:
                tokens.append(lead)
            i += 1
            continue

        if ch == "ー":
            if tokens:
                vowel = _last_vowel(tokens[-1])
                if vowel:
                    tokens.append(vowel)
            i += 1
            continue

        if i + 1 < len(text):
            pair = text[i : i + 2]
            if pair in _DIGRAPHS:
                tokens.append(_DIGRAPHS[pair])
                i += 2
                continue

        mono = _MONOGRAPHS.get(ch)
        if mono:
            if ch == "ん" and i + 1 < len(text):
                nxt = text[i + 1 : i + 3]
                nxt_roma = _DIGRAPHS.get(nxt)
                if not nxt_roma:
                    nxt_roma = _MONOGRAPHS.get(text[i + 1], "")
                if nxt_roma.startswith(("b", "m", "p")):
                    mono = "m"
            tokens.append(mono)
        elif ch in "()（）[]{}~～":
            tokens.append(ch)
        elif ch.isascii():
            tokens.append(ch.lower())

        i += 1

    romaji = "".join(tokens)
    romaji = re.sub(r"\s+", " ", romaji).strip()
    return romaji


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
