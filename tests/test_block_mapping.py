"""Blocks as a filter over a parent deck (issue #78).

Vocabulary and kanji had no blocks at all — their thematic "categories" were
separate decks impersonating blocks, each with its own ``id_offset``. These tests
cover the replacement: categories resolved onto parent card ids, and generated
blocks covering whatever the categories leave.
"""

from __future__ import annotations

import pytest

from domain.block_mapping import (
    family_for_slug,
    level_for_slug,
    parent_slug_for_category,
    resolve_category_card_ids,
    resolve_category_card_map,
)
from domain.blocks import (
    Block,
    CATEGORY_UNLOCK_THRESHOLD,
    GENERATED_BLOCK_SIZE,
    _display_name,
    blocks_for_slug,
    compute_unlocked_count,
    unlock_threshold_for_slug,
)
from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS

_GENERATED = (
    "vocab_n5", "vocab_n4", "vocab_n3", "vocab_n2", "vocab_n1",
    "kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1",
)


class TestSlugClassification:
    @pytest.mark.parametrize(
        ("slug", "expected"),
        [
            ("vocab_greetings", "n5"),      # unmarked N5 category
            ("kanji_numbers_time", "n5"),   # unmarked N5 category
            ("vocab_n4_home_living", "n4"),
            ("kanji_n1_law_order", "n1"),
            ("vocab_n3", "n3"),
        ],
    )
    def test_level_for_slug(self, slug: str, expected: str) -> None:
        assert level_for_slug(slug) == expected

    @pytest.mark.parametrize(
        ("slug", "expected"),
        [("vocab_verbs", "vocab"), ("kanji_n5", "kanji"), ("hiragana", None), ("grammar_patterns", None)],
    )
    def test_family_for_slug(self, slug: str, expected: str | None) -> None:
        assert family_for_slug(slug) == expected

    @pytest.mark.parametrize("slug", ["vocab_n5", "kanji_n1", "hiragana", "sentence_examples"])
    def test_non_categories_have_no_parent(self, slug: str) -> None:
        assert parent_slug_for_category(slug) is None

    def test_categories_point_at_their_own_level(self) -> None:
        assert parent_slug_for_category("vocab_greetings") == "vocab_n5"
        assert parent_slug_for_category("kanji_n2_analysis") == "kanji_n2"


class TestCategoryResolution:
    def test_every_category_resolves_completely(self) -> None:
        """No authored word is silently dropped on the way to its parent."""
        for slug, source in CATEGORY_SOURCE_DECKS.items():
            cards = source().cards
            mapping = resolve_category_card_map(slug)
            assert len(mapping) == len(cards), (
                f"'{slug}' resolved {len(mapping)} of {len(cards)} cards"
            )

    def test_resolved_ids_all_exist_in_the_parent(self) -> None:
        for slug in CATEGORY_SOURCE_DECKS:
            parent_slug = parent_slug_for_category(slug)
            assert parent_slug is not None
            parent_ids = {card.id for card in ALL_DECKS[parent_slug]().cards}
            assert set(resolve_category_card_map(slug).values()) <= parent_ids

    def test_card_ids_view_is_the_deduplicated_mapping(self) -> None:
        for slug in CATEGORY_SOURCE_DECKS:
            ids = resolve_category_card_ids(slug)
            assert len(ids) == len(set(ids)), f"'{slug}' returned a duplicate id"
            assert set(ids) == set(resolve_category_card_map(slug).values())

    def test_kanji_never_match_on_reading(self) -> None:
        """Kanji readings are homophone-dense; only surface identity is safe.

        三, 賛, 算 and 傘 are all ``san``. A reading-based match would bind the
        category's 三 onto whichever homophone the corpus happened to list.
        """
        for slug in CATEGORY_SOURCE_DECKS:
            if family_for_slug(slug) != "kanji":
                continue
            parent_slug = parent_slug_for_category(slug)
            assert parent_slug is not None
            by_id = {card.id: card for card in ALL_DECKS[parent_slug]().cards}
            for source_id, parent_id in resolve_category_card_map(slug).items():
                source_card = next(c for c in CATEGORY_SOURCE_DECKS[slug]().cards if c.id == source_id)
                assert by_id[parent_id].character == source_card.character


class TestGeneratedBlocks:
    @pytest.mark.parametrize("slug", _GENERATED)
    def test_blocks_partition_the_whole_deck(self, slug: str) -> None:
        """Every card is in exactly one block, and no block invents an id."""
        deck_ids = [card.id for card in ALL_DECKS[slug]().cards]
        block_ids = [cid for block in blocks_for_slug(slug) for cid in block.card_ids]

        assert sorted(block_ids) == sorted(deck_ids)
        assert len(block_ids) == len(set(block_ids)), "a card id appears in two blocks"

    @pytest.mark.parametrize("slug", _GENERATED)
    def test_block_indices_are_contiguous_from_zero(self, slug: str) -> None:
        """``build_block_progress`` gates on ``index < unlocked_count``."""
        blocks = blocks_for_slug(slug)
        assert [block.index for block in blocks] == list(range(len(blocks)))

    @pytest.mark.parametrize("slug", _GENERATED)
    def test_blocks_are_non_empty_and_named(self, slug: str) -> None:
        for block in blocks_for_slug(slug):
            assert block.card_ids, f"'{slug}' block {block.index} is empty"
            assert block.name.strip(), f"'{slug}' block {block.index} has no name"
            assert block.sample_chars, f"'{slug}' block {block.index} has no preview"

    @pytest.mark.parametrize("slug", _GENERATED)
    def test_generated_blocks_respect_the_target_size(self, slug: str) -> None:
        """Only the last generated block may be short."""
        generated = [b for b in blocks_for_slug(slug) if b.name[0].isupper() and b.name.split()[-1].isdigit()]
        for block in generated[:-1]:
            assert len(block.card_ids) == GENERATED_BLOCK_SIZE

    @pytest.mark.parametrize("slug", ["kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1"])
    def test_kanji_blocks_follow_the_component_graph_internally(self, slug: str) -> None:
        """Within a block, no kanji precedes a component it is built from.

        Themes group by subject, so the graph can no longer order the deck end to
        end — a component may well sit in a different theme. What survives, and
        what a learner actually meets in one sitting, is the order *inside* each
        block: the themed ids are drawn from a component-ordered remainder, so
        each block is a subsequence of that order.

        Authored category blocks are exempt: they keep their curated membership
        from before components existed.
        """
        from domain.block_mapping import category_slugs_for_parent, resolve_category_card_ids
        from domain.kanji_components import KANJI_COMPONENTS

        categorised: set[int] = set()
        for category_slug in category_slugs_for_parent(slug):
            categorised.update(resolve_category_card_ids(category_slug))

        by_id = {card.id: card.character for card in ALL_DECKS[slug]().cards}
        for block in blocks_for_slug(slug):
            if any(cid in categorised for cid in block.card_ids):
                continue
            chars = [by_id[cid] for cid in block.card_ids]
            position = {char: index for index, char in enumerate(chars)}
            for char in chars:
                for component in KANJI_COMPONENTS.get(char, ()):
                    if component in position and component != char:
                        assert position[component] < position[char], (
                            f"'{slug}' block '{block.name}': "
                            f"{char} arrives before its component {component}"
                        )

    @pytest.mark.parametrize("slug", ["vocab_n5", "vocab_n3", "vocab_n1"])
    def test_vocabulary_blocks_keep_deck_order(self, slug: str) -> None:
        """Components describe kanji only, so vocabulary must be left alone."""
        generated = [b for b in blocks_for_slug(slug) if b.name.split()[-1].isdigit()]
        remainder = [cid for block in generated for cid in block.card_ids]
        assert remainder == sorted(remainder), f"'{slug}' vocabulary was reordered"

    def test_authored_categories_come_first_and_keep_their_names(self) -> None:
        names = [block.name for block in blocks_for_slug("vocab_n5")]
        assert names[:4] == ["Greetings", "Numbers", "Time & Days", "Family"]

    def test_level_prefix_is_stripped_from_category_names(self) -> None:
        """``"Kanji: N5 · Numbers & Time"`` reads as ``"Numbers & Time"``."""
        assert blocks_for_slug("kanji_n5")[0].name == "Numbers & Time"
        assert blocks_for_slug("vocab_n4")[0].name == "School & Work"

    @pytest.mark.parametrize(
        ("deck_name", "expected"),
        [
            ("Kanji: N5 · Numbers & Time", "Numbers & Time"),
            ("Vocabulary: Greetings", "Greetings"),
            ("Vocabulary N5", "Vocabulary N5"),
            # Only a level marker is a level marker. A name that merely contains
            # the separator, or a hyphen, keeps all of itself.
            ("Vocabulary: Food · Drink", "Food · Drink"),
            ("Vocabulary: Sub-topics", "Sub-topics"),
        ],
    )
    def test_display_name_only_strips_a_real_level_marker(
        self, deck_name: str, expected: str
    ) -> None:
        assert _display_name(deck_name) == expected

    def test_vocab_and_kanji_use_the_category_unlock_threshold(self) -> None:
        for slug in _GENERATED:
            assert unlock_threshold_for_slug(slug) == CATEGORY_UNLOCK_THRESHOLD

    def test_previously_blockless_decks_now_have_blocks(self) -> None:
        """The measured starting point: both returned ``{"blocks": []}``."""
        assert blocks_for_slug("vocab_n5")
        assert blocks_for_slug("kanji_n5")

    def test_category_decks_themselves_have_no_blocks(self) -> None:
        """A category is a block now, so it does not carry blocks of its own."""
        for slug in CATEGORY_SOURCE_DECKS:
            assert blocks_for_slug(slug) == []


class TestUnlockFloor:
    """Introducing blocks must not lock away cards a learner already studied."""

    def _blocks(self) -> list[Block]:
        return [
            Block(0, "one", [1, 2], ["a"]),
            Block(1, "two", [3, 4], ["b"]),
            Block(2, "three", [5, 6], ["c"]),
        ]

    def test_sequential_unlock_is_unchanged_for_a_fresh_learner(self) -> None:
        assert compute_unlocked_count(self._blocks(), {}) == 1

    def test_sequential_unlock_still_advances_on_mastery(self) -> None:
        assert compute_unlocked_count(self._blocks(), {1: 1, 2: 1}) == 2

    def test_a_studied_late_block_stays_reachable(self) -> None:
        """vocab/kanji had no blocks before #78, so the whole deck was one pool.

        A learner who studied a card that now lands in block 2 must not find it
        locked behind blocks 0 and 1 they never saw as separate units.
        """
        assert compute_unlocked_count(self._blocks(), {5: 3}) == 3

    def test_the_floor_never_lowers_the_sequential_result(self) -> None:
        """Block 0 complete unlocks block 1; a part-done block 1 does not unlock 2.

        The floor only raises the count to reach studied cards — here the
        furthest studied card is already inside the last unlocked block.
        """
        assert compute_unlocked_count(self._blocks(), {1: 1, 2: 1, 3: 1}) == 2
