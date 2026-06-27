---
description: Electron frontend rules
applyTo: "electron-frontend/**/*"
---

# Electron Frontend Rules (Lean)

- Responsibility: UI rendering, interaction flow, and IPC client wiring only.
- Keep business logic in domain/data Python layers; do not reimplement SRS logic in frontend.
- Use typed IPC contracts and avoid ad-hoc channel strings.
- Keep preload surface minimal and follow least-privilege principles.
- Validate frontend changes with `npm run lint` and `npm run build` in `electron-frontend/`.
- Do not access SQLite or Python persistence files directly from frontend code.
