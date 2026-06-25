---
name: reset-database
description: Resets the SQLite database schema to a clean state for development or testing.
---

Outcome:
- Database schema is dropped and recreated

Constraints:
- Data layer only
- No Domain or UI logic involved
- Must be safe for development use only