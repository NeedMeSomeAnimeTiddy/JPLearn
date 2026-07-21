from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from data import database
from data.scenario_repository import (
    MAX_SRS_FRONT_LENGTH,
    ScenarioRepository,
    validate_id,
    validate_learner_level,
    validate_scenario_id,
    validate_summary_json,
    validate_transcript_json,
)


SESSION_ID = "11111111-1111-1111-1111-111111111111"
TRANSCRIPT_JSON = json.dumps([{"turnIndex": 0, "npcLine": {"ja": "a", "reading": "a", "en": "a"}}])
SUMMARY_JSON = json.dumps({"objectives": [], "corrections": [], "vocabularyPractised": []})


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ScenarioRepository:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-scenario-repo.db")
    return ScenarioRepository()


def _save_session(repository: ScenarioRepository, **overrides: Any) -> None:
    defaults: dict[str, Any] = dict(
        session_id=SESSION_ID,
        scenario_id="cafe-order",
        scenario_version=1,
        learner_level="beginner",
        started_at_utc="2026-07-21T00:00:00+00:00",
        transcript_json=TRANSCRIPT_JSON,
        summary_json=SUMMARY_JSON,
        now_utc=datetime(2026, 7, 21, 0, 5, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    repository.save_session(**defaults)


@pytest.mark.parametrize("value", ("abc", "11111111-1111-1111-1111-111111111111", "srs-coffee"))
def test_validate_id_accepts_opaque_identifiers(value: str) -> None:
    assert validate_id(value) == value


@pytest.mark.parametrize("value", ("", "has space", "a" * 65, "has/slash", "under_score"))
def test_validate_id_rejects_invalid_values(value: str) -> None:
    with pytest.raises(ValueError):
        validate_id(value)


def test_validate_scenario_id_accepts_canonical_ids() -> None:
    assert validate_scenario_id("cafe-order") == "cafe-order"
    assert validate_scenario_id("shinjuku-directions") == "shinjuku-directions"


@pytest.mark.parametrize("value", ("", "Cafe-Order", "cafe_order", "a" * 200))
def test_validate_scenario_id_rejects_invalid_values(value: str) -> None:
    with pytest.raises(ValueError):
        validate_scenario_id(value)


def test_validate_learner_level_accepts_only_known_levels() -> None:
    assert validate_learner_level("beginner") == "beginner"
    assert validate_learner_level("intermediate") == "intermediate"
    with pytest.raises(ValueError):
        validate_learner_level("expert")


def test_validate_transcript_and_summary_json_require_valid_json() -> None:
    assert validate_transcript_json(TRANSCRIPT_JSON) == TRANSCRIPT_JSON
    assert validate_summary_json(SUMMARY_JSON) == SUMMARY_JSON
    with pytest.raises(ValueError):
        validate_transcript_json("not json")
    with pytest.raises(ValueError):
        validate_summary_json("")


def test_save_and_get_session_round_trips(repository: ScenarioRepository) -> None:
    _save_session(repository)
    loaded = repository.get_session(SESSION_ID)

    assert loaded is not None
    assert loaded.id == SESSION_ID
    assert loaded.scenario_id == "cafe-order"
    assert loaded.scenario_version == 1
    assert loaded.learner_level == "beginner"
    assert loaded.transcript_json == TRANSCRIPT_JSON
    assert loaded.summary_json == SUMMARY_JSON
    assert loaded.completed_at_utc == "2026-07-21T00:05:00+00:00"


def test_save_session_is_idempotent_by_id(repository: ScenarioRepository) -> None:
    _save_session(repository)
    # A second save with the same id and different content does not overwrite —
    # a completed session's content never legitimately changes after the fact.
    _save_session(repository, summary_json=json.dumps({"objectives": [], "corrections": [], "vocabularyPractised": ["different"]}))

    loaded = repository.get_session(SESSION_ID)
    assert loaded is not None
    assert loaded.summary_json == SUMMARY_JSON


def test_list_sessions_orders_most_recently_completed_first(repository: ScenarioRepository) -> None:
    _save_session(
        repository,
        session_id="11111111-1111-1111-1111-111111111111",
        now_utc=datetime(2026, 7, 20, 0, 0, tzinfo=timezone.utc),
    )
    _save_session(
        repository,
        session_id="22222222-2222-2222-2222-222222222222",
        now_utc=datetime(2026, 7, 21, 0, 0, tzinfo=timezone.utc),
    )

    sessions = repository.list_sessions()
    assert [s.id for s in sessions] == [
        "22222222-2222-2222-2222-222222222222",
        "11111111-1111-1111-1111-111111111111",
    ]


def test_delete_session_removes_it_and_its_srs_cards(repository: ScenarioRepository) -> None:
    _save_session(repository)
    repository.save_srs_card(
        card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order",
        front="コーヒー", back="coffee",
    )

    assert repository.delete_session(SESSION_ID) is True
    assert repository.delete_session(SESSION_ID) is False
    assert repository.get_session(SESSION_ID) is None
    assert repository.list_srs_cards(SESSION_ID) == []


def test_clear_sessions_removes_everything(repository: ScenarioRepository) -> None:
    _save_session(repository)
    repository.save_srs_card(
        card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order",
        front="コーヒー", back="coffee",
    )

    removed = repository.clear_sessions()

    assert removed == 1
    assert repository.list_sessions() == []
    assert repository.list_srs_cards() == []


def test_save_srs_card_requires_an_existing_session(repository: ScenarioRepository) -> None:
    with pytest.raises(ValueError, match="Unknown scenario session"):
        repository.save_srs_card(
            card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order",
            front="コーヒー", back="coffee",
        )


def test_save_srs_card_normalizes_japanese_text_and_round_trips(repository: ScenarioRepository) -> None:
    _save_session(repository)
    saved = repository.save_srs_card(
        card_id="srs-1",
        session_id=SESSION_ID,
        scenario_id="cafe-order",
        front="コーヒー",
        back="coffee",
        reading="こーひー",
        notes="",
    )

    assert saved.front == "コーヒー"
    assert saved.reading == "こーひー"
    assert saved.notes == ""

    [loaded] = repository.list_srs_cards(SESSION_ID)
    assert loaded == saved


def test_save_srs_card_rejects_empty_front_or_back(repository: ScenarioRepository) -> None:
    _save_session(repository)
    with pytest.raises(ValueError):
        repository.save_srs_card(card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order", front="", back="coffee")
    with pytest.raises(ValueError):
        repository.save_srs_card(card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order", front="x", back="")


def test_save_srs_card_rejects_oversized_front(repository: ScenarioRepository) -> None:
    _save_session(repository)
    with pytest.raises(ValueError):
        repository.save_srs_card(
            card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order",
            front="x" * (MAX_SRS_FRONT_LENGTH + 1), back="coffee",
        )


def test_save_session_rejects_naive_timestamp(repository: ScenarioRepository) -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        repository.save_session(
            session_id=SESSION_ID,
            scenario_id="cafe-order",
            scenario_version=1,
            learner_level="beginner",
            started_at_utc="2026-07-21T00:00:00+00:00",
            transcript_json=TRANSCRIPT_JSON,
            summary_json=SUMMARY_JSON,
            now_utc=datetime(2026, 7, 21, 0, 0),
        )


def test_reset_db_wipes_scenario_sessions_and_srs_cards(repository: ScenarioRepository) -> None:
    _save_session(repository)
    repository.save_srs_card(
        card_id="srs-1", session_id=SESSION_ID, scenario_id="cafe-order",
        front="コーヒー", back="coffee",
    )

    database.reset_db()

    assert repository.list_sessions() == []
    assert repository.list_srs_cards() == []
