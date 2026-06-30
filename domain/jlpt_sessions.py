"""JLPT exam session queue builders and score projection.

All queue builders are deterministic: given the same inputs they always
produce the same ordered output.  No randomness is used anywhere.

Four modes:
  mock_exam        — fixed-length, single-level, weakest cards first
  diagnostic       — 20 questions sampled across all 5 levels
  adaptive_review  — SRS-due cards for one level, earliest due first
  weak_area_drill  — active leeches first, then lowest-accuracy cards
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from domain.cards import Card
from domain.jlpt_readiness import JLPT_LEVEL_SPECS, LEVEL_ORDER
from domain.scheduler import ReviewState

JLPTExamMode = Literal["mock_exam", "diagnostic", "adaptive_review", "weak_area_drill"]

# All exam questions use meaning_match so the UI can reuse the 4-choice pattern.
_EXAM_QUESTION_TYPE = "meaning_match"

# Number of diagnostic questions sampled per level (total = 20)
_DIAGNOSTIC_PER_LEVEL: dict[str, int] = {
    "n5": 5,
    "n4": 4,
    "n3": 4,
    "n2": 4,
    "n1": 3,
}


@dataclass(frozen=True)
class JLPTQuestion:
    """One question in a JLPT exam queue."""

    card_id: int
    deck: str
    question_type: str   # always "meaning_match" for now
    level: str


@dataclass(frozen=True)
class JLPTProjectedScore:
    """Projected score for the vocab/grammar section of a mock exam.

    Listening is not assessed in this system and is always None.
    overall_passes is False because we cannot assess listening.
    """

    level: str
    vocab_grammar_projected: int
    vocab_grammar_max: int
    vocab_grammar_pass_mark: int
    vocab_grammar_passes: bool
    listening_projected: None
    total_pass_mark: int
    overall_passes: bool   # always False — cannot determine without listening


@dataclass(frozen=True)
class JLPTExamResult:
    """Summary of a completed exam session."""

    level: str
    mode: str
    questions_answered: int
    correct: int
    accuracy: float
    projected_score: int | None   # vocab/grammar section; None for non-mock modes
    completed_at: str             # ISO datetime UTC


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _level_deck_cards(
    level: str,
    cards_by_deck: dict[str, list[Card]],
) -> list[tuple[str, Card]]:
    """Return (deck_name, card) pairs for a level's two decks, sorted by card_id."""
    spec = JLPT_LEVEL_SPECS[level]
    result: list[tuple[str, Card]] = []
    for deck_name in (spec.vocab_deck, spec.kanji_deck):
        for card in sorted(cards_by_deck.get(deck_name, []), key=lambda c: c.id):
            result.append((deck_name, card))
    return result


def _accuracy(
    deck: str,
    card_id: int,
    accuracy_map: dict[tuple[str, int], float],
) -> float:
    """Look up per-card accuracy; defaults to 0.5 when no history exists."""
    return accuracy_map.get((deck, card_id), 0.5)


# ---------------------------------------------------------------------------
# Queue builders
# ---------------------------------------------------------------------------


def build_mock_exam_queue(
    level: str,
    cards_by_deck: dict[str, list[Card]],
    accuracy_map: dict[tuple[str, int], float],
    count: int = 30,
) -> list[JLPTQuestion]:
    """Fixed-length, single-level exam. Weakest cards (lowest accuracy) first.

    Sorting by (accuracy ASC, card_id ASC) ensures the output is fully
    deterministic regardless of dict insertion order.
    """
    all_cards = _level_deck_cards(level, cards_by_deck)
    sorted_cards = sorted(
        all_cards,
        key=lambda pair: (_accuracy(pair[0], pair[1].id, accuracy_map), pair[1].id),
    )
    return [
        JLPTQuestion(card_id=card.id, deck=deck, question_type=_EXAM_QUESTION_TYPE, level=level)
        for deck, card in sorted_cards[:count]
    ]


def build_diagnostic_queue(
    cards_by_deck: dict[str, list[Card]],
    review_states_by_deck: dict[str, dict[int, ReviewState]],
) -> list[JLPTQuestion]:
    """20-question cross-level diagnostic. Identifies which level to target.

    Sampling strategy per level:
      - Unreviewed cards (no state in DB) come first — they represent true gaps.
      - Already-reviewed cards come second, sorted by card_id for determinism.
    """
    questions: list[JLPTQuestion] = []
    for level_key in LEVEL_ORDER:
        n = _DIAGNOSTIC_PER_LEVEL[level_key]
        all_cards = _level_deck_cards(level_key, cards_by_deck)

        def _sort_key(pair: tuple[str, Card]) -> tuple[int, int]:
            state_map = review_states_by_deck.get(pair[0]) or {}
            has_state = pair[1].id in state_map
            return (int(has_state), pair[1].id)   # unreviewed (0) before reviewed (1)

        sorted_cards = sorted(all_cards, key=_sort_key)
        for deck, card in sorted_cards[:n]:
            questions.append(
                JLPTQuestion(card_id=card.id, deck=deck, question_type=_EXAM_QUESTION_TYPE, level=level_key)
            )
    return questions


def build_adaptive_review_queue(
    level: str,
    cards_by_deck: dict[str, list[Card]],
    review_states_by_deck: dict[str, dict[int, ReviewState]],
    today: date | None = None,
    count: int = 25,
) -> list[JLPTQuestion]:
    """SRS-due cards for one level. Due cards sorted by next_review ASC, new cards after.

    Time dependency is injected via ``today`` to keep this function pure and testable.
    """
    ref_date = today or date.today()
    all_cards = _level_deck_cards(level, cards_by_deck)

    due_entries: list[tuple[date, int, str, Card]] = []   # (next_review, card_id, deck, card)
    new_entries: list[tuple[str, Card]] = []

    for deck, card in all_cards:
        state = (review_states_by_deck.get(deck) or {}).get(card.id)
        if state is None:
            new_entries.append((deck, card))
        elif state.next_review <= ref_date:
            due_entries.append((state.next_review, card.id, deck, card))

    due_entries.sort(key=lambda e: (e[0].isoformat(), e[1]))
    new_entries.sort(key=lambda pair: pair[1].id)

    combined: list[tuple[str, Card]] = (
        [(deck, card) for _, _, deck, card in due_entries]
        + new_entries
    )
    return [
        JLPTQuestion(card_id=card.id, deck=deck, question_type=_EXAM_QUESTION_TYPE, level=level)
        for deck, card in combined[:count]
    ]


def build_weak_area_queue(
    level: str,
    cards_by_deck: dict[str, list[Card]],
    leech_ids_by_deck: dict[str, set[int]],
    accuracy_map: dict[tuple[str, int], float],
    count: int = 25,
) -> list[JLPTQuestion]:
    """Active leeches first, then lowest-accuracy non-leech cards.

    Within each group, secondary sort by card_id for full determinism.
    """
    all_cards = _level_deck_cards(level, cards_by_deck)
    leech_pairs: list[tuple[str, Card]] = []
    non_leech_pairs: list[tuple[str, Card]] = []

    for deck, card in all_cards:
        if card.id in (leech_ids_by_deck.get(deck) or set()):
            leech_pairs.append((deck, card))
        else:
            non_leech_pairs.append((deck, card))

    leech_pairs.sort(key=lambda pair: pair[1].id)
    non_leech_pairs.sort(
        key=lambda pair: (_accuracy(pair[0], pair[1].id, accuracy_map), pair[1].id)
    )

    combined = leech_pairs + non_leech_pairs
    return [
        JLPTQuestion(card_id=card.id, deck=deck, question_type=_EXAM_QUESTION_TYPE, level=level)
        for deck, card in combined[:count]
    ]


# ---------------------------------------------------------------------------
# Score projection
# ---------------------------------------------------------------------------


def project_mock_score(level: str, correct: int, total: int) -> JLPTProjectedScore:
    """Scale exam accuracy to the JLPT vocab/grammar section score range.

    Listening is never projected because the app has no listening content.
    ``overall_passes`` is always False for the same reason.
    """
    spec = JLPT_LEVEL_SPECS[level]
    accuracy = correct / total if total > 0 else 0.0
    projected = round(accuracy * spec.vocab_grammar_section_max)
    return JLPTProjectedScore(
        level=level,
        vocab_grammar_projected=projected,
        vocab_grammar_max=spec.vocab_grammar_section_max,
        vocab_grammar_pass_mark=spec.vocab_grammar_pass_mark,
        vocab_grammar_passes=projected >= spec.vocab_grammar_pass_mark,
        listening_projected=None,
        total_pass_mark=spec.pass_mark,
        overall_passes=False,
    )
