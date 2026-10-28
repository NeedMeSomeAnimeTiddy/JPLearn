"""The bridge's whole-database commands (audit 10, F3 and the design critic's M4)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from data import database
from data.fsrs_optimization import reset_saved_weights, save_weights
from domain.scheduler import get_weights, reset_weights
from scripts import desktop_bridge


@pytest.fixture(autouse=True)
def _schema_and_default_weights():
    database.init_db()
    reset_weights()
    yield
    reset_weights()


def test_restore_activates_the_backups_scheduling_weights(tmp_path: Path) -> None:
    custom = tuple(round(0.1 * (i + 1), 6) for i in range(17))
    save_weights(custom)
    target = tmp_path / "backup.db"
    code, payload = desktop_bridge._cmd_database_backup(["database-backup", str(target), json.dumps({"k": "v"})])
    assert code == 0 and payload["cards"] == 0

    reset_saved_weights()
    reset_weights()
    assert get_weights() != custom

    code, payload = desktop_bridge._cmd_database_restore(["database-restore", str(target)])

    assert code == 0, payload
    assert payload["weights_reloaded"] is True
    assert payload["window_state"] == {"k": "v"}
    assert get_weights() == custom


def test_inspect_commands_refuse_with_a_reason(tmp_path: Path) -> None:
    junk = tmp_path / "junk.json"
    junk.write_text("[1, 2, 3]", encoding="utf-8")
    code, payload = desktop_bridge._cmd_analytics_inspect_json(["analytics-inspect-json", str(junk)])
    assert code == 2 and "not a progress file" in str(payload["error"])

    code, payload = desktop_bridge._cmd_database_inspect(["database-inspect", str(junk)])
    assert code == 2 and "not a backup" in str(payload["error"])


def test_window_settings_must_be_an_object(tmp_path: Path) -> None:
    code, payload = desktop_bridge._cmd_database_backup(["database-backup", str(tmp_path / "b.db"), "[1]"])
    assert code == 2 and "JSON object" in str(payload["error"])
