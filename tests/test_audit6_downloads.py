"""Audit 6 (setup and downloads): what the downloaders accept, and where OCR's weights live.

- F9: Python's HTTP client reads an early close as end of file, so the fallback downloader
  saved a cut-short model and the installer counted it as installed.
- F4: llama.cpp was extracted into place before its CUDA runtime arrived, so a failed second
  download left a server that "was installed" and never started.
- F7: OCR's weights lived in PaddleX's own cache, and a missing cache made the first image
  download them. Using OCR must never download.
- Nit 1: a font that failed to extract only printed a warning, and the install still read as
  complete.
"""

from __future__ import annotations

import io
import socket
import tarfile
import threading
from pathlib import Path

import pytest

from scripts import get_fonts, get_llama_cpp, hf_download, ocr_model_cache


def _serve_once(response: bytes) -> str:
    """A one-request HTTP server on loopback that sends `response` and closes."""
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    def serve() -> None:
        connection, _ = server.accept()
        connection.recv(65536)
        connection.sendall(response)
        connection.close()
        server.close()

    threading.Thread(target=serve, daemon=True).start()
    return f"http://127.0.0.1:{port}/file"


class TestCutShortDownloads:
    def test_sequential_download_rejects_an_early_close(self, tmp_path: Path) -> None:
        url = _serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\n" + b"x" * 400)
        with pytest.raises(OSError, match="400 of 1000"):
            hf_download._download_sequential(url, tmp_path / "model.bin", None)

    def test_sequential_download_accepts_a_whole_file(self, tmp_path: Path) -> None:
        url = _serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello")
        hf_download._download_sequential(url, tmp_path / "model.bin", None)
        assert (tmp_path / "model.bin").read_bytes() == b"hello"

    def test_range_worker_refuses_a_whole_file_answer(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr(hf_download, "MAX_RETRIES_PER_CHUNK", 0)
        url = _serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n0123456789")
        dest = tmp_path / "model.bin"
        dest.write_bytes(b"\0" * 10)
        errors: list[Exception] = []
        hf_download._download_range_worker(url, dest, 5, 9, lambda _n: None, errors)
        assert errors and "206" in str(errors[0])
        assert dest.read_bytes() == b"\0" * 10

    def test_range_worker_reports_a_range_cut_short(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr(hf_download, "MAX_RETRIES_PER_CHUNK", 0)
        url = _serve_once(
            b"HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 0-9/10\r\nContent-Length: 10\r\n\r\n01234"
        )
        dest = tmp_path / "model.bin"
        dest.write_bytes(b"\0" * 10)
        errors: list[Exception] = []
        hf_download._download_range_worker(url, dest, 0, 9, lambda _n: None, errors)
        assert errors and "closed early at 5" in str(errors[0])


def _zip_bytes(files: dict[str, bytes]) -> bytes:
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


class TestLlamaCppInstall:
    @pytest.fixture
    def install(self, tmp_path: Path, monkeypatch):
        target = tmp_path / "tools" / "llama.cpp" / "build" / "bin" / "Release"
        monkeypatch.setattr(get_llama_cpp, "TARGET_DIR", target)
        monkeypatch.setattr(get_llama_cpp, "STAGING_DIR", target.with_name("Release.partial"))
        monkeypatch.setattr(get_llama_cpp, "detect_backend", lambda: "cuda")
        monkeypatch.setattr(get_llama_cpp, "detect_gpu_names", lambda: [])
        archives = {
            "llama-b1-bin-win-cuda-12.4-x64.zip": _zip_bytes({"llama-server.exe": b"exe", "ggml.dll": b"dll"}),
            "cudart-llama-bin-win-cuda-12.4-x64.zip": _zip_bytes({"cudart64_12.dll": b"rt"}),
        }
        release = {
            "tag_name": "b1",
            "assets": [
                {"name": name, "size": len(data), "browser_download_url": name}
                for name, data in archives.items()
            ],
        }
        monkeypatch.setattr(get_llama_cpp, "fetch_json", lambda _url: release)
        failing: set[str] = set()

        def fake_download(url: str, destination: Path, offset: int = 0, grand_total: int = 0) -> None:
            if url in failing:
                destination.write_bytes(archives[url][:10])
                raise OSError("connection reset")
            destination.write_bytes(archives[url])

        monkeypatch.setattr(get_llama_cpp, "download", fake_download)
        return target, failing

    def test_installs_into_place_only_when_complete(self, install) -> None:
        target, _failing = install
        assert get_llama_cpp.main() == 0
        assert sorted(path.name for path in target.iterdir()) == ["cudart64_12.dll", "ggml.dll", "llama-server.exe"]
        assert not target.with_name("Release.partial").exists()

    def test_a_failed_cuda_runtime_leaves_nothing_installed(self, install) -> None:
        target, failing = install
        failing.add("cudart-llama-bin-win-cuda-12.4-x64.zip")
        assert get_llama_cpp.main() == 1
        assert not (target / "llama-server.exe").exists()

        # The next run starts over and finishes.
        failing.clear()
        assert get_llama_cpp.main() == 0
        assert (target / "cudart64_12.dll").exists()


class TestOcrModelCache:
    def _make_models(self, root: Path, *names: str) -> None:
        for name in names:
            (root / name).mkdir(parents=True)
            (root / name / "inference.onnx").write_bytes(b"w")

    def test_cache_points_inside_the_assets_folder(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setenv("JPLEARN_ASSETS_DIR", str(tmp_path))
        monkeypatch.delenv("PADDLE_PDX_CACHE_HOME", raising=False)
        models_dir = ocr_model_cache.configure_cache()
        assert models_dir == tmp_path / "ocr" / "paddlex" / "official_models"
        import os

        assert os.environ["PADDLE_PDX_CACHE_HOME"] == str(tmp_path / "ocr" / "paddlex")

    def test_old_weights_are_copied_and_left_in_place(self, tmp_path: Path) -> None:
        legacy = tmp_path / "legacy"
        models = tmp_path / "models"
        self._make_models(legacy, "PP-OCRv6_medium_det_onnx", "PP-OCRv6_medium_rec_onnx", "UVDoc")

        copied = ocr_model_cache.adopt_legacy_weights(models, legacy)

        assert sorted(copied) == ["PP-OCRv6_medium_det_onnx", "PP-OCRv6_medium_rec_onnx"]
        assert ocr_model_cache.has_required_weights(models)
        assert (legacy / "PP-OCRv6_medium_det_onnx" / "inference.onnx").exists()
        assert not (models / "UVDoc").exists()
        assert not list(models.glob("*.copying"))

    def test_missing_weights_fail_instead_of_downloading(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setenv("JPLEARN_ASSETS_DIR", str(tmp_path / "assets"))
        monkeypatch.setattr(ocr_model_cache, "legacy_models_dir", lambda: tmp_path / "no-legacy")
        with pytest.raises(RuntimeError, match="Reinstall OCR"):
            ocr_model_cache.prepare_offline_runtime()

    def test_present_weights_pass(self, tmp_path: Path, monkeypatch) -> None:
        assets = tmp_path / "assets"
        monkeypatch.setenv("JPLEARN_ASSETS_DIR", str(assets))
        monkeypatch.setattr(ocr_model_cache, "legacy_models_dir", lambda: tmp_path / "no-legacy")
        self._make_models(
            assets / "ocr" / "paddlex" / "official_models",
            "PP-OCRv6_medium_det",
            "PP-OCRv6_medium_rec",
        )
        ocr_model_cache.prepare_offline_runtime()

    def test_paddlex_is_left_no_host_to_download_from(self) -> None:
        pytest.importorskip("paddlex")
        from paddlex.inference.utils import official_models

        original = official_models._ModelManager._get_hosters
        try:
            ocr_model_cache.forbid_downloads()
            assert official_models._ModelManager._get_hosters(object()) == []
        finally:
            official_models._ModelManager._get_hosters = original


class TestFontExtraction:
    def _package(self, files: dict[str, bytes]) -> tarfile.TarFile:
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        buffer.seek(0)
        return tarfile.open(fileobj=buffer, mode="r:gz")

    def test_a_missing_font_file_fails_and_leaves_no_css(self, tmp_path: Path) -> None:
        css = b"@font-face { src: url(./files/a.woff2) format('woff2'), url(./files/b.woff2); }"
        tar = self._package({"package/400.css": css, "package/files/a.woff2": b"a"})
        with pytest.raises(KeyError):
            get_fonts.extract_font_from_package(tar, "noto-sans-jp", 400, tmp_path, False)
        assert not list(tmp_path.rglob("*.css"))

    def test_a_complete_weight_writes_its_css_last(self, tmp_path: Path) -> None:
        css = b"@font-face { src: url(./files/a.woff2) format('woff2'); }"
        tar = self._package({"package/400.css": css, "package/files/a.woff2": b"a"})
        get_fonts.extract_font_from_package(tar, "noto-sans-jp", 400, tmp_path, False)
        assert list(tmp_path.rglob("*.css"))
        assert list(tmp_path.rglob("a.woff2"))
