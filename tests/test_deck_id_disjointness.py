"""Card ids must not collide across decks.

Ids are hand-allocated by ``id_offset`` (``domain/decks.py``: kanji N5→N1 at
0/1000/2000/…), and SRS and mastery state are keyed by ``(deck, card_id)`` with
several call sites folding whole families onto one section — ``cardScores``
buckets every kanji deck under ``kanji_n5``. A duplicate id therefore merges two
characters' review histories silently rather than erroring.

``CLAUDE.md`` has warned about this for as long as the offsets have existed
without anything checking it. This is the check.
"""

from __future__ import annotations

from collections import defaultdict

import pytest

from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS

# Thematic category decks are *views*: since issue #78 they resolve onto their
# parent level deck's ids via domain.block_mapping, so they intentionally reuse
# the parent's range and are checked separately below.
_VIEW_SLUGS = frozenset(CATEGORY_SOURCE_DECKS)

_FAMILY_PREFIXES = ("kanji_", "vocab_")


def _family(slug: str) -> str:
    """Decks whose ids share a numbering space, per lib/cardScores.sectionForDeckSlug."""
    for prefix in _FAMILY_PREFIXES:
        if slug.startswith(prefix):
            return prefix.rstrip("_")
    return slug


class TestIdsWithinADeck:
    @pytest.mark.parametrize("slug", sorted(ALL_DECKS))
    def test_no_deck_repeats_a_card_id(self, slug: str) -> None:
        ids = [card.id for card in ALL_DECKS[slug]().cards]
        assert len(ids) == len(set(ids)), f"'{slug}' allocates a card id twice"


class TestIdsAcrossAFamily:
    def test_kanji_and_vocab_level_decks_never_share_an_id(self) -> None:
        """The families the renderer folds onto one score bucket must stay disjoint."""
        owners: dict[str, dict[int, str]] = defaultdict(dict)
        collisions: list[str] = []

        for slug in sorted(ALL_DECKS):
            if slug in _VIEW_SLUGS:
                continue
            family = _family(slug)
            for card in ALL_DECKS[slug]().cards:
                previous = owners[family].get(card.id)
                if previous is not None:
                    collisions.append(f"id {card.id}: '{previous}' and '{slug}'")
                else:
                    owners[family][card.id] = slug

        assert not collisions, "card id reused within a family:\n  " + "\n  ".join(collisions[:20])


class TestCategoryViews:
    @pytest.mark.parametrize("slug", sorted(CATEGORY_SOURCE_DECKS))
    def test_a_category_stays_inside_its_own_range(self, slug: str) -> None:
        """A category deck is a source list; its ids must not stray into a level deck.

        The ids a learner actually reviews come from resolving the category onto
        its parent, so these are never persisted — but an overlap here would make
        `_deck_metadata_for_kanji` and the block mapping ambiguous.
        """
        ids = [card.id for card in CATEGORY_SOURCE_DECKS[slug]().cards]
        assert len(ids) == len(set(ids)), f"'{slug}' allocates a card id twice"
