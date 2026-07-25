"""Per-card mastery counter — the 0..4 scale behind the progress bars.

This counter is deliberately **not** derived from FSRS scheduling state, and that
is the central design decision behind issue #66. The two answer different
questions: FSRS tracks how long a card can be left before it needs reviewing,
while the counter tracks how the learner is doing on it right now.

Measured against :mod:`domain.scheduler`, FSRS state cannot produce a gradual
0..4 scale in either direction:

* ``repetitions`` counts distinct successful *days*, so it stays pinned at 1
  through an entire session however many times a card is answered — it cannot
  express within-session progress at all.
* Six correct answers inside one session move ``interval`` only 6 → 8
  (``stability`` 5.80 → 7.80) via the short-term path for same-day reviews.
  Spaced reviews then jump ``interval`` 6 → 43 → 271 → 1500, so no fixed set of
  intermediate thresholds means the same thing at both scales.
* ``repetitions`` resets to 0 on any *Again* rating, so a single lapse would
  empty a bar that this counter steps down by one.

(Before same-day reviews were given a short-term path, ``interval`` and
``stability`` did not move within a session at all. The conclusion is unchanged:
the counter still cannot be derived, and ``repetitions`` became *less* usable for
it, not more.)

So the counter is stored in its own right rather than recomputed. It lives in
one place — ``card_mastery_scores`` in SQLite, keyed by ``(deck, card_id)`` —
rather than being mirrored in renderer storage.

The separate FSRS-derived notions remain as they were, because they answer their
own questions: "mastered" for deck statistics is
``repetitions >= 3 and interval >= 21``, and block unlocking keys off
``repetitions >= 1`` (see :mod:`domain.blocks`).
"""

CARD_MASTERY_MAX = 4
"""Score a card reaches once it counts as fully mastered on the counter scale."""


def clamp_card_score(score: int) -> int:
    """Return ``score`` constrained to the ``0..CARD_MASTERY_MAX`` scale.

    Applied on read as well as on write so a legacy or corrupted value imported
    from renderer storage cannot escape the scale.

    Args:
        score: Any integer, including out-of-range values.
    """
    return max(0, min(score, CARD_MASTERY_MAX))


def next_card_score(current: int, *, is_correct: bool) -> int:
    """Return the card score after one answer.

    A correct answer adds 1 and a wrong answer subtracts 1, clamped to the
    scale. This is the rule the renderer applied inline before #66 moved it here,
    kept identical so no visible progress value changes when storage moves.

    Args:
        current: The card's score before this answer.
        is_correct: Whether the learner answered correctly.
    """
    step = 1 if is_correct else -1
    return clamp_card_score(clamp_card_score(current) + step)


def is_card_mastered(score: int) -> bool:
    """Return whether ``score`` has reached the top of the counter scale.

    Distinct from the FSRS "mastered" rule used for deck statistics
    (``repetitions >= 3 and interval >= 21``) — this one describes the counter.

    Args:
        score: A card score on the ``0..CARD_MASTERY_MAX`` scale.
    """
    return clamp_card_score(score) >= CARD_MASTERY_MAX
