"""Audit 13 (packaging, updates and upgrades): an interrupted upgrade from schema 14 finishes on
the next start (F5), and the tutor's downloaded files are found in the downloads folder (F4)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from data import database
from scripts import desktop_bridge, embedder_runtime


def test_an_upgrade_from_schema_14_cut_short_finishes_next_time(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn.db")
    conn = sqlite3.connect(database.DB_PATH)
    conn.row_factory = sqlite3.Row
    database._ensure_schema_version_table(conn)
    for version in range(1, 15):
        database.MIGRATIONS[version](conn)
        database._store_schema_version(conn, version)
    conn.commit()
    conn.close()

    def interrupted(_conn: sqlite3.Connection) -> None:
        raise RuntimeError("simulated interruption")

    original = database.MIGRATIONS[16]
    monkeypatch.setitem(database.MIGRATIONS, 16, interrupted)
    with pytest.raises(RuntimeError):
        database.init_db()
    monkeypatch.setitem(database.MIGRATIONS, 16, original)

    database.init_db()

    with sqlite3.connect(database.DB_PATH) as check:
        assert check.execute("SELECT version FROM schema_version").fetchone()[0] == database.LATEST_SCHEMA_VERSION


def test_the_tutor_tier_and_embedder_are_read_from_the_downloads_folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assets = tmp_path / "assets"
    progress = tmp_path / "progress"
    (assets / "models" / "embedders" / "e5_small").mkdir(parents=True)
    progress.mkdir()
    (assets / "models" / "active-model.json").write_text(json.dumps({"tier": "low"}), encoding="utf-8")
    monkeypatch.setenv("JPLEARN_ASSETS_DIR", str(assets))
    monkeypatch.setenv("JPLEARN_DOCUMENTS_DIR", str(progress))

    assert desktop_bridge._read_active_chatbot_tier() == "low"
    assert embedder_runtime._embedder_dir("e5_small") == assets / "models" / "embedders" / "e5_small"


def test_files_from_before_the_downloads_folder_are_still_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assets = tmp_path / "assets"
    progress = tmp_path / "progress"
    (progress / "models").mkdir(parents=True)
    assets.mkdir()
    (progress / "models" / "active-model.json").write_text(json.dumps({"tier": "medium"}), encoding="utf-8")
    monkeypatch.setenv("JPLEARN_ASSETS_DIR", str(assets))
    monkeypatch.setenv("JPLEARN_DOCUMENTS_DIR", str(progress))

    assert desktop_bridge._read_active_chatbot_tier() == "medium"


def test_downloaded_packages_are_added_after_the_bundles_own(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import sys

    folder = tmp_path / "embedder-packages"
    folder.mkdir()
    monkeypatch.setenv("JPLEARN_PYTHON_PACKAGES", str(folder))
    monkeypatch.setattr(sys, "path", list(sys.path))

    embedder_runtime.activate_downloaded_packages()

    assert sys.path[-1] == str(folder)
