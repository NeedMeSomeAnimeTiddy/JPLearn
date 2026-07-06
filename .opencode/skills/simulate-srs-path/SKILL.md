---
name: simulate-srs-path
description: Simulates SRS interval progression for a learning item using deterministic logic.
---

Simulates SRS interval progression for a learning item.

Input:
- last_interval (days)
- ease_factor (float, typically 2.5 baseline)
- performance score (domain-specific rating)

Implementation:
- SM-2: `domain/srs.py` — `update_srs(state, performance, settings, confidence?) → SRSState`
- FSRS v4: `domain/scheduler.py` — `ReviewState.update(performance) → ReviewState` (forgetting-curve model)

Outcome:
- Predicted next interval (days) and updated ease factor

Constraints:
- Pure deterministic computation — no side effects
- No persistence or I/O
- See `scripts/srs_fixtures.py` for fixture generation, `scripts/srs_replay.py` for bulk replay
