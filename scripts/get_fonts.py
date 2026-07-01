"""Download JPLearn fonts to Documents\\JPLearn\\fonts\\.

To keep installer size small, fonts are downloaded on demand during setup.
This script downloads a small number of @fontsource package archives (one per
family), then extracts only the exact CSS + woff2 files JPLearn uses.

Usage:
    python scripts/get_fonts.py           # download all fonts
    python scripts/get_fonts.py --force   # re-download even if already present
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

# Exact fonts and weights used by the app — mirrors the imports in main.tsx
FONTS: list[tuple[str, list[int]]] = [
    ("kiwi-maru", [400, 500]),
    ("biz-udpgothic", [400, 700]),
    ("kaisei-decol", [400, 500, 700]),
    ("noto-sans-jp", [400, 500, 700]),
    ("shippori-mincho", [400, 700]),
    ("zen-old-mincho", [400, 700]),
    ("reggae-one", [400]),
    ("ibm-plex-mono", [400, 500]),
]

NPM_REGISTRY_BASE = "https://registry.npmjs.org/@fontsource"
REPO_ROOT = Path(__file__).resolve().parent.parent
READY_MARKER = ".fonts-ready"
MANIFEST_FILENAME = ".fonts-manifest.json"
FONT_BUNDLE_VERSION = 2


def resolve_target_dir() -> Path:
    """Return fonts directory. Uses JPLEARN_DOCUMENTS_DIR if set (installed app)."""
    docs_dir = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
    if docs_dir:
        return Path(docs_dir) / "fonts"
    return REPO_ROOT / "fonts"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def fetch_json(url: str) -> dict:
    return json.loads(fetch(url).decode("utf-8"))


def get_tarball_url_and_version(family: str) -> tuple[str, str]:
    meta = fetch_json(f"{NPM_REGISTRY_BASE}/{family}/latest")
    dist = meta.get("dist") or {}
    tarball = dist.get("tarball")
    version = str(meta.get("version") or "latest")
    if not isinstance(tarball, str) or not tarball:
        raise RuntimeError(f"No tarball URL for @fontsource/{family}")
    return tarball, version


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\r  {pct:3d}% ({done}/{total} files)")
        sys.stdout.flush()


def extract_font_from_package(
    tar: tarfile.TarFile,
    family: str,
    weight: int,
    target_dir: Path,
    force: bool,
) -> None:
    family_dir = target_dir / family
    files_dir = family_dir / "files"
    css_path = family_dir / f"{weight}.css"

    if css_path.exists() and not force:
        return  # already downloaded

    family_dir.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(exist_ok=True)

    try:
        css_member = tar.getmember(f"package/{weight}.css")
        css_bytes = tar.extractfile(css_member)
        if css_bytes is None:
            raise RuntimeError("missing css payload")
        css = css_bytes.read().decode("utf-8")
    except Exception as exc:
        print(f"  WARNING: failed to load CSS for {family}/{weight}: {exc}", file=sys.stderr)
        return

    css_path.write_text(css, encoding="utf-8")

    # Parse woff2 file references from the CSS (skip woff fallbacks)
    woff2_files = sorted(
        set(re.findall(r"url\(['\"]?\./files/([^'\")\s]+\.woff2)['\"]?\)", css))
    )
    if not woff2_files:
        print(f"  WARNING: no woff2 files found for {family}/{weight}", file=sys.stderr)
        return

    done = 0
    total = len(woff2_files)
    for filename in woff2_files:
        dest = files_dir / filename
        if not dest.exists() or force:
            try:
                member = tar.getmember(f"package/files/{filename}")
                payload = tar.extractfile(member)
                if payload is None:
                    raise RuntimeError(f"archive member missing: {filename}")
                dest.write_bytes(payload.read())
            except Exception as exc:
                print(f"\n  WARNING: failed to extract {filename}: {exc}", file=sys.stderr)
        done += 1
        report(done, total)

    sys.stdout.write(f"\r  {total} woff2 files - {family}/{weight}.css\n")


def download_family_package(
    family: str,
    weights: list[int],
    target_dir: Path,
    force: bool,
) -> None:
    tarball_url, version = get_tarball_url_and_version(family)
    print(f"  Package: @fontsource/{family}@{version}")
    package_bytes = fetch(tarball_url)
    with tarfile.open(fileobj=io.BytesIO(package_bytes), mode="r:gz") as tar:
        for weight in weights:
            extract_font_from_package(tar, family, weight, target_dir, force)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download JPLearn fonts from fontsource CDN.")
    parser.add_argument("--force", action="store_true", help="Re-download even if already present.")
    args = parser.parse_args()

    target_dir = resolve_target_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    marker_path = target_dir / READY_MARKER
    manifest_path = target_dir / MANIFEST_FILENAME
    marker_path.unlink(missing_ok=True)
    manifest_path.unlink(missing_ok=True)
    print(f"Fonts directory: {target_dir}\n")

    total_families = len(FONTS)
    for i, (family, weights) in enumerate(FONTS, 1):
        print(f"[{i}/{total_families}] {family}")
        try:
            download_family_package(family, weights, target_dir, args.force)
        except Exception as exc:
            print(f"  ERROR: failed to install {family}: {exc}", file=sys.stderr)
            return 1

    print(f"\nDone. Fonts saved to {target_dir}")
    marker_path.write_text("ok\n", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            {
                "version": FONT_BUNDLE_VERSION,
                "families": [
                    {"name": family, "weights": weights}
                    for family, weights in FONTS
                ],
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print("Restart JPLearn to load the downloaded fonts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
