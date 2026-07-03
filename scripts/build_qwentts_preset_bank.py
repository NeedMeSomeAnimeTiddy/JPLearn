"""Pre-encodes curated Japanese reference voice clips into the qwentts.cpp
preset speaker bank format consumed by the patched tts-server.exe
(--speaker-bank, see patches/qwentts-cpp/0001-speaker-bank.patch) and by
electron-frontend/electron/qwentts_runtime.cjs.

Input layout (one folder per curated speaker), authored by hand:
    data/tts/speaker_intake/<speaker_id>/
        clips/*.wav        reference audio clips (candidates)
        transcripts.tsv     tab-separated: clip_filename, role, transcript_ja, notes
                            exactly one row must have role == "default" (the
                            clip used as the speaker's ICL/reference source);
                            other supported roles are builder-local:
                            alternate / embedding / embedding_only / exclude
        metadata.json       speaker profile (speakerId, displayName, etc.)

Output layout (built artifact, safe to bundle/seed into installed assets via
setup_runtime.cjs's seedBundledQwenttsPresetSpeakers):
    data/tts/preset_bank/<speaker_id>/
        spk.bin        raw f32 speaker embedding (required)
        rvq.bin         packed ICL reference codes (present alongside ref_text.txt)
        ref_text.txt    transcript of the reference clip (present alongside rvq.bin)
        preset.json     display metadata copied from metadata.json (UI use only;
                        not read by tts-server.exe or qwentts_runtime.cjs)

Requires a Base-mode talker GGUF + the shared tokenizer GGUF to already be
installed (run the setup wizard's Japanese Voice step first, or pass
--talker/--codec explicitly), plus a built qwen-codec.exe (see
scripts/build_qwentts_cpp.ps1).

Usage:
    python scripts/build_qwentts_preset_bank.py                  # process every speaker
    python scripts/build_qwentts_preset_bank.py --speaker male_kenji
    python scripts/build_qwentts_preset_bank.py --talker <path> --codec <path> --qwen-codec <path>
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INTAKE_ROOT = REPO_ROOT / "data" / "tts" / "speaker_intake"
PRESET_BANK_ROOT = REPO_ROOT / "data" / "tts" / "preset_bank"


def resolve_assets_dir() -> Path:
    explicit = os.environ.get("JPLEARN_ASSETS_DIR", "").strip() or os.environ.get("JPLEARN_USER_DATA_DIR", "").strip()
    if explicit:
        return Path(explicit)
    legacy_docs = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    if legacy_docs:
        return Path(legacy_docs)
    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        return Path(local_app_data) / "JPLearn Assets"
    return Path.home() / ".local" / "share" / "JPLearn Assets"


def find_first(directory: Path, pattern: str) -> Path | None:
    if not directory.exists():
        return None
    matches = sorted(directory.glob(pattern))
    return matches[0] if matches else None


def resolve_default_talker_and_codec() -> tuple[Path | None, Path | None]:
    models_dir = resolve_assets_dir() / "tts" / "models"
    return find_first(models_dir, "qwen-talker-*.gguf"), find_first(models_dir, "qwen-tokenizer-*.gguf")


def resolve_qwen_codec_binary() -> Path | None:
    candidate = REPO_ROOT / "tools" / "qwentts.cpp" / "build" / "Release" / "qwen-codec.exe"
    return candidate if candidate.exists() else None


def read_transcripts(tsv_path: Path) -> list[dict[str, str]]:
    with open(tsv_path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        return [row for row in reader]


REFERENCE_ROLES = {"default", "icl", "reference", "default_jp", "default_en"}
EMBEDDING_ONLY_ROLES = {"embedding", "embedding_only"}
EMBEDDING_INCLUDED_ROLES = REFERENCE_ROLES | EMBEDDING_ONLY_ROLES | {"alternate", ""}
EXCLUDED_ROLES = {"exclude", "skip", "reject"}


def normalize_role(row: dict[str, str] | None) -> str:
    if not row:
        return ""
    return (row.get("role") or "").strip().lower()


def pick_default_row(rows: list[dict[str, str]], preferred_reference_role: str) -> dict[str, str]:
    preferred_role = (preferred_reference_role or "default").strip().lower()
    reference_rows = [row for row in rows if normalize_role(row) in REFERENCE_ROLES]

    preferred_rows = [row for row in reference_rows if normalize_role(row) == preferred_role]
    if preferred_rows:
        if len(preferred_rows) > 1:
            raise ValueError(f"transcripts.tsv has multiple '{preferred_role}' rows")
        return preferred_rows[0]

    default_rows = [row for row in reference_rows if normalize_role(row) == "default"]
    if len(default_rows) > 1:
        raise ValueError("transcripts.tsv has multiple 'default' rows")
    if default_rows:
        return default_rows[0]
    if len(reference_rows) > 1:
        raise ValueError("transcripts.tsv has multiple reference rows; keep exactly one default/icl/reference row")
    if reference_rows:
        return reference_rows[0]
    if not rows:
        raise ValueError("transcripts.tsv has no rows")
    return rows[0]


def list_candidate_clips(clips_dir: Path) -> list[Path]:
    return sorted(path for path in clips_dir.glob("*.wav") if path.is_file())


def classify_candidate_clips(candidate_clips: list[Path]) -> tuple[list[Path], list[Path], list[Path]]:
    jp_clips = [clip for clip in candidate_clips if "_jp " in clip.name.lower()]
    en_clips = [clip for clip in candidate_clips if "_en " in clip.name.lower()]
    unlabeled_clips = [clip for clip in candidate_clips if clip not in jp_clips and clip not in en_clips]
    return jp_clips, en_clips, unlabeled_clips


def clip_language(clip_path: Path) -> str:
    clip_name = clip_path.name.lower()
    if any(token in clip_name for token in ("_jp ", "_jp(", "_jp.", "_jp-", "_jp_")):
        return "jp"
    if any(token in clip_name for token in ("_en ", "_en(", "_en.", "_en-", "_en_")):
        return "en"
    return "unknown"


def role_priority(role: str) -> int:
    if role in REFERENCE_ROLES:
        return 0
    if role in EMBEDDING_ONLY_ROLES:
        return 1
    if role == "alternate":
        return 2
    if role == "":
        return 3
    return 4


def language_priority(language: str) -> int:
    if language == "jp":
        return 0
    if language == "unknown":
        return 1
    if language == "en":
        return 2
    return 3


def embedding_weight_for_clip(
    clip_path: Path,
    role: str,
    default_clip_path: Path,
    default_embedding_weight: float,
    english_embedding_weight: float,
    unlabeled_embedding_weight: float,
) -> float:
    weight = 1.0
    language = clip_language(clip_path)
    if language == "en":
        weight *= english_embedding_weight
    elif language == "unknown":
        weight *= unlabeled_embedding_weight
    if clip_path == default_clip_path or role in REFERENCE_ROLES:
        weight *= default_embedding_weight
    if weight <= 0.0:
        raise ValueError(f"computed a non-positive embedding weight for {clip_path.name}")
    return weight


def resolve_embedding_candidates(
    speaker_id: str,
    clips_dir: Path,
    rows: list[dict[str, str]],
    candidate_clips: list[Path],
    default_clip_path: Path,
    max_english_clips: int | None,
    only_listed_clips: bool,
    default_embedding_weight: float,
    english_embedding_weight: float,
    unlabeled_embedding_weight: float,
    embedding_language: str,
) -> tuple[list[tuple[Path, str, float]], list[str], list[str], list[str]]:
    rows_by_clip: dict[str, dict[str, str]] = {}
    for row in rows:
        clip_name = (row.get("clip_filename") or "").strip()
        if not clip_name:
            continue
        if clip_name in rows_by_clip:
            raise ValueError(f"{speaker_id}: transcripts.tsv lists '{clip_name}' more than once")
        rows_by_clip[clip_name] = row

    missing_listed = sorted(name for name in rows_by_clip if not (clips_dir / name).exists())
    if missing_listed:
        missing_str = ", ".join(missing_listed)
        raise FileNotFoundError(f"{speaker_id}: transcripts.tsv references missing clips: {missing_str}")

    supported_roles = sorted(EMBEDDING_INCLUDED_ROLES | EXCLUDED_ROLES)
    planned_candidates: list[tuple[Path, str, str]] = []
    excluded_by_role: list[str] = []
    unlisted_skipped: list[str] = []
    english_capped: list[str] = []

    for candidate_clip in candidate_clips:
        row = rows_by_clip.get(candidate_clip.name)
        role = normalize_role(row)
        language = clip_language(candidate_clip)

        if role in EXCLUDED_ROLES:
            excluded_by_role.append(candidate_clip.name)
            continue

        if embedding_language == "jp" and candidate_clip != default_clip_path and language == "en":
            continue
        if embedding_language == "en" and candidate_clip != default_clip_path and language == "jp":
            continue

        if role and role not in EMBEDDING_INCLUDED_ROLES:
            supported_str = ", ".join(supported_roles)
            raise ValueError(
                f"{speaker_id}: unsupported role '{role}' for {candidate_clip.name}; supported roles: {supported_str}"
            )

        if row is None and only_listed_clips and candidate_clip != default_clip_path:
            unlisted_skipped.append(candidate_clip.name)
            continue

        planned_candidates.append((candidate_clip, role, language))

    ordered_candidates = sorted(
        planned_candidates,
        key=lambda item: (
            item[0] != default_clip_path,
            role_priority(item[1]),
            language_priority(item[2]),
            item[0].name.lower(),
        ),
    )

    selected_candidates: list[tuple[Path, str, float]] = []
    selected_english = 0
    for candidate_clip, role, language in ordered_candidates:
        if candidate_clip != default_clip_path and language == "en" and max_english_clips is not None and selected_english >= max_english_clips:
            english_capped.append(candidate_clip.name)
            continue

        weight = embedding_weight_for_clip(
            candidate_clip,
            role,
            default_clip_path,
            default_embedding_weight,
            english_embedding_weight,
            unlabeled_embedding_weight,
        )
        selected_candidates.append((candidate_clip, role, weight))
        if language == "en":
            selected_english += 1

    if default_clip_path not in [clip for clip, _, _ in selected_candidates]:
        default_role = normalize_role(rows_by_clip.get(default_clip_path.name))
        selected_candidates.insert(
            0,
            (
                default_clip_path,
                default_role,
                embedding_weight_for_clip(
                    default_clip_path,
                    default_role,
                    default_clip_path,
                    default_embedding_weight,
                    english_embedding_weight,
                    unlabeled_embedding_weight,
                ),
            ),
        )

    return selected_candidates, excluded_by_role, english_capped, unlisted_skipped


def run_qwen_codec_for_clip(
    clip_path: Path,
    talker_path: Path,
    codec_path: Path,
    qwen_codec_path: Path,
    speaker_id: str,
) -> tuple[Path, Path | None]:
    expected_rvq = clip_path.with_suffix(".rvq")
    expected_spk = clip_path.with_suffix(".spk")
    for stale in (expected_rvq, expected_spk):
        if stale.exists():
            stale.unlink()

    result = subprocess.run(
        [
            str(qwen_codec_path),
            "--model", str(codec_path),
            "--talker", str(talker_path),
            "-i", str(clip_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"{speaker_id}: qwen-codec failed for {clip_path.name} (exit {result.returncode})\n"
            f"{result.stdout}\n{result.stderr}"
        )
    if not expected_spk.exists():
        raise RuntimeError(f"{speaker_id}: qwen-codec did not produce {expected_spk}")
    return expected_spk, expected_rvq if expected_rvq.exists() else None


def read_speaker_embedding(spk_path: Path) -> tuple[float, ...]:
    raw = spk_path.read_bytes()
    if len(raw) == 0 or len(raw) % 4 != 0:
        raise ValueError(f"invalid speaker embedding size: {spk_path} ({len(raw)} bytes)")
    float_count = len(raw) // 4
    return struct.unpack(f"<{float_count}f", raw)


def average_speaker_embeddings(embeddings: list[tuple[float, ...]], weights: list[float]) -> bytes:
    if not embeddings:
        raise ValueError("no speaker embeddings to average")
    if len(embeddings) != len(weights):
        raise ValueError("embedding/weight count mismatch")
    dimension = len(embeddings[0])
    if dimension <= 0:
        raise ValueError("speaker embedding has zero dimensions")

    totals = [0.0] * dimension
    total_weight = 0.0
    for embedding, weight in zip(embeddings, weights, strict=True):
        if len(embedding) != dimension:
            raise ValueError("speaker embeddings have inconsistent dimensions")
        if weight <= 0.0:
            raise ValueError("speaker embedding weights must be positive")
        for index, value in enumerate(embedding):
            totals[index] += value * weight
        total_weight += weight

    if total_weight <= 0.0:
        raise ValueError("sum of speaker embedding weights must be positive")

    averaged = [value / total_weight for value in totals]
    return struct.pack(f"<{dimension}f", *averaged)


def build_speaker(
    speaker_dir: Path,
    talker_path: Path,
    codec_path: Path,
    qwen_codec_path: Path,
    max_english_clips: int | None,
    only_listed_clips: bool,
    default_embedding_weight: float,
    english_embedding_weight: float,
    unlabeled_embedding_weight: float,
    output_root: Path,
    preferred_reference_role: str,
    embedding_language: str,
) -> dict:
    speaker_id = speaker_dir.name
    metadata_path = speaker_dir / "metadata.json"
    transcripts_path = speaker_dir / "transcripts.tsv"
    clips_dir = speaker_dir / "clips"

    if not metadata_path.exists():
        raise FileNotFoundError(f"{speaker_id}: missing metadata.json")
    if not transcripts_path.exists():
        raise FileNotFoundError(f"{speaker_id}: missing transcripts.tsv")
    if not clips_dir.exists():
        raise FileNotFoundError(f"{speaker_id}: missing clips/ directory")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    rows = read_transcripts(transcripts_path)
    default_row = pick_default_row(rows, preferred_reference_role)

    clip_filename = (default_row.get("clip_filename") or "").strip()
    transcript = (default_row.get("transcript_ja") or "").strip()
    if not clip_filename:
        raise ValueError(f"{speaker_id}: default row is missing clip_filename")
    if not transcript:
        raise ValueError(f"{speaker_id}: default row is missing transcript_ja")

    clip_path = clips_dir / clip_filename
    if not clip_path.exists():
        raise FileNotFoundError(f"{speaker_id}: reference clip not found: {clip_path}")

    candidate_clips = list_candidate_clips(clips_dir)
    if not candidate_clips:
        raise FileNotFoundError(f"{speaker_id}: no WAV clips found in {clips_dir}")
    if clip_path not in candidate_clips:
        raise FileNotFoundError(f"{speaker_id}: default clip is not a WAV under clips/: {clip_path.name}")

    selected_candidate_clips, excluded_by_role, english_capped_clips, unlisted_skipped_clips = resolve_embedding_candidates(
        speaker_id,
        clips_dir,
        rows,
        candidate_clips,
        clip_path,
        max_english_clips,
        only_listed_clips,
        default_embedding_weight,
        english_embedding_weight,
        unlabeled_embedding_weight,
        embedding_language,
    )

    speaker_embeddings: list[tuple[float, ...]] = []
    speaker_embedding_weights: list[float] = []
    used_embedding_clips: list[str] = []
    skipped_embedding_clips: list[str] = []
    default_rvq_path: Path | None = None

    for candidate_clip, role, weight in selected_candidate_clips:
        try:
            expected_spk, expected_rvq = run_qwen_codec_for_clip(
                candidate_clip,
                talker_path,
                codec_path,
                qwen_codec_path,
                speaker_id,
            )
            speaker_embeddings.append(read_speaker_embedding(expected_spk))
            speaker_embedding_weights.append(weight)
            used_embedding_clips.append(candidate_clip.name)
            if candidate_clip == clip_path:
                default_rvq_path = expected_rvq
        except Exception:
            if candidate_clip == clip_path:
                raise
            skipped_embedding_clips.append(candidate_clip.name)
        finally:
            candidate_clip.with_suffix(".spk").unlink(missing_ok=True)
            if candidate_clip != clip_path:
                candidate_clip.with_suffix(".rvq").unlink(missing_ok=True)

    if not speaker_embeddings:
        raise RuntimeError(f"{speaker_id}: unable to build any speaker embeddings from clips/")

    output_dir = output_root / speaker_id
    output_dir.mkdir(parents=True, exist_ok=True)

    (output_dir / "spk.bin").write_bytes(average_speaker_embeddings(speaker_embeddings, speaker_embedding_weights))
    has_rvq = default_rvq_path is not None and default_rvq_path.exists()
    if has_rvq:
        shutil.copyfile(default_rvq_path, output_dir / "rvq.bin")
        (output_dir / "ref_text.txt").write_text(transcript, encoding="utf-8", newline="\n")
    else:
        # x-vector-only clone mode: no ICL codes, drop any stale files from a
        # previous run that did have them.
        for stale_name in ("rvq.bin", "ref_text.txt"):
            stale_path = output_dir / stale_name
            if stale_path.exists():
                stale_path.unlink()

    preset_summary = {
        "speakerId": metadata.get("speakerId", speaker_id),
        "displayName": metadata.get("displayName", speaker_id),
        "gender": metadata.get("gender"),
        "language": metadata.get("language", "ja"),
        "description": metadata.get("description"),
        "searchTerms": metadata.get("searchTerms", []),
        "referenceRole": normalize_role(default_row) or "default",
        "embeddingLanguage": embedding_language,
        "hasIclCodes": has_rvq,
        "sourceClip": clip_filename,
        "speakerEmbeddingClipCount": len(used_embedding_clips),
        "englishEmbeddingClipCount": len([clip for clip in used_embedding_clips if "_en " in clip.lower()]),
        "excludedByRole": excluded_by_role,
        "englishCappedClips": english_capped_clips,
        "skippedEmbeddingClips": skipped_embedding_clips,
        "unlistedSkippedClips": unlisted_skipped_clips,
        "embeddingWeights": {
            candidate_clip.name: weight
            for candidate_clip, _, weight in selected_candidate_clips
            if candidate_clip.name in used_embedding_clips
        },
    }
    (output_dir / "preset.json").write_text(
        json.dumps(preset_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Clean up qwen-codec's output next to the default clip; the copies in
    # preset_bank/ are the artifact of record.
    clip_path.with_suffix(".spk").unlink(missing_ok=True)
    clip_path.with_suffix(".rvq").unlink(missing_ok=True)

    return preset_summary


def write_manifest_index(presets: list[dict]) -> None:
    manifest_path = PRESET_BANK_ROOT / "manifest_index.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps({"presets": presets}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def write_manifest_index_for_root(root: Path, presets: list[dict]) -> None:
    manifest_path = root / "manifest_index.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps({"presets": presets}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--speaker", help="Only build this one speaker_id (default: all under speaker_intake/)")
    parser.add_argument("--talker", help="Path to a Base-mode talker GGUF (default: auto-detect from installed assets)")
    parser.add_argument("--codec", help="Path to the shared tokenizer GGUF (default: auto-detect from installed assets)")
    parser.add_argument("--qwen-codec", help="Path to qwen-codec.exe (default: tools/qwentts.cpp/build/Release/qwen-codec.exe)")
    parser.add_argument("--max-english-clips", type=int, default=4, help="Maximum number of '_en' WAV clips to include in the speaker embedding (default: 4)")
    parser.add_argument("--only-listed-clips", action="store_true", help="Only use WAVs explicitly listed in transcripts.tsv for the speaker embedding")
    parser.add_argument("--default-embedding-weight", type=float, default=3.0, help="Relative weight applied to the default/reference clip inside the averaged speaker embedding (default: 3.0)")
    parser.add_argument("--english-embedding-weight", type=float, default=0.35, help="Relative weight applied to '_en' clips inside the averaged speaker embedding (default: 0.35)")
    parser.add_argument("--unlabeled-embedding-weight", type=float, default=0.75, help="Relative weight applied to clips without '_jp'/'_en' tags in the filename (default: 0.75)")
    parser.add_argument("--output-root", help="Output preset bank root directory (default: data/tts/preset_bank)")
    parser.add_argument("--reference-role", default="default", help="Preferred reference role (default: default). Supports default_jp/default_en.")
    parser.add_argument("--embedding-language", choices=["all", "jp", "en"], default="all", help="Clip language profile for speaker embedding selection (default: all)")
    args = parser.parse_args()

    for arg_name in ("default_embedding_weight", "english_embedding_weight", "unlabeled_embedding_weight"):
        if getattr(args, arg_name) <= 0.0:
            print(f"ERROR: --{arg_name.replace('_', '-')} must be > 0", file=sys.stderr)
            return 1

    talker_path = Path(args.talker) if args.talker else None
    codec_path = Path(args.codec) if args.codec else None
    if not talker_path or not codec_path:
        auto_talker, auto_codec = resolve_default_talker_and_codec()
        talker_path = talker_path or auto_talker
        codec_path = codec_path or auto_codec
    if not talker_path or not talker_path.exists():
        print("ERROR: no Base-mode talker GGUF found. Install one via Setup, or pass --talker <path>.", file=sys.stderr)
        return 1
    if not codec_path or not codec_path.exists():
        print("ERROR: no tokenizer GGUF found. Install one via Setup, or pass --codec <path>.", file=sys.stderr)
        return 1

    qwen_codec_path = Path(args.qwen_codec) if args.qwen_codec else resolve_qwen_codec_binary()
    if not qwen_codec_path or not qwen_codec_path.exists():
        print(
            "ERROR: qwen-codec.exe not found. Run scripts/build_qwentts_cpp.ps1 first, or pass --qwen-codec <path>.",
            file=sys.stderr,
        )
        return 1

    if not INTAKE_ROOT.exists():
        print(f"ERROR: no speaker intake data found at {INTAKE_ROOT}", file=sys.stderr)
        return 1

    output_root = Path(args.output_root) if args.output_root else PRESET_BANK_ROOT

    speaker_dirs = (
        [INTAKE_ROOT / args.speaker] if args.speaker
        else sorted(p for p in INTAKE_ROOT.iterdir() if p.is_dir())
    )

    built: list[dict] = []
    failed: list[str] = []
    for speaker_dir in speaker_dirs:
        if not speaker_dir.is_dir():
            print(f"ERROR: speaker intake folder not found: {speaker_dir}", file=sys.stderr)
            failed.append(speaker_dir.name)
            continue
        try:
            summary = build_speaker(
                speaker_dir,
                talker_path,
                codec_path,
                qwen_codec_path,
                args.max_english_clips,
                args.only_listed_clips,
                args.default_embedding_weight,
                args.english_embedding_weight,
                args.unlabeled_embedding_weight,
                output_root,
                args.reference_role,
                args.embedding_language,
            )
            built.append(summary)
            print(f"Built preset '{summary['speakerId']}' ({summary['displayName']})")
        except Exception as error:  # noqa: BLE001 - report and continue with remaining speakers
            print(f"FAILED '{speaker_dir.name}': {error}", file=sys.stderr)
            failed.append(speaker_dir.name)

    # Always refresh the manifest from whatever now exists on disk so a
    # partial failure doesn't drop previously-built presets from the index.
    existing_presets = []
    if output_root.exists():
        for preset_dir in sorted(output_root.iterdir()):
            preset_json = preset_dir / "preset.json"
            if preset_dir.is_dir() and preset_json.exists():
                existing_presets.append(json.loads(preset_json.read_text(encoding="utf-8")))
    write_manifest_index_for_root(output_root, existing_presets)

    print(f"\n{len(built)} preset(s) built, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
