"""SQLite persistence for completed Scenario Conversation Tutor sessions and SRS drafts."""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone

from data import database
from data.text_normalization import normalize_japanese_text


MAX_ID_LENGTH = 64
MAX_SCENARIO_ID_LENGTH = 128
MAX_TRANSCRIPT_JSON_LENGTH = 200_000
MAX_SUMMARY_JSON_LENGTH = 50_000
MAX_SRS_FRONT_LENGTH = 500
MAX_SRS_BACK_LENGTH = 1000
MAX_SRS_READING_LENGTH = 500
MAX_SRS_NOTES_LENGTH = 1000

_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]{0,63}")
_SCENARIO_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
_LEARNER_LEVELS = {"beginner", "intermediate"}


@dataclass(frozen=True)
class ScenarioSessionRecord:
    """One persisted, completed Scenario Practice session."""

    id: str
    scenario_id: str
    scenario_version: int
    learner_level: str
    started_at_utc: str
    completed_at_utc: str
    transcript_json: str
    summary_json: str


@dataclass(frozen=True)
class ScenarioSrsCardRecord:
    """One learner-accepted SRS draft generated from a completed session."""

    id: str
    session_id: str
    scenario_id: str
    front: str
    back: str
    reading: str
    notes: str
    created_at_utc: str


def validate_id(value: str, *, label: str = "id") -> str:
    """Return an opaque alphanumeric/hyphen identifier (e.g. a UUID) or raise."""
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    if len(value) > MAX_ID_LENGTH or not _ID_PATTERN.fullmatch(value):
        raise ValueError(f"{label} must be an opaque identifier of at most {MAX_ID_LENGTH} characters")
    return value


def validate_scenario_id(value: str) -> str:
    """Return a canonical scenario id (lowercase letters, digits, hyphens) or raise."""
    if not isinstance(value, str) or not (1 <= len(value) <= MAX_SCENARIO_ID_LENGTH):
        raise ValueError(f"scenario_id must be between 1 and {MAX_SCENARIO_ID_LENGTH} characters")
    if not _SCENARIO_ID_PATTERN.fullmatch(value):
        raise ValueError("scenario_id must use lowercase letters, digits, and hyphens")
    return value


def validate_learner_level(value: str) -> str:
    """Return a supported learner level or raise ``ValueError``."""
    if value not in _LEARNER_LEVELS:
        raise ValueError(f"learner_level must be one of {sorted(_LEARNER_LEVELS)}")
    return value


def validate_transcript_json(value: str) -> str:
    """Return a validated JSON-encoded transcript string or raise."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("transcript_json must be a non-empty string")
    if len(value) > MAX_TRANSCRIPT_JSON_LENGTH:
        raise ValueError(f"transcript_json must be at most {MAX_TRANSCRIPT_JSON_LENGTH} characters")
    try:
        json.loads(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("transcript_json must be valid JSON") from exc
    return value


def validate_summary_json(value: str) -> str:
    """Return a validated JSON-encoded summary string or raise."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("summary_json must be a non-empty string")
    if len(value) > MAX_SUMMARY_JSON_LENGTH:
        raise ValueError(f"summary_json must be at most {MAX_SUMMARY_JSON_LENGTH} characters")
    try:
        json.loads(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("summary_json must be valid JSON") from exc
    return value


def _normalize_srs_text(value: str, *, label: str, max_length: int, required: bool) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    normalized = normalize_japanese_text(value) if value.strip() else ""
    if required and not normalized:
        raise ValueError(f"{label} must not be empty")
    if len(normalized) > max_length:
        raise ValueError(f"{label} must be at most {max_length} characters")
    return normalized


def _normalize_utc_timestamp(now_utc: datetime | None) -> str:
    timestamp = now_utc or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    return timestamp.astimezone(timezone.utc).isoformat()


class ScenarioRepository:
    """Reads and writes completed Scenario Practice sessions and their SRS drafts.

    Only sessions that reached a successful or authored-cancellation end are
    ever passed here — abandoned/unfinished sessions are never persisted, by
    construction of the caller (the desktop bridge only invokes this after a
    scenario session completes).
    """

    def __init__(self) -> None:
        database.init_db()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        with database._connect() as conn:
            yield conn

    def save_session(
        self,
        *,
        session_id: str,
        scenario_id: str,
        scenario_version: int,
        learner_level: str,
        started_at_utc: str,
        transcript_json: str,
        summary_json: str,
        now_utc: datetime | None = None,
    ) -> ScenarioSessionRecord:
        """Persist a completed session. Idempotent by session id (upsert-free
        insert-or-keep, since a completed session's content never changes)."""
        validated_id = validate_id(session_id, label="session_id")
        validated_scenario_id = validate_scenario_id(scenario_id)
        validated_level = validate_learner_level(learner_level)
        validated_transcript = validate_transcript_json(transcript_json)
        validated_summary = validate_summary_json(summary_json)
        if not isinstance(scenario_version, int) or scenario_version < 1:
            raise ValueError("scenario_version must be a positive integer")
        if not isinstance(started_at_utc, str) or not started_at_utc.strip():
            raise ValueError("started_at_utc must be a non-empty string")
        completed_at = _normalize_utc_timestamp(now_utc)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO scenario_sessions
                    (id, scenario_id, scenario_version, learner_level, status,
                     started_at_utc, completed_at_utc, transcript_json, summary_json)
                VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
                """,
                (
                    validated_id,
                    validated_scenario_id,
                    scenario_version,
                    validated_level,
                    started_at_utc,
                    completed_at,
                    validated_transcript,
                    validated_summary,
                ),
            )
            row = conn.execute(
                """
                SELECT id, scenario_id, scenario_version, learner_level,
                       started_at_utc, completed_at_utc, transcript_json, summary_json
                FROM scenario_sessions WHERE id = ?
                """,
                (validated_id,),
            ).fetchone()
        if row is None:  # pragma: no cover - insert invariant
            raise RuntimeError("Saved scenario session could not be reloaded")
        return _session_from_row(row)

    def list_sessions(self) -> list[ScenarioSessionRecord]:
        """Return all completed sessions, most recently completed first."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, scenario_id, scenario_version, learner_level,
                       started_at_utc, completed_at_utc, transcript_json, summary_json
                FROM scenario_sessions
                ORDER BY completed_at_utc DESC
                """
            ).fetchall()
        return [_session_from_row(row) for row in rows]

    def get_session(self, session_id: str) -> ScenarioSessionRecord | None:
        """Return one completed session by id, if it exists."""
        validated_id = validate_id(session_id, label="session_id")
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, scenario_id, scenario_version, learner_level,
                       started_at_utc, completed_at_utc, transcript_json, summary_json
                FROM scenario_sessions WHERE id = ?
                """,
                (validated_id,),
            ).fetchone()
        return _session_from_row(row) if row is not None else None

    def delete_session(self, session_id: str) -> bool:
        """Delete a session and its SRS drafts; return whether it existed."""
        validated_id = validate_id(session_id, label="session_id")
        with self._connect() as conn:
            conn.execute("DELETE FROM scenario_srs_cards WHERE session_id = ?", (validated_id,))
            cursor = conn.execute("DELETE FROM scenario_sessions WHERE id = ?", (validated_id,))
        return cursor.rowcount > 0

    def clear_sessions(self) -> int:
        """Delete every session and SRS draft; return the number of sessions removed."""
        with self._connect() as conn:
            conn.execute("DELETE FROM scenario_srs_cards")
            cursor = conn.execute("DELETE FROM scenario_sessions")
        return cursor.rowcount

    def save_srs_card(
        self,
        *,
        card_id: str,
        session_id: str,
        scenario_id: str,
        front: str,
        back: str,
        reading: str = "",
        notes: str = "",
        now_utc: datetime | None = None,
    ) -> ScenarioSrsCardRecord:
        """Persist one learner-accepted SRS draft. The session must already
        be persisted — drafts are only ever saved after their session, and
        only for drafts the learner explicitly accepted (never dismissed or
        skipped ones, and never automatically)."""
        validated_card_id = validate_id(card_id, label="card_id")
        validated_session_id = validate_id(session_id, label="session_id")
        validated_scenario_id = validate_scenario_id(scenario_id)
        validated_front = _normalize_srs_text(front, label="front", max_length=MAX_SRS_FRONT_LENGTH, required=True)
        validated_back = _normalize_srs_text(back, label="back", max_length=MAX_SRS_BACK_LENGTH, required=True)
        validated_reading = _normalize_srs_text(reading, label="reading", max_length=MAX_SRS_READING_LENGTH, required=False)
        validated_notes = _normalize_srs_text(notes, label="notes", max_length=MAX_SRS_NOTES_LENGTH, required=False)
        timestamp = _normalize_utc_timestamp(now_utc)

        with self._connect() as conn:
            session_exists = conn.execute(
                "SELECT 1 FROM scenario_sessions WHERE id = ?", (validated_session_id,)
            ).fetchone()
            if session_exists is None:
                raise ValueError(f"Unknown scenario session '{validated_session_id}'")
            conn.execute(
                """
                INSERT INTO scenario_srs_cards
                    (id, session_id, scenario_id, front, back, reading, notes, created_at_utc)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    front = excluded.front,
                    back = excluded.back,
                    reading = excluded.reading,
                    notes = excluded.notes
                """,
                (
                    validated_card_id,
                    validated_session_id,
                    validated_scenario_id,
                    validated_front,
                    validated_back,
                    validated_reading,
                    validated_notes,
                    timestamp,
                ),
            )
            row = conn.execute(
                """
                SELECT id, session_id, scenario_id, front, back, reading, notes, created_at_utc
                FROM scenario_srs_cards WHERE id = ?
                """,
                (validated_card_id,),
            ).fetchone()
        if row is None:  # pragma: no cover - insert invariant
            raise RuntimeError("Saved SRS card could not be reloaded")
        return _srs_card_from_row(row)

    def list_srs_cards(self, session_id: str | None = None) -> list[ScenarioSrsCardRecord]:
        """Return accepted SRS drafts, optionally filtered to one session."""
        with self._connect() as conn:
            if session_id is not None:
                validated_session_id = validate_id(session_id, label="session_id")
                rows = conn.execute(
                    """
                    SELECT id, session_id, scenario_id, front, back, reading, notes, created_at_utc
                    FROM scenario_srs_cards WHERE session_id = ? ORDER BY created_at_utc ASC
                    """,
                    (validated_session_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, session_id, scenario_id, front, back, reading, notes, created_at_utc
                    FROM scenario_srs_cards ORDER BY created_at_utc ASC
                    """
                ).fetchall()
        return [_srs_card_from_row(row) for row in rows]


def _session_from_row(row: sqlite3.Row) -> ScenarioSessionRecord:
    return ScenarioSessionRecord(
        id=str(row["id"]),
        scenario_id=str(row["scenario_id"]),
        scenario_version=int(row["scenario_version"]),
        learner_level=str(row["learner_level"]),
        started_at_utc=str(row["started_at_utc"]),
        completed_at_utc=str(row["completed_at_utc"]),
        transcript_json=str(row["transcript_json"]),
        summary_json=str(row["summary_json"]),
    )


def _srs_card_from_row(row: sqlite3.Row) -> ScenarioSrsCardRecord:
    return ScenarioSrsCardRecord(
        id=str(row["id"]),
        session_id=str(row["session_id"]),
        scenario_id=str(row["scenario_id"]),
        front=str(row["front"]),
        back=str(row["back"]),
        reading=str(row["reading"]),
        notes=str(row["notes"]),
        created_at_utc=str(row["created_at_utc"]),
    )
