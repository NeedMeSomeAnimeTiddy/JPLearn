"""Quick benchmark for deterministic distractor ranking latency."""

from __future__ import annotations

import time
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from domain.decks import ALL_DECKS
from domain.distractors import rank_distractor_ids

TARGET_MS_PER_CALL = 2.5


def main() -> int:
    total_calls = 0
    start = time.perf_counter()

    for factory in ALL_DECKS.values():
        deck = factory()
        for card in deck.cards:
            rank_distractor_ids(deck.cards, card, mode="meaning")
            rank_distractor_ids(deck.cards, card, mode="character")
            total_calls += 2

    elapsed_ms = (time.perf_counter() - start) * 1000
    avg_ms = elapsed_ms / total_calls if total_calls else 0.0

    print(f"distractor benchmark: calls={total_calls} total_ms={elapsed_ms:.2f} avg_ms={avg_ms:.4f}")

    if avg_ms > TARGET_MS_PER_CALL:
        print(f"warning: average distractor ranking time exceeded target ({TARGET_MS_PER_CALL:.2f} ms)")
        return 1

    print("benchmark ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
