from datetime import date, timedelta
from pathlib import Path

from data import database
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def test_load_today_progress_with_empty_card_list(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    assert database.load_today_progress("Hiragana", []) == (0, 0)


def test_load_today_progress_counts_due_and_completed(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    # Card 1: already reviewed today, no longer due.
    database.save_state(
        "Hiragana",
        ReviewState(card_id=1, repetitions=1, interval=1, next_review=today + timedelta(days=1)),
    )
    database.log_review("Hiragana", 1, 4, reviewed_on=today)

    # Card 2: still due now and not completed yet today.
    database.save_state(
        "Hiragana",
        ReviewState(card_id=2, repetitions=0, interval=1, next_review=today - timedelta(days=1)),
    )

    due_today, completed_today = database.load_today_progress("Hiragana", [1, 2], on_date=today)
    assert due_today == 2
    assert completed_today == 1


def test_load_today_progress_counts_unique_completed_cards(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    database.save_state(
        "Katakana",
        ReviewState(card_id=10, repetitions=2, interval=6, next_review=today + timedelta(days=6)),
    )
    database.log_review("Katakana", 10, 2, reviewed_on=today)
    database.log_review("Katakana", 10, 4, reviewed_on=today)

    due_today, completed_today = database.load_today_progress("Katakana", [10], on_date=today)
    assert due_today == 1
    assert completed_today == 1
