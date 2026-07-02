"""Persistent offline speech-to-text server used by the Electron speech runtime.

Reads newline-delimited JSON requests from stdin and writes newline-delimited
JSON responses to stdout. Each request transcribes one audio file using a
locally installed faster-whisper model (see scripts/get_whisper_model.py).
The model is loaded once, lazily, on the first request and reused for the
lifetime of the process so repeated answers don't pay the model-load cost.

Request:  {"id": <int>, "audio_path": "<path>", "language": "ja"}
Response: {"id": <int>, "text": "<transcript>", "avg_logprob": <float>, "duration_ms": <int>}
       or {"id": <int>, "error": "<message>"}

The model directory is read from the SPEECH_MODEL_DIR environment variable and
must contain model.bin, config.json, tokenizer.json, and vocabulary.txt (the
files produced by scripts/get_whisper_model.py).
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

_model: Any = None


def _load_model() -> Any:
    global _model
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel  # imported lazily: heavy optional dependency

    model_dir = os.environ.get("SPEECH_MODEL_DIR", "").strip()
    if not model_dir or not os.path.isdir(model_dir):
        raise RuntimeError(f"Speech model directory not found: {model_dir!r}")
    _model = WhisperModel(model_dir, device="cpu", compute_type="int8")
    return _model


def _transcribe(audio_path: str, language: str) -> dict[str, object]:
    start = time.monotonic()
    model = _load_model()
    segments, info = model.transcribe(
        audio_path,
        language=language or "ja",
        vad_filter=True,
        beam_size=1,
    )
    texts: list[str] = []
    logprobs: list[float] = []
    for segment in segments:
        texts.append(segment.text)
        logprobs.append(segment.avg_logprob)
    duration_ms = int((time.monotonic() - start) * 1000)
    avg_logprob = sum(logprobs) / len(logprobs) if logprobs else -1.0
    return {
        "text": "".join(texts).strip(),
        "avg_logprob": avg_logprob,
        "duration_ms": duration_ms,
        "language_probability": getattr(info, "language_probability", None),
    }


def main() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = request.get("id")
        try:
            result = _transcribe(str(request.get("audio_path", "")), str(request.get("language", "ja")))
            response: dict[str, object] = {"id": request_id, **result}
        except Exception as exc:  # noqa: BLE001 - report to caller, keep server alive
            response = {"id": request_id, "error": str(exc)}

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
