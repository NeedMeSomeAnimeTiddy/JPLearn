"""Download faster-whisper CTranslate2 model files for offline Japanese speech recognition.

Three tiers are available:
    fast      Systran/faster-whisper-small      (~500 MB)   quickest, lower accuracy
    balanced  Systran/faster-whisper-medium     (~1.5 GB)   balanced speed/accuracy
    high      distil-whisper/distil-large-v3    (~1.9 GB)   near-ultra quality, faster
    ultra     Systran/faster-whisper-large-v3   (~3.1 GB)   slowest, best accuracy

Files are saved to Documents\\JPLearn\\whisper\\<tier>\\ when run from the
installed app, or to data/whisper/<tier>/ when run directly from the repository.

Usage:
    python scripts/get_whisper_model.py               # downloads default "fast" tier
    python scripts/get_whisper_model.py --tier fast
    python scripts/get_whisper_model.py --tier balanced
    python scripts/get_whisper_model.py --tier high
    python scripts/get_whisper_model.py --tier ultra

Override download target:
    set JPLEARN_DOCUMENTS_DIR=C:\\path\\to\\dir

Progress is printed as "PHASE i/N: ..." per file and "downloading: NN% (MM MB)"
per chunk, matching the format the Electron setup wizard parses for other
get_*.py download helpers in this directory.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MODELS: dict[str, dict] = {
    "fast": {
        "repo": "Systran/faster-whisper-small",
        "label": "Fast (small, ~500 MB)",
        "files": ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"),
    },
    "balanced": {
        "repo": "Systran/faster-whisper-medium",
        "label": "Balanced (medium, ~1.5 GB)",
        "files": ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"),
    },
    "high": {
        "repo": "distil-whisper/distil-large-v3",
        "label": "High (distil-large-v3, ~1.9 GB)",
        "files": ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"),
    },
    "ultra": {
        "repo": "Systran/faster-whisper-large-v3",
        "label": "Ultra (large-v3, ~3.1 GB)",
        "files": ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"),
    },
}


def resolve_target_dir(tier: str) -> Path:
    """Return the directory where this tier's model files should be saved."""
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    base = Path(docs_dir) / "whisper" if docs_dir else REPO_ROOT / "data" / "whisper"
    return base / tier


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def download_file(url: str, dest: Path) -> None:
    tmp = dest.with_name(dest.name + ".tmp")
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        total = int(response.headers.get("Content-Length", "0"))
        done = 0
        with open(tmp, "wb") as out:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                report(done, total)
    print()
    tmp.replace(dest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=sorted(MODELS.keys()), default="fast")
    args = parser.parse_args()

    model = MODELS[args.tier]
    target_dir = resolve_target_dir(args.tier)
    target_dir.mkdir(parents=True, exist_ok=True)

    filenames = model["files"]
    total_files = len(filenames)
    for index, filename in enumerate(filenames, start=1):
        dest = target_dir / filename
        if dest.exists():
            print(f"PHASE {index}/{total_files}: {filename} already present, skipping")
            continue
        print(f"PHASE {index}/{total_files}: downloading {filename}")
        url = f"https://huggingface.co/{model['repo']}/resolve/main/{filename}"
        download_file(url, dest)

    print(f"Whisper model '{args.tier}' ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
