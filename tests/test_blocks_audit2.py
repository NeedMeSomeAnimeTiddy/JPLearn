"""Grammar and Sentence Examples blocks cover exactly the cards the app serves (audit 2, F6)."""

from __future__ import annotations

import pytest

from domain.blocks import (
    SENTENCE_EXAMPLES_BLOCK_COUNT,
    SENTENCE_EXAMPLES_BLOCK_SIZE,
    blocks_for_slug,
    unlock_threshold_for_slug,
    CATEGORY_UNLOCK_THRESHOLD,
)
from domain.decks import ALL_DECKS
from scripts import desktop_bridge

_GRAMMAR_BLOCKS = [
    ("Copula & Existence", 0, 5),
    ("Core Particles", 6, 18),
    ("Polite Verbs", 19, 30),
    ("Adjectives", 31, 37),
    ("Question Words", 38, 43),
    ("Connectives", 44, 48),
    ("Wants & Requests", 49, 51),
    ("Everyday Phrases", 52, 58),
    ("Casual & Past Forms", 59, 63),
    ("Endings & Feelings", 64, 71),
    ("Linking Actions", 72, 77),
    ("Opinions & Obligations", 78, 83),
    ("Conditionals & Favors", 84, 87),
]


class TestGrammarPatternsBlocks:
    def test_every_served_card_is_in_exactly_one_block(self) -> None:
        served = [card.id for card in ALL_DECKS["grammar_patterns"]().cards]
        in_blocks = [cid for block in blocks_for_slug("grammar_patterns") for cid in block.card_ids]
        assert sorted(in_blocks) == sorted(served), "a card is missing, duplicated or not served"
        assert len(in_blocks) == len(set(in_blocks))

    def test_blocks_match_the_approved_table(self) -> None:
        blocks = blocks_for_slug("grammar_patterns")
        assert [(b.index, b.name, b.card_ids[0], b.card_ids[-1]) for b in blocks] == [
            (i, name, first, last) for i, (name, first, last) in enumerate(_GRAMMAR_BLOCKS)
        ]
        for block in blocks:
            assert block.card_ids == list(range(block.card_ids[0], block.card_ids[-1] + 1))

    def test_sample_chars_are_the_first_patterns_of_each_block(self) -> None:
        by_id = {card.id: card.character for card in ALL_DECKS["grammar_patterns"]().cards}
        for block in blocks_for_slug("grammar_patterns"):
            assert block.sample_chars == [by_id[cid] for cid in block.card_ids[:3]], block.name


class TestSentenceExamplesBlocks:
    def test_blocks_tile_the_bridge_cap_exactly(self) -> None:
        blocks = blocks_for_slug("sentence_examples")
        cap = desktop_bridge.SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT
        assert len(blocks) == SENTENCE_EXAMPLES_BLOCK_COUNT == 60
        assert SENTENCE_EXAMPLES_BLOCK_COUNT * SENTENCE_EXAMPLES_BLOCK_SIZE == cap
        assert [cid for block in blocks for cid in block.card_ids] == list(range(cap))
        assert all(len(block.card_ids) == SENTENCE_EXAMPLES_BLOCK_SIZE for block in blocks)

    def test_blocks_are_numbered_sets_in_order(self) -> None:
        blocks = blocks_for_slug("sentence_examples")
        assert [b.index for b in blocks] == list(range(60))
        assert blocks[0].name == "Sentences 1–20"
        assert blocks[1].name == "Sentences 21–40"
        assert blocks[-1].name == "Sentences 1181–1200"

    def test_no_sentence_block_reuses_a_grammar_name(self) -> None:
        grammar = {b.name for b in blocks_for_slug("grammar_patterns")}
        assert not grammar & {b.name for b in blocks_for_slug("sentence_examples")}

    def test_sample_chars_are_empty_because_domain_cannot_read_the_csv(self) -> None:
        assert all(b.sample_chars == [] for b in blocks_for_slug("sentence_examples"))

    @pytest.mark.parametrize("slug", ["grammar_patterns", "sentence_examples"])
    def test_unlock_threshold_is_unchanged(self, slug: str) -> None:
        assert unlock_threshold_for_slug(slug) == CATEGORY_UNLOCK_THRESHOLD
