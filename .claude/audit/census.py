#!/usr/bin/env python3
"""Mechanical census of the JPLearn repository, for a /crew-audit pass.

This counts. It does not judge. Every number here is a starting point for
investigation, never a finding on its own -- a large file is not a problem, an
IPC route with no `validate*` call may take no input at all, and a hex literal
may sit in a comment. The audit establishes all of that by reading the code.

Run from the root of the tree being audited (paths are read relative to the
working directory, so a commit audited in its own worktree is counted there):

    ./.venv/Scripts/python.exe .claude/audit/census.py

Options:
    --json      emit machine-readable output instead of the report
    --records   include prior findings and debt triggers (for Reconcile)
    --top N     how many entries to show in ranked lists (default 12)

Stdlib only, no network. Each section prints the paths and patterns it used, so
a number can be re-derived by hand when it looks wrong.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

FRONTEND = Path("electron-frontend")
SRC = FRONTEND / "src"
ELECTRON = FRONTEND / "electron"
GENERATED = SRC / "generated"
BRIDGE = Path("scripts/desktop_bridge.py")
IPC_HANDLERS = ELECTRON / "ipc_handlers.cjs"
ARCHITECTURE = Path("ARCHITECTURE.md")
DEBT = Path("DEBT.md")

PY_ROOTS = [Path("domain"), Path("data"), Path("scripts")]
SKIP_DIRS = {"node_modules", "out", "dist", "python-bundle", ".venv", "mockups",
             "__pycache__", ".git"}
AUTO_GENERATED = "Auto-generated"

TEST_NAME = re.compile(r"^test[_-]|\.test\.|_test\.py$")
TEST_DIRS = {"tests", "test-fixtures"}

# Section 3
BRIDGE_TABLE = re.compile(r"^_COMMAND_HANDLERS\s*:[^=]*=\s*\{(.*?)^\}", re.M | re.S)
BRIDGE_ENTRY = re.compile(r"^\s*['\"]([^'\"]+)['\"]\s*:", re.M)
CONNECT_CALL = re.compile(r"\b(?:_connect|shared_connection)\(")
CONNECT_DEF = re.compile(r"^\s*def\s+(?:_connect|shared_connection)\(")

# Section 4
IPC_HANDLE = re.compile(r"ipcMain\.handle\(\s*['\"]([^'\"]+)['\"]\s*,\s*(?:async\s*)?\(([^)]*)\)")
SECURITY_IMPORT = re.compile(r"const\s*\{([^}]*)\}\s*=\s*require\(['\"]\./ipc_security\.cjs['\"]\)")
SPAWN_CALL = re.compile(r"\b(?:spawn|execFile|fork)(?:Sync)?\s*\(")
STDIN_ERROR = re.compile(r"\.stdin\??\.on\(\s*['\"]error['\"]")

# Section 5
URL_HOST = re.compile(r"https?://([A-Za-z0-9.-]+)")
NET_CALL = re.compile(r"https\.get\(|https\.request\(|\bfetch\(|\burllib\b|\brequests\.\w"
                      r"|\bnet\.request\s*\(|\bautoUpdater\b|update-electron-app")
RENDERER_NET_CALL = re.compile(r"\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b"
                               r"|\bEventSource\b|https?://[^\s'\"`<>]+")

# Section 6
USE_STATE = re.compile(r"\buseState\b(?:<[^>]*>)?\(")
LOCAL_STORAGE = re.compile(r"localStorage\.(\w+)\(\s*([^,)]*)")
STRING_LITERAL = re.compile(r"^(['\"`])([^'\"`$]*)\1$")
LOOP_CALLS = {
    "setInterval(": re.compile(r"\bsetInterval\("),
    "requestAnimationFrame(": re.compile(r"\brequestAnimationFrame\("),
    "addEventListener(": re.compile(r"\baddEventListener\("),
}
HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
BORDER_RADIUS = re.compile(r"border-radius\s*:\s*([^;}]+)")
ZERO_RADIUS = re.compile(r"^0(?:px|rem|em|%)?(?:\s*!important)?$")

# Section 7-10
ALL_DECKS = re.compile(r"\bALL_DECKS\[")
PY_TEST_FN = re.compile(r"^\s*(?:async\s+)?def\s+test_", re.M)
VITEST_FN = re.compile(r"(?<![\w.])(?:it|test)(?:\.(?:each|only|skip|concurrent|todo)\b[^(]*)?\s*\(")
TODO = re.compile(r"\b(?:TODO|FIXME|HACK)\b")
TODO_AREAS = [Path("domain"), Path("data"), Path("scripts"), Path("tests"), SRC, ELECTRON]

# Section 9. Every spelling of a debt trigger, declared once so the count and the
# listing cannot drift apart: `**Trigger:`, `**Trigger.`, `**The trigger`, and
# `**Trigger - FIRED <date>:` (fired, still open). The lookahead drops narration
# ABOUT a firing (`**The trigger has not fired`), which is history, not a condition.
TRIGGER = re.compile(r"\*\*(?:The\s+)?[Tt]rigger(?!s?\s+(?:has\s+not\s+)?fired)")
FINDINGS_HEADING = "## 8. Findings"

# Reset for each section by collect(). A section with unreadable input is withheld
# rather than publishing incomplete counts as though they were complete.
_READ_ERRORS: dict[str, str] = {}


def sh(cmd: list[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30,
                            encoding="utf-8", errors="replace")
    if result.returncode:
        reason = result.stderr.strip() or result.stdout.strip() or "no diagnostic output"
        raise RuntimeError(f"exit {result.returncode}: {reason}")
    return result.stdout.strip()


def walk(root: Path, exts: tuple[str, ...]) -> list[Path]:
    """Files under root with one of exts, never descending into SKIP_DIRS."""
    if not root.is_dir():
        return []
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        out.extend(Path(dirpath, f) for f in filenames if f.endswith(exts))
    return sorted(out)


def is_test(p: Path) -> bool:
    return bool(TEST_NAME.search(p.name)) or bool(TEST_DIRS.intersection(p.parts))


def is_generated(p: Path) -> bool:
    return GENERATED in p.parents


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        _READ_ERRORS[posix(p)] = f"{type(exc).__name__}: {exc}"
        return ""


def first_line(p: Path) -> str:
    try:
        with p.open(encoding="utf-8", errors="replace") as fh:
            return fh.readline()
    except OSError as exc:
        _READ_ERRORS[posix(p)] = f"{type(exc).__name__}: {exc}"
        return ""


def is_auto_generated(p: Path) -> bool:
    return AUTO_GENERATED in first_line(p)


def loc(p: Path) -> int:
    return read(p).count("\n")


def posix(p: Path) -> str:
    return p.as_posix()


def count_by_file(files: Iterable[Path], pattern: re.Pattern[str]) -> list[tuple[str, int]]:
    """(path, hits) for every file with at least one hit, most hits first."""
    c: Counter[str] = Counter()
    for p in files:
        n = len(pattern.findall(read(p)))
        if n:
            c[posix(p)] = n
    return c.most_common()


def renderer_files(exts: tuple[str, ...] = (".ts", ".tsx")) -> list[Path]:
    return [p for p in walk(SRC, exts) if not is_test(p) and not is_generated(p)]


# --- 1. header -------------------------------------------------------------

def header() -> dict[str, Any]:
    errors: list[dict[str, Any]] = []

    def git(args: list[str], fields: list[str]) -> str | None:
        cmd = ["git", *args]
        try:
            return sh(cmd)
        except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
            errors.append({"section": "header", "fields": fields, "command": cmd,
                           "reason": f"{type(exc).__name__}: {exc}"})
            return None

    status = git(["status", "--porcelain"], ["uncommitted_tracked", "untracked"])
    porcelain = status.splitlines() if status is not None else None
    return {
        "commit": git(["rev-parse", "--short", "HEAD"], ["commit"]),
        "subject": git(["log", "-1", "--format=%s"], ["subject"]),
        "branch": git(["rev-parse", "--abbrev-ref", "HEAD"], ["branch"]),
        "uncommitted_tracked": (sum(1 for ln in porcelain if not ln.startswith("??"))
                                if porcelain is not None else None),
        "untracked": (sum(1 for ln in porcelain if ln.startswith("??"))
                      if porcelain is not None else None),
        "errors": errors,
    }


# --- 2. largest hand-written files ----------------------------------------

def largest_files() -> dict[str, list[tuple[str, int]]]:
    kinds: dict[str, list[Path]] = {
        "python": [p for r in PY_ROOTS for p in walk(r, (".py",))],
        "ts_tsx": [p for p in walk(SRC, (".ts", ".tsx")) if not is_generated(p)],
        "cjs": walk(ELECTRON, (".cjs",)),
        "css": walk(SRC, (".css",)),
    }
    return {
        kind: sorted(((posix(p), loc(p)) for p in files if not is_auto_generated(p)),
                     key=lambda kv: -kv[1])
        for kind, files in kinds.items()
    }


# --- 3. python bridge ------------------------------------------------------

def bridge_commands(text: str) -> list[str]:
    """Command names in desktop_bridge.py's `_COMMAND_HANDLERS` route table."""
    m = BRIDGE_TABLE.search(text)
    return BRIDGE_ENTRY.findall(m.group(1)) if m else []


def connect_sites(text: str) -> int:
    return sum(len(CONNECT_CALL.findall(ln)) for ln in text.splitlines()
               if not CONNECT_DEF.match(ln))


def bridge() -> dict[str, Any]:
    by_file = Counter({posix(p): connect_sites(read(p)) for p in walk(Path("data"), (".py",))})
    return {
        "commands": len(bridge_commands(read(BRIDGE))),
        "connect_sites_total": sum(by_file.values()),
        "connect_sites_by_file": [kv for kv in by_file.most_common() if kv[1]],
    }


# --- 4. electron main ------------------------------------------------------

def security_validators(text: str) -> set[str]:
    """Names ipc_handlers.cjs imports from ipc_security.cjs, minus the sender check."""
    m = SECURITY_IMPORT.search(text)
    names = {n.strip() for n in m.group(1).split(",")} if m else set()
    return {n for n in names if n and n != "assertTrustedIpcSender"}


def ipc_routes(text: str) -> list[tuple[str, str, str]]:
    """(channel, params, body) per ipcMain.handle; a body runs to the next handle."""
    ms = list(IPC_HANDLE.finditer(text))
    return [(m.group(1), m.group(2), text[m.end():ms[i + 1].start() if i + 1 < len(ms) else len(text)])
            for i, m in enumerate(ms)]


def unvalidated_routes(text: str) -> list[dict[str, Any]]:
    validators = security_validators(text)
    out = []
    for channel, params, body in ipc_routes(text):
        if any(re.search(rf"\b{re.escape(v)}\b", body) for v in validators):
            continue
        takes_input = len([p for p in params.split(",") if p.strip()]) > 1
        out.append({"channel": channel, "takes_input": takes_input})
    return out


def electron_main() -> dict[str, Any]:
    files = [p for p in walk(ELECTRON, (".cjs",)) if not is_test(p)]
    return {
        "ipc_handle_by_file": count_by_file(files, re.compile(r"ipcMain\.handle\(")),
        "unvalidated_candidates": unvalidated_routes(read(IPC_HANDLERS)),
        "spawn_sites_by_file": count_by_file(files, SPAWN_CALL),
        "stdin_error_by_file": count_by_file(files, STDIN_ERROR),
    }


# --- 5. network ------------------------------------------------------------

def network_hits(text: str, pattern: re.Pattern[str] = NET_CALL) -> dict[str, list[str]]:
    hosts = sorted(set(URL_HOST.findall(text)))
    calls = [f"{i}: {ln.strip()[:100]}" for i, ln in enumerate(text.splitlines(), 1)
             if pattern.search(ln)]
    return {"hosts": hosts, "calls": calls}


def network() -> dict[str, dict[str, list[str]]]:
    roots = [ELECTRON, Path("scripts"), Path("data"), Path("domain")]
    out: dict[str, dict[str, list[str]]] = {}
    for p in (p for r in roots for p in walk(r, (".cjs", ".js", ".py"))):
        if is_test(p) or is_auto_generated(p):
            continue
        hits = network_hits(read(p))
        if hits["hosts"] or hits["calls"]:
            out[posix(p)] = hits
    renderer = walk(SRC, (".ts", ".tsx", ".css", ".html")) + [FRONTEND / "index.html"]
    for p in renderer:
        if is_test(p):
            continue
        hits = network_hits(read(p), RENDERER_NET_CALL)
        if hits["hosts"] or hits["calls"]:
            out[posix(p)] = hits
    return out


# --- 6. renderer -----------------------------------------------------------

def local_storage_sites(text: str) -> list[str]:
    """`method(key)` per localStorage call; the key is quoted only when it is a literal."""
    out = []
    for method, arg in LOCAL_STORAGE.findall(text):
        lit = STRING_LITERAL.match(arg.strip())
        out.append(f"{method}({lit.group(2)!r})" if lit else f"{method}(<{arg.strip() or '-'}>)")
    return out


def radius_count(text: str) -> int:
    return sum(1 for v in BORDER_RADIUS.findall(text) if not ZERO_RADIUS.match(v.strip()))


def renderer() -> dict[str, Any]:
    code = renderer_files()
    css = [p for p in walk(SRC, (".css",)) if not is_generated(p)]
    app = read(SRC / "App.tsx")
    storage = {posix(p): s for p in code if (s := local_storage_sites(read(p)))}
    radius = Counter({posix(p): radius_count(read(p)) for p in css})
    return {
        "app_tsx_lines": app.count("\n"),
        "app_tsx_use_state": len(USE_STATE.findall(app)),
        "local_storage_by_file": storage,
        "loops_by_file": {name: count_by_file(code, rx) for name, rx in LOOP_CALLS.items()},
        "hex_colours_by_file": count_by_file(code + css, HEX_COLOUR),
        "border_radius_nonzero_by_file": [kv for kv in radius.most_common() if kv[1]],
    }


# --- 7. decks --------------------------------------------------------------

def decks() -> dict[str, Any]:
    files = [p for r in PY_ROOTS for p in walk(r, (".py",)) if not is_test(p)]
    by_file = count_by_file(files, ALL_DECKS)
    return {"all_decks_total": sum(n for _, n in by_file), "all_decks_by_file": by_file}


# --- 8. tests --------------------------------------------------------------

def tests() -> dict[str, dict[str, int]]:
    py = [p for p in walk(Path("tests"), (".py",)) if p.name.startswith("test_")]
    areas = {
        "tests/": (py, PY_TEST_FN),
        "electron-frontend/src": ([p for p in walk(SRC, (".ts", ".tsx")) if ".test." in p.name], VITEST_FN),
        "electron-frontend/electron": ([p for p in walk(ELECTRON, (".ts", ".cjs", ".js")) if ".test." in p.name], VITEST_FN),
    }
    return {name: {"files": len(files), "tests": sum(len(rx.findall(read(p))) for p in files)}
            for name, (files, rx) in areas.items()}


# --- 9. records ------------------------------------------------------------

def plain(s: str) -> str:
    """Markdown and non-ASCII out, so a Windows console cannot mangle the answer."""
    s = re.sub(r"[*`~]", "", s)
    s = s.replace("—", "--").replace("–", "-").replace("→", "->")
    s = s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    return " ".join(s.encode("ascii", "replace").decode("ascii").split())


def section(text: str, heading: str) -> str:
    """The body of `heading` up to the next level-2 heading, or '' when absent."""
    start = text.find(heading + "\n")
    if start < 0:
        return ""
    nxt = re.compile(r"^## ", re.M).search(text, start + len(heading))
    return text[start:nxt.start() if nxt else len(text)]


def open_findings(text: str) -> list[tuple[str, str]]:
    """(id, first 80 chars) per §8 table row whose id cell is not struck with ~~."""
    out = []
    for ln in section(text, FINDINGS_HEADING).splitlines():
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if not ln.startswith("|") or len(cells) < 2:
            continue
        rid = cells[0]
        if rid.startswith("~~") or not re.search(r"\w", rid) or set(rid) <= set("-: "):
            continue
        out.append((rid, plain(cells[1])[:80]))
    return out


def open_triggers(text: str) -> list[tuple[int, str, str]]:
    """Every OPEN debt entry's triggers: (number, title, trigger text).

    Closed is a wholly struck heading/title or a heading containing the exact
    **CLOSED YYYY-MM-DD** marker; a partly struck title is still open.
    Triggers are not line-anchored -- one written
    mid-paragraph is as real as one at column zero.
    """
    heads = list(re.finditer(r"^## (.+)$", text, re.M))
    out: list[tuple[int, str, str]] = []
    for i, h in enumerate(heads):
        head = h.group(1).strip()
        struck = re.fullmatch(r"~~((?:(?!~~).)+)~~", head)
        num = re.match(r"(?:~~)?(\d+)\.\s*(.*)", struck.group(1) if struck else head)
        if not num:
            continue
        title = num.group(2).strip()
        if (struck or re.fullmatch(r"~~(?:(?!~~).)+~~", title)
                or re.search(r"\*\*CLOSED \d{4}-\d{2}-\d{2}\*\*", head)):
            continue
        body = text[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(text)]
        title = plain(title)
        for m in TRIGGER.finditer(body):
            raw = body[m.start():m.start() + 400].split("\n\n")[0]
            trig = re.sub(r"^(?:The\s+)?[Tt]rigger[:.]?\s*", "", plain(raw))
            out.append((int(num.group(1)), title, trig))
    return out


def records() -> dict[str, Any]:
    return {
        "architecture_open_findings": open_findings(read(ARCHITECTURE)),
        "debt_present": DEBT.is_file(),
        "debt_open_triggers": open_triggers(read(DEBT)) if DEBT.is_file() else [],
    }


# --- 10. TODO / FIXME / HACK ----------------------------------------------

def todos() -> dict[str, int]:
    exts = (".py", ".ts", ".tsx", ".cjs", ".js", ".css")
    return {posix(a): sum(len(TODO.findall(read(p))) for p in walk(a, exts)
                          if not is_auto_generated(p))
            for a in TODO_AREAS}


def collect(include_records: bool = False) -> dict[str, Any]:
    collectors = [header, largest_files, bridge, electron_main, network, renderer, decks, tests]
    if include_records:
        collectors.append(records)
    collectors.append(todos)
    data: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    read_errors: dict[str, dict[str, Any]] = {}
    partial: list[str] = []
    for collector in collectors:
        name = collector.__name__
        _READ_ERRORS.clear()
        result = collector()
        if name == "header":
            errors.extend(result.pop("errors"))
            if errors:
                partial.append(name)
        if _READ_ERRORS:
            partial.append(name)
            for path, reason in _READ_ERRORS.items():
                errors.append({"section": name, "path": path, "reason": reason})
                entry = read_errors.setdefault(path, {"path": path, "reason": reason, "sections": []})
                entry["sections"].append(name)
            # Counts based on incomplete input must never appear as a complete zero.
            result = None
        data[name] = result
    _READ_ERRORS.clear()
    data["errors"] = errors
    data["read_errors"] = {"count": len(read_errors), "files": list(read_errors.values())}
    data["partial_sections"] = partial
    return data


# --- report ----------------------------------------------------------------

def ranked(a: Any, rows: list[tuple[str, int]], top: int, indent: str = "      ") -> None:
    if not rows:
        a(f"{indent}none")
    for path, n in rows[:top]:
        a(f"{indent}{n:>5}  {path}")
    if len(rows) > top:
        a(f"{indent}  ... {len(rows) - top} more")


def report(d: dict[str, Any], top: int) -> str:
    L: list[str] = []
    a = L.append

    def unavailable(key: str, field: str | None = None) -> str:
        reasons = dict.fromkeys(e["reason"] for e in d["errors"]
                                if e["section"] == key and (field is None or field in e.get("fields", [])))
        return f"unavailable ({'; '.join(reasons)})"

    def shown(value: Any, key: str, field: str) -> str:
        return str(value) if value is not None else unavailable(key, field)

    def heading(key: str, title: str) -> bool:
        a(title + (" [partial]" if key in d["partial_sections"] else ""))
        if d[key] is None:
            a(f"  {unavailable(key)}")
            a("")
            return False
        return True

    h = d["header"]
    heading("header", "1. HEADER")
    subject = repr(plain(h["subject"])) if h["subject"] is not None else unavailable("header", "subject")
    a(f"JPLearn census - {shown(h['commit'], 'header', 'commit')} {subject} "
      f"on {shown(h['branch'], 'header', 'branch')}")
    a(f"Root: {Path.cwd().resolve()}")
    a(f"Working tree: {shown(h['uncommitted_tracked'], 'header', 'uncommitted_tracked')} uncommitted tracked, "
      f"{shown(h['untracked'], 'header', 'untracked')} untracked")
    a("Counts only. Nothing here is a finding; every number is somewhere to start reading.")
    a("")

    if heading("largest_files", f"2. LARGEST HAND-WRITTEN FILES (lines, top {top})  - first line '{AUTO_GENERATED}' skipped;"):
        a(f"   never descends into {', '.join(sorted(SKIP_DIRS))}")
        roots = {"python": "*.py under domain/ data/ scripts/", "ts_tsx": "electron-frontend/src *.ts(x), not src/generated",
                 "cjs": "electron-frontend/electron *.cjs", "css": "electron-frontend/src *.css"}
        for kind, rows in d["largest_files"].items():
            a(f"  {kind}  ({roots[kind]})")
            ranked(a, rows, top)
        a("")

    if heading("bridge", "3. PYTHON BRIDGE"):
        b = d["bridge"]
        a(f"  commands in {BRIDGE.as_posix()} _COMMAND_HANDLERS: {b['commands']}")
        a(f"  _connect( / shared_connection( call sites in data/ (defs excluded): {b['connect_sites_total']}")
        ranked(a, b["connect_sites_by_file"], top)
        a("")

    if heading("electron_main", "4. ELECTRON MAIN  (electron-frontend/electron *.cjs, tests excluded)"):
        e = d["electron_main"]
        a("  ipcMain.handle( per file:")
        ranked(a, e["ipc_handle_by_file"], top)
        cands = e["unvalidated_candidates"]
        with_input = [c["channel"] for c in cands if c["takes_input"]]
        no_input = [c["channel"] for c in cands if not c["takes_input"]]
        a(f"  unvalidated candidates in {IPC_HANDLERS.as_posix()}: {len(cands)}  - body names no imported")
        a("  ipc_security validate* function (assertTrustedIpcSender does not count)")
        a(f"    taking arguments beyond event ({len(with_input)}):")
        for i in range(0, len(with_input), 3):
            a("      " + "  ".join(f"{n:<36}" for n in with_input[i:i + 3]).rstrip())
        a(f"    event only ({len(no_input)}): listed in --json")
        a("  spawn( / execFile( / fork( (and *Sync) per file:")
        ranked(a, e["spawn_sites_by_file"], top)
        a("  .stdin.on('error' per file:")
        ranked(a, e["stdin_error_by_file"], top)
        a("")

    if heading("network", "5. NETWORK  (electron/, scripts/, data/, domain/, renderer src/ and index.html; tests excluded)"):
        a(f"  URL hosts /https?://host/ and calls /{NET_CALL.pattern}/")
        a(f"  renderer .ts/.tsx/.css/.html lines /{RENDERER_NET_CALL.pattern}/ (including src/generated)")
        if not d["network"]:
            a("      none")
        for path, hits in d["network"].items():
            a(f"  {path}")
            if hits["hosts"]:
                a(f"      hosts: {', '.join(hits['hosts'])}")
            for c in hits["calls"][:top]:
                a(f"      {c}")
            if len(hits["calls"]) > top:
                a(f"        ... {len(hits['calls']) - top} more calls")
        a("")

    if heading("renderer", f"6. RENDERER  (electron-frontend/src, tests and src/generated excluded)"):
        r = d["renderer"]
        a(f"  App.tsx: {r['app_tsx_lines']} lines, {r['app_tsx_use_state']} useState(")
        storage = r["local_storage_by_file"]
        a(f"  localStorage. call sites: {sum(len(v) for v in storage.values())} in {len(storage)} files")
        for path, sites in sorted(storage.items(), key=lambda kv: -len(kv[1]))[:top]:
            a(f"    {len(sites):>3}  {path}")
            for s in sorted(set(sites)):
                a(f"           {s}")
        for name, rows in r["loops_by_file"].items():
            a(f"  {name} per file (total {sum(n for _, n in rows)}):")
            ranked(a, rows, top)
        hexes = r["hex_colours_by_file"]
        a(f"  hex colour literals /{HEX_COLOUR.pattern}/ in .ts/.tsx/.css (total {sum(n for _, n in hexes)}):")
        ranked(a, hexes, top)
        radius = r["border_radius_nonzero_by_file"]
        a(f"  border-radius not 0 in src CSS (total {sum(n for _, n in radius)}):")
        ranked(a, radius, top)
        a("")

    if heading("decks", "7. DECKS  - ALL_DECKS[ outside tests in domain/ data/ scripts/"):
        k = d["decks"]
        a(f"  total: {k['all_decks_total']}")
        ranked(a, k["all_decks_by_file"], top)
        a("")

    if heading("tests", "8. TESTS  (pytest `def test_` in tests/test_*.py; vitest it(/test( in *.test.*)"):
        for area, t in d["tests"].items():
            a(f"  {area:<28} {t['files']:>4} files  {t['tests']:>5} tests")
        a("")

    if "records" in d:
        if heading("records", "9. RECORDS  - prior findings and debt triggers (--records)"):
            rec = d["records"]
            findings = rec["architecture_open_findings"]
            a(f"  {ARCHITECTURE.as_posix()} '{FINDINGS_HEADING}' rows whose id is not ~~struck~~: {len(findings)}")
            for rid, text in findings:
                a(f"  {plain(rid):>4}  {text}")
            if not rec["debt_present"]:
                a(f"  {DEBT.as_posix()}: absent")
            else:
                trig = rec["debt_open_triggers"]
                fired = [t for t in trig if "FIRED" in t[2]]
                a(f"  {DEBT.as_posix()}: {len(trig)} triggers in open entries, {len(fired)} marked FIRED")
                for num, title, text in sorted(trig, key=lambda t: "FIRED" not in t[2]):
                    a(f"  {num:>3}  {title[:66]}")
                    a(f"       -> {text[:150]}")
            a("")

    if heading("todos", f"10. TODO / FIXME / HACK  /{TODO.pattern}/"):
        for area, n in d["todos"].items():
            a(f"  {n:>5}  {area}")
        a("")
    a(f"Read errors: {d['read_errors']['count']} files; partial sections with unreadable input have counts withheld")
    for entry in d["read_errors"]["files"]:
        a(f"  {entry['path']}: {entry['reason']} (sections: {', '.join(entry['sections'])})")
    return "\n".join(L)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--records", action="store_true")
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args(argv)

    if not BRIDGE.is_file() or not FRONTEND.is_dir():
        print("Run from the repository root (scripts/desktop_bridge.py and "
              "electron-frontend/ must be here).", file=sys.stderr)
        return 1

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    data = collect(include_records=args.records)
    print(json.dumps(data, indent=2) if args.json else report(data, args.top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
