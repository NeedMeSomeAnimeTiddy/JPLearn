# JPLearn Features

Updated: 2026-07-21

JPLearn is a desktop Japanese learning app focused on daily retention, fast review loops, and measurable progress. It combines an Electron + React + TypeScript frontend with a Python backend running FSRS spaced repetition, game-like practice modes, and progress analytics.

---

## Learning Content

### Scripts & Writing Systems
- **Hiragana** — Complete set (46 base + voiced/semi-voiced/digraphs = 104 characters)
- **Katakana** — Complete set (mirroring hiragana structure)
- **JLPT Kanji** — N5 through N1 kanji (thematic categories for N5: numbers/time, nature/world, people/body, study/language, actions/travel; extended categories for N4–N1)
- **JLPT Vocabulary** — N5 through N1 vocabulary with thematic groupings (greetings, numbers, time, family, body, food/drink, school, places, transport, adjectives, verbs, nouns)
- **Grammar Patterns** — 64+ grammar patterns covering copula, particles, verb forms, adjectives, question words, connectives, and key expressions
- **Sentence Examples** — Structured example sentences for grammar-in-context learning

### Deeper Content Tracks
- **Conjugation Pattern Reference** — A flashcard deck (`conjugation_training`) covering verb/adjective conjugation pattern names and usage (e.g. "〜ています" / ongoing action), with staged block progression. This is recognition content; the interactive counterpart where the learner *produces* a conjugated form is the **Conjugation Drill** minigame (see Grammar Modes below). The reference deck itself still isn't exposed anywhere in the frontend UI today (no `ScriptKey`/minigame wiring) — it exists only as backend deck + block-progress data.
- **Reading Practice** — Narrative story rounds that surface example sentences as reading passages with comprehension tracking
- **Kanji Handwriting** — Canvas-based stroke-order writing minigame (mouse/touch/stylus) using `hanzi-writer`, validating stroke order/direction/completeness; currently scoped to N5 characters

---

## Practice Modes (Minigames)

### Recognition Modes
| Mode | Description |
|------|-------------|
| **Romaji Sprint** | Type the romaji reading as quickly as possible |
| **Meaning Match** | Pick the correct meaning from four choices |
| **Character Match** | Pick the correct character for the given meaning |

### Recall Modes
| Mode | Description |
|------|-------------|
| **Stroke Order** | Type kanji from meaning while reinforcing writing sequence |
| **Handwriting** | Draw the kanji stroke-by-stroke on a canvas (mouse/touch/stylus); validates order, direction, and completeness |
| **Typed Recall** | Type the meaning directly with near-miss tolerance (Levenshtein distance, transposition detection) |
| **Speech Recall** | Say the meaning aloud — transcribed and graded offline via VOICEVOX/Whisper |

### Challenge Modes
| Mode | Description |
|------|-------------|
| **Sentence Assembly** | Arrange shuffled sentence chunks into natural Japanese order (Fugashi/MeCab tokenization) |
| **Particle Cloze** | Fill the missing particle using sentence context and word-order cues |
| **Context Cloze** | Fill the missing word (not a particle) using the surrounding example-sentence context |
| **Kanji Compound Builder** | Pick the correct multi-kanji word, hinted by each component kanji's individual meaning |
| **Vibe Check** | Read social register/tone and classify sentence as polite, casual, formal request, or context-dependent |
| **Imposter** | Find the deliberate grammar error injected into a sentence (particle swaps, conjugation mutations) |
| **Conjugation Drill** | Type a verb or adjective in a requested form (te-form, potential, passive, causative-passive, …); forms unlock by curriculum stage |

### Listening Modes
| Mode | Description |
|------|-------------|
| **Recognition** | Hear a word and choose its meaning — character hidden until feedback |
| **Dictation** | Listen and type the romaji for what you hear |

### Blended Mode
| Mode | Description |
|------|-------------|
| **Interleave Mix** | Cycles through reading, meaning, and character rounds in one session |

### Per-Script Minigame Availability
Each script deck has a tailored set of available minigames (`electron-frontend/src/constants.tsx` `SCRIPT_MINIGAMES`):

- **Hiragana / Katakana**: romaji_sprint, meaning_match, character_match, handwriting, sentence_assembly, particle_cloze, imposter, speech_recall, listening (recognition), dictation, context_cloze, interleave_mix
- **Kanji N5**: romaji_sprint, meaning_match, character_match, stroke_order, handwriting, typed_recall, speech_recall, particle_cloze, imposter, context_cloze, listening (recognition), interleave_mix
- **Vocab N5**: meaning_match, character_match, typed_recall, kanji_compound_builder, speech_recall, particle_cloze, imposter, context_cloze, listening (recognition), dictation, interleave_mix
- **Grammar Patterns**: meaning_match, character_match, typed_recall, speech_recall, sentence_assembly, particle_cloze, vibe_check, imposter, context_cloze, listening (recognition), interleave_mix
- **Sentence Examples**: meaning_match, character_match, typed_recall, speech_recall, sentence_assembly, imposter, context_cloze, listening (recognition), interleave_mix

---

## Spaced Repetition (SRS)

### FSRS (Free Spaced Repetition Scheduler)
- **Algorithm**: FSRS v4 forgetting-curve model implemented in pure Python (stdlib only)
- **Three memory parameters**: stability (days until 90% recall), difficulty (1–10 scale), retrievability (current recall probability)
- **Quality mapping**: Legacy 0–5 quality scale mapped to FSRS ratings (Again=1, Hard=2, Good=3, Easy=4)
- **Default weights**: FSRS-4.5 default 17-parameter optimizer weights
- **Confidence blending**: Optional 1–5 confidence score blended with quality (70/30 ratio) for effective performance
- **Interval computation**: Power-law retrievability with configurable target retention (default 90%)

### SM-2 Fallback
- Alternative SM-2 implementation with ease factor adjustment (range 1.3–2.8)
- Configurable target retention (0.70–0.99) and review load (light/normal/heavy)

### Adaptive Queue Building
- Balanced interleaving of due (×3), leech (×1), new (×1), and review (×1) cards
- Deterministic, starvation-free blending algorithm
- Leech detection: sliding window of 5 recent attempts, ≥3 failures = leech-flagged

---

## Progression & Unlock Systems

### Block-Based Progression
- Ordered blocks within script decks (e.g., vowels → K-row → S-row for hiragana)
- Sequential unlock: block N unlocks once block N−1 reaches 80% mastery (70% for grammar/sentence/conjugation decks)
- Block mastery: fraction of cards answered correctly at least once

### Progression Graph
- Multi-node DAG with defined prerequisites and mastery thresholds
- Node states: locked → unlocked → active → mastered
- Node categories: tutorial, hiragana, katakana, vocabulary, grammar, scripted_conversation, listening, kanji, free_conversation, reading, jlpt
- Mastery requirements: configurable ratio + absolute minimum counts
- Mastery rewards: milestone badges and content descriptors

### Feature Unlock System
- Backend model for feature gating via progression node mastery (e.g., listening_mode requires hiragana mastery) and feature dependency chains (e.g., tutor_chat requires conversation_mode)
- Currently cataloged features: themes, achievements, listening_mode, conversation_mode, kanji_mode, reading_mode, advanced_analytics, jlpt_dashboard, tutor_chat
- **Not currently used to gate navigation or minigame access in the frontend** — nothing in the Electron UI reads `is_unlocked` except the Achievements panel (for the "badge" rewards below). Every feature is reachable from the UI regardless of unlock state today; this system only drives which feature-unlock badges show as earned.

### Milestone Achievement Badges
- Review-count milestones (100 / 500 / 1,000 reviews completed) and best-streak milestones (3 / 7 / 14 / 30 / 100 days), independent of the feature-unlock badge system above
- Node-mastery badges (tutorial, hiragana, katakana, scripted conversation, free conversation, reading, JLPT N5-N1) tied to the progression graph's "milestone"-type rewards; silent (no toast) since node mastery already has its own tutor-reaction celebration
- Sticky once earned (persisted in `user_badges`); review-count and streak milestones fire a celebratory toast the moment a threshold is crossed
- Shown alongside feature-unlock badges in the Achievements panel on the Overview page
- Progression-node mastery is synced from live review data on each read for the six deck-backed nodes (tutorial, hiragana, katakana, vocabulary_n5, grammar_n5, kanji_n5). The other ten report `is_tracked: false` and no ratio: a signal exists for some of them (`review_events.tags_csv`, `scenario_sessions`, `jlpt_exam_results`) but none carries a denominator, and a fabricated 0% cannot be recognised as wrong. `sentence_examples` is excluded on purpose — the bridge serves the full ~60k sentence corpus, so its 80% requirement is unreachable
- Tutorial completion accepts existing review history as well as the onboarding flag, because onboarding is skippable and every other node chains off it

### Curriculum Map
- The 16-node `JPLEARN_GRAPH` rendered on Home (`src/features/progression/`): position, what is finished, what is next
- **Soft gating** — a gated node is never unreachable. Clicking one opens the same confirmation the readiness warning uses, and the choice is remembered per node
- Readiness labels (completed, suggested_next, recommended, challenging, advanced) with per-step mastery percentages
- Section order is *derived* from the graph. The `LEARNING_PATHS` dict, its `complete_beginner` path, the `active_learning_path` setting and the path-selection command were removed in #78 Phase 5 — one curriculum, one definition

---

## XP & Leveling

### XP System
- Sources: correct_answer (10 XP), streak_bonus (25 XP), mastery_milestone (100 XP), daily_completion (50 XP), feature_unlock_bonus (75 XP)
- Dedup-key based idempotency (prevents double-counting)
- Level curve: iterative scaling (base=100 XP, factor=1.5×, max level=100)

### Streak Tracking
- UTC + local day tracking for cross-timezone correctness
- Same-day repeated events don't inflate streak
- Gaps of 2+ days reset to 1
- Best streak tracked alongside current streak

---

## Session Management

### Goal Setting
- Pre-session targets: items, optional minutes, optional accuracy
- Session summary with completion metrics (reviewed, correct, accuracy, goal_met)
- Goal achievement: items completed + optional accuracy threshold

### Lifestyles & Session Config
- Configurable lives per session (default 3)
- Session length presets: short (8 items), medium (12), long (20)
- Leech focus toggle, confidence capture toggle
- Session run report: rounds, correct/wrong, accuracy, points, lives, confidence stats

---

## Analytics & Progress Visibility

### Deck-Level Stats
- Total cards, mastered count, due today, completed today
- Per-deck summary with on_date window

### Activity Windows
- 7-day and 30-day aggregated summaries (reviews, accuracy, active days, points)
- Mistake breakdown: error rate grouped by script tag, sorted by severity
- Per-item history: recent review events with trend classification (improving/stable/declining)

### Character Mastery Overview
- Overview of character mastery across kana blocks and kanji coverage

### Curriculum Stage Summaries
- Stage distribution (stages 1–3) for context_cloze mode
- Accuracy metrics (all-time + 7-day window)

### Narrative Chapter Metrics
- Per-chapter attempts, accuracy, completion rate for narrative story content

### JLPT Readiness
- Per-level readiness across vocab + kanji (mastery % + is_ready flag)
- Recommended target level based on readiness

### CSV Exports
- Review history export (CSV)
- Accuracy trends export (per-day aggregates, CSV)
- Mastery snapshot export (card-level mastery status, CSV)

---

## Assistant & Tutor

### Coach Assistant
- Deterministic mood/emotion modeling from study signals (accuracy, streaks, leeches, mistakes, curriculum stall)
- 8 mood states: coach_neutral, coach_supportive, coach_celebratory, coach_alert
- Scripted events: session_goal_met, streak_milestone, leech_intervention, weakness_spike, curriculum_stall, activity_nudge, session_recovery, momentum_encouragement, ambient_checkin
- Dedup-key filtered with configurable cooldowns per event priority × popup cadence

### LLM Tutor Integration
- llama.cpp runtime (local CPU inference, no cloud dependency)
- Tutor chat UI with status, preload, send, cancel, unload controls
- Tutor reaction system: converts progression/feature/level/recommendation events into structured messages (congratulation, encouragement, guidance, acknowledgement)
- Automatic model selection: GGUF model auto-detected by RAM (low/medium/high/ultra tiers)
- Setup wizard for optional model download

### Assistant Memory & Context
- Memory facts table with embedding-based retrieval (hashed character trigram vectors)
- Chat summaries for long-context retention
- Chat interaction tracking (dismissal, feedback, snooze)

---

## Voice & Pronunciation

### VOICEVOX Integration
- Local Japanese speech synthesis via VOICEVOX engine (127.0.0.1:50021)
- Multiple built-in Japanese voices selectable in settings
- Speaker selection and speech speed control
- Voice runtime status and preload controls

### Speech Recognition
- Whisper model integration for offline speech-to-text
- Speech recall minigame: spoken answer transcribed and graded locally

---

## Customization

### Themes
- Multiple themes including light and dark variants
- Background style options

### Typography
- Font size controls
- Japanese-friendly font presets

### Behavior
- Animation behavior settings (reduced-motion support)
- Keyboard shortcut settings
- Tutor, voice, and voice runtime settings

### Accessibility
- Keyboard accessibility baseline
- Focus rings on all interactive elements
- Semantic HTML structure
- Reduced-motion support

---

## Desktop Application

### Electron Shell
- Frameless window with custom title bar (minimize, maximize/restore, close)
- Sandboxed renderer with context isolation
- Strict CSP policy for packaged builds
- `will-navigate` deny policy + `setWindowOpenHandler` allowlist
- Startup theme persistence

### IPC Bridge
- Typed IPC contracts between preload bridge and Python backend
- Trusted sender/frame validation on every `ipcMain.handle` route
- Shared request validation helpers and typed payload guards
- Structured error wrapping on IPC responses

### Packaging & Distribution
- Windows installer via electron-forge / Squirrel
- GitHub Actions release workflow (tag → build → publish)
- Automatic database migration on first launch
- User data stored in `Documents\JPLearn\` (survives uninstall/reinstall)

---

## Data & Operations

### SQLite Persistence (jplearn.db)
- review_states table (FSRS state per card: stability, difficulty, interval, ease_factor, next_review, last_review)
- review_events table (full review history with quality, timestamps, session_id, confidence_score)
- streak_state table
- leech_items table (per-card leech tracking)
- curriculum_stages table (stage 1–3 progression per card/mode)
- session_goals table
- assistant tables (state snapshots, events, chat turns, memory facts, summaries, interactions)
- user_progression table
- user_feature_unlocks table
- user_xp table (total XP, level, dedup keys)
- tutor_reactions_seen table
- jlpt_exam_results table
- user_settings key/value table
- Schema migration framework (11 migrations, deterministic rollback-safe strategy)

### Dev/Replay Fixture Store (app.db)
- Not live app persistence — used only by `scripts/srs_apply.py`, `srs_check.py`, `srs_replay.py`,
  `db_check.py`, and `tests/test_database_migrations.py`
- SRS items repository via SRSRepository (id, last_interval, ease_factor, due, updated_at)
- Real runtime SRS state lives in `data/jplearn.db` `review_states` via `data/database.py`

### Text Normalization
- Japanese normalization: NFC + prolonged sound mark unification + punctuation variants
- Applied at every persistence boundary

### Import & Export
- CSV import pipeline for external datasets (kanji, vocab, conversational content)
- Progress snapshot export/import (JSON, with merge/overwrite conflict modes)
- CSV analytics exports (review history, accuracy trends, mastery snapshot)
- External content module regeneration from CSV (`import_external_lists.py`)

### Database Operations
- Schema version tracking and migration system
- Database reset (clears all progress, keeps schema)
- Deterministic migration validation

---

## Developer Tooling

### Validation Pipeline
- `python scripts/dev.py` — unified developer diagnostics (arch check + DB check + SRS check + lint + build + tests)
- `python scripts/arch_check.py` — layer boundary enforcement
- `python scripts/db_check.py` — database integrity verification
- `python scripts/srs_check.py` — SRS contract correctness
- Automated accessibility checks (axe-core frontend tests)
- Performance regression tests for large datasets (10k+ items)

### Debug Tools
- `debug_tools.py snapshot` — state snapshot
- `debug_tools.py checks` — integrity checks
- `debug_tools.py diagnostics` — diagnostic output
- Backfill review event prompts utility

### Testing
- Python: pytest test suite (30+ test files covering domain logic, data layer, SRS, sessions, progression, features, XP, tutor, JLPT, grammar minigames, curriculum, scheduler, distractor ranking, typed answer, streaks, leech, text normalization, desktop bridge, deck portability, history trends, session goals, features)
- Frontend: vitest + @testing-library/react + axe-core accessibility tests
- End-to-end Electron smoke tests for primary user journeys
- API contract tests between preload bridge and Python backend

---

## Supporting Infrastructure

### Setup & Onboarding
- Setup wizard for optional model downloads (llama.cpp, GGUF, VOICEVOX)
- Session recovery command (`npm run session:recover`)
- One-time database migration from legacy locations

### Offline Dictionary
- Offline dictionary SQLite builder (`build_offline_dictionary_sqlite.py`)
- Dictionary popup UI for in-session lookups

### Sentence Bank
- Cleaned Jotoba sentences TSV (`clean_jotoba_sentences_tsv.py`)
- 200K+ sentence corpus from native content
- Update sentence examples from external data

### Grammar Minigame Infrastructure
- Fugashi/MeCab tokenizer integration for Japanese morphological analysis
- Particle-attached chunk building for sentence assembly
- Contextual distractor pool generation for particle cloze
- Social register inference (vibe check)

### Embedding & Retrieval
- Hashed character-trigram embedding (256-dim, deterministic, dependency-free)
- Cosine similarity ranking for assistant memory retrieval
- Optional transformer-based encoder (multilingual-e5 models)

---

## Security & Reliability

- Trusted IPC sender checks (frame/sender validation per route)
- Payload validation for deck IDs, session IDs, limits, and typed request bodies
- Structured error wrapping on IPC responses
- Restrictive Content-Security-Policy for packaged renderer
- Electron sandbox enabled with verified preload compatibility
- No account, no telemetry, no tracking — fully offline

---

## Notes

- The legacy Python GUI entrypoint (`main.py`) is deprecated and raises `RuntimeError`.
- The supported interactive surface is the Electron frontend.
