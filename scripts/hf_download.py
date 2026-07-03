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
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

USER_AGENT = "JPLearn/1.0"
CHUNK_READ_SIZE = 256 * 1024
MIN_CHUNK_SIZE = 8 * 1024 * 1024  # never split smaller than this per worker
MIN_SIZE_FOR_PARALLEL = 16 * 1024 * 1024  # below this, sequential is fine
MAX_RETRIES_PER_CHUNK = 5

ReportFn = Callable[[int, int], None]


def _default_workers() -> int:
    override = os.environ.get("JPLEARN_DOWNLOAD_WORKERS", "").strip()
    if override.isdigit() and int(override) > 0:
        return int(override)
    return 8


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

    total, supports_range = _probe(url)
    if supports_range and total >= MIN_SIZE_FOR_PARALLEL and workers > 1:
        _download_parallel(url, dest, total, workers, report)
    else:
        _download_sequential(url, dest, report)
