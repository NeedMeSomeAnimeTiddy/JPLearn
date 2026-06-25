"""SM-2 spaced repetition scheduler."""

from dataclasses import dataclass, field
from datetime import date, timedelta


@dataclass
class ReviewState:
    """Mutable SM-2 scheduling state for one card.

    Attributes:
        card_id: Matches :attr:`~domain.cards.Card.id` within its deck.
        ease_factor: SM-2 ease factor; controls interval growth. Min 1.3.
        interval: Days until the next scheduled review.
        repetitions: Number of consecutive successful reviews.
        next_review: Date on which this card is next due.
    """

    card_id: int
    ease_factor: float = 2.5
    interval: int = 1        # days until next review
    repetitions: int = 0
    next_review: date = field(default_factory=date.today)

    def is_due(self) -> bool:
        """Return ``True`` if this card is due for review today or earlier."""
        return date.today() >= self.next_review


# Quality ratings (Anki-style mapped to SM-2 quality 0-5)
AGAIN = 0
HARD = 2
GOOD = 4
EASY = 5


def update(state: ReviewState, quality: int) -> ReviewState:
    """Apply one SM-2 review. quality must be 0-5."""
    if quality < 3:
        # Failed: reset repetitions and shrink interval
        state.repetitions = 0
        state.interval = 1
    else:
        if state.repetitions == 0:
            state.interval = 1
        elif state.repetitions == 1:
            state.interval = 6
        else:
            state.interval = round(state.interval * state.ease_factor)
        state.repetitions += 1

    # Update ease factor (minimum 1.3)
    state.ease_factor = max(
        1.3,
        state.ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    )
    state.next_review = date.today() + timedelta(days=state.interval)
    return state
