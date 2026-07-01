"""Download font files from fontsource CDN to Documents\\JPLearn\\fonts\\.

JPLearn's Japanese fonts are too large to bundle in the installer (~88 MB).
This script downloads only the woff2 files for the exact font families and
weights the app uses. Once downloaded, the app loads them automatically.

Usage:
    python scripts/get_fonts.py           # download all fonts
    python scripts/get_fonts.py --force   # re-download even if already present
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import urllib.request
from pathlib import Path

# Exact fonts and weights used by the app — mirrors the imports in main.tsx
FONTS: list[tuple[str, list[int]]] = [
    ("zen-kaku-gothic-new", [400, 500, 700, 900]),
    ("m-plus-rounded-1c", [500, 700, 800]),
    ("klee-one", [600]),
    ("noto-sans-jp", [400, 500, 700]),
    ("shippori-mincho", [400, 700]),
    ("zen-old-mincho", [400, 700]),
    ("dotgothic16", [400]),
    ("ibm-plex-mono", [400, 500]),
]

CDN_BASE = "https://cdn.jsdelivr.net/npm/@fontsource"
REPO_ROOT = Path(__file__).resolve().parent.parent


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


def report(done: int, total: int) -> None:
    if total > 0:
        pct = done * 100 // total
        sys.stdout.write(f"\r  {pct:3d}% ({done}/{total} files)")
        sys.stdout.flush()


def download_font(family: str, weight: int, target_dir: Path, force: bool) -> None:
    family_dir = target_dir / family
    files_dir = family_dir / "files"
    css_path = family_dir / f"{weight}.css"

    if css_path.exists() and not force:
        return  # already downloaded

    family_dir.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(exist_ok=True)

    # Fetch and save the CSS file
    css_url = f"{CDN_BASE}/{family}/{weight}.css"
    try:
        css = fetch(css_url).decode("utf-8")
    except Exception as exc:
        print(f"  WARNING: failed to fetch CSS for {family}/{weight}: {exc}", file=sys.stderr)
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
                dest.write_bytes(fetch(f"{CDN_BASE}/{family}/files/{filename}"))
            except Exception as exc:
                print(f"\n  WARNING: failed to fetch {filename}: {exc}", file=sys.stderr)
        done += 1
        report(done, total)

    sys.stdout.write(f"\r  {total} woff2 files - {family}/{weight}.css\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download JPLearn fonts from fontsource CDN.")
    parser.add_argument("--force", action="store_true", help="Re-download even if already present.")
    args = parser.parse_args()

    target_dir = resolve_target_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    print(f"Fonts directory: {target_dir}\n")

    total_families = len(FONTS)
    for i, (family, weights) in enumerate(FONTS, 1):
        print(f"[{i}/{total_families}] {family}")
        for weight in weights:
            download_font(family, weight, target_dir, args.force)

    print(f"\nDone. Fonts saved to {target_dir}")
    print("Restart JPLearn to load the downloaded fonts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
