"""The authored N3–N1 kanji themes, and the blocks they become.

These guard the property that made the themes worth authoring: every kanji in
those levels lands in a *named* block, exactly once. A corpus change that adds or
drops a character fails here rather than silently reintroducing a ``"Kanji 37"``.
"""

from __future__ import annotations

import re
from collections import Counter

import pytest

from domain.block_mapping import category_slugs_for_parent, resolve_category_card_ids
from domain.blocks import blocks_for_slug
from domain.decks import ALL_DECKS
from domain.kanji_themes import KANJI_THEMES

THEMED_SLUGS = ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1")

_GENERIC_NAME = re.compile(r"(?:Kanji|Words) \d+")


def _uncategorised(slug: str) -> list[str]:
    """Characters of the level deck that the older category decks do not claim."""
    claimed: set[int] = set()
    for category_slug in category_slugs_for_parent(slug):
        claimed.update(resolve_category_card_ids(category_slug))
    return [card.character for card in ALL_DECKS[slug]().cards if card.id not in claimed]


class TestThemeData:
    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_covers_every_uncategorised_kanji(self, slug: str) -> None:
        themed = {char for _, chars in KANJI_THEMES[slug] for char in chars}
        missing = sorted(set(_uncategorised(slug)) - themed)
        assert not missing, f"'{slug}' leaves {len(missing)} kanji unthemed: {''.join(missing)}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_places_each_kanji_in_exactly_one_theme(self, slug: str) -> None:
        counts = Counter(char for _, chars in KANJI_THEMES[slug] for char in chars)
        duplicated = sorted(char for char, n in counts.items() if n > 1)
        assert not duplicated, f"'{slug}' repeats: {''.join(duplicated)}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_never_names_a_kanji_the_deck_lacks(self, slug: str) -> None:
        """A theme is resolved by character, so a stray one would silently vanish."""
        available = set(_uncategorised(slug))
        unknown = sorted(
            char for _, chars in KANJI_THEMES[slug] for char in chars if char not in available
        )
        assert not unknown, f"'{slug}' names absent kanji: {''.join(unknown)}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_headings_are_unique_and_not_numbered(self, slug: str) -> None:
        names = [name for name, _ in KANJI_THEMES[slug]]
        assert len(names) == len(set(names)), f"'{slug}' has two themes with one name"
        for name in names:
            assert name.strip()
            assert not _GENERIC_NAME.fullmatch(name), f"'{name}' is the thing themes replaced"

    def test_every_kanji_level_is_themed(self) -> None:
        """No kanji level may fall back to numbered blocks."""
        assert set(KANJI_THEMES) == set(THEMED_SLUGS)


class TestThemedBlocks:
    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_no_block_is_left_numbered(self, slug: str) -> None:
        numbered = [b.name for b in blocks_for_slug(slug) if _GENERIC_NAME.fullmatch(b.name)]
        assert not numbered, f"'{slug}' still has numbered blocks: {numbered}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_blocks_still_partition_the_deck(self, slug: str) -> None:
        """Themes must not drop or duplicate a card while regrouping the remainder."""
        deck_ids = sorted(card.id for card in ALL_DECKS[slug]().cards)
        block_ids = sorted(cid for block in blocks_for_slug(slug) for cid in block.card_ids)
        assert block_ids == deck_ids

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_every_block_carries_a_preview(self, slug: str) -> None:
        for block in blocks_for_slug(slug):
            assert block.card_ids
            assert block.sample_chars

    def test_a_theme_block_holds_exactly_its_characters(self) -> None:
        """Spot-check that resolution is by character, not by position."""
        by_id = {card.id: card.character for card in ALL_DECKS["kanji_n3"]().cards}
        block = next(b for b in blocks_for_slug("kanji_n3") if b.name == "Body & Health")
        expected = dict(KANJI_THEMES["kanji_n3"])["Body & Health"]

        assert {by_id[cid] for cid in block.card_ids} == set(expected)
