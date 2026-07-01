"""Download and extract prebuilt llama.cpp Windows CPU binaries (latest release).

The app expects llama-server.exe at:
    tools/llama.cpp/build/bin/Release/llama-server.exe

Usage:
    python scripts/get_llama_cpp.py

The script queries the GitHub API for the latest llama.cpp release, finds the
Windows CPU x64 ZIP asset, downloads it, and flattens the binaries directly into
the target directory so llm_runtime.cjs can find them without any path changes.
"""

from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = REPO_ROOT / "tools" / "llama.cpp" / "build" / "bin" / "Release"
API_URL = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())


def find_asset(assets: list[dict]) -> dict | None:
    """Return the Windows CPU x64 ZIP asset, or None if not found."""
    for asset in assets:
        name: str = asset.get("name", "")
        if (
            name.endswith(".zip")
            and "win" in name.lower()
            and "cpu" in name.lower()
            and "x64" in name.lower()
        ):
            return asset
    return None


def download(url: str, destination: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
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


def extract_flat(zip_path: Path, target: Path) -> None:
    """Extract all files from the ZIP directly into target (no subdirectory nesting)."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.namelist():
            filename = Path(member).name
            if not filename:
                continue  # skip directory entries
            dest = target / filename
            with zf.open(member) as src, open(dest, "wb") as dst:
                dst.write(src.read())


def main() -> int:
    if (TARGET_DIR / "llama-server.exe").exists():
        print(f"llama-server.exe already present at {TARGET_DIR}")
        return 0

    print("Fetching latest llama.cpp release info from GitHub...")
    try:
        release = fetch_json(API_URL)
    except Exception as exc:
        print(f"Error fetching release info: {exc}", file=sys.stderr)
        return 1

    tag = release.get("tag_name", "unknown")
    assets: list[dict] = release.get("assets", [])

    asset = find_asset(assets)
    if asset is None:
        print("Error: could not find a Windows CPU x64 ZIP in the latest release.", file=sys.stderr)
        print("Available assets:", [a["name"] for a in assets], file=sys.stderr)
        return 1

    name: str = asset["name"]
    size_mb = asset["size"] // (1024 * 1024)
    url: str = asset["browser_download_url"]
    print(f"Found: {name}  ({size_mb} MB)  release {tag}")

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = TARGET_DIR / name

    if not zip_path.exists():
        print(f"Downloading to {zip_path} ...")
        try:
            download(url, zip_path)
        except Exception as exc:
            zip_path.unlink(missing_ok=True)
            print(f"\nDownload failed: {exc}", file=sys.stderr)
            return 1
    else:
        print(f"Archive already present: {zip_path}")

    print(f"Extracting to {TARGET_DIR} ...")
    try:
        extract_flat(zip_path, TARGET_DIR)
    except Exception as exc:
        print(f"Extraction failed: {exc}", file=sys.stderr)
        return 1

    server_exe = TARGET_DIR / "llama-server.exe"
    if server_exe.exists():
        print(f"\nDone — llama-server.exe is ready at:\n  {server_exe}")
    else:
        print("Warning: llama-server.exe not found after extraction.", file=sys.stderr)
        extracted = [f.name for f in TARGET_DIR.iterdir() if f.is_file()]
        print("Files present:", extracted, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
