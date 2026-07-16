# JPLearn — Agent Guide

## Architecture (Three-Layer + Electron)

```
domain/  → Pure SRS logic, no I/O
data/    → SQLite persistence, row↔domain mapping, Japanese normalization
scripts/ → Dev tools (dev.py, arch_check.py, db_check.py, srs_check.py)
electron-frontend/ → React 19.2 UI + Electron main process + IPC bridge
  src/features/   → Self-contained feature modules (theme, background, tutor, voice, models)
  src/lib/        → Shared utilities (contentTemplates, ambientAudio, etc.)
tests/   → pytest test suite
```

Important: `main.py` (the Python GUI) is **deprecated** — raises `RuntimeError`. Use the Electron frontend instead.

## Problem-Solving Rule

- **Stuck? Use Exa search before reverting.** If you've been going in circles on a problem for a while, do NOT fall back to `git checkout` or scrap your work. First, look up the issue using `exa-search_web_search_exa` (20k free requests/month — use them). Search for error messages, library docs, API patterns, or anything relevant. The answer is often a quick web search away. Only revert as a last resort.

## Key Conventions

- Python 3.11+, public APIs require type hints
- `domain/` functions are pure — no hidden state or randomness
- `data/` normalizes Japanese text (NFC + dash/punctuation) via `data/text_normalization.py` before storage
- Two SQLite DBs: `data/jplearn.db` (review/progress/assistant via `database.py`) and `data/app.db` (SRS items via `SRSRepository` in `srs_repository.py`)
- SRS contract: `update(state, quality, confidence?) → ReviewState` in `domain/scheduler.py` (FSRS v4.5)
- Mastered threshold: `repetitions >= 3` AND `interval >= 21` (days)
- `data/database.load_states()` may fabricate default `ReviewState` — persist only after actual review
- IPC: Electron main process spawns Python backend; preload.cjs exposes `window.jplearnDesktop.*`
- No `import React` needed (new JSX transform), no `forwardRef` (React 19)
- Use CVA + clsx for component variants, Radix UI colors, lucide-react icons, motion for animations
- Feature modules go in `src/features/<name>/` with types, constants, utils, hooks, and components
- **Never add new systems inline in App.tsx** — extract into `src/features/<name>/` following the hook-over-context pattern established by theme, background, tutor, voice, and models modules
- New feature checklist: `types.ts` → `constants.ts` → `utils.ts` → `use<Name>.ts` (hook) → `components/` → `index.ts` (barrel)
- Static data constants (>50 lines) go in `src/lib/` (e.g. `contentTemplates.ts`)
- App.tsx role is orchestrator only: imports feature hooks, wires JSX components, manages top-level routing/state
- Use `npm run build` after every meaningful edit to catch regressions early
- Tests use `pytest` for Python, `vitest` + `@testing-library/react` for frontend
- `write` — new file creation only. `edit` — modifying existing code only. Never use `write` to overwrite an existing file.
- If unsure about anything — ask for clarification before assuming.
- When using `compress`, explicitly preserve the current task, what's done, and what remains — don't let task context get lost.
- **Plan files (orchestrator or research agent)**: The main agent (you) should write a `plan.md` in the relevant directory for any non-trivial planning phase. This survives conversation compression. **Other subagents must NOT write plan.md** — they don't have the `write` tool or the appropriate prompt. Subagents use the `todo` tool for task tracking instead. The exception is the `research` agent (defined in `.opencode/agents/research.md`) which has explicit write permission and is designed for exploration + plan.md creation. When starting implementation or any follow-up work, check for a `plan.md` in the relevant directory first and follow it. Delete `plan.md` after full execution unless there's reason to keep it.
- **NEVER commit `plan.md`**. Always check `git status` before staging — plan.md must not appear in commits. If accidentally staged, unstage it before committing.

## Commands

```bash
# Python
python -m pytest -q                                      # All tests
python -m pytest tests/path/to/file.py -q                # Single file
python scripts/dev.py                                    # Full check (6 steps + frontend)
python scripts/arch_check.py                             # Layer boundary check

# Frontend
npm run dev              # Start dev server
npm run build            # Typecheck + vite build
npm run start            # Launch Electron
npm run lint             # oxlint (must pass with 0 warnings)
npm run test:ui          # vitest
npm run test:a11y        # axe-core a11y tests

# GitHub
gh issue list --repo NeedMeSomeAnimeTiddy/JPLearn --limit 5
gh issue create --repo NeedMeSomeAnimeTiddy/JPLearn --title "..." --body "..." --label "enhancement"

## GitHub Issue Automation

When discovering egregious bugs, architectural violations, or significant technical debt during exploration/refactoring, **automatically create a GitHub issue**. Use full path if `gh` not in PATH:
```bash
"/c/Program Files/GitHub CLI/gh.exe" issue create \
  --repo NeedMeSomeAnimeTiddy/JPLearn \
  --title "..." --body "..." --label "bug|refactor|enhancement"
```
Issues can be tackled later: "let's fix a few listed issues."
```

## Validation Order (Quiet by Default)

1. Read first, run commands second
2. Validate only changed files by default
3. Start with smallest relevant check
4. Run full `python scripts/dev.py` only on request or high cross-cutting risk

Lint → typecheck → test (in that order).

## Per-Layer Rules

Read the corresponding `.github/instructions/<layer>.instructions.md` before editing in any of these paths:

| Path | Instruction |
|------|-------------|
| `domain/**/*.py` | `domain.instructions.md` |
| `data/**/*.py` | `data.instructions.md` |
| `electron-frontend/**/*` | `electron.instructions.md` |

## Subagent Type Selection

When delegating work via the `task` tool, pick the correct subagent type:

| Agent Type | Can Edit? | Use For |
|------------|-----------|---------|
| `data` | ✅ `read`/`edit`/`search`/`todo` | SQLite persistence, repositories, DB schema |
| `domain` | ✅ `read`/`edit`/`search`/`todo` | Pure SRS, scoring, Japanese learning logic |
| `ui` | ✅ `read`/`edit`/`search`/`todo` | React components, views, IPC wiring, styling |
| `reviewer` | ✅ `read`/`edit`/`search`/`todo` | Code review, correctness checks, lint |
| `research` | ✅ `read`/`edit`/`search`/`todo` | Codebase exploration + plan.md creation, research with write access |
| `explore` | ❌ **read-only** — STRICTLY FORBIDDEN edits | Pure read-only research: find files, grep patterns, answer codebase questions |

**Critical**: `explore` is built into opencode and has a hard-coded "STRICTLY FORBIDDEN: ANY file edits" constraint. Do NOT call `explore` when you need to make changes. Use `data`/`domain`/`ui` for implementation work, or `research` when you need exploration + write capability (e.g. creating plan.md). If a subtask is pure read-only research (e.g. "find all files that use X"), `explore` is fine — but follow up with the correct agent type to do the actual work. The `research` agent is defined in `.opencode/agents/research.md` as a custom subagent with explicit write/edit permissions and a clean prompt (no "STRICTLY FORBIDDEN" constraint).

## Existing Agent Definitions

See `.github/agents/` for role-specific agent configs.


<!-- open-mem-context -->
## Project Activity (auto-generated by open-mem)

### electron-frontend\src/
| ID | Type | Title | Date |
|----|------|-------|------|
| f5d9becb-2ec6-401b-bd2e-941ca979057e | 🔵 discovery | Cassette CSS and tests remain after ScriptHubView carousel removal | 2026-07-06 |
| f8229f36-2589-4ae8-bec6-16a1815c22f8 | ✅ change | Minigame Select implementation: Batch 1 done, Batches 2-4 remain | 2026-07-06 |
| 6136bde9-04af-49df-ab26-70e28b7e5e64 | 🔵 discovery | Duplicated state-reset boilerplate across minigame event handlers in App.tsx | 2026-07-06 |

**Key concepts:** minigame-redesign, gotcha, what-changed, pattern

### electron-frontend\src\components/
| ID | Type | Title | Date |
|----|------|-------|------|
| e2335725-793e-47e4-bbd3-d6a3fe74c3b6 | 🔵 discovery | MinigameSelectView doesn't use buildCassetteItems utility — imports from constants instead | 2026-07-06 |

**Key concepts:** minigame-redesign, gotcha, what-changed

### electron-frontend\src\views/
| ID | Type | Title | Date |
|----|------|-------|------|
| f5d9becb-2ec6-401b-bd2e-941ca979057e | 🔵 discovery | Cassette CSS and tests remain after ScriptHubView carousel removal | 2026-07-06 |
| e2335725-793e-47e4-bbd3-d6a3fe74c3b6 | 🔵 discovery | MinigameSelectView doesn't use buildCassetteItems utility — imports from constants instead | 2026-07-06 |
| f8229f36-2589-4ae8-bec6-16a1815c22f8 | ✅ change | Minigame Select implementation: Batch 1 done, Batches 2-4 remain | 2026-07-06 |

**Key concepts:** minigame-redesign, gotcha, what-changed

💡 *Use `mem-find` to search full details. Use `mem-create` to save important decisions.*
<!-- /open-mem-context -->
