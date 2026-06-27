---
description: Data layer rules
applyTo: "data/**/*.py"
---

# Data Rules (Lean)

- Responsibility: SQLite persistence, schema/migrations, row <-> domain mapping.
- Allowed: repository methods and parameterized SQL only.
- Required: normalize Japanese text before storage.
- Forbidden: business logic and UI behavior.