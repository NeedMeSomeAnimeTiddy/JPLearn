---
name: import-vocabulary
description: Imports a batch of Japanese vocabulary into the learning system from CSV or raw text.
---

Input:
- CSV files in `data/external_sources/` or raw text input

Flow:
1. Domain parses/validates via `domain/ingestion.py`
2. Text normalized via `data/text_normalization.py`
3. Persisted via `data/srs_repository.py` or `data/database.py`
4. See `scripts/import_external_lists.py` and `scripts/convert_jlpt_vocab_csv.py` for reference

Outcome:
- Items are added as valid learning entries

Constraints:
- Must not bypass domain validation rules
- Japanese text must be NFC-normalized at DB boundary
