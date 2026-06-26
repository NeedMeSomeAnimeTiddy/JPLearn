"""Deterministic adaptive queue construction for study sessions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class QueueBuckets:
    """Disjoint card-id buckets used by adaptive queue blending."""

    due: list[int]
    leech: list[int]
    new: list[int]
    review: list[int]


def build_study_queue(
    card_ids: list[int],
    due_card_ids: set[int],
    leech_card_ids: set[int],
    new_card_ids: set[int],
) -> list[int]:
    """Return a deterministic blended queue of card ids.

    Priority is blended in fixed ratio windows to avoid starvation:
    due x3, leech x1, new x1, review x1.
    """
    sorted_ids = sorted(set(card_ids))

    due: list[int] = []
    leech: list[int] = []
    new: list[int] = []
    review: list[int] = []

    for card_id in sorted_ids:
        if card_id in leech_card_ids:
            leech.append(card_id)
            continue
        if card_id in new_card_ids:
            new.append(card_id)
            continue
        if card_id in due_card_ids:
            due.append(card_id)
            continue
        review.append(card_id)

    buckets = QueueBuckets(due=due, leech=leech, new=new, review=review)
    return _interleave_buckets(buckets)


def _interleave_buckets(buckets: QueueBuckets) -> list[int]:
    queue: list[int] = []
    cursors = {"due": 0, "leech": 0, "new": 0, "review": 0}
    sizes = {
        "due": len(buckets.due),
        "leech": len(buckets.leech),
        "new": len(buckets.new),
        "review": len(buckets.review),
    }

    def take(name: str, count: int) -> None:
        source = getattr(buckets, name)
        index = cursors[name]
        for _ in range(count):
            if index >= sizes[name]:
                break
            queue.append(source[index])
            index += 1
        cursors[name] = index

    while any(cursors[name] < sizes[name] for name in cursors):
        take("due", 3)
        take("leech", 1)
        take("new", 1)
        take("review", 1)

    return queue
