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
python scripts/dev.py --full                 # ...plus frontend tests, package, packaged smoke
python scripts/arch_check.py                 # Layer boundary check (domain/data/ui/src/scripts)

# Frontend (run from electron-frontend/)
npm run dev              # Vite dev server + Electron, hot reload
npm run build            # tsc -b + vite build — run after every meaningful edit
npm run start            # Launch built Electron app (no rebuild)
npm run lint              # oxlint — must pass with 0 warnings
npm run test:ui           # vitest
npm run test:a11y         # axe-core accessibility tests (vitest run src/App.accessibility.test.tsx)
npm run test:e2e          # build:quiet + vitest e2e config
npm run make:release      # bundle Python + build the Windows installer into out/make/
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

## Key conventions

- Python 3.11+; public APIs require type hints.
- `domain/` is pure — no DB access, no UI code, no file I/O, no hidden state/randomness, time
  injected externally. SRS contract: `update(state, quality, confidence?) → ReviewState` in
  `domain/scheduler.py`.
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

## Project skills

Load the matching skill before work in its area (not loaded by default):
- `jplearn-backend-invariants` — two SQLite DBs, two mastery sources, serial bridge + dedicated
  runtimes, card-id offsets, text normalization, mastered threshold, `load_states` trap, bridge
  payload dataclasses/`generate_ts_types.py`. Load before touching persistence, progress/mastery,
  the bridge or its payloads, a `*_runtime.cjs`, decks/card ids, or a `data/` write path.
- `jplearn-release-github` — self-hosted-runner CI and its local equivalents (`dev.py --full`,
  `make:release`, `bundle_python.ps1`), plus `gh issue` commands. Load for releases/installers,
  workflow edits, CI questions, or GitHub issues.

## Shared project context

Read `PROJECT-CONTEXT.md` before substantive project work, alongside the root and applicable scoped instructions. It is a dated guide to verified project facts and selected Claude knowledge; current source, accepted decisions and the user's task scope remain authoritative. Keep lasting knowledge there or in the existing decision documents, and use the task's explicit handoff for temporary progress.
