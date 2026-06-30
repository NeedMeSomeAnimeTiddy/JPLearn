"""JLPT readiness computation from SRS mastery data.

All computation is deterministic and derived from review states only.
Official pass marks sourced from jlpt.jp/e/guideline/results.html.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from domain.scheduler import ReviewState

# Mastery thresholds (shared rule from copilot-instructions.md)
_MASTERY_MIN_REPETITIONS = 3
_MASTERY_MIN_INTERVAL = 21

# Readiness threshold: 80% mastery of level's decks = "exam-ready"
READINESS_THRESHOLD_PCT = 80

LEVEL_ORDER: tuple[str, ...] = ("n5", "n4", "n3", "n2", "n1")


@dataclass(frozen=True)
class JLPTLevelSpec:
    """Static specification for one JLPT level.

    Pass marks and section maximums are from official JLPT guidelines.
    N4/N5 combine vocab/grammar with reading into a single 0-120 section.
    N1/N2/N3 score vocab/grammar and reading separately (each 0-60).
    Listening (0-60) is not assessed in this system.
    """

    level: str
    vocab_deck: str
    kanji_deck: str
    pass_mark: int              # total points required to pass (out of 180)
    vocab_grammar_section_max: int   # 120 for N4/N5; 60 for N1/N2/N3
    vocab_grammar_pass_mark: int     # 38 for N4/N5; 19 for N1/N2/N3


JLPT_LEVEL_SPECS: dict[str, JLPTLevelSpec] = {
    "n5": JLPTLevelSpec(
        level="n5",
        vocab_deck="vocab_n5",
        kanji_deck="kanji_n5",
        pass_mark=80,
        vocab_grammar_section_max=120,
        vocab_grammar_pass_mark=38,
    ),
    "n4": JLPTLevelSpec(
        level="n4",
        vocab_deck="vocab_n4",
        kanji_deck="kanji_n4",
        pass_mark=90,
        vocab_grammar_section_max=120,
        vocab_grammar_pass_mark=38,
    ),
    "n3": JLPTLevelSpec(
        level="n3",
        vocab_deck="vocab_n3",
        kanji_deck="kanji_n3",
        pass_mark=95,
        vocab_grammar_section_max=60,
        vocab_grammar_pass_mark=19,
    ),
    "n2": JLPTLevelSpec(
        level="n2",
        vocab_deck="vocab_n2",
        kanji_deck="kanji_n2",
        pass_mark=90,
        vocab_grammar_section_max=60,
        vocab_grammar_pass_mark=19,
    ),
    "n1": JLPTLevelSpec(
        level="n1",
        vocab_deck="vocab_n1",
        kanji_deck="kanji_n1",
        pass_mark=100,
        vocab_grammar_section_max=60,
        vocab_grammar_pass_mark=19,
    ),
}


@dataclass(frozen=True)
class LevelReadiness:
    """Computed readiness for one JLPT level."""

    level: str
    mastered_vocab: int
    total_vocab: int
    mastered_kanji: int
    total_kanji: int
    readiness_pct: int   # 0–100
    is_ready: bool       # readiness_pct >= READINESS_THRESHOLD_PCT


@dataclass(frozen=True)
class JLPTReadinessReport:
    """Readiness report across all five JLPT levels."""

    levels: dict[str, LevelReadiness]
    recommended_target: str   # highest level where is_ready, else "n5"


def _is_mastered(state: ReviewState) -> bool:
    return (
        state.repetitions >= _MASTERY_MIN_REPETITIONS
        and state.interval >= _MASTERY_MIN_INTERVAL
    )


def compute_level_readiness(
    spec: JLPTLevelSpec,
    vocab_states: Sequence[ReviewState],
    kanji_states: Sequence[ReviewState],
) -> LevelReadiness:
    """Compute mastery-based readiness for one level.

    readiness_pct = (mastered_vocab + mastered_kanji) / (total_vocab + total_kanji) * 100
    """
    mastered_vocab = sum(1 for s in vocab_states if _is_mastered(s))
    mastered_kanji = sum(1 for s in kanji_states if _is_mastered(s))
    total = len(vocab_states) + len(kanji_states)
    mastered = mastered_vocab + mastered_kanji
    readiness_pct = int(mastered / total * 100) if total > 0 else 0
    return LevelReadiness(
        level=spec.level,
        mastered_vocab=mastered_vocab,
        total_vocab=len(vocab_states),
        mastered_kanji=mastered_kanji,
        total_kanji=len(kanji_states),
        readiness_pct=readiness_pct,
        is_ready=readiness_pct >= READINESS_THRESHOLD_PCT,
    )


def compute_readiness_report(
    review_states_by_deck: dict[str, dict[int, ReviewState]],
) -> JLPTReadinessReport:
    """Compute the full readiness report across all five JLPT levels.

    Args:
        review_states_by_deck: Mapping of deck_name -> {card_id: ReviewState}.
            Missing decks are treated as having zero reviewed cards.
    """
    levels: dict[str, LevelReadiness] = {}
    for level_key in LEVEL_ORDER:
        spec = JLPT_LEVEL_SPECS[level_key]
        vocab_states = list((review_states_by_deck.get(spec.vocab_deck) or {}).values())
        kanji_states = list((review_states_by_deck.get(spec.kanji_deck) or {}).values())
        levels[level_key] = compute_level_readiness(spec, vocab_states, kanji_states)

    # Recommended: highest level where is_ready, or "n5" as the default starting point
    recommended = "n5"
    for level_key in LEVEL_ORDER:
        if levels[level_key].is_ready:
            recommended = level_key

    return JLPTReadinessReport(levels=levels, recommended_target=recommended)
