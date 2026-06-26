# JPLearn
An Electron-based Japanese learning app with a Python backend for domain logic and SQLite persistence.

---

## Learning Content Coverage

- **Scripts**: Hiragana, Katakana
- **JLPT Kanji**: N5 to N1 progression included
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
8. Regenerate external Words/Conversational content module from CSV sources:
   `python scripts\import_external_lists.py`

`scripts\dev.py` is the main gate and runs type checks, architecture checks, DB checks, SRS checks, then tests.

### External Content Import Workflow

- Source files:
   `data\external_sources\words_n5.csv`
   `data\external_sources\conversational_n5.csv`
   `data\external_sources\kanji_n5.csv`
   `data\external_sources\kanji_n4.csv`
   `data\external_sources\kanji_n3.csv`
   `data\external_sources\kanji_n2.csv`
   `data\external_sources\kanji_n1.csv`
- CSV headers must be exactly:
   `character,romaji,meaning`
- Regeneration command:
   `python scripts\import_external_lists.py`
- Generated module consumed by decks:
   `domain\external_deck_data.py`

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

### Status Snapshot
- [x] Electron + React + TypeScript desktop client shipped
- [x] Core SRS mechanics, streaks, history, leech handling, and distractor quality improvements shipped
- [x] Keyboard accessibility baseline, reduced-motion support, and overview analytics shipped

### Now / Next (Highest Priority)
- [x] (High) Harden Electron IPC surface
   - Validate sender/frame for each `ipcMain.handle` route
   - Introduce shared request validation helpers and typed payload guards
   - Add negative tests for malformed and unauthorized renderer requests
- [x] (High) Enable stricter renderer isolation defaults
   - Set `sandbox: true` explicitly and verify preload bridge compatibility
   - Re-audit `contextIsolation`, `nodeIntegration`, and exposed preload API surface
- [x] (High) Lock down navigation and window creation
   - Deny unexpected `will-navigate` targets
   - Enforce strict `setWindowOpenHandler` allowlist policy
- [ ] (High) Add database migration framework
   - Add schema version table/marker
   - Add deterministic migration runner and rollback-safe strategy
   - Add migration tests for fresh install and upgrade paths

### Near-Term Product Roadmap
- [ ] (High) Introduce adaptive study queue balancing
   - Blend due items with weak-tag reinforcement and new-item pacing
   - Add deterministic queue tests to avoid starvation of any deck type
- [ ] (High) Add session goals and completion tracking
   - Daily target setting (items/time/accuracy)
   - End-of-session summary against target with streak-aware messaging
- [ ] (Medium) Expand answer modes
   - Typed recall mode for vocab and kanji decks
   - Optional confidence score capture per review event
- [ ] (Medium) Add pronunciation/audio support
   - Pluggable TTS or bundled audio strategy
   - Cache policy for offline reliability

### Data Quality and Content Operations
- [ ] (High) Enforce Japanese normalization at all persistence boundaries
   - Centralize normalization utilities used by all repositories/importers
   - Add regression tests for kana width, prolonged sound marks, and punctuation variants
- [ ] (Medium) Improve external content ingestion pipeline
   - Add stricter CSV schema checks with actionable error output
   - Add deduplication and conflict reporting across imported lists
- [ ] (Medium) Add deck import/export workflow
   - Export user progress and custom decks
   - Import with merge/overwrite conflict modes

### Frontend, Performance, and Release Engineering
- [x] (High) Bundle fonts locally for offline startup reliability
- [x] (Medium) Add startup performance budget and telemetry checkpoints
- [x] (Medium) Defer non-critical renderer work until after first meaningful paint
- [x] (Medium) Add packaged smoke tests in CI (`npm run build`, package, launch check)
- [x] (Medium) Add restrictive CSP baseline for packaged renderer

### Quality, Tooling, and Developer Experience
- [ ] (Medium) Add end-to-end Electron smoke tests for primary user journeys
- [ ] (Medium) Add API contract tests between Electron preload bridge and Python backend bridge
- [ ] (Medium) Add unified developer diagnostics command that runs compact checks + focused frontend validation
- [ ] (Low) Add contributor architecture diagrams and a "how data flows" reference doc

### Longer-Term Enhancements
- [ ] Cloud sync (optional account-based profile sync)
- [ ] Sentence mining workflow and contextual example cards
- [ ] Theme presets and advanced UI personalization
- [ ] Mobile companion app (read-only progress + lightweight reviews)
