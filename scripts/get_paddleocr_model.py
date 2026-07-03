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
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TOTAL_PHASES = 3
DOWNLOAD_RETRIES = 3
DOWNLOAD_TIMEOUT_SECONDS = 45

MODELS: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "standard": (
        (
            "det",
            (
                "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv4_det_infer.tar",
                "https://paddleocr.bj.bcebos.com/PP-OCRv3/multilingual/japan_PP-OCRv3_det_infer.tar",
                "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv3_det_infer.tar",
            ),
        ),
        (
            "rec",
            (
                "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv4_rec_infer.tar",
            ),
        ),
        (
            "cls",
            (
                "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_ppocr_mobile_v2.0_cls_infer.tar",
            ),
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


def download_bytes(urls: tuple[str, ...], label: str) -> bytes:
    candidate_errors: list[str] = []

    for candidate_index, url in enumerate(urls, start=1):
        req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
        last_error: Exception | None = None

        for attempt in range(1, DOWNLOAD_RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
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
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
                last_error = exc
                if attempt >= DOWNLOAD_RETRIES:
                    break
                print(
                    f"Retry {attempt}/{DOWNLOAD_RETRIES - 1} for {label} (url {candidate_index}/{len(urls)}) after error: {exc}",
                    file=sys.stderr,
                )
                time.sleep(min(2 * attempt, 5))

        candidate_errors.append(f"url {candidate_index}/{len(urls)}: {last_error}")

    joined_errors = "; ".join(candidate_errors)
    raise RuntimeError(f"Download failed for {label}: {joined_errors}")


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
    for index, (label, urls) in enumerate(assets, start=1):
        print(f"PHASE {index}/{TOTAL_PHASES}: {label}")
        phase_dir = target_dir / label
        phase_dir.mkdir(parents=True, exist_ok=True)
        try:
            payload = download_bytes(urls, label)
            extract_tar_bytes(payload, phase_dir)
        except Exception as exc:
            print(f"ERROR: phase '{label}' failed: {exc}", file=sys.stderr)
            return 1

    print(f"PaddleOCR '{args.tier}' assets ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
