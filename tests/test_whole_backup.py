"""Whole-database backup and restore (audit 10, F3; the design critic's M1, M2, S7)."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from data import database, db_backups, whole_backup
from domain.scheduler import ReviewState


@pytest.fixture(autouse=True)
def _schema() -> None:
    database.init_db()


def _seed(repetitions: int, card_id: int = 1) -> None:
    database.save_state("Hiragana", ReviewState(card_id=card_id, repetitions=repetitions, interval=4, next_review=date(2026, 11, 1)))


def _repetitions(path: Path | None = None, card_id: int = 1) -> int | None:
    conn = sqlite3.connect(path or database.DB_PATH)
    try:
        row = conn.execute("SELECT repetitions FROM review_states WHERE card_id = ?", (card_id,)).fetchone()
        return None if row is None else int(row[0])
    finally:
        conn.close()


def _tables(path: Path) -> set[str]:
    conn = sqlite3.connect(path)
    try:
        return {str(row[0]) for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    finally:
        conn.close()


def test_back_up_then_restore_round_trips_the_database_and_the_window_settings(tmp_path: Path) -> None:
    _seed(3)
    database.log_review("Hiragana", 1, 4, reviewed_on=date(2026, 10, 2), reviewed_at_utc="2026-10-02T08:00:00+00:00", script_tag="hiragana", prompt_text="あ")
    target = tmp_path / "elsewhere" / "jplearn-backup-2026-10-28.db"
    target.parent.mkdir()

    summary = whole_backup.backup_database(target, {"jplearn-stats": '{"hiragana":1}'})

    assert (summary.cards, summary.reviews, summary.last_review_day) == (1, 1, "2026-10-02")
    _seed(9)
    _seed(1, card_id=2)

    result = whole_backup.restore_database(target)

    assert _repetitions() == 3
    assert _repetitions(card_id=2) is None
    assert result.window_state == {"jplearn-stats": '{"hiragana":1}'}
    assert whole_backup.WINDOW_STATE_TABLE not in _tables(database.DB_PATH)
    assert result.safety_copy is not None and _repetitions(Path(result.safety_copy)) == 9


def test_a_backup_replaces_an_existing_file_only_once_complete(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed(3)
    (tmp_path / "out").mkdir()
    target = tmp_path / "out" / "jplearn-backup.db"
    target.write_text("the learner's previous backup")

    def fails(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(whole_backup.os, "replace", fails)
    with pytest.raises(OSError):
        whole_backup.backup_database(target, {})
    assert target.read_text() == "the learner's previous backup"
    assert [p.name for p in (tmp_path / "out").iterdir()] == ["jplearn-backup.db"]


def test_backing_up_into_the_safety_copy_folder_or_over_the_live_database_is_refused() -> None:
    folder = db_backups.backups_dir(database.DB_PATH)
    with pytest.raises(ValueError, match="choose another place"):
        whole_backup.backup_database(folder / "jplearn-backup.db", {})
    with pytest.raises(ValueError, match="choose another place"):
        whole_backup.backup_database(database.DB_PATH, {})


def test_restoring_the_live_database_itself_is_refused() -> None:
    with pytest.raises(ValueError, match="choose another file"):
        whole_backup.restore_database(database.DB_PATH)


def test_restore_from_the_oldest_safety_copy_when_the_pool_is_full() -> None:
    _seed(1)
    t0 = datetime(2026, 10, 1, tzinfo=timezone.utc)
    oldest = db_backups.make_safety_copy(database.DB_PATH, "before-import", now=t0)
    _seed(2)
    for i in range(1, 3):
        db_backups.make_safety_copy(database.DB_PATH, "before-import", now=t0 + timedelta(days=i))
    _seed(7)

    whole_backup.restore_database(oldest)

    # The before-restore copy pushed the oldest out of the pool, but the restore had staged it first.
    assert _repetitions() == 1
    assert not oldest.exists()
    folder = db_backups.backups_dir(database.DB_PATH)
    assert not [p for p in folder.iterdir() if p.name.startswith(".staging-")]


def test_an_older_schema_backup_is_migrated_on_the_way_in(tmp_path: Path) -> None:
    _seed(4)
    target = tmp_path / "old.db"
    whole_backup.backup_database(target, {})
    conn = sqlite3.connect(target)
    conn.execute("UPDATE schema_version SET version = ?", (database.LATEST_SCHEMA_VERSION - 1,))
    conn.commit()
    conn.close()

    result = whole_backup.restore_database(target)

    assert result.summary.schema_version == database.LATEST_SCHEMA_VERSION - 1
    conn = sqlite3.connect(database.DB_PATH)
    assert conn.execute("SELECT version FROM schema_version").fetchone()[0] == database.LATEST_SCHEMA_VERSION
    conn.close()
    assert _repetitions() == 4


def test_a_migration_that_fails_leaves_the_live_database_untouched(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed(4)
    target = tmp_path / "old.db"
    whole_backup.backup_database(target, {})
    _seed(8)
    before = database.DB_PATH.read_bytes()

    def broken(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("migration failed")

    monkeypatch.setattr(database, "_apply_migrations", broken)
    with pytest.raises(RuntimeError):
        whole_backup.restore_database(target)

    assert database.DB_PATH.read_bytes() == before
    assert db_backups.safety_copies(db_backups.backups_dir(database.DB_PATH)) == []


def test_no_safety_copy_no_restore(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed(4)
    target = tmp_path / "b.db"
    whole_backup.backup_database(target, {})
    _seed(8)

    def full_disk(*_args: object, **_kwargs: object) -> None:
        raise OSError("No space left on device")

    monkeypatch.setattr(db_backups, "make_safety_copy", full_disk)
    with pytest.raises(OSError):
        whole_backup.restore_database(target)
    assert _repetitions() == 8


@pytest.mark.parametrize(
    ("content", "reason"),
    [(b"this is not a database at all, just some text", "not a backup"), (None, "not a backup")],
)
def test_a_file_that_is_not_a_backup_is_refused_by_name(tmp_path: Path, content: bytes | None, reason: str) -> None:
    picked = tmp_path / "picked.db"
    if content is None:
        conn = sqlite3.connect(picked)
        conn.execute("CREATE TABLE something_else (x)")
        conn.commit()
        conn.close()
    else:
        picked.write_bytes(content)
    with pytest.raises(ValueError, match=reason):
        whole_backup.inspect_database_file(picked)


def test_a_newer_schema_backup_is_refused(tmp_path: Path) -> None:
    target = tmp_path / "new.db"
    whole_backup.backup_database(target, {})
    conn = sqlite3.connect(target)
    conn.execute("UPDATE schema_version SET version = ?", (database.LATEST_SCHEMA_VERSION + 1,))
    conn.commit()
    conn.close()
    with pytest.raises(ValueError, match="newer format"):
        whole_backup.restore_database(target)


def test_a_backup_with_an_unfinished_write_beside_it_is_refused(tmp_path: Path) -> None:
    target = tmp_path / "b.db"
    whole_backup.backup_database(target, {})
    Path(f"{target}-journal").write_bytes(b"x")
    with pytest.raises(ValueError, match="damaged file"):
        whole_backup.inspect_database_file(target)


def test_oversized_window_settings_are_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="too large"):
        whole_backup.backup_database(tmp_path / "b.db", {"k": "x" * (whole_backup.MAX_WINDOW_STATE_CHARACTERS + 1)})
