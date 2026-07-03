"""Pre-encodes curated Japanese reference voice clips into the qwentts.cpp
preset speaker bank format consumed by the patched tts-server.exe
(--speaker-bank, see patches/qwentts-cpp/0001-speaker-bank.patch) and by
electron-frontend/electron/qwentts_runtime.cjs.

Input layout (one folder per curated speaker), authored by hand:
    data/tts/speaker_intake/<speaker_id>/
        clips/*.wav        reference audio clips (candidates)
        transcripts.tsv     tab-separated: clip_filename, role, transcript_ja, notes
                            exactly one row must have role == "default" (the
                            clip used as the speaker's reference)
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


def pick_default_row(rows: list[dict[str, str]]) -> dict[str, str]:
    for row in rows:
        if (row.get("role") or "").strip().lower() == "default":
            return row
    if not rows:
        raise ValueError("transcripts.tsv has no rows")
    return rows[0]


def build_speaker(
    speaker_dir: Path,
    talker_path: Path,
    codec_path: Path,
    qwen_codec_path: Path,
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
    default_row = pick_default_row(rows)

    clip_filename = (default_row.get("clip_filename") or "").strip()
    transcript = (default_row.get("transcript_ja") or "").strip()
    if not clip_filename:
        raise ValueError(f"{speaker_id}: default row is missing clip_filename")
    if not transcript:
        raise ValueError(f"{speaker_id}: default row is missing transcript_ja")

    clip_path = clips_dir / clip_filename
    if not clip_path.exists():
        raise FileNotFoundError(f"{speaker_id}: reference clip not found: {clip_path}")

    # qwen-codec writes <clip>.rvq and <clip>.spk next to the input WAV.
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
            f"{speaker_id}: qwen-codec failed (exit {result.returncode})\n{result.stdout}\n{result.stderr}"
        )
    if not expected_spk.exists():
        raise RuntimeError(f"{speaker_id}: qwen-codec did not produce {expected_spk}")

    output_dir = PRESET_BANK_ROOT / speaker_id
    output_dir.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(expected_spk, output_dir / "spk.bin")
    has_rvq = expected_rvq.exists()
    if has_rvq:
        shutil.copyfile(expected_rvq, output_dir / "rvq.bin")
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
        "hasIclCodes": has_rvq,
        "sourceClip": clip_filename,
    }
    (output_dir / "preset.json").write_text(
        json.dumps(preset_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Clean up qwen-codec's output next to the source clip; the copies in
    # preset_bank/ are the artifact of record.
    expected_spk.unlink(missing_ok=True)
    expected_rvq.unlink(missing_ok=True)

    return preset_summary


def write_manifest_index(presets: list[dict]) -> None:
    manifest_path = PRESET_BANK_ROOT / "manifest_index.json"
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
    args = parser.parse_args()

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
            summary = build_speaker(speaker_dir, talker_path, codec_path, qwen_codec_path)
            built.append(summary)
            print(f"Built preset '{summary['speakerId']}' ({summary['displayName']})")
        except Exception as error:  # noqa: BLE001 - report and continue with remaining speakers
            print(f"FAILED '{speaker_dir.name}': {error}", file=sys.stderr)
            failed.append(speaker_dir.name)

    # Always refresh the manifest from whatever now exists on disk so a
    # partial failure doesn't drop previously-built presets from the index.
    existing_presets = []
    if PRESET_BANK_ROOT.exists():
        for preset_dir in sorted(PRESET_BANK_ROOT.iterdir()):
            preset_json = preset_dir / "preset.json"
            if preset_dir.is_dir() and preset_json.exists():
                existing_presets.append(json.loads(preset_json.read_text(encoding="utf-8")))
    write_manifest_index(existing_presets)

    print(f"\n{len(built)} preset(s) built, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
