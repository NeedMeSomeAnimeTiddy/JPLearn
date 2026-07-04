"""Shared multi-connection HTTP downloader for large model files.

HuggingFace (and its CDN) serves large files over connections whose
throughput is often capped well below the user's actual bandwidth,
especially on high-latency links. A single sequential ``urlopen`` stream
routinely wastes most of the available bandwidth. Splitting the file into
several byte-range chunks and downloading them concurrently — the same
trick used by ``aria2c`` and ``hf_transfer`` — restores most of that
throughput without adding a heavy dependency.

Falls back to a plain sequential download automatically when the server
doesn't support Range requests or the file is too small to benefit.

Usage:
    from hf_download import download_file

    def report(done, total):
        ...  # print progress

    download_file(url, tmp_path, report=report)

Tune/disable via environment variable:
    set JPLEARN_DOWNLOAD_WORKERS=1   # force sequential downloads
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

USER_AGENT = "JPLearn/1.0"
CHUNK_READ_SIZE = 256 * 1024
MIN_CHUNK_SIZE = 8 * 1024 * 1024  # never split smaller than this per worker
MIN_SIZE_FOR_PARALLEL = 16 * 1024 * 1024  # below this, sequential is fine
MAX_RETRIES_PER_CHUNK = 5

# Download backend policy:
# - auto: prefer HF CLI when available for HF URLs, else use HTTP downloader
# - hf: force HF CLI for HF URLs (falls back to HTTP on failures)
# - http: always use HTTP downloader
BACKEND_AUTO = "auto"
BACKEND_HF = "hf"
BACKEND_HTTP = "http"

ReportFn = Callable[[int, int], None]
_LAST_DOWNLOAD_METHOD = "unknown"


def get_last_download_method() -> str:
    """Return the most recent download method label."""
    return _LAST_DOWNLOAD_METHOD


def _set_last_download_method(method: str) -> None:
    global _LAST_DOWNLOAD_METHOD
    _LAST_DOWNLOAD_METHOD = method


def _default_workers() -> int:
    override = os.environ.get("JPLEARN_DOWNLOAD_WORKERS", "").strip()
    if override.isdigit() and int(override) > 0:
        return int(override)
    return 8


def _download_backend() -> str:
    value = os.environ.get("JPLEARN_DOWNLOAD_BACKEND", BACKEND_AUTO).strip().lower()
    if value in {BACKEND_AUTO, BACKEND_HF, BACKEND_HTTP}:
        return value
    return BACKEND_AUTO


def _hf_cli_commands() -> list[list[str]]:
    commands: list[list[str]] = []
    for exe in ("hf", "huggingface-cli"):
        if shutil.which(exe):
            commands.append([exe])

    try:
        __import__("huggingface_hub.commands.huggingface_cli")
        commands.append([sys.executable, "-m", "huggingface_hub.commands.huggingface_cli"])
    except Exception:
        pass

    return commands


def _parse_hf_url(url: str) -> tuple[str, str, str] | None:
    """Extract (repo_id, revision, file_path) from a Hugging Face resolve URL."""
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc.lower() != "huggingface.co":
        return None

    path = parsed.path.lstrip("/")
    if "/resolve/" not in path:
        return None

    repo_part, rest = path.split("/resolve/", 1)
    if not repo_part or "/" not in repo_part or "/" not in rest:
        return None

    revision, file_path = rest.split("/", 1)
    if not revision or not file_path:
        return None

    return repo_part, revision, file_path


def _download_hf_cli(url: str, dest: Path) -> bool:
    """Try downloading via Hugging Face CLI; return True on success."""
    parsed = _parse_hf_url(url)
    commands = _hf_cli_commands()
    if not parsed or not commands:
        return False

    repo_id, revision, file_path = parsed
    expected_dest = dest.parent / file_path
    expected_dest.parent.mkdir(parents=True, exist_ok=True)

    for base_cmd in commands:
        cmd = [
            *base_cmd,
            "download",
            repo_id,
            file_path,
            "--revision",
            revision,
            "--local-dir",
            str(dest.parent),
        ]

        # Keep CLI output visible (progress/errors), then fall back if it fails.
        result = subprocess.run(cmd, check=False)
        if result.returncode == 0 and expected_dest.exists():
            break
    else:
        return False

    if expected_dest != dest:
        expected_dest.replace(dest)
    return True


def _request(url: str, headers: dict | None = None) -> urllib.request.Request:
    req_headers = {"User-Agent": USER_AGENT}
    if headers:
        req_headers.update(headers)
    return urllib.request.Request(url, headers=req_headers)


def _probe(url: str) -> tuple[int, bool]:
    """Return (content_length, supports_range) for url, following redirects.

    Uses a Range request rather than HEAD since some CDNs (including
    HuggingFace's) handle HEAD inconsistently across redirects.
    """
    req = _request(url, {"Range": "bytes=0-0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        supports_range = resp.status == 206 or resp.headers.get("Accept-Ranges") == "bytes"
        content_range = resp.headers.get("Content-Range")
        if content_range and "/" in content_range:
            total = int(content_range.rsplit("/", 1)[-1])
        else:
            total = int(resp.headers.get("Content-Length") or 0)
        return total, supports_range


def _download_sequential(url: str, dest: Path, report: ReportFn | None) -> None:
    req = _request(url)
    with urllib.request.urlopen(req, timeout=30) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(dest, "wb") as out:
            while True:
                chunk = response.read(CHUNK_READ_SIZE)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if report:
                    report(done, total)


def _download_range_worker(
    url: str,
    dest: Path,
    start: int,
    end: int,
    progress_cb: Callable[[int], None],
    errors: list[Exception],
) -> None:
    pos = start
    attempt = 0
    while pos <= end:
        try:
            req = _request(url, {"Range": f"bytes={pos}-{end}"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                with open(dest, "r+b") as f:
                    f.seek(pos)
                    while True:
                        chunk = resp.read(CHUNK_READ_SIZE)
                        if not chunk:
                            break
                        f.write(chunk)
                        pos += len(chunk)
                        progress_cb(len(chunk))
            return
        except Exception as exc:  # noqa: BLE001 - retry any transient network error
            attempt += 1
            if attempt > MAX_RETRIES_PER_CHUNK:
                errors.append(exc)
                return
            time.sleep(min(2 ** attempt, 10))


def _download_parallel(url: str, dest: Path, total: int, num_workers: int, report: ReportFn | None) -> None:
    num_workers = max(1, min(num_workers, -(-total // MIN_CHUNK_SIZE)))
    chunk_size = -(-total // num_workers)  # ceil division

    ranges = []
    pos = 0
    while pos < total:
        end = min(pos + chunk_size, total) - 1
        ranges.append((pos, end))
        pos = end + 1

    with open(dest, "wb") as f:
        f.truncate(total)

    done = 0
    done_lock = threading.Lock()
    last_report_time = 0.0

    def progress_cb(n: int) -> None:
        nonlocal done, last_report_time
        with done_lock:
            done += n
            now = time.monotonic()
            if report and (now - last_report_time > 0.1 or done >= total):
                last_report_time = now
                report(done, total)

    errors: list[Exception] = []
    threads = [
        threading.Thread(target=_download_range_worker, args=(url, dest, start, end, progress_cb, errors), daemon=True)
        for start, end in ranges
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    if errors:
        raise errors[0]


def download_file(
    url: str,
    dest: Path,
    report: ReportFn | None = None,
    num_workers: int | None = None,
) -> None:
    """Download url to dest.

    Uses several concurrent range-request connections when the server
    supports it and the file is large enough to benefit; otherwise falls
    back to a single sequential stream. Raises on failure (including
    ``urllib.error.HTTPError`` for 404s) — callers that need to treat a
    missing file as "optional" should catch that themselves.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    workers = num_workers if num_workers is not None else _default_workers()

    backend = _download_backend()
    should_try_hf = backend in {BACKEND_AUTO, BACKEND_HF}
    if should_try_hf and _download_hf_cli(url, dest):
        _set_last_download_method("hf-cli")
        if report:
            size = dest.stat().st_size
            report(size, size)
        return

    total, supports_range = _probe(url)
    if supports_range and total >= MIN_SIZE_FOR_PARALLEL and workers > 1:
        _set_last_download_method("http-range")
        _download_parallel(url, dest, total, workers, report)
    else:
        _set_last_download_method("http")
        _download_sequential(url, dest, report)
