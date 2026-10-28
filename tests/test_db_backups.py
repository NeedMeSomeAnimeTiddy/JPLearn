"""Safety copies of the learner database (audit 10, F7 and the design critic's M2/S6/S7)."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from data import database, db_backups


def _db_with(path: Path, value: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS marker (x INTEGER)")
    conn.execute("DELETE FROM marker")
    conn.execute("INSERT INTO marker VALUES (?)", (value,))
    conn.commit()
    conn.close()


def _marker(path: Path) -> int:
    conn = sqlite3.connect(path)
    try:
        return int(conn.execute("SELECT x FROM marker").fetchone()[0])
    finally:
        conn.close()


T0 = datetime(2026, 10, 28, 12, 0, 0, tzinfo=timezone.utc)


def test_copy_matches_the_database_and_lands_in_backups(tmp_path: Path) -> None:
    live = tmp_path / "data" / "jplearn.db"
    _db_with(live, 7)
    copy = db_backups.make_safety_copy(live, "before-import", now=T0)
    assert copy == tmp_path / "data" / "backups" / "jplearn-before-import-20261028T120000000000Z.db"
    assert _marker(copy) == 7


def test_no_database_no_copy(tmp_path: Path) -> None:
    assert db_backups.make_safety_copy(tmp_path / "jplearn.db", "before-import") is None
    assert not (tmp_path / "jplearn.db").exists()


def test_keeps_the_newest_three_across_reasons_by_time_not_name(tmp_path: Path) -> None:
    live = tmp_path / "jplearn.db"
    _db_with(live, 1)
    # "before-upgrade" sorts after "before-import" by name; the time in the name must decide.
    order = ["before-upgrade", "before-import", "before-restore", "before-import", "before-upgrade"]
    made = [db_backups.make_safety_copy(live, reason, now=T0 + timedelta(minutes=i)) for i, reason in enumerate(order)]
    left = db_backups.safety_copies(tmp_path / "backups")
    assert left == list(reversed(made[2:]))


def test_pruning_never_touches_other_files(tmp_path: Path) -> None:
    live = tmp_path / "jplearn.db"
    _db_with(live, 1)
    folder = tmp_path / "backups"
    folder.mkdir()
    keep = [
        folder / "jplearn-backup-2026-10-01.db",  # a learner's own "Back up everything" file
        folder / ".staging-0123abcd.db",  # a restore in progress
        folder / "notes.txt",
    ]
    for path in keep:
        path.write_text("mine")
    for i in range(5):
        db_backups.make_safety_copy(live, "before-import", now=T0 + timedelta(seconds=i))
    assert all(path.exists() for path in keep)
    assert len(db_backups.safety_copies(folder)) == 3


def test_a_copy_made_after_the_clock_went_back_is_kept(tmp_path: Path) -> None:
    live = tmp_path / "jplearn.db"
    _db_with(live, 1)
    for i in range(3):
        db_backups.make_safety_copy(live, "before-import", now=T0 + timedelta(days=i))
    _db_with(live, 2)

    newest = db_backups.make_safety_copy(live, "before-restore", now=T0 - timedelta(days=365))

    assert newest is not None and newest.exists() and _marker(newest) == 2
    assert len(db_backups.safety_copies(tmp_path / "backups")) == 3


def test_pruning_a_copy_another_process_already_removed_is_not_an_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    live = tmp_path / "jplearn.db"
    _db_with(live, 1)
    for i in range(4):
        db_backups.make_safety_copy(live, "before-upgrade", now=T0 + timedelta(seconds=i))
    folder = tmp_path / "backups"
    listed = db_backups.safety_copies(folder)
    listed[-1].unlink()
    monkeypatch.setattr(db_backups, "safety_copies", lambda _folder: list(listed))

    db_backups.prune_safety_copies(folder, keep=3)


def test_a_network_share_path_is_opened_with_an_empty_uri_host(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []
    monkeypatch.setattr(db_backups.sqlite3, "connect", lambda database, **_kwargs: seen.append(database))
    share = Path("//server/share/jplearn.db")
    monkeypatch.setattr(Path, "resolve", lambda self, strict=False: self)
    monkeypatch.setattr(Path, "as_uri", lambda self: "file://server/share/jplearn.db")

    db_backups.open_read_only(share)

    assert seen == ["file:////server/share/jplearn.db?mode=ro"]


def test_two_copies_in_the_same_second_both_survive(tmp_path: Path) -> None:
    live = tmp_path / "jplearn.db"
    _db_with(live, 1)
    first = db_backups.make_safety_copy(live, "before-import", now=T0)
    second = db_backups.make_safety_copy(live, "before-import", now=T0 + timedelta(microseconds=1))
    assert first != second and first.exists() and second.exists()


def test_upgrade_of_an_existing_database_is_copied_first() -> None:
    database.init_db()  # a brand-new database: version 0 -> latest, no copy
    folder = database.DB_PATH.parent / "backups"
    assert db_backups.safety_copies(folder) == []

    conn = sqlite3.connect(database.DB_PATH)
    conn.execute("UPDATE schema_version SET version = ?", (database.LATEST_SCHEMA_VERSION - 1,))
    conn.commit()
    conn.close()
    database.init_db()

    copies = db_backups.safety_copies(folder)
    assert len(copies) == 1 and "before-upgrade" in copies[0].name
    conn = sqlite3.connect(copies[0])
    assert conn.execute("SELECT version FROM schema_version").fetchone()[0] == database.LATEST_SCHEMA_VERSION - 1
    conn.close()


def test_an_up_to_date_database_is_not_copied() -> None:
    database.init_db()
    database.init_db()
    assert db_backups.safety_copies(database.DB_PATH.parent / "backups") == []


def test_a_failed_copy_does_not_stop_the_upgrade(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    database.init_db()
    conn = sqlite3.connect(database.DB_PATH)
    conn.execute("UPDATE schema_version SET version = ?", (database.LATEST_SCHEMA_VERSION - 1,))
    conn.commit()
    conn.close()

    def full_disk(*_args: object, **_kwargs: object) -> None:
        raise OSError("No space left on device")

    monkeypatch.setattr(db_backups, "make_safety_copy", full_disk)
    database.init_db()

    conn = sqlite3.connect(database.DB_PATH)
    assert conn.execute("SELECT version FROM schema_version").fetchone()[0] == database.LATEST_SCHEMA_VERSION
    conn.close()
    assert "no safety copy before the upgrade" in capsys.readouterr().err
