from __future__ import annotations

import sqlite3
from pathlib import Path


DB_PATH = Path("data/app.db")


def check_row(row) -> list[str]:
    errors = []

    last_interval, ease, performance, next_interval, new_ease = row

    # basic sanity rules (adjust to your model)
    if ease <= 0:
        errors.append("ease_factor <= 0")

    if next_interval < 0:
        errors.append("negative interval")

    if performance not in (0, 1, 2, 3, 4, 5):
        errors.append("invalid performance score")

    return errors


def main() -> int:
    if not DB_PATH.exists():
        print("DB not found")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT last_interval, ease_factor, performance,
               next_interval, new_ease_factor
        FROM srs_history
    """)

    rows = cur.fetchall()

    errors = []

    for i, row in enumerate(rows):
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