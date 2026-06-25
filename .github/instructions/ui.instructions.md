---
description: Rules for UI layer (presentation only)
applyTo: "ui/**/*.py"
---

## UI Rules
- Presentation only (CLI or UI rendering)
- No business logic
- No database access
- Calls Domain/Data only via interfaces
- Keep minimal and thin