"""The merge import never moves a card backwards (audit 10: F2, F4, F6 and the design critic's
M5, S2-S5). Every test runs on the per-test database from conftest."""

from __future__ import annotations

import copy
import sqlite3
from datetime import date
from typing import Any

import pytest

from data import database, db_backups
from data import deck_portability
from data.deck_portability import export_progress_snapshot, import_progress_snapshot, inspect_progress_snapshot
from domain.scheduler import ReviewState


@pytest.fixture(autouse=True)
def _schema() -> None:
    database.init_db()


def _snapshot(**progress: list[dict[str, Any]]) -> dict[str, Any]:
    base: dict[str, Any] = {
        "review_states": [],
        "review_events": [],
        "curriculum_stages": [],
        "leech_items": [],
        "session_goals": [],
    }
    base.update(progress)
    return {"format_version": 2, "exported_at_utc": "2026-07-01T00:00:00+00:00", "progress": base, "custom_decks": []}


def _state(**fields: Any) -> dict[str, Any]:
    row = {
        "deck": "Hiragana",
        "card_id": 1,
        "ease_factor": 2.5,
        "interval": 2,
        "repetitions": 1,
        "next_review": "2026-07-03",
        "stability": 3.0,
        "difficulty": 5.0,
        "last_review": "2026-07-01",
    }
    row.update(fields)
    return row


def _rows(sql: str, *args: object) -> list[tuple[Any, ...]]:
    conn = sqlite3.connect(database.DB_PATH)
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def _run(sql: str, *args: object) -> None:
    conn = sqlite3.connect(database.DB_PATH)
    try:
        conn.execute(sql, args)
        conn.commit()
    finally:
        conn.close()


def _seed_card(repetitions: int, interval: int, stability: float, *, deck: str = "Hiragana", card_id: int = 1) -> None:
    database.save_state(
        deck,
        ReviewState(
            card_id=card_id,
            repetitions=repetitions,
            interval=interval,
            next_review=date(2026, 11, 20),
            stability=stability,
            difficulty=4.0,
            last_review=date(2026, 10, 21),
        ),
    )


def _schedule(deck: str = "Hiragana", card_id: int = 1) -> tuple[Any, ...]:
    return _rows(
        "SELECT repetitions, interval, stability, difficulty, last_review FROM review_states WHERE deck = ? AND card_id = ?",
        deck,
        card_id,
    )[0]


def test_an_older_backup_does_not_roll_a_card_back() -> None:
    _seed_card(repetitions=5, interval=30, stability=20.0)

    result = import_progress_snapshot(_snapshot(review_states=[_state()]))

    assert _schedule() == (5, 30, 20.0, 4.0, "2026-10-21")
    assert result.cards_updated == 0 and result.cards_kept_current == 1


def test_a_further_along_backup_wins() -> None:
    _seed_card(repetitions=1, interval=2, stability=3.0)

    result = import_progress_snapshot(_snapshot(review_states=[_state(repetitions=6, interval=40, stability=30.0)]))

    assert _schedule()[:3] == (6, 40, 30.0)
    assert result.cards_updated == 1


def test_a_tie_keeps_the_learners_copy() -> None:
    _seed_card(repetitions=3, interval=10, stability=9.0)

    import_progress_snapshot(_snapshot(review_states=[_state(repetitions=3, interval=10, stability=1.0)]))

    assert _schedule()[2] == 9.0


@pytest.mark.parametrize("missing", [{"stability": None}, {"stability": 0.0}, {}])
def test_a_winning_row_with_no_stability_keeps_the_current_one(missing: dict[str, Any]) -> None:
    _seed_card(repetitions=1, interval=2, stability=3.5)
    row = _state(repetitions=4, interval=8)
    row.pop("stability")
    row.pop("difficulty")
    row.update(missing)

    import_progress_snapshot(_snapshot(review_states=[row]))

    repetitions, interval, stability, difficulty, _last = _schedule()
    assert (repetitions, interval, stability, difficulty) == (4, 8, 3.5, 4.0)


@pytest.mark.parametrize(
    ("field", "value"),
    [("next_review", "2026-07-05T00:00:00"), ("next_review", None), ("next_review", "2026-13-01"), ("card_id", -1), ("interval", "8")],
)
def test_a_damaged_row_refuses_the_file_before_anything_is_written(field: str, value: object) -> None:
    _seed_card(repetitions=1, interval=2, stability=3.0)
    before = export_progress_snapshot()["progress"]

    with pytest.raises(ValueError, match="damaged file: review_states row 2"):
        import_progress_snapshot(_snapshot(review_states=[_state(card_id=5), _state(**{field: value})]))

    assert export_progress_snapshot()["progress"] == before
    assert db_backups.safety_copies(database.DB_PATH.parent / "backups") == []


def test_old_reviews_with_an_empty_time_are_accepted() -> None:
    event = {
        "deck": "Hiragana",
        "card_id": 1,
        "quality": 4,
        "reviewed_on": "2026-06-20",
        "reviewed_at_utc": "",
        "script_tag": "hiragana",
        "curriculum_stage": None,
        "prompt_text": "あ",
        "tags_csv": "",
        "session_id": "",
        "confidence_score": None,
    }

    result = import_progress_snapshot(_snapshot(review_events=[event]))

    assert result.reviews_added == 1


def test_a_topic_deck_row_from_before_78_lands_on_its_parent_card() -> None:
    _seed_card(repetitions=1, interval=2, stability=6.0, deck="Vocabulary N5", card_id=720)
    row = _state(deck="Vocabulary: Greetings", card_id=1000, repetitions=4, interval=9)
    row.pop("stability")  # a format-1 era file

    result = import_progress_snapshot(_snapshot(review_states=[row]))

    assert result.topic_rows_moved == 1
    assert _schedule("Vocabulary N5", 720)[:3] == (4, 9, 6.0)
    assert _rows("SELECT COUNT(*) FROM review_states WHERE deck = 'Vocabulary: Greetings'") == [(0,)]


def _leech(deck: str, card_id: int, active: int, evaluated: str) -> dict[str, Any]:
    return {
        "deck": deck,
        "card_id": card_id,
        "is_active": active,
        "attempts_recent": 6,
        "failures_recent": 4 if active else 0,
        "last_evaluated_utc": evaluated,
    }


def _seed_leech(card_id: int, active: int, evaluated: str) -> None:
    _run(
        "INSERT INTO leech_items (deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc) VALUES (?, ?, ?, 6, 0, ?)",
        "Hiragana",
        card_id,
        active,
        evaluated,
    )


def test_a_problem_card_record_follows_the_schedule_that_won() -> None:
    # Card 1: the learner is further along and has cleared the card; an old file says it was a problem.
    _seed_card(repetitions=5, interval=30, stability=20.0, card_id=1)
    _seed_leech(1, 0, "2026-10-21T00:00:00+00:00")
    # Card 2: the file is further along and flags the card.
    _seed_card(repetitions=1, interval=2, stability=3.0, card_id=2)
    _seed_leech(2, 0, "2026-10-21T00:00:00+00:00")

    import_progress_snapshot(
        _snapshot(
            review_states=[_state(card_id=1), _state(card_id=2, repetitions=6, interval=40)],
            leech_items=[_leech("Hiragana", 1, 1, "2026-07-01T00:00:00+00:00"), _leech("Hiragana", 2, 1, "2026-07-01T00:00:00+00:00")],
        )
    )

    active = dict(_rows("SELECT card_id, is_active FROM leech_items WHERE deck = 'Hiragana'"))
    assert active == {1: 0, 2: 1}


def test_with_no_schedule_either_side_the_later_evaluation_wins() -> None:
    _seed_leech(3, 1, "2026-10-21T00:00:00+00:00")
    _seed_leech(4, 1, "2026-06-01T00:00:00+00:00")

    import_progress_snapshot(
        _snapshot(
            leech_items=[
                _leech("Hiragana", 3, 0, "2026-07-01T00:00:00+00:00"),
                _leech("Hiragana", 4, 0, "2026-07-01T00:00:00+00:00"),
            ]
        )
    )

    active = dict(_rows("SELECT card_id, is_active FROM leech_items WHERE deck = 'Hiragana'"))
    assert active == {3: 1, 4: 0}


def test_stages_and_counters_keep_the_higher() -> None:
    database.init_db()
    _run("INSERT INTO curriculum_stages (deck, card_id, mode, stage, updated_at_utc) VALUES ('Hiragana', 1, 'recognition', 3, '')")
    _run("INSERT INTO card_mastery_scores (deck, card_id, score) VALUES ('hiragana', 1, 3)")
    _run("INSERT INTO card_mastery_scores (deck, card_id, score) VALUES ('hiragana', 2, 1)")
    snapshot = _snapshot(
        curriculum_stages=[{"deck": "Hiragana", "card_id": 1, "mode": "recognition", "stage": 1, "updated_at_utc": ""}],
        card_mastery_scores=[
            {"deck_slug": "hiragana", "card_id": 1, "score": 1},
            {"deck_slug": "hiragana", "card_id": 2, "score": 4},
        ],
    )

    result = import_progress_snapshot(snapshot)

    assert _rows("SELECT stage FROM curriculum_stages") == [(3,)]
    assert dict(_rows("SELECT card_id, score FROM card_mastery_scores")) == {1: 3, 2: 4}
    assert result.counters_updated == 1 and result.stages_updated == 0


def test_a_safety_copy_is_taken_first_and_holds_the_old_data() -> None:
    _seed_card(repetitions=1, interval=2, stability=3.0)

    result = import_progress_snapshot(_snapshot(review_states=[_state(repetitions=6, interval=40)]))

    assert result.safety_copy is not None and "before-import" in result.safety_copy
    conn = sqlite3.connect(result.safety_copy)
    assert conn.execute("SELECT repetitions FROM review_states WHERE card_id = 1").fetchone() == (1,)
    conn.close()


def test_no_safety_copy_no_import(monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_card(repetitions=1, interval=2, stability=3.0)

    def full_disk(*_args: object, **_kwargs: object) -> None:
        raise OSError("No space left on device")

    monkeypatch.setattr(db_backups, "make_safety_copy", full_disk)
    with pytest.raises(OSError):
        import_progress_snapshot(_snapshot(review_states=[_state(repetitions=6, interval=40)]))

    assert _schedule()[:2] == (1, 2)


def test_re_importing_your_own_export_changes_nothing() -> None:
    _seed_card(repetitions=3, interval=12, stability=8.0)
    database.log_review("Hiragana", 1, 4, reviewed_on=date(2026, 10, 1), reviewed_at_utc="2026-10-01T09:00:00+00:00", script_tag="hiragana", prompt_text="あ")
    exported = export_progress_snapshot()

    result = import_progress_snapshot(copy.deepcopy(exported))

    assert (result.cards_updated, result.reviews_added, result.counters_updated) == (0, 0, 0)
    after = export_progress_snapshot()
    assert after["progress"] == exported["progress"]


def test_a_newer_format_is_refused_by_name() -> None:
    snapshot = _snapshot()
    snapshot["format_version"] = deck_portability.FORMAT_VERSION + 1
    with pytest.raises(ValueError, match="newer format"):
        import_progress_snapshot(snapshot)
    with pytest.raises(ValueError, match="newer format"):
        inspect_progress_snapshot(snapshot)


def test_inspect_summarises_without_writing() -> None:
    summary = inspect_progress_snapshot(_snapshot(review_states=[_state(), _state(card_id=2)]))
    assert (summary.format_version, summary.cards, summary.reviews) == (2, 2, 0)
    assert summary.exported_at_utc == "2026-07-01T00:00:00+00:00"
    with pytest.raises(ValueError, match="not a progress file"):
        inspect_progress_snapshot(["not", "a", "file"])
