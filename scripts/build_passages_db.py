"""Build bundled Aozora Bunko passage DB for the Passages feature.

One-time pipeline:
1. Read the jReadability-scored CSV (already downloaded)
2. Filter for Beginner/Elementary, children's literature, modern orthography
3. Sort by overall_difficulty, pick top N
4. Generate furigana via fugashi
5. Extract vocabulary (word + reading for content words)
6. Output as JSON bundle

Usage: python scripts/build_passages_db.py
"""

import csv
import json
import os
import sys
from typing import Any

import fugashi  # type: ignore[import-untyped]

# ── Config ──────────────────────────────────────────────────────────
CSV_PATH = "data/external_sources/passages/aozora/aozorabunko_with_jreadability_5k_clean.csv"
OUTPUT_DIR = "data/external_sources/passages/aozora"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "passages.json")
MAX_PASSAGES = 30
MIN_CHARS = 100
MAX_CHARS = 4000


# ── Helpers ──────────────────────────────────────────────────────────

def _strip_aozora_ruby(text: str) -> str:
    """Remove only Aozora ruby markup; preserve whitespace and formatting."""
    import re

    text = re.sub(r"｜", "", text)         # remove ruby anchor
    text = re.sub(r"《[^》]*》", "", text)  # remove ruby text
    text = re.sub(r"［[^］]*］", "", text)  # remove notes
    text = re.sub(r"※［[^］]*］", "", text) # remove footnote markers
    text = re.sub(r"\u3000", " ", text)    # fullwidth space → regular space
    return text.strip()


def _katakana_to_hiragana_shift(cp: int) -> int:
    """Shift katakana code point to hiragana (0x60 offset)."""
    return cp - 0x60


def _kana_to_hiragana(text: str) -> str:
    """Convert katakana to hiragana using Unicode offset."""
    result: list[str] = []
    for ch in text:
        cp = ord(ch)
        if 0x30A1 <= cp <= 0x30F6:
            result.append(chr(cp - 0x60))
        else:
            result.append(ch)
    return "".join(result)


def _has_kanji(s: str) -> bool:
    """True if the string contains any CJK unified ideograph."""
    return any("\u4e00" <= c <= "\u9fff" for c in s)


def _format_furigana(tagger: Any, text: str) -> str:
    """Convert text to inline-furigana notation: 漢字（かんじ）.
    Preserves original whitespace using fugashi's ``white_space`` attribute.
    """
    result: list[str] = []
    for word in tagger(text):
        ws = word.white_space or ""
        if ws:
            result.append(ws)
        surface = word.surface
        reading = word.feature.kana or surface
        reading = _kana_to_hiragana(reading)
        if _has_kanji(surface) and reading != surface:
            result.append(f"{surface}（{reading}）")
        else:
            result.append(surface)
    return "".join(result)


def _content_pos() -> set[str]:
    """POS categories worth including in vocabulary lists."""
    return {
        "名詞",  # noun
        "動詞",  # verb
        "形容詞",  # i-adjective
        "形容動詞",  # na-adjective
        "副詞",  # adverb
    }


def _extract_vocab(tagger: Any, text: str) -> list[dict[str, str]]:
    """Extract unique word + reading pairs for content words."""
    seen: set[str] = set()
    vocab: list[dict[str, str]] = []
    for word in tagger(text):
        surface = word.surface
        pos = word.feature.pos1
        if pos not in _content_pos():
            continue
        if surface in seen:
            continue
        seen.add(surface)
        reading = word.feature.kana or surface
        vocab.append({"word": surface, "reading": reading})
    return vocab


def _count_words(tagger: Any, text: str) -> int:
    return sum(1 for w in tagger(text) if w.surface.strip())


# ── Main Pipeline ────────────────────────────────────────────────────

def main() -> int:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}. Download it first.", file=sys.stderr)
        return 1

    print("Initializing fugashi...", flush=True)
    tagger = fugashi.Tagger()

    # ── Step 1: Load + filter ────────────────────────────────────
    print(f"Reading {CSV_PATH}...", flush=True)
    csv.field_size_limit(1000000)
    candidates: list[dict[str, Any]] = []

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        col_idx = {h: i for i, h in enumerate(header)}

        for row in reader:
            if len(row) < len(header):
                continue

            level = row[col_idx["difficulty_level"]]
            if level not in ("Beginner", "Elementary"):
                continue

            raw_meta = row[col_idx["meta"]]
            try:
                meta = json.loads(raw_meta)
            except json.JSONDecodeError:
                continue

            # Must be children's literature (NDC K prefix)
            ndc = meta.get("分類番号", "")
            if not ndc.startswith("NDC K"):
                continue

            # Must use modern orthography
            orthography = meta.get("文字遣い種別", "")
            if orthography != "新字新仮名":
                continue

            raw_text = row[col_idx["text"]]
            text = _strip_aozora_ruby(raw_text)
            length = len(text)

            if length < MIN_CHARS or length > MAX_CHARS:
                continue

            diff = float(row[col_idx["overall_difficulty"]])

            # Extract author from meta
            author = meta.get("姓", "") + " " + meta.get("名", "")
            author = author.strip()

            candidates.append({
                "id": meta.get("作品ID", ""),
                "title": meta.get("作品名", ""),
                "title_reading": meta.get("作品名読み", ""),
                "author": author,
                "source_url": meta.get("XHTML/HTMLファイルURL", ""),
                "source": "Aozora Bunko (Public Domain)",
                "original_publication": meta.get("初出", ""),
                "difficulty": diff,
                "difficulty_level": level,
                "text_length": length,
                "raw_text": text,
            })

    print(f"Filtered to {len(candidates)} candidates (NDC K, modern orthography, {MIN_CHARS}-{MAX_CHARS} chars)", flush=True)

    # ── Step 2: Sort + pick top N ────────────────────────────────
    candidates.sort(key=lambda c: c["difficulty"])
    selected = candidates[:MAX_PASSAGES]
    print(f"Selected {len(selected)} passages (top by difficulty)", flush=True)

    # ── Step 3: Process furigana + vocab + word count ─────────────
    passages: list[dict[str, Any]] = []
    for i, c in enumerate(selected):
        print(f"  [{i+1}/{len(selected)}] {c['id']} ({c['text_length']} chars)...", end=" ", flush=True)

        text_with_furi = _format_furigana(tagger, c["raw_text"])
        vocabulary = _extract_vocab(tagger, c["raw_text"])
        word_count = _count_words(tagger, c["raw_text"])

        # Map difficulty_level to simpler label
        label_map = {"Beginner": "beginner", "Elementary": "elementary"}
        diff_label = label_map.get(c["difficulty_level"], "elementary")

        passages.append({
            "id": f"aozora_{c['id']}",
            "title": c["title"],
            "title_reading": c["title_reading"],
            "author": c["author"],
            "source": c["source"],
            "source_url": c["source_url"],
            "original_publication": c["original_publication"],
            "difficulty": round(c["difficulty"], 4),
            "difficulty_label": diff_label,
            "word_count": word_count,
            "text_jp": text_with_furi,
            "raw_text": c["raw_text"],
            "vocabulary": vocabulary[:30],  # Cap at 30 most important words
        })
        print(f"ok ({word_count} words, {len(vocabulary)} vocab)", flush=True)

    # ── Step 4: Output ───────────────────────────────────────────
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(passages, f, ensure_ascii=False, indent=2)

    total_words = sum(p["word_count"] for p in passages)
    print(f"\nDone! {len(passages)} passages, {total_words} total words -> {OUTPUT_FILE}", flush=True)

    with open(os.path.join(OUTPUT_DIR, "passages_summary.txt"), "w", encoding="utf-8") as sf:
        for p in passages[:10]:
            sf.write(f"  {p['difficulty_label']:>10} | {p['title']:30s} | {p['word_count']:4d} words | {p['author']}\n")
        if len(passages) > 10:
            sf.write(f"  ... and {len(passages) - 10} more\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
