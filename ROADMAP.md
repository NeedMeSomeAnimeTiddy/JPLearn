# JPLearn Roadmap

Updated: 2026-07-22

This document tracks delivery status and planned improvements. Completed items are
kept in a changelog section at the bottom; the main sections below focus on what
remains to be built.

---

## Now / Next (Highest Priority)

- [ ] **(High) App.tsx decomposition — issue #69, Phase 4b** (in progress on `refactor/issue-69-app-decomposition`)
  - Phases 1–3 + 4a done: App.tsx 7,451 → 4,060 lines. Pure helpers are in `src/lib/`,
    titlebar + settings modal are in `src/components/`, round builders are in
    `src/features/study-session/`.
  - **Remaining**: 44 `useState` + ~18 refs + ~1,236 lines of session logic → a
    `useStudySession` hook. `useState` is still 111 because no state has moved yet.
  - **Read [ISSUE-69-PHASE4.md](ISSUE-69-PHASE4.md) before starting** — it has the ref
    ownership map, the two refs that straddle the session boundary, and the
    characterization-test gate to run after every step.

- [ ] **(High) One-tap retry for missed items from session summary** ⬆️ promoted from Medium
  - Requeue wrong answers and near-misses into a short recovery run after a session ends
  - Make it easy to fix weak spots immediately after a session ends
  - **Status**: 0% — review_events table has per-card results with session_id, but no wrongCardIds state, no filtered startSession flow, no retry button

- [ ] **(Medium) JLPT Dashboard polish**
  - Feature is **~90% shipped**: full pipeline from domain → data → IPC → UI is wired
  - Add frontend tests for JLPTPrepView (currently zero)
  - Add score trend/analytics charts (current history is just a flat list)
  - Add "start studying toward recommended level" action button
  - Fix listening assessment note: currently shows "N/A" for all levels (by design — no listening content tracked)

---

## Study Flow & Content

- [ ] **(Medium) Custom deck builder and card creation workflow**
  - UI for creating, editing, and deleting custom cards and decks
  - Validation and conflict checking against existing content
  - Data layer placeholder exists; needs form UI and bridge routes
  - Allow users to import their own vocabulary lists with readings and meanings

- [ ] **(Medium) Card browser and search**
  - Browse all cards across decks with search and filtering by deck, tag, SRS state, or level
  - Preview card content, review history, and mastery status outside of study sessions
  - Useful for quick lookup, content audit, and finding specific items

- [ ] **(Medium) Custom study plans and adaptive learning paths**
  - Build on the existing learning path infrastructure
  - Let users choose between JLPT-focused, conversational, or mixed-study tracks
  - Dynamically adjust pacing based on accuracy and streak data
  - Generate daily plans based on target exam, timeline, and weak areas (partially shipped)

- [ ] **(Medium) Animate kanji stroke-order playback**
  - Replace static stroke-order hints with animated SVG stroke-by-stroke playback
  - Show direction, count, and sequence during writing drill mode
  - Could leverage KanjiVG data for stroke path data

- [ ] **(Medium) Reading Mode UI**
  - Feature exists in catalog (`reading_mode`) — graded passages for reading comprehension
  - Reuse existing sentence bank and example content
  - Add comprehension questions per passage with tracking

- [ ] **(Medium) Anki .apkg import compatibility**
  - Map Anki note types and field names to JPLearn card structure
  - Preserve deck hierarchy, tags, and review history on import
  - Enable users migrating from other SRS apps to bring their data

- [ ] **(Low) Batch deck management**
  - Reorder, archive, rename, and delete decks from the UI
  - Multi-select and batch card operations for managing content across decks

---

## UX, Delight & Quality of Life

- [ ] **(Medium) Streak celebrations and milestone rewards**
  - Show lightweight burst animations, badges, or toast moments for long streaks
  - Milestone events (3/7/14/30/100 days) already have `streak_milestone` assistant events
  - Keep effects tasteful and easy to disable for distraction-free study

- [ ] **(Medium) Weekly/monthly progress reports**
  - Automated report generation with accuracy trends, streak highlights, and weak-area recommendations
  - Optionally surfaced via the tutor banner system

- [ ] **(Low) Quick dictionary lookup from answer reveals and summaries**
  - Let users jump from a missed item to a lookup without losing session context
  - Support faster review of unfamiliar words and kanji
  - Dictionary popup infrastructure exists; needs tighter integration

- [ ] **(Low) Desktop study reminders and system tray integration**
  - Persistent system tray icon for quick access to the app
  - Configurable daily reminder notifications for missed/incomplete sessions

- [ ] **(Low) Study buddy / accountability pairing**
  - Optional feature: pair learners to share streak stats and provide mutual motivation
  - Completely opt-in, respecting offline-first design principles

---

## Advanced Analytics & Insights

- [ ] **(Medium) Advanced Analytics dashboard**
  - Feature exists in catalog (`advanced_analytics`) but not yet implemented
  - Surface granular progress metrics: retention curves, error patterns by script/deck/tag
  - Build on existing review history and progress tracking infrastructure
  - FSRS parameter visualization: stability/difficulty distributions per deck

- [ ] **(Medium) Pitch accent visualization**
  - Show pitch accent patterns (downstep notation) on vocabulary cards during reviews
  - Integrate with existing content data where accent info is available
  - High-value feature for learners targeting natural pronunciation

- [ ] **(Low) Spaced repetition statistics dashboard**
  - Graph of predicted retention over time vs actual performance
  - Per-card-type breakdown of intervals and ease factor trends
  - FSRS parameter optimizer feedback (optional advanced mode)

---

## AI & Tutor

- [ ] **(Low) Complete LLM tutor integration beyond scripted fallbacks**
  - llama.cpp runtime and chat UI exist; prompt pipeline currently uses scripted stubs
  - Wire full context assembly (activity, history, mistakes) into live model calls
  - Add integration tests with a mock model adapter
  - Expose model configuration in the settings UI (model selection, context length)

- [ ] **(Low) AI-powered writing journal**
  - Text editor with per-sentence grammar suggestions (via LLM backend)
  - Writing earns XP; every correction seeds new review cards
  - Similar to Clyda's journal + card-generation workflow

---

## Audio & Voice

- [ ] **(Low) Listening mode polish and expansion**
  - Add dictation mode (hear Japanese → type Japanese text) as a new minigame
  - Add sentence-level listening mode (play full sentence via VOICEVOX → comprehend or transcribe)

- [ ] **(Low) Lower-latency playback path for VOICEVOX**
  - Current voice runtime returns one-shot WAV per utterance
  - Investigate chunk-friendly playback to reduce perceived first-audio latency
  - Requires new IPC chunk-event plumbing, streaming-ready runtime, client-side Web Audio API scheduling
  - Deferred: typical utterances are short; revisit if latency becomes a user complaint

---

## Cross-Platform & Cloud

- [ ] **(Medium) Mobile companion app**
  - Read-only progress view + lightweight review queue
  - Sync via optional cloud account or local network transfer
  - Start with basic card review; expand to full feature parity over time

- [ ] **(Medium) Cloud sync (optional, account-based)**
  - Profile-based sync for study progress across devices
  - Optional: no account required for local-only use
  - End-to-end encrypted sync for privacy

- [ ] **(Medium) Browser extension for sentence mining**
  - Hover-over Japanese word lookup on any web page (like jpdb, Clyda, Yomichan)
  - One-click save to JPLearn review queue
  - Works alongside existing sentence bank and example content

- [ ] **(Low) Web-based study view**
  - Lightweight web client for quick review sessions without the Electron client
  - Reuses same Python backend via HTTP bridge instead of IPC

---

## Content Expansion

- [ ] **(Medium) Themed vocabulary packs**
  - Curated packs: travel, business, anime/manga, food/cooking, news, literary
  - Build on existing thematic category infrastructure
  - Community submission pipeline for user-created packs

- [ ] **(Medium) i+1 sentence cards**
  - Automatically generate sentence cards where only one word is new (all others are mastered)
  - jpdb-style contextual learning: learn vocabulary through sentences you can nearly read
  - Leverage existing mastery tracking to know which words are "known"

- [ ] **(Medium) Radical-based kanji learning**
  - Teach kanji via component radicals with visual breakdowns
  - Mnemonic hints for kanji components
  - WaniKkani-style radical → kanji → vocabulary progression

- [ ] **(Low) Furigana and reading-aid rendering in card display**
  - Attach ruby/furigana markup to vocabulary and sentence cards
  - Toggle reading aids on/off per study mode to control difficulty

- [ ] **(Low) Post-JLPT content (beyond N1)**
  - Business Japanese, news analysis, literary excerpts
  - Advanced kanji beyond the joyo list for specialized reading

---

## Performance & Infrastructure

- [ ] **(Low) FSRS optimizer integration**
  - Allow users to run the FSRS optimizer on their review history to compute personalized weights
  - Replace the fixed default weights with user-specific parameters
  - Optional advanced setting for power users

- [ ] **(Low) Batch import performance for large datasets**
  - Optimize the CSV import pipeline for 10k+ item imports
  - Add progress feedback during import operations

---

## Changelog (Completed)

### Shipped: Q3 2026
- **Session persistence and quick resume** — `SESSION_STORAGE_KEY`/`PREFS_STORAGE_KEY` restore the
  last deck, study mode, and prompt settings after restart; `components/ResumeToast.tsx` offers a
  one-click resume from the home screen
- **Activity heatmap** — `src/features/heatmap/` + `react-activity-calendar`, backed by the
  `daily-activity` bridge command
- **Shortcut cheat sheet and command palette** — `src/features/keyboard/` (`?` key cheatsheet) and
  `src/features/command-palette/` (Ctrl+K)
- **Listening comprehension study modes** — `listening_audio_first` and `listening_prompt_first` fully implemented end-to-end: round generation, VOICEVOX auto-play, character hide/show, multiple-choice grading, keyboard shortcuts, locking when VOICEVOX unavailable, stats tracking, tests
- **JLPT Dashboard** — full stack wired: domain readiness computation, 4 exam queue builders, score projection, exam results persistence, 4 IPC commands, JLPTPrepView.tsx (dashboard + exam runner + results panel + history), feature unlock gate
- **Kanji writing and stroke-order practice** — N5 characters support recognition vs. recall vs. writing
- **Reading practice content** — narrative story rounds with example sentences as reading passages
- **Dedicated conjugation training** — deck with staged block progression for verb/adjective forms
- **Grammar curriculum expansion** — structured path with ordered blocks for staged exposure
- **Large sentence and example bank** — attached to vocab, kanji, and grammar cards; dedicated deck

### Shipped: Q2 2026
- **Personalized study plans and JLPT coverage tracking** — gaps view across vocab/kanji/grammar
- **Advanced analytics dashboard** (defined in catalog, plan established)
- **Reading Mode** (defined in catalog, plan established)

### Shipped: Q1–Q2 2026
- **Electron + React + TypeScript desktop client shipped**
- **Core SRS**: FSRS algorithm (stability/difficulty/retrievability), interval computation, leech detection
- **Session goals**: target items, time, accuracy; end-of-session summaries
- **Answer modes**: typed recall, confidence scoring, near-miss tolerance
- **Adaptive queue balancing**: due/leech/new/review interleaving
- **Progress analytics**: 7d/30d activity, mistake trends, item history trends
- **Streak tracking**: UTC+local day awareness, best streak preservation
- **Game modes**: romaji_sprint, meaning_match, character_match, stroke_order, typed_recall, speech_recall, sentence_assembly, particle_cloze, vibe_check, imposter, listening modes, interleave_mix
- **Grammar minigame generator**: Fugashi/MeCab tokenizer, particle-attached chunking, contextual distractors, social register inference, imposter mutation engine
- **Coach assistant**: deterministic mood/momentum, scripted events, dedup-keyed cooldowns
- **Tutor integration**: event→message system, llama.cpp runtime, auto model download
- **Assistant memory**: embedding-based retrieval, chat summaries, interaction tracking
- **Dictionary popup**: offline SQLite dictionary, in-session lookup

### Shipped: Q1 2026
- **IPC hardening**: trusted sender validation, payload guards, structured error wrapping
- **Electron security**: sandbox, context isolation, will-navigate deny, CSP policy
- **Database migrations**: schema version tracking, 11 migrations, deterministic runner
- **E2E smoke tests**: app launch, study session, answer submit, session completion
- **API contract tests**: preload↔Python bridge request/response validation
- **Unified dev diagnostics**: `dev.py` aggregate check (arch + DB + SRS + lint + build + tests)
- **Data portability**: progress snapshot export/import (JSON, merge/overwrite)
- **CSV exports**: review history, accuracy trends, mastery snapshot
- **Text normalization**: NFC + dash/punctuation unification at all persistence boundaries
- **External content ingestion**: CSV schema checks, dedup, conflict reporting
- **UI customization**: themes (light/dark), backgrounds, fonts, animation preferences
- **Japanese voice**: VOICEVOX integration, speaker selection, speed control
- **Accessibility**: axe-core testing, keyboard nav, focus rings, semantic HTML
- **Performance**: startup budgets, deferred rendering, 10k+ item regression tests
- **Packaging**: Windows installer, CI release workflow, local font bundling
- **Feature unlock system**: progression-gated feature access, dependency chains
- **XP + leveling**: 5 XP sources, iterative level curve, dedup-key idempotency
- **Progression graph**: multi-node DAG with unlock/mastery requirements
- **Learning path**: guided beginner path with readiness labels
- **JLPT exam sessions**: mock exam, diagnostic, adaptive review, weak area drill
- **JLPT readiness**: per-level mastery readines, recommended target
