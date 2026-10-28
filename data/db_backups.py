"""Safety copies of the learner database (audit 10).

Before a schema upgrade, a progress import or a restore, a copy of the live database is saved in a
``backups`` folder beside it, and only the newest few are kept. Copies go through SQLite's backup
API, so a copy taken while another connection is writing is still consistent, and land under a
temporary name first, so a copy cut short never looks like a finished one.

Only names this module makes are ever pruned: a learner's own file saved into the folder, or a
``.staging-*`` file a restore is working on, never matches the pattern.

This module does not import ``data.database`` (which calls it from its migrations); callers pass the
path of the database they mean.
"""

from __future__ import annotations

import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

SAFETY_COPY_REASONS = ("before-upgrade", "before-import", "before-restore")
SAFETY_COPIES_KEPT = 3
#: Seconds a connection waits for another one's lock before giving up.
BUSY_TIMEOUT_SECONDS = 10.0

_SAFETY_COPY_NAME = re.compile(
    r"^jplearn-(?:before-upgrade|before-import|before-restore)-(?P<stamp>\d{8}T\d{12})Z\.db$"
)


def backups_dir(db_path: Path) -> Path:
    """The folder safety copies of ``db_path`` are kept in."""
    return db_path.parent / "backups"


def open_read_only(path: Path) -> sqlite3.Connection:
    """A read-only connection that never creates the file when it is missing."""
    uri = path.resolve().as_uri()
    # A network share comes out as file://server/share/...; SQLite refuses a URI naming a host, but
    # reads the same path with an empty host, file:////server/share/... (audit 10, review finding 5).
    if not uri.startswith("file:///"):
        uri = "file:////" + uri[len("file://"):]
    return sqlite3.connect(f"{uri}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_SECONDS)


def copy_database(source: sqlite3.Connection, target: Path) -> None:
    """Write a consistent copy of ``source`` to ``target``, replacing it only once complete."""
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        destination = sqlite3.connect(temporary)
        try:
            source.backup(destination)
        finally:
            destination.close()
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()


def make_safety_copy(
    db_path: Path,
    reason: str,
    *,
    now: datetime | None = None,
    keep: int = SAFETY_COPIES_KEPT,
) -> Path | None:
    """Copy the database at ``db_path`` into its backups folder; ``None`` when there is none yet."""
    if reason not in SAFETY_COPY_REASONS:
        raise ValueError(f"Unknown safety copy reason: {reason!r}")
    if not db_path.exists():
        return None
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%S%f")
    target = backups_dir(db_path) / f"jplearn-{reason}-{stamp}Z.db"
    source = open_read_only(db_path)
    try:
        copy_database(source, target)
    finally:
        source.close()
    prune_safety_copies(backups_dir(db_path), keep=keep, protect=target)
    return target


def safety_copies(folder: Path) -> list[Path]:
    """This module's copies in ``folder``, newest first by the time in their name."""
    if not folder.is_dir():
        return []
    found = [
        (match.group("stamp"), entry)
        for entry in folder.iterdir()
        if entry.is_file() and (match := _SAFETY_COPY_NAME.match(entry.name))
    ]
    return [entry for _stamp, entry in sorted(found, reverse=True)]


def prune_safety_copies(
    folder: Path, *, keep: int = SAFETY_COPIES_KEPT, protect: Path | None = None
) -> list[Path]:
    """Remove all but the newest ``keep`` safety copies; returns what was removed.

    ``protect`` (the copy just made) is never removed, even when a clock set back has given it an
    older name than the copies already there (audit 10, review finding 3).
    """
    copies = safety_copies(folder)
    if protect is not None and protect in copies:
        copies.remove(protect)
        copies.insert(0, protect)
    removed = copies[keep:]
    for entry in removed:
        # Another process pruning at the same moment may have got there first.
        entry.unlink(missing_ok=True)
    return removed


def main_database_file(conn: sqlite3.Connection) -> Path | None:
    """The file behind ``conn``'s main database, or ``None`` for an in-memory one."""
    for row in conn.execute("PRAGMA database_list").fetchall():
        if row[1] == "main":
            return Path(row[2]) if row[2] else None
    return None
