---
description: Rules for Data layer (SQLite repositories only)
applyTo: "data/**/*.py"
---

## Data Rules
- SQLite access only
- Repository pattern only
- No business logic
- No UI logic
- Must return domain dataclasses
- Must normalize Japanese text using unicodedata