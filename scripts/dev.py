from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Command:
    name: str
    cmd: list[str]


COMMANDS = [
    Command(
        "ts_codegen",
        [sys.executable, "scripts/generate_ts_types.py", "--check"],
    ),
    Command(
        "mypy",
        [
            sys.executable,
            "-m",
            "mypy",
            "--explicit-package-bases",
            "--exclude",
            r"(^|/)electron-frontend/out(/|$)",
            ".",
        ],
    ),
    Command(
        "architecture",
        [sys.executable, "scripts/arch_check.py"],
    ),
    Command(
        "db_schema",
        [sys.executable, "scripts/db_check.py"],
    ),
    Command(
        "srs_integrity",
        [sys.executable, "scripts/srs_check.py"],
    ),
    Command(
        "pytest",
        [sys.executable, "-m", "pytest", "-q"],
    ),

    # Optional (enable when SRS logic stabilises further)
    # Command(
    #     "srs_replay",
    #     [sys.executable, "scripts/srs_replay.py"],
    # ),
]


def main() -> int:
    for command in COMMANDS:
        print(f"\n=== {command.name.upper()} ===")

        result = subprocess.run(command.cmd)

        if command.name == "pytest" and result.returncode == 5:
            print("\nNo tests collected")
            continue

        if result.returncode != 0:
            print(f"\nFAILED: {command.name}")
            return result.returncode

    rc = _check_frontend()
    if rc != 0:
        return rc

    print("\nALL CHECKS PASSED")
    return 0


def _check_frontend() -> int:
    frontend_dir = Path(__file__).parent.parent / "electron-frontend"
    for script in ("lint", "build"):
        print(f"\n=== FRONTEND:{script.upper()} ===")
        result = subprocess.run(
            f"npm run {script}",
            shell=True,
            cwd=str(frontend_dir),
        )
        if result.returncode != 0:
            print(f"\nFAILED: frontend:{script}")
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())