"""Conjugation rule tables, class by class and exception by exception."""

from __future__ import annotations

import pytest

from domain.conjugation import (
    ConjugationError,
    applicable_forms,
    conjugate,
    forms_for_stage,
    is_verb_class,
)


def surface_of(word: str, reading: str, word_class: str, form: str) -> str:
    return conjugate(word, reading, word_class, form).surface  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("te", "書いて"),
        ("past", "書いた"),
        ("negative", "書かない"),
        ("past_negative", "書かなかった"),
        ("polite", "書きます"),
        ("polite_past", "書きました"),
        ("polite_negative", "書きません"),
        ("polite_past_negative", "書きませんでした"),
        ("potential", "書ける"),
        ("volitional", "書こう"),
        ("desiderative", "書きたい"),
        ("conditional_tara", "書いたら"),
        ("conditional_ba", "書けば"),
        ("passive", "書かれる"),
        ("causative", "書かせる"),
        ("causative_passive", "書かせられる"),
        ("imperative", "書け"),
    ],
)
def test_godan_ku(form: str, expected: str) -> None:
    assert surface_of("書く", "かく", "godan", form) == expected


@pytest.mark.parametrize(
    ("word", "reading", "form", "expected"),
    [
        ("会う", "あう", "te", "会って"),
        ("会う", "あう", "negative", "会わない"),
        ("会う", "あう", "volitional", "会おう"),
        ("泳ぐ", "およぐ", "te", "泳いで"),
        ("泳ぐ", "およぐ", "past", "泳いだ"),
        ("話す", "はなす", "te", "話して"),
        ("待つ", "まつ", "te", "待って"),
        ("待つ", "まつ", "negative", "待たない"),
        ("死ぬ", "しぬ", "te", "死んで"),
        ("遊ぶ", "あそぶ", "te", "遊んで"),
        ("読む", "よむ", "te", "読んで"),
        ("読む", "よむ", "potential", "読める"),
        ("帰る", "かえる", "te", "帰って"),
        ("帰る", "かえる", "imperative", "帰れ"),
    ],
)
def test_godan_rows(word: str, reading: str, form: str, expected: str) -> None:
    assert surface_of(word, reading, "godan", form) == expected


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("te", "食べて"),
        ("past", "食べた"),
        ("negative", "食べない"),
        ("polite", "食べます"),
        ("potential", "食べられる"),
        ("volitional", "食べよう"),
        ("passive", "食べられる"),
        ("causative", "食べさせる"),
        ("causative_passive", "食べさせられる"),
        ("imperative", "食べろ"),
        ("conditional_ba", "食べれば"),
        ("conditional_tara", "食べたら"),
    ],
)
def test_ichidan(form: str, expected: str) -> None:
    assert surface_of("食べる", "たべる", "ichidan", form) == expected


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("te", "勉強して"),
        ("past", "勉強した"),
        ("negative", "勉強しない"),
        ("polite", "勉強します"),
        ("potential", "勉強できる"),
        ("volitional", "勉強しよう"),
        ("conditional_ba", "勉強すれば"),
        ("passive", "勉強される"),
        ("causative", "勉強させる"),
        ("causative_passive", "勉強させられる"),
        ("imperative", "勉強しろ"),
    ],
)
def test_suru_compound(form: str, expected: str) -> None:
    assert surface_of("勉強する", "べんきょうする", "suru", form) == expected


@pytest.mark.parametrize(
    ("form", "expected_surface", "expected_reading"),
    [
        ("te", "来て", "きて"),
        ("past", "来た", "きた"),
        ("negative", "来ない", "こない"),
        ("past_negative", "来なかった", "こなかった"),
        ("polite", "来ます", "きます"),
        ("potential", "来られる", "こられる"),
        ("volitional", "来よう", "こよう"),
        ("conditional_ba", "来れば", "くれば"),
        ("causative", "来させる", "こさせる"),
        ("imperative", "来い", "こい"),
    ],
)
def test_kuru_keeps_kanji_while_reading_shifts(
    form: str, expected_surface: str, expected_reading: str
) -> None:
    """来る is the one class where surface and reading do not share a tail."""
    result = conjugate("来る", "くる", "kuru", form)  # type: ignore[arg-type]
    assert result.surface == expected_surface
    assert result.reading == expected_reading


@pytest.mark.parametrize("form", ["te", "past", "conditional_tara"])
def test_iku_takes_the_irregular_onbin(form: str) -> None:
    """行く is godan-ku but takes っ, not the い its row predicts."""
    expected = {"te": "行って", "past": "行った", "conditional_tara": "行ったら"}[form]
    assert surface_of("行く", "いく", "godan", form) == expected
    # The regular row is unaffected.
    assert surface_of("聞く", "きく", "godan", "te") == "聞いて"


def test_aru_negative_suppletes_to_nai() -> None:
    assert surface_of("ある", "ある", "godan", "negative") == "ない"
    assert surface_of("ある", "ある", "godan", "past_negative") == "なかった"
    assert surface_of("ある", "ある", "godan", "past") == "あった"


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("te", "高くて"),
        ("past", "高かった"),
        ("negative", "高くない"),
        ("past_negative", "高くなかった"),
        ("polite", "高いです"),
        ("polite_past", "高かったです"),
        ("adverbial", "高く"),
        ("conditional_ba", "高ければ"),
        ("conditional_tara", "高かったら"),
    ],
)
def test_i_adjective(form: str, expected: str) -> None:
    assert surface_of("高い", "たかい", "i_adjective", form) == expected


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("negative", "よくない"),
        ("past", "よかった"),
        ("te", "よくて"),
        ("adverbial", "よく"),
        ("polite", "いいです"),
    ],
)
def test_ii_inflects_off_yo(form: str, expected: str) -> None:
    assert surface_of("いい", "いい", "i_adjective", form) == expected


def test_ii_written_in_kanji_uses_the_regular_stem() -> None:
    result = conjugate("良い", "いい", "i_adjective", "negative")  # type: ignore[arg-type]
    assert result.surface == "良くない"
    assert result.reading == "よくない"


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("te", "静かで"),
        ("past", "静かだった"),
        ("negative", "静かじゃない"),
        ("polite", "静かです"),
        ("attributive", "静かな"),
        ("adverbial", "静かに"),
        ("conditional_ba", "静かなら"),
    ],
)
def test_na_adjective(form: str, expected: str) -> None:
    assert surface_of("静か", "しずか", "na_adjective", form) == expected


def test_na_adjective_negative_accepts_dewa_as_well_as_ja() -> None:
    result = conjugate("静か", "しずか", "na_adjective", "negative")  # type: ignore[arg-type]
    assert "静かではない" in result.accepted
    assert "静かじゃない" in result.accepted


def test_i_adjective_polite_negative_accepts_both_standard_spellings() -> None:
    result = conjugate("高い", "たかい", "i_adjective", "polite_negative")  # type: ignore[arg-type]
    assert "高くないです" in result.accepted
    assert "高くありません" in result.accepted


def test_accepted_includes_kanji_and_kana_and_dedupes() -> None:
    result = conjugate("食べる", "たべる", "ichidan", "te")  # type: ignore[arg-type]
    assert result.accepted == ("食べて", "たべて")

    kana_only = conjugate("みる", "みる", "ichidan", "te")  # type: ignore[arg-type]
    assert kana_only.accepted == ("みて",)


class TestApplicability:
    def test_stative_verbs_refuse_the_advanced_voices(self) -> None:
        forms = applicable_forms("godan", "ある")
        assert "imperative" not in forms
        assert "passive" not in forms
        assert "causative_passive" not in forms
        assert "te" in forms

    def test_dekiru_is_not_asked_for_a_potential(self) -> None:
        assert "potential" not in applicable_forms("ichidan", "できる")

    def test_adjectives_have_no_verb_voices(self) -> None:
        forms = applicable_forms("i_adjective", "たかい")
        assert forms.isdisjoint({"passive", "causative", "imperative", "potential"})

    def test_i_adjective_attributive_is_not_a_drill(self) -> None:
        """高い before a noun is just the dictionary form — nothing to produce."""
        assert "attributive" not in applicable_forms("i_adjective", "たかい")
        assert "attributive" in applicable_forms("na_adjective", "しずか")

    def test_honorific_irregulars_are_excluded_entirely(self) -> None:
        assert applicable_forms("godan", "くださる") == frozenset()
        assert applicable_forms("godan", "いらっしゃる") == frozenset()

    def test_conjugate_rejects_an_inapplicable_form(self) -> None:
        with pytest.raises(ConjugationError):
            conjugate("ある", "ある", "godan", "imperative")  # type: ignore[arg-type]


class TestStageGating:
    def test_stage_one_is_the_core_square_only(self) -> None:
        forms = forms_for_stage("godan", "かく", 1)
        assert set(forms) == {
            "te",
            "past",
            "negative",
            "past_negative",
            "polite",
            "polite_past",
            "polite_negative",
            "polite_past_negative",
        }

    def test_stages_are_cumulative(self) -> None:
        stage_two = forms_for_stage("godan", "かく", 2)
        assert set(forms_for_stage("godan", "かく", 1)).issubset(stage_two)
        assert "potential" in stage_two
        assert "passive" not in stage_two

    def test_advanced_voices_only_unlock_at_stage_three(self) -> None:
        stage_three = forms_for_stage("godan", "かく", 3)
        assert {"passive", "causative", "causative_passive", "imperative"}.issubset(stage_three)

    def test_stage_is_clamped_to_the_defined_range(self) -> None:
        assert forms_for_stage("godan", "かく", 9) == forms_for_stage("godan", "かく", 3)
        assert forms_for_stage("godan", "かく", 0) == forms_for_stage("godan", "かく", 1)

    def test_stage_forms_never_include_an_inapplicable_form(self) -> None:
        for stage in (1, 2, 3):
            assert "imperative" not in forms_for_stage("godan", "ある", stage)


def test_is_verb_class() -> None:
    assert is_verb_class("godan")
    assert is_verb_class("kuru")
    assert not is_verb_class("i_adjective")


def test_shape_mismatch_raises_rather_than_producing_nonsense() -> None:
    with pytest.raises(ConjugationError):
        conjugate("本", "ほん", "ichidan", "te")  # not a る-verb
    with pytest.raises(ConjugationError):
        conjugate("読む", "よむ", "suru", "te")  # not a する-verb
    with pytest.raises(ConjugationError):
        conjugate("", "", "godan", "te")


def test_misclassification_is_not_detectable_from_shape_alone() -> None:
    """食べる is a valid *shape* for a godan verb, so a wrong class silently
    yields 食べって. Classification confidence is the guard, not this module —
    data/conjugation_drill.py refuses to build a round it cannot classify."""
    assert surface_of("食べる", "たべる", "godan", "te") == "食べって"
