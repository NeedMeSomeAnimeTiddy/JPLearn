"""Download a multilingual-e5 sentence embedding model for local retrieval.

This embedder is installed automatically alongside the tutor chatbot model —
it is not surfaced as a separate choice in Setup. The Electron setup runtime
maps each chatbot tier to one of the three embedder tiers below:

    low             -> e5_small
    medium, high    -> e5_base
    ultra, max      -> e5_large

Tiers:
    e5_small  intfloat/multilingual-e5-small  (~0.5 GB)
    e5_base   intfloat/multilingual-e5-base   (~1.1 GB)
    e5_large  intfloat/multilingual-e5-large  (~2.2 GB)

Files are saved to Documents\\JPLearn\\models\\embedders\\<tier>\\ when run
from the installed app, or to models/embedders/<tier>/ when run directly from
the repository.

Usage:
    python scripts/get_embedder_model.py --tier e5_small
    python scripts/get_embedder_model.py --tier e5_base
    python scripts/get_embedder_model.py --tier e5_large

Override download target:
    set JPLEARN_DOCUMENTS_DIR=C:\\path\\to\\dir

Progress is printed as "PHASE i/N: ..." per file and "downloading: NN% (MM MB)"
per chunk, matching the format the Electron setup wizard parses for other
get_*.py download helpers in this directory. Some files are optional across
model repos (not every sentence-transformers export includes all of them), so
missing files are skipped rather than failing the whole download.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MODELS: dict[str, dict] = {
    "e5_small": {
        "repo": "intfloat/multilingual-e5-small",
        "label": "Embedder Small (~0.5 GB)",
    },
    "e5_base": {
        "repo": "intfloat/multilingual-e5-base",
        "label": "Embedder Base (~1.1 GB)",
    },
    "e5_large": {
        "repo": "intfloat/multilingual-e5-large",
        "label": "Embedder Large (~2.2 GB)",
    },
}

# Required for the model to be usable; download fails if none of these are found.
REQUIRED_ANY_FILES = ("pytorch_model.bin", "model.safetensors")

# Optional supporting files; skipped silently if a given repo does not have them.
OPTIONAL_FILES = (
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "sentencepiece.bpe.model",
    "modules.json",
    "1_Pooling/config.json",
)

READY_MARKER = ".embedder-ready"


def resolve_target_dir(tier: str) -> Path:
    """Return the directory where this tier's embedder files should be saved."""
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    base = Path(docs_dir) / "models" / "embedders" if docs_dir else REPO_ROOT / "models" / "embedders"
    return base / tier


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def download_file(url: str, dest: Path) -> bool:
    """Download url to dest. Returns False (without raising) on HTTP 404."""
    tmp = dest.with_name(dest.name + ".tmp")
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    try:
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
        return True
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            try:
                tmp.unlink()
            except FileNotFoundError:
                pass
            return False
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=sorted(MODELS.keys()), required=True)
    args = parser.parse_args()

    model = MODELS[args.tier]
    target_dir = resolve_target_dir(args.tier)
    target_dir.mkdir(parents=True, exist_ok=True)

    all_filenames = list(REQUIRED_ANY_FILES) + list(OPTIONAL_FILES)
    total_files = len(all_filenames)
    found_required = False

    for index, filename in enumerate(all_filenames, start=1):
        dest = target_dir / filename
        if dest.exists():
            print(f"PHASE {index}/{total_files}: {filename} already present, skipping")
            if filename in REQUIRED_ANY_FILES:
                found_required = True
            continue
        print(f"PHASE {index}/{total_files}: downloading {filename}")
        url = f"https://huggingface.co/{model['repo']}/resolve/main/{filename}"
        ok = download_file(url, dest)
        if ok and filename in REQUIRED_ANY_FILES:
            found_required = True
        if not ok:
            print(f"  (not present in repo, skipped: {filename})")

    if not found_required:
        print(f"Error: no model weight file found for '{args.tier}' in {model['repo']}", file=sys.stderr)
        return 1

    (target_dir / READY_MARKER).write_text("ready", encoding="utf-8")
    print(f"Embedder '{args.tier}' ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
