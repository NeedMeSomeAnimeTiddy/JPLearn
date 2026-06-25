# JPLearn
An Electron-based Japanese learning app with a Python backend for domain logic and SQLite persistence.

---

## Learning Content Coverage

- **Scripts**: Hiragana, Katakana
- **JLPT N5 Kanji**: Intro deck included
- **Vocabulary**: Kana words deck included
- **Grammar**: Basic pattern cards included

---

## Contributing / Dev Workflow

1. Install dependencies:
   `python -m pip install -r requirements.txt`
2. Install frontend dependencies:
   `cd electron-frontend && npm install`
3. Run the desktop frontend in development:
   `cd electron-frontend && npm run dev`
4. Build and run production frontend locally:
   `cd electron-frontend && npm run build && npm run start`
5. Build Windows distributables (Forge):
   `cd electron-frontend && npm run make:win`
6. Run the full Python development checks:
   `python scripts\dev.py`
7. Run targeted tests while working:
   `python -m pytest tests\path\to\test_file.py -q`

`scripts\dev.py` is the main gate and runs type checks, architecture checks, DB checks, SRS checks, then tests.

### Compact Debug Tools

Use the compact debug CLI when you want high-signal diagnostics with less output noise:

- Quick workspace snapshot:
   `python scripts\debug_tools.py snapshot`
- JSON snapshot (easy to parse):
   `python scripts\debug_tools.py snapshot --json`
- Condensed architecture/DB/SRS checks:
   `python scripts\debug_tools.py checks`
- Include tests in condensed mode:
   `python scripts\debug_tools.py checks --with-tests`

---

## Project TODO

### Recently Completed Milestones
- [x] Migrate frontend to Electron + React + TypeScript (`electron-frontend/`)
- [x] Deprecate Python GUI entrypoints (`main.py`, `gui.py`)
- [x] Add script-specific minigame menus with back navigation
- [x] Ship modern dark desktop UI with animated transitions
- [x] Show per-deck mastery and due/completed-today indicators

### Product Priorities (Post-Refactor)
- [x] (High) Daily streak tracking (UTC-safe + local-day aware)
   - [x] Define streak model fields in persistence: `last_study_at_utc`, `current_streak_days`, `best_streak_days`.
   - [x] Implement streak update service in Domain with deterministic date-boundary logic.
   - [x] Handle same-day repeat studies without double-increment.
   - [x] Handle skipped-day reset behavior.
   - [x] Add tests for UTC rollover and local timezone edge cases.
   - [x] Surface current/best streak in Electron overview.

- [x] (High) Weekly/monthly activity summary cards in Electron overview
   - [x] Add aggregation query for daily activity buckets (last 7 and last 30 days).
   - [x] Expose totals: reviewed, correct, incorrect, accuracy, points earned.
   - [x] Render 2 overview cards: 7-day and 30-day summaries.
   - [x] Add empty-state behavior for new users with no activity.
   - [x] Add snapshot/UI tests for overview summary rendering.

- [x] (High) Mistake breakdown by script/tag (hiragana/katakana/kanji/vocab)
   - [x] Persist incorrect attempts with script/tag metadata at review time.
   - [x] Add grouped aggregation endpoint for mistake counts and error rates.
   - [x] Display breakdown in overview panel with top weak areas first.
   - [x] Add regression tests to ensure tag/script grouping stays stable.

- [x] (Medium) Per-item study history timeline (last reviews + trend)
   - [x] Add review event history table keyed by item and timestamp.
   - [x] Expose recent review timeline per item (attempt, outcome, timestamp, points delta).
   - [x] Add trend summary (improving/stable/declining) based on recent outcomes.
   - [x] Add UI panel for item-level history with pagination/limit.
   - [x] Add tests for ordering and trend classification rules.

- [x] (Medium) Leech handling for repeatedly failed items
   - [x] Define leech rule (example: failed >= N times within last M attempts).
   - [x] Auto-tag leech items in persistence.
   - [x] Add focused review mode that prioritizes leech-tagged items.
   - [x] Add UI indicator and optional filter for leech items.
   - [x] Add tests for entering/exiting leech state.

- [x] (Medium) Better distractor generation for multiple-choice minigames
   - [x] Replace random distractors with rule-based distractor ranking.
   - [x] Add script-aware similarity heuristics (shape/readings/meaning proximity).
   - [x] Prevent duplicate or obviously invalid distractors.
   - [x] Add deterministic tests for distractor quality and uniqueness.
   - [x] Add quick benchmark to keep distractor generation within target latency.

### Electron UX & Accessibility
- [x] (High) Add deterministic keyboard navigation map (Tab order + Enter/Space shortcuts) across all menus
- [x] (High) Add explicit visible focus-ring audit for every interactive control
- [x] (Medium) Add reduced-motion setting and respect OS reduced-motion preference
- [x] (Medium) Add font-size scaling option in settings (small/medium/large)
- [x] (Medium) Add in-app command palette / quick switcher for Home, Script Menu, and Overview

### Electron Security & Runtime Hardening
- [ ] (High) Validate IPC sender/frame for all `ipcMain.handle` routes
- [ ] (High) Enable renderer sandbox explicitly in `BrowserWindow` webPreferences
- [ ] (High) Limit navigation and deny unexpected window creation (`will-navigate`, `setWindowOpenHandler`)
- [ ] (Medium) Add restrictive CSP for packaged renderer (`default-src 'self'` baseline)
- [ ] (Medium) Evaluate replacing `file://` renderer loads with a custom app protocol

### Performance & Packaging
- [ ] (High) Bundle fonts locally (remove runtime Google Fonts fetch for offline startup reliability)
- [ ] (Medium) Add startup performance budget and measurements (cold start + first interaction)
- [ ] (Medium) Audit heavy startup work in main/renderer and defer non-critical tasks
- [ ] (Medium) Add packaged smoke test in CI (`npm run build`, `npm run package`, launch check)

### Release, Data & Reliability
- [ ] (High) Add DB migration/version marker and migration runner for schema changes
- [ ] (High) Strengthen Japanese text normalization checks at data boundaries
- [ ] (Medium) Add backup/restore command for local DB files
- [ ] (Medium) Add import/export for decks and user progress
- [ ] (Medium) Integrate Electron auto-update flow (Forge publish metadata + update UI prompt)

### Longer-Term Enhancements
- [ ] Audio pronunciation playback (pre-recorded or TTS)
- [ ] Sentence mining/import workflow
- [ ] Theme presets/customization options in Electron UI
- [ ] Optional cloud sync
- [ ] Optional web deployment mode
