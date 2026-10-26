"""Checks for census parsers, input failures, network scans and output shape.

The census lives outside any package, so it is imported by path.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO = Path(__file__).resolve().parents[1]
CENSUS_PATH = REPO / ".claude" / "audit" / "census.py"

SECTION_KEYS = {
    "header", "largest_files", "bridge", "electron_main", "network",
    "renderer", "decks", "tests", "todos", "errors", "read_errors", "partial_sections",
}


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("audit_census", CENSUS_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


census = _load()

ARCH = """\
## 7. Something else

| # | Finding | Issue |
|---|---|---|
| Z1 | Outside section 8, must not appear | none |

## 8. Findings

### Correctness

| # | Finding | Issue |
|---|---|---|
| ~~A1~~ | ~~Struck id, closed~~ -- fixed. | #63 |
| B2 | An **open** finding with `code` in it | none |
| D3 | ~~Struck text~~ but the id cell is not struck | #70 |

## 9. Candidate Work

| X1 | After section 8, must not appear | none |
"""

DEBT = """\
## 1. Colon spelling
**Trigger:** the colon one.

## 2. Period spelling
**Trigger.** the period one.

## 3. The trigger spelling
**The trigger: the article one** and more text.

## 4. Fired and still open
**Trigger - FIRED 2026-10-01:** the fired one.

## 5. Closed entry - **CLOSED 2026-10-02**
**Trigger:** must not appear.

## ~~6. Wholly struck~~
**Trigger:** must not appear.

## 7. Narrates a firing
**The trigger has not fired** -- history, not a condition.
"""


def test_open_findings_keeps_open_rows_only() -> None:
    rows = dict(census.open_findings(ARCH))
    assert set(rows) == {"B2", "D3"}
    assert rows["B2"].startswith("An open finding with code")


def test_open_findings_truncates_to_80_chars() -> None:
    long_row = ARCH.replace("An **open** finding", "x" * 200)
    assert len(dict(census.open_findings(long_row))["B2"]) == 80


def test_open_findings_without_section_is_empty() -> None:
    assert census.open_findings("# Nothing here\n") == []


def test_open_triggers_every_spelling_and_drops_closed() -> None:
    got = {num: trig for num, _, trig in census.open_triggers(DEBT)}
    assert sorted(got) == [1, 2, 3, 4]
    assert got[1].startswith("the colon one")
    assert got[2].startswith("the period one")
    assert got[3].startswith("the article one")
    assert "FIRED" in got[4]
    assert not any(t.lower().startswith(("trigger", "the trigger")) for t in got.values())


@pytest.mark.parametrize(("heading", "is_open"), [
    ("1. Unresolved lookup latency", True),
    ("1. Resolved name lookup", True),
    ("1. Closed caption support", True),
    ("1. Lookup latency - **CLOSED 2026-10-02**", False),
    ("1. Lookup latency - CLOSED 2026-10-02", True),
    ("1. Lookup latency - **CLOSED someday**", True),
    ("~~1. Lookup latency~~", False),
    ("1. ~~Lookup latency~~", False),
    ("1. ~~Lookup~~ latency", True),
    ("~~1. Lookup~~ latency", True),
    ("1. ~~Lookup~~ and ~~latency~~", True),
])
def test_open_triggers_only_explicit_closure(heading: str, is_open: bool) -> None:
    entries = census.open_triggers(f"## {heading}\n**Trigger:** lookup takes longer.\n")
    assert bool(entries) is is_open
    if is_open:
        assert entries[0][0] == 1


@pytest.fixture(params=["exit", "missing", "timeout", "sh"])
def unavailable_git(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> str:
    def fail_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if request.param == "missing":
            raise FileNotFoundError("git executable missing")
        if request.param == "timeout":
            raise subprocess.TimeoutExpired(cmd, 30)
        return subprocess.CompletedProcess(cmd, 128, stdout="misleading output", stderr="git fixture failed")

    def fail_sh(cmd: list[str]) -> str:
        raise OSError("git fixture failed")

    if request.param == "sh":
        monkeypatch.setattr(census, "sh", fail_sh)
    else:
        monkeypatch.setattr(census.subprocess, "run", fail_run)
    return str(request.param)


def test_unavailable_git_is_null_with_reasons_and_partial_header(
    unavailable_git: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(REPO)
    data = census.collect()
    assert set(data["header"].values()) == {None}
    assert len(data["errors"]) == 4
    assert all(e["section"] == "header" and e["reason"] and e["command"][0] == "git"
               for e in data["errors"])
    assert data["partial_sections"] == ["header"]
    assert json.loads(json.dumps(data))["header"]["untracked"] is None
    text = census.report(data, 2)
    assert "1. HEADER [partial]" in text
    assert "unavailable (" in text
    assert "JPLearn census - None" not in text
    assert "None untracked" not in text
    assert "0 untracked" not in text


def test_failed_git_status_preserves_available_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    def git(cmd: list[str]) -> str:
        if "status" in cmd:
            raise OSError("status unavailable")
        return "available"

    monkeypatch.setattr(census, "sh", git)
    h = census.header()
    assert h["commit"] == "available"
    assert h["uncommitted_tracked"] is None and h["untracked"] is None
    assert len(h["errors"]) == 1


@pytest.fixture(params=["read_text", "open"])
def unreadable_input(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = census.BRIDGE
    original = getattr(Path, request.param)

    def deny(path: Path, *args: object, **kwargs: object) -> object:
        if path == target:
            raise PermissionError("fixture denied reading")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, request.param, deny)
    return target


def test_unreadable_file_is_listed_once_and_sections_are_partial(
    unreadable_input: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(REPO)
    data = census.collect()
    assert data["read_errors"]["count"] == 1
    entry, = data["read_errors"]["files"]
    assert entry["path"] == unreadable_input.as_posix()
    assert "fixture denied reading" in entry["reason"]
    assert "bridge" in entry["sections"]
    assert all(data[s] is None and s in data["partial_sections"] for s in entry["sections"])
    assert any(e.get("path") == unreadable_input.as_posix() for e in data["errors"])
    text = census.report(data, 2)
    assert "3. PYTHON BRIDGE [partial]" in text
    assert "Read errors: 1 files" in text
    assert "commands in scripts/desktop_bridge.py _COMMAND_HANDLERS: 0" not in text


def test_network_additional_electron_patterns() -> None:
    text = "net.request(url)\nautoUpdater.checkForUpdates()\nrequire('update-electron-app')()\n"
    assert len(census.network_hits(text)["calls"]) == 3


def test_renderer_network_scan_groups_files_and_excludes_tests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources = {
        "src/client.tsx": "fetch('/local')\nnew XMLHttpRequest()\nnew WebSocket(url)\n"
                          "new EventSource(url)\nconst url = 'https://example.org/path'\n",
        "src/style.css": "body { background: url(https://example.org/bg.png); }\n",
        "src/page.html": '<script src="https://example.org/script.js"></script>\n',
        "src/generated/client.ts": "fetch('/generated')\n",
        "src/client.test.tsx": "fetch('https://excluded.test')\n",
        "src/tests/client.ts": "fetch('https://excluded.test')\n",
        "index.html": '<link href="https://example.org/style.css">\n',
    }
    for name, text in sources.items():
        path = tmp_path / "electron-frontend" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    hits = census.network()
    assert set(hits) == {f"electron-frontend/{name}" for name in sources if ".test." not in name and "/tests/" not in name}
    assert len(hits["electron-frontend/src/client.tsx"]["calls"]) == 5
    assert hits["electron-frontend/index.html"]["hosts"] == ["example.org"]
    assert not any("excluded.test" in h["hosts"] for h in hits.values())


def test_auto_generated_file_is_skipped(tmp_path: Path) -> None:
    generated = tmp_path / "gen.py"
    generated.write_text('"""Auto-generated external deck data."""\nX = 1\n', encoding="utf-8")
    written = tmp_path / "hand.py"
    written.write_text('"""Hand written."""\n# Auto-generated appears on line two only.\n', encoding="utf-8")
    assert census.is_auto_generated(generated)
    assert not census.is_auto_generated(written)


@pytest.mark.parametrize("include_records", [False, True])
def test_main_json_on_real_repo_has_requested_sections(
    include_records: bool, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.chdir(REPO)
    assert census.main(["--json", *(["--records"] if include_records else [])]) == 0
    data = json.loads(capsys.readouterr().out)
    assert isinstance(data, dict)
    assert SECTION_KEYS <= set(data)
    assert ("records" in data) is include_records
    assert data["bridge"]["commands"] > 0


def test_default_does_not_read_records_and_text_stays_neutral(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden_records() -> dict[str, object]:
        pytest.fail("default census must not read prior records")

    monkeypatch.chdir(REPO)
    monkeypatch.setattr(census, "records", forbidden_records)
    text = census.report(census.collect(), 2)
    assert "9. RECORDS" not in text
    assert "deck builders are uncached" not in text
    assert "python  (*.py under domain/ data/ scripts/)" in text


def test_records_text_is_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(REPO)
    assert "9. RECORDS" in census.report(census.collect(include_records=True), 2)
