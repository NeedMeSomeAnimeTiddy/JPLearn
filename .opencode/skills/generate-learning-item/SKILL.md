---
name: generate-learning-item
description: Creates a new Japanese learning item from input text using Domain logic and persists it in the system.
---

Input:
- Raw Japanese text or vocabulary entry

Flow:
1. Domain layer parses and validates via `domain/ingestion.py` → `ingest_card()`/`ingest_batch()`
2. Card + deck models in `domain/cards.py`
3. Text normalized via `data/text_normalization.py` (NFC + prolonged-sound-mark mapping)
4. Persisted via `data/srs_repository.py` (SRSRepository into app.db) or `data/database.py` (jplearn.db)

Outcome:
- A validated learning item is created and stored

Constraints:
- Domain handles parsing and validation; Data handles persistence
- No direct business logic inside Skill
- Respect layer boundaries (domain cannot access data)
