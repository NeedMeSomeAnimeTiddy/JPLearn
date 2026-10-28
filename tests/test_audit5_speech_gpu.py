"""Audit 5, F4: speech recognition on a machine without the NVIDIA driver tools.

`subprocess.run(["nvidia-smi"])` raises FileNotFoundError when the executable is missing, so
every transcription failed on AMD or Intel graphics. A missing tool now means "no GPU".
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import speech_recognition_server as server  # noqa: E402


def test_no_nvidia_smi_means_cpu(monkeypatch) -> None:
    monkeypatch.setattr(server.shutil, "which", lambda name: None)

    def fail_run(*args, **kwargs):  # the old code ran it anyway, and it raised
        raise FileNotFoundError(2, "The system cannot find the file specified")

    monkeypatch.setattr(server.subprocess, "run", fail_run)

    assert server._detect_gpu() == ("cpu", "int8")


def test_an_nvidia_smi_that_cannot_start_means_cpu(monkeypatch) -> None:
    monkeypatch.setattr(server.shutil, "which", lambda name: "C:/missing/nvidia-smi.exe")

    def fail_run(*args, **kwargs):
        raise PermissionError(13, "Access is denied")

    monkeypatch.setattr(server.subprocess, "run", fail_run)

    assert server._detect_gpu() == ("cpu", "int8")


def test_a_failing_nvidia_smi_means_cpu(monkeypatch) -> None:
    monkeypatch.setattr(server.shutil, "which", lambda name: "nvidia-smi")
    monkeypatch.setattr(
        server.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, returncode=9)
    )

    assert server._detect_gpu() == ("cpu", "int8")
