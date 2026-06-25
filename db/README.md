# OS_Instructor — SQLite Database

This directory contains the SQLite implementation of the schema specified in
`DATABASE_DESIGN.md`. The Postgres DDL (`schema.sql`) remains the design source
of truth; `sqlite_schema.sql` is the runnable port for local + production use.

## Layout

```
db/
├── sqlite_schema.sql         # raw DDL — 25 tables, 12 role-guard triggers
├── schema.sql                # Postgres reference (design source of truth)
├── DATABASE_DESIGN.md        # rationale, ER diagram, role matrix, retention
├── connection.py             # SQLAlchemy engine + per-connection pragmas
├── seed.py                   # visual_tag_specs + parse instructor.md
├── sessions_repo.py          # replaces progress.json (start/finish/abandon, append_message)
├── auth.py                   # argon2 hashing, signup, login, token resolve
├── backup.sh                 # nightly hot backup via sqlite3 .backup
├── migrations/
│   ├── env.py                # Alembic env (uses db.connection.engine)
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial_schema.py
└── README.md                 # this file
```

## First-time bootstrap

```bash
pip install -r requirements.txt
alembic upgrade head           # applies db/sqlite_schema.sql to data/os_instructor.db
python -m db.seed              # seeds visual_tag_specs + courses/modules/topics
```

The default DB file is `data/os_instructor.db` (created on demand). Override
with `OS_INSTRUCTOR_DB_URL=sqlite:////absolute/path.db`.

## Required SQLite pragmas

Set automatically by `db/connection.py` on every new connection. Document them
here so reviewers do not have to dig:

| Pragma | Value | Why |
|---|---|---|
| `journal_mode` | `WAL` | Concurrent readers + single writer; survives crashes |
| `foreign_keys` | `ON` | SQLite ships with FKs **off** — the role guards rely on these |
| `synchronous` | `NORMAL` | Safe under WAL; ~3× faster than `FULL` |
| `busy_timeout` | `5000` | Wait up to 5s on a write lock instead of failing |

## How the app uses the DB

| Concern | Module |
|---|---|
| Open a connection / scope a transaction | `from db.connection import session_scope` |
| Create / finish / abandon a session | `db.sessions_repo` |
| Append a message (auto-extracts `[VISUAL:...]` tags) | `db.sessions_repo.append_message` |
| Sign up / log in a user | `db.auth.signup`, `db.auth.login` |
| Resolve a bearer token to `(user_id, role)` | `db.auth.resolve_token` |
| Idempotent seeding from `instructor.md` | `python -m db.seed` |

## Replacing progress.json

The flat JSON file is replaced by the `sessions` + `messages` pair. The two
sidebar buttons in `app.py` map cleanly:

```python
# 💾 Finish Session
from db.sessions_repo import finish_session
finish_session(st.session_state["session_id"])

# 🔄 Start New Session
from db.sessions_repo import abandon_active_sessions, start_session
abandon_active_sessions(student_id)
st.session_state["session_id"] = start_session(student_id)
```

For users who already have a `progress.json`, run the one-shot importer:

```python
from db.sessions_repo import import_legacy_progress_json
import_legacy_progress_json(student_id, Path("progress.json"))
```

## Tests

```bash
pytest tests/test_db_schema.py -v
```

The suite covers: pragmas, the 4 role-guard triggers, the
exactly-one-scope CHECK on `assessments`, the session lifecycle, visual-tag
auto-persistence, the full auth flow, and the `instructor.md` course seeder.

## Backups & retention

`db/backup.sh` produces an atomic hot copy via `sqlite3 .backup`, keeps 7 days
on disk, and is safe to run while the app is live. Cron example:

```
0 3 * * * /path/to/OS_Instructor/db/backup.sh >> /var/log/os_instructor_backup.log 2>&1
```

Retention policies (auth tokens, abandoned sessions, soft-deleted users) are
specified in `DATABASE_DESIGN.md` §7 and should be enforced by a separate
nightly job.

## SQLite's load ceiling

SQLite serialises writes via the WAL — fine for a single-instance Streamlit
deployment but limiting if you ever run multiple Uvicorn workers writing
concurrently. The migration path to Postgres is short because:

* `db/schema.sql` is already the Postgres-flavoured DDL.
* The SQLAlchemy abstractions in `db/connection.py` and the repos use plain
  SQL with `text()` — dialect-agnostic.
* The role-guard logic is mirrored in both DDL files.

When the time comes, flip `OS_INSTRUCTOR_DB_URL` to a Postgres URL, run
`alembic upgrade head` against a fresh database that applies `schema.sql`
instead of `sqlite_schema.sql`, and re-seed.
