"""PaddleOCR text extraction for the assistant chat image-drop feature.

Split out of ``scripts/desktop_bridge.py`` (#74) so OCR no longer shares a
process lifecycle with the study-query bridge. ``scripts/ocr_server.py`` runs
this module in a long-lived child process where ``_PADDLE_OCR_ENGINE_CACHE``
finally does what it was written to do: keep one initialized engine warm across
calls. The bridge still exposes an ``assistant-chat-ocr`` command that imports
from here, so the one-shot CLI path keeps working.

Deliberately stdlib-only at import time -- ``paddleocr``/``numpy``/``cv2`` are
imported lazily inside the extraction call, and the Japanese-script predicate is
duplicated from ``data.text_normalization`` rather than imported, because that
module pulls in ``fugashi`` at import time and this process has no use for it.
"""

from __future__ import annotations

import importlib
import inspect
import os
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_assets_dir = os.environ.get("JPLEARN_ASSETS_DIR", "").strip() or os.environ.get("JPLEARN_USER_DATA_DIR", "").strip()
_docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
OCR_MODEL_DIR_CANDIDATES = (
    Path(_assets_dir) / "ocr" / "standard"
    if _assets_dir
    else Path(_docs_dir) / "ocr" / "standard"
    if _docs_dir
    else PROJECT_ROOT / "data" / "ocr" / "standard",
    PROJECT_ROOT / "data" / "ocr" / "standard",
)
OCR_PRIMARY_DET_MODEL_NAME = "PP-OCRv6_medium_det"
OCR_PRIMARY_REC_MODEL_NAME = "PP-OCRv6_medium_rec"

# (engine, selected_enable_cls, ocr_signature) for the most recently built
# engine, plus the model-configuration key it was built for.
_PADDLE_OCR_ENGINE_CACHE: tuple[object, bool, inspect.Signature] | None = None
_PADDLE_OCR_ENGINE_CACHE_KEY: str | None = None


def _resolve_ocr_model_root() -> Path | None:
    for candidate in OCR_MODEL_DIR_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def _resolve_infer_dir(model_root: Path, phase: str) -> Path | None:
    phase_root = model_root / phase
    if not phase_root.exists():
        return None

    def _looks_like_infer_dir(directory: Path) -> bool:
        return (
            any(path.suffix == ".pdmodel" for path in directory.glob("*.pdmodel"))
            or any(path.suffix == ".onnx" for path in directory.glob("*.onnx"))
            or (directory / "inference.yml").exists()
            or ((directory / "inference.json").exists() and (directory / "inference.pdiparams").exists())
        )

    if _looks_like_infer_dir(phase_root):
        return phase_root

    for child in phase_root.iterdir():
        if not child.is_dir():
            continue
        if _looks_like_infer_dir(child):
            return child
    return None


def _is_supported_image_magic(image_path: Path) -> bool:
    try:
        header = image_path.read_bytes()[:16]
    except OSError:
        return False

    signatures = (
        b"\x89PNG\r\n\x1a\n",  # PNG
        b"\xff\xd8\xff",  # JPEG
        b"BM",  # BMP
        b"GIF87a",  # GIF87a
        b"GIF89a",  # GIF89a
        b"II*\x00",  # TIFF little-endian
        b"MM\x00*",  # TIFF big-endian
    )
    if any(header.startswith(signature) for signature in signatures):
        return True
    # WEBP: RIFF....WEBP
    return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"


def _contains_japanese_script(text: str) -> bool:
    return bool(re.search(r"[぀-ヿ㐀-䶿一-鿿]", text))


def _join_ocr_lines_for_translation(lines: list[str]) -> str:
    """Reflow OCR line fragments into readable paragraph text for translation."""
    cleaned = [line.strip() for line in lines if line and line.strip()]
    if not cleaned:
        return ""

    deduped: list[str] = []
    for line in cleaned:
        if deduped and deduped[-1] == line:
            continue
        deduped.append(line)

    # Preserve visual OCR line boundaries to avoid accidental token fusion
    # that can hurt deterministic JA->EN translation quality.
    return "\n".join(deduped).strip()


def _parse_ocr_lines(raw_result: object) -> list[dict[str, object]]:
    lines: list[dict[str, object]] = []
    for block in raw_result or []:
        if hasattr(block, "get"):
            rec_texts = block.get("rec_texts")
            rec_scores = block.get("rec_scores")
            if isinstance(rec_texts, list) and isinstance(rec_scores, list):
                for text_raw, score_raw in zip(rec_texts, rec_scores):
                    text = str(text_raw or "").strip()
                    try:
                        confidence = float(score_raw)
                    except (TypeError, ValueError):
                        confidence = 0.0
                    if text:
                        lines.append({"text": text, "confidence": round(confidence, 4)})
                continue

        if not isinstance(block, list):
            continue
        for entry in block:
            if not isinstance(entry, list) or len(entry) < 2:
                continue
            line_meta = entry[1]
            if not isinstance(line_meta, (list, tuple)) or len(line_meta) < 2:
                continue
            text = str(line_meta[0] or "").strip()
            try:
                confidence = float(line_meta[1])
            except (TypeError, ValueError):
                confidence = 0.0
            if text:
                lines.append({"text": text, "confidence": round(confidence, 4)})
    return lines


def _build_ocr_payload_from_lines(lines: list[dict[str, object]], min_confidence: float) -> dict[str, object]:
    extracted_lines: list[str] = []
    all_lines: list[str] = []

    for entry in lines:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(entry.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        all_lines.append(text)
        if confidence >= min_confidence:
            extracted_lines.append(text)

    selected_lines = extracted_lines
    if lines:
        selected_lines = []
        for entry in lines:
            text = str(entry.get("text") or "").strip()
            if not text:
                continue
            try:
                confidence = float(entry.get("confidence", 0.0))
            except (TypeError, ValueError):
                confidence = 0.0

            # Keep Japanese-script lines even when confidence is low;
            # OCR confidence underestimates mixed/complex JP glyphs.
            keep_line = confidence >= min_confidence or _contains_japanese_script(text)
            if keep_line:
                selected_lines.append(text)

    if all_lines:
        retained_ratio = (len(selected_lines) / len(all_lines)) if all_lines else 0.0
        if not selected_lines or retained_ratio < 0.55:
            selected_lines = all_lines

    extracted_text = _join_ocr_lines_for_translation(selected_lines)
    return {
        "ok": True,
        "text": extracted_text,
        "lineCount": len(selected_lines),
        "lines": lines,
    }


def _run_ocr_with_engine(
    engine: object,
    image_path: Path,
    ocr_signature: inspect.Signature,
    selected_enable_cls: bool,
    min_confidence: float,
) -> dict[str, object]:
    if "cls" in ocr_signature.parameters:
        raw_result = engine.ocr(str(image_path), cls=selected_enable_cls)
    else:
        raw_result = engine.ocr(str(image_path))
    lines = _parse_ocr_lines(raw_result)
    return _build_ocr_payload_from_lines(lines, min_confidence=min_confidence)


def reset_engine_cache() -> None:
    """Drop the warm engine so the next call rebuilds it.

    Used by tests and by anything that knows the installed model set changed
    underneath a long-lived server process.
    """
    global _PADDLE_OCR_ENGINE_CACHE
    global _PADDLE_OCR_ENGINE_CACHE_KEY
    _PADDLE_OCR_ENGINE_CACHE = None
    _PADDLE_OCR_ENGINE_CACHE_KEY = None


def _cached_engine(cache_key: str, build) -> tuple[object, bool, inspect.Signature]:
    """Return the warm engine for *cache_key*, calling *build* only on a miss.

    This is the whole point of the dedicated runtime: in the old one-shot
    process the cache could never be hit, because every OCR call was a fresh
    interpreter.
    """
    global _PADDLE_OCR_ENGINE_CACHE
    global _PADDLE_OCR_ENGINE_CACHE_KEY

    if _PADDLE_OCR_ENGINE_CACHE is not None and _PADDLE_OCR_ENGINE_CACHE_KEY == cache_key:
        return _PADDLE_OCR_ENGINE_CACHE

    built = build()
    _PADDLE_OCR_ENGINE_CACHE = built
    _PADDLE_OCR_ENGINE_CACHE_KEY = cache_key
    return built


def extract_assistant_chat_ocr_payload(image_path_raw: str, min_confidence: float = 0.30) -> dict[str, object]:
    image_path = Path(image_path_raw).expanduser().resolve()
    if not image_path.exists() or not image_path.is_file():
        raise ValueError(f"Image file does not exist: {image_path}")
    if not _is_supported_image_magic(image_path):
        raise ValueError(f"Unsupported or corrupted image format: {image_path.name}")

    model_root = _resolve_ocr_model_root()
    det_model_dir: Path | None = None
    rec_model_dir: Path | None = None
    cls_model_dir: Path | None = None
    if model_root is not None:
        det_model_dir = _resolve_infer_dir(model_root, "det")
        rec_model_dir = _resolve_infer_dir(model_root, "rec")
        cls_model_dir = _resolve_infer_dir(model_root, "cls")

    try:
        # PaddleOCR/PaddlePaddle 3.3.x has a known PIR+oneDNN regression on CPU
        # (ConvertPirAttribute2RuntimeAttribute...). Disable those paths before
        # importing PaddleOCR to keep inference stable across environments.
        os.environ.setdefault("FLAGS_enable_pir_api", "0")
        os.environ.setdefault("FLAGS_use_mkldnn", "0")
        paddleocr_module = importlib.import_module("paddleocr")
        PaddleOCR = getattr(paddleocr_module, "PaddleOCR")
    except Exception as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            "PaddleOCR runtime is unavailable in this environment. Install Python package 'paddleocr'."
        ) from exc

    init_signature = inspect.signature(PaddleOCR.__init__)
    accepted_params = set(init_signature.parameters.keys())
    accepts_var_kwargs = any(
        param.kind == inspect.Parameter.VAR_KEYWORD
        for param in init_signature.parameters.values()
    )

    base_kwargs: dict[str, object] = {}
    if "lang" in accepted_params:
        base_kwargs["lang"] = "japan"
    if "show_log" in accepted_params:
        base_kwargs["show_log"] = False
    if "enable_mkldnn" in accepted_params or accepts_var_kwargs:
        base_kwargs["enable_mkldnn"] = False
    if "engine" in accepted_params or accepts_var_kwargs:
        base_kwargs["engine"] = "onnxruntime"
    if "use_doc_orientation_classify" in accepted_params or accepts_var_kwargs:
        base_kwargs["use_doc_orientation_classify"] = False
    if "use_doc_unwarping" in accepted_params or accepts_var_kwargs:
        base_kwargs["use_doc_unwarping"] = False

    init_candidates: list[tuple[dict[str, object], bool]] = []

    supports_legacy_model_dirs = (
        "det_model_dir" in accepted_params
        and "rec_model_dir" in accepted_params
        and "cls_model_dir" in accepted_params
    )
    supports_new_model_dirs = (
        "text_detection_model_dir" in accepted_params
        and "text_recognition_model_dir" in accepted_params
    )

    # Main pipeline: use PP-OCRv6 ONNX medium det/rec model names.
    onnx_kwargs = dict(base_kwargs)
    onnx_kwargs.pop("lang", None)
    if "text_detection_model_name" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["text_detection_model_name"] = OCR_PRIMARY_DET_MODEL_NAME
    if "text_recognition_model_name" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["text_recognition_model_name"] = OCR_PRIMARY_REC_MODEL_NAME
    if "use_textline_orientation" in accepted_params or accepts_var_kwargs:
        onnx_kwargs["use_textline_orientation"] = False
    init_candidates.append((onnx_kwargs, False))

    if supports_legacy_model_dirs and det_model_dir is not None and rec_model_dir is not None and cls_model_dir is not None:
        legacy_kwargs = dict(base_kwargs)
        legacy_kwargs.pop("lang", None)
        legacy_kwargs["det_model_dir"] = str(det_model_dir)
        legacy_kwargs["rec_model_dir"] = str(rec_model_dir)
        legacy_kwargs["cls_model_dir"] = str(cls_model_dir)
        enable_cls = False
        if "use_angle_cls" in accepted_params:
            legacy_kwargs["use_angle_cls"] = True
            enable_cls = True
        init_candidates.append((legacy_kwargs, enable_cls))

    det_has_inference_yaml = bool(det_model_dir and (det_model_dir / "inference.yml").exists())
    rec_has_inference_yaml = bool(rec_model_dir and (rec_model_dir / "inference.yml").exists())
    cls_has_inference_yaml = bool(cls_model_dir and (cls_model_dir / "inference.yml").exists())
    if (
        supports_new_model_dirs
        and det_model_dir is not None
        and rec_model_dir is not None
        and det_has_inference_yaml
        and rec_has_inference_yaml
    ):
        new_kwargs = dict(base_kwargs)
        new_kwargs.pop("lang", None)
        new_kwargs["text_detection_model_dir"] = str(det_model_dir)
        new_kwargs["text_recognition_model_dir"] = str(rec_model_dir)

        det_name = det_model_dir.name.replace("_infer", "") if det_model_dir.name else ""
        rec_name = rec_model_dir.name.replace("_infer", "") if rec_model_dir.name else ""
        if det_name and ("text_detection_model_name" in accepted_params or accepts_var_kwargs):
            new_kwargs["text_detection_model_name"] = det_name
        if rec_name and ("text_recognition_model_name" in accepted_params or accepts_var_kwargs):
            new_kwargs["text_recognition_model_name"] = rec_name

        enable_cls = False
        if "use_textline_orientation" in accepted_params:
            if cls_model_dir is not None and cls_has_inference_yaml and "textline_orientation_model_dir" in accepted_params:
                new_kwargs["use_textline_orientation"] = True
                new_kwargs["textline_orientation_model_dir"] = str(cls_model_dir)
                cls_name = cls_model_dir.name.replace("_infer", "") if cls_model_dir.name else ""
                if cls_name and ("textline_orientation_model_name" in accepted_params or accepts_var_kwargs):
                    new_kwargs["textline_orientation_model_name"] = cls_name
                enable_cls = True
            else:
                new_kwargs["use_textline_orientation"] = False
        init_candidates.append((new_kwargs, enable_cls))

    # Final fallback: let PaddleOCR use its own bundled/default model resolution.
    # This prevents hard-failing when local model files are from an older format.
    auto_kwargs = dict(base_kwargs)
    auto_kwargs["lang"] = "japan"
    enable_cls = False
    if "use_textline_orientation" in accepted_params:
        auto_kwargs["use_textline_orientation"] = False
    elif "use_angle_cls" in accepted_params:
        auto_kwargs["use_angle_cls"] = False
    init_candidates.append((auto_kwargs, enable_cls))

    cache_key = "|".join(
        [
            str(det_model_dir or ""),
            str(rec_model_dir or ""),
            str(cls_model_dir or ""),
            "with_orientation" if "use_textline_orientation" in accepted_params else "no_orientation",
        ]
    )

    def _build_engine() -> tuple[object, bool, inspect.Signature]:
        engine = None
        selected_enable_cls = False
        init_errors: list[str] = []
        for kwargs, candidate_enable_cls in init_candidates:
            try:
                engine = PaddleOCR(**kwargs)
                selected_enable_cls = candidate_enable_cls
                break
            except Exception as exc:
                init_errors.append(str(exc))

        if engine is None:
            details = " | ".join(error for error in init_errors if error)
            raise RuntimeError(
                "Unable to initialize PaddleOCR runtime with available model configuration. "
                f"Details: {details or '(no details)'}"
            )

        return engine, selected_enable_cls, inspect.signature(engine.ocr)

    engine, selected_enable_cls, ocr_signature = _cached_engine(cache_key, _build_engine)

    return _run_ocr_with_engine(
        engine,
        image_path,
        ocr_signature,
        selected_enable_cls,
        min_confidence,
    )
