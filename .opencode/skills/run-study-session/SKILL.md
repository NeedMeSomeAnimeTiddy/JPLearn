---
name: run-study-session
description: Executes a full study session using due items from the system and applies SRS logic.
---

Executes a study session using due items, applies SM-2 or FSRS v4 scheduling, and persists updates.

Flow:
1. Data provides due items via `data/study_pipeline.py` or `data/srs_repository.py`
2. Domain performs SRS calculations via `domain/srs.py` (SM-2) or `domain/scheduler.py` (FSRS v4)
3. Updated scheduling state is stored back via data layer
4. IPC bridge at `scripts/desktop_bridge.py` handles the Electron→Python session flow

Outcome:
- Reviewed items updated with new intervals/ease factors
- Session summary recorded

Constraints:
- Domain handles pure SRS calculations
- Data provides items and persists updates
- UI renders session output via electron-frontend
- See `electron/components/minigame/` for UI components
