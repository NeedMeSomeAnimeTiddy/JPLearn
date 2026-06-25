---
name: run-study-session
description: Executes a full study session using due items from the system and applies SRS logic.
---

Input:
- None or optional session parameters

Outcome:
- A study session is executed using due items
- Updated scheduling state is stored

Constraints:
- Domain handles SRS calculations
- Data provides due items and persists updates
- UI renders session output