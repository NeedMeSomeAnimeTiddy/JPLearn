---
name: validate-system-integrity
description: Runs system integrity checks across Domain and Data layers.
---

Outcome:
- Confirms correctness of SRS logic and persistence layer

Constraints:
- Executes Domain unit tests
- Executes Data repository tests
- Must not modify system state