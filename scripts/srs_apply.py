from __future__ import annotations

import sys
from dataclasses import asdict

from data.srs_repository import SRSRepository, SRSRecord
from domain.srs import SRSState, update_srs


def apply_review(item_id: str, performance: int) -> None:
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
    result = update_srs(state, performance)

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


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/srs_apply.py <item_id> <performance>")
        return 1

    item_id = sys.argv[1]
    performance = int(sys.argv[2])

    apply_review(item_id, performance)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())