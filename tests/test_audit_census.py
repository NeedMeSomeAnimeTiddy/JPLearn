"""Checks for `.claude/audit/census.py`'s record parsers and its --json shape.

The census lives outside any package, so it is imported by path.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO = Path(__file__).resolve().parents[1]
CENSUS_PATH = REPO / ".claude" / "audit" / "census.py"

SECTION_KEYS = {
    "header", "largest_files", "bridge", "electron_main", "network",
    "renderer", "decks", "tests", "records", "todos",
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


def test_auto_generated_file_is_skipped(tmp_path: Path) -> None:
    generated = tmp_path / "gen.py"
    generated.write_text('"""Auto-generated external deck data."""\nX = 1\n', encoding="utf-8")
    written = tmp_path / "hand.py"
    written.write_text('"""Hand written."""\n# Auto-generated appears on line two only.\n', encoding="utf-8")
    assert census.is_auto_generated(generated)
    assert not census.is_auto_generated(written)


def test_main_json_on_real_repo_has_every_section(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.chdir(REPO)
    assert census.main(["--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert isinstance(data, dict)
    assert SECTION_KEYS <= set(data)
    assert data["bridge"]["commands"] > 0
