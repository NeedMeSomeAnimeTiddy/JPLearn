# Repository map — where to look, and how to search it

Navigation only. Nothing here is a finding, and nothing here says what any code *does*; that is what
the audit establishes. Counts drift: **the searches and the census are the authority**, not this file
(written 2026-10-26).

**The Auditor has no shell.** A search line below is a pattern and a path for its search tools.
Anything else (`git`, `python`, `npm`, `gh`) goes under **Checks to run** for the lead's verifier.

---

## Layout

```
domain/                     pure learning logic: scheduler (FSRS), decks and card ids, blocks,
                            queue building, mastery, leeches, curriculum, recommendations, tutor rules
data/                       SQLite: database.py (the live store), repositories per area,
                            text_normalization.py, migrations (category_identity_migration.py),
                            external_sources/*.csv (the imported word and kanji lists)
scripts/desktop_bridge.py   the Python side of the bridge: a route table of commands
scripts/ocr_server.py, speech_recognition_server.py   dedicated Python runtimes
scripts/*                   one-shot tools: importers, generators, model downloaders, dev.py
electron-frontend/electron/ the main process
  main.cjs                  window, startup sequence, telemetry, splash
  bridge_worker.cjs         the serial bridge child and its request bookkeeping
  ipc_handlers.cjs          every ipcMain.handle route
  ipc_security.cjs          trusted-sender and payload validators
  preload.cjs               the renderer's only door (window.jplearnDesktop)
  setup_runtime.cjs         downloads and installs of models, engines, dictionary
  llm_runtime / voice_runtime / speech_runtime / ocr_runtime .cjs   dedicated runtimes
electron-frontend/src/
  App.tsx                   orchestrator: routing, deck loading, settings
  views/                    top-level screens
  features/<name>/          hook-first modules (types, constants, utils, use<Name>, components)
  valley/                   the three.js menu world
  lib/                      pure helpers and static content
  generated/types.ts        generated from the Python payload dataclasses
tests/                      pytest
mockups/                    menu prototypes; not shipped
```

## Systems

The units a scoped audit can name. Each is a reasonable single pass.

| System | Where it lives |
|---|---|
| Scheduling and review persistence | `domain/scheduler.py`, `domain/srs.py`, `data/database.py` (review_states, review_events), `data/study_pipeline.py` |
| Decks, card ids and the content pipeline | `domain/decks.py`, `domain/deck_supplements.py`, `domain/block_mapping.py`, `domain/blocks.py`, `scripts/import_external_lists.py`, `data/external_sources/` |
| Mastery, leeches and progress counts | `domain/mastery.py`, `domain/leech.py`, `data/mastery_repository.py`, `features/mastery/` |
| Study session and queue | `domain/queue_builder.py`, `domain/session.py`, `features/study-session/`, `features/round/` |
| The Python bridge | `electron/bridge_worker.cjs`, `electron/main.cjs` (startup), `scripts/desktop_bridge.py` |
| Dedicated runtimes | `electron/{llm,voice,speech,ocr}_runtime.cjs`, `scripts/ocr_server.py`, `scripts/speech_recognition_server.py` |
| Setup and downloads (offline, #36) | `electron/setup_runtime.cjs`, `scripts/get_*.py`, `electron-frontend/scripts/fetch-models.cjs` |
| IPC and the trust boundary | `electron/ipc_handlers.cjs`, `electron/ipc_security.cjs`, `electron/preload.cjs` |
| Startup | `electron/main.cjs` (preload, splash, telemetry), the first `summary` bridge call |
| Tutor and assistant | `domain/assistant.py`, `domain/tutor*.py`, `data/study_pipeline.py` (chat context), `features/tutor/`, `features/scenario-tutor/` |
| JLPT preparation | `domain/jlpt_*.py`, `data/jlpt_repository.py`, `views/JLPTPrepView.tsx` |
| Minigames and daily games | `domain/daily_games.py`, `data/daily_games_repository.py`, `views/MinigameView.tsx`, `features/daily-games/` |
| Dictionary, lookup and OCR | `data/dictionary_repository.py`, `features/lookup/`, `scripts/ocr_extraction.py` |
| Import, export and backups | `data/deck_portability.py`, `scripts/deck_portability.py` |
| The menu and the valley | `features/menu/`, `src/valley/` |
| Renderer state and settings | `App.tsx`, `src/types.ts`, `src/constants.tsx`, `components/AppSettingsModal.tsx`, `electron/config_store.cjs` |
| Answer checking and grading | `domain/answer_check.py`, `domain/conjugation.py`, `features/round/` |
| Progression and onboarding | `domain/progression*.py`, `domain/curriculum.py`, `features/progression/`, `features/onboarding/` |
| Reading passages | `scripts/build_passages_db.py`, `views/PassageHubView.tsx`, `features/passages/` |
| Handwriting | `features/handwriting/`, `public/handwriting-data/`, `scripts/build_handwriting_assets.py` |
| Packaging, updates and upgrades | `electron-frontend/forge.config.*`, `scripts/bundle_python.ps1`, `electron/updater.cjs`, schema versions in `data/database.py` |

## Searches that work here

### Persistence and identity

```
INSERT INTO|UPDATE |DELETE FROM|executemany            data/ --include=*.py
normalize_storage_text|normalize_japanese_text          data/   (who normalises, and who does not)
load_states\(|load_review_states\(                       scripts/ data/ domain/
id_offset|_VOCAB_ID_CAPACITY|hidden_repeat_ids           domain/decks.py
deck_name|\.name\b.*deck                                  scripts/desktop_bridge.py (where a deck name becomes a key)
```

Learner stores have different keys (known-answers Part 1 has the table): most are deck name plus
card id, mastery scores use the deck slug, notes a deck-independent hash. When a reader is not
limited to a deck's own card ids (compare `load_deck_summary_counts`, which is, with a bare
`SELECT ... FROM leech_items`), it can see rows for cards no deck shows (#80's hidden repeats).

### The bridge and the runtimes

```
_COMMAND_HANDLERS                                         scripts/desktop_bridge.py (the route table)
requestBridge|sendBridgeRequest|bridge\.request           electron-frontend/electron/
spawn\(|execFile\(|fork\(                                 electron-frontend/electron/
\.stdin\.on\('error'|\.on\('close'|\.on\('exit'           electron-frontend/electron/
setTimeout\(.*(kill|stop|timeout)                         electron-frontend/electron/
```

For each command: what it reads, how long it can take, and whether it is on the shared worker.

### Network and offline

```
https\.get\(|https\.request\(|net\.request|fetch\(       electron-frontend/electron/
autoUpdater|updateElectronApp                             electron-frontend/electron/
urllib|requests\.\w                                       scripts/ data/ domain/
fetch\(|XMLHttpRequest|new WebSocket|EventSource          electron-frontend/src/
https?://                                                 electron-frontend/src/ electron-frontend/index.html (CSS url(), links)
navigator\.onLine                                         electron-frontend/src/
```

For each: loopback, a bundled resource (the renderer's `fetch` of `public/` files, e.g. handwriting
data) or external; what triggers it; the timeout; what the learner sees when it fails; whether
anything reporting installed state waits on it. Dependencies can fetch without a call site here; the
updater is one.

### IPC

```
ipcMain\.handle\(                                         electron-frontend/electron/ipc_handlers.cjs
validate[A-Z]\w*|assertTrustedIpcSender                   electron-frontend/electron/ipc_security.cjs
contextBridge\.exposeInMainWorld                          electron-frontend/electron/preload.cjs
```

The census lists routes whose body names no validator; read each before calling it a gap (some take
no input at all).

### Renderer state, timers and storage

```
localStorage\.(get|set|remove)Item                        electron-frontend/src/
setInterval\(|requestAnimationFrame\(|addEventListener\(  electron-frontend/src/   (and their cleanups)
useState\(|useEffect\(                                    electron-frontend/src/App.tsx
catch \{|catch \(\w+\) \{\s*\}|\.catch\(\(\) =>           electron-frontend/src/ electron-frontend/electron/
except Exception|except:\s*$|pass$                        scripts/ data/
```

### Styling rules

```
#[0-9a-fA-F]{3,8}\b                                       electron-frontend/src/**/*.css *.tsx (raw colours)
border-radius:\s*[^0;]                                    electron-frontend/src/**/*.css
style=\{\{                                                electron-frontend/src/**/*.tsx (inline styles)
```

### Dead code

Never conclude from absence of a local caller. Check, for the symbol or class:

```
<Symbol>                       electron-frontend/src electron-frontend/electron (incl. *.test.*)
<Symbol>                       domain data scripts tests
`<prefix>-\$\{|'<prefix>-' \+  electron-frontend/src  (class names built at runtime)
```

and list `git log -S'<Symbol>' --oneline` under Checks to run. Bridge commands are called by name
from the main process; an IPC route by name from `preload.cjs`; a Python function from a route
table entry. A CSS class may be built (`is-${tone}`, `assistant-toast-${priority}`).

---

## Briefing a helper

A helper starts cold. Brief every one with this shape:

```
Sweep, read-only. Change no file.

CONTEXT: JPLearn, a desktop Japanese-learning app. Electron + React renderer,
an Electron main process in CommonJS, and a Python backend (domain/ pure logic,
data/ SQLite) reached through one serial bridge process.

YOUR QUESTION: <one question whose answer is a conclusion, not a file list>

REPORT: file path, symbol, and the surrounding lines for each hit. Where the
answer depends on how code is used, include the caller you found.

DO NOT: judge whether anything is a problem, recommend changes, or conclude that
anything is unused, missing or broken. Several things here that look wrong are
settled decisions you have not read. Report what is there.

If you cannot establish something, say so. Do not name a file, class or method
you have not opened. Name Japanese words in English.
```

Then verify every claim it returns before it reaches the report, above all a claim that something
is absent.
