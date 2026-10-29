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

JPLearn now uses VOICEVOX for local Japanese speech playback.

1. Install and run VOICEVOX locally (default endpoint: `127.0.0.1:50021`).
2. Open JPLearn and select one of the built-in Japanese voices in Settings.

Advanced note: the previous custom voice-model builder pipeline has been
retired and is no longer part of normal setup or runtime.

### 5. Run

```bash
cd electron-frontend && npm run dev
```

When running the **installed app** for the first time, a setup wizard will offer
steps 2–4 automatically.

## Building the Windows installer

```bash
cd electron-frontend
npm run make:release
# Installer appears at: out/make/squirrel.windows/x64/JPLearn-Installer.exe
```

`make:release` fetches the valley models, rebuilds the bundled Python from scratch with the
package versions the tests use, builds the installer and then runs the packaged smoke test against
it. (`npm run make:win` alone builds an installer from whatever `python-bundle/` is lying around.)

Place `electron-frontend/assets/icon.ico` before building to include a custom app icon.

## Releases and updates

Installed copies check GitHub Releases once at launch (through update.electronjs.org) and offer a
newer version; Settings > "Check for updates automatically" turns that off. A release needs:

- a tag `v<version>` matching `electron-frontend/package.json`'s `version`, which is a plain
  `x.y.z` (Squirrel orders prerelease labels such as `beta10` before `beta9`);
- a normal, published release (the update service skips drafts and prereleases);
- three files from `electron-frontend/out/make/squirrel.windows/x64/`: `JPLearn-Installer.exe`,
  `RELEASES` and the `*-full.nupkg`.

The `release.yml` workflow does this on a tag push, but it runs on a self-hosted runner (hosted
runners are unavailable on this account). The local equivalent, after `npm run make:release`:

```bash
gh release create v0.1.0 --title "JPLearn v0.1.0" \
  electron-frontend/out/make/squirrel.windows/x64/JPLearn-Installer.exe \
  electron-frontend/out/make/squirrel.windows/x64/RELEASES \
  electron-frontend/out/make/squirrel.windows/x64/jplearn-0.1.0-full.nupkg
```

> **Note:** The installer is unsigned. Windows will show a SmartScreen warning on first run —
> click **More info → Run anyway** to proceed.

## User data

The installed app keeps two folders, both outside the install folder an update replaces:

| Folder | Contents |
|--------|----------|
| `Documents\JPLearn Progress\` | the progress database (`data\jplearn.db`), its safety copies and backups |
| `%LOCALAPPDATA%\JPLearn Assets\` | downloads: tutor and translation models, voice, speech and OCR models, fonts, and the optional features' Python packages (`python-packages\`) |

Uninstalling asks which of them to keep.

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
./.venv/Scripts/python.exe -m scripts.import_external_lists --conflict-policy keep-first
```

The default policy (`error`) stops on about 180 cross-level conflicts and writes nothing, so
`--conflict-policy keep-first` is required. If you pass `--output`, the path must be inside the repo
root. `keep-first` drops later-level rows that repeat an earlier list's spelling and reading, so
editing an earlier list can move later card ids. See `DEBT.md` #5.

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

## Acknowledgments

A lot of the architecture and bodywork in JPLearn was done with ChatGPT — the three-layer
structure, the frontend hook pattern, the SRS engine, and most of the feature wiring. It
served as a capable architect, reviewer, and debugger across the full stack, and the project
is better for it.

## Notes

- The legacy Python GUI entrypoint is deprecated.
- The supported interactive surface is the Electron frontend.
