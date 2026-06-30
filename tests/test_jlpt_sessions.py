"""Tests for domain/jlpt_sessions.py — verifies deterministic queue output."""
from datetime import date

from domain.cards import Card
from domain.jlpt_sessions import (
    JLPTQuestion,
    build_adaptive_review_queue,
    build_diagnostic_queue,
    build_mock_exam_queue,
    build_weak_area_queue,
    project_mock_score,
)
from domain.scheduler import ReviewState


def _card(card_id: int, meaning: str = "meaning") -> Card:
    return Card(id=card_id, character=f"字{card_id}", romaji=f"ji{card_id}", meaning=meaning)


def _state(card_id: int, interval: int = 1, reps: int = 0, days_overdue: int = 0) -> ReviewState:
    due = date(2024, 1, 1 + max(0, -days_overdue))
    return ReviewState(
        card_id=card_id,
        interval=interval,
        repetitions=reps,
        next_review=due,
    )


VOCAB_N5_CARDS = [_card(i, f"meaning_{i}") for i in range(1, 21)]
KANJI_N5_CARDS = [_card(i, f"kanji_meaning_{i}") for i in range(100, 115)]

SIMPLE_CARDS_BY_DECK = {
    "vocab_n5":  VOCAB_N5_CARDS,
    "kanji_n5":  KANJI_N5_CARDS,
    "vocab_n4":  [_card(i) for i in range(200, 210)],
    "kanji_n4":  [_card(i) for i in range(300, 308)],
    "vocab_n3":  [_card(i) for i in range(400, 410)],
    "kanji_n3":  [_card(i) for i in range(500, 505)],
    "vocab_n2":  [_card(i) for i in range(600, 608)],
    "kanji_n2":  [_card(i) for i in range(700, 705)],
    "vocab_n1":  [_card(i) for i in range(800, 806)],
    "kanji_n1":  [_card(i) for i in range(900, 904)],
}

EMPTY_ACCURACY_MAP: dict[tuple[str, int], float] = {}


# ---------------------------------------------------------------------------
# build_mock_exam_queue
# ---------------------------------------------------------------------------

def test_mock_exam_returns_correct_count() -> None:
    queue = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, EMPTY_ACCURACY_MAP, count=10)
    assert len(queue) == 10


def test_mock_exam_is_deterministic() -> None:
    q1 = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, EMPTY_ACCURACY_MAP, count=10)
    q2 = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, EMPTY_ACCURACY_MAP, count=10)
    assert q1 == q2


def test_mock_exam_all_questions_from_correct_level() -> None:
    queue = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, EMPTY_ACCURACY_MAP, count=30)
    for q in queue:
        assert q.level == "n5"
        assert q.deck in ("vocab_n5", "kanji_n5")


def test_mock_exam_low_accuracy_cards_come_first() -> None:
    accuracy_map = {
        ("vocab_n5", 1): 0.1,   # weakest
        ("vocab_n5", 2): 1.0,   # strongest (will be last among all cards)
    }
    # Retrieve the full queue so card 2 appears
    queue = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, accuracy_map, count=50)
    ids = [q.card_id for q in queue]
    assert 1 in ids and 2 in ids
    assert ids.index(1) < ids.index(2)


def test_mock_exam_respects_count_cap() -> None:
    queue = build_mock_exam_queue("n5", SIMPLE_CARDS_BY_DECK, EMPTY_ACCURACY_MAP, count=100)
    total_n5 = len(VOCAB_N5_CARDS) + len(KANJI_N5_CARDS)
    assert len(queue) <= total_n5


# ---------------------------------------------------------------------------
# build_diagnostic_queue
# ---------------------------------------------------------------------------

def test_diagnostic_returns_20_questions_when_enough_cards() -> None:
    queue = build_diagnostic_queue(SIMPLE_CARDS_BY_DECK, {})
    assert len(queue) == 20


def test_diagnostic_covers_all_5_levels() -> None:
    queue = build_diagnostic_queue(SIMPLE_CARDS_BY_DECK, {})
    levels_seen = {q.level for q in queue}
    assert levels_seen == {"n5", "n4", "n3", "n2", "n1"}


def test_diagnostic_is_deterministic() -> None:
    q1 = build_diagnostic_queue(SIMPLE_CARDS_BY_DECK, {})
    q2 = build_diagnostic_queue(SIMPLE_CARDS_BY_DECK, {})
    assert q1 == q2


def test_diagnostic_unreviewed_cards_come_before_reviewed() -> None:
    states = {"vocab_n5": {5: _state(5)}}   # card 5 is reviewed; cards 1-4 are not
    queue = build_diagnostic_queue(SIMPLE_CARDS_BY_DECK, states)  # type: ignore[arg-type]
    n5_questions = [q for q in queue if q.level == "n5"]
    reviewed_pos = next(
        (i for i, q in enumerate(n5_questions) if q.card_id == 5), None
    )
    unreviewed_pos = next(
        (i for i, q in enumerate(n5_questions) if q.card_id == 1), None
    )
    if reviewed_pos is not None and unreviewed_pos is not None:
        assert unreviewed_pos < reviewed_pos


# ---------------------------------------------------------------------------
# build_adaptive_review_queue
# ---------------------------------------------------------------------------

def test_adaptive_only_includes_due_and_new() -> None:
    today = date(2024, 1, 10)
    states = {
        "vocab_n5": {
            1: ReviewState(card_id=1, interval=5, repetitions=1, next_review=date(2024, 1, 9)),   # overdue
            2: ReviewState(card_id=2, interval=5, repetitions=1, next_review=date(2024, 1, 20)),  # future
        }
    }
    queue = build_adaptive_review_queue("n5", SIMPLE_CARDS_BY_DECK, states, today=today)  # type: ignore[arg-type]
    ids = {q.card_id for q in queue}
    assert 1 in ids      # overdue → included
    assert 2 not in ids  # future → excluded


def test_adaptive_queue_is_deterministic() -> None:
    today = date(2024, 1, 10)
    states: dict = {}
    q1 = build_adaptive_review_queue("n5", SIMPLE_CARDS_BY_DECK, states, today=today)
    q2 = build_adaptive_review_queue("n5", SIMPLE_CARDS_BY_DECK, states, today=today)
    assert q1 == q2


# ---------------------------------------------------------------------------
# build_weak_area_queue
# ---------------------------------------------------------------------------

def test_weak_area_leeches_come_first() -> None:
    leech_ids = {"vocab_n5": {3, 5}}
    queue = build_weak_area_queue("n5", SIMPLE_CARDS_BY_DECK, leech_ids, EMPTY_ACCURACY_MAP, count=10)
    leech_positions = [i for i, q in enumerate(queue) if q.card_id in {3, 5}]
    non_leech_positions = [i for i, q in enumerate(queue) if q.card_id not in {3, 5}]
    if leech_positions and non_leech_positions:
        assert max(leech_positions) < min(non_leech_positions)


def test_weak_area_is_deterministic() -> None:
    leech_ids: dict[str, set] = {}
    q1 = build_weak_area_queue("n5", SIMPLE_CARDS_BY_DECK, leech_ids, EMPTY_ACCURACY_MAP, count=10)
    q2 = build_weak_area_queue("n5", SIMPLE_CARDS_BY_DECK, leech_ids, EMPTY_ACCURACY_MAP, count=10)
    assert q1 == q2


# ---------------------------------------------------------------------------
# project_mock_score
# ---------------------------------------------------------------------------

def test_project_mock_score_n5_perfect() -> None:
    result = project_mock_score("n5", correct=30, total=30)
    assert result.vocab_grammar_projected == 120
    assert result.vocab_grammar_max == 120
    assert result.vocab_grammar_passes is True
    assert result.listening_projected is None
    assert result.overall_passes is False


def test_project_mock_score_n5_below_pass_mark() -> None:
    # Need 38/120. Score 30% = 36 < 38 → fail section
    result = project_mock_score("n5", correct=9, total=30)
    assert result.vocab_grammar_projected == 36
    assert result.vocab_grammar_passes is False


def test_project_mock_score_n1_uses_60_section_max() -> None:
    result = project_mock_score("n1", correct=15, total=30)
    assert result.vocab_grammar_max == 60
    assert result.vocab_grammar_projected == 30


def test_project_mock_score_zero_total() -> None:
    result = project_mock_score("n3", correct=0, total=0)
    assert result.vocab_grammar_projected == 0
    assert result.vocab_grammar_passes is False
