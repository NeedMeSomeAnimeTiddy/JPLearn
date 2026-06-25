---
description: Data layer rules
applyTo: "data/**/*.py"
---

# Data Rules

- SQLite access only
- Repository pattern only
- No business logic
- Must return Domain dataclasses only
- No UI logic

---

# Persistence Rules

- All DB operations inside repositories
- Parameterized SQL only
- Normalize Japanese text using unicodedata before storage

---

# Intent Anchor

This layer is ONLY for:
- SQLite persistence
- schema + migrations
- mapping rows ↔ domain models

Not for logic or UI.