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

## Building from a Fresh Clone

After cloning the repository, run these steps in order.

### 1. Core setup (required)

```bash
python -m pip install -r requirements.txt
cd electron-frontend && npm ci
```

### 2. AI Tutor — llama.cpp binaries (optional)

Downloads the latest prebuilt Windows CPU binaries from the llama.cpp GitHub releases:

```bash
python scripts/get_llama_cpp.py
```

### 3. AI Tutor — chat model (optional)

Auto-detects your RAM and downloads the appropriate model:

```bash
python scripts/get_gguf_model.py          # auto-detect RAM
python scripts/get_gguf_model.py --tier low    # force small model (~1.4 GB)
python scripts/get_gguf_model.py --tier high   # force medium model (~2.6 GB)
python scripts/get_gguf_model.py --tier ultra  # large model (~5.5 GB)
```

### 4. Japanese voice TTS (optional)

Build the qwentts.cpp runtime once (Windows, requires Visual Studio 2022 with the
C++ workload):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_qwentts_cpp.ps1
```

Then install a voice model via the app's Setup Wizard, or download one directly
from https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF into
`Documents\JPLearn\tts\models\` (both a `qwen-talker-*.gguf` and the shared
`qwen-tokenizer-12hz-*.gguf` are required). Curated preset speakers are built
from reference clips with `python scripts/build_qwentts_preset_bank.py`
(see `data/tts/speaker_intake/README.md`).

### 5. Run

```bash
cd electron-frontend && npm run dev
```

When running the **installed app** for the first time, a setup wizard will offer
steps 2–4 automatically.

## Building the Windows installer

```bash
cd electron-frontend
npm run make:win
# Installer appears at: out/make/squirrel.windows/x64/*Setup.exe
```

Place `electron-frontend/assets/icon.ico` before building to include a custom app icon.

## GitHub Releases

Push a version tag to trigger the release workflow:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The GitHub Actions workflow builds the installer and publishes a GitHub Release automatically.
Requires repo → Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" enabled.

> **Note:** The installer is unsigned. Windows will show a SmartScreen warning on first run —
> click **More info → Run anyway** to proceed.

## User data

The installed app stores all user data in `Documents\JPLearn\`:

| Folder | Contents |
|--------|----------|
| `models\` | GGUF model files |
| `tts\` | Japanese voice models and curated preset speaker bank |
| `data\` | SQLite databases (progress, settings) |

These files survive uninstall and are detected automatically on reinstall.

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
