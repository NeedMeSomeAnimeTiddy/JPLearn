---
description: Data layer rules (SQLite repositories only)
applyTo: "data/**/*.py"
---

# Data Rules

- SQLite access only
- Repository pattern only
- No business logic
- No UI logic
- Must return Domain dataclasses only

# Persistence Rules

- All database operations must be inside repository classes
- Use parameterized queries only
- Normalize Japanese text using unicodedata before insert/update

# Constraints

- No scheduling logic
- No parsing logic beyond storage formatting