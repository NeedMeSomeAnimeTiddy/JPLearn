"""Download the appropriate GGUF chat model based on available system RAM.

Three tiers are available:
    low   qwen2.5-1.5b-instruct-q8_0.gguf  (~1.9 GB)  RAM < 16 GB  (auto-default)
    high  qwen2.5-3b-instruct-q8_0.gguf    (~3.6 GB)  RAM >= 16 GB (auto-default)
    ultra Qwen3.5-9B-Q6_K.gguf             (~7.5 GB)  explicit choice only

The selected file is saved to Documents\\JPLearn\\models\\ when run from the
installed app, or to models/llama/ when run directly from the repository.

Usage:
    python scripts/get_gguf_model.py              # auto-detect RAM, choose tier
    python scripts/get_gguf_model.py --tier low   # force low-end model
    python scripts/get_gguf_model.py --tier high  # force high-end model
    python scripts/get_gguf_model.py --tier ultra # force ultra model (large!)

Override download target:
    set JPLEARN_DOCUMENTS_DIR=C:\\path\\to\\dir
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RAM_THRESHOLD_GB = 16.0

MODELS: dict[str, dict] = {
    "low": {
        "filename": "qwen2.5-1.5b-instruct-q8_0.gguf",
        "repo": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        "size_gb": 1.9,
        "label": "Low-end  (~1.9 GB)",
    },
    "high": {
        "filename": "qwen2.5-3b-instruct-q8_0.gguf",
        "repo": "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "size_gb": 3.6,
        "label": "High-end (~3.6 GB)",
    },
    "ultra": {
        "filename": "Qwen3.5-9B-Q6_K.gguf",
        "repo": "unsloth/Qwen3.5-9B-GGUF",
        "size_gb": 7.5,
        "label": "Ultra    (~7.5 GB)",
    },
}


def resolve_target_dir() -> Path:
    """Return the directory where the model file should be saved."""
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    if docs_dir:
        target = Path(docs_dir) / "models"
    else:
        target = REPO_ROOT / "models" / "llama"
    target.mkdir(parents=True, exist_ok=True)
    return target


def get_total_ram_gb() -> float:
    """Return total installed RAM in GB, or 0.0 if detection fails."""
    try:
        import psutil  # type: ignore[import]
        return psutil.virtual_memory().total / (1024 ** 3)
    except ImportError:
        pass
    # Windows fallback via wmic
    try:
        result = subprocess.run(
            ["wmic", "computersystem", "get", "TotalPhysicalMemory"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                return int(line) / (1024 ** 3)
    except Exception:
        pass
    return 0.0


def auto_tier(ram_gb: float) -> str:
    return "high" if ram_gb >= RAM_THRESHOLD_GB else "low"


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        mb_done = done // (1024 * 1024)
        mb_total = total // (1024 * 1024)
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({mb_done} / {mb_total} MB)")
        sys.stdout.flush()


def download(url: str, tmp_path: Path, final_path: Path) -> None:
    """Download url to tmp_path, then rename to final_path on success.

    Writes to a .tmp file first so a cancelled or failed download never leaves
    a corrupt .gguf that the runtime might try to load.
    """
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    # urllib.request.urlopen follows HTTP redirects automatically (HuggingFace → CDN).
    with urllib.request.urlopen(req) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(tmp_path, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
                done += len(chunk)
                report(done, total)
    sys.stdout.write("\n")
    tmp_path.rename(final_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a GGUF model for JPLearn.")
    parser.add_argument(
        "--tier",
        choices=["low", "high", "ultra"],
        default=None,
        help="Force a specific model tier instead of auto-detecting from RAM.",
    )
    args = parser.parse_args()

    target_dir = resolve_target_dir()
    ram_gb = get_total_ram_gb()

    if args.tier:
        tier = args.tier
        reason = "forced via --tier flag"
    else:
        tier = auto_tier(ram_gb)
        if ram_gb > 0:
            reason = f"detected {ram_gb:.1f} GB RAM (threshold: {RAM_THRESHOLD_GB} GB)"
        else:
            reason = "RAM detection failed — defaulting to low-end"

    model = MODELS[tier]
    filename: str = model["filename"]
    repo: str = model["repo"]
    label: str = model["label"]
    hf_url = f"https://huggingface.co/{repo}/resolve/main/{filename}"

    print(f"System RAM : {ram_gb:.1f} GB  ({reason})")
    print(f"Selected   : {label}  [{tier}]")
    print(f"File       : {filename}")
    print(f"Destination: {target_dir}")

    final_path = target_dir / filename
    if final_path.exists():
        print(f"\nModel already present: {final_path}")
        return 0

    if tier == "ultra":
        print("\n⚠  Ultra model is ~7.5 GB. On a slow connection this may take 15–30 minutes.")

    print(f"\nDownloading from:\n  {hf_url}\n")
    tmp_path = target_dir / (filename + ".tmp")
    try:
        download(hf_url, tmp_path, final_path)
    except KeyboardInterrupt:
        tmp_path.unlink(missing_ok=True)
        print("\nCancelled — partial file removed.")
        return 1
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        print(f"\nDownload failed: {exc}", file=sys.stderr)
        return 1

    print(f"\nDone — model saved to:\n  {final_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
