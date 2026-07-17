from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from data import database
from data.card_notes_repository import (
    MAX_NOTE_LENGTH,
    CardNotesRepository,
    normalize_note_text,
    validate_note_key,
)


BUILTIN_NOTE_KEY = "note:v1:builtin:" + "a" * 64
JMDICT_NOTE_KEY = "note:v1:offline_dictionary:jmdict:1000110"
FALLBACK_NOTE_KEY = "note:v1:offline_dictionary:fallback:" + "b" * 64


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> CardNotesRepository:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-card-notes.db")
    return CardNotesRepository()


@pytest.mark.parametrize(
    "note_key",
    (
        BUILTIN_NOTE_KEY,
        JMDICT_NOTE_KEY,
        "note:v1:offline_dictionary:jmdict:test-entry-1",
        FALLBACK_NOTE_KEY,
    ),
)
def test_validate_note_key_accepts_all_v1_formats(note_key: str) -> None:
    assert validate_note_key(note_key) == note_key


@pytest.mark.parametrize(
    "note_key",
    (
        "note:v1:builtin:" + "A" * 64,
        "note:v1:offline_dictionary:jmdict:",
        "note:v1:offline_dictionary:jmdict:Test-Entry",
        "note:v1:offline_dictionary:jmdict:test--entry",
        "note:v1:offline_dictionary:jmdict:-test-entry",
        "note:v1:offline_dictionary:jmdict:source/id",
        "note:v1:offline_dictionary:jmdict:source id",
        "note:v1:offline_dictionary:jmdict:source.id",
        "note:v1:offline_dictionary:jmdict:source_id",
        "note:v1:offline_dictionary:fallback:" + "B" * 64,
        "note:v2:builtin:" + "a" * 64,
        "not-a-note-key",
    ),
)
def test_validate_note_key_rejects_invalid_values(note_key: str) -> None:
    with pytest.raises(ValueError, match="supported opaque v1 note key"):
        validate_note_key(note_key)


def test_normalize_note_text_uses_nfc_and_lf_without_rewriting_punctuation() -> None:
    normalized = normalize_note_text("  メモ\r\ncafe\u0301 — keep.\rsecond line  ")

    assert normalized == "メモ\ncafé — keep.\nsecond line"


@pytest.mark.parametrize(
    "note_text",
    (
        "\n\t  ",
        "🙂" * (MAX_NOTE_LENGTH + 1),
    ),
)
def test_normalize_note_text_rejects_empty_and_oversized_values(note_text: str) -> None:
    with pytest.raises(ValueError):
        normalize_note_text(note_text)


def test_save_load_and_update_preserve_creation_timestamp(
    repository: CardNotesRepository,
) -> None:
    created_at = datetime(2026, 7, 17, 10, 0, tzinfo=timezone.utc)
    updated_at = datetime(2026, 7, 17, 10, 1, tzinfo=timezone.utc)

    created = repository.save(
        BUILTIN_NOTE_KEY,
        "  覚え方\r\nfirst mnemonic  ",
        now_utc=created_at,
    )
    updated = repository.save(
        BUILTIN_NOTE_KEY,
        "second mnemonic",
        now_utc=updated_at,
    )

    assert created.note_text == "覚え方\nfirst mnemonic"
    assert created.created_at_utc == created_at.isoformat()
    assert created.updated_at_utc == created_at.isoformat()
    assert updated.note_text == "second mnemonic"
    assert updated.created_at_utc == created_at.isoformat()
    assert updated.updated_at_utc == updated_at.isoformat()
    assert repository.load(BUILTIN_NOTE_KEY) == updated


def test_delete_is_idempotent(repository: CardNotesRepository) -> None:
    repository.save(JMDICT_NOTE_KEY, "dictionary mnemonic")

    assert repository.delete(JMDICT_NOTE_KEY) is True
    assert repository.delete(JMDICT_NOTE_KEY) is False
    assert repository.load(JMDICT_NOTE_KEY) is None


def test_reset_db_preserves_card_notes(repository: CardNotesRepository) -> None:
    saved = repository.save(FALLBACK_NOTE_KEY, "keep this annotation")

    database.reset_db()

    assert repository.load(FALLBACK_NOTE_KEY) == saved


def test_save_rejects_naive_timestamp(repository: CardNotesRepository) -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        repository.save(
            BUILTIN_NOTE_KEY,
            "note",
            now_utc=datetime(2026, 7, 17, 10, 0),
        )
