"""Per-card mastery counter storage in the active ``jplearn.db`` database.

The 0..4 counter behind the progress bars. Until issue #66 it lived only in
renderer ``localStorage`` (``jplearn-card-scores-v2``), parallel to the FSRS
``review_states`` table, and the two were reconciled by hand in two reset paths —
so clearing browser storage zeroed visible mastery while scheduling survived, and
a DB reset that missed storage did the reverse.

Rows are keyed ``(deck_slug, card_id)``. ``review_states`` keys by deck *name*
because that is what the scheduler was given; this table keys by *slug* because
that is the stable identifier the bridge already receives (``record-result
<slug> <card_id> <is_correct>``) and what the renderer indexes by. The two tables
are never joined, so they do not need a shared key.

The scale itself and the ±1 rule are domain concerns and live in
:mod:`domain.mastery`; this module only persists them.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Generator, Mapping
from contextlib import contextmanager

from data import database
from data.text_normalization import normalize_storage_text
from domain.mastery import clamp_card_score, next_card_score


def _normalize_slug(deck_slug: str) -> str:
    """Return ``deck_slug`` normalized for storage.

    Deck slugs are ASCII today, so this is effectively a no-op — it is applied
    anyway because every write path in ``data/`` normalizes before storing, and a
    slug that skipped it would silently miss on lookup if that ever changed.
    """
    normalized = normalize_storage_text(deck_slug).strip()
    if not normalized:
        raise ValueError("deck_slug must not be empty")
    return normalized


class CardMasteryRepository:
    """Read and write per-card mastery counters."""

    def __init__(self) -> None:
        database.init_db()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        with database._connect() as conn:
            yield conn

    def load_deck_scores(self, deck_slug: str) -> dict[int, int]:
        """Return ``card_id → score`` for one deck, omitting unscored cards.

        Args:
            deck_slug: Stable deck slug as registered in ``domain.decks.ALL_DECKS``.
        """
        slug = _normalize_slug(deck_slug)
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT card_id, score FROM card_mastery_scores WHERE deck = ?",
                (slug,),
            ).fetchall()
        return {int(row["card_id"]): clamp_card_score(int(row["score"])) for row in rows}

    def load_all_scores(self) -> dict[str, dict[int, int]]:
        """Return every stored score grouped by deck slug."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT deck, card_id, score FROM card_mastery_scores"
            ).fetchall()
        grouped: dict[str, dict[int, int]] = {}
        for row in rows:
            grouped.setdefault(str(row["deck"]), {})[int(row["card_id"])] = clamp_card_score(
                int(row["score"])
            )
        return grouped

    def apply_result(self, deck_slug: str, card_id: int, *, is_correct: bool) -> int:
        """Step one card's score by a single answer and return the new value.

        Read and write happen inside one transaction so concurrent answers cannot
        interleave into a lost update.

        Args:
            deck_slug: Stable deck slug the answered card belongs to.
            card_id: Card id within that deck.
            is_correct: Whether the learner answered correctly.
        """
        slug = _normalize_slug(deck_slug)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT score FROM card_mastery_scores WHERE deck = ? AND card_id = ?",
                (slug, card_id),
            ).fetchone()
            current = int(row["score"]) if row is not None else 0
            updated = next_card_score(current, is_correct=is_correct)
            conn.execute(
                """
                INSERT INTO card_mastery_scores (deck, card_id, score)
                VALUES (?, ?, ?)
                ON CONFLICT(deck, card_id) DO UPDATE SET score = excluded.score
                """,
                (slug, card_id, updated),
            )
        return updated

    def set_deck_scores(self, deck_slug: str, scores: Mapping[int, int]) -> int:
        """Overwrite scores for the given cards and return how many rows were written.

        Used by onboarding expertise seeding, which awards a full score for every
        card in a deck without any review having taken place, and by the one-time
        import of legacy renderer scores. Scores are clamped to the scale on the
        way in, so a corrupted stored value cannot enter the table.

        Args:
            deck_slug: Stable deck slug being seeded.
            scores: ``card_id → score`` pairs to store.
        """
        slug = _normalize_slug(deck_slug)
        rows = [(slug, int(card_id), clamp_card_score(int(score))) for card_id, score in scores.items()]
        if not rows:
            return 0
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO card_mastery_scores (deck, card_id, score)
                VALUES (?, ?, ?)
                ON CONFLICT(deck, card_id) DO UPDATE SET score = excluded.score
                """,
                rows,
            )
        return len(rows)

    def has_any_scores(self) -> bool:
        """Return whether any score is stored at all.

        The legacy import is gated on this: renderer scores are only adopted into
        an empty table, so a repeated import cannot overwrite newer progress.
        """
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM card_mastery_scores LIMIT 1").fetchone()
        return row is not None
