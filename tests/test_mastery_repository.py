"""Tests for per-card mastery counter persistence (issue #66)."""

from datetime import date, timedelta
from pathlib import Path

from data import database
from data.mastery_repository import CardMasteryRepository
from domain.mastery import CARD_MASTERY_MAX
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> CardMasteryRepository:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()
    return CardMasteryRepository()


def test_migration_creates_the_table(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    assert repo.load_all_scores() == {}
    assert not repo.has_any_scores()


def test_correct_answers_accumulate_then_cap(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    scores = [repo.apply_result("vocab_greetings", 7, is_correct=True) for _ in range(6)]
    assert scores == [1, 2, 3, 4, 4, 4]
    assert repo.load_deck_scores("vocab_greetings") == {7: CARD_MASTERY_MAX}


def test_wrong_answer_steps_down_without_going_negative(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.apply_result("vocab_greetings", 7, is_correct=True)
    assert repo.apply_result("vocab_greetings", 7, is_correct=False) == 0
    assert repo.apply_result("vocab_greetings", 7, is_correct=False) == 0


def test_scores_are_isolated_per_deck(tmp_path: Path, monkeypatch) -> None:
    """The point of keying by deck: N5–N1 kanji no longer share one bucket.

    Before #66 every kanji score across N5–N1 lived in ``cardScores.kanji_n5``
    keyed by raw card id, which was correct only because ``domain/decks.py``
    hand-allocates disjoint id ranges (finding A1/A4).
    """
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.set_deck_scores("kanji_numbers_time", {1: 4})
    repo.set_deck_scores("kanji_n4_society_roles", {1: 1})

    assert repo.load_deck_scores("kanji_numbers_time") == {1: 4}
    assert repo.load_deck_scores("kanji_n4_society_roles") == {1: 1}


def test_same_card_id_in_two_decks_does_not_collide(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.apply_result("vocab_greetings", 1, is_correct=True)
    repo.apply_result("vocab_numbers", 1, is_correct=True)
    repo.apply_result("vocab_numbers", 1, is_correct=True)

    assert repo.load_deck_scores("vocab_greetings") == {1: 1}
    assert repo.load_deck_scores("vocab_numbers") == {1: 2}


def test_seeding_stores_scores_without_touching_review_states(tmp_path: Path, monkeypatch) -> None:
    """Onboarding awards a full score with no review behind it.

    This is why the counter is its own table: writing it into ``review_states``
    would fabricate FSRS rows for every card in the deck, which the persistence
    convention forbids.
    """
    repo = _use_temp_db(tmp_path, monkeypatch)
    written = repo.set_deck_scores("hiragana", {cid: CARD_MASTERY_MAX for cid in range(5)})

    assert written == 5
    assert repo.load_deck_scores("hiragana") == {cid: CARD_MASTERY_MAX for cid in range(5)}
    assert database.load_states("Hiragana", [0, 1, 2]) is not None
    with database._connect() as conn:
        persisted = conn.execute("SELECT COUNT(*) AS n FROM review_states").fetchone()["n"]
    assert persisted == 0


def test_seeding_clamps_out_of_range_values(tmp_path: Path, monkeypatch) -> None:
    """Legacy renderer values arrive unvalidated; the CHECK constraint must not trip."""
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.set_deck_scores("hiragana", {1: 99, 2: -4})
    assert repo.load_deck_scores("hiragana") == {1: CARD_MASTERY_MAX, 2: 0}


def test_set_deck_scores_overwrites_existing_rows(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.set_deck_scores("hiragana", {1: 1})
    repo.set_deck_scores("hiragana", {1: 3})
    assert repo.load_deck_scores("hiragana") == {1: 3}


def test_empty_seed_writes_nothing(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    assert repo.set_deck_scores("hiragana", {}) == 0
    assert not repo.has_any_scores()


def test_reset_db_clears_counters_with_review_states(tmp_path: Path, monkeypatch) -> None:
    """The reconciliation that used to be manual (issue #66).

    A reset that cleared scheduling but left the counter behind was exactly the
    drift the issue describes, so this pins them clearing together.
    """
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.set_deck_scores("hiragana", {1: CARD_MASTERY_MAX})
    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=3, interval=21, next_review=date.today() + timedelta(days=21)),
    )
    assert repo.has_any_scores()

    database.reset_db()

    assert repo.load_all_scores() == {}
    with database._connect() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM review_states").fetchone()["n"] == 0


def test_load_all_scores_groups_by_deck(tmp_path: Path, monkeypatch) -> None:
    repo = _use_temp_db(tmp_path, monkeypatch)
    repo.set_deck_scores("hiragana", {1: 2, 2: 3})
    repo.set_deck_scores("vocab_greetings", {5: 1})

    assert repo.load_all_scores() == {"hiragana": {1: 2, 2: 3}, "vocab_greetings": {5: 1}}
