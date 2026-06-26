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
9. Export or import progress snapshots:
   `python scripts\deck_portability.py export --output data\exports\progress.json`
   `python scripts\deck_portability.py import --input data\exports\progress.json --mode merge`

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
- Lightweight queue/session/typed diagnostics:
   `python scripts\debug_tools.py diagnostics`
- JSON diagnostics output:
   `python scripts\debug_tools.py diagnostics --json`

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
- [x] (High) Add database migration framework
   - Add schema version table/marker
   - Add deterministic migration runner and rollback-safe strategy
   - Add migration tests for fresh install and upgrade paths
- [x] (High) Add end-to-end Electron smoke tests for primary user journeys
   - Cover app launch, study session start, answer submit, and session completion
   - Run against packaged app artifact in CI for release confidence
- [x] (High) Add API contract tests between preload bridge and Python backend bridge
   - Pin request/response schemas for each supported IPC channel
   - Add negative tests for missing fields, wrong types, and unauthorized routes
- [ ] (Medium) Add unified developer diagnostics command
   - Chain compact checks with focused frontend validation (`npm run lint`, `npm run build`)
   - Provide a single pass/fail entry point for pre-commit and CI triage

### Near-Term Product Roadmap
- [x] (High) Introduce adaptive study queue balancing
   - Blend due items with weak-tag reinforcement and new-item pacing
   - Add deterministic queue tests to avoid starvation of any deck type
- [x] (High) Add session goals and completion tracking
   - Daily target setting (items/time/accuracy)
   - End-of-session summary against target with streak-aware messaging
- [x] (Medium) Expand answer modes
   - Typed recall mode for vocab and kanji decks
   - Optional confidence score capture per review event

### Data Quality and Content Operations
- [x] (High) Enforce Japanese normalization at all persistence boundaries
   - Centralize normalization utilities used by all repositories/importers
   - Add regression tests for kana width, prolonged sound marks, and punctuation variants
- [x] (Medium) Improve external content ingestion pipeline
   - Add stricter CSV schema checks with actionable error output
   - Add deduplication and conflict reporting across imported lists
- [x] (Medium) Add deck import/export workflow
   - Export user progress and custom decks
   - Import with merge/overwrite conflict modes

### Frontend, Performance, and Release Engineering
- [x] (High) Bundle fonts locally for offline startup reliability
- [x] (Medium) Add startup performance budget and telemetry checkpoints
- [x] (Medium) Defer non-critical renderer work until after first meaningful paint
- [x] (Medium) Add packaged smoke tests in CI (`npm run build`, package, launch check)
- [x] (Medium) Add restrictive CSP baseline for packaged renderer

### Quality, Tooling, and Developer Experience
- [ ] (Low) Add contributor architecture diagrams and a "how data flows" reference doc

### Deferred Product Additions
- [ ] (Medium) Add pronunciation/audio support (deferred)
   - Pluggable TTS or bundled audio strategy
   - Cache policy for offline reliability

### Content and Learning Expansion
#### Phase 1: Foundation
- [ ] (High) Add a large sentence and example bank
   - Attach example sentences to vocab, kanji, and grammar cards
   - Include translation, reading support, and difficulty tags for staged exposure
- [ ] (High) Expand grammar curriculum into a structured path
   - Add lesson ordering from beginner through intermediate patterns
   - Include production drills for conjugation, particles, and sentence building
- [ ] (Medium) Add dedicated conjugation training
   - Cover verb and adjective forms with tense, polarity, and politeness transformations
   - Blend explanation cards with rapid-fire drill modes

#### Phase 2: Skill Expansion
- [ ] (Medium) Add reading practice content
   - Introduce graded passages, short dialogues, and article-style reading sets
   - Track comprehension questions and unknown-word lookups per passage
- [ ] (High) Add listening comprehension study modes
   - Support prompt-first, audio-first, and dictation-style review flows
   - Reuse the same content items across vocab, grammar, and sentence listening drills
- [ ] (Medium) Add kanji writing and stroke-order practice
   - Support recognition vs. recall vs. writing mastery as separate skills
   - Store stroke hints, writing prompts, and production-specific progress

#### Phase 3: Personalization
- [ ] (Medium) Add personalized study plans and JLPT coverage tracking
   - Show gaps across vocab, kanji, grammar, listening, and reading by level
   - Generate daily plans based on target exam, timeline, and weak areas

### Longer-Term Enhancements
- [ ] Cloud sync (optional account-based profile sync)
- [ ] Sentence mining workflow and contextual example cards
- [ ] Theme presets and advanced UI personalization
- [ ] Mobile companion app (read-only progress + lightweight reviews)
