"""Resolve thematic category decks onto their parent level deck's card ids.

Vocabulary and kanji "categories" used to be separate decks with their own
``id_offset``, so the same word existed twice under two ids and two SRS
schedules — ``見る``/647 in ``vocab_n5`` and ``みる``/1104 in ``vocab_verbs`` were
one word with two independent FSRS states (issue #78). This module turns each
category into a *view* over its parent level deck: a list of the parent's card
ids, which :mod:`domain.blocks` then serves as a block.

Matching is deliberately conservative, in this order:

1. **Surface form.** Split on ``;`` and ``/`` first, because the corpora record
   alternates as ``川; 河`` and ``いい/よい``.
2. **Reading plus overlapping meaning** — vocabulary only. The hand-written N5
   categories are kana-only (``みる``) while the imported corpus uses kanji
   surfaces (``見る``), so surface matching alone would miss most of them.
   Requiring a shared meaning word keeps ``はな`` from binding 花 to 鼻.
3. Ties break on the **lowest card id**, which is the earliest occurrence in the
   corpus. Exactly one card currently reaches this rule: ``あつい`` "hot", which
   matches both 暑い (weather) and 熱い (objects); it resolves to 暑い.

Kanji never use step 2. Kanji readings are homophone-dense — 三, 賛, 算, 傘 are
all ``san`` — so reading-based matching would collapse distinct characters onto
one card.

Matching is restricted to the category's **own JLPT level**. A block is a list of
ids within a single deck, so a category may not reach across levels; anything its
own parent lacks is recovered by :mod:`domain.deck_supplements` instead. Every
card in every category deck resolves under these rules — :mod:`tests
<tests.test_block_mapping>` asserts it, so a corpus change that breaks a mapping
fails loudly rather than silently dropping a word from its block.
"""

from __future__ import annotations

import re
from functools import lru_cache

from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS

# JLPT levels, ordered as the decks are.
_LEVELS: tuple[str, ...] = ("n5", "n4", "n3", "n2", "n1")

# Families that split into level decks plus thematic category decks.
_FAMILIES: tuple[str, ...] = ("vocab", "kanji")

# Corpora record alternate surfaces and readings inline: "川; 河", "いい/よい".
_ALTERNATE_SEPARATORS = re.compile(r"[;/]")

# Meaning words shorter than this carry no disambiguating signal ("to", "a").
_MIN_MEANING_TOKEN = 3


def _variants(value: str) -> list[str]:
    """Split an inline-alternates field into its individual forms."""
    return [part.strip() for part in _ALTERNATE_SEPARATORS.split(value or "") if part.strip()]


def _meaning_tokens(meaning: str) -> frozenset[str]:
    """Return the comparable words of an English meaning gloss."""
    return frozenset(
        token
        for token in re.split(r"[^a-z]+", (meaning or "").lower())
        if len(token) >= _MIN_MEANING_TOKEN
    )


def level_for_slug(slug: str) -> str:
    """Return the JLPT level a deck slug belongs to.

    The level-marked slugs say so directly (``vocab_n4_home_living`` → ``"n4"``).
    The twelve hand-written N5 vocabulary categories and five N5 kanji categories
    carry no marker (``vocab_greetings``, ``kanji_numbers_time``) and are N5.
    """
    for level in _LEVELS:
        if slug.endswith(f"_{level}") or f"_{level}_" in slug:
            return level
    return "n5"


def family_for_slug(slug: str) -> str | None:
    """Return ``"vocab"``/``"kanji"`` for a deck slug, or ``None`` for neither."""
    for family in _FAMILIES:
        if slug == family or slug.startswith(f"{family}_"):
            return family
    return None


@lru_cache(maxsize=None)
def parent_slug_for_category(slug: str) -> str | None:
    """Return the level deck a category deck is a view over.

    Returns ``None`` for slugs that are already a parent (``vocab_n5``) or that
    belong to no level family (``hiragana``, ``grammar_patterns``).
    """
    family = family_for_slug(slug)
    if family is None:
        return None
    if slug in {f"{family}_{level}" for level in _LEVELS}:
        return None
    return f"{family}_{level_for_slug(slug)}"


@lru_cache(maxsize=None)
def category_slugs_for_parent(parent_slug: str) -> tuple[str, ...]:
    """Return the category decks that are views over ``parent_slug``.

    Order follows ``ALL_DECKS`` registration order, so the blocks a learner sees
    stay in a stable, authored sequence rather than an incidental one.
    """
    return tuple(
        slug for slug in ALL_DECKS if parent_slug_for_category(slug) == parent_slug
    )


@lru_cache(maxsize=None)
def _parent_index(parent_slug: str) -> tuple[dict[str, list[int]], dict[str, list[int]], dict[int, frozenset[str]]]:
    """Index a parent deck by surface form and by reading.

    Returns ``(by_surface, by_reading, meaning_tokens_by_id)``. Ids in each list
    are ascending, so the first entry is already the lowest-id tie-break winner.
    """
    by_surface: dict[str, list[int]] = {}
    by_reading: dict[str, list[int]] = {}
    meanings: dict[int, frozenset[str]] = {}
    for card in ALL_DECKS[parent_slug]().cards:
        for surface in _variants(card.character):
            by_surface.setdefault(surface, []).append(card.id)
        for reading in _variants(card.romaji or ""):
            by_reading.setdefault(reading, []).append(card.id)
        meanings[card.id] = _meaning_tokens(card.meaning)
    return by_surface, by_reading, meanings


@lru_cache(maxsize=None)
def resolve_category_card_map(slug: str) -> dict[int, int]:
    """Map a category deck's own card ids onto their parent-deck card ids.

    This is the primitive: it keeps *which* category card became which parent
    card, which the one-shot SRS migration needs in order to rewrite a stored
    ``("Vocabulary: Verbs", 1104)`` review state to ``("Vocabulary N5", 647)``.
    :func:`resolve_category_card_ids` is the deduplicated view of it.

    Cards that resolve to nothing are absent from the mapping rather than mapped
    to a sentinel. Every category card currently resolves — see
    ``tests/test_block_mapping.py`` — so an entry going missing is a signal that
    the corpus moved, not an expected state.

    Returns an empty mapping for a slug that is not a category deck. The result
    is cached and shared; treat it as read-only.
    """
    parent_slug = parent_slug_for_category(slug)
    if parent_slug is None:
        return {}

    family = family_for_slug(slug)
    by_surface, by_reading, meanings = _parent_index(parent_slug)

    resolved: dict[int, int] = {}
    for card in CATEGORY_SOURCE_DECKS[slug]().cards:
        match = _resolve_one(card, family, by_surface, by_reading, meanings)
        if match is not None:
            resolved[card.id] = match
    return resolved


@lru_cache(maxsize=None)
def resolve_category_card_ids(slug: str) -> tuple[int, ...]:
    """Return the parent-deck card ids a category deck covers, in deck order.

    Duplicates are collapsed: if two category cards resolve to the same parent
    card, the id appears once. That is the point of the exercise — one identity
    per word.

    Returns an empty tuple for a slug that is not a category deck.
    """
    seen: dict[int, None] = {}
    for parent_id in resolve_category_card_map(slug).values():
        seen.setdefault(parent_id, None)
    return tuple(seen)


def _resolve_one(
    card: object,
    family: str | None,
    by_surface: dict[str, list[int]],
    by_reading: dict[str, list[int]],
    meanings: dict[int, frozenset[str]],
) -> int | None:
    """Return the parent card id one category card maps to, or ``None``."""
    surface_hits = [
        card_id
        for surface in _variants(getattr(card, "character", ""))
        for card_id in by_surface.get(surface, ())
    ]
    if surface_hits:
        return min(surface_hits)

    # Kanji stop here: a shared reading says nothing about a shared character.
    if family != "vocab":
        return None

    wanted = _meaning_tokens(getattr(card, "meaning", ""))
    if not wanted:
        return None
    reading_hits = {
        card_id
        for reading in _variants(getattr(card, "romaji", "") or "")
        for card_id in by_reading.get(reading, ())
        if meanings.get(card_id, frozenset()) & wanted
    }
    return min(reading_hits) if reading_hits else None
