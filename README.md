# JPLearn
A Python-based Japanese learning app inspired by Anki, covering Hiragana, Katakana, and Kanji using spaced repetition.

---

## Project TODO

### Project Structure
- [x] Set up Python project with `src/` layout and `requirements.txt`
- [x] Create `data/` directory for card/deck JSON or SQLite database
- [x] Create `main.py` entry point with a simple CLI menu
- [x] Organise modules: `cards.py`, `decks.py`, `scheduler.py`, `quiz.py`, `stats.py`

### Core Data & Content
- [x] Build Hiragana deck (46 base characters + dakuten/combos)
- [x] Build Katakana deck (46 base characters + dakuten/combos)
- [ ] Build Kanji deck (JLPT N5–N1 levels, with readings and meanings)
- [x] Store cards with fields: `character`, `romaji`, `meaning`, `example_word`, `audio` (optional)
- [x] Support card tags (e.g. `hiragana`, `katakana`, `kanji`, `jlpt-n5`)

### Spaced Repetition (Anki-inspired)
- [x] Implement SM-2 algorithm for spaced repetition scheduling
- [x] Track per-card stats: `ease_factor`, `interval`, `repetitions`, `next_review`
- [x] Persist review state to SQLite database
- [x] Support "Again", "Hard", "Good", "Easy" answer buttons (like Anki)

### Quiz & Learning Modes
- [x] Flashcard mode: show character, reveal answer on keypress
- [ ] Multiple-choice mode: pick the correct romaji/meaning from 4 options
- [ ] Writing prompt mode: user types the romaji/reading of a shown character
- [ ] Stroke order display (show PNG/SVG stroke diagrams where available)
- [x] Daily review queue: show only cards due today

### Progress & Stats
- [ ] Track total cards learned, review accuracy, and daily streaks
- [x] Show per-deck progress (e.g. "32/46 Hiragana mastered")
- [ ] Heatmap or summary of review history

### UI
- [x] Start with a terminal (CLI) interface using `rich` for formatting
- [x] Add a simple GUI later using `tkinter` or `PyQt6`
- [ ] Optional: web frontend using Flask/FastAPI + basic HTML

### Stretch Goals
- [ ] Vocabulary decks with example sentences
- [ ] Grammar tip cards
- [ ] Audio pronunciation using `gTTS` or pre-recorded clips
- [ ] Export/import decks in Anki `.apkg` format
- [ ] Leaderboard or gamification (XP, levels)
