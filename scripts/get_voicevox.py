"""Download and extract the VOICEVOX engine (Windows CPU build) into data/voicevox.

VOICEVOX is a local HTTP TTS server that produces very natural Japanese speech.
The app launches the engine's run.exe and talks to it over HTTP. This helper
fetches the prebuilt engine (~1 GB) and flattens it so run.exe sits at
data/voicevox/run.exe.

Usage:
    python scripts/get_voicevox.py        # downloads + extracts the engine

Override the version/URL with VOICEVOX_VERSION / VOICEVOX_VVPP_URL.
"""

from __future__ import annotations

import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

VERSION = os.environ.get("VOICEVOX_VERSION", "0.25.2")
DEFAULT_URL = (
    f"https://github.com/VOICEVOX/voicevox_engine/releases/download/{VERSION}/"
    f"voicevox_engine-windows-cpu-{VERSION}.vvpp"
)
URL = os.environ.get("VOICEVOX_VVPP_URL", DEFAULT_URL)

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = REPO_ROOT / "data" / "voicevox"


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def download(url: str, destination: Path) -> None:
    with urllib.request.urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(destination, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
                done += len(chunk)
                report(done, total)
    sys.stdout.write("\n")


def find_run_exe(root: Path) -> Path | None:
    for candidate in root.rglob("run.exe"):
        return candidate
    return None


def flatten(extract_root: Path) -> None:
    run_exe = find_run_exe(extract_root)
    if run_exe is None:
        raise RuntimeError("run.exe not found in the extracted VOICEVOX engine")
    engine_dir = run_exe.parent
    if engine_dir == TARGET_DIR:
        return
    for item in engine_dir.iterdir():
        dest = TARGET_DIR / item.name
        if dest.exists():
            if dest.is_dir():
                shutil.rmtree(dest)
            else:
                dest.unlink()
        shutil.move(str(item), str(dest))


def main() -> int:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if (TARGET_DIR / "run.exe").exists():
        print(f"VOICEVOX engine already present at {TARGET_DIR / 'run.exe'}")
        return 0

    archive = TARGET_DIR / "voicevox_engine.vvpp"
    if not archive.exists():
        print(f"Downloading VOICEVOX engine {VERSION} ...")
        download(URL, archive)

    extract_root = TARGET_DIR / "_extract"
    extract_root.mkdir(parents=True, exist_ok=True)
    print("Extracting (this can take a minute) ...")
    # A .vvpp package is a ZIP archive.
    with zipfile.ZipFile(str(archive), "r") as archive_file:
        archive_file.extractall(path=str(extract_root))

    flatten(extract_root)
    shutil.rmtree(extract_root, ignore_errors=True)
    archive.unlink(missing_ok=True)

    run_exe = TARGET_DIR / "run.exe"
    if not run_exe.exists():
        print("Extraction finished but run.exe is missing", file=sys.stderr)
        return 1
    print(f"VOICEVOX engine ready: {run_exe}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
