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
stop a file from mixing concerns that belong in different layers; #70 step 2 is peeling those
apart from `desktop_bridge.py` one concern at a time (dictionary/kanji/pitch-accent queries
moved to `data/dictionary_repository.py`; the dead OCR-translation path was deleted outright;
OCR itself and the `_run_command` dispatch table are still open — see §2).

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
   `fsrs-optimize` and OCR extraction are the known-slow commands; both are already routed
   through `runPythonBridgeIsolated` (a fresh one-shot process per call) rather than this
   shared worker, which avoids head-of-line blocking at the cost of paying full interpreter
   + PaddleOCR-import startup on every OCR call (#70's deferred OCR-runtime follow-up would
   fix that). OCR translation (`assistant-chat:translate-ocr-text`) never touches the Python
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
Either give it a dedicated child process (the pattern `llm_runtime.cjs` /
`voice_runtime.cjs` already use) or make it a job with a poll/progress channel.

### desktop_bridge.py composition

Was 6,122 lines / 246 module-level defs at the start of #70; down to ~4,180 lines after
step 2's first two moves. Status per concern:

| Concern | Status |
|---|---|
| OCR (PaddleOCR, image preprocessing, dual-pass fusion) | Still in the bridge, still one-shot-per-call (see §1's worker note). A dedicated persistent OCR runtime is real scope but deliberately deferred to a follow-up issue — it overlaps the now-closed #64 and is the single largest, riskiest piece. |
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

`LATEST_SCHEMA_VERSION = 19`, forward-only migrations applied in `_apply_migrations`.
31 tables, grouped:

- **SRS core** — `review_states` (FSRS stability/difficulty/interval/ease/next_review),
  `review_events` (full history with `session_id`, `confidence_score`), `leech_items`,
  `curriculum_stages`
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

### Dual source of truth for mastery

This is the most important thing to know before designing anything progress-related.

```
SQLite review_states  ──►  bridge `summary` ──►  deck stats (total/mastered/due)
localStorage          ──►  cardScores        ──►  JLPT progress, category unlocks,
  'jplearn-card-scores-v2'                        study plan, per-card mastery bars
```

`CardScores = Record<ScriptKey, Record<cardId, number>>` with `CARD_MASTERY_MAX = 4`.
The two can disagree; clearing browser storage silently resets visible mastery while
FSRS state survives, and a DB reset that misses localStorage does the reverse
(`App.tsx:803` persists it, `1762` clears it on DB reset — kept in sync by hand).

Six localStorage keys hold renderer-side truth: `jplearn-desktop-script-stats-v1`,
`jplearn-desktop-settings-v1`, `jplearn-card-scores-v2`,
`jplearn-desktop-summary-snapshot-v1`, `jplearn-desktop-session-v1`,
`jplearn-desktop-session-prefs-v1`.

### `ScriptKey` is narrower than the content

```ts
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5'
               | 'grammar_patterns' | 'sentence_examples'
```

But `domain/decks.ALL_DECKS` registers 45+ decks including `kanji_n1..n4`, `vocab_n1..n4`
and 12 N4–N1 kanji category decks. Consequence: **all kanji mastery across N5–N1 is
stored in the single `cardScores.kanji_n5` bucket**, keyed by numeric card id
(`features/study-session/useStudySession.ts:1070`, `1118`). It works only because `domain/decks.py` hand-allocates disjoint id
ranges.

`ScriptKey` is also **defined twice** — `src/types.ts:23` and
`src/features/tutor/types.ts:4`. They agree today; nothing enforces that.

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

The remaining asymmetry: thematic category decks exist for kanji N5→N1 but for
vocabulary only N5 (145 words across 12 categories), so N4–N1 vocabulary is reachable
only through the flat level decks. Tracked as C2 / issue #68.

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
| A1 | Card-id `id_offset` spacing (1,000 for kanji) is already exceeded by `kanji_n1` (1,246 rows). No assertion guards uniqueness; a future import collides ids and corrupts SRS state silently. Add a startup/test-time uniqueness check across `ALL_DECKS`. | none |
| A2 | Mastery has two sources of truth (SQLite `review_states` vs localStorage `cardScores`) reconciled by hand in two places. Any progress feature built on `cardScores` inherits the drift. | none |
| A3 | `ScriptKey` defined twice (`src/types.ts`, `features/tutor/types.ts`) with nothing enforcing agreement. | none |
| A4 | All N5–N1 kanji mastery shares the `cardScores.kanji_n5` bucket — correct only by id-range luck (see A1). | none |

### Reliability / performance

| # | Finding | Issue |
|---|---|---|
| B1 | Bridge worker is strictly serial; `fsrs-optimize`, OCR, and OCR translation block all study queries behind them. | none |
| B2 | A single request timeout calls `stopPythonBridgeWorker()`, which rejects **all** pending unrelated requests and forces a cold restart. | none |
| B3 | Worker-failure fallback re-spawns a one-shot Python process per request — full interpreter + import cost on the degraded path. | none |

### Content

| # | Finding | Issue |
|---|---|---|
| ~~C1~~ | ~~`_VOCAB_LEVEL_LIMITS` silently truncates vocabulary to 7–31% of the imported corpus~~ — fixed: level decks expose the full corpus, capped only by card-id capacity. | #67 |
| C2 | Thematic category decks exist for kanji N5→N1 but for vocabulary **only N5** — so N4–N1 vocab is reachable only via the flat level decks. | #68 |

### Structure

| # | Finding | Issue |
|---|---|---|
| D1 | `App.tsx` is down to 2,880 lines / 67 `useState` — the pure helpers (`src/lib/`), the titlebar + settings JSX (`src/components/`) and the session state machine (`features/study-session/useStudySession.ts`) are all extracted. What remains is routing: a flat `view` string with inline conditional JSX. | #69 (phase 4c outstanding), #6 (closed, handler boilerplate only) |
| D2 | `desktop_bridge.py` was 6,122 lines mixing OCR, MT, dictionary, deck, and dispatch logic in `scripts/`; now ~4,330. MT deleted (was dead code), dictionary moved to `data/dictionary_repository.py`, dispatch converted to a route table. Still open: OCR — deferred to a follow-up issue, needs a persistent runtime (overlaps closed #64), out of scope for a same-process move. | #70 (step 1 closed; step 2 — dictionary, MT, and dispatch table done; only the OCR runtime remains, tracked as a new follow-up issue) |
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
2. **Unblock the bridge worker** (B1/B2) — move `fsrs-optimize`, OCR, and OCR translation
   off the shared worker; stop rejecting unrelated pending requests on timeout.
3. **Unify mastery on SQLite** (A2/A4) — make `cardScores` a cache derived from
   `review_states` rather than a parallel truth. Blocks clean multi-profile (#51) too.
4. ~~**Lift `_VOCAB_LEVEL_LIMITS`** (C1)~~ done (#67) — level decks now expose the full
   imported corpus; `_VOCAB_ID_CAPACITY` documents the real constraint (card-id slots).

**Also worth filing**

5. Vocabulary thematic categories for N4–N1 (C2), mirroring the kanji category structure.
6. `App.tsx` decomposition (D1): extract module-level helpers to `src/lib/`, then a
   `features/study-session/` module for round/scoring state.
7. ~~Extend `arch_check.py` to `scripts/` (D3)~~ done; ~~delete dead MT code, move dictionary to `data/`, convert `_run_command` to a route table~~ done; remaining: file a follow-up issue for a persistent OCR runtime (D2).
8. Retire or wire `app.db` (D4) and delete `src/`, `ui/`, `nul` (D5).
9. View-component tests (E1) and `ipc_security.cjs` tests (E2).
10. ROADMAP/FEATURES accuracy pass (F1–F5).
