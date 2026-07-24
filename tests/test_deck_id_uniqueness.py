"""Cross-deck card id collision guard.

Card ids are the primary key for client-side mastery tracking (`cardScores`,
keyed by ScriptKey bucket, not by deck slug — see ARCHITECTURE.md §4). Decks
sharing a bucket are hand-allocated disjoint `id_offset` values in
`domain/decks.py` with no runtime uniqueness check. If two decks in the same
bucket ever emit the same id for two different characters, mastery data
silently corrupts instead of erroring (see GitHub issue #63).

These tests build every deck and verify that within each id-sharing family,
a repeated id always refers to the same underlying card. A future deck
addition or a CSV import that outgrows its allocated offset range will fail
loudly here instead of corrupting user data silently.
"""

from __future__ import annotations

from collections import defaultdict

import pytest

from domain.decks import _VOCAB_ID_CAPACITY, ALL_DECKS, _build_vocab_deck


def _family_for(slug: str) -> str:
    if slug in ("hiragana", "katakana"):
        return slug
    if slug.startswith("kanji"):
        return "kanji"
    if slug.startswith("vocab"):
        return "vocab"
    return slug


def _families() -> dict[str, list[str]]:
    families: dict[str, list[str]] = defaultdict(list)
    for slug in ALL_DECKS:
        families[_family_for(slug)].append(slug)
    return families


def test_every_family_has_no_id_collisions() -> None:
    """A repeated id within a family must always be the same character.

    Different characters sharing an id is the actual corruption risk: two
    decks whose ids overlap where the underlying content differs. A repeated
    id with matching content is an intentional, harmless shared card.
    """
    families = _families()
    for family, slugs in families.items():
        seen: dict[int, tuple[str, str]] = {}
        for slug in slugs:
            deck = ALL_DECKS[slug]()
            for card in deck.cards:
                prior = seen.get(card.id)
                if prior is not None:
                    prior_slug, prior_character = prior
                    assert prior_character == card.character, (
                        f"Card id collision in family '{family}': id {card.id} is "
                        f"{prior_character!r} in deck '{prior_slug}' but "
                        f"{card.character!r} in deck '{slug}'. Check id_offset "
                        f"allocation in domain/decks.py."
                    )
                else:
                    seen[card.id] = (slug, card.character)


def test_kanji_n1_overflow_does_not_collide_with_siblings() -> None:
    """Regression guard for issue #63 finding A1.

    kanji_n1 has more rows than its nominal 1,000-slot spacing (offset 4000,
    ~1,246 rows -> ids up to ~5245), which is only safe because no other
    kanji deck currently claims ids above 4000. This test fails the moment
    that stops being true.
    """
    kanji_n1_ids = {c.id for c in ALL_DECKS["kanji_n1"]().cards}
    assert kanji_n1_ids, "kanji_n1 deck unexpectedly empty"
    max_kanji_n1_id = max(kanji_n1_ids)

    for slug, loader in ALL_DECKS.items():
        if slug == "kanji_n1" or not slug.startswith("kanji"):
            continue
        other_ids = {c.id for c in loader().cards}
        overlap = kanji_n1_ids & other_ids
        assert not overlap, (
            f"kanji_n1 (max id {max_kanji_n1_id}) collides with '{slug}' "
            f"at ids {sorted(overlap)}"
        )


def test_vocab_n5_stays_below_the_category_deck_offset() -> None:
    """Regression guard for issue #67.

    Lifting `_VOCAB_LEVEL_LIMITS` grew vocab_n5 from 50 cards to the full
    imported corpus, so its ids now run 0..~717 against the vocab category
    decks that begin at 1000. That is the tightest vocab allocation in the
    file — this test fails before a further import crosses the boundary.
    """
    level_ids = {c.id for c in ALL_DECKS["vocab_n5"]().cards}
    assert level_ids, "vocab_n5 deck unexpectedly empty"

    category_slugs = [
        slug
        for slug in ALL_DECKS
        if slug.startswith("vocab_") and slug not in {"vocab_n5", "vocab_n4", "vocab_n3", "vocab_n2", "vocab_n1"}
    ]
    assert category_slugs, "expected vocab category decks to be registered"

    lowest_category_id = min(
        c.id for slug in category_slugs for c in ALL_DECKS[slug]().cards
    )
    assert max(level_ids) < lowest_category_id, (
        f"vocab_n5 reaches id {max(level_ids)} but the vocab category decks "
        f"start at {lowest_category_id}. Widen _VOCAB_ID_CAPACITY['n5'] and "
        f"move the category offsets in domain/decks.py."
    )
    assert len(level_ids) <= _VOCAB_ID_CAPACITY["n5"]


def test_build_vocab_deck_rejects_a_corpus_that_outgrows_its_slot() -> None:
    """The capacity guard must raise rather than silently overflow (issue #63)."""
    rows = [(f"語{i}", f"go{i}", f"word {i}") for i in range(11)]
    with pytest.raises(ValueError, match="card ids are reserved"):
        _build_vocab_deck("Overflow", rows, "n5", id_offset=0, id_capacity=10)


def test_build_vocab_deck_allows_a_corpus_that_exactly_fills_its_slot() -> None:
    rows = [(f"語{i}", f"go{i}", f"word {i}") for i in range(10)]
    deck = _build_vocab_deck("Exact", rows, "n5", id_offset=0, id_capacity=10)
    assert len(deck.cards) == 10


def test_all_decks_still_build_after_id_reallocation() -> None:
    """Sanity check: every deck is non-empty and every card has a unique id
    within its own deck (independent of cross-deck family checks above)."""
    for slug, loader in ALL_DECKS.items():
        deck = loader()
        ids = [c.id for c in deck.cards]
        assert len(ids) > 0, f"Deck '{slug}' is empty"
        assert len(ids) == len(set(ids)), f"Deck '{slug}' has duplicate ids within itself"
