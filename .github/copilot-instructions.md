# JPLearn Copilot Instructions

## Core rules

- Python 3.11+
- Type hints are required for public APIs.
- Prefer simple, direct implementations.
- Use `pytest` for tests.
- Keep code minimal and readable.

## Run, test, and check commands

```powershell
python -m pip install -r requirements.txt
python main.py
python gui.py
python scripts\dev.py
python -m mypy --explicit-package-bases .
python scripts\arch_check.py
python scripts\db_check.py
python scripts\srs_check.py
python -m pytest -q
python -m pytest tests\path\to\test_file.py -q
python -m pytest tests\path\to\test_file.py::test_name -q
```

`scripts\dev.py` is the main aggregate check. It runs, in order, `mypy`, the architecture import guard, the DB schema check, the SRS integrity check, and then `pytest`.

There is no packaging/build pipeline in the repository today. The main runnable entry points are `main.py` for the Rich CLI and `gui.py` at the repo root for the Tkinter UI launcher.

## High-level architecture

The canonical application layers are now:

- `domain\` for deterministic learning logic, models, and built-in deck definitions.
- `data\` for SQLite persistence and row-to-domain mapping.
- `ui\` for CLI and Tkinter presentation code.

`src\` is effectively legacy and should stay minimal. Prefer the layered packages for all new work.

The active review flow is:

1. `domain\decks.py` builds in-memory `Deck` and `Card` objects and registers them in `ALL_DECKS`.
2. `data\database.py` loads or synthesizes `ReviewState` rows from `data\jplearn.db`.
3. `ui\cli.py` or `ui\tk_app.py` filters due cards with `ReviewState.is_due()`, collects a rating, and calls `domain\scheduler.update()`.
4. The updated review state is written back through `data\database.save_state()`.

The layered SRS path is separate from the current app path:

- `domain\srs.py` holds deterministic SRS logic.
- `data\srs_repository.py` persists SRS records in `data\app.db`.
- `scripts\srs_apply.py` is the bridge that reads from the repository, converts to domain state, applies the domain update, and writes the result back.

Do not casually merge those two persistence flows: the current app uses `data\jplearn.db`, while the layered SRS scripts use `data\app.db`.

## Repository-specific conventions

- Respect the layer boundaries enforced by the instruction files and `scripts\arch_check.py`:
  - `domain\`: pure deterministic logic only; no database access, UI code, file I/O, or hidden state.
  - `data\`: SQLite/repository code only; use parameterized SQL and keep business logic out of the repository layer.
  - `ui\`: presentation only; call into domain/data instead of embedding business rules.
- Normalize Japanese text before storage in the data layer.
- The real UI surfaces today are `main.py` + `ui\cli.py` for the CLI and `gui.py` + `ui\tk_app.py` for the desktop UI. If you change review behavior or progress calculations, check both surfaces so they stay aligned.
- Add new decks through loader functions in `domain\decks.py` and register them in `ALL_DECKS`; both the CLI and GUI depend on that registry instead of hard-coding deck objects.
- Unseen cards are not inserted eagerly into the database. `data\database.load_states()` fabricates default `ReviewState` objects for missing rows, and those defaults are only persisted after a review.
- Progress reporting uses shared implicit thresholds: a card counts as mastered when `repetitions >= 3` and `interval >= 21`, and due cards are determined by `ReviewState.is_due()`. Keep those semantics consistent anywhere stats or review queues are changed.
- The README roadmap mentions broader kanji/vocabulary goals, but the built-in shipped content currently covers Hiragana and Katakana only.
