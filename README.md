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

---

## Project TODO

### Architecture & Code Health
- [x] Keep strict layer boundaries: `domain/`, `data/`, `ui/`
- [x] Remove or migrate remaining legacy code in `src/`
- [x] Improve type coverage for public APIs (`mypy --explicit-package-bases`)
- [x] Add/update docstrings in domain and data public interfaces
- [x] Add a lightweight "contributing/dev workflow" section to this README

### Learning Content
- [x] Ship Hiragana deck
- [x] Ship Katakana deck
- [x] Add first Kanji deck (start with JLPT N5)
- [x] Add vocabulary decks grouped by topic and JLPT level
- [x] Add basic grammar pattern cards (particles, verb forms, sentence templates)

### SRS & Study Logic
- [x] Persist and apply SRS scheduling in SQLite-backed flow
- [x] Add configurable target retention / review load settings
- [ ] (High) Add "leech" handling for repeatedly failed items
- [ ] (Medium) Add per-item study history view (last reviews + outcome trend)
- [ ] (Medium) Add smarter distractor generation for future multiple-choice sessions

### User Experience (GUI)
- [x] Deprecate Python GUI entrypoints (`main.py`, `gui.py`)
- [x] Migrate frontend to Electron + React + TypeScript (`electron-frontend/`)
- [x] Add multiple-choice mode
- [x] (High) Add typed-answer mode with tolerant input checking (kana normalization, punctuation/whitespace-insensitive matching, minor typo tolerance)
- [x] (High) Add typed-answer feedback states (exact match, near miss, incorrect) before answer reveal
- [x] Improve session summary screen (time spent, accuracy, weakest items)
- [x] (Medium) Add keyboard-first review controls (submit, reveal, grade keys, next card)
- [x] (Medium) Add review mode controls in-session (multiple-choice/typed mix without restart)
- [x] (Medium) Add optional stroke-order display where assets are available
- [x] (Low) Add accessibility polish (font scaling, visible focus states, higher-contrast option)

### Progress & Insights
- [x] Show per-deck mastery progress
- [ ] (High) Add daily streak tracking
- [ ] Add weekly/monthly activity summary
- [x] Add "due today vs completed today" progress indicator
- [ ] Add mistake breakdown by script/tag (hiragana/katakana/kanji/vocab)

### Data & Reliability
- [x] Keep `data/app.db` and `data/jplearn.db` responsibilities separate
- [ ] (High) Add migration/version marker for DB schema changes
- [ ] (High) Strengthen normalization checks for Japanese text at data boundaries
- [ ] (Medium) Add backup/restore command for local DB files
- [ ] (Medium) Add import/export for decks and user progress

### Stretch Goals
- [ ] Audio pronunciation playback (pre-recorded or TTS)
- [ ] Sentence mining/import workflow
- [ ] Theme/customization options in Electron UI
- [ ] Optional cloud sync
- [ ] Optional web deployment mode
