"""The authored vocabulary themes, and the blocks they become.

Mirrors :mod:`tests.test_kanji_themes`, plus one guard that applies to both
families: a block heading must be unique within its deck. The vocabulary themes
run *after* the authored category decks, which already own ``Numbers``,
``Family``, ``Food & Drink`` and ``School & Study`` — two chips reading
"Numbers" is exactly the ambiguity the themes exist to remove.
"""

from __future__ import annotations

import re
from collections import Counter

import pytest

from domain.block_mapping import category_slugs_for_parent, resolve_category_card_ids
from domain.blocks import blocks_for_slug
from domain.decks import ALL_DECKS
from domain.kanji_themes import KANJI_THEMES
from domain.vocab_themes import VOCAB_THEMES

THEMED_SLUGS = tuple(VOCAB_THEMES)

_GENERIC_NAME = re.compile(r"(?:Kanji|Words) \d+")


def _uncategorised(slug: str) -> list[str]:
    claimed: set[int] = set()
    for category_slug in category_slugs_for_parent(slug):
        claimed.update(resolve_category_card_ids(category_slug))
    return [card.character for card in ALL_DECKS[slug]().cards if card.id not in claimed]


class TestThemeData:
    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_covers_every_uncategorised_word(self, slug: str) -> None:
        themed = {word for _, words in VOCAB_THEMES[slug] for word in words}
        missing = sorted(set(_uncategorised(slug)) - themed)
        assert not missing, f"'{slug}' leaves {len(missing)} words unthemed: {' '.join(missing[:20])}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_places_each_word_in_exactly_one_theme(self, slug: str) -> None:
        counts = Counter(word for _, words in VOCAB_THEMES[slug] for word in words)
        duplicated = sorted(word for word, n in counts.items() if n > 1)
        assert not duplicated, f"'{slug}' repeats: {' '.join(duplicated)}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_never_names_a_word_the_deck_lacks(self, slug: str) -> None:
        """Themes resolve by surface, so a typo would silently vanish."""
        available = set(_uncategorised(slug))
        unknown = sorted(
            word for _, words in VOCAB_THEMES[slug] for word in words if word not in available
        )
        assert not unknown, f"'{slug}' names absent words: {' '.join(unknown)}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_entries_are_word_tuples_not_a_packed_string(self, slug: str) -> None:
        """Kanji packs one character per position; a word is many characters wide."""
        for name, words in VOCAB_THEMES[slug]:
            assert isinstance(words, tuple), f"'{name}' is not a tuple of surfaces"
            assert all(isinstance(word, str) and word for word in words)


class TestThemedBlocks:
    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_no_block_is_left_numbered(self, slug: str) -> None:
        numbered = [b.name for b in blocks_for_slug(slug) if _GENERIC_NAME.fullmatch(b.name)]
        assert not numbered, f"'{slug}' still has numbered blocks: {numbered}"

    @pytest.mark.parametrize("slug", THEMED_SLUGS)
    def test_blocks_still_partition_the_deck(self, slug: str) -> None:
        deck_ids = sorted(card.id for card in ALL_DECKS[slug]().cards)
        block_ids = sorted(cid for block in blocks_for_slug(slug) for cid in block.card_ids)
        assert block_ids == deck_ids


class TestHeadingsAreUnambiguous:
    """Applies to both families: a name has to identify one block, or it is a number."""

    @pytest.mark.parametrize("slug", sorted({*KANJI_THEMES, *VOCAB_THEMES}))
    def test_no_two_blocks_in_a_deck_share_a_name(self, slug: str) -> None:
        names = [block.name for block in blocks_for_slug(slug)]
        duplicated = sorted({name for name, n in Counter(names).items() if n > 1})
        assert not duplicated, (
            f"'{slug}' has two blocks named {duplicated} — the authored category decks "
            "run first and already own some headings"
        )
