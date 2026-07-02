"""Download and extract the OpenVoice V2 checkpoints into data/openvoice/checkpoints_v2.

OpenVoice V2 uses a checkpoint bundle plus MeloTTS as the base-speaker layer.
This helper fetches the published V2 archive and flattens it so the expected
folders live directly under data/openvoice/checkpoints_v2/.

Usage:
    python scripts/get_openvoice.py

Override the archive URL, Hugging Face repo, and target directory with
OPENVOICE_V2_URL / OPENVOICE_HF_REPO / OPENVOICE_TARGET_DIR.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import quote, urlparse

DEFAULT_ARCHIVE_URL = "https://github.com/macroztb/OpenVoice/releases/download/checkpoints/checkpoints_v2.tar"
ARCHIVE_URL = os.environ.get("OPENVOICE_V2_URL", "").strip()
HF_REPO = os.environ.get("OPENVOICE_HF_REPO", "myshell-ai/OpenVoiceV2").strip()

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = Path(os.environ.get("OPENVOICE_TARGET_DIR") or REPO_ROOT / "data" / "openvoice" / "checkpoints_v2")


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def download(url: str, destination: Path) -> None:
    with urllib.request.urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(destination, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
                done += len(chunk)
                report(done, total)
    sys.stdout.write("\n")


def huggingface_tree_url(repo_id: str) -> str:
    repo_encoded = quote(repo_id, safe="/")
    return f"https://huggingface.co/api/models/{repo_encoded}/tree/main?recursive=1"


def huggingface_file_url(repo_id: str, file_path: str) -> str:
    repo_encoded = quote(repo_id, safe="/")
    # Keep path separators so HF resolves nested files.
    file_encoded = quote(file_path, safe="/")
    return f"https://huggingface.co/{repo_encoded}/resolve/main/{file_encoded}?download=true"


def list_hf_checkpoint_files(repo_id: str) -> list[str]:
    with urllib.request.urlopen(huggingface_tree_url(repo_id)) as response:
        items = json.loads(response.read().decode("utf-8"))

    files: list[str] = []
    for item in items:
        path = str(item.get("path") or "")
        item_type = str(item.get("type") or "")
        if item_type != "file":
            continue
        if path.startswith("converter/") or path.startswith("base_speakers/"):
            files.append(path)

    return sorted(files)


def download_from_huggingface(repo_id: str) -> None:
    files = list_hf_checkpoint_files(repo_id)
    if not files:
        raise RuntimeError(f"No checkpoint files were found in Hugging Face repo: {repo_id}")

    # Replace only the relevant subfolders to keep the directory clean.
    for subdir in ("converter", "base_speakers"):
        shutil.rmtree(TARGET_DIR / subdir, ignore_errors=True)

    total = len(files)
    for index, rel_path in enumerate(files, start=1):
        destination = TARGET_DIR / rel_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {index}/{total}: {rel_path}")
        download(huggingface_file_url(repo_id, rel_path), destination)


def archive_filename_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    if path.endswith(".tar.gz") or path.endswith(".tgz"):
        return "checkpoints_v2.tar.gz"
    if path.endswith(".tar"):
        return "checkpoints_v2.tar"
    return "checkpoints_v2.zip"


def extract_archive(archive: Path, extract_root: Path) -> None:
    lower_name = archive.name.lower()
    if lower_name.endswith(".zip"):
        with zipfile.ZipFile(str(archive), "r") as archive_file:
            archive_file.extractall(path=str(extract_root))
        return

    if lower_name.endswith(".tar") or lower_name.endswith(".tar.gz") or lower_name.endswith(".tgz"):
        with tarfile.open(str(archive), "r:*") as archive_file:
            archive_file.extractall(path=str(extract_root))
        return

    raise RuntimeError(f"Unsupported archive format: {archive.name}")


def find_checkpoint_root(root: Path) -> Path | None:
    for candidate in root.rglob("converter"):
        if (candidate / "checkpoint.pth").exists() and (candidate / "config.json").exists():
            return candidate.parent
    for candidate in root.rglob("base_speakers"):
        if candidate.is_dir():
            return candidate.parent
    return None


def flatten(extract_root: Path) -> None:
    source_root = find_checkpoint_root(extract_root)
    if source_root is None:
        raise RuntimeError("OpenVoice checkpoints were extracted, but the expected folder layout was not found")
    if source_root == TARGET_DIR:
        return
    for item in source_root.iterdir():
        dest = TARGET_DIR / item.name
        if dest.exists():
            if dest.is_dir():
                shutil.rmtree(dest)
            else:
                dest.unlink()
        shutil.move(str(item), str(dest))


def validate_install() -> bool:
    required = [
        TARGET_DIR / "converter" / "config.json",
        TARGET_DIR / "converter" / "checkpoint.pth",
        TARGET_DIR / "base_speakers",
    ]
    return all(path.exists() for path in required)


def main() -> int:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if validate_install():
        print(f"OpenVoice checkpoints already present at {TARGET_DIR}")
        return 0

    if ARCHIVE_URL:
        archive_url = ARCHIVE_URL
    else:
        archive_url = ""

    if archive_url:
        archive = TARGET_DIR / archive_filename_from_url(archive_url)
        if not archive.exists():
            print("Downloading OpenVoice V2 checkpoints archive ...")
            download(archive_url, archive)

        extract_root = TARGET_DIR / "_extract"
        extract_root.mkdir(parents=True, exist_ok=True)
        print("Extracting (this can take a minute) ...")
        extract_archive(archive, extract_root)

        flatten(extract_root)
        shutil.rmtree(extract_root, ignore_errors=True)
        archive.unlink(missing_ok=True)
    else:
        print(f"Downloading OpenVoice V2 checkpoints from Hugging Face repo: {HF_REPO}")
        try:
            download_from_huggingface(HF_REPO)
        except Exception as error:
            print(f"Hugging Face download failed: {error}", file=sys.stderr)
            print(f"Falling back to archive source: {DEFAULT_ARCHIVE_URL}")
            archive = TARGET_DIR / archive_filename_from_url(DEFAULT_ARCHIVE_URL)
            if not archive.exists():
                download(DEFAULT_ARCHIVE_URL, archive)
            extract_root = TARGET_DIR / "_extract"
            extract_root.mkdir(parents=True, exist_ok=True)
            extract_archive(archive, extract_root)
            flatten(extract_root)
            shutil.rmtree(extract_root, ignore_errors=True)
            archive.unlink(missing_ok=True)

    if not validate_install():
        print("Extraction finished but the OpenVoice checkpoint layout is incomplete", file=sys.stderr)
        return 1

    print(f"OpenVoice checkpoints ready: {TARGET_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())