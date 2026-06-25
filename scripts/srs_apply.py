from __future__ import annotations

import sys
from dataclasses import asdict
from typing import Literal

from data.srs_repository import SRSRepository, SRSRecord
from domain.srs import SRSSettings, SRSState, update_srs

ReviewLoad = Literal["light", "normal", "heavy"]


def apply_review(
    item_id: str,
    performance: int,
    target_retention: float = 0.9,
    review_load: ReviewLoad = "normal",
) -> None:
    repo = SRSRepository()

    record = repo.get(item_id)

    if record is None:
        raise ValueError(f"SRS item not found: {item_id}")

    # -----------------------------
    # domain state conversion
    # -----------------------------
    state = SRSState(
        last_interval=record.last_interval,
        ease_factor=record.ease_factor,
    )

    # -----------------------------
    # domain computation
    # -----------------------------
    settings = SRSSettings(target_retention=target_retention, review_load=review_load)
    result = update_srs(state, performance, settings=settings)

    # -----------------------------
    # persist updated state
    # -----------------------------
    updated = SRSRecord(
        id=record.id,
        last_interval=result.next_interval,
        ease_factor=result.new_ease_factor,
        due=record.due + result.next_interval,
    )

    repo.upsert(updated)

    print(f"Updated {item_id}")
    print(asdict(updated))


def _parse_review_load(raw: str) -> ReviewLoad:
    if raw == "light":
        return "light"
    if raw == "normal":
        return "normal"
    if raw == "heavy":
        return "heavy"
    raise ValueError("review_load must be one of: light, normal, heavy")


def main() -> int:
    if len(sys.argv) not in {3, 4, 5}:
        print(
            "Usage: python scripts/srs_apply.py <item_id> <performance> "
            "[target_retention] [review_load: light|normal|heavy]"
        )
        return 1

    item_id = sys.argv[1]
    performance = int(sys.argv[2])
    target_retention = float(sys.argv[3]) if len(sys.argv) >= 4 else 0.9
    review_load = _parse_review_load(sys.argv[4]) if len(sys.argv) >= 5 else "normal"

    apply_review(item_id, performance, target_retention=target_retention, review_load=review_load)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())