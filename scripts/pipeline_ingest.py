from __future__ import annotations

import json
from domain.ingestion import ingest_batch
from scripts.card_generate import generate_cards


def main() -> int:
    sentences = [
        "私は日本語を勉強します。",
        "今日は天気がいいです。",
        "学校へ行く。",
    ]

    # script layer → DTOs
    cards = generate_cards(sentences)

    # DTO → domain entities
    items = ingest_batch([c.__dict__ for c in cards])

    print(json.dumps(
        [item.__dict__ for item in items],
        ensure_ascii=False,
        indent=2
    ))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())