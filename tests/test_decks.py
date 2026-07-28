"""Tests for built-in deck content and registry."""

import pytest

from domain.deck_supplements import VOCAB_SUPPLEMENT, with_supplement
from domain.decks import (
    ALL_DECKS,
    CATEGORY_SOURCE_DECKS,
    _VOCAB_CATEGORY_ID_SPACING,
    _VOCAB_CATEGORY_LEVEL_BASE,
    _VOCAB_LEVEL_CATEGORY_SPECS,
    unresolved_vocab_category_words,
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
            # Vocabulary — N4 thematic categories
            "vocab_n4_school_work",
            "vocab_n4_home_living",
            "vocab_n4_travel_places",
            "vocab_n4_feelings_character",
            # Vocabulary — N3 thematic categories
            "vocab_n3_work_business",
            "vocab_n3_emotion_mind",
            "vocab_n3_society_people",
            "vocab_n3_nature_science",
            # Vocabulary — N2 thematic categories
            "vocab_n2_economy_trade",
            "vocab_n2_government_society",
            "vocab_n2_measure_analysis",
            "vocab_n2_land_construction",
            # Vocabulary — N1 thematic categories
            "vocab_n1_law_justice",
            "vocab_n1_thought_reason",
            "vocab_n1_conflict_crisis",
            "vocab_n1_arts_expression",
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

        The corpus is the imported data plus the category words it never carried
        (``VOCAB_SUPPLEMENT``, issue #78), which the deck appends so that
        collapsing the category decks into blocks loses no content.
        """
        deck = loader()
        assert len(deck) == len(with_supplement(list(corpus), VOCAB_SUPPLEMENT.get(level, ())))
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


class TestVocabThematicCategoriesN4toN1:
    """Curated N4–N1 thematic vocabulary decks (issue #68).

    These are selected by character string against a CSV-generated corpus, so
    the corpus can drift out from under them. That drift is invisible at
    runtime — the deck just builds smaller — which is exactly what these
    tests exist to catch.
    """

    SLUGS = tuple(_VOCAB_LEVEL_CATEGORY_SPECS)

    def test_every_level_has_four_categories(self) -> None:
        per_level: dict[str, int] = {}
        for _name, level, _slot, _words in _VOCAB_LEVEL_CATEGORY_SPECS.values():
            per_level[level] = per_level.get(level, 0) + 1
        assert per_level == {"n4": 4, "n3": 4, "n2": 4, "n1": 4}

    @pytest.mark.parametrize("slug", SLUGS)
    def test_every_curated_word_resolves_against_the_corpus(self, slug: str) -> None:
        missing = unresolved_vocab_category_words(slug)
        assert not missing, (
            f"Category '{slug}' curates words that are no longer in its level "
            f"corpus: {missing}. Either the CSV import changed or the curated "
            f"list drifted — the deck silently shrinks otherwise."
        )

    @pytest.mark.parametrize("slug", SLUGS)
    def test_deck_matches_its_curated_list(self, slug: str) -> None:
        """Asserted against the authored builder, not ``ALL_DECKS``.

        Since issue #78 ``ALL_DECKS[slug]`` serves a *view* over the parent level
        deck. The curation these tests guard — that every curated word is still
        in the corpus, in order — is a property of the source builder, which is
        what the view is derived from.
        """
        _name, level, _slot, words = _VOCAB_LEVEL_CATEGORY_SPECS[slug]
        deck = CATEGORY_SOURCE_DECKS[slug]()
        assert [card.character for card in deck.cards] == list(words)
        for card in deck.cards:
            assert card.romaji, f"Card {card.id} missing romaji"
            assert card.meaning, f"Card {card.id} missing meaning"
            assert card.tags == ["vocab", level]

    @pytest.mark.parametrize("slug", SLUGS)
    def test_card_ids_follow_curated_position(self, slug: str) -> None:
        """Ids come from position in the curated tuple, not the resolved list.

        That is what lets a word drop out of the corpus without shifting every
        later card onto a different word's SRS history. These are the source
        builder's own ids — what the view exposes are the parent's, and
        ``tests/test_block_mapping.py`` covers the translation between them.
        """
        _name, level, slot, words = _VOCAB_LEVEL_CATEGORY_SPECS[slug]
        base = _VOCAB_CATEGORY_LEVEL_BASE[level] + slot * _VOCAB_CATEGORY_ID_SPACING
        deck = CATEGORY_SOURCE_DECKS[slug]()
        for card in deck.cards:
            assert card.id == base + words.index(card.character)

    @pytest.mark.parametrize("slug", SLUGS)
    def test_registered_deck_is_a_view_over_its_parent(self, slug: str) -> None:
        """The registered deck carries the parent's name and the parent's ids.

        Both halves matter. ``review_states`` is keyed ``(deck_name, card_id)``,
        so a view that kept its own name would move the duplicate-identity
        problem rather than fix it.
        """
        _name, level, _slot, words = _VOCAB_LEVEL_CATEGORY_SPECS[slug]
        parent = ALL_DECKS[f"vocab_{level}"]()
        view = ALL_DECKS[slug]()
        parent_ids = {card.id for card in parent.cards}

        assert view.name == parent.name
        assert len(view.cards) == len(words)
        assert {card.id for card in view.cards} <= parent_ids

    def test_categories_within_a_level_do_not_share_words(self) -> None:
        for level in ("n4", "n3", "n2", "n1"):
            seen: dict[str, str] = {}
            for slug, (_name, lv, _slot, words) in _VOCAB_LEVEL_CATEGORY_SPECS.items():
                if lv != level:
                    continue
                for word in words:
                    assert word not in seen, (
                        f"{level}: '{word}' appears in both '{seen[word]}' and '{slug}'"
                    )
                    seen[word] = slug

    def test_every_category_word_also_lives_in_its_level_deck(self) -> None:
        """Categories curate from the level corpus, so the level deck is a superset."""
        level_decks = {
            "n4": get_vocab_n4_deck(),
            "n3": get_vocab_n3_deck(),
            "n2": get_vocab_n2_deck(),
            "n1": get_vocab_n1_deck(),
        }
        level_chars = {lv: {c.character for c in deck.cards} for lv, deck in level_decks.items()}
        for slug, (_name, level, _slot, words) in _VOCAB_LEVEL_CATEGORY_SPECS.items():
            missing = [w for w in words if w not in level_chars[level]]
            assert not missing, f"'{slug}' has words absent from vocab_{level}: {missing}"

    def test_curated_lists_fit_their_id_slot(self) -> None:
        for slug, (_name, _level, _slot, words) in _VOCAB_LEVEL_CATEGORY_SPECS.items():
            assert len(words) <= _VOCAB_CATEGORY_ID_SPACING, slug


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
