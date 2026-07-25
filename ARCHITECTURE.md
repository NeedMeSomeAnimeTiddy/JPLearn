# JPLearn Architecture Reference

Updated: 2026-07-22

Companion to [FEATURES.md](FEATURES.md) (what the app does) and [ROADMAP.md](ROADMAP.md)
(what's planned). This document describes **how the app is put together**, where the
seams are, and which structural weaknesses to design around. It is a reference for
future feature design — not a task list.

---

## 1. System Shape

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React 19 + Vite)                                   │
│   App.tsx (orchestrator: routing, deck loading, settings)    │
│   src/views/*        6 top-level screens                     │
│   src/features/*     21 self-contained hook-first modules    │
│   src/components/*   shared presentational components        │
│   src/lib/*          pure helpers + static content data      │
└───────────────── window.jplearnDesktop (preload) ────────────┘
                              │ contextBridge, 122 IPC routes
┌──────────────────────────────────────────────────────────────┐
│ Electron main process (CommonJS, electron/*.cjs)             │
│   main.cjs            window, lifecycle, bridge worker pool  │
│   ipc_handlers.cjs    122 ipcMain.handle routes              │
│   ipc_security.cjs    trusted sender + payload validation    │
│   setup_runtime.cjs   model/asset downloads                  │
│   llm_runtime.cjs     llama.cpp process management           │
│   voice_runtime.cjs   VOICEVOX process management            │
│   speech_runtime.cjs  Whisper STT server                     │
└──────── stdin/stdout JSON-lines (single child process) ──────┘
┌──────────────────────────────────────────────────────────────┐
│ Python backend                                               │
│   scripts/desktop_bridge.py   68-command dispatcher (6.1k LOC)│
│   domain/    pure logic, no I/O          (24 modules)        │
│   data/      SQLite persistence + normalization              │
└──────────────────────────────────────────────────────────────┘
```

**Enforced boundary:** `scripts/arch_check.py` forbids `domain → data`, `domain → ui`,
`data → ui`, `scripts → ui`. It inspects `src`, `domain`, `data`, `ui`, and `scripts`, and
prints a non-fatal size warning for any hand-written file over 2,000 lines (files whose first
line is an "Auto-generated" marker, like `domain/external_deck_data.py`, are exempt) —
currently `desktop_bridge.py` and `data/database.py`. The import-boundary check alone doesn't
stop a file from mixing concerns that belong in different layers; #70 step 2 peeled those
apart from `desktop_bridge.py` one concern at a time (dictionary/kanji/pitch-accent queries
moved to `data/dictionary_repository.py`; the dead OCR-translation path was deleted outright;
the `_run_command` dispatch table became a route table) and #74 finished the job by moving OCR
into `scripts/ocr_extraction.py` behind its own process — see §2.

---

## 2. The Python Bridge

### Transport

`main.cjs:1092 getOrStartPythonBridgeWorker()` spawns exactly one
`python scripts/desktop_bridge.py --server` child. Requests are newline-delimited JSON
envelopes (`{id, args}`) written to stdin; responses (`{id, ok, code, payload}`) are read
off stdout and matched back through a `pending` Map.

Fallback path: if a worker request rejects for any reason, `runPythonBridgeWithArgs`
retries as a **one-shot process spawn** (`runPythonBridgeWithArgsOneShot`), which pays
full interpreter + import cost.

### Structural consequences to design around

1. **Strictly serial execution.** `_run_server()` is a plain `for raw_line in sys.stdin`
   loop. The renderer can pipeline N requests, but the backend handles them one at a
   time. Any slow command head-of-line-blocks every other query.
   `fsrs-optimize` is the remaining known-slow command; it is routed through
   `runPythonBridgeIsolated` (a fresh one-shot process per call) rather than this shared
   worker, which avoids head-of-line blocking at the cost of paying full interpreter startup
   per call — acceptable for something invoked rarely and manually. OCR used to take the same
   route and paid that cost per image; it now has a dedicated persistent runtime (#74, see
   below). OCR translation (`assistant-chat:translate-ocr-text`) never touches the Python
   bridge at all — it calls `llm_runtime.cjs::translateText` directly; the bridge's own
   translation path was dead code and has been deleted (#70 step 2).

2. **Timeout kills shared state.** On `BRIDGE_REQUEST_TIMEOUT_MS` the handler calls
   `stopPythonBridgeWorker()`, and the resulting `close` event runs
   `rejectPendingBridgeRequests()` — so *one* slow request rejects every unrelated
   in-flight request and forces a cold restart.

3. **Positional string args only.** Commands take `argv: list[str]`; structured payloads
   are JSON strings passed as a single positional arg. There is no schema at the Python
   boundary — validation lives entirely in `ipc_security.cjs` on the Electron side.

If you add a long-running backend operation, do **not** put it on the shared worker.
Either give it a dedicated child process (the pattern `llm_runtime.cjs`,
`voice_runtime.cjs`, `speech_runtime.cjs`, and `ocr_runtime.cjs` already use) or make it a
job with a poll/progress channel.

### Dedicated runtimes

Four Electron-side modules own a long-lived child process each, so a slow model load is paid
once per app session instead of per request. Two shapes:

- **HTTP** — `llm_runtime.cjs` (spawns `llama-server`), `voice_runtime.cjs` (VOICEVOX engine).
- **Newline-JSON over stdin/stdout** — `speech_runtime.cjs` ↔ `scripts/speech_recognition_server.py`,
  `ocr_runtime.cjs` ↔ `scripts/ocr_server.py`. Same envelope shape as the bridge worker, but
  one dedicated process per concern rather than one shared one.

`ocr_runtime.cjs` (#74) is the newest. Notes that apply to any future runtime of this shape:

- Requests are **single-flight and queued** in the JS runtime, because the Python loop is
  serial. Without the queue, a request's timeout would count time spent waiting behind another.
- A **timeout kills and respawns** the child. The alternative — dropping the late response and
  reusing the process — starts the next request's clock against a still-busy engine.
- Inactivity unload is scheduled only **after a request settles**, so it cannot fire mid-inference.
- The child inherits `process.env` unchanged: `scripts/ocr_extraction.py` resolves its model-root
  candidates from `JPLEARN_ASSETS_DIR` / `JPLEARN_USER_DATA_DIR` / `JPLEARN_DOCUMENTS_DIR` at
  import, exactly as the old isolated spawn did.
- Setup handlers that install/select/uninstall an OCR model call `refreshOcrRuntime`, which just
  unloads: the next extraction spawns fresh against whatever is installed then. That includes
  `setup:apply-translation-profile` — the `ocr_qwen_local` profile installs the OCR model as one
  of its steps.
- The **first** request on a fresh process gets a much larger timeout budget than later ones
  (15 min vs 2 min), because engine init can involve downloading PP-OCRv6 weights from BOS when
  the paddlex cache is cold. The old one-shot path had no timeout at all; the budget exists to
  stop a wedged process, not to bound honest work.
- Path resolution in the packaged app: `forge.config.cjs` ships `../scripts` as an `extraResource`
  directory, and `repoRoot` (`path.join(__dirname, '..', '..')` from inside `app.asar`) lands on
  `resources/`, so `resources/scripts/ocr_server.py` resolves. `ocr_server.py`'s
  `from scripts.ocr_extraction import ...` relies on the same `__init__.py`-free namespace-package
  import that `desktop_bridge.py` already uses for `scripts.debug_tools`.

Measured on this repo's sample images (PP-OCRv6 medium, ONNX, CPU): one-shot 8.51s per image
vs. 8.17s cold / **0.19s warm** through the persistent server — the interpreter + `paddleocr`
import + engine init was ~98% of a warm call's old cost.

### desktop_bridge.py composition

Was 6,122 lines / 246 module-level defs at the start of #70; down to ~3,690 lines after #74.
Status per concern:

| Concern | Status |
|---|---|
| OCR (PaddleOCR) | **Moved** to `scripts/ocr_extraction.py`, driven by `scripts/ocr_server.py` in its own persistent process (#74). The bridge keeps `assistant-chat-ocr` as a thin CLI delegation; no desktop path routes OCR through the bridge any more. The image-preprocessing / dual-pass-fusion cluster (`_extract_dual_pass_ocr_payload` + 14 helpers, ~400 lines) was **not** ported — a whole-repo grep found it entirely self-referential with zero live callers and zero tests, the same finding as the MT row below, so it was deleted rather than carefully preserved. |
| Machine translation (llama.cpp, fastText LID, quality scoring) | **Deleted.** `translate_assistant_chat_ocr_payload` and ~25 helpers were dead code — the live `assistant-chat:translate-ocr-text` IPC handler calls `llm_runtime.cjs::translateText` directly and has no bridge fallback. Confirmed via whole-repo grep (only self-references, zero tests) before removal. |
| Offline dictionary + kanji detail + pitch accent (FTS5 queries) | **Moved** to `data/dictionary_repository.py`, including its 7 payload dataclasses. Semantic reranking is dependency-injected: the repo's `build_dictionary_search_payload(query, semantic_embed=...)` defaults to a pure hashed embedder (`domain.retrieval`); the bridge injects the real ONNX embedder when `embedder_runtime` + an active tier are available, else passes nothing and the default applies — behavior-preserving either way. Note-key builders (`build_builtin_note_key`, `build_offline_note_key`, `canonical_jmdict_source_id`) went to `data/card_notes_repository.py` instead (they're used for every card, not just dictionary-enriched ones, and the repository already owns the matching key validators); the shared Japanese-script predicate they both need went to `data/text_normalization.py` to keep the two repositories acyclic. |
| Deck/JLPT/progression assembly | **Not moved — the original framing was wrong.** These `build_*` functions (`build_deck_cards`, `build_progression_status`, `build_jlpt_readiness_payload`, etc.) are impure orchestrators: they call `data.database`/`data.study_pipeline` loaders and, for progression, write to the DB. The *pure* logic they delegate to already lives in `domain/` (`blocks`, `jlpt_readiness`, `jlpt_sessions`, `progression_service`). Moving the orchestrators themselves into `domain/` would violate the no-I/O rule; they stay in `scripts/`. |
| Dataclasses (the TS type source) | Split: the 7 dictionary/kanji/pitch payloads moved with their query code to `data/dictionary_repository.py`; the rest (deck/progression/XP/daily-games/etc.) stay in `desktop_bridge.py`. `scripts/generate_ts_types.py` now walks both files (`SOURCE_FILES`) — see below. |
| Command dispatch (`_run_command`) | **Done.** Each of the 67 `if command == "...":` branches became its own `_cmd_*(argv)` handler function (verified AST-identical to the original branch body — zero semantic diffs across all 67), registered in a `_COMMAND_HANDLERS: dict[str, CommandHandler]` table. `_run_command` is now a five-line lookup + call. |

`scripts/generate_ts_types.py` AST-walks every file in its `SOURCE_FILES` tuple
(`desktop_bridge.py`, `data/dictionary_repository.py`) and emits one TS interface per
`@dataclass` found, concatenated in file order, into `electron-frontend/src/generated/types.ts`
(`--check` mode detects drift). **Any new bridge payload should be a `@dataclass`, in
`desktop_bridge.py` or a repository module already in `SOURCE_FILES` (add the file to that
tuple if it's new), so the TS type is generated rather than hand-written.**

---

## 3. Persistence Model

### `data/jplearn.db` — the real database

`LATEST_SCHEMA_VERSION = 20`, forward-only migrations applied in `_apply_migrations`.
32 tables, grouped:

- **SRS core** — `review_states` (FSRS stability/difficulty/interval/ease/next_review),
  `review_events` (full history with `session_id`, `confidence_score`), `leech_items`,
  `curriculum_stages`, `card_mastery_scores` (the 0..4 per-card counter behind the
  progress bars, keyed `(deck_slug, card_id)` — see §4)
- **Progress/gamification** — `streak_state`, `user_xp`, `user_progression`,
  `user_feature_unlocks`, `user_badges`, `session_goals`, `jlpt_exam_results`
- **Assistant** — `assistant_profile`, `assistant_events`, `assistant_state_snapshots`,
  `assistant_chat_turns`, `assistant_chat_summaries`, `assistant_memory_facts`,
  `assistant_event_interactions`, `tutor_reactions_seen`
- **Content-adjacent** — `card_notes`, `scenario_sessions`, `scenario_srs_cards`,
  the 7 `daily_*` game tables, `user_settings`

### `data/app.db` — vestigial

`data/srs_repository.py` (`SRSRepository`, `DB_PATH = data/app.db`) is referenced only by
`scripts/srs_apply.py`, `scripts/srs_check.py`, `scripts/srs_replay.py`,
`scripts/db_check.py` and `tests/test_database_migrations.py`. **No runtime path in the
Electron app or `desktop_bridge.py` reads or writes it.** FEATURES.md currently presents
it as live persistence. Treat it as a dev/replay fixture store, not app state.

### Text normalization

`data/text_normalization.py` (NFC + prolonged sound mark + punctuation variants) is
applied at every persistence boundary. Any new write path must go through it or Japanese
lookups will silently miss.

---

## 4. Renderer State Model

### The central problem: `App.tsx`

| Metric | Value | At issue #69 filing |
|---|---|---|
| Total lines | 2,802 | 7,451 |
| `useState` | 65 | 112 |
| `useRef` | 24 | 43 |
| `useCallback` | 56 | 60 |
| `useMemo` | 23 | 27 |
| `useEffect` | 27 | 34 |

Issue #69 moved the module-level pure helpers and the two largest JSX blocks out:

- `src/lib/` — `studyPlan`, `progressAggregation`, `roundContent`, `roundScoring`,
  `appStorage`, `deckUtils` (the former lines 111–1586).
- `src/components/AppTitlebar.tsx` (430 lines) and `src/components/AppSettingsModal.tsx`
  (913 lines), both presentational: App still owns their state and passes it down.
- Types and constants that App.tsx had been redeclaring now come from `src/types.ts` and
  `src/constants.tsx`.
- `src/features/study-session/` — round builders (phase 4a) and `useStudySession`
  (phase 4b): 44 `useState` and 17 refs covering the live round, session counters, lives,
  combo/streak, confidence capture, the round queue cycle, explicit (missed-word) review,
  and session persistence/resume.

`useStudySession` returns a `StudySessionSlice` (`SessionContextValue` minus voice and
`blockSessionComplete`), which App merges at the `SessionProvider` call site rather than
letting the hook own voice and mastery. Its collaborators arrive through
`StudySessionDeps`; notably `studyQueueCacheRef` stays in App because deck loading owns it,
and the session invalidates through an injected callback instead of holding a second
reference. `useStudySession` must be called below the values it takes by argument and above
everything that reads session state — `useTutor` is the one exception, constructed after it
and reached through a ref box.
- `src/features/navigation/` — `useAppNavigation` (phase 4c): the active `view`, the
  `navDirection` animation hint, and the order-of-visit history stack behind the titlebar
  back/forward buttons. Every navigation goes through `navigate(view, direction?)`, so a
  view change and its direction can no longer be set out of sync. Two orthogonal pieces sit
  beside the hook rather than inside it: `VIEW_PARENT` (the Escape "up one level" map, was a
  five-branch `if` chain) is a plain constant, and `view → component` rendering stays in App
  as a `renderView()` closure because each screen needs App-owned props.

**Routing is three distinct mappings**, deliberately kept separate: `view → component`
(render, in App), `view → parent` (Escape, `VIEW_PARENT`), and the history stack (order of
visit, in the hook). They have different cardinality and semantics; folding them into one
"router" abstraction fits none of them.

**Design rule for new work:** anything with its own state goes in
`src/features/<name>/` (`types.ts` → `constants.ts` → `utils.ts` → `use<Name>.ts` →
`components/` → `index.ts`). 16 modules follow it in full and it works well. App.tsx's
former session and routing state now live in `features/study-session/` and
`features/navigation/` — see the conformance note below for why `study-session` does not
carry every file in the pattern.

### Feature-module conformance

Full pattern: achievements, card-notes, command-palette, cursor, daily-games, handwriting,
kanji-detail, keyboard, navigation, onboarding, passages, pomodoro, scenario-tutor, theme,
tutor, voice, devtools.
Partial (missing `index.ts`/`types.ts`/`constants.ts`): **heatmap**, **models**,
**window-drag**.

These three are left partial on purpose (issue #69 declined them): `window-drag` is a bare
hook, and inventing `types.ts`/`constants.ts` for it adds files, not clarity. `card-notes`
used to be the real outlier and was brought into line (barrel + `components/`) in phase 4c.

`study-session` is deliberately partial: `index.ts` + `types.ts` + `useStudySession.ts`,
with `roundBuilder.ts`/`grammarRound.ts` in place of a `utils.ts`. It has no `constants.ts`
(its constants — `SESSION_LENGTH_PRESETS`, `DEFAULT_LIVES`, the category→slug maps — are
shared with App and the views, so they belong in `src/constants.tsx`) and no `components/`
(its UI is `views/MinigameView.tsx`, which reads the session through `useSession()`).

### Three mastery notions, one store (was: dual source of truth)

Still the most important thing to know before designing anything progress-related, but
the shape changed with issue #66. Mastery now lives in SQLite only:

```
review_states       ──► bridge `summary`     ──► deck stats (total/mastered/due)
card_mastery_scores ──► `card-scores` cmd    ──► JLPT progress, category unlocks,
  (deck_slug, card_id)  `record-result` reply     study plan, per-card mastery bars
```

There are **three distinct definitions** of "mastered", and they are not
interchangeable — each answers its own question:

| Notion | Rule | Used for |
|---|---|---|
| Counter | `card_mastery_scores.score >= 4` (`domain/mastery.py`) | progress bars, JLPT %, category unlocks |
| FSRS mastered | `repetitions >= 3 AND interval >= 21` | deck stats, `summary` |
| Block passed | `repetitions >= 1` (`domain/blocks.py`) | block unlock gating |

The counter is deliberately **not derived** from FSRS state. Measured against
`domain/scheduler.py`: `repetitions` counts distinct successful *days*, so it stays
pinned at 1 through a whole session however many answers it takes; six same-day correct
answers move `interval` only 6 → 8 (`stability` 5.80 → 7.80) through the short-term
path; spaced reviews then jump `interval` 6 → 43 → 271 → 1500; and `repetitions` resets
to 0 on any *Again* rating. So FSRS state cannot express a gradual 0..4 scale in either
direction, and a bar derived from it would barely move within a session and then jump.
#66's original suggested fix ("make `cardScores` a derived cache") was abandoned for
this reason.

The counter is written on the same bridge call that persists the review
(`record-result` returns the new value), and `reset_db` clears it in the same
transaction as `review_states` — so the two can no longer drift. `localStorage`
`jplearn-card-scores-v2` survives only as a warm-start snapshot for first paint, plus a
one-time `import-card-scores` adoption of pre-#66 values, gated on the table being empty.
That import runs in Python because resolving a legacy `ScriptKey` bucket to the deck that
owns a card id needs `ALL_DECKS`.

Five localStorage keys still hold renderer-side truth:
`jplearn-desktop-script-stats-v1`, `jplearn-desktop-settings-v1`,
`jplearn-desktop-summary-snapshot-v1`, `jplearn-desktop-session-v1`,
`jplearn-desktop-session-prefs-v1`.

Residual worth knowing: `buildStudyPlan` reads deck stats from `summary` (FSRS
`mastered`) while JLPT progress comes from counter aggregates. Those are two metrics
answering different questions, not drift — they will never be the same number.

### `ScriptKey` is narrower than the content

```ts
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5'
               | 'grammar_patterns' | 'sentence_examples'
```

But `domain/decks.ALL_DECKS` registers 45+ decks including `kanji_n1..n4`, `vocab_n1..n4`
and 12 N4–N1 kanji category decks. `ScriptKey` names the app's six *sections*, not deck
slugs, and a section spans many decks — the vocabulary section reaches
`vocab_n1_law_justice`.

**Storage is no longer bucketed by section.** Since #66 mastery is keyed
`(deck_slug, card_id)`, so N5–N1 kanji no longer share one bucket.
`src/lib/cardScores.ts` collapses the stored rows into the six sections the views
consume. That merge keys by raw card id, which is safe because
`tests/test_deck_id_uniqueness.py` enforces that a repeated id within an id-sharing
family always refers to the same card — a checked invariant, not the id-range luck this
section previously described.

`ScriptKey` is **not** defined twice (an earlier revision of this document said it was).
`src/features/tutor/types.ts` imports and re-exports it, so it cannot drift. `MinigameKey`
in that same file *was* declared inline and had already drifted three members behind
`src/types.ts` — missing `handwriting`, `kanji_compound_builder` and `context_cloze` — and
is now re-exported too. The lesson generalises: check whether a feature module re-exports
or redeclares before assuming either.

---

## 5. Content Pipeline

```
data/external_sources/*.csv
  → scripts/import_external_lists.py
  → domain/external_deck_data.py   (10,364 generated lines)
  → domain/decks.py builders       (id_offset per deck)
  → ALL_DECKS registry
  → bridge `deck-cards` / `study-queue`
  → renderer ScriptDeck
```

### Card id allocation is positional and hand-tuned

| Deck family | Offsets | Spacing | Largest source CSV |
|---|---|---|---|
| Kanji N5→N1 | 0, 1000, 2000, 3000, 4000 | 1,000 | `kanji_n1.csv` = 1,246 rows |
| Vocab N5→N1 | 0, 10000, 20000, 30000, 40000 | 10,000 | `words_n1.csv` = 2,700 rows |
| Vocab N5 categories | 0–144, hand-partitioned per topic | — | — |

Kanji N1 already **exceeds its 1,000-slot spacing** (ids 4000–5245). It is harmless only
because nothing is allocated above 4000. A future N4/N3/N2 import crossing 1,000 rows
would silently collide ids and corrupt SRS/mastery state with no error. Vocab is
protected by caps rather than by design (below).

### Vocabulary deck sizing

Vocabulary level decks expose the **whole** imported corpus (8,031 words). The former
`_VOCAB_LEVEL_LIMITS` slice — which discarded 69–93% of each level — was removed in #67;
`_VOCAB_ID_CAPACITY` replaces it and constrains deck size for a different reason:

| Level | Corpus | `id_offset` | Ids reserved | Next allocation |
|---|---|---|---|---|
| N5 | 718 | 0 | 1,000 | vocab category decks at 1000 |
| N4 | 666 | 10,000 | 10,000 | vocab_n3 at 20000 |
| N3 | 2,139 | 20,000 | 10,000 | vocab_n2 at 30000 |
| N2 | 1,809 | 30,000 | 10,000 | vocab_n1 at 40000 |
| N1 | 2,699 | 40,000 | 10,000 | — |

`_build_vocab_deck` raises `ValueError` when a corpus outgrows its slot, so a future
import fails at deck-build time instead of silently colliding card ids (§5, A1). N5 is
the tight one — 718 of 1,000 — and `tests/test_deck_id_uniqueness.py` guards the boundary.

Pacing is **not** a deck-sizing concern: vocab decks have no block progression
(`blocks_for_slug` returns `[]` for every `vocab_n*`), but a study session draws only
8–20 items (`SESSION_LENGTH_PRESETS`) from an SRS-ordered queue, so corpus size affects
denominators and deck-total labels, not how much a learner faces per session.

Kanji has no equivalent cap and no capacity guard — kanji_n1 already overflows its
nominal 1,000-slot spacing (§5, A1).

### Thematic category decks

Both content families now have thematic categories at every JLPT level (#68): kanji has
19, vocabulary has 28 (12 N5 + 4 each for N4–N1).

They are a **curated selection, not a partition** — in both families. The kanji N4–N1
categories slice `_KANJI_N4_DATA`–`_KANJI_N1_DATA`, which are hardcoded 30-row *fallback*
lists rather than the CSVs, so the N1 categories cover 30 of 1,190 kanji. The vocabulary
N4–N1 categories curate 25 words each from corpora of 666–2,699. In both cases the flat
level deck remains the way to reach everything else.

The two families differ in how a category selects its rows, and it matters:

| | Selects by | Breaks how |
|---|---|---|
| Kanji N4–N1 | index into a hardcoded list | can't drift — the list is in the file |
| Vocab N5 | index into `_VOCAB_N5_DATA` (hardcoded) | can't drift |
| Vocab N4–N1 | **character string**, resolved against the CSV corpus | corpus re-import silently drops words |

Vocabulary N4–N1 categories cannot use indices, because `VOCAB_N*_EXTERNAL_DATA` is
generated from CSV and an index would quietly point at a different word after a
re-import. Two consequences follow, both in `domain/decks.py`:

- A card's id comes from the word's position in the **curated tuple**, not among the
  resolved rows, so a word that vanishes from the corpus leaves an id hole rather than
  shifting every later card onto a different word's SRS history.
- `unresolved_vocab_category_words()` reports curated words missing from the corpus, and
  `tests/test_decks.py` fails on any. Without that, drift is invisible — the deck simply
  builds smaller.

Category ids live at 50000–53774 (1,000 per level, 250 per category slot), clear of the
level decks which top out at 42698.

**Unlock is sequential across the whole ordered list.** `buildCategoryProgress`
(`src/lib/progressAggregation.ts`) walks `VOCAB_CATEGORY_ORDER` / `KANJI_CATEGORY_ORDER`
in order and stops unlocking at the first category below `CATEGORY_UNLOCK_THRESHOLD`
(0.7). Both families work this way, but the vocabulary chain is **longer**: N4 kanji
opens after 5 N5 categories, N4 vocabulary after 12 (145 cards at ~2.8 average score,
given `CARD_MASTERY_MAX` 4). That is the existing design applied to a longer list, not
a decision made in #68 — worth revisiting if the N4–N1 vocabulary categories turn out
to be effectively out of reach in practice.

Mastery for every one of these decks lands in the `cardScores.vocab_n5` /
`cardScores.kanji_n5` bucket, correct only because the id ranges are disjoint (§4, A2/A4).

---

## 6. Extension Points

Use these rather than inventing new plumbing:

| You want to… | Touch |
|---|---|
| Add a minigame | `types.ts` `MinigameKey` → `constants.tsx` `SCRIPT_MINIGAMES` → round builder in App.tsx → `MinigameView.tsx` |
| Add a backend query | `@dataclass` in `desktop_bridge.py` → `_run_command` branch → `ipc_handlers.cjs` route + validator → `preload.cjs` → regenerate `generated/types.ts` |
| Add a deck | CSV in `data/external_sources/` → `import_external_lists.py` → builder in `decks.py` with a **verified-disjoint** `id_offset` → `ALL_DECKS` |
| Add a stateful UI system | new `src/features/<name>/` module, hook-over-context |
| Add persisted state | migration in `data/database.py` (bump `LATEST_SCHEMA_VERSION`) — **not** a new localStorage key |
| Add a slow backend job | dedicated runtime process, **not** the shared bridge worker |

`SCRIPT_MINIGAMES` now has a single definition in `constants.tsx`; the
`constants.tsx` vs `App.tsx` divergence noted in ROADMAP has been resolved.

---

## 7. Test Coverage Map

**Python** — 44 pytest files. Good coverage of `domain/` (scheduler, SRS, confidence,
progression, features, XP, leech, streaks, queue builder, distractors, JLPT, milestones,
curriculum, word of the day, recommendation, tutor) and `data/` (migrations, progress,
repositories, portability, normalization). `test_desktop_bridge.py` exists but cannot
plausibly cover 68 commands / 6.1k lines.

**Frontend** — 22 test files. Feature modules are reasonably covered (daily-games,
scenario-tutor, handwriting, card-notes, tutor, achievements, kanji-detail).

Gaps:
- **Zero tests for any of the 6 view components.** `OverviewView` (975 lines),
  `MinigameView` (739), `JLPTPrepView` (602), `ScriptHubView` (471) are exercised only
  indirectly through the 6 `App.*.test.tsx` integration files.
- **Zero tests for the Electron main process** — `ipc_handlers.cjs` (1,821),
  `ipc_security.cjs` (1,035), `setup_runtime.cjs` (2,799), `llm_runtime.cjs` (2,243)
  have no unit tests. `ipc_security.cjs` is the entire trust boundary.

---

## 8. Findings

Ranked by risk × cost-to-fix-later. GitHub issue cross-reference in the right column;
"none" means no existing issue covers it.

### Correctness / data integrity

| # | Finding | Issue |
|---|---|---|
| ~~A1~~ | ~~Card-id `id_offset` spacing is exceeded by `kanji_n1`; no assertion guards uniqueness~~ — the guard exists: `tests/test_deck_id_uniqueness.py` fails if a repeated id within an id-sharing family refers to two different cards. Vocabulary decks additionally assert against `_VOCAB_ID_CAPACITY` at build time. | #63 |
| ~~A2~~ | ~~Mastery has two sources of truth (SQLite `review_states` vs localStorage `cardScores`) reconciled by hand~~ — fixed: the counter lives in `card_mastery_scores`, written on the same bridge call as the review and cleared in the same transaction on reset. localStorage is a warm-start snapshot only. Note the issue's suggested fix (derive the counter from FSRS) was *not* taken — see §4 for the measurements that ruled it out. | #66 |
| ~~A3~~ | ~~`ScriptKey` defined twice~~ — was already wrong: `features/tutor/types.ts` re-exports it. `MinigameKey` in that file was the real duplicate and had drifted three members; now re-exported. | #66 |
| ~~A4~~ | ~~All N5–N1 kanji mastery shares the `cardScores.kanji_n5` bucket — correct only by id-range luck~~ — fixed: storage is keyed `(deck_slug, card_id)`. The renderer still merges into sections for display, but over the invariant A1 enforces rather than luck. | #66 |

### Reliability / performance

| # | Finding | Issue |
|---|---|---|
| B1 | Bridge worker is strictly serial; anything slow blocks every study query behind it. Largely defused: OCR translation never used the bridge, OCR now has its own persistent runtime (#74), and `fsrs-optimize` runs one-shot off-worker. The serial property itself still stands as a constraint on new work. | #74 (OCR) |
| B2 | A single request timeout calls `stopPythonBridgeWorker()`, which rejects **all** pending unrelated requests and forces a cold restart. | none |
| B3 | Worker-failure fallback re-spawns a one-shot Python process per request — full interpreter + import cost on the degraded path. | none |
| ~~B4~~ | ~~`setup:system-info` served install flags from behind two network probes~~ — a 10 MB throughput measurement and untimed `huggingface.co` size probes. The renderer gates features on those flags (`ocrInstalled` decides whether an image drop is accepted), so for ~9s after launch Image Translation reported itself uninstalled, and indefinitely if a probe socket hung. Probes are now deferred (`createDeferredValue`): flags return in ~600ms, and only the setup wizard — which shows a spinner and actually needs download estimates — opts into waiting. **Rule this establishes: nothing that reports what is installed may sit behind a network call.** | #74 follow-up |

### Content

| # | Finding | Issue |
|---|---|---|
| ~~C1~~ | ~~`_VOCAB_LEVEL_LIMITS` silently truncates vocabulary to 7–31% of the imported corpus~~ — fixed: level decks expose the full corpus, capped only by card-id capacity. | #67 |
| ~~C2~~ | ~~Thematic category decks exist for kanji N5→N1 but for vocabulary **only N5**~~ — fixed: 4 curated categories added per level for vocab N4–N1. | #68 |

### Structure

| # | Finding | Issue |
|---|---|---|
| D1 | `App.tsx` is down to 2,880 lines / 67 `useState` — the pure helpers (`src/lib/`), the titlebar + settings JSX (`src/components/`) and the session state machine (`features/study-session/useStudySession.ts`) are all extracted. What remains is routing: a flat `view` string with inline conditional JSX. | #69 (phase 4c outstanding), #6 (closed, handler boilerplate only) |
| ~~D2~~ | ~~`desktop_bridge.py` was 6,122 lines mixing OCR, MT, dictionary, deck, and dispatch logic in `scripts/`~~ — now ~3,690. MT deleted (was dead code), dictionary moved to `data/dictionary_repository.py`, dispatch converted to a route table, OCR moved to `scripts/ocr_extraction.py` behind its own process. What remains is deck/JLPT/progression assembly, which belongs in `scripts/` (see §2). | #70, #74 |
| D3 | ~~`arch_check.py` covers only `src`/`domain`/`data`/`ui`; extend `RULES` to `scripts/`.~~ Done — `scripts` is now a checked layer (forbids `→ ui`) with a non-fatal size-warning threshold. | #70 (step 1) |
| D4 | `data/app.db` + `SRSRepository` are unused by any runtime path but documented in FEATURES.md as live persistence. Either wire or reclassify. | none |
| D5 | Empty legacy packages `src/` and `ui/` (only `__pycache__`); stray zero-byte `nul` file at repo root. | none |
| D6 | 4 feature modules incomplete vs the checklist: card-notes, heatmap, models, window-drag. | none |

### Test coverage

| # | Finding | Issue |
|---|---|---|
| E1 | No unit tests for any of the 6 view components (2,800+ lines total). | none |
| E2 | No tests for the Electron main process, including `ipc_security.cjs` — the trust boundary. | none |
| E3 | `test_desktop_bridge.py` cannot meaningfully cover 68 commands. | none |

### Stale documentation

| # | Finding |
|---|---|
| F1 | ROADMAP "Session persistence and quick resume — **0%**" is wrong. It is shipped: `SESSION_STORAGE_KEY`, `PREFS_STORAGE_KEY`, `ResumeToast.tsx`, wired at `App.tsx:1611–1627, 4449, 7421`. |
| F2 | ROADMAP "Fix `constants.tsx` vs `App.tsx` `SCRIPT_MINIGAMES` mismatch" is resolved — one definition remains. |
| F3 | ROADMAP "Activity heatmap" and "Shortcut cheat sheet and command palette" are listed as pending but shipped (`features/heatmap`, `features/keyboard`, `features/command-palette`). |
| F4 | Issue [#54](https://github.com/NeedMeSomeAnimeTiddy/JPLearn/issues/54) (pitch accent) is partly done: `PitchAccent` dataclass, `_lookup_pitch_accents`, `lib/pitchAccent.ts`, `DictionaryPitchAccent.tsx` all ship — but only in the dictionary popup, not on review cards. Scope the issue down. |
| F5 | FEATURES.md describes `app.db`/`SRSRepository` as live persistence (see D4). |

---

## 9. Candidate Work Not Covered by Any Open Issue

Open issues at time of writing: #13, #20, #22, #23, #25, #36, #47, #48, #49, #51, #54, #60.
None of the following duplicate them.

**Highest leverage**

1. **Card-id collision guard** (A1) — a `tests/test_deck_id_uniqueness.py` asserting every
   id across `ALL_DECKS` is unique per family. Cheap, prevents silent corruption.
2. **Unblock the bridge worker** (B1/B2) — every known-slow command is now off the shared
   worker (OCR via its own persistent runtime, #74; `fsrs-optimize` one-shot). What remains
   is B2: stop rejecting unrelated pending requests on timeout.
3. **Unify mastery on SQLite** (A2/A4) — make `cardScores` a cache derived from
   `review_states` rather than a parallel truth. Blocks clean multi-profile (#51) too.
4. ~~**Lift `_VOCAB_LEVEL_LIMITS`** (C1)~~ done (#67) — level decks now expose the full
   imported corpus; `_VOCAB_ID_CAPACITY` documents the real constraint (card-id slots).

**Also worth filing**

5. ~~Vocabulary thematic categories for N4–N1 (C2)~~ done (#68) — 4 curated categories per
   level, selected by character against the CSV corpus with a drift test.
6. `App.tsx` decomposition (D1): extract module-level helpers to `src/lib/`, then a
   `features/study-session/` module for round/scoring state.
7. ~~Extend `arch_check.py` to `scripts/` (D3)~~ done; ~~delete dead MT code, move dictionary to `data/`, convert `_run_command` to a route table~~ done; ~~persistent OCR runtime (D2)~~ done (#74).
8. Retire or wire `app.db` (D4) and delete `src/`, `ui/`, `nul` (D5).
9. View-component tests (E1) and `ipc_security.cjs` tests (E2).
10. ROADMAP/FEATURES accuracy pass (F1–F5).
