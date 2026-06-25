"""Tests for built-in deck content and registry."""

import pytest

from domain.decks import (
    ALL_DECKS,
    get_grammar_patterns_deck,
    get_hiragana_deck,
    get_kanji_n5_deck,
    get_katakana_deck,
    get_vocab_n5_deck,
)


class TestAllDecksRegistry:
    def test_all_decks_contains_expected_keys(self) -> None:
        assert set(ALL_DECKS.keys()) == {
            "hiragana",
            "katakana",
            "kanji_n5",
            "vocab_n5",
            "grammar_patterns",
        }

    def test_all_decks_callables_return_decks(self) -> None:
        for key, loader in ALL_DECKS.items():
            deck = loader()
            assert len(deck) > 0, f"Deck '{key}' is empty"


class TestKanjiN5Deck:
    def test_deck_has_minimum_cards(self) -> None:
        deck = get_kanji_n5_deck()
        assert len(deck) >= 80

    def test_deck_name(self) -> None:
        assert get_kanji_n5_deck().name == "Kanji N5"

    def test_every_card_has_required_fields(self) -> None:
        for card in get_kanji_n5_deck().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"

    def test_every_card_has_kanji_and_n5_tags(self) -> None:
        for card in get_kanji_n5_deck().cards:
            assert "kanji" in card.tags
            assert "n5" in card.tags

    def test_card_ids_are_unique(self) -> None:
        ids = [c.id for c in get_kanji_n5_deck().cards]
        assert len(ids) == len(set(ids))

    def test_meaning_differs_from_romaji(self) -> None:
        for card in get_kanji_n5_deck().cards:
            assert card.meaning != card.romaji, (
                f"Card '{card.character}' has meaning == romaji (likely copy-paste error)"
            )

    @pytest.mark.parametrize("kanji", ["日", "山", "一", "人", "食"])
    def test_spot_check_key_n5_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n5_deck().cards}
        assert kanji in chars, f"Expected N5 kanji '{kanji}' not found in deck"


class TestVocabN5Deck:
    def test_deck_has_minimum_cards(self) -> None:
        deck = get_vocab_n5_deck()
        assert len(deck) >= 80

    def test_deck_name(self) -> None:
        assert get_vocab_n5_deck().name == "Vocabulary N5"

    def test_every_card_has_required_fields(self) -> None:
        for card in get_vocab_n5_deck().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"

    def test_every_card_has_vocab_and_n5_tags(self) -> None:
        for card in get_vocab_n5_deck().cards:
            assert "vocab" in card.tags
            assert "n5" in card.tags

    def test_card_ids_are_unique(self) -> None:
        ids = [c.id for c in get_vocab_n5_deck().cards]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize("word", ["たべる", "いく", "くる", "ほん", "がっこう"])
    def test_spot_check_key_n5_words_present(self, word: str) -> None:
        chars = {c.character for c in get_vocab_n5_deck().cards}
        assert word in chars, f"Expected N5 word '{word}' not found in deck"


class TestGrammarPatternsDeck:
    def test_deck_has_minimum_cards(self) -> None:
        deck = get_grammar_patterns_deck()
        assert len(deck) >= 40

    def test_deck_name(self) -> None:
        assert get_grammar_patterns_deck().name == "Grammar Patterns"

    def test_every_card_has_required_fields(self) -> None:
        for card in get_grammar_patterns_deck().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"

    def test_every_card_has_grammar_tag(self) -> None:
        for card in get_grammar_patterns_deck().cards:
            assert "grammar" in card.tags

    def test_card_ids_are_unique(self) -> None:
        ids = [c.id for c in get_grammar_patterns_deck().cards]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize(
        "pattern",
        ["〜は〜です", "〜を", "〜に", "〜ます", "〜てください"],
    )
    def test_spot_check_key_patterns_present(self, pattern: str) -> None:
        chars = {c.character for c in get_grammar_patterns_deck().cards}
        assert pattern in chars, f"Expected grammar pattern '{pattern}' not found in deck"


class TestExistingDecksUnchanged:
    def test_hiragana_deck_still_has_correct_count(self) -> None:
        assert len(get_hiragana_deck()) == 104

    def test_katakana_deck_still_has_correct_count(self) -> None:
        assert len(get_katakana_deck()) == 104
