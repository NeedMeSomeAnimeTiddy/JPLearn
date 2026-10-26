import sqlite3
from pathlib import Path

import pytest

from data import database


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
    with database._connect() as conn:
        conn.execute("CREATE TABLE t (v INTEGER)")


def _values(path: Path) -> list[int]:
    conn = sqlite3.connect(path)
    try:
        return [row[0] for row in conn.execute("SELECT v FROM t ORDER BY v")]
    finally:
        conn.close()


def test_reads_inside_the_block_reuse_one_connection(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    seen: list[sqlite3.Connection] = []
    with database.shared_connection():
        for _ in range(3):
            with database._connect() as conn:
                seen.append(conn)
        with database.shared_connection():  # nested: the outer connection, not a second one
            with database._connect() as conn:
                seen.append(conn)
    assert len({id(conn) for conn in seen}) == 1
    with pytest.raises(sqlite3.ProgrammingError):  # closed when the block ends
        seen[0].execute("SELECT 1")
    with database._connect() as conn:  # and outside it, a connection of its own again
        assert conn is not seen[0]


def test_an_exception_out_of_the_block_still_closes_and_clears_it(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    seen: list[sqlite3.Connection] = []
    with pytest.raises(RuntimeError):
        with database.shared_connection():
            with database._connect() as conn:
                seen.append(conn)
            raise RuntimeError("the burst fails")
    with pytest.raises(sqlite3.ProgrammingError):
        seen[0].execute("SELECT 1")
    with database._connect() as conn:
        assert conn is not seen[0]


def test_each_block_still_commits_and_rolls_back_on_its_own(tmp_path: Path, monkeypatch) -> None:
    _use_temp_db(tmp_path, monkeypatch)
    with database.shared_connection():
        with database._connect() as conn:
            conn.execute("INSERT INTO t VALUES (1)")
        # committed when its block ended, so another connection already sees it
        assert _values(database.DB_PATH) == [1]
        with pytest.raises(RuntimeError):
            with database._connect() as conn:
                conn.execute("INSERT INTO t VALUES (2)")
                raise RuntimeError("fails mid-write")
        with database._connect() as conn:
            conn.execute("INSERT INTO t VALUES (3)")
    assert _values(database.DB_PATH) == [1, 3]
