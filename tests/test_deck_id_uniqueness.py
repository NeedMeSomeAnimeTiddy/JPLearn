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

from domain.block_mapping import parent_slug_for_category, resolve_category_card_map
from domain.decks import (
    _VOCAB_ID_CAPACITY,
    ALL_DECKS,
    CATEGORY_SOURCE_DECKS,
    _build_vocab_deck,
)


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
    kanji *level* deck currently claims ids above 4000. This test fails the
    moment that stops being true.

    Only the level decks allocate ids; the thematic categories are views over
    them since issue #78, so sharing ids with a level deck is now the expected
    state rather than a collision.
    """
    kanji_n1_ids = {c.id for c in ALL_DECKS["kanji_n1"]().cards}
    assert kanji_n1_ids, "kanji_n1 deck unexpectedly empty"
    max_kanji_n1_id = max(kanji_n1_ids)

    for slug in ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2"):
        other_ids = {c.id for c in ALL_DECKS[slug]().cards}
        overlap = kanji_n1_ids & other_ids
        assert not overlap, (
            f"kanji_n1 (max id {max_kanji_n1_id}) collides with '{slug}' "
            f"at ids {sorted(overlap)}"
        )


def test_vocab_n5_stays_within_its_id_capacity() -> None:
    """Regression guard for issue #67.

    Lifting `_VOCAB_LEVEL_LIMITS` grew vocab_n5 from 50 cards to the full
    imported corpus, so its ids now run from 0 upward against the 1,000 reserved
    at that offset. `_build_vocab_deck` raises past the capacity; this asserts
    the headroom is really there rather than relying on the raise.
    """
    level_ids = {c.id for c in ALL_DECKS["vocab_n5"]().cards}
    assert level_ids, "vocab_n5 deck unexpectedly empty"
    assert len(level_ids) <= _VOCAB_ID_CAPACITY["n5"]
    assert max(level_ids) < _VOCAB_ID_CAPACITY["n5"], (
        f"vocab_n5 reaches id {max(level_ids)} but only "
        f"{_VOCAB_ID_CAPACITY['n5']} ids are reserved at offset 0. Widen "
        f"_VOCAB_ID_CAPACITY['n5'] in domain/decks.py."
    )


_LEVELS: tuple[str, ...] = ("n5", "n4", "n3", "n2", "n1")


@pytest.mark.parametrize("level", _LEVELS)
def test_a_level_and_its_categories_serve_one_id_per_card(level: str) -> None:
    """One word, one identity — the invariant issue #78 exists to establish.

    ``test_every_family_has_no_id_collisions`` above catches the converse: one id
    standing for two different characters. This catches what actually fractured
    learners' progress — a word reachable under two ids, and therefore holding
    two ``review_states`` rows, two FSRS schedules and two mastery values.
    ``見る``/647 in ``vocab_n5`` and ``みる``/1104 in ``vocab_verbs`` were one word
    a learner could study twice without either half knowing about the other.

    Stated over id *sets* rather than by grouping on the surface form, because a
    surface is not an identity: the imported corpora carry genuine homographs
    (``主`` as both ぬし and おも) that are different words sharing a spelling and
    legitimately hold separate ids. What must be true is that routing through a
    category never reaches a card the parent does not already own — so the
    registry as a whole offers each card exactly one id.
    """
    for family in ("vocab", "kanji"):
        parent_slug = f"{family}_{level}"
        parent_ids = {card.id for card in ALL_DECKS[parent_slug]().cards}

        served: dict[int, set[str]] = defaultdict(set)
        for card in ALL_DECKS[parent_slug]().cards:
            served[card.id].add(parent_slug)
        for slug in CATEGORY_SOURCE_DECKS:
            if parent_slug_for_category(slug) != parent_slug:
                continue
            for card in ALL_DECKS[slug]().cards:
                served[card.id].add(slug)

        extra = set(served) - parent_ids
        assert not extra, (
            f"'{parent_slug}' and its categories serve {len(extra)} card id(s) the "
            f"level deck does not own: {sorted(extra)[:5]}. A category is a view "
            f"over its parent — an id from anywhere else is a second identity for "
            f"a word the parent already has."
        )


def test_thematic_categories_are_views_over_their_parent_level_deck() -> None:
    """Every category card id belongs to the parent deck it claims to filter."""
    for slug in CATEGORY_SOURCE_DECKS:
        parent_slug = parent_slug_for_category(slug)
        assert parent_slug is not None, f"'{slug}' has no parent level deck"
        parent = ALL_DECKS[parent_slug]()
        parent_ids = {card.id for card in parent.cards}
        view = ALL_DECKS[slug]()

        assert view.cards, f"Category view '{slug}' is empty"
        assert view.name == parent.name, (
            f"Category view '{slug}' reports deck name {view.name!r} but review "
            f"state is keyed (deck_name, card_id) — it must use the parent's "
            f"name {parent.name!r} or it forks the very state it is collapsing."
        )
        unknown = {card.id for card in view.cards} - parent_ids
        assert not unknown, (
            f"Category view '{slug}' exposes ids {sorted(unknown)} that its "
            f"parent '{parent_slug}' does not contain."
        )


def test_every_category_card_resolves_to_a_parent_card() -> None:
    """No authored category word is dropped on the way to its parent.

    A word that fails to resolve would vanish from the app entirely, silently.
    ``domain/deck_supplements.py`` exists to keep this at zero: anything the
    parent corpus never carried is appended to it.
    """
    for slug, source in CATEGORY_SOURCE_DECKS.items():
        source_cards = source().cards
        mapping = resolve_category_card_map(slug)
        unresolved = [card.character for card in source_cards if card.id not in mapping]
        assert not unresolved, (
            f"Category '{slug}' has {len(unresolved)} word(s) with no counterpart "
            f"in its parent level deck: {unresolved}. Add them to "
            f"VOCAB_SUPPLEMENT/KANJI_SUPPLEMENT in domain/deck_supplements.py."
        )


@pytest.mark.parametrize(
    ("slug", "character", "expected_id"),
    [
        # The headline duplicate from issue #78: kana-only category surface
        # collapsing onto the kanji surface in the parent corpus.
        ("vocab_verbs", "みる", 647),
        # Reading+meaning match where several parent cards share the reading;
        # 'yasashii' is both 易しい (easy) and 優しい (kind), and N5 wins.
        ("vocab_adjectives", "やさしい", 668),
        # 'au' is 会う in N5 and 遭う in N3; level restriction keeps it in N5.
        ("vocab_verbs", "あう", 1),
        # The one genuinely ambiguous case in the corpus: 'atsui' matches both
        # 暑い (weather) and 熱い (objects). Lowest id breaks the tie.
        ("vocab_adjectives", "あつい", 22),
    ],
)
def test_pinned_category_mappings(slug: str, character: str, expected_id: int) -> None:
    """Pin the mappings that a corpus change would most plausibly move.

    These are the cases resolved by reading and meaning rather than by surface,
    so they are the ones a re-import could silently re-point at a different word.
    """
    source_card = next(
        card for card in CATEGORY_SOURCE_DECKS[slug]().cards if card.character == character
    )
    assert resolve_category_card_map(slug)[source_card.id] == expected_id


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
