"""SQLite persistence for local learner card annotations."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import unicodedata
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone

from data import database
from data.text_normalization import (
    contains_japanese_script,
    normalize_japanese_text,
    normalize_storage_text,
)


MAX_NOTE_LENGTH = 2000
MAX_NOTE_KEY_LENGTH = 192
MAX_JMDICT_SOURCE_ID_LENGTH = 128

_BUILTIN_NOTE_KEY_PATTERN = re.compile(r"note:v1:builtin:[0-9a-f]{64}")
_OFFLINE_JMDICT_NOTE_KEY_PREFIX = "note:v1:offline_dictionary:jmdict:"
_JMDICT_SOURCE_ID_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_OFFLINE_FALLBACK_NOTE_KEY_PATTERN = re.compile(
    r"note:v1:offline_dictionary:fallback:[0-9a-f]{64}"
)


@dataclass(frozen=True)
class CardNoteRecord:
    """One persisted personal annotation for a stable note subject."""

    note_key: str
    note_text: str
    created_at_utc: str
    updated_at_utc: str


def validate_note_key(value: str) -> str:
    """Return a supported opaque v1 note key or raise ``ValueError``."""
    if not isinstance(value, str):
        raise ValueError("note_key must be a string")
    if len(value) > MAX_NOTE_KEY_LENGTH:
        raise ValueError(f"note_key must be at most {MAX_NOTE_KEY_LENGTH} characters")
    if _BUILTIN_NOTE_KEY_PATTERN.fullmatch(value):
        return value
    if _OFFLINE_FALLBACK_NOTE_KEY_PATTERN.fullmatch(value):
        return value
    if value.startswith(_OFFLINE_JMDICT_NOTE_KEY_PREFIX):
        try:
            validate_jmdict_source_id(
                value.removeprefix(_OFFLINE_JMDICT_NOTE_KEY_PREFIX)
            )
        except ValueError as exc:
            raise ValueError("note_key must be a supported opaque v1 note key") from exc
        return value
    raise ValueError("note_key must be a supported opaque v1 note key")


def validate_jmdict_source_id(value: str) -> str:
    """Return a canonical JMdict source ID or raise ``ValueError``.

    Downloaded JMdict entry sequence IDs are decimal strings. Test indexes use
    lowercase ASCII words joined by hyphens, so the bridge accepts precisely
    that shared canonical vocabulary and no path, whitespace, or control chars.
    """
    if not isinstance(value, str):
        raise ValueError("source_id must be a string")
    if not 1 <= len(value) <= MAX_JMDICT_SOURCE_ID_LENGTH:
        raise ValueError(
            f"source_id must be between 1 and {MAX_JMDICT_SOURCE_ID_LENGTH} characters"
        )
    if not _JMDICT_SOURCE_ID_PATTERN.fullmatch(value):
        raise ValueError("source_id must use canonical lowercase letters, digits, and hyphens")
    return value


def _normalize_note_identity_part(value: str, *, japanese: bool) -> str:
    """Return one canonical identity component with Unicode whitespace collapsed."""
    if not isinstance(value, str):
        raise ValueError("Note identity values must be strings")
    normalized = (
        normalize_japanese_text(value) if japanese else normalize_storage_text(value)
    )
    return " ".join(normalized.split()).casefold()


def _note_identity_digest(source_kind: str, character: str, reading: str) -> str:
    normalized_character = _normalize_note_identity_part(character, japanese=True)
    if not normalized_character:
        raise ValueError("Note identity written form must not be empty")
    normalized_reading = _normalize_note_identity_part(
        reading,
        japanese=contains_japanese_script(reading),
    )
    canonical = json.dumps(
        [1, source_kind, normalized_character, normalized_reading],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_builtin_note_key(character: str, reading: str) -> str:
    """Build a deck-independent learning-item note identity."""
    digest = _note_identity_digest("builtin", character, reading)
    return validate_note_key(f"note:v1:builtin:{digest}")


def canonical_jmdict_source_id(source_id: str | None) -> str | None:
    if source_id is None:
        return None
    if not isinstance(source_id, str):
        raise ValueError("source_id must be a string or null")
    normalized = normalize_storage_text(source_id).casefold()
    if not normalized:
        return None
    return validate_jmdict_source_id(normalized)


def build_offline_note_key(
    source_id: str | None,
    character: str,
    reading: str,
) -> str:
    """Build a source-backed key, falling back only for a missing source ID."""
    canonical_source_id = canonical_jmdict_source_id(source_id)
    if canonical_source_id is not None:
        return validate_note_key(
            f"note:v1:offline_dictionary:jmdict:{canonical_source_id}"
        )
    digest = _note_identity_digest("offline_dictionary_fallback", character, reading)
    return validate_note_key(f"note:v1:offline_dictionary:fallback:{digest}")


def normalize_note_text(value: str) -> str:
    """Normalize note text while preserving intentional internal formatting."""
    if not isinstance(value, str):
        raise ValueError("note_text must be a string")

    normalized = unicodedata.normalize(
        "NFC",
        value.replace("\r\n", "\n").replace("\r", "\n"),
    ).strip()
    if not normalized:
        raise ValueError("note_text must not be empty")
    if len(normalized) > MAX_NOTE_LENGTH:
        raise ValueError(f"note_text must be at most {MAX_NOTE_LENGTH} characters")
    return normalized


class CardNotesRepository:
    """Read and write local card notes in the active ``jplearn.db`` database."""

    def __init__(self) -> None:
        database.init_db()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        with database._connect() as conn:
            yield conn

    def load(self, note_key: str) -> CardNoteRecord | None:
        """Return the note stored for ``note_key``, if one exists."""
        validated_key = validate_note_key(note_key)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT note_key, note_text, created_at_utc, updated_at_utc
                FROM card_notes
                WHERE note_key = ?
                """,
                (validated_key,),
            ).fetchone()
        return _record_from_row(row) if row is not None else None

    def save(
        self,
        note_key: str,
        note_text: str,
        *,
        now_utc: datetime | None = None,
    ) -> CardNoteRecord:
        """Create or update a note while retaining its original creation time."""
        validated_key = validate_note_key(note_key)
        normalized_text = normalize_note_text(note_text)
        timestamp = _normalize_utc_timestamp(now_utc)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO card_notes (note_key, note_text, created_at_utc, updated_at_utc)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(note_key) DO UPDATE SET
                    note_text = excluded.note_text,
                    updated_at_utc = excluded.updated_at_utc
                """,
                (validated_key, normalized_text, timestamp, timestamp),
            )
            row = conn.execute(
                """
                SELECT note_key, note_text, created_at_utc, updated_at_utc
                FROM card_notes
                WHERE note_key = ?
                """,
                (validated_key,),
            ).fetchone()

        if row is None:  # pragma: no cover - SQLite upsert invariant
            raise RuntimeError("Saved card note could not be reloaded")
        return _record_from_row(row)

    def delete(self, note_key: str) -> bool:
        """Delete a note and return whether a persisted row was removed."""
        validated_key = validate_note_key(note_key)
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM card_notes WHERE note_key = ?",
                (validated_key,),
            )
        return cursor.rowcount > 0


def _record_from_row(row: sqlite3.Row) -> CardNoteRecord:
    return CardNoteRecord(
        note_key=str(row["note_key"]),
        note_text=str(row["note_text"]),
        created_at_utc=str(row["created_at_utc"]),
        updated_at_utc=str(row["updated_at_utc"]),
    )


def _normalize_utc_timestamp(now_utc: datetime | None) -> str:
    timestamp = now_utc or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    return timestamp.astimezone(timezone.utc).isoformat()
