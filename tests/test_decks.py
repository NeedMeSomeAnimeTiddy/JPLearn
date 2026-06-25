"""Tests for built-in deck content and registry."""

import pytest

from domain.decks import (
    ALL_DECKS,
    get_grammar_patterns_deck,
    get_hiragana_deck,
    get_kanji_n1_deck,
    get_kanji_n2_deck,
    get_kanji_n3_deck,
    get_kanji_n4_deck,
    get_kanji_n5_deck,
    get_katakana_deck,
    get_vocab_n1_deck,
    get_vocab_n2_deck,
    get_vocab_n3_deck,
    get_vocab_n4_deck,
    get_vocab_n5_deck,
)


class TestAllDecksRegistry:
    def test_all_decks_contains_expected_keys(self) -> None:
        assert set(ALL_DECKS.keys()) == {
            "hiragana",
            "katakana",
            "kanji_n5",
            "kanji_n4",
            "kanji_n3",
            "kanji_n2",
            "kanji_n1",
            "vocab_n5",
            "vocab_n4",
            "vocab_n3",
            "vocab_n2",
            "vocab_n1",
            "grammar_patterns",
        }

    def test_all_decks_callables_return_decks(self) -> None:
        for key, loader in ALL_DECKS.items():
            deck = loader()
            assert len(deck) > 0, f"Deck '{key}' is empty"


class TestKanjiDecks:
    @pytest.mark.parametrize(
        ("loader", "min_cards"),
        [
            (get_kanji_n5_deck, 80),
            (get_kanji_n4_deck, 50),
            (get_kanji_n3_deck, 50),
            (get_kanji_n2_deck, 50),
            (get_kanji_n1_deck, 50),
        ],
    )
    def test_deck_has_minimum_cards(self, loader, min_cards: int) -> None:
        deck = loader()
        assert len(deck) >= min_cards

    @pytest.mark.parametrize(
        ("loader", "name"),
        [
            (get_kanji_n5_deck, "Kanji N5"),
            (get_kanji_n4_deck, "Kanji N4"),
            (get_kanji_n3_deck, "Kanji N3"),
            (get_kanji_n2_deck, "Kanji N2"),
            (get_kanji_n1_deck, "Kanji N1"),
        ],
    )
    def test_deck_name(self, loader, name: str) -> None:
        assert loader().name == name

    @pytest.mark.parametrize(
        "loader",
        [get_kanji_n5_deck, get_kanji_n4_deck, get_kanji_n3_deck, get_kanji_n2_deck, get_kanji_n1_deck],
    )
    def test_every_card_has_required_fields(self, loader) -> None:
        for card in loader().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"

    @pytest.mark.parametrize(
        ("loader", "level"),
        [
            (get_kanji_n5_deck, "n5"),
            (get_kanji_n4_deck, "n4"),
            (get_kanji_n3_deck, "n3"),
            (get_kanji_n2_deck, "n2"),
            (get_kanji_n1_deck, "n1"),
        ],
    )
    def test_every_card_has_kanji_and_expected_jlpt_level_tag(self, loader, level: str) -> None:
        for card in loader().cards:
            assert "kanji" in card.tags
            assert level in card.tags

    @pytest.mark.parametrize(
        "loader",
        [get_kanji_n5_deck, get_kanji_n4_deck, get_kanji_n3_deck, get_kanji_n2_deck, get_kanji_n1_deck],
    )
    def test_card_ids_are_unique(self, loader) -> None:
        ids = [c.id for c in loader().cards]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize(
        "loader",
        [get_kanji_n5_deck, get_kanji_n4_deck, get_kanji_n3_deck, get_kanji_n2_deck, get_kanji_n1_deck],
    )
    def test_meaning_differs_from_romaji(self, loader) -> None:
        for card in loader().cards:
            assert card.meaning != card.romaji, (
                f"Card '{card.character}' has meaning == romaji (likely copy-paste error)"
            )

    @pytest.mark.parametrize("kanji", ["日", "山", "一", "人", "食"])
    def test_spot_check_key_n5_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n5_deck().cards}
        assert kanji in chars, f"Expected N5 kanji '{kanji}' not found in deck"

    @pytest.mark.parametrize("kanji", ["会", "同", "場", "家"])
    def test_spot_check_n4_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n4_deck().cards}
        assert kanji in chars, f"Expected N4 kanji '{kanji}' not found in deck"

    @pytest.mark.parametrize("kanji", ["政", "経", "術", "要"])
    def test_spot_check_n3_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n3_deck().cards}
        assert kanji in chars, f"Expected N3 kanji '{kanji}' not found in deck"

    @pytest.mark.parametrize("kanji", ["率", "責", "訳", "総"])
    def test_spot_check_n2_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n2_deck().cards}
        assert kanji in chars, f"Expected N2 kanji '{kanji}' not found in deck"

    @pytest.mark.parametrize("kanji", ["顕", "諭", "罰", "審"])
    def test_spot_check_n1_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n1_deck().cards}
        assert kanji in chars, f"Expected N1 kanji '{kanji}' not found in deck"


class TestVocabDecks:
    @pytest.mark.parametrize(
        ("loader", "min_cards", "name", "level"),
        [
            (get_vocab_n5_deck, 80, "Vocabulary N5", "n5"),
            (get_vocab_n4_deck, 80, "Vocabulary N4", "n4"),
            (get_vocab_n3_deck, 80, "Vocabulary N3", "n3"),
            (get_vocab_n2_deck, 80, "Vocabulary N2", "n2"),
            (get_vocab_n1_deck, 80, "Vocabulary N1", "n1"),
        ],
    )
    def test_vocab_deck_structure(self, loader, min_cards: int, name: str, level: str) -> None:
        deck = loader()
        assert len(deck) >= min_cards
        assert deck.name == name
        for card in deck.cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"
            assert "vocab" in card.tags
            assert level in card.tags

    @pytest.mark.parametrize(
        "loader",
        [get_vocab_n5_deck, get_vocab_n4_deck, get_vocab_n3_deck, get_vocab_n2_deck, get_vocab_n1_deck],
    )
    def test_vocab_card_ids_are_unique(self, loader) -> None:
        ids = [c.id for c in loader().cards]
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
