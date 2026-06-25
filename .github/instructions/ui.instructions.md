---
description: UI layer rules (presentation only)
applyTo: "ui/**/*.py"
---

# UI Rules

- Presentation layer only (CLI or UI rendering)
- No business logic
- No database access
- Calls Domain and Data only through interfaces
- Keep UI thin and minimal

---

# Constraints

- UI must not calculate SRS values
- UI must not mutate persistence directly
- UI only orchestrates user interaction flow