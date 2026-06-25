---
description: Domain layer rules (pure learning logic)
applyTo: "domain/**/*.py"
---

# Domain Rules

- Pure business logic only (SRS, active recall, parsing)
- No database access
- No UI code
- No file I/O
- Must be deterministic
- No hidden state or randomness

# SRS Contract

Deterministic function:

(last_interval, ease_factor, performance)
→ (next_interval, new_ease_factor)

- No time dependency (inject if needed)

# Learning Model (conceptual only)

Stages:
- SRS scheduling
- Active recall
- Presentation formatting
- Ingestion (mining)

These are conceptual boundaries only and must not become a pipeline implementation.