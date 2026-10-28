"""Whole-database backup and restore: "Back up everything" and "Restore from a backup" (audit 10, F3).

A backup is an exact copy of the learner's database, made through SQLite's backup API, plus the few
settings the app window keeps only in its own storage (per-section stats, progression overrides,
block selections), which the window sends along and which are stored in a table of the copy only.

A restore never touches the live database until the picked file has been proven usable:

1. the file is copied into a staging file in the backups folder (so the source may be a safety copy
   that pruning later removes, or the file the learner picked may change, and neither matters);
2. the staging copy is checked, set to a rollback journal, and migrated to this build's schema; a
   file that fails any of this leaves the live database exactly as it was;
3. the window's settings are read out of it and their table dropped;
4. a safety copy of the live database is taken (no copy, no restore);
5. the staging copy is written over the live database in one SQLite transaction, so a crash part way
   leaves a journal that rolls back on the next open.

The worker holds no connection between requests (``data.database._connect``), and the main process
runs this inside the answer queue's exclusive section, so nothing is writing meanwhile.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from data import database, db_backups

WINDOW_STATE_TABLE = "backup_window_state"
#: The window's settings are small (kilobytes); anything near this is not what the window sends.
MAX_WINDOW_STATE_CHARACTERS = 2_000_000


@dataclass(frozen=True)
class DatabaseFileSummary:
    """What a backup file holds, shown before the learner agrees to restore it."""

    schema_version: int
    cards: int
    reviews: int
    last_review_day: str | None


@dataclass(frozen=True)
class DatabaseRestoreResult:
    summary: DatabaseFileSummary
    safety_copy: str | None
    window_state: dict[str, str]


def _validated_window_state(window_state: Mapping[str, str]) -> dict[str, str]:
    total = 0
    state: dict[str, str] = {}
    for key, value in window_state.items():
        if not isinstance(key, str) or not isinstance(value, str) or not key:
            raise ValueError("window settings must map names to text")
        total += len(key) + len(value)
        state[key] = value
    if total > MAX_WINDOW_STATE_CHARACTERS:
        raise ValueError("window settings are too large to back up")
    return state


def _is_reserved(path: Path) -> bool:
    live = database.DB_PATH.resolve()
    return path == live or path.parent == db_backups.backups_dir(live)


def _summarise(conn: sqlite3.Connection) -> DatabaseFileSummary:
    tables = {str(row[0]) for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if database.SCHEMA_VERSION_TABLE not in tables or "review_states" not in tables:
        raise ValueError("not a backup: the file is not a JPLearn database")
    row = conn.execute(f"SELECT version FROM {database.SCHEMA_VERSION_TABLE} WHERE id = 1").fetchone()
    version = int(row[0]) if row is not None else 0
    if version > database.LATEST_SCHEMA_VERSION:
        raise ValueError(
            f"newer format: the backup is schema {version}; this version of JPLearn reads up to "
            f"{database.LATEST_SCHEMA_VERSION}"
        )
    if version < 1:
        raise ValueError("not a backup: the file is not a JPLearn database")
    cards = int(conn.execute("SELECT COUNT(*) FROM review_states").fetchone()[0])
    reviews = 0
    last_day: str | None = None
    if "review_events" in tables:
        reviews, last = conn.execute("SELECT COUNT(*), MAX(reviewed_on) FROM review_events").fetchone()
        reviews = int(reviews)
        last_day = str(last) if last else None
    return DatabaseFileSummary(schema_version=version, cards=cards, reviews=reviews, last_review_day=last_day)


def _check_intact(conn: sqlite3.Connection) -> None:
    try:
        result = conn.execute("PRAGMA quick_check").fetchone()
    except sqlite3.DatabaseError as error:
        raise ValueError(f"not a backup: {error}") from error
    if result is None or str(result[0]).lower() != "ok":
        raise ValueError("damaged file: the backup failed SQLite's integrity check")


def inspect_database_file(path: Path) -> DatabaseFileSummary:
    """Check a picked backup and summarise it, without writing anything anywhere."""
    if not path.is_file():
        raise ValueError("not a backup: the file does not exist")
    if Path(f"{path}-journal").exists():
        raise ValueError("damaged file: the backup has an unfinished write beside it (a -journal file)")
    try:
        conn = db_backups.open_read_only(path)
    except sqlite3.Error as error:
        raise ValueError(f"not a backup: {error}") from error
    try:
        _check_intact(conn)
        return _summarise(conn)
    except sqlite3.DatabaseError as error:
        raise ValueError(f"not a backup: {error}") from error
    finally:
        conn.close()


def backup_database(target: Path, window_state: Mapping[str, str]) -> DatabaseFileSummary:
    """Save an exact copy of the live database, with the window's settings, to ``target``."""
    state = _validated_window_state(window_state)
    target = target.resolve()
    if _is_reserved(target):
        raise ValueError("choose another place: that is where the app keeps its own database and safety copies")
    database.init_db()
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        source = db_backups.open_read_only(database.DB_PATH)
        try:
            copy = sqlite3.connect(temporary)
            try:
                source.backup(copy)
                copy.execute(f"CREATE TABLE IF NOT EXISTS {WINDOW_STATE_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                copy.execute(f"DELETE FROM {WINDOW_STATE_TABLE}")
                copy.executemany(f"INSERT INTO {WINDOW_STATE_TABLE} (key, value) VALUES (?, ?)", sorted(state.items()))
                copy.commit()
                summary = _summarise(copy)
            finally:
                copy.close()
        finally:
            source.close()
        # Only a finished copy replaces a file already at that path (audit 10, nit 3).
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return summary


def restore_database(path: Path) -> DatabaseRestoreResult:
    """Replace the live database with the backup at ``path`` (see the module docstring)."""
    source = path.resolve()
    live = database.DB_PATH.resolve()
    if source == live:
        raise ValueError("choose another file: that is the database the app is using now")
    summary = inspect_database_file(source)

    folder = db_backups.backups_dir(live)
    folder.mkdir(parents=True, exist_ok=True)
    staging = folder / f".staging-{uuid.uuid4().hex}.db"
    try:
        reader = db_backups.open_read_only(source)
        try:
            stage = sqlite3.connect(staging)
            try:
                reader.backup(stage)
            finally:
                stage.close()
        finally:
            reader.close()

        stage = sqlite3.connect(staging)
        stage.row_factory = sqlite3.Row
        try:
            stage.execute("PRAGMA journal_mode = DELETE")
            _check_intact(stage)
            database._apply_migrations(stage, take_safety_copy=False)
            stage.commit()
            window_state: dict[str, str] = {}
            has_window_state = stage.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (WINDOW_STATE_TABLE,)
            ).fetchone()
            if has_window_state:
                window_state = {
                    str(row["key"]): str(row["value"])
                    for row in stage.execute(f"SELECT key, value FROM {WINDOW_STATE_TABLE}")
                }
                stage.execute(f"DROP TABLE {WINDOW_STATE_TABLE}")
                stage.commit()
        finally:
            stage.close()

        safety_copy = db_backups.make_safety_copy(live, "before-restore")

        reader = db_backups.open_read_only(staging)
        try:
            target = sqlite3.connect(live, timeout=db_backups.BUSY_TIMEOUT_SECONDS)
            try:
                reader.backup(target)
            finally:
                target.close()
        finally:
            reader.close()
    finally:
        for leftover in (staging, Path(f"{staging}-journal")):
            if leftover.exists():
                leftover.unlink()

    return DatabaseRestoreResult(
        summary=summary,
        safety_copy=None if safety_copy is None else str(safety_copy),
        window_state=window_state,
    )
