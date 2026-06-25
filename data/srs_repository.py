from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path


DB_PATH = Path("data/app.db")


# -----------------------------
# Data model (DB representation)
# -----------------------------
@dataclass(frozen=True)
class SRSRecord:
    id: str
    last_interval: int
    ease_factor: float
    due: int


# -----------------------------
# Repository layer (CRUD only)
# -----------------------------
class SRSRepository:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
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

    # -----------------------------
    # Read
    # -----------------------------
    def get(self, item_id: str) -> SRSRecord | None:
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
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT id, last_interval, ease_factor, due
                FROM srs_items
                """
            )

            return [SRSRecord(*row) for row in cur.fetchall()]