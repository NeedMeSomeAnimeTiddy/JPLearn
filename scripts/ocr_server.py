"""Persistent OCR server used by the Electron OCR runtime (#74).

Reads newline-delimited JSON requests from stdin and writes newline-delimited
JSON responses to stdout. The PaddleOCR engine is built on the first extraction
and kept warm in ``scripts/ocr_extraction`` module state for the life of the
process, so only the first request pays interpreter startup + the ``paddleocr``
import + engine initialization.

Request:  {"id": <int>, "image_path": "<path>", "min_confidence": 0.3}
Response: {"id": <int>, "ok": true, "payload": {...}}
       or {"id": <int>, "ok": false, "error": "<message>"}

The payload is the same dict the ``assistant-chat-ocr`` bridge command returns
(``ok``/``text``/``lineCount``/``lines``), so the renderer contract is unchanged.

Unlike ``speech_recognition_server.py`` this does *not* pre-warm at startup: the
runtime spawns lazily on the first OCR request anyway, and pre-warming would
only move the model load a few milliseconds earlier while making a spawn with no
OCR model installed look like a hang.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ocr_extraction import extract_assistant_chat_ocr_payload  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def _parse_min_confidence(raw: object) -> float:
    if raw is None:
        return 0.30
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("min_confidence must be a number between 0 and 1") from exc
    if value < 0 or value > 1:
        raise ValueError("min_confidence must be between 0 and 1")
    return value


def handle_request(request: dict[str, object]) -> dict[str, object]:
    """Turn one decoded request into one response envelope.

    Never raises: a failed extraction is reported back to the caller so the
    server process survives to serve the next request with its engine intact.
    """
    request_id = request.get("id")
    try:
        image_path = str(request.get("image_path") or "").strip()
        if not image_path:
            raise ValueError("image_path is required")
        min_confidence = _parse_min_confidence(request.get("min_confidence"))
        payload = extract_assistant_chat_ocr_payload(image_path, min_confidence=min_confidence)
        return {"id": request_id, "ok": True, "payload": payload}
    except Exception as exc:  # noqa: BLE001 - report to caller, keep the server alive
        return {"id": request_id, "ok": False, "error": str(exc)}


def serve(stdin=None, stdout=None) -> int:
    source = stdin if stdin is not None else sys.stdin
    sink = stdout if stdout is not None else sys.stdout

    for raw_line in source:
        line = raw_line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(request, dict):
            continue

        response = handle_request(request)
        sink.write(json.dumps(response, ensure_ascii=False) + "\n")
        sink.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(serve())
