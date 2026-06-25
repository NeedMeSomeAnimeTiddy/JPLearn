from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import cast


ROOT = Path(__file__).resolve().parents[1]
IGNORED_PARTS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
}


@dataclass(frozen=True)
class CheckCommand:
    name: str
    cmd: list[str]


CHECKS = [
    CheckCommand("arch", [sys.executable, "scripts/arch_check.py"]),
    CheckCommand("db", [sys.executable, "scripts/db_check.py"]),
    CheckCommand("srs", [sys.executable, "scripts/srs_check.py"]),
]
TEST_CHECK = CheckCommand("tests", [sys.executable, "-m", "pytest", "-q"])


def run_command(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def short_lines(text: str, max_lines: int) -> list[str]:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) <= max_lines:
        return lines

    keep_head = max(1, max_lines // 2)
    keep_tail = max(1, max_lines - keep_head)
    clipped = lines[:keep_head] + [f"... ({len(lines) - max_lines} lines omitted) ..."] + lines[-keep_tail:]
    return clipped


def git_output(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def build_snapshot(max_files: int) -> dict[str, object]:
    branch = git_output(["rev-parse", "--abbrev-ref", "HEAD"]) or "unknown"
    commit = git_output(["rev-parse", "--short", "HEAD"]) or "unknown"
    status_lines = git_output(["status", "--porcelain"]).splitlines()
    changed = [line.strip() for line in status_lines if line.strip()]

    py_files = [p for p in ROOT.rglob("*.py") if not is_ignored_path(p)]
    test_files = [p for p in py_files if "tests" in p.parts]

    largest = sorted(py_files, key=lambda p: line_count(p), reverse=True)[:5]

    return {
        "cwd": str(ROOT),
        "python": sys.version.split()[0],
        "branch": branch,
        "commit": commit,
        "dirty": bool(changed),
        "changed_count": len(changed),
        "changed_files": changed[:max_files],
        "changed_files_omitted": max(0, len(changed) - max_files),
        "python_file_count": len(py_files),
        "test_file_count": len(test_files),
        "largest_python_files": [
            {
                "path": str(p.relative_to(ROOT)).replace("\\", "/"),
                "lines": line_count(p),
            }
            for p in largest
        ],
    }


def line_count(path: Path) -> int:
    try:
        with path.open("r", encoding="utf-8") as f:
            return sum(1 for _ in f)
    except OSError:
        return -1


def is_ignored_path(path: Path) -> bool:
    return any(part in IGNORED_PARTS for part in path.parts)


def print_snapshot(args: argparse.Namespace) -> int:
    snapshot = build_snapshot(max_files=args.max_files)

    if args.json:
        print(json.dumps(snapshot, indent=2))
        return 0

    print("== SNAPSHOT ==")
    print(f"cwd: {snapshot['cwd']}")
    print(f"python: {snapshot['python']}")
    print(f"git: {snapshot['branch']} @ {snapshot['commit']}")
    print(f"dirty: {snapshot['dirty']} ({snapshot['changed_count']} changed)")

    changed_files = cast(list[str], snapshot["changed_files"])
    if changed_files:
        print("changed files:")
        for item in changed_files:
            print(f"  {item}")

    omitted = snapshot["changed_files_omitted"]
    if isinstance(omitted, int) and omitted > 0:
        print(f"  ... {omitted} more")

    print(f"python files: {snapshot['python_file_count']}")
    print(f"test files: {snapshot['test_file_count']}")
    print("largest python files:")

    largest_items = cast(list[dict[str, object]], snapshot["largest_python_files"])
    for largest_item in largest_items:
        print(f"  {largest_item['path']}: {largest_item['lines']} lines")

    return 0


def print_checks(args: argparse.Namespace) -> int:
    commands = CHECKS.copy()
    if args.with_tests:
        commands.append(TEST_CHECK)

    overall = 0
    for command in commands:
        result = run_command(command.cmd, timeout=args.timeout)
        marker = "PASS" if result.returncode == 0 else "FAIL"
        print(f"[{marker}] {command.name} (exit={result.returncode})")

        if result.returncode != 0 or args.verbose:
            combined = (result.stdout + "\n" + result.stderr).strip()
            for line in short_lines(combined, max_lines=args.max_lines):
                print(f"  {line}")

        if result.returncode != 0 and overall == 0:
            overall = result.returncode

        if result.returncode != 0 and args.stop_on_fail:
            return overall

    return overall


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Compact debug helpers for token-efficient diagnostics. "
            "Use snapshot for quick context and checks for short gate results."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="Print compact workspace state")
    snapshot_parser.add_argument("--json", action="store_true", help="Emit JSON snapshot")
    snapshot_parser.add_argument("--max-files", type=int, default=12, help="Max changed files to print")
    snapshot_parser.set_defaults(handler=print_snapshot)

    checks_parser = subparsers.add_parser("checks", help="Run condensed architecture/db/srs checks")
    checks_parser.add_argument("--with-tests", action="store_true", help="Include pytest -q")
    checks_parser.add_argument("--verbose", action="store_true", help="Print compact output for passing checks")
    checks_parser.add_argument("--stop-on-fail", action="store_true", help="Stop at first failing check")
    checks_parser.add_argument("--max-lines", type=int, default=12, help="Max output lines per check")
    checks_parser.add_argument("--timeout", type=int, default=120, help="Timeout seconds per check command")
    checks_parser.set_defaults(handler=print_checks)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())