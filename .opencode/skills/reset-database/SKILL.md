---
name: reset-database
description: Resets the SQLite database schema to a clean state for development or testing.
---

Drops and recreates the schema for development/testing.

Databases:
- `data/jplearn.db` — managed by `data/database.py` (ReviewState, progress, assistant, streaks, sessions)
- `data/app.db` — managed by `data/srs_repository.py` (SRS items)

Outcome:
- Schema dropped and recreated, all data cleared

Constraints:
- Data layer only
- No Domain or UI logic involved
- Development use only — destroys all user progress
