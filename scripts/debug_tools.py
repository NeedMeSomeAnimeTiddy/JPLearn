from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Generator
from typing import cast

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data import database

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


@contextmanager
def _connect_progress_db() -> Generator[sqlite3.Connection, None, None]:
    database.init_db()
    conn = sqlite3.connect(database.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _load_queue_diagnostics(conn: sqlite3.Connection) -> list[dict[str, object]]:
    rows = conn.execute(
        """
        SELECT
            deck,
            COUNT(*) AS total,
            SUM(CASE WHEN next_review <= date('now') THEN 1 ELSE 0 END) AS due
        FROM review_states
        GROUP BY deck
        ORDER BY due DESC, total DESC, deck ASC
        LIMIT 12
        """
    ).fetchall()

    return [
        {
            "deck": str(row["deck"]),
            "total": int(row["total"] or 0),
            "due": int(row["due"] or 0),
        }
        for row in rows
    ]


def _load_session_goal_diagnostics(conn: sqlite3.Connection) -> list[dict[str, object]]:
    rows = conn.execute(
        """
        SELECT
            sg.session_id AS session_id,
            sg.target_items AS target_items,
            COUNT(DISTINCT re.card_id) AS completed_items,
            COUNT(re.id) AS reviewed,
            SUM(CASE WHEN re.quality >= 3 THEN 1 ELSE 0 END) AS correct
        FROM session_goals sg
        LEFT JOIN review_events re ON re.session_id = sg.session_id
        GROUP BY sg.session_id, sg.target_items
        ORDER BY sg.started_at_utc DESC
        LIMIT 10
        """
    ).fetchall()

    diagnostics: list[dict[str, object]] = []
    for row in rows:
        reviewed = int(row["reviewed"] or 0)
        correct = int(row["correct"] or 0)
        accuracy = round((correct / reviewed) * 100) if reviewed > 0 else 0
        target_items = int(row["target_items"])
        completed_items = int(row["completed_items"] or 0)
        diagnostics.append(
            {
                "session_id": str(row["session_id"]),
                "target_items": target_items,
                "completed_items": completed_items,
                "reviewed": reviewed,
                "accuracy": accuracy,
                "goal_met": completed_items >= target_items,
            }
        )
    return diagnostics


def _load_typed_outcome_diagnostics(conn: sqlite3.Connection) -> dict[str, int]:
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS attempts,
            SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN quality < 3 THEN 1 ELSE 0 END) AS incorrect
        FROM review_events
        WHERE tags_csv LIKE '%typed%'
        """
    ).fetchone()

    attempts = int((row or {})["attempts"] or 0)
    correct = int((row or {})["correct"] or 0)
    incorrect = int((row or {})["incorrect"] or 0)
    accuracy = round((correct / attempts) * 100) if attempts > 0 else 0
    return {
        "attempts": attempts,
        "correct": correct,
        "incorrect": incorrect,
        "accuracy": accuracy,
    }


def build_diagnostics_report() -> dict[str, object]:
    with _connect_progress_db() as conn:
        queue = _load_queue_diagnostics(conn)
        sessions = _load_session_goal_diagnostics(conn)
        typed = _load_typed_outcome_diagnostics(conn)

    return {
        "queue_composition": queue,
        "session_completion": sessions,
        "typed_outcomes": typed,
    }


def print_diagnostics(args: argparse.Namespace) -> int:
    report = build_diagnostics_report()
    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("== DIAGNOSTICS ==")
    print("queue composition:")
    queue_items = cast(list[dict[str, object]], report["queue_composition"])
    if not queue_items:
        print("  (no review state rows)")
    for item in queue_items:
        print(f"  {item['deck']}: due={item['due']} total={item['total']}")

    print("session completion:")
    sessions = cast(list[dict[str, object]], report["session_completion"])
    if not sessions:
        print("  (no saved session goals)")
    for session in sessions:
        print(
            f"  {session['session_id']}: completed={session['completed_items']}/{session['target_items']} "
            f"reviewed={session['reviewed']} accuracy={session['accuracy']}% goal_met={session['goal_met']}"
        )

    typed = cast(dict[str, int], report["typed_outcomes"])
    print(
        "typed outcomes: "
        f"attempts={typed['attempts']} correct={typed['correct']} "
        f"incorrect={typed['incorrect']} accuracy={typed['accuracy']}%"
    )
    return 0


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

    diagnostics_parser = subparsers.add_parser(
        "diagnostics",
        help="Print lightweight queue/session/typed diagnostics",
    )
    diagnostics_parser.add_argument("--json", action="store_true", help="Emit JSON diagnostics")
    diagnostics_parser.set_defaults(handler=print_diagnostics)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())