# JPLearn Roadmap

Updated: 2026-07-02

This document tracks delivery status and planned improvements.

## Status Snapshot

- [x] Electron + React + TypeScript desktop client shipped
- [x] Core SRS mechanics, streaks, history, leech handling, and distractor quality improvements shipped
- [x] Keyboard accessibility baseline, reduced-motion support, and overview analytics shipped

## Now / Next (Highest Priority)

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
- [x] (Medium) Add unified developer diagnostics command
  - Chain compact checks with focused frontend validation (`npm run lint`, `npm run build`)
  - Provide a single pass/fail entry point for pre-commit and CI triage

## Near-Term Product Roadmap

- [x] (High) Introduce adaptive study queue balancing
  - Blend due items with weak-tag reinforcement and new-item pacing
  - Add deterministic queue tests to avoid starvation of any deck type
- [x] (High) Add session goals and completion tracking
  - Daily target setting (items/time/accuracy)
  - End-of-session summary against target with streak-aware messaging
- [x] (Medium) Expand answer modes
  - Typed recall mode for vocab and kanji decks
  - Optional confidence score capture per review event
- [x] (Medium) Apply confidence scores to SRS scheduling
  - Confidence is captured per review event but not yet factored into interval calculation
  - Define rubric for blending confidence with correctness in ease factor updates
- [ ] (Medium) Add custom deck builder and card creation workflow
  - UI for creating, editing, and deleting custom cards and decks
  - Validation and conflict checking against existing content
  - Data layer placeholder already exists; needs form UI and bridge routes
- [x] (Medium) Add progress analytics export
  - Export review history, accuracy trends, and mastery snapshots to CSV
  - Useful for external study tracking and self-audit
- [ ] (High) Add session resume and per-mode defaults
  - Restore the last deck, study mode, and prompt settings after restart
  - Remember audio, hint, lives, and confidence preferences per mode
  - Reduce setup friction for short daily study sessions

## Data Quality and Content Operations

- [x] (High) Enforce Japanese normalization at all persistence boundaries
  - Centralize normalization utilities used by all repositories/importers
  - Add regression tests for kana width, prolonged sound marks, and punctuation variants
- [x] (Medium) Improve external content ingestion pipeline
  - Add stricter CSV schema checks with actionable error output
  - Add deduplication and conflict reporting across imported lists
- [x] (Medium) Add deck import/export workflow
  - Export user progress and custom decks
  - Import with merge/overwrite conflict modes

## Frontend, Performance, and Release Engineering

- [x] (High) Bundle fonts locally for offline startup reliability
- [x] (Medium) Add startup performance budget and telemetry checkpoints
- [x] (Medium) Defer non-critical renderer work until after first meaningful paint
- [x] (Medium) Add packaged smoke tests in CI (`npm run build`, package, launch check)
- [x] (Medium) Add restrictive CSP baseline for packaged renderer
- [ ] (Low) Add streaming playback for local Japanese voice synthesis (qwentts.cpp)
  - Current voice runtime returns one-shot WAV audio per utterance; qwentts.cpp's
    `tts-server.exe` also supports `response_format: "pcm"` chunked streaming for
    lower perceived first-audio latency on longer utterances
  - Requires new IPC chunk-event plumbing (start call + streamed chunk events +
    done event, similar in shape to the existing `setup:download-progress`
    pattern), a streaming variant in `qwentts_runtime.cjs`, and client-side
    Web Audio API buffer scheduling to play chunks back-to-back without gaps
  - Deferred: JPLearn's typical utterances are short (single words/sentences),
    so the perceived-latency win is likely modest versus the implementation
    and audio-QA cost; revisit if real usage shows synthesis latency as an
    actual complaint

## UX, Delight, and Quality of Life

- [ ] (High) Add a quick resume entry point for the last study session
  - Open the most recent deck and mode from the home screen with one click
  - Offer a "resume" action that restores the previous round state when possible
- [ ] (Medium) Add streak celebrations and milestone rewards
  - Show lightweight burst animations, badges, or toast moments for long streaks
  - Keep effects tasteful and easy to disable for distraction-free study
- [ ] (Medium) Add one-tap retry for missed items from the session summary
  - Requeue wrong answers and near-misses into a short recovery run
  - Make it easier to fix weak spots immediately after a session ends
- [ ] (Medium) Add a shortcut cheat sheet and command palette for study actions
  - Surface the most common keys and actions without leaving the study flow
  - Make keyboard-driven navigation easier to discover for new users
- [ ] (Low) Add quick dictionary lookup from answer reveals and summaries
  - Let users jump from a missed item to a lookup without losing session context
  - Support faster review of unfamiliar words and kanji

## Quality, Tooling, and Developer Experience

- [x] (Medium) Add automated accessibility checks
  - Integrate axe-core or equivalent into the frontend test suite
  - Cover primary study and overview flows with automated assertions
- [x] (Medium) Add performance regression tests for large datasets
  - Validate queue build, deck summary, and history aggregation with 10k+ items
  - Establish baseline thresholds to catch regressions before they ship

## Deferred Product Additions

- [ ] (Medium) Add Reading Mode feature UI
  - Reading mode is defined in feature catalog but not yet integrated into main UI
  - Implement as a dedicated study mode for graded passages and reading comprehension
  - Reuse existing sentence bank and example content
- [ ] (Medium) Add Advanced Analytics dashboard
  - Advanced analytics feature is defined in catalog but not yet implemented
  - Surface granular progress metrics, error patterns, and retention curves
  - Build on top of existing review history and progress tracking
- [ ] (Medium) Add JLPT Dashboard feature
  - JLPT dashboard is defined in feature catalog but not yet integrated into UI
  - Display JLPT-level-specific progress across vocab, kanji, grammar, listening, and reading
  - Show exam readiness assessment and content gaps
- [ ] (Medium) Add Anki .apkg import compatibility
  - Map Anki note types and field names to JPLearn card structure
  - Preserve deck hierarchy, tags, and review history on import
- [ ] (Low) Complete LLM tutor integration beyond scripted fallbacks
  - llama.cpp runtime and chat UI exist; prompt pipeline currently uses scripted stubs
  - Wire full context assembly (activity, history, mistakes) into live model calls
  - Add integration tests with a mock model adapter

## Content and Learning Expansion

### Phase 1: Foundation

- [x] (High) Add a large sentence and example bank
  - Example sentences are attached to vocab, kanji, and grammar cards
  - Sentence content also ships as a dedicated deck and importer-backed source for staged exposure
- [x] (High) Expand grammar curriculum into a structured path
  - Grammar progression now exposes ordered blocks for staged exposure
  - The curriculum path is split into structured sentence and grammar surfaces
- [x] (Medium) Add dedicated conjugation training
  - Conjugation training now ships as a dedicated deck with staged block progression
  - Verb and adjective forms are covered with the existing review and bridge plumbing

### Phase 2: Skill Expansion

- Current focus: move these learning modes from roadmap into implementation.
- Suggested order:
  1. Reading practice content first, since it can reuse the existing sentence bank and example content without adding new media plumbing.
  2. Listening comprehension modes second, once audio delivery and playback strategy are defined.
  3. Kanji writing and stroke-order practice last, because it needs the most new interaction and progress-tracking work.
- Shared plan across all three items:
  - Reuse the existing card/deck model where possible instead of inventing new content types.
  - Keep progression and mastery tracking aligned with the current review pipeline.
  - Add focused tests for content shape, progression rules, and visible UI behavior before expanding to the next mode.
- [x] (Medium) Add reading practice content
  - Introduce graded passages, short dialogues, and article-style reading sets
  - Track comprehension questions and unknown-word lookups per passage
  - Narrative story rounds now surface example sentences as reading passages in the app
- [ ] (High) Add listening comprehension study modes
  - Support prompt-first, audio-first, and dictation-style review flows
  - Reuse the same content items across vocab, grammar, and sentence listening drills
- [x] (Medium) Add kanji writing and stroke-order practice
  - Support recognition vs. recall vs. writing mastery as separate skills
  - Store stroke hints, writing prompts, and production-specific progress
  - Kanji rounds now include a stroke-order writing drill for N5 characters
- [ ] (Medium) Animate kanji stroke-order playback
  - Replace static stroke-order hints with animated SVG stroke-by-stroke playback
  - Show direction, count, and sequence during writing drill mode

### Phase 3: Personalization

- [x] (Medium) Add personalized study plans and JLPT coverage tracking
  - Show gaps across vocab, kanji, grammar, listening, and reading by level
  - Generate daily plans based on target exam, timeline, and weak areas

## Longer-Term Enhancements

- [ ] Cloud sync (optional account-based profile sync)
- [ ] Sentence mining workflow and contextual example cards
- [ ] Theme presets and advanced UI personalization
- [ ] Mobile companion app (read-only progress + lightweight reviews)
- [ ] Furigana and reading-aid rendering in card display
  - Attach ruby/furigana markup to vocabulary and sentence cards
  - Toggle reading aids on/off per study mode to control difficulty
  