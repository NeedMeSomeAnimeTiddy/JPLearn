"""Download offline JMdict-simplified dictionaries and build the SQLite lookup index.

Downloads compact word/kanji dictionaries published by
https://github.com/scriptin/jmdict-simplified and converts the main JMdict
word file into the fast SQLite lookup index used by the Tutor chat's offline
dictionary fallback (see electron/llm_runtime.cjs). Keeping these source
files out of the installer keeps its size down; they are fetched here on
demand from the setup wizard or Settings > Tutor.

Usage:
    python scripts/get_offline_dictionary.py
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_offline_dictionary_sqlite as sqlite_builder  # noqa: E402

API_URL = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
PITCH_ACCENT_URL = (
    "https://raw.githubusercontent.com/jkindrix/japanese-language-data/"
    "v0.7.2/data/enrichment/pitch-accent.json"
)
PITCH_ACCENT_FILENAME = "pitch-accent.json"
PITCH_ACCENT_READY_FILENAME = ".pitch-accent-ready"

# (key, regex matching the release asset filename). Order also drives the
# printed PHASE numbers, so keep the SQLite build step counted separately.
ASSET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("jmdict-eng", re.compile(r"^jmdict-eng-[\d.]+(?:\+\d+)?\.json\.zip$")),
    ("jmdict-eng-common", re.compile(r"^jmdict-eng-common-[\d.]+(?:\+\d+)?\.json\.zip$")),
    ("kanjidic2-en", re.compile(r"^kanjidic2-en-[\d.]+(?:\+\d+)?\.json\.zip$")),
    ("kradfile", re.compile(r"^kradfile-[\d.]+(?:\+\d+)?\.json\.zip$")),
    ("radkfile", re.compile(r"^radkfile-[\d.]+(?:\+\d+)?\.json\.zip$")),
]

TOTAL_PHASES = len(ASSET_PATTERNS) + 2  # + pitch accent download and SQLite build


def resolve_target_dir() -> Path:
    """Return the offline dictionary directory. Uses JPLEARN_DOCUMENTS_DIR if set (installed app)."""
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    if docs_dir:
        return Path(docs_dir) / "data" / "external_sources" / "offline_dictionary"
    return REPO_ROOT / "data" / "external_sources" / "offline_dictionary"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def find_asset(assets: list[dict], pattern: re.Pattern[str]) -> dict | None:
    for asset in assets:
        name = str(asset.get("name") or "")
        if pattern.match(name):
            return asset
    return None


def download_and_extract_zip(url: str, target_dir: Path) -> list[str]:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        chunks: list[bytes] = []
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            chunks.append(chunk)
            done += len(chunk)
            report(done, total)
        sys.stdout.write("\n")

    payload = b"".join(chunks)
    extracted: list[str] = []
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for member in archive.namelist():
            if not member.lower().endswith(".json"):
                continue
            data = archive.read(member)
            dest_path = target_dir / Path(member).name
            dest_path.write_bytes(data)
            extracted.append(dest_path.name)
    return extracted


def download_file(url: str, target_path: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    temporary_path = target_path.with_suffix(f"{target_path.suffix}.part")
    with urllib.request.urlopen(req) as response, temporary_path.open("wb") as output:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            output.write(chunk)
            done += len(chunk)
            report(done, total)
    sys.stdout.write("\n")
    temporary_path.replace(target_path)


def main() -> int:
    target_dir = resolve_target_dir()
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"Offline dictionary directory: {target_dir}")
    print("Fetching latest jmdict-simplified release metadata...")
    release = fetch_json(API_URL)
    assets = release.get("assets") if isinstance(release, dict) else None
    if not isinstance(assets, list):
        print("ERROR: could not read release assets", file=sys.stderr)
        return 1

    downloaded_files: dict[str, str] = {}
    for index, (key, pattern) in enumerate(ASSET_PATTERNS, start=1):
        print(f"PHASE {index}/{TOTAL_PHASES}: {key}")
        asset = find_asset(assets, pattern)
        if not asset:
            print(f"  WARNING: no matching asset found for {key}; skipping", file=sys.stderr)
            continue
        download_url = asset.get("browser_download_url")
        if not isinstance(download_url, str) or not download_url:
            print(f"  WARNING: asset {key} has no download URL; skipping", file=sys.stderr)
            continue
        extracted = download_and_extract_zip(download_url, target_dir)
        if extracted:
            downloaded_files[key] = extracted[0]
            print(f"  Saved: {extracted[0]}")
        else:
            print(f"  WARNING: no .json file found inside {key} archive", file=sys.stderr)

    pitch_phase = len(ASSET_PATTERNS) + 1
    print(f"PHASE {pitch_phase}/{TOTAL_PHASES}: pitch-accent")
    pitch_accent_path = target_dir / PITCH_ACCENT_FILENAME
    download_file(PITCH_ACCENT_URL, pitch_accent_path)
    downloaded_files["pitch-accent"] = pitch_accent_path.name
    print(f"  Saved: {pitch_accent_path.name}")

    print(f"PHASE {TOTAL_PHASES}/{TOTAL_PHASES}: build-sqlite-index")
    input_name = downloaded_files.get("jmdict-eng") or downloaded_files.get("jmdict-eng-common")
    if not input_name:
        print("ERROR: no JMdict word file was downloaded; cannot build lookup index", file=sys.stderr)
        return 1

    output_path = target_dir / "jmdict_lookup.sqlite"
    ready_path = target_dir / PITCH_ACCENT_READY_FILENAME
    ready_path.unlink(missing_ok=True)
    stats = sqlite_builder.build_lookup_db(
        input_path=target_dir / input_name,
        output_path=output_path,
        pitch_accent_path=pitch_accent_path,
    )
    if stats["pitch_accent_entries"] <= 0:
        raise RuntimeError("Pitch accent import produced no usable entries")
    ready_path.write_text(
        json.dumps(
            {
                "schema_version": 3,
                "pitch_accent_source": PITCH_ACCENT_URL,
                "pitch_accent_entries": stats["pitch_accent_entries"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "target_dir": str(target_dir),
                "sqlite_path": str(output_path),
                "downloaded": downloaded_files,
                **stats,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
