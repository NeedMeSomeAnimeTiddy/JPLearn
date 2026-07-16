# JPLearn Copilot Instructions

## Core Rules

- Python 3.11+
- Public APIs require type hints
- Keep implementations simple
- Use `pytest`
- Read the matching layer instruction before editing `domain/`, `data/`, or `electron-frontend/`
- **Never commit `plan.md`**. It is a temporary planning artifact, not project source. Always check `git status` before staging and exclude it.

## Context-Budget Policy

- Load only the instruction files that apply to touched paths
- Avoid loading skill docs unless the task explicitly matches that skill
- Prefer focused searches and batched reads

## Validation Policy (Quiet by Default)

- Read first, run commands second
- Validate only changed files by default
- Start with the smallest relevant check
- Run full checks only on request or high cross-cutting risk
- Escalate to `python scripts/dev.py` only when needed

## Architecture Snapshot

- `domain/`: deterministic learning logic
- `data/`: SQLite persistence and mapping
- `electron-frontend/`: active UI surface and IPC wiring
- `src/` is legacy; prefer layered packages for new work
- Keep `data/jplearn.db` and `data/app.db` concerns separate

## Repo Conventions

- Respect layer boundaries and `scripts/arch_check.py`
- Normalize Japanese text before storage (data layer)
- `data/database.load_states()` may fabricate default `ReviewState`; persist only after review
- Mastered threshold: `repetitions >= 3` and `interval >= 21`

## High-Value Commands

- `python -m pytest -q`
- `python -m pytest tests/path/to/test_file.py -q`
- `python scripts/arch_check.py`
- `python scripts/dev.py` (full aggregate check)
