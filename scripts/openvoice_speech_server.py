"""Persistent OpenVoice synthesis server.

Loads OpenVoice models once and serves newline-delimited JSON requests over
stdin/stdout to reduce per-utterance latency from repeated process startup.

Request shape:
    {"id": 1, "type": "synthesize", "text": "...", "voiceId": "...", "speed": 1.0,
     "qualityMode": "fast", "postprocessMode": "off"}

Response shape:
    {"id": 1, "audioBase64": "...", "sampleRate": 24000, "voiceId": "..."}
or {"id": 1, "error": "..."}
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import tempfile
from pathlib import Path

from openvoice_speak import (
    configure_stdio,
    concatenate_segments,
    load_openvoice_modules,
    load_target_embedding,
    postprocess_audio,
    resolve_quality_config,
    resolve_voice_profile,
    segment_language,
    split_mixed_text,
    synthesize_segment,
)


class OpenVoiceServer:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root
        (
            self.np_module,
            self.sf_module,
            self.torch_module,
            self.tts_factory,
            self.converter,
            self.checkpoint_root,
            _device,
        ) = load_openvoice_modules(repo_root)
        self.model_cache: dict[str, object] = {}
        self.speaker_cache: dict[str, tuple[str, int]] = {}
        self.target_embedding_cache: dict[str, object] = {}

    def _get_target_embedding(self, voice_id: str):
        if voice_id in self.target_embedding_cache:
            return self.target_embedding_cache[voice_id]
        profile = resolve_voice_profile(self.repo_root, voice_id)
        target_embedding = load_target_embedding(
            self.torch_module,
            self.converter,
            profile,
            self.checkpoint_root,
        )
        self.target_embedding_cache[voice_id] = target_embedding
        return target_embedding

    def preload(self, voice_id: str | None = None) -> dict:
        profile = resolve_voice_profile(self.repo_root, voice_id)
        chosen_voice_id = profile.voice_id or profile.voice_dir.name
        self._get_target_embedding(chosen_voice_id)

        # Warm up the end-to-end synthesis path once so the first user-visible
        # utterance avoids model-initialization latency.
        self.synthesize(
            text="あ",
            voice_id=chosen_voice_id,
            speed=1.0,
            quality_mode="fast",
            postprocess_mode="off",
        )
        return {"ok": True, "voiceId": chosen_voice_id}

    def synthesize(
        self,
        text: str,
        voice_id: str | None,
        speed: float,
        quality_mode: str,
        postprocess_mode: str,
    ) -> dict:
        profile = resolve_voice_profile(self.repo_root, voice_id)
        chosen_voice_id = profile.voice_id or profile.voice_dir.name
        target_se = self._get_target_embedding(chosen_voice_id)

        segments = split_mixed_text(text)
        if not segments:
            raise RuntimeError("No speakable text remained after preprocessing")

        quality = resolve_quality_config(quality_mode, None, None)
        speed = min(2.0, max(0.5, speed))

        with tempfile.TemporaryDirectory(prefix="openvoice-server-") as temp_name:
            temp_dir = Path(temp_name)
            synthesized: list[tuple[object, int]] = []

            for index, segment in enumerate(segments):
                language_code = segment_language(segment)
                synthesized.append(
                    synthesize_segment(
                        np_module=self.np_module,
                        sf_module=self.sf_module,
                        torch_module=self.torch_module,
                        tts_factory=self.tts_factory,
                        converter=self.converter,
                        checkpoint_root=self.checkpoint_root,
                        target_se=target_se,
                        segment_text=segment,
                        language_code=language_code,
                        speed=speed,
                        temp_dir=temp_dir,
                        segment_index=index,
                        model_cache=self.model_cache,
                        speaker_cache=self.speaker_cache,
                    )
                )

            combined_audio, sample_rate = concatenate_segments(self.np_module, synthesized, speed, quality)
            combined_audio = postprocess_audio(self.np_module, combined_audio, sample_rate, postprocess_mode)

            # Keep transport simple by returning base64 WAV bytes.
            wav_buffer = io.BytesIO()
            self.sf_module.write(wav_buffer, combined_audio, sample_rate, format="WAV")
            wav_bytes = wav_buffer.getvalue()

        return {
            "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
            "sampleRate": int(sample_rate),
            "voiceId": chosen_voice_id,
        }


def parse_line(line: str) -> dict | None:
    if not line.strip():
        return None
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def write_response(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    configure_stdio()

    parser = argparse.ArgumentParser(description="Persistent OpenVoice speech server")
    parser.add_argument("--repo-root", required=True)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    server = OpenVoiceServer(repo_root)

    for raw_line in sys.stdin:
        request = parse_line(raw_line)
        if request is None:
            continue

        request_id = request.get("id")
        if request_id is None:
            continue

        req_type = str(request.get("type") or "synthesize").strip().lower()
        try:
            if req_type == "shutdown":
                write_response({"id": request_id, "ok": True})
                break
            if req_type == "preload":
                result = server.preload(request.get("voiceId"))
                write_response({"id": request_id, **result})
                continue

            text = str(request.get("text") or "").strip()
            if not text:
                raise RuntimeError("Speak text must not be empty")

            speed = request.get("speed")
            if not isinstance(speed, (int, float)):
                speed = 1.0
            quality_mode = str(request.get("qualityMode") or "fast")
            postprocess_mode = str(request.get("postprocessMode") or "off")

            result = server.synthesize(
                text=text,
                voice_id=request.get("voiceId"),
                speed=float(speed),
                quality_mode=quality_mode,
                postprocess_mode=postprocess_mode,
            )
            write_response({"id": request_id, **result})
        except Exception as exc:  # noqa: BLE001 - return rich error to caller
            write_response({"id": request_id, "error": str(exc)})

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
