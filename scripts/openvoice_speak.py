"""Synthesize speech with OpenVoice V2 for a selected local voice profile.

The script reads voice manifests from data/openvoice/voices/<voice-id>/manifest.json,
loads the OpenVoice V2 checkpoints from data/openvoice/checkpoints_v2/, and
uses MeloTTS as the base speaker layer before tone-color conversion.

Usage:
    python scripts/openvoice_speak.py --repo-root <repo> --voice-id male_kenji --text "..." --output out.wav
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


JAPANESE_CHAR_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]")


@dataclass(frozen=True)
class VoiceProfile:
    voice_id: str
    display_name: str
    voice_dir: Path
    manifest: dict


def load_manifest(voice_dir: Path) -> VoiceProfile:
    manifest_path = voice_dir / "manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as handle:
      manifest = json.load(handle)
    voice_id = str(manifest.get("voiceId") or voice_dir.name)
    display_name = str(manifest.get("displayName") or voice_id)
    return VoiceProfile(voice_id=voice_id, display_name=display_name, voice_dir=voice_dir, manifest=manifest)


def load_voice_profiles(repo_root: Path) -> list[VoiceProfile]:
    voices_root = repo_root / "data" / "openvoice" / "voices"
    profiles: list[VoiceProfile] = []
    if not voices_root.exists():
        return profiles
    for voice_dir in sorted((item for item in voices_root.iterdir() if item.is_dir()), key=lambda item: item.name):
        manifest_path = voice_dir / "manifest.json"
        if manifest_path.exists():
            profiles.append(load_manifest(voice_dir))
    return profiles


def resolve_voice_profile(repo_root: Path, voice_id: str | None) -> VoiceProfile:
    profiles = load_voice_profiles(repo_root)
    if not profiles:
        raise RuntimeError("No OpenVoice voice profiles were found under data/openvoice/voices")
    if voice_id:
        for profile in profiles:
            if profile.voice_id == voice_id or profile.voice_dir.name == voice_id:
                return profile
    return profiles[0]


def get_checkpoint_root(repo_root: Path) -> Path:
    checkpoint_root = repo_root / "data" / "openvoice" / "checkpoints_v2"
    converter = checkpoint_root / "converter"
    if not (converter / "checkpoint.pth").exists() or not (converter / "config.json").exists():
        raise RuntimeError(
            "OpenVoice V2 checkpoints are missing. Run scripts/get_openvoice.py first."
        )
    return checkpoint_root


def contains_japanese(text: str) -> bool:
    return bool(JAPANESE_CHAR_RE.search(text))


def split_mixed_text(text: str) -> list[str]:
    pieces: list[str] = []
    current = []
    current_lang: str | None = None

    def flush() -> None:
        nonlocal current, current_lang
        segment = "".join(current).strip()
        if segment:
            pieces.append(segment)
        current = []
        current_lang = None

    for char in text:
        if char == "〜":
            continue
        if char.isspace() or char in ",.。！？!?;:、・()[]{}<>/\\\"'`-—–…":
            if current:
                current.append(char)
            elif pieces:
                pieces[-1] += char
            continue

        char_lang = "ja" if contains_japanese(char) else "en"
        if current_lang is None:
            current_lang = char_lang
        elif char_lang != current_lang:
            flush()
            current_lang = char_lang
        current.append(char)

    flush()
    return pieces


def segment_language(segment: str) -> str:
    return "JP" if contains_japanese(segment) else "EN"


def load_openvoice_modules(repo_root: Path):
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from melo.api import TTS
        from openvoice.api import ToneColorConverter
    except ImportError as exc:
        raise RuntimeError(
            "OpenVoice runtime dependencies are missing. Install OpenVoice V2, MeloTTS, torch, numpy, and soundfile."
        ) from exc

    checkpoint_root = get_checkpoint_root(repo_root)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    converter = ToneColorConverter(str(checkpoint_root / "converter" / "config.json"), device=device)
    converter.load_ckpt(str(checkpoint_root / "converter" / "checkpoint.pth"))
    return np, sf, torch, TTS, converter, checkpoint_root, device


def load_target_embedding(torch_module, converter, profile: VoiceProfile, checkpoint_root: Path):
    cache_dir = checkpoint_root / "profile_cache" / profile.voice_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / "target_se.pth"

    if cache_path.exists():
        return torch_module.load(str(cache_path), map_location=converter.device)

    reference_clips = [profile.voice_dir / clip["file"] for clip in profile.manifest.get("referenceClips", [])]
    reference_clips = [clip for clip in reference_clips if clip.exists()]
    if not reference_clips:
        raise RuntimeError(f"No usable reference clips were found for {profile.voice_id}")

    target_se = converter.extract_se([str(path) for path in reference_clips], se_save_path=str(cache_path))
    return target_se


def load_source_embedding(torch_module, checkpoint_root: Path, language_code: str, device: str):
    ses_dir = checkpoint_root / "base_speakers" / "ses"
    if not ses_dir.exists():
        raise RuntimeError("OpenVoice base speaker embeddings are missing under checkpoints_v2/base_speakers/ses")

    candidates = sorted(ses_dir.glob("*.pth"))
    if not candidates:
        raise RuntimeError("No OpenVoice base speaker embeddings were found")

    preferred = language_code.lower()
    for candidate in candidates:
        if preferred in candidate.stem.lower():
            return torch_module.load(str(candidate), map_location=device)

    return torch_module.load(str(candidates[0]), map_location=device)


def pick_speaker_id(model) -> tuple[str, int]:
    speaker_ids = getattr(getattr(model, "hps", None), "data", None)
    if speaker_ids is None or not hasattr(speaker_ids, "spk2id"):
        raise RuntimeError("MeloTTS model did not expose speaker ids")
    speaker_map = speaker_ids.spk2id
    if not speaker_map:
        raise RuntimeError("MeloTTS model did not expose any speaker ids")
    speaker_key = sorted(speaker_map.keys())[0]
    return speaker_key, speaker_map[speaker_key]


def synthesize_segment(
    np_module,
    sf_module,
    torch_module,
    tts_factory,
    converter,
    checkpoint_root: Path,
    target_se,
    segment_text: str,
    language_code: str,
    speed: float,
    temp_dir: Path,
    segment_index: int,
    model_cache: dict[str, object],
    speaker_cache: dict[str, tuple[str, int]],
):
    model = model_cache.get(language_code)
    if model is None:
        model = tts_factory(language=language_code, device=converter.device)
        model_cache[language_code] = model

    speaker_key, speaker_id = speaker_cache.get(language_code, (None, None))
    if speaker_key is None or speaker_id is None:
        speaker_key, speaker_id = pick_speaker_id(model)
        speaker_cache[language_code] = (speaker_key, speaker_id)

    source_se = load_source_embedding(torch_module, checkpoint_root, speaker_key, converter.device)

    src_path = temp_dir / f"segment_{segment_index:02d}_src.wav"
    out_path = temp_dir / f"segment_{segment_index:02d}_out.wav"

    if hasattr(torch_module.backends, "mps") and torch_module.backends.mps.is_available() and converter.device == "cpu":
        torch_module.backends.mps.is_available = lambda: False

    model.tts_to_file(segment_text, speaker_id, str(src_path), speed=speed)
    converter.convert(
        audio_src_path=str(src_path),
        src_se=source_se,
        tgt_se=target_se,
        output_path=str(out_path),
        message="@MyShell",
    )

    audio, sample_rate = sf_module.read(str(out_path), dtype="float32")
    return np_module.asarray(audio, dtype=np_module.float32), int(sample_rate)


def concatenate_segments(np_module, segments: list[tuple[object, int]], speed: float):
    if not segments:
        raise RuntimeError("No synthesized segments were produced")
    if len(segments) == 1:
        return segments[0]

    audio_parts = []
    sample_rate = segments[0][1]
    pause_samples = max(1, int(sample_rate * 0.05 / max(speed, 0.1)))
    pause = np_module.zeros(pause_samples, dtype=np_module.float32)

    for index, (audio, rate) in enumerate(segments):
        if rate != sample_rate:
            raise RuntimeError("Synthesized OpenVoice segments used inconsistent sample rates")
        audio_parts.append(audio.reshape(-1))
        if index < len(segments) - 1:
            audio_parts.append(pause)

    combined = np_module.concatenate(audio_parts).astype(np_module.float32)
    return combined, sample_rate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--voice-id", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    profile = resolve_voice_profile(repo_root, args.voice_id)
    np_module, sf_module, torch_module, tts_factory, converter, checkpoint_root, _device = load_openvoice_modules(repo_root)
    target_se = load_target_embedding(torch_module, converter, profile, checkpoint_root)

    segments = split_mixed_text(args.text)
    if not segments:
        raise RuntimeError("No speakable text remained after preprocessing")

    with tempfile.TemporaryDirectory(prefix="openvoice-segments-") as temp_name:
        temp_dir = Path(temp_name)
        synthesized: list[tuple[object, int]] = []
        model_cache: dict[str, object] = {}
        speaker_cache: dict[str, tuple[str, int]] = {}

        for index, segment in enumerate(segments):
            language_code = segment_language(segment)
            synthesized.append(
                synthesize_segment(
                    np_module=np_module,
                    sf_module=sf_module,
                    torch_module=torch_module,
                    tts_factory=tts_factory,
                    converter=converter,
                    checkpoint_root=checkpoint_root,
                    target_se=target_se,
                    segment_text=segment,
                    language_code=language_code,
                    speed=args.speed,
                    temp_dir=temp_dir,
                    segment_index=index,
                    model_cache=model_cache,
                    speaker_cache=speaker_cache,
                )
            )

        combined_audio, sample_rate = concatenate_segments(np_module, synthesized, args.speed)
        sf_module.write(str(output_path), combined_audio, sample_rate)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())