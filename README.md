# JPLearn
A Python-based Japanese learning app inspired by Anki, covering Hiragana, Katakana, and Kanji using spaced repetition.

---

## Contributing / Dev Workflow

1. Install dependencies:
   `python -m pip install -r requirements.txt`
2. Run the CLI app:
   `python main.py`
3. Run the GUI app:
   `python gui.py`
4. Run the full development checks:
   `python scripts\dev.py`
5. Run targeted tests while working:
   `python -m pytest tests\path\to\test_file.py -q`

`scripts\dev.py` is the main gate and runs type checks, architecture checks, DB checks, SRS checks, then tests.

---

## Project TODO

### Architecture & Code Health
- [x] Keep strict layer boundaries: `domain/`, `data/`, `ui/`
- [ ] Remove or migrate remaining legacy code in `src/`
- [ ] Improve type coverage for public APIs (`mypy --explicit-package-bases`)
- [ ] Add/update docstrings in domain and data public interfaces
- [x] Add a lightweight "contributing/dev workflow" section to this README

### Learning Content
- [x] Ship Hiragana deck
- [x] Ship Katakana deck
- [ ] Add first Kanji deck (start with JLPT N5)
- [ ] Add vocabulary decks grouped by topic and JLPT level
- [ ] Add basic grammar pattern cards (particles, verb forms, sentence templates)

### SRS & Study Logic
- [x] Persist and apply SRS scheduling in SQLite-backed flow
- [ ] Add configurable target retention / review load settings
- [ ] Add "leech" handling for repeatedly failed items
- [ ] Add smarter distractor generation for future multiple-choice sessions
- [ ] Add per-item study history view (last reviews + outcome trend)

### User Experience (CLI + GUI)
- [x] Maintain working CLI flow (`main.py`)
- [x] Maintain working Tkinter app flow (`gui.py`)
- [ ] Add multiple-choice mode
- [ ] Add typed-answer mode with tolerant input checking
- [ ] Improve session summary screen (time spent, accuracy, weakest items)
- [ ] Add optional stroke-order display where assets are available

### Progress & Insights
- [x] Show per-deck mastery progress
- [ ] Add daily streak tracking
- [ ] Add weekly/monthly activity summary
- [x] Add "due today vs completed today" progress indicator
- [ ] Add mistake breakdown by script/tag (hiragana/katakana/kanji/vocab)

### Data & Reliability
- [x] Keep `data/app.db` and `data/jplearn.db` responsibilities separate
- [ ] Add backup/restore command for local DB files
- [ ] Add migration/version marker for DB schema changes
- [ ] Add import/export for decks and user progress
- [ ] Strengthen normalization checks for Japanese text at data boundaries

### Stretch Goals
- [ ] Audio pronunciation playback (pre-recorded or TTS)
- [ ] Sentence mining/import workflow
- [ ] Theme/customization options in GUI
- [ ] Optional cloud sync
- [ ] Optional web frontend
