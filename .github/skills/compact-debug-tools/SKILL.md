---
name: compact-debug-tools
description: Runs compact, token-efficient debug diagnostics for workspace state and core checks.
---

Use when:
- You need a fast project snapshot with minimal output.
- You need condensed arch/db/srs gate results.
- You want short failure excerpts instead of full command logs.

Commands:
- python scripts\debug_tools.py snapshot
- python scripts\debug_tools.py snapshot --json
- python scripts\debug_tools.py checks
- python scripts\debug_tools.py checks --with-tests

Outcome:
- Provides a high-signal summary of repo status.
- Reduces noisy terminal output during diagnostics.

Constraints:
- Read-only diagnostics only; does not modify files.
- Use scripts\dev.py for full pre-merge validation.
