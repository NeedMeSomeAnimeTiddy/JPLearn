"""Download PaddleOCR Japanese inference assets for offline OCR.

This script downloads a small set of PaddleOCR inference archives for
Japanese OCR and extracts them into a local directory. It is designed for
Setup Wizard / Settings downloads and prints progress in the same format
parsed by the Electron setup runtime:

- "PHASE i/N: ..."
- "downloading: NN%  (MM MB)"

Usage:
    python scripts/get_paddleocr_model.py
    python scripts/get_paddleocr_model.py --tier standard
    python scripts/get_paddleocr_model.py --dest C:\\path\\to\\ocr\\standard
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import tarfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TOTAL_PHASES = 3

MODELS: dict[str, tuple[tuple[str, str], ...]] = {
    "standard": (
        (
            "det",
            "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv3_det_infer.tar",
        ),
        (
            "rec",
            "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv4_rec_infer.tar",
        ),
        (
            "cls",
            "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_ppocr_mobile_v2.0_cls_infer.tar",
        ),
    ),
}


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def resolve_default_dest(tier: str) -> Path:
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    if docs_dir:
        return Path(docs_dir) / "ocr" / tier
    return REPO_ROOT / "data" / "ocr" / tier


def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        chunks: list[bytes] = []
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            chunks.append(chunk)
            done += len(chunk)
            report(done, total)
        sys.stdout.write("\n")
    return b"".join(chunks)


def extract_tar_bytes(payload: bytes, target_dir: Path) -> None:
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:*") as archive:
        archive.extractall(target_dir)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download PaddleOCR model assets")
    parser.add_argument("--tier", choices=sorted(MODELS.keys()), default="standard")
    parser.add_argument("--dest", default="", help="Destination directory for OCR assets")
    args = parser.parse_args()

    target_dir = Path(args.dest).expanduser().resolve() if args.dest else resolve_default_dest(args.tier)
    target_dir.mkdir(parents=True, exist_ok=True)

    assets = MODELS[args.tier]
    for index, (label, url) in enumerate(assets, start=1):
        print(f"PHASE {index}/{TOTAL_PHASES}: {label}")
        phase_dir = target_dir / label
        phase_dir.mkdir(parents=True, exist_ok=True)
        payload = download_bytes(url)
        extract_tar_bytes(payload, phase_dir)

    print(f"PaddleOCR '{args.tier}' assets ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
