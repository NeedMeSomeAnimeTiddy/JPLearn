from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import List


@dataclass(frozen=True)
class Card:
    front: str
    back: str
    tags: List[str]


def infer_back(sentence: str) -> str:
    return f"[meaning of]: {sentence}"


def extract_tags(sentence: str) -> List[str]:
    tags = []

    if "する" in sentence:
        tags.append("verb:する")

    if "です" in sentence:
        tags.append("copula:です")

    return tags


def to_card(sentence: str) -> Card:
    return Card(
        front=sentence,
        back=infer_back(sentence),
        tags=extract_tags(sentence),
    )


def generate_cards(texts: List[str]) -> List[Card]:
    return [to_card(t) for t in texts]


def main() -> int:
    sample = [
        "私は日本語を勉強します。",
        "今日は天気がいいです。",
    ]

    cards = generate_cards(sample)

    print(json.dumps([asdict(c) for c in cards], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())