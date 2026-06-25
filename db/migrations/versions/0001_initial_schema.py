"""Initial schema — applies db/sqlite_schema.sql.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-25
"""

from __future__ import annotations

from pathlib import Path

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "sqlite_schema.sql"


def upgrade() -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn = op.get_bind().connection
    cur = conn.cursor()
    cur.executescript(sql)
    cur.close()


def downgrade() -> None:
    # 25-table teardown — drop in reverse dependency order.
    tables = [
        "topic_difficulty_stats", "daily_student_activity", "feature_flags",
        "audit_log", "diagnostic_interviews",
        "off_topic_events", "message_visuals", "messages", "sessions",
        "attempt_answers", "attempts", "question_options", "questions",
        "module_progress", "topic_progress", "learning_path_items",
        "assessments", "learning_paths", "enrollments",
        "topic_resources", "topics", "visual_tag_specs", "modules", "courses",
        "instructor_profiles", "student_profiles",
        "password_resets", "auth_sessions", "user_profiles", "users",
    ]
    conn = op.get_bind().connection
    cur = conn.cursor()
    for t in tables:
        cur.execute(f"DROP TABLE IF EXISTS {t};")
    cur.close()
