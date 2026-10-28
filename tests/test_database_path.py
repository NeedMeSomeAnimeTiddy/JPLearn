"""Where the live database comes from on a first launch (audit 10, F1)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from data import database


def _make_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE marker (x INTEGER)")
    conn.commit()
    conn.close()


def test_new_documents_folder_starts_empty_not_with_the_bundled_copy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A package (or the checkout) holding data/jplearn.db beside database.py: it must not be adopted.
    package_data = tmp_path / "resources" / "data"
    _make_db(package_data / "jplearn.db")
    monkeypatch.setattr(database, "__file__", str(package_data / "database.py"))
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    monkeypatch.setenv("JPLEARN_DOCUMENTS_DIR", str(tmp_path / "docs"))

    resolved = database._resolve_db_path()

    assert resolved == tmp_path / "docs" / "data" / "jplearn.db"
    assert not resolved.exists()


def test_database_at_the_former_documents_location_is_carried_over(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    home = tmp_path / "home"
    _make_db(home / "Documents" / "JPLearn" / "data" / "jplearn.db")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    monkeypatch.setenv("JPLEARN_DOCUMENTS_DIR", str(tmp_path / "docs"))

    resolved = database._resolve_db_path()

    assert resolved.exists()
    conn = sqlite3.connect(resolved)
    assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'marker'").fetchone()
    conn.close()
    assert "former location" in capsys.readouterr().err
