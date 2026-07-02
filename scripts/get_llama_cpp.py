"""Download and extract prebuilt llama.cpp Windows binaries (latest release).

The app expects llama-server.exe at:
    tools/llama.cpp/build/bin/Release/llama-server.exe

Usage:
    python scripts/get_llama_cpp.py

The script autodetects the installed GPU (NVIDIA -> CUDA, AMD -> ROCm/HIP,
Intel -> Vulkan, none/unknown -> CPU), queries the GitHub API for the latest
llama.cpp release, finds the matching Windows x64 ZIP asset, downloads it, and
flattens the binaries directly into the target directory so llm_runtime.cjs
can find them without any path changes. Set
JPLEARN_LLAMA_BACKEND=cuda|hip|vulkan|cpu to force a backend instead of
autodetecting.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCUMENTS_DIR = os.environ.get("JPLEARN_DOCUMENTS_DIR", "").strip()
TARGET_ROOT = Path(DOCUMENTS_DIR).expanduser().resolve() if DOCUMENTS_DIR else REPO_ROOT
TARGET_DIR = TARGET_ROOT / "tools" / "llama.cpp" / "build" / "bin" / "Release"
API_URL = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"


def report(done: int, total: int, offset: int = 0, grand_total: int = 0) -> None:
    effective_total = grand_total if grand_total > 0 else total
    effective_done = done + offset
    if effective_total > 0:
        pct = effective_done * 100 // effective_total
        sys.stdout.write(f"\rdownloading: {pct:3d}%  ({effective_done // (1024 * 1024)} MB)")
        sys.stdout.flush()


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())


def detect_gpu_names() -> list[str]:
    """Return detected GPU adapter names via PowerShell (Windows only)."""
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController).Name",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except Exception:
        return []


def has_nvidia_driver() -> bool:
    """Return True if the NVIDIA driver toolset (nvidia-smi) is on PATH."""
    return shutil.which("nvidia-smi") is not None


def detect_backend() -> str:
    """Pick the best llama.cpp backend for the detected GPU.

    Returns 'cuda' for an NVIDIA GPU with a working driver, 'hip' (ROCm) for an
    AMD GPU, 'vulkan' for other dedicated GPUs (e.g. Intel), or 'cpu'
    otherwise. Set JPLEARN_LLAMA_BACKEND to force a specific backend.
    """
    forced = os.environ.get("JPLEARN_LLAMA_BACKEND", "").strip().lower()
    if forced in ("cuda", "hip", "vulkan", "cpu"):
        return forced

    names = " ".join(detect_gpu_names()).lower()
    if "nvidia" in names and has_nvidia_driver():
        return "cuda"
    if any(vendor in names for vendor in ("amd", "radeon")):
        return "hip"
    if any(vendor in names for vendor in ("intel", "arc")):
        return "vulkan"
    return "cpu"


def find_asset(assets: list[dict], backend: str) -> dict | None:
    """Return the best-matching Windows x64 llama.cpp ZIP asset for backend.

    Falls back through progressively broader-compatibility backends (cuda ->
    vulkan -> cpu) if an exact match isn't published in the release.
    """

    def is_windows_x64_build(name: str) -> bool:
        return name.startswith("llama") and name.endswith(".zip") and "win" in name and "x64" in name

    fallback_chain = {
        "cuda": ["cuda", "vulkan", "cpu"],
        "hip": ["hip", "vulkan", "cpu"],
        "vulkan": ["vulkan", "cpu"],
        "cpu": ["cpu"],
    }.get(backend, ["cpu"])

    for keyword in fallback_chain:
        candidates = [
            asset for asset in assets
            if is_windows_x64_build(asset.get("name", "").lower()) and keyword in asset["name"].lower()
        ]
        if candidates:
            # Prefer the lowest matching version (e.g. cuda-12.x over cuda-13.x)
            # for the broadest driver compatibility.
            candidates.sort(key=lambda asset: asset["name"])
            return candidates[0]
    return None


def find_cudart_asset(assets: list[dict], cuda_asset_name: str) -> dict | None:
    """Find the CUDA runtime DLL package matching a chosen CUDA build asset.

    The main win-cuda-X.Y-x64.zip build does not bundle the CUDA runtime DLLs;
    they ship as a separate cudart-llama-bin-win-cuda-X.Y-x64.zip asset that
    must be extracted alongside it for llama-server.exe to start.
    """
    match = re.search(r"cuda-[\d.]+", cuda_asset_name.lower())
    if not match:
        return None
    version_tag = match.group(0)
    for asset in assets:
        name = asset.get("name", "").lower()
        if name.startswith("cudart") and name.endswith(".zip") and version_tag in name:
            return asset
    return None


def download(url: str, destination: Path, offset: int = 0, grand_total: int = 0) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "JPLearn/1.0"})
    with urllib.request.urlopen(req) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(destination, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
                done += len(chunk)
                report(done, total, offset, grand_total)
    sys.stdout.write("\n")


def extract_flat(zip_path: Path, target: Path) -> None:
    """Extract all files from the ZIP directly into target (no subdirectory nesting)."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.namelist():
            filename = Path(member).name
            if not filename:
                continue  # skip directory entries
            dest = target / filename
            with zf.open(member) as src, open(dest, "wb") as dst:
                dst.write(src.read())


def main() -> int:
    backend = detect_backend()
    gpu_names = detect_gpu_names()
    if gpu_names:
        print(f"Detected GPU(s): {', '.join(gpu_names)}")
    print(f"Selected llama.cpp backend: {backend}")

    if (TARGET_DIR / "llama-server.exe").exists():
        print(f"llama-server.exe already present at {TARGET_DIR}")
        return 0

    print("Fetching latest llama.cpp release info from GitHub...")
    try:
        release = fetch_json(API_URL)
    except Exception as exc:
        print(f"Error fetching release info: {exc}", file=sys.stderr)
        return 1

    tag = release.get("tag_name", "unknown")
    assets: list[dict] = release.get("assets", [])

    asset = find_asset(assets, backend)
    if asset is None:
        print(f"Error: could not find a Windows x64 ZIP for backend '{backend}' in the latest release.", file=sys.stderr)
        print("Available assets:", [a["name"] for a in assets], file=sys.stderr)
        return 1

    name: str = asset["name"]
    url: str = asset["browser_download_url"]

    # Resolve the CUDA runtime asset now so we can compute the grand total
    # before any downloading begins, giving the progress display a stable total.
    cudart_asset = find_cudart_asset(assets, name) if backend == "cuda" else None
    if backend == "cuda" and cudart_asset is None:
        print("Warning: no matching CUDA runtime DLL package found; llama-server.exe may fail to start.", file=sys.stderr)

    grand_total_bytes = asset["size"] + (cudart_asset["size"] if cudart_asset else 0)
    grand_total_mb = grand_total_bytes // (1024 * 1024)
    print(f"Found: {name}  ({grand_total_mb} MB)  release {tag}")

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = TARGET_DIR / name

    if not zip_path.exists():
        print(f"Downloading to {zip_path} ...")
        try:
            download(url, zip_path, offset=0, grand_total=grand_total_bytes)
        except Exception as exc:
            zip_path.unlink(missing_ok=True)
            print(f"\nDownload failed: {exc}", file=sys.stderr)
            return 1
    else:
        print(f"Archive already present: {zip_path}")

    print(f"Extracting to {TARGET_DIR} ...")
    try:
        extract_flat(zip_path, TARGET_DIR)
    except Exception as exc:
        print(f"Extraction failed: {exc}", file=sys.stderr)
        return 1

    if cudart_asset is not None:
        cudart_name = cudart_asset["name"]
        cudart_url = cudart_asset["browser_download_url"]
        cudart_zip_path = TARGET_DIR / cudart_name
        print(f"Downloading CUDA runtime package: {cudart_name}")
        if not cudart_zip_path.exists():
            try:
                download(cudart_url, cudart_zip_path, offset=asset["size"], grand_total=grand_total_bytes)
            except Exception as exc:
                cudart_zip_path.unlink(missing_ok=True)
                print(f"\nCUDA runtime download failed: {exc}", file=sys.stderr)
                return 1
        print(f"Extracting CUDA runtime to {TARGET_DIR} ...")
        try:
            extract_flat(cudart_zip_path, TARGET_DIR)
        except Exception as exc:
            print(f"CUDA runtime extraction failed: {exc}", file=sys.stderr)
            return 1

    server_exe = TARGET_DIR / "llama-server.exe"
    if server_exe.exists():
        print(f"\nDone — llama-server.exe is ready at:\n  {server_exe}")
    else:
        print("Warning: llama-server.exe not found after extraction.", file=sys.stderr)
        extracted = [f.name for f in TARGET_DIR.iterdir() if f.is_file()]
        print("Files present:", extracted, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
