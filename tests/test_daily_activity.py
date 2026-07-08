from datetime import date, timedelta
from pathlib import Path

import pytest

from data import database
from data import study_pipeline


def _use_temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    database.init_db()


def test_load_daily_counts_empty_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    counts = study_pipeline.load_daily_counts(30)
    assert counts == []


def test_load_daily_counts_returns_correct_counts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()
    yesterday = today - timedelta(days=1)

    for _ in range(5):
        database.log_review("Hiragana", 1, 4, reviewed_on=today)
    for _ in range(3):
        database.log_review("Hiragana", 2, 3, reviewed_on=yesterday)

    counts = study_pipeline.load_daily_counts(7)

    assert len(counts) == 2
    assert counts[0].date == yesterday.isoformat()
    assert counts[0].count == 3
    assert counts[1].date == today.isoformat()
    assert counts[1].count == 5


def test_load_daily_counts_accuracy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    database.log_review("Hiragana", 1, 4, reviewed_on=today)
    database.log_review("Hiragana", 2, 4, reviewed_on=today)
    database.log_review("Hiragana", 3, 4, reviewed_on=today)
    database.log_review("Hiragana", 4, 1, reviewed_on=today)

    counts = study_pipeline.load_daily_counts(1)

    assert len(counts) == 1
    assert counts[0].count == 4
    assert counts[0].accuracy == 75


def test_load_daily_counts_all_wrong(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    database.log_review("Hiragana", 1, 1, reviewed_on=today)
    database.log_review("Hiragana", 2, 1, reviewed_on=today)

    counts = study_pipeline.load_daily_counts(1)

    assert len(counts) == 1
    assert counts[0].count == 2
    assert counts[0].accuracy == 0


def test_load_daily_counts_respects_days_window(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()
    long_ago = today - timedelta(days=45)

    database.log_review("Hiragana", 1, 4, reviewed_on=long_ago)
    database.log_review("Hiragana", 2, 4, reviewed_on=today)

    counts = study_pipeline.load_daily_counts(30)
    assert len(counts) == 1
    assert counts[0].date == today.isoformat()


def test_load_daily_counts_matches_activity_summary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    today = date.today()

    for i in range(5):
        database.log_review("Hiragana", i + 1, 4 if i < 4 else 1, reviewed_on=today)

    counts = study_pipeline.load_daily_counts(30)
    total_reviews = sum(c.count for c in counts)

    summary = study_pipeline.load_activity_summary(30)
    assert total_reviews == summary.reviewed
