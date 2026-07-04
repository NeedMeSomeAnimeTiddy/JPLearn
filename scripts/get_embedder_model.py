"""Download a multilingual-e5 sentence embedding model (ONNX, quantized) for
local retrieval.

This embedder is installed automatically alongside the tutor chatbot model —
it is not surfaced as a separate choice in Setup. The Electron setup runtime
maps each chatbot tier to one of the three embedder tiers below:

    low             -> e5_small
    medium, high    -> e5_base
    ultra, max      -> e5_large

Tiers (quantized ONNX, from the Xenova mirrors of the intfloat/multilingual-e5
models — see https://huggingface.co/Xenova):
    e5_small  Xenova/multilingual-e5-small  (~140 MB)
    e5_base   Xenova/multilingual-e5-base   (~300 MB)
    e5_large  Xenova/multilingual-e5-large  (~585 MB)

Using pre-converted, int8-quantized ONNX weights (instead of the raw PyTorch
checkpoints) means the embedder can run with the lightweight `onnxruntime`
package instead of `torch`/`transformers` (roughly 15-20 MB vs. 1+ GB), and
the download itself is 3-4x smaller than the full-precision weights.

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
get_*.py download helpers in this directory. Some supporting files are
optional across model repos, so missing ones are skipped rather than failing
the whole download.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hf_download import download_file as _download_file, get_last_download_method  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent

MODELS: dict[str, dict] = {
    "e5_small": {
        "repo": "Xenova/multilingual-e5-small",
        "label": "Embedder Small (~140 MB)",
    },
    "e5_base": {
        "repo": "Xenova/multilingual-e5-base",
        "label": "Embedder Base (~300 MB)",
    },
    "e5_large": {
        "repo": "Xenova/multilingual-e5-large",
        "label": "Embedder Large (~585 MB)",
    },
}

# The quantized ONNX weight file is required; download fails if it's missing.
REQUIRED_FILES = ("onnx/model_quantized.onnx",)

# Optional supporting tokenizer/config files; skipped silently if a given repo
# does not have them.
OPTIONAL_FILES = (
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "sentencepiece.bpe.model",
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
        method = get_last_download_method()
        sys.stdout.write(f"\rdownloading: {pct:3d}% [{method}]  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def download_file(url: str, dest: Path) -> bool:
    """Download url to dest. Returns False (without raising) on HTTP 404."""
    tmp = dest.with_name(dest.name + ".tmp")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        _download_file(url, tmp, report=report)
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
    (target_dir / "onnx").mkdir(parents=True, exist_ok=True)

    all_filenames = list(REQUIRED_FILES) + list(OPTIONAL_FILES)
    total_files = len(all_filenames)
    found_required = True

    for index, filename in enumerate(all_filenames, start=1):
        dest = target_dir / filename
        is_required = filename in REQUIRED_FILES
        if dest.exists():
            print(f"PHASE {index}/{total_files}: {filename} already present, skipping")
            continue
        print(f"PHASE {index}/{total_files}: downloading {filename}")
        url = f"https://huggingface.co/{model['repo']}/resolve/main/{filename}"
        ok = download_file(url, dest)
        if not ok:
            print(f"  (not present in repo, skipped: {filename})")
            if is_required:
                found_required = False

    if not found_required:
        print(f"Error: required ONNX weight file missing for '{args.tier}' in {model['repo']}", file=sys.stderr)
        return 1

    (target_dir / READY_MARKER).write_text("ready", encoding="utf-8")
    print(f"Embedder '{args.tier}' ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
