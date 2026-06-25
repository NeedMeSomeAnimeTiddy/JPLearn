---
name: simulate-srs-path
description: Simulates SRS interval progression for a learning item using deterministic logic.
---

Input:
- last_interval
- ease_factor
- performance score

Outcome:
- Predicted next interval and updated ease factor

Constraints:
- Uses Domain SRS function only
- No persistence or side effects
- Pure deterministic computation