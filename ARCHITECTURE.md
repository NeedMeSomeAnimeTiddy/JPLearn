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
│   App.tsx (orchestrator + most study state)                  │
│   src/views/*        6 top-level screens                     │
│   src/features/*     19 self-contained hook-first modules    │
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
`data → ui`. Note it only inspects the top-level packages `src`, `domain`, `data`, `ui` —
**`scripts/` is unchecked**, which is how the bridge accumulated logic that arguably
belongs in `domain/`.

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
   Known slow commands routed through this same worker: `fsrs-optimize` (full review
   history), OCR extraction, and OCR translation (`assistant-chat:translate-ocr-text`,
   which can shell out to `llama.cpp`).

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

6,122 lines, 246 module-level defs, dispatched by a ~700-line `if command == ...` chain
in `_run_command`. Roughly:

| Concern | Approx. lines | Belongs in |
|---|---|---|
| OCR (PaddleOCR, image preprocessing, dual-pass fusion) | ~800 | its own module/runtime |
| Machine translation (OPUS-MT, llama.cpp, fastText LID, quality scoring) | ~700 | its own module/runtime |
| Offline dictionary + kanji detail + pitch accent (FTS5 queries) | ~800 | `data/dictionary_repository.py` |
| Deck/JLPT/progression assembly | ~1,500 | `domain/` |
| Dataclasses (the TS type source) | ~400 | fine where it is |
| Command dispatch | ~700 | a route table |

The dataclasses here are the single source of truth for renderer types:
`scripts/generate_ts_types.py` emits `electron-frontend/src/generated/types.ts`, with a
`--check` mode for drift. **Any new bridge payload should be a `@dataclass` so the TS
type is generated rather than hand-written.**

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

| Metric | Value |
|---|---|
| Total lines | 7,451 |
| `App()` function body | lines 1587–7448 (~5,860) |
| `useState` | 112 |
| `useCallback` | 60 |
| `useMemo` | 27 |
| `useEffect` | 34 |

Lines 111–1586 are module-level constants and pure helpers — study-plan building, JLPT
progress aggregation, cloze/story text generation, assembly chunking, round scoring,
coach-toast copy. Per AGENTS.md these belong in `src/lib/`; per AGENTS.md App.tsx should
be "orchestrator only". Neither currently holds.

Routing is a flat `view` string with inline conditional JSX from ~line 5998 onward
(`home`, `script_hub`, `minigame`, `jlpt_prep`, `passage_hub`, `daily_games`), plus a
settings modal rendered inline.

**Design rule for new work:** anything with its own state goes in
`src/features/<name>/` (`types.ts` → `constants.ts` → `utils.ts` → `use<Name>.ts` →
`components/` → `index.ts`). 19 modules already follow this and it works well. The
extraction backlog is App.tsx's *existing* session/round/scoring state, which is the one
thing no feature module owns.

### Feature-module conformance

Full pattern: achievements, command-palette, cursor, daily-games, handwriting,
kanji-detail, keyboard, onboarding, passages, pomodoro, scenario-tutor, theme, tutor,
voice, devtools.
Partial (missing `index.ts`/`types.ts`/`constants.ts`): **card-notes**, **heatmap**,
**models**, **window-drag**.

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
(`App.tsx:5094`, `5252` try to keep them in sync by hand).

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
(`App.tsx:3812`). It works only because `domain/decks.py` hand-allocates disjoint id
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

### Undocumented vocabulary truncation

`domain/decks.py:18`:

```python
_VOCAB_LEVEL_LIMITS = {"n5": 50, "n4": 150, "n3": 300, "n2": 600, "n1": 800}
```

Against the imported corpus that discards most of it:

| Level | CSV rows | Exposed | Reachable |
|---|---|---|---|
| N5 | 719 | 50 | 7% |
| N4 | 667 | 150 | 22% |
| N3 | 2,140 | 300 | 14% |
| N2 | 1,906 | 600 | 31% |
| N1 | 2,700 | 800 | 30% |

No comment explains the constant. Kanji has no equivalent cap. N5 is partly compensated
by the thematic category decks (145 words across 12 categories) — but those exist
**only for N5**, while kanji has thematic categories all the way to N1. That asymmetry
means N4–N1 vocabulary is reachable only through the truncated level decks.

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
| C1 | `_VOCAB_LEVEL_LIMITS` silently truncates vocabulary to 7–31% of the imported corpus, with no comment explaining why. N5 exposes 50 of 719 words. | none |
| C2 | Thematic category decks exist for kanji N5→N1 but for vocabulary **only N5** — so N4–N1 vocab is reachable only via the truncated level decks. | none |

### Structure

| # | Finding | Issue |
|---|---|---|
| D1 | `App.tsx` at 7,451 lines / 112 `useState` violates the project's own "orchestrator only" rule. ~1,400 lines of module-level pure helpers should move to `src/lib/`; session/round/scoring state should become a feature module. | partially #6 (closed, handler boilerplate only) |
| D2 | `desktop_bridge.py` at 6,122 lines mixes OCR, MT, dictionary, and deck logic in `scripts/` — a directory `arch_check.py` does not inspect. | none |
| D3 | `arch_check.py` covers only `src`/`domain`/`data`/`ui`; extend `RULES` to `scripts/`. | none |
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
4. **Lift `_VOCAB_LEVEL_LIMITS`** (C1) — expose the full imported corpus behind
   block/category progression instead of a hard slice, or document the constant.

**Also worth filing**

5. Vocabulary thematic categories for N4–N1 (C2), mirroring the kanji category structure.
6. `App.tsx` decomposition (D1): extract module-level helpers to `src/lib/`, then a
   `features/study-session/` module for round/scoring state.
7. Extend `arch_check.py` to `scripts/` (D3), then split `desktop_bridge.py` (D2).
8. Retire or wire `app.db` (D4) and delete `src/`, `ui/`, `nul` (D5).
9. View-component tests (E1) and `ipc_security.cjs` tests (E2).
10. ROADMAP/FEATURES accuracy pass (F1–F5).
