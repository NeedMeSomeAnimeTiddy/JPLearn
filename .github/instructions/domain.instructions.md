---
description: Domain layer rules
applyTo: "domain/**/*.py"
---

# Domain Rules (Lean)

- Responsibility: deterministic learning logic, SRS calculations, and domain models.
- Required: pure functions where practical; no hidden state or randomness.
- SRS contract: `(last_interval, ease_factor, performance) -> (next_interval, new_ease_factor)`.
- Forbidden: database access, UI code, and file I/O.
- Time dependency must be injected externally.