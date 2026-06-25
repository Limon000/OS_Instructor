"""SQLAlchemy engine + per-connection pragma setup for SQLite.

The four pragmas applied to every new connection:
  * journal_mode = WAL     — concurrent readers + single writer
  * foreign_keys = ON      — SQLite's default is OFF (!)
  * synchronous  = NORMAL  — safe under WAL, much faster than FULL
  * busy_timeout = 5000    — wait up to 5s instead of failing on lock

Usage:
    from db.connection import engine, session_scope, run_schema_file

    with session_scope() as sess:
        sess.execute(text("INSERT INTO users ..."))

    # First-time setup on a fresh DB:
    run_schema_file(Path("db/sqlite_schema.sql"))
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "os_instructor.db"

DB_URL = os.environ.get("OS_INSTRUCTOR_DB_URL")


def _resolve_db_url() -> str:
    """Resolve the SQLAlchemy URL. Honors `OS_INSTRUCTOR_DB_URL` if set."""
    if DB_URL:
        return DB_URL
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_DB_PATH}"


def make_engine(url: str | None = None, *, echo: bool = False) -> Engine:
    """Build a SQLAlchemy engine and attach the connect-time pragma hook."""
    from sqlalchemy import create_engine

    eng = create_engine(
        url or _resolve_db_url(),
        echo=echo,
        future=True,
        # check_same_thread=False is required for Streamlit, which may share
        # the connection across reruns. Locking is handled by busy_timeout.
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(eng, "connect")
    def _set_pragmas(dbapi_conn, _conn_record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode = WAL;")
        cur.execute("PRAGMA foreign_keys = ON;")
        cur.execute("PRAGMA synchronous  = NORMAL;")
        cur.execute("PRAGMA busy_timeout = 5000;")
        cur.close()

    return eng


engine: Engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope around a series of operations."""
    sess = SessionLocal()
    try:
        yield sess
        sess.commit()
    except Exception:
        sess.rollback()
        raise
    finally:
        sess.close()


# ---------------------------------------------------------------------------
# Bootstrap utility
# ---------------------------------------------------------------------------


def run_schema_file(path: Path | str) -> None:
    """Execute a multi-statement SQL file against the engine.

    Used by tests and by the first-time bootstrap to apply
    `db/sqlite_schema.sql` outside of Alembic. Alembic itself calls
    this helper from its initial migration.
    """
    sql = Path(path).read_text(encoding="utf-8")
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.executescript(sql)
        raw.commit()
    finally:
        raw.close()


def healthcheck() -> bool:
    """Quick smoke check that the engine is wired and pragmas are set."""
    with engine.connect() as conn:
        fk_on = conn.execute(text("PRAGMA foreign_keys;")).scalar()
        jm = conn.execute(text("PRAGMA journal_mode;")).scalar()
    return bool(fk_on) and str(jm).lower() == "wal"
