from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass(frozen=True)
class Token:
    surface: str
    reading: str | None
    lemma: str | None


def naive_split(text: str) -> List[str]:
    """
    Placeholder segmentation.
    Replace later with MeCab / Sudachi / fugashi.
    """
    return [t for t in text.replace("。", " ").split() if t]


def transform(text: str) -> dict:
    tokens = naive_split(text)

    return {
        "raw": text,
        "tokens": [
            {"surface": t, "reading": None, "lemma": None}
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