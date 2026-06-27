# JPLearn

JPLearn is a desktop Japanese learning app with an Electron frontend and a Python backend.
It combines game-like practice modes, spaced repetition scheduling, and progress analytics in one local app.

## Feature Highlights

- Study tracks: Hiragana, Katakana, JLPT Kanji (N5-N1), JLPT Vocabulary (N5-N1), and grammar patterns.
- Practice modes: Romaji Sprint, Meaning Match, Character Match, Stroke Order, Typed Recall, Context Cloze, Narrative Story, and Interleave Mix.
- Adaptive scheduling: queue balancing across due, new, and leech cards with spaced-repetition updates per answer.
- Progress visibility: streaks, 7-day/30-day activity, mistake trends, deck mastery, and session summaries.
- Assistant features: event feed, contextual coaching, persistent chat history, and local runtime chat controls.
- Personalization: themes, backgrounds, fonts, animations, tutor settings, voice settings, and shortcut controls.

For the full product-style list, see [FEATURES.md](FEATURES.md).

## Documentation

- Feature list: [FEATURES.md](FEATURES.md)
- Product roadmap: [ROADMAP.md](ROADMAP.md)

## Quick Start

### Requirements

- Python 3.11+
- Node.js 20+

### Install

```bash
python -m pip install -r requirements.txt
cd electron-frontend && npm install
```

### Run in Development

```bash
cd electron-frontend
npm run dev
```

### Run Built App Locally

```bash
cd electron-frontend
npm run build
npm run start
```

## Common Developer Commands

### Validate Python side

```bash
python scripts/dev.py
```

### Run targeted tests

```bash
python -m pytest tests/path/to/test_file.py -q
```

### Build Windows package

```bash
cd electron-frontend
npm run make:win
```

### Regenerate external content module from CSV

```bash
python scripts/import_external_lists.py
```

### Export / import progress snapshots

```bash
python scripts/deck_portability.py export --output data/exports/progress.json
python scripts/deck_portability.py import --input data/exports/progress.json --mode merge
```

### Compact debug tools

```bash
python scripts/debug_tools.py snapshot
python scripts/debug_tools.py checks
python scripts/debug_tools.py diagnostics
```

## Optional Local Tutor Runtime (llama.cpp)

- llama.cpp source: `tools/llama.cpp`
- expected binary: `tools/llama.cpp/build/bin/Release/llama-cli.exe`
- model folder: `models/llama/`
- optional setup helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_llama_env.ps1
```

## Notes

- The legacy Python GUI entrypoint is deprecated.
- The supported interactive surface is the Electron frontend.
