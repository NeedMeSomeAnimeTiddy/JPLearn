"""Tests for domain/jlpt_readiness.py."""
from datetime import date

from domain.jlpt_readiness import (
    JLPT_LEVEL_SPECS,
    LEVEL_ORDER,
    JLPTLevelSpec,
    LevelReadiness,
    READINESS_THRESHOLD_PCT,
    compute_level_readiness,
    compute_readiness_report,
)
from domain.scheduler import ReviewState


def _mastered_state(card_id: int) -> ReviewState:
    return ReviewState(
        card_id=card_id,
        repetitions=3,
        interval=21,
        ease_factor=2.5,
        next_review=date.today(),
    )


def _unmastered_state(card_id: int) -> ReviewState:
    return ReviewState(card_id=card_id, repetitions=1, interval=5)


def test_compute_level_readiness_all_mastered() -> None:
    spec = JLPT_LEVEL_SPECS["n5"]
    vocab = [_mastered_state(i) for i in range(10)]
    kanji = [_mastered_state(i) for i in range(5)]
    result = compute_level_readiness(spec, vocab, kanji)
    assert result.readiness_pct == 100
    assert result.is_ready is True
    assert result.mastered_vocab == 10
    assert result.total_vocab == 10
    assert result.mastered_kanji == 5
    assert result.total_kanji == 5


def test_compute_level_readiness_none_mastered() -> None:
    spec = JLPT_LEVEL_SPECS["n5"]
    vocab = [_unmastered_state(i) for i in range(10)]
    kanji = [_unmastered_state(i) for i in range(5)]
    result = compute_level_readiness(spec, vocab, kanji)
    assert result.readiness_pct == 0
    assert result.is_ready is False


def test_compute_level_readiness_threshold_exactly_80() -> None:
    spec = JLPT_LEVEL_SPECS["n5"]
    # 8 mastered out of 10 = 80%
    vocab = [_mastered_state(i) for i in range(8)] + [_unmastered_state(i) for i in range(8, 10)]
    result = compute_level_readiness(spec, vocab, [])
    assert result.readiness_pct == 80
    assert result.is_ready is True


def test_compute_level_readiness_empty_decks() -> None:
    spec = JLPT_LEVEL_SPECS["n1"]
    result = compute_level_readiness(spec, [], [])
    assert result.readiness_pct == 0
    assert result.is_ready is False
    assert result.total_vocab == 0
    assert result.total_kanji == 0


def test_compute_readiness_report_recommended_target() -> None:
    # Only N5 has mastered cards
    n5_vocab_states = {i: _mastered_state(i) for i in range(10)}
    n5_kanji_states = {i: _mastered_state(i) for i in range(5)}
    states_by_deck: dict[str, dict] = {
        "vocab_n5": n5_vocab_states,
        "kanji_n5": n5_kanji_states,
    }
    report = compute_readiness_report(states_by_deck)  # type: ignore[arg-type]
    assert report.recommended_target == "n5"
    assert report.levels["n5"].is_ready is True
    for lv in ("n4", "n3", "n2", "n1"):
        assert report.levels[lv].is_ready is False


def test_compute_readiness_report_escalates_recommendation() -> None:
    # N5 and N4 fully mastered → recommended_target should be "n4"
    states_by_deck: dict[str, dict] = {}
    for level_key in ("n5", "n4"):
        spec = JLPT_LEVEL_SPECS[level_key]
        for deck_name in (spec.vocab_deck, spec.kanji_deck):
            states_by_deck[deck_name] = {i: _mastered_state(i) for i in range(5)}
    report = compute_readiness_report(states_by_deck)  # type: ignore[arg-type]
    assert report.recommended_target == "n4"


def test_level_order_is_n5_to_n1() -> None:
    assert LEVEL_ORDER == ("n5", "n4", "n3", "n2", "n1")


def test_level_specs_have_correct_pass_marks() -> None:
    assert JLPT_LEVEL_SPECS["n5"].pass_mark == 80
    assert JLPT_LEVEL_SPECS["n4"].pass_mark == 90
    assert JLPT_LEVEL_SPECS["n3"].pass_mark == 95
    assert JLPT_LEVEL_SPECS["n2"].pass_mark == 90
    assert JLPT_LEVEL_SPECS["n1"].pass_mark == 100


def test_level_specs_n4_n5_use_combined_section() -> None:
    for lv in ("n4", "n5"):
        assert JLPT_LEVEL_SPECS[lv].vocab_grammar_section_max == 120
        assert JLPT_LEVEL_SPECS[lv].vocab_grammar_pass_mark == 38


def test_level_specs_n1_n2_n3_use_separate_sections() -> None:
    for lv in ("n1", "n2", "n3"):
        assert JLPT_LEVEL_SPECS[lv].vocab_grammar_section_max == 60
        assert JLPT_LEVEL_SPECS[lv].vocab_grammar_pass_mark == 19
