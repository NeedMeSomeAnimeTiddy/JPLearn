from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List


OUTPUT_PATH = Path("tests/fixtures/srs_fixtures.json")


@dataclass(frozen=True)
class SRSCase:
    name: str
    last_interval: int
    ease_factor: float
    performance: int

    # expected outputs from your domain function
    expected_next_interval: int
    expected_new_ease: float


def generate_cases() -> List[SRSCase]:
    """
    Pure deterministic fixtures.
    No randomness allowed.
    """

    return [
        # baseline review
        SRSCase(
            name="baseline_correct",
            last_interval=1,
            ease_factor=2.5,
            performance=3,
            expected_next_interval=2,
            expected_new_ease=2.5,
        ),

        # high performance (should increase interval)
        SRSCase(
            name="strong_recall",
            last_interval=2,
            ease_factor=2.5,
            performance=5,
            expected_next_interval=5,
            expected_new_ease=2.6,
        ),

        # weak performance (interval reset behavior)
        SRSCase(
            name="failed_recall",
            last_interval=10,
            ease_factor=2.5,
            performance=1,
            expected_next_interval=1,
            expected_new_ease=2.3,
        ),

        # edge: minimum interval
        SRSCase(
            name="min_interval_floor",
            last_interval=0,
            ease_factor=2.5,
            performance=3,
            expected_next_interval=1,
            expected_new_ease=2.5,
        ),

        # edge: low ease boundary behavior
        SRSCase(
            name="low_ease_boundary",
            last_interval=5,
            ease_factor=1.3,
            performance=2,
            expected_next_interval=5,
            expected_new_ease=1.2,
        ),
    ]


def write_fixtures(cases: List[SRSCase]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    data = [asdict(c) for c in cases]

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Wrote {len(cases)} fixtures → {OUTPUT_PATH}")


def main() -> int:
    cases = generate_cases()
    write_fixtures(cases)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())