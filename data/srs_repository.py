"""SQLite-backed SRS item repository (app.db persistence flow)."""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Callable, Generator


DB_PATH = Path("data/app.db")
SCHEMA_VERSION_TABLE = "schema_version"
LATEST_SCHEMA_VERSION = 1


# -----------------------------
# Data model (DB representation)
# -----------------------------
@dataclass(frozen=True)
class SRSRecord:
    """Flat representation of one SRS row as stored in ``srs_items``.

    Attributes:
        id: Opaque string identifier matching the source :class:`~domain.ingestion.LearningItem`.
        last_interval: Most recent review interval in days.
        ease_factor: Current ease factor for interval growth.
        due: Unix timestamp (seconds) when this item next becomes due.
    """

    id: str
    last_interval: int
    ease_factor: float
    due: int


# -----------------------------
# Repository layer (CRUD only)
# -----------------------------
class SRSRepository:
    """Repository for reading and writing :class:`SRSRecord` rows in ``app.db``.

    Handles schema initialisation automatically on construction.  All SQL
    operations are parameterised; no business logic lives here.
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            self._apply_migrations(conn)

    def _ensure_schema_version_table(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {SCHEMA_VERSION_TABLE} (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            )
            """
        )

    def _load_schema_version(self, conn: sqlite3.Connection) -> int:
        row = conn.execute(
            f"SELECT version FROM {SCHEMA_VERSION_TABLE} WHERE id = 1"
        ).fetchone()
        if row is None:
            return 0
        return int(row[0])

    def _store_schema_version(self, conn: sqlite3.Connection, version: int) -> None:
        conn.execute(
            f"""
            INSERT INTO {SCHEMA_VERSION_TABLE} (id, version)
            VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET version = excluded.version
            """,
            (version,),
        )

    def _migration_0001(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS srs_items (
                id TEXT PRIMARY KEY,
                last_interval INTEGER NOT NULL,
                ease_factor REAL NOT NULL,
                due INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )

        existing_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(srs_items)").fetchall()
        }
        if "updated_at" not in existing_columns:
            conn.execute("ALTER TABLE srs_items ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")

    def _migration_map(self) -> dict[int, Callable[[sqlite3.Connection], None]]:
        return {
            1: self._migration_0001,
        }

    def _apply_migrations(self, conn: sqlite3.Connection) -> None:
        self._ensure_schema_version_table(conn)
        current_version = self._load_schema_version(conn)
        migrations = self._migration_map()
        for target_version in range(current_version + 1, LATEST_SCHEMA_VERSION + 1):
            migration = migrations.get(target_version)
            if migration is None:
                raise RuntimeError(f"Missing migration implementation for version {target_version}")
            migration(conn)
            self._store_schema_version(conn, target_version)

    # -----------------------------
    # Read
    # -----------------------------
    def get(self, item_id: str) -> SRSRecord | None:
        """Return the :class:`SRSRecord` for *item_id*, or ``None`` if not found."""
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT id, last_interval, ease_factor, due
                FROM srs_items
                WHERE id = ?
                """,
                (item_id,),
            )

            row = cur.fetchone()
            if not row:
                return None

            return SRSRecord(*row)

    # -----------------------------
    # Write / insert
    # -----------------------------
    def upsert(self, record: SRSRecord) -> None:
        """Insert or update a :class:`SRSRecord` row, updating ``updated_at`` automatically."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO srs_items (id, last_interval, ease_factor, due, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    last_interval=excluded.last_interval,
                    ease_factor=excluded.ease_factor,
                    due=excluded.due,
                    updated_at=excluded.updated_at
                """,
                (
                    record.id,
                    record.last_interval,
                    record.ease_factor,
                    record.due,
                    int(time.time()),
                ),
            )

    # -----------------------------
    # Convenience helpers
    # -----------------------------
    def all(self) -> list[SRSRecord]:
        """Return every :class:`SRSRecord` currently stored in the database."""
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT id, last_interval, ease_factor, due
                FROM srs_items
                """
            )

            return [SRSRecord(*row) for row in cur.fetchall()]