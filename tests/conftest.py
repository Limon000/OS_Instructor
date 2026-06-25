"""Test bootstrap — every test gets a fresh in-memory SQLite DB.

We point OS_INSTRUCTOR_DB_URL at a per-test file under tmp_path, apply
db/sqlite_schema.sql, seed visual_tag_specs, and rebuild the module-level
engine so production code (which imports `engine` once) sees the test DB.
"""

from __future__ import annotations

import importlib
import os
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_ROOT / "db" / "sqlite_schema.sql"


@pytest.fixture
def db(tmp_path, monkeypatch):
    """Fresh SQLite DB with the full schema applied. Returns the engine."""
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("OS_INSTRUCTOR_DB_URL", f"sqlite:///{db_file}")

    # Force the connection module to rebuild engine + SessionLocal against the test DB.
    import db.connection as conn_mod
    importlib.reload(conn_mod)

    conn_mod.run_schema_file(SCHEMA_PATH)

    # Re-import everything that depends on conn_mod so they pick up the new engine.
    import db.sessions_repo as sessions_repo
    import db.auth as auth
    import db.seed as seed
    importlib.reload(sessions_repo)
    importlib.reload(auth)
    importlib.reload(seed)

    seed.seed_visual_tags()
    yield conn_mod.engine
