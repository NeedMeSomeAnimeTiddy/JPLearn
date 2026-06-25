---
description: UI layer rules
applyTo: "ui/**/*.py"
---

# UI Rules

- Presentation only (CLI or UI)
- No business logic
- No database access
- Must call Domain/Data only

---

# Intent Anchor

This layer is ONLY for:
- user interaction
- rendering domain data
- collecting input
- calling domain/data layers

Not for persistence or logic.