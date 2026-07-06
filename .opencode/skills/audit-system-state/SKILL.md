---
name: audit-system-state
description: Reads system state and outputs a diagnostic summary of learning progress.
---

Reads data/jplearn.db and data/app.db via the data layer to produce a summary of learning progress.

Outcome:
- Summary of due items, backlog, system health, streaks, and level

Constraints:
- Data layer reads only (database.py, srs_repository.py)
- No modifications allowed
- Use `python scripts\debug_tools.py snapshot` or `python scripts\debug_tools.py checks` for quick diagnostics
