"""Recount a card's ``repetitions`` from its stored review log.

Pure domain logic: takes review outcomes, returns counts. No I/O, no DB.

``repetitions`` used to increment once per review, so a card drilled repeatedly
inside one session accumulated a count that the ``interval >= 21`` half of the
mastered rule never matched. It now counts distinct days carrying a successful
review (see :func:`domain.scheduler.next_repetitions`), but rows written before
that change keep their inflated totals.

This module replays a log under *both* rules. The old total is what makes the
correction safe to apply: it is a checksum. Where a row's stored value matches
the old-rule replay, the log fully accounts for that row and the new-rule total
can replace it. Where it does not, something the log cannot see wrote the row —
onboarding seeds a mastered state without logging any review, and deck import
writes states wholesale — and the row must be left alone rather than silently
reset to a number derived from an incomplete history.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from domain.scheduler import effective_rating, next_repetitions


@dataclass(frozen=True)
class ReplayedReview:
    """One logged review outcome, in the order it happened.

    Attributes:
        day: Local calendar day the review was recorded against.
        quality: Legacy quality score (0-5) as stored in the log.
        confidence: Optional 1-5 confidence score stored alongside it. Blended
            into the effective rating exactly as the live scheduler blends it.
    """

    day: date
    quality: int
    confidence: int | None = None


@dataclass(frozen=True)
class RepetitionsRecount:
    """Both readings of one card's history.

    Attributes:
        under_old_rule: Total the pre-fix scheduler would have produced —
            one increment per successful review. Used as a checksum against the
            stored value, not as a result.
        under_new_rule: Total the current scheduler produces — one increment per
            distinct day carrying a successful review.
        reviews: Number of logged reviews replayed.
    """

    under_old_rule: int
    under_new_rule: int
    reviews: int


def recount_repetitions(reviews: list[ReplayedReview]) -> RepetitionsRecount:
    """Replay one card's review log under both the old and current rules.

    ``reviews`` must be in chronological order; the same-day decision depends on
    the immediately preceding review, whatever its outcome.
    """
    old_total = 0
    new_total = 0
    previous_day: date | None = None

    for review in reviews:
        rating = effective_rating(review.quality, review.confidence)
        old_total = 0 if rating == 1 else old_total + 1
        new_total = next_repetitions(
            new_total, rating, is_same_day=previous_day == review.day
        )
        previous_day = review.day

    return RepetitionsRecount(
        under_old_rule=old_total,
        under_new_rule=new_total,
        reviews=len(reviews),
    )
