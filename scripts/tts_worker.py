"""Persistent Kokoro-82M text-to-speech worker.

Reads newline-delimited JSON requests from stdin and writes newline-delimited
JSON responses to stdout. The model is loaded once on startup so each request
only pays for synthesis, not model load.

Protocol
--------
Startup (stdout): {"event": "ready"} on success, or
                  {"event": "error", "error": "..."} then a non-zero exit.
Request  (stdin): {"id": 1, "text": "あ", "voice": "jf_alpha", "speed": 1.0, "lang": "ja"}
Response (stdout):{"id": 1, "ok": true, "sampleRate": 24000, "audioBase64": "..."}
              or  {"id": 1, "ok": false, "error": "..."}

stderr is used only for human-readable logging.

Japanese pronunciation requires ``misaki[ja]`` (which wraps OpenJTalk via
pyopenjtalk). See requirements-tts.txt.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import wave


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.write("\n")
    sys.stdout.flush()


def encode_wav(samples, sample_rate: int) -> str:
    import numpy as np

    pcm = np.asarray(samples, dtype="float32")
    pcm = np.clip(pcm, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(sample_rate))
        wav_file.writeframes(pcm16.tobytes())
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser(description="Kokoro TTS stdio worker")
    parser.add_argument("--model", required=True, help="Path to kokoro onnx model")
    parser.add_argument("--voices", required=True, help="Path to kokoro voices.bin")
    args = parser.parse_args()

    try:
        from kokoro_onnx import Kokoro
    except Exception as error:  # noqa: BLE001 - report any import failure to the host
        emit({"event": "error", "error": f"failed to import kokoro_onnx: {error}"})
        return 1

    try:
        kokoro = Kokoro(args.model, args.voices)
    except Exception as error:  # noqa: BLE001 - report any load failure to the host
        emit({"event": "error", "error": f"failed to load Kokoro model: {error}"})
        return 1

    emit({"event": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = request.get("id")
        text = (request.get("text") or "").strip()
        voice = request.get("voice") or "jf_alpha"
        lang = request.get("lang") or "ja"
        try:
            speed = float(request.get("speed") or 1.0)
        except (TypeError, ValueError):
            speed = 1.0

        if not text:
            emit({"id": request_id, "ok": False, "error": "empty text"})
            continue

        try:
            samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
            audio_base64 = encode_wav(samples, sample_rate)
            emit(
                {
                    "id": request_id,
                    "ok": True,
                    "sampleRate": int(sample_rate),
                    "audioBase64": audio_base64,
                }
            )
        except Exception as error:  # noqa: BLE001 - surface synthesis errors per request
            emit({"id": request_id, "ok": False, "error": str(error)})

    return 0


if __name__ == "__main__":
    sys.exit(main())
