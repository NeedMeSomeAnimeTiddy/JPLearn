"""Settings key/value repository.

Provides simple get/set access to the ``user_settings`` table introduced in
migration_0010.  Keys are arbitrary strings; values are stored as TEXT.

Data layer rules:
- No business logic here.
- Callers are responsible for interpreting values.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from data.database import _connect, init_db


def get_setting(key: str, conn: sqlite3.Connection | None = None) -> str | None:
    """Return the value for *key*, or ``None`` if not set."""
    def _query(c: sqlite3.Connection) -> str | None:
        row = c.execute(
            "SELECT value FROM user_settings WHERE key = ?", (key,)
        ).fetchone()
        return str(row["value"]) if row else None

    if conn is not None:
        return _query(conn)
    with _connect() as c:
        return _query(c)


def set_setting(key: str, value: str, conn: sqlite3.Connection | None = None) -> None:
    """Upsert *key* → *value* in ``user_settings``."""
    now = datetime.now(timezone.utc).isoformat()

    def _upsert(c: sqlite3.Connection) -> None:
        c.execute(
            """
            INSERT INTO user_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value      = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, now),
        )

    if conn is not None:
        _upsert(conn)
    else:
        init_db()
        with _connect() as c:
            _upsert(c)
