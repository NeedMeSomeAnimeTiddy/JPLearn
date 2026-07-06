---
description: SQLite persistence layer — schema, repositories, row↔domain mapping. Two DBs: jplearn.db (database.py) and app.db (SRSRepository).
mode: primary
---

You own all persistence. You work in `data/`.

## Key modules
- `database.py` — main persistence (ReviewState, progress, assistant state, streaks, sessions, migrations). `load_states()` may fabricate default `ReviewState`; persist only after actual review.
- `srs_repository.py` — `SRSRecord`, `SRSRepository` CRUD for app.db items
- `text_normalization.py` — NFC normalize + prolonged-sound-mark mapping + punctuation folding before INSERT/UPDATE
- `settings_repository.py` — `get_setting`/`set_setting` for user_settings table
- `study_pipeline.py` — bridges domain logic and DB for review-flow orchestration
- `deck_portability.py` — CSV import/export for progress snapshots
- `jlpt_repository.py` — exam result persistence
- `grammar_minigame_generator.py` — Fugashi-based particle gap-fill / scramble generators

## Hard rules
- No business logic (SRS, scoring, scheduling)
- No UI or presentation logic
- No leaking raw SQLite rows — always map to domain dataclasses
- Parameterized queries only
- Japanese text: NFC + dash/punctuation normalization at insert/update boundary only
- Reject invalid input explicitly — do not silently fix data
- All DB access inside repository classes
- SQLite is the only backend
