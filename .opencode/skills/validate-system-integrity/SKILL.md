---
name: validate-system-integrity
description: Runs system integrity checks across Domain and Data layers — tests, arch, SRS, and DB checks.
---

Runs the full validation suite.

Commands:
- `python -m pytest -q` — all Python tests (33 test files)
- `python scripts/arch_check.py` — layer boundary verification
- `python scripts/srs_check.py` — SRS data integrity in app.db
- `python scripts/db_check.py` — DB schema validation
- `python scripts/debug_tools.py checks` — quick condensed checks
- `python scripts/dev.py` — full aggregate (ts_codegen → mypy → pytest → arch → srs → db)
- `npm run test:ui` — frontend vitest suite
- `npm run test:a11y` — axe-core accessibility tests

Outcome:
- Confirms correctness of SRS logic, persistence layer, layer boundaries, and tests

Constraints:
- Must not modify system state (read-only)
