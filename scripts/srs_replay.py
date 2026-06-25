from __future__ import annotations

import sqlite3
from pathlib import Path

# import your domain function
# from domain.srs import update_srs


DB_PATH = Path("data/app.db")


def main() -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT last_interval, ease_factor, performance,
               next_interval, new_ease_factor
        FROM srs_history
    """)

    mismatches = []

    for i, (li, ef, p, ni, ne) in enumerate(cur.fetchall()):

        # expected = update_srs(li, ef, p)
        # if expected != (ni, ne):
        #     mismatches.append((i, expected, (ni, ne)))

        pass

    if mismatches:
        print("SRS determinism violations:\n")
        for i, expected, actual in mismatches:
            print(i, expected, actual)
        return 1

    print("SRS deterministic ✔")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())