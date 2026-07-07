"""Persistent offline speech-to-text server used by the Electron speech runtime.

Reads newline-delimited JSON requests from stdin and writes newline-delimited
JSON responses to stdout. Each request transcribes one audio file using a
locally installed faster-whisper model (see scripts/get_whisper_model.py).
The model is pre-warmed at startup so there is no cold-start penalty on the
first transcription.

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
import subprocess
import sys
import time
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

_model: Any = None


def _detect_gpu() -> tuple[str, str]:
    """Detect available GPU hardware and return (device, compute_type).

    Verifies CUDA runtime is functional via ctranslate2 before returning "cuda".
    Falls back to CPU if the GPU is present but CUDA libraries are missing.
    """
    if subprocess.run(["nvidia-smi"], capture_output=True).returncode != 0:
        print("[speech-server] No GPU detected — using CPU", file=sys.stderr, flush=True)
        return ("cpu", "int8")

    print("[speech-server] NVIDIA GPU detected — verifying CUDA runtime…", file=sys.stderr, flush=True)
    try:
        import ctranslate2
        n = ctranslate2.get_cuda_device_count()
        if n > 0:
            print(f"[speech-server] CUDA ready ({n} device(s))", file=sys.stderr, flush=True)
            return ("cuda", "int8_float16")
    except Exception as e:
        print(f"[speech-server] CUDA check failed: {e}", file=sys.stderr, flush=True)

    print("[speech-server] CUDA unavailable — using CPU", file=sys.stderr, flush=True)
    return ("cpu", "int8")


def _load_model() -> Any:
    global _model
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel  # imported lazily: heavy optional dependency

    model_dir = os.environ.get("SPEECH_MODEL_DIR", "").strip()
    if not model_dir or not os.path.isdir(model_dir):
        raise RuntimeError(f"Speech model directory not found: {model_dir!r}")

    # Help Windows find pip-installed CUDA DLLs (nvidia-cublas-cu12 etc.)
    _ensure_cuda_dll_path()

    device, compute_type = _detect_gpu()  # safely pre-tests CUDA before returning "cuda"
    print(f"[speech-server] Loading model with device={device} compute_type={compute_type}", file=sys.stderr, flush=True)

    try:
        _model = WhisperModel(model_dir, device=device, compute_type=compute_type)
    except Exception:
        if device == "cuda":
            print("[speech-server] Model load with CUDA failed, falling back to CPU", file=sys.stderr, flush=True)
            _model = WhisperModel(model_dir, device="cpu", compute_type="int8")
        else:
            raise

    return _model


def _ensure_cuda_dll_path() -> None:
    """Add pip-installed CUDA DLL directories to both PATH and the Windows DLL search path.

    On Windows, os.add_dll_directory() alone isn't sufficient when Python is
    spawned as a subprocess (e.g. from Electron) — CTranslate2's internal DLL
    loader may use LoadLibraryExW with flags that bypass add_dll_directory().
    Prepending to PATH ensures dependent DLLs are found regardless.
    """
    if sys.platform != "win32":
        return
    try:
        import importlib.util as iu
        nvidia_dirs: list[str] = []
        for pkg_name in ("nvidia.cublas", "nvidia.cuda_nvrtc", "nvidia.cuda_runtime", "nvidia.cudnn"):
            spec = iu.find_spec(pkg_name)
            if spec and spec.submodule_search_locations:
                for loc in spec.submodule_search_locations:
                    bin_dir = os.path.join(loc, "bin")
                    if os.path.isdir(bin_dir):
                        nvidia_dirs.append(bin_dir)
        if nvidia_dirs:
            # os.add_dll_directory for the Python process
            for d in nvidia_dirs:
                if hasattr(os, "add_dll_directory"):
                    try:
                        os.add_dll_directory(d)  # type: ignore[attr-defined]
                    except OSError:
                        pass
            # Also prepend to PATH — critical for subprocess environments
            existing = os.environ.get("PATH", "")
            os.environ["PATH"] = os.pathsep.join(nvidia_dirs) + os.pathsep + existing
    except Exception:
        pass


def _prewarm() -> None:
    """Load the model at startup so the first transcription has no cold-start penalty."""
    print("[speech-server] Pre-warming model…", file=sys.stderr, flush=True)
    try:
        _load_model()
        print("[speech-server] Model ready.", file=sys.stderr, flush=True)
    except Exception as exc:
        print(f"[speech-server] Pre-warm failed: {exc}", file=sys.stderr, flush=True)


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
    _prewarm()

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
