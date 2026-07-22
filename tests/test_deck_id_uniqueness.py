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

from domain.decks import ALL_DECKS


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


def test_all_decks_still_build_after_id_reallocation() -> None:
    """Sanity check: every deck is non-empty and every card has a unique id
    within its own deck (independent of cross-deck family checks above)."""
    for slug, loader in ALL_DECKS.items():
        deck = loader()
        ids = [c.id for c in deck.cards]
        assert len(ids) > 0, f"Deck '{slug}' is empty"
        assert len(ids) == len(set(ids)), f"Deck '{slug}' has duplicate ids within itself"
