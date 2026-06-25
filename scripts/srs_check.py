from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path("data/app.db")


def check_row(row: tuple[object, ...]) -> list[str]:
    errors: list[str] = []

    _item_id, last_interval, ease_factor, due, updated_at = row

    if not isinstance(last_interval, int) or last_interval < 0:
        errors.append("invalid last_interval")

    if not isinstance(ease_factor, float) or ease_factor <= 0:
        errors.append("invalid ease_factor")

    if not isinstance(due, int) or due < 0:
        errors.append("invalid due value")

    if not isinstance(updated_at, int) or updated_at < 0:
        errors.append("invalid updated_at value")

    return errors


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

    cur.execute("""
        SELECT id, last_interval, ease_factor, due, updated_at
        FROM srs_items
    """)

    errors: list[tuple[int, tuple[object, ...], list[str]]] = []

    for i, row in enumerate(cur.fetchall()):
        row_errors = check_row(row)
        if row_errors:
            errors.append((i, row, row_errors))

    if errors:
        print("SRS integrity violations:\n")
        for i, row, errs in errors:
            print(f"Row {i}: {row}")
            for e in errs:
                print(f"  - {e}")
        return 1

    print("SRS integrity OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
