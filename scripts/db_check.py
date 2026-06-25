from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path("data/app.db")

REQUIRED = {
    "srs_items": {
        "id",
        "last_interval",
        "ease_factor",
        "due",
        "updated_at",
    }
}


def main() -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
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

    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {t[0] for t in cur.fetchall()}

    errors: list[str] = []

    for table, cols in REQUIRED.items():
        if table not in tables:
            errors.append(f"Missing table: {table}")
            continue

        cur.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cur.fetchall()}

        missing = cols - existing
        if missing:
            errors.append(f"{table} missing columns: {missing}")

    if errors:
        print("\n".join(errors))
        return 1

    print("DB schema OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
