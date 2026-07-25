"""Shared pytest fixtures for the JPLearn suite.

Database isolation is opt-out rather than opt-in: every test gets
``data.database.DB_PATH`` re-pointed at its own ``tmp_path``, so a test that
forgets the ``_use_temp_db`` idiom cannot fall through to the real development
database at ``data/jplearn.db``.

This works for every write path because ``database._connect()`` reads the
module-global ``DB_PATH`` at call time, and the indirect callers resolve it the
same way: ``desktop_bridge.init_study_db`` -> ``study_pipeline.init_study_db``
-> ``database.init_db()`` -> ``_connect()``, while ``deck_portability`` and
``debug_tools`` use ``database.DB_PATH`` attribute access. None of them capture
the path at import time.

The fixture deliberately re-points ``DB_PATH`` only and does not call
``init_db()``: ``tests/test_database_migrations.py`` builds databases at
specific older schema versions and asserts on migration behaviour, so handing
it a pre-migrated database would break it. Tests that need tables already
create them themselves.

Note that a fixture cannot protect against a module-level database access in
code the suite imports, since collection imports test modules before any
fixture runs -- such access has to be made lazy at the source instead (see
``desktop_bridge._apply_persisted_fsrs_weights``).
"""

import pytest

from data import database


@pytest.fixture(autouse=True)
def _isolate_db_path(tmp_path, monkeypatch):
    """Point the study database at a per-test temp file."""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test.db")
