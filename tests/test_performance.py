"""Performance regression tests for large dataset operations.

Validates that key queries remain within acceptable time bounds when the
database has 10 000 review events and 500 review states.  Thresholds are
defined as module-level constants so they can be tuned without changing test
logic.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest

from data import database
from data.deck_portability import (
    export_accuracy_trends_csv,
    export_mastery_snapshot_csv,
    export_review_history_csv,
)
from data.study_pipeline import load_activity_summary, load_item_history, load_review_states

# ---------------------------------------------------------------------------
# Dataset size
# ---------------------------------------------------------------------------
REVIEW_EVENT_COUNT = 10_000
REVIEW_STATE_COUNT = 500

# ---------------------------------------------------------------------------
# Acceptable time bounds (seconds)
# ---------------------------------------------------------------------------
THRESHOLD_ACTIVITY_SUMMARY_S = 1.0
THRESHOLD_ITEM_HISTORY_S = 2.0
THRESHOLD_LOAD_STATES_S = 0.5
THRESHOLD_CSV_REVIEW_HISTORY_S = 2.0
THRESHOLD_CSV_ACCURACY_TRENDS_S = 1.0
THRESHOLD_CSV_MASTERY_SNAPSHOT_S = 0.5


# ---------------------------------------------------------------------------
# Fixture — seed the large dataset via direct SQLite bulk insert
# ---------------------------------------------------------------------------
_DECKS = ["hiragana", "katakana", "vocab_n5"]


@pytest.fixture()
def large_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch DB_PATH to a temp file and bulk-insert the large dataset."""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-perf.db")
    database.init_db()

    conn = sqlite3.connect(str(database.DB_PATH))
    try:
        conn.executemany(
            """INSERT OR REPLACE INTO review_states
               (deck, card_id, ease_factor, interval, repetitions, next_review)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [
                (_DECKS[i % len(_DECKS)], i, 2.5, max(1, (i * 7) % 45), i % 10, "2026-07-01")
                for i in range(REVIEW_STATE_COUNT)
            ],
        )
        conn.executemany(
            """INSERT INTO review_events
               (deck, card_id, quality, reviewed_on, reviewed_at_utc,
                script_tag, prompt_text, tags_csv, session_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    _DECKS[i % len(_DECKS)],
                    i % 100,
                    (i % 5) + 1,
                    f"2026-{(i % 6) + 1:02d}-{(i % 28) + 1:02d}",
                    f"2026-{(i % 6) + 1:02d}-{(i % 28) + 1:02d}T{(i % 24):02d}:00:00+00:00",
                    _DECKS[i % len(_DECKS)],
                    f"char_{i % 100}",
                    "",
                    f"session_{i % 100}",
                )
                for i in range(REVIEW_EVENT_COUNT)
            ],
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_load_review_states_within_threshold(large_db: None) -> None:
    """Loading 500 review states for a deck should complete quickly."""
    card_ids = list(range(REVIEW_STATE_COUNT))
    start = time.perf_counter()
    states = load_review_states("hiragana", card_ids)
    elapsed = time.perf_counter() - start

    assert len(states) > 0
    assert elapsed < THRESHOLD_LOAD_STATES_S, (
        f"load_review_states took {elapsed:.3f}s, threshold={THRESHOLD_LOAD_STATES_S}s"
    )


def test_activity_summary_within_threshold(large_db: None) -> None:
    """7-day activity aggregation over 10k events should complete quickly."""
    start = time.perf_counter()
    summary = load_activity_summary(window_days=7)
    elapsed = time.perf_counter() - start

    assert summary.reviewed >= 0
    assert elapsed < THRESHOLD_ACTIVITY_SUMMARY_S, (
        f"load_activity_summary took {elapsed:.3f}s, threshold={THRESHOLD_ACTIVITY_SUMMARY_S}s"
    )


def test_item_history_within_threshold(large_db: None) -> None:
    """Item history aggregation over 10k events should complete quickly."""
    start = time.perf_counter()
    history = load_item_history(limit_items=50, events_per_item=10)
    elapsed = time.perf_counter() - start

    assert isinstance(history, list)
    assert elapsed < THRESHOLD_ITEM_HISTORY_S, (
        f"load_item_history took {elapsed:.3f}s, threshold={THRESHOLD_ITEM_HISTORY_S}s"
    )


def test_csv_review_history_within_threshold(large_db: None) -> None:
    """Review history CSV export over 10k rows should complete quickly."""
    start = time.perf_counter()
    csv_output = export_review_history_csv()
    elapsed = time.perf_counter() - start

    lines = csv_output.strip().splitlines()
    assert len(lines) == REVIEW_EVENT_COUNT + 1  # header + data rows
    assert elapsed < THRESHOLD_CSV_REVIEW_HISTORY_S, (
        f"export_review_history_csv took {elapsed:.3f}s, threshold={THRESHOLD_CSV_REVIEW_HISTORY_S}s"
    )


def test_csv_accuracy_trends_within_threshold(large_db: None) -> None:
    """Accuracy trends CSV aggregation over 10k rows should complete quickly."""
    start = time.perf_counter()
    csv_output = export_accuracy_trends_csv()
    elapsed = time.perf_counter() - start

    assert len(csv_output) > 0
    assert elapsed < THRESHOLD_CSV_ACCURACY_TRENDS_S, (
        f"export_accuracy_trends_csv took {elapsed:.3f}s, threshold={THRESHOLD_CSV_ACCURACY_TRENDS_S}s"
    )


def test_csv_mastery_snapshot_within_threshold(large_db: None) -> None:
    """Mastery snapshot CSV export over 500 states should complete quickly."""
    start = time.perf_counter()
    csv_output = export_mastery_snapshot_csv()
    elapsed = time.perf_counter() - start

    lines = csv_output.strip().splitlines()
    assert len(lines) == REVIEW_STATE_COUNT + 1  # header + data rows
    assert elapsed < THRESHOLD_CSV_MASTERY_SNAPSHOT_S, (
        f"export_mastery_snapshot_csv took {elapsed:.3f}s, threshold={THRESHOLD_CSV_MASTERY_SNAPSHOT_S}s"
    )
