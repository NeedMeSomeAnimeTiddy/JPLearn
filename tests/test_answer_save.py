"""Saving one answer: one transaction, a receipt per answer id, and onboarding seeds (audit 1).

F1: a save retried after it already committed must not record the answer twice.
F3: one answer's writes commit together or not at all.
F7: seeding dates the last simulated review the onboarding day, and never touches a card with history.
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pytest

from data import database
from domain.decks import ALL_DECKS
from domain.scheduler import ReviewState, update
from scripts import desktop_bridge

_LEARNER_TABLES = (
    "review_states",
    "review_events",
    "leech_items",
    "streak_state",
    "curriculum_stages",
    "user_xp",
    "card_mastery_scores",
    "user_badges",
    "review_answer_receipts",
)


@pytest.fixture(autouse=True)
def _fresh_mastery_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    # The repository is cached per process; each test has its own database.
    monkeypatch.setattr(desktop_bridge, "_CARD_MASTERY_REPOSITORY", None)


def _snapshot() -> dict[str, list[tuple[Any, ...]]]:
    """Every learner table, read on a connection of its own."""
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        return {
            table: sorted(conn.execute(f"SELECT * FROM {table}").fetchall(), key=repr)
            for table in _LEARNER_TABLES
        }


def _first_card(slug: str = "hiragana") -> int:
    return ALL_DECKS[slug]().cards[0].id


def _answer(at: datetime | None = None, local: date | None = None) -> desktop_bridge.AnswerIdentity:
    at = at or datetime.now(timezone.utc).replace(microsecond=0)
    return desktop_bridge.AnswerIdentity(str(uuid.uuid4()), at, local or at.date())


# --- F3: one transaction ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "target",
    [
        ("data.database", "update_leech_state_for_card"),
        ("data.database", "save_streak_state"),
        ("scripts.desktop_bridge", "_save_user_progress"),
        ("scripts.desktop_bridge", "count_total_reviews"),
        ("scripts.desktop_bridge", "save_answer_receipt"),
    ],
)
def test_failure_partway_leaves_every_table_as_it_was(
    target: tuple[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    card_id = _first_card()
    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match")
    before = _snapshot()

    module = __import__(target[0], fromlist=[target[1]])

    def boom(*_args: object, **_kwargs: object) -> None:
        raise sqlite3.OperationalError("injected failure")

    monkeypatch.setattr(module, target[1], boom)
    with pytest.raises(sqlite3.OperationalError):
        desktop_bridge.record_game_result(
            "hiragana", card_id, True, minigame="meaning_match", answer=_answer()
        )

    assert _snapshot() == before


def test_failure_in_mastery_write_rolls_back_the_schedule(monkeypatch: pytest.MonkeyPatch) -> None:
    card_id = _first_card()
    database.init_db()
    before = _snapshot()
    repository = desktop_bridge._card_mastery_repository()

    def boom(*_args: object, **_kwargs: object) -> int:
        raise sqlite3.OperationalError("injected failure")

    monkeypatch.setattr(repository, "apply_result", boom)
    with pytest.raises(sqlite3.OperationalError):
        desktop_bridge.record_game_result("hiragana", card_id, False, minigame="meaning_match")

    assert _snapshot() == before


def test_write_transaction_refuses_to_nest_and_restores_its_context() -> None:
    database.init_db()
    with database.write_transaction():
        with pytest.raises(RuntimeError):
            with database.write_transaction():
                pass
    with database.shared_connection():
        with pytest.raises(RuntimeError):
            with database.write_transaction():
                pass

    with pytest.raises(ValueError):
        with database.write_transaction():
            raise ValueError("boom")
    assert database._shared_conn.get() is None
    assert database._in_write_txn.get() is False


def test_write_transaction_rolls_back_a_caught_inner_failure_only_if_it_escapes() -> None:
    database.init_db()
    state = ReviewState(card_id=1)
    with pytest.raises(RuntimeError):
        with database.write_transaction():
            database.save_state("Hiragana", state)
            raise RuntimeError("after the write")
    assert _snapshot()["review_states"] == []


# --- F1: receipts ----------------------------------------------------------------------------


def test_same_answer_twice_is_recorded_once_and_replays_the_stored_payload() -> None:
    card_id = _first_card()
    answer = _answer()
    first = desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)
    after_first = _snapshot()
    second = desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)

    assert second == {**first, "replayed": True}
    assert "replayed" not in first
    assert _snapshot() == after_first
    assert len(after_first["review_events"]) == 1


def test_reused_answer_id_for_a_different_answer_is_refused() -> None:
    card_id = _first_card()
    answer = _answer()
    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)
    before = _snapshot()

    with pytest.raises(desktop_bridge.InvalidAnswerError):
        desktop_bridge.record_game_result("hiragana", card_id, False, minigame="meaning_match", answer=answer)
    assert _snapshot() == before


def test_reset_keeps_receipts_so_a_saved_answer_cannot_run_again() -> None:
    card_id = _first_card()
    answer = _answer()
    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)
    database.reset_db()

    replay = desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)

    assert replay["replayed"] is True
    snapshot = _snapshot()
    assert snapshot["review_events"] == []
    assert len(snapshot["review_answer_receipts"]) == 1


def test_a_late_retry_is_logged_on_the_day_the_answer_was_given() -> None:
    card_id = _first_card()
    answered_at = datetime(2026, 10, 24, 23, 50, 7, tzinfo=timezone.utc)
    answer = _answer(answered_at, date(2026, 10, 25))

    desktop_bridge.record_game_result("hiragana", card_id, True, minigame="meaning_match", answer=answer)

    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        reviewed_on, reviewed_at = conn.execute(
            "SELECT reviewed_on, reviewed_at_utc FROM review_events"
        ).fetchone()
        last_review, next_review = conn.execute(
            "SELECT last_review, next_review FROM review_states"
        ).fetchone()
    assert reviewed_on == "2026-10-25"
    assert reviewed_at == "2026-10-24T23:50:07+00:00"
    assert last_review == "2026-10-25"
    assert date.fromisoformat(next_review) > date(2026, 10, 25)


@pytest.mark.parametrize(
    ("argv_tail", "expected_code"),
    [
        (["not-a-uuid", "2026-10-24T23:50:07Z", "2026-10-25"], 3),
        ([str(uuid.uuid4()), "2026-10-24T23:50:07", "2026-10-25"], 3),
        ([str(uuid.uuid4()), "", ""], 3),
        ([str(uuid.uuid4()), "2026-10-24T23:50:07Z", "2026-10-25"], 0),
    ],
)
def test_record_result_command_checks_answer_identity(argv_tail: list[str], expected_code: int) -> None:
    card_id = _first_card()
    code, payload = desktop_bridge._run_command(
        ["record-result", "hiragana", str(card_id), "1", "meaning_match", "", "", "", *argv_tail]
    )
    assert code == expected_code, payload


def test_unknown_card_is_reported_as_never_saveable() -> None:
    code, payload = desktop_bridge._run_command(["record-result", "hiragana", "999999", "1"])
    assert code == 3
    assert "Unknown card id" in str(payload["error"])


def test_receipts_table_arrives_by_migration_on_an_existing_database() -> None:
    database.init_db()
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        conn.execute("DROP TABLE review_answer_receipts")
        conn.execute("UPDATE schema_version SET version = 20 WHERE id = 1")
        conn.commit()
    database.init_db()
    database.init_db()
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        version = conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()[0]
        columns = {row[1] for row in conn.execute("PRAGMA table_info(review_answer_receipts)")}
    assert version == database.LATEST_SCHEMA_VERSION == 21
    assert columns == {"answer_id", "request_fingerprint", "payload_json", "recorded_at_utc"}


# --- F7: onboarding seeds --------------------------------------------------------------------


def test_seed_is_dated_the_onboarding_day_and_due_one_interval_later() -> None:
    today = date(2026, 10, 27)
    state = desktop_bridge._mastered_seed_state(1, today)

    assert state.last_review == today
    assert state.next_review == today + timedelta(days=state.interval)
    assert state.repetitions >= 3 and state.interval >= 21

    on_time = update(state, 4, today=state.next_review)
    backdated = ReviewState(**{**state.__dict__, "last_review": today - timedelta(days=state.interval)})
    inflated = update(backdated, 4, today=state.next_review)
    assert on_time.interval < inflated.interval


def test_seeding_fills_only_cards_without_history() -> None:
    database.init_db()
    deck = ALL_DECKS["hiragana"]()
    reviewed, legacy, events_only, fresh = (card.id for card in deck.cards[:4])

    desktop_bridge.record_game_result("hiragana", reviewed, False, minigame="meaning_match")
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        # A row from before the FSRS columns: real progress, no last-review date.
        conn.execute(
            "INSERT INTO review_states (deck, card_id, ease_factor, interval, repetitions, next_review)"
            " VALUES (?, ?, 2.5, 6, 2, '2026-01-01')",
            (deck.name, legacy),
        )
        # Logged history whose state row is missing.
        conn.execute(
            "INSERT INTO review_events (deck, card_id, quality, reviewed_on, reviewed_at_utc)"
            " VALUES (?, ?, 4, '2026-01-01', '2026-01-01T00:00:00+00:00')",
            (deck.name, events_only),
        )
        conn.commit()
    before = {row[1]: row for row in _snapshot()["review_states"]}

    response = desktop_bridge.apply_expertise_level("jlpt_n5_foundation")
    again = desktop_bridge.apply_expertise_level("jlpt_n5_foundation")

    after = {row[1]: row for row in _snapshot()["review_states"] if row[0] == deck.name}
    assert after[reviewed] == before[reviewed]
    assert after[legacy] == before[legacy]
    assert events_only not in after
    assert after[fresh][8] == date.today().isoformat()
    assert response["seeded_cards"] > 0
    assert again["seeded_cards"] == 0
