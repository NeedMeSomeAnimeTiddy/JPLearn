---
description: Domain layer rules
applyTo: "domain/**/*.py"
---

# Domain Rules

- Pure logic only (SRS, active recall, parsing)
- No database access
- No UI code
- No file I/O
- Must be deterministic
- No hidden state or randomness

---

# SRS Contract

(last_interval, ease_factor, performance)
→ (next_interval, new_ease_factor)

- No time dependency (inject externally if needed)

---

# Intent Anchor

This layer is ONLY for:
- deterministic learning logic
- SRS calculations
- domain models

Not for storage or UI behavior.