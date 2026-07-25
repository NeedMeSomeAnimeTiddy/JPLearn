# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

JPLearn is a desktop Japanese-learning app: Electron + React 19 + TypeScript frontend, Python
backend implementing FSRS v4.5 spaced-repetition scheduling. The legacy Python GUI (`main.py`,
`gui.py`) is deprecated and raises `RuntimeError` — the Electron frontend is the only supported
interactive surface.

Deeper reference docs (read the relevant one before nontrivial work in that area):
- `ARCHITECTURE.md` — how the app is actually put together: IPC bridge internals, persistence
  model, renderer state, content pipeline, and a ranked list of known structural issues. Written
  as a design reference, not a task list — read it before designing anything touching mastery
  tracking, the Python bridge, or deck/card-id allocation.
- `FEATURES.md` — product-level feature list.
- `ROADMAP.md` — planned work (has some known-stale entries; ARCHITECTURE.md §8 "F" findings
  list which ones).
- `AGENTS.md` — the original agent-guide this file is derived from; still useful for the
  GitHub-issue-automation workflow and subagent-selection table for the `opencode` harness, but
  its tool names (`write`/`edit`/`task`, `data`/`domain`/`ui`/`explore` subagents) don't map
  1:1 to Claude Code — use the Claude Code equivalents described below instead.

## Commands

```bash
# Python
python -m pytest -q                          # All tests
python -m pytest tests/path/to/file.py -q    # Single file
python scripts/dev.py                        # Full aggregate check (6 steps + frontend)
python scripts/arch_check.py                 # Layer boundary check (domain/data/ui/src/scripts)

# Frontend (run from electron-frontend/)
npm run dev              # Vite dev server + Electron, hot reload
npm run build            # tsc -b + vite build — run after every meaningful edit
npm run start            # Launch built Electron app (no rebuild)
npm run lint              # oxlint — must pass with 0 warnings
npm run test:ui           # vitest
npm run test:a11y         # axe-core accessibility tests (vitest run src/App.accessibility.test.tsx)
npm run test:e2e          # build:quiet + vitest e2e config
```

To just run the built app end-to-end without touching code: `npm run build && npm run start`
from `electron-frontend/` (not `dev`, which is for active frontend development).

Validation order: lint → typecheck (`build`) → test. Validate only the files you changed by
default; escalate to `python scripts/dev.py` only on request or when a change is cross-cutting.

## Architecture

```
domain/              Pure SRS/learning logic, no I/O (24 modules)
data/                SQLite persistence, row↔domain mapping, Japanese text normalization
scripts/desktop_bridge.py   68-command dispatcher the Electron main process spawns as a
                            single long-lived child process (JSON-lines over stdin/stdout)
scripts/ocr_server.py       Persistent PaddleOCR process (own lifecycle, not the bridge)
scripts/ocr_extraction.py   The OCR logic it runs; keeps one engine warm across calls
electron-frontend/
  electron/*.cjs      Main process: window lifecycle, IPC routes, bridge worker pool,
                       llama.cpp/VOICEVOX/Whisper/PaddleOCR child-process management
  src/App.tsx          Orchestrator + most study session state (large — see caveat below)
  src/features/<name>/ Self-contained feature modules (hook-over-context pattern)
  src/views/           6 top-level screens
  src/lib/             Shared pure helpers + static content data
tests/                pytest suite
```

Enforced boundary: `scripts/arch_check.py` forbids `domain → data`, `domain → ui`, `data → ui`,
`scripts → ui`. It inspects `src`, `domain`, `data`, `ui`, `scripts`, and prints a non-fatal
size warning for any hand-written file over 2,000 lines (currently `desktop_bridge.py` and
`database.py`; auto-generated files like `domain/external_deck_data.py` are exempt).

**Two SQLite DBs, not equivalent**: `data/jplearn.db` (via `database.py`) is the real,
live-written database — review/progress/gamification/assistant state. `data/app.db` (via
`SRSRepository` in `srs_repository.py`) is a dev/replay fixture used only by
`scripts/srs_apply.py`/`srs_check.py`/`srs_replay.py`/`db_check.py` and one test — no runtime
app path touches it, despite FEATURES.md describing it as live persistence.

**Mastery has two sources of truth** that are reconciled by hand, not derived from each other:
SQLite `review_states` (via the bridge `summary` command) and a `localStorage` `cardScores` map
keyed by numeric card id. Any new progress-related feature should know which one it's reading.
See `ARCHITECTURE.md` §4 before touching either.

**Bridge is strictly serial**: the Python child process handles one request at a time, and a
timed-out request tears down and rejects *every* other in-flight request. Never route a new
long-running backend operation through the shared worker — give it a dedicated child process
or a poll/progress channel instead. Four dedicated runtimes already exist to copy from:
`llm_runtime.cjs` and `voice_runtime.cjs` (HTTP to a spawned server), `speech_runtime.cjs` and
`ocr_runtime.cjs` (newline-JSON over stdin/stdout to `scripts/speech_recognition_server.py` /
`scripts/ocr_server.py`). See ARCHITECTURE.md §2 "Dedicated runtimes" for the lifecycle rules
these share (single-flight queue, kill-on-timeout, unload only between requests).

**Card ids are hand-allocated by offset** (`domain/decks.py`, e.g. kanji N5→N1 at 0/1000/2000/…).
Adding a deck means picking a verified-disjoint `id_offset` — there's no uniqueness assertion,
so a collision silently corrupts SRS/mastery state rather than erroring.

## Key conventions

- Python 3.11+; public APIs require type hints.
- `domain/` is pure — no DB access, no UI code, no file I/O, no hidden state/randomness, time
  injected externally. SRS contract: `update(state, quality, confidence?) → ReviewState` in
  `domain/scheduler.py`.
- `data/` normalizes Japanese text (NFC + dash/punctuation variants, `data/text_normalization.py`)
  before every write — new write paths must go through it or lookups silently miss.
- Mastered threshold: `repetitions >= 3` AND `interval >= 21` (days).
- `data/database.load_states()` may fabricate a default `ReviewState` for unseen cards — only
  persist after an actual review, not on load.
- Any new bridge payload should be a `@dataclass`, either in `desktop_bridge.py` or in a `data/`
  repository module the bridge imports from (e.g. `data/dictionary_repository.py`) — never
  duplicated in both. `scripts/generate_ts_types.py` AST-walks the files listed in its
  `SOURCE_FILES` tuple and generates `electron-frontend/src/generated/types.ts` from every
  `@dataclass` it finds (`--check` mode detects drift). Adding a payload dataclass to a new
  source file means adding that file to `SOURCE_FILES` too. Don't hand-write renderer types that
  duplicate one of these dataclasses.
- Read the matching `.github/instructions/<layer>.instructions.md` before editing inside
  `domain/`, `data/`, or `electron-frontend/` — each has more detail than the summary above
  (the electron one in particular covers accessibility, performance, and forbidden patterns).
- Frontend-specific conventions (React 19.2 patterns, feature-module extraction rule, styling)
  live in `electron-frontend/CLAUDE.md` — loaded automatically when working in that directory.

## Subagent selection (Claude Code)

This repo's `AGENTS.md` describes subagent types (`data`/`domain`/`ui`/`reviewer`/`research`/
`explore`) from a different harness (`opencode`) — they don't exist here. Use Claude Code's own
agents instead: `Explore` for read-only search/discovery across any layer, `general-purpose` for
multi-step work that includes edits, `Plan` when you need an implementation plan before writing
code. Everything else in `AGENTS.md` (architecture, conventions, commands, GitHub issue workflow)
still applies.

## GitHub

```bash
gh issue list --repo NeedMeSomeAnimeTiddy/JPLearn --limit 5
gh issue create --repo NeedMeSomeAnimeTiddy/JPLearn --title "..." --body "..." --label "bug|refactor|enhancement"
```
