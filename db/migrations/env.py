"""Alembic environment for OS_Instructor."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from db.connection import engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# We don't use SQLAlchemy autogenerate because the schema is owned by raw SQL
# (db/sqlite_schema.sql). target_metadata stays None.
target_metadata = None


def run_migrations_offline() -> None:
    url = str(engine.url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
