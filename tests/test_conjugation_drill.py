"""Tokenizer-backed classification and drill payload assembly."""

from __future__ import annotations

import pytest

from data.conjugation_drill import (
    GAME_TYPE,
    classify_word,
    generate_conjugation_drill_data,
    katakana_to_hiragana,
)


def test_katakana_to_hiragana_folds_readings() -> None:
    assert katakana_to_hiragana("タベル") == "たべる"
    assert katakana_to_hiragana("ベンキョウ") == "べんきょう"
    assert katakana_to_hiragana("たべる") == "たべる"


@pytest.mark.parametrize(
    ("word", "expected_class", "expected_reading"),
    [
        ("食べる", "ichidan", "たべる"),
        ("会う", "godan", "あう"),
        ("行く", "godan", "いく"),
        ("来る", "kuru", "くる"),
        ("勉強する", "suru", "べんきょうする"),
        ("高い", "i_adjective", "たかい"),
        ("静か", "na_adjective", "しずか"),
    ],
)
def test_classify_word(word: str, expected_class: str, expected_reading: str) -> None:
    assert classify_word(word) == (expected_class, expected_reading)


@pytest.mark.parametrize("word", ["本", "青", "電車", ""])
def test_classify_word_refuses_non_conjugatable_words(word: str) -> None:
    assert classify_word(word) is None


@pytest.mark.parametrize("word", ["食べた", "会って", "高くない"])
def test_classify_word_refuses_already_inflected_input(word: str) -> None:
    """Drilling from an inflected form would make the prompt lie."""
    assert classify_word(word) is None


class TestKanaOnlyClassification:
    def test_non_ru_tails_are_unambiguously_godan(self) -> None:
        assert classify_word("のむ") == ("godan", "のむ")
        assert classify_word("はなす") == ("godan", "はなす")

    def test_known_ru_verbs_use_the_curated_sense(self) -> None:
        # かえる is 帰る in the deck that ships it, not 変える.
        assert classify_word("かえる") == ("godan", "かえる")
        assert classify_word("みる") == ("ichidan", "みる")

    def test_unknown_kana_ru_verbs_are_refused_rather_than_guessed(self) -> None:
        assert classify_word("しゃべる") is None


class TestPayload:
    def test_payload_carries_both_spellings(self) -> None:
        payload = generate_conjugation_drill_data("食べる", stage=1, seed=0)
        assert payload.game_type == GAME_TYPE
        assert payload.word == "食べる"
        assert payload.reading == "たべる"
        assert payload.word_class == "ichidan"
        assert payload.expected in payload.accepted
        assert payload.expected_reading in payload.accepted

    def test_stage_one_never_asks_an_advanced_voice(self) -> None:
        core = {
            "te",
            "past",
            "negative",
            "past_negative",
            "polite",
            "polite_past",
            "polite_negative",
            "polite_past_negative",
        }
        for seed in range(40):
            assert generate_conjugation_drill_data("会う", stage=1, seed=seed).form in core

    def test_stage_three_can_reach_the_advanced_voices(self) -> None:
        forms = {
            generate_conjugation_drill_data("会う", stage=3, seed=seed).form
            for seed in range(60)
        }
        assert forms & {"passive", "causative", "causative_passive", "imperative"}

    def test_same_seed_and_stage_is_deterministic(self) -> None:
        first = generate_conjugation_drill_data("読む", stage=2, seed=11)
        second = generate_conjugation_drill_data("読む", stage=2, seed=11)
        assert first == second

    def test_prompt_names_the_part_of_speech(self) -> None:
        verb = generate_conjugation_drill_data("読む", stage=1, seed=3)
        adjective = generate_conjugation_drill_data("高い", stage=1, seed=3)
        assert "verb" in verb.prompt
        assert "adjective" in adjective.prompt

    def test_stative_verbs_never_produce_an_imperative(self) -> None:
        forms = {
            generate_conjugation_drill_data("ある", stage=3, seed=seed).form
            for seed in range(40)
        }
        assert "imperative" not in forms
        assert "passive" not in forms

    @pytest.mark.parametrize("word", ["本", "青", "食べた", "しゃべる"])
    def test_undrillable_words_raise(self, word: str) -> None:
        with pytest.raises(ValueError):
            generate_conjugation_drill_data(word, stage=1, seed=0)
