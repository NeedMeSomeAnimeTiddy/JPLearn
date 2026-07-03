from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.text_normalization import tokenize_japanese


@dataclass(frozen=True)
class Token:
    surface: str
    reading: str | None
    lemma: str | None


def naive_split(text: str) -> List[str]:
    """Segment text into surface-form tokens using Fugashi/MeCab."""
    return [token.surface for token in tokenize_japanese(text)]


def transform(text: str) -> dict:
    tokens = tokenize_japanese(text)

    return {
        "raw": text,
        "tokens": [
            {"surface": t.surface, "reading": None, "lemma": t.lemma}
            for t in tokens
        ],
        "unit_type": "sentence",
    }


def main() -> int:
    sample = "私は日本語を勉強します。今日は天気がいいです。"

    result = transform(sample)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())