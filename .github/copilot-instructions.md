# JPLearn Copilot Instructions

## Core rules

- Python 3.11+
- Type hints are required for public APIs.
- Prefer simple, direct implementations.
- Use `pytest` for tests.
- Keep code minimal and readable.
- Read the layer-specific instruction file before editing `domain\`, `data\`, or `ui\` files.

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

The canonical layers are:

- `domain\` for deterministic learning logic, models, and built-in deck definitions.
- `data\` for SQLite persistence and row-to-domain mapping.
- `ui\` for CLI and Tkinter presentation code.

`src\` is legacy and should stay minimal. Prefer the layered packages for new work.

The app has two separate persistence flows:

- Current review flow: `domain\decks.py` -> `data\database.py` -> `ui\cli.py` or `ui\tk_app.py` -> `data\database.save_state()`.
- Layered SRS flow: `domain\srs.py` -> `data\srs_repository.py` -> `scripts\srs_apply.py`.

Keep `data\jplearn.db` and `data\app.db` concerns separate.

## Repository-specific conventions

- Respect the layer boundaries enforced by the instruction files and `scripts\arch_check.py`.
- Normalize Japanese text before storage in the data layer.
- `data\database.load_states()` fabricates default `ReviewState` objects for missing rows; they are only persisted after a review.
- Progress reporting uses the shared mastered threshold: `repetitions >= 3` and `interval >= 21`.
- The shipped content currently covers Hiragana and Katakana only.
