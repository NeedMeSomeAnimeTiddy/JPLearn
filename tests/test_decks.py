"""Tests for built-in deck content and registry."""

import pytest

from domain.decks import (
    ALL_DECKS,
    VOCAB_N1_EXTERNAL_DATA,
    VOCAB_N2_EXTERNAL_DATA,
    VOCAB_N3_EXTERNAL_DATA,
    VOCAB_N4_EXTERNAL_DATA,
    VOCAB_N5_EXTERNAL_DATA,
    get_conjugation_training_deck,
    get_grammar_patterns_deck,
    get_hiragana_deck,
    get_kanji_n1_deck,
    get_kanji_n2_deck,
    get_kanji_n3_deck,
    get_kanji_n4_deck,
    get_kanji_n5_deck,
    get_katakana_deck,
    get_sentence_examples_deck,
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
            # Kanji JLPT levels
            "kanji_n5",
            "kanji_n4",
            "kanji_n3",
            "kanji_n2",
            "kanji_n1",
            # Kanji thematic categories
            "kanji_numbers_time",
            "kanji_nature_world",
            "kanji_people_body",
            "kanji_study_language",
            "kanji_actions_travel",
            # Kanji — N4 thematic categories
            "kanji_n4_society_roles",
            "kanji_n4_mind_thought",
            "kanji_n4_daily_life",
            "kanji_n4_time_action",
            # Kanji — N3 thematic categories
            "kanji_n3_governance",
            "kanji_n3_communication",
            "kanji_n3_movement",
            "kanji_n3_achievement",
            # Kanji — N2 thematic categories
            "kanji_n2_professionalism",
            "kanji_n2_economics",
            "kanji_n2_analysis",
            # Kanji — N1 thematic categories
            "kanji_n1_law_order",
            "kanji_n1_ideology",
            "kanji_n1_literary",
            # Vocabulary JLPT levels
            "vocab_n5",
            "vocab_n4",
            "vocab_n3",
            "vocab_n2",
            "vocab_n1",
            # Vocabulary thematic categories
            "vocab_greetings",
            "vocab_numbers",
            "vocab_time_days",
            "vocab_family",
            "vocab_body",
            "vocab_food_drink",
            "vocab_school_study",
            "vocab_places",
            "vocab_transport",
            "vocab_adjectives",
            "vocab_verbs",
            "vocab_nouns",
            # Grammar / Conversational
            "grammar_patterns",
            "sentence_examples",
            "conjugation_training",
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
            assert card.example_sentence, f"Card {card.id} missing example sentence"

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

    @pytest.mark.parametrize("kanji", ["日", "山", "国", "人", "食"])
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

    @pytest.mark.parametrize("kanji", ["協", "総", "訳", "税"])
    def test_spot_check_n2_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n2_deck().cards}
        assert kanji in chars, f"Expected N2 kanji '{kanji}' not found in deck"

    @pytest.mark.parametrize("kanji", ["統", "率", "審", "憲"])
    def test_spot_check_n1_kanji_present(self, kanji: str) -> None:
        chars = {c.character for c in get_kanji_n1_deck().cards}
        assert kanji in chars, f"Expected N1 kanji '{kanji}' not found in deck"


class TestVocabDecks:
    @pytest.mark.parametrize(
        ("loader", "corpus", "min_cards", "name", "level"),
        [
            (get_vocab_n5_deck, VOCAB_N5_EXTERNAL_DATA, 700, "Vocabulary N5", "n5"),
            (get_vocab_n4_deck, VOCAB_N4_EXTERNAL_DATA, 600, "Vocabulary N4", "n4"),
            (get_vocab_n3_deck, VOCAB_N3_EXTERNAL_DATA, 2000, "Vocabulary N3", "n3"),
            (get_vocab_n2_deck, VOCAB_N2_EXTERNAL_DATA, 1700, "Vocabulary N2", "n2"),
            (get_vocab_n1_deck, VOCAB_N1_EXTERNAL_DATA, 2500, "Vocabulary N1", "n1"),
        ],
    )
    def test_vocab_deck_structure(
        self, loader, corpus: list, min_cards: int, name: str, level: str
    ) -> None:
        """Level decks expose the entire imported corpus (issue #67).

        The deck size is asserted against the corpus rather than a literal so
        a re-import doesn't need a test edit; ``min_cards`` is the separate
        guard that catches a corpus that went missing or got truncated again.
        """
        deck = loader()
        assert len(deck) == len(corpus)
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

    @pytest.mark.parametrize("word", ["会う", "青い", "秋", "遊ぶ", "頭"])
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
            assert card.example_sentence, f"Card {card.id} missing example sentence"

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


class TestSentenceExamplesDeck:
    def test_deck_has_minimum_cards(self) -> None:
        deck = get_sentence_examples_deck()
        assert len(deck) >= 40

    def test_deck_name(self) -> None:
        assert get_sentence_examples_deck().name == "Sentence Examples"

    def test_every_card_has_required_fields(self) -> None:
        for card in get_sentence_examples_deck().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"
            assert card.example_sentence, f"Card {card.id} missing example sentence"

    def test_every_card_has_sentence_and_example_tags(self) -> None:
        for card in get_sentence_examples_deck().cards:
            assert "sentence" in card.tags
            assert "example" in card.tags

    def test_card_ids_are_unique(self) -> None:
        ids = [c.id for c in get_sentence_examples_deck().cards]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize(
        "pattern",
        ["〜は〜です", "〜を", "〜に", "〜ます", "〜てください"],
    )
    def test_spot_check_sentence_patterns_present(self, pattern: str) -> None:
        chars = {c.character for c in get_sentence_examples_deck().cards}
        assert pattern in chars, f"Expected sentence pattern '{pattern}' not found in deck"


class TestConjugationTrainingDeck:
    def test_deck_has_minimum_cards(self) -> None:
        deck = get_conjugation_training_deck()
        assert len(deck) >= 20

    def test_deck_name(self) -> None:
        assert get_conjugation_training_deck().name == "Conjugation Training"

    def test_every_card_has_required_fields(self) -> None:
        for card in get_conjugation_training_deck().cards:
            assert card.character, f"Card {card.id} missing character"
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"
            assert card.example_sentence, f"Card {card.id} missing example sentence"

    def test_every_card_has_conjugation_tag(self) -> None:
        for card in get_conjugation_training_deck().cards:
            assert "conjugation" in card.tags

    def test_card_ids_are_unique(self) -> None:
        ids = [c.id for c in get_conjugation_training_deck().cards]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize(
        "pattern",
        ["〜ます", "〜ません", "〜ました", "〜ないでください", "〜かった"],
    )
    def test_spot_check_key_conjugation_forms_present(self, pattern: str) -> None:
        chars = {c.character for c in get_conjugation_training_deck().cards}
        assert pattern in chars, f"Expected conjugation form '{pattern}' not found in deck"


class TestExistingDecksUnchanged:
    def test_hiragana_deck_still_has_correct_count(self) -> None:
        assert len(get_hiragana_deck()) == 104

    def test_katakana_deck_still_has_correct_count(self) -> None:
        assert len(get_katakana_deck()) == 104
