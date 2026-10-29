"""Prepare PaddleOCR ONNX assets for offline-ish OCR runtime usage.

This script warms up the ONNX OCR models used by the desktop bridge:

- Text detection: PP-OCRv6_medium_det
- Text recognition: PP-OCRv6_medium_rec

PaddleOCR fetches the models by name into PaddleX's cache, which
``scripts/ocr_model_cache.py`` points inside the app's assets folder: the OCR
runtime reads them from there and never downloads (audit 6 F7). Weights an
older install left in ``~/.paddlex`` are copied across first, so updating
does not download them again. The script keeps setup progress compatible with the
Electron setup runtime by emitting:

- "PHASE i/N: ..."
- "downloading: NN%  (MM MB)"

Usage:
    python scripts/get_paddleocr_model.py
    python scripts/get_paddleocr_model.py --tier standard
    python scripts/get_paddleocr_model.py --dest C:\\path\\to\\ocr\\standard
"""

from __future__ import annotations

import argparse
import sys
import json
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.downloaded_packages import activate as _activate_downloaded_packages  # noqa: E402

_activate_downloaded_packages()  # OCR's packages, in the installed app (audit 13, F2)

from scripts.ocr_model_cache import (  # noqa: E402
    MISSING_WEIGHTS_MESSAGE,
    adopt_legacy_weights,
    configure_cache,
    has_required_weights,
)

TOTAL_PHASES = 3

MODEL_NAMES: dict[str, dict[str, str]] = {
    "standard": {
        "det": "PP-OCRv6_medium_det",
        "rec": "PP-OCRv6_medium_rec",
    }
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


def _warmup_onnx_models(tier: str) -> None:
    # Before PaddleOCR is imported: PaddleX reads its cache folder at import.
    models_dir = configure_cache()
    if models_dir is not None:
        adopt_legacy_weights(models_dir)

    try:
        from paddleocr import TextDetection, TextRecognition  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError(
            "PaddleOCR runtime is unavailable. Install 'paddleocr' and 'onnxruntime'."
        ) from exc

    os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")

    model_names = MODEL_NAMES[tier]

    print("PHASE 1/3: det")
    report(100, 100)
    TextDetection(model_name=model_names["det"], engine="onnxruntime")
    sys.stdout.write("\n")

    print("PHASE 2/3: rec")
    report(100, 100)
    TextRecognition(model_name=model_names["rec"], engine="onnxruntime")
    sys.stdout.write("\n")

    print("PHASE 3/3: finalize")
    if models_dir is not None and not has_required_weights(models_dir):
        raise RuntimeError(MISSING_WEIGHTS_MESSAGE)
    report(100, 100)
    sys.stdout.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download PaddleOCR model assets")
    parser.add_argument("--tier", choices=sorted(MODEL_NAMES.keys()), default="standard")
    parser.add_argument("--dest", default="", help="Destination directory for OCR assets")
    args = parser.parse_args()

    target_dir = Path(args.dest).expanduser().resolve() if args.dest else resolve_default_dest(args.tier)
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        _warmup_onnx_models(args.tier)
    except Exception as exc:
        print(f"ERROR: ONNX OCR warmup failed: {exc}", file=sys.stderr)
        return 1

    manifest = {
        "pipeline": "ppocr-v6-onnx",
        "text_detection_model_name": MODEL_NAMES[args.tier]["det"],
        "text_recognition_model_name": MODEL_NAMES[args.tier]["rec"],
        "engine": "onnxruntime",
    }
    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"PaddleOCR ONNX '{args.tier}' assets ready at {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
