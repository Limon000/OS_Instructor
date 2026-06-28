"""Profile repository — read/write user profile and related data.

Framework-agnostic, raw SQL via session_scope(). Follows the same pattern as
db/auth.py and db/sessions_repo.py.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text

from db.auth import hash_password, verify_password
from db.connection import session_scope


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Profile read / write
# ---------------------------------------------------------------------------


def get_profile(user_id: str) -> dict | None:
    """Return full profile row, joining users + user_profiles + student_profiles.

    Returns None if the user does not exist.
    """
    with session_scope() as sess:
        row = sess.execute(
            text(
                """
                SELECT
                    u.id,
                    u.email,
                    u.full_name,
                    u.role,
                    u.status,
                    u.created_at,
                    u.last_login_at,
                    up.avatar_url,
                    up.bio,
                    up.timezone,
                    up.preferred_lang,
                    sp.proficiency_level,
                    sp.daily_streak,
                    sp.longest_streak,
                    sp.total_minutes_spent,
                    sp.last_active_day
                FROM users u
                LEFT JOIN user_profiles up ON up.user_id = u.id
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.id = :uid AND u.deleted_at IS NULL
                """
            ),
            {"uid": user_id},
        ).first()
    if row is None:
        return None
    keys = [
        "id", "email", "full_name", "role", "status", "created_at", "last_login_at",
        "avatar_url", "bio", "timezone", "preferred_lang",
        "proficiency_level", "daily_streak", "longest_streak",
        "total_minutes_spent", "last_active_day",
    ]
    return dict(zip(keys, row))


def upsert_user_profile(user_id: str, **fields) -> None:
    """Update editable profile fields.

    full_name → users table; bio/avatar_url/timezone/preferred_lang → user_profiles.
    """
    full_name = fields.pop("full_name", None)
    allowed = {"bio", "avatar_url", "timezone", "preferred_lang"}
    safe = {k: v for k, v in fields.items() if k in allowed}

    with session_scope() as sess:
        if full_name is not None:
            sess.execute(
                text("UPDATE users SET full_name = :n, updated_at = :now WHERE id = :uid"),
                {"n": full_name, "now": _utcnow(), "uid": user_id},
            )
        if safe:
            cols = ", ".join(safe)
            placeholders = ", ".join(f":{k}" for k in safe)
            set_clause = ", ".join(f"{k} = :{k}" for k in safe)
            sess.execute(
                text(
                    f"""
                    INSERT INTO user_profiles (user_id, {cols})
                    VALUES (:user_id, {placeholders})
                    ON CONFLICT(user_id) DO UPDATE SET {set_clause}
                    """
                ),
                {"user_id": user_id, **safe},
            )


def change_password(user_id: str, old_plain: str, new_plain: str) -> bool:
    """Verify old password then update to new hash. Returns False on mismatch."""
    with session_scope() as sess:
        row = sess.execute(
            text("SELECT password_hash FROM users WHERE id = :uid AND deleted_at IS NULL"),
            {"uid": user_id},
        ).first()
        if row is None or not verify_password(old_plain, row[0]):
            return False
        sess.execute(
            text("UPDATE users SET password_hash = :h, updated_at = :now WHERE id = :uid"),
            {"h": hash_password(new_plain), "now": _utcnow(), "uid": user_id},
        )
    return True


# ---------------------------------------------------------------------------
# Activity
# ---------------------------------------------------------------------------


def get_activity(user_id: str, days: int = 30) -> list[dict]:
    """Return the last `days` rows from daily_student_activity, newest first."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT day, messages_sent, topics_visited, quiz_attempts, time_spent_minutes
                FROM daily_student_activity
                WHERE student_id = :uid
                ORDER BY day DESC
                LIMIT :days
                """
            ),
            {"uid": user_id, "days": days},
        ).all()
    return [
        {
            "day": r[0],
            "messages_sent": r[1] or 0,
            "topics_visited": r[2] or 0,
            "quiz_attempts": r[3] or 0,
            "time_spent_minutes": r[4] or 0,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Enrollments & progress
# ---------------------------------------------------------------------------


def get_enrollments_progress(user_id: str) -> list[dict]:
    """Return enrollments with per-enrollment completed/total topic counts."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT
                    e.id AS enrollment_id,
                    e.mode,
                    e.status,
                    COALESCE(e.progress_pct, 0) AS progress_pct,
                    e.current_topic_id,
                    (
                        SELECT COUNT(*)
                        FROM topic_progress tp
                        JOIN topics t ON t.id = tp.topic_id
                        JOIN modules m ON m.id = t.module_id
                        WHERE tp.student_id = e.student_id
                          AND m.course_id = e.course_id
                          AND tp.status IN ('completed', 'mastered')
                    ) AS completed_topics,
                    (
                        SELECT COUNT(*)
                        FROM topics t
                        JOIN modules m ON m.id = t.module_id
                        WHERE m.course_id = e.course_id
                    ) AS total_topics
                FROM enrollments e
                WHERE e.student_id = :uid
                ORDER BY e.enrolled_at DESC
                """
            ),
            {"uid": user_id},
        ).all()
    return [
        {
            "enrollment_id": r[0],
            "mode": r[1],
            "status": r[2],
            "progress_pct": r[3],
            "current_topic_id": r[4],
            "completed_topics": r[5] or 0,
            "total_topics": r[6] or 0,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Assessment history
# ---------------------------------------------------------------------------


def get_assessment_history(user_id: str) -> list[dict]:
    """Return all assessment attempts for a student, newest first."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT
                    a.id,
                    asmt.kind,
                    a.outcome,
                    a.score_pct,
                    a.passed,
                    a.started_at
                FROM attempts a
                JOIN assessments asmt ON asmt.id = a.assessment_id
                WHERE a.student_id = :uid
                ORDER BY a.started_at DESC
                """
            ),
            {"uid": user_id},
        ).all()
    return [
        {
            "attempt_id": r[0],
            "kind": r[1],
            "outcome": r[2],
            "score_pct": r[3],
            "passed": bool(r[4]),
            "started_at": r[5],
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Auth sessions
# ---------------------------------------------------------------------------


def get_auth_sessions(user_id: str, current_token_hash: str | None = None) -> list[dict]:
    """Return all active (non-revoked, non-expired) auth sessions for a user."""
    now = _utcnow()
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT id, created_at, expires_at, token_hash
                FROM auth_sessions
                WHERE user_id = :uid
                  AND revoked_at IS NULL
                  AND expires_at > :now
                ORDER BY created_at DESC
                """
            ),
            {"uid": user_id, "now": now},
        ).all()
    return [
        {
            "session_id": r[0],
            "created_at": r[1],
            "expires_at": r[2],
            "is_current": (r[3] == current_token_hash) if current_token_hash else False,
        }
        for r in rows
    ]


def revoke_session(user_id: str, session_id: str) -> bool:
    """Revoke a specific auth session (only if it belongs to user_id).

    Returns False if not found or not owned by this user.
    """
    with session_scope() as sess:
        res = sess.execute(
            text(
                """
                UPDATE auth_sessions
                   SET revoked_at = :now
                 WHERE id = :sid
                   AND user_id = :uid
                   AND revoked_at IS NULL
                """
            ),
            {"now": _utcnow(), "sid": session_id, "uid": user_id},
        )
        return (res.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Instructor profile
# ---------------------------------------------------------------------------


def get_instructor_profile(user_id: str) -> dict | None:
    """Return instructor_profiles row for a user, or None if not found."""
    with session_scope() as sess:
        row = sess.execute(
            text(
                """
                SELECT title, years_experience, expertise_areas, bio_long, updated_at
                FROM instructor_profiles
                WHERE user_id = :uid
                """
            ),
            {"uid": user_id},
        ).first()
    if row is None:
        return None
    return {
        "title": row[0],
        "years_experience": row[1],
        "expertise_areas": row[2],
        "bio_long": row[3],
        "updated_at": row[4],
    }


def upsert_instructor_profile(user_id: str, **fields) -> None:
    """Update editable instructor_profiles fields.

    Accepted keys: title, years_experience, expertise_areas, bio_long.
    expertise_areas must be a JSON-encoded string when passed in.
    """
    # Security: explicit allowlist guards column-name interpolation below.
    allowed = {"title", "years_experience", "expertise_areas", "bio_long"}
    safe = {k: v for k, v in fields.items() if k in allowed}
    if not safe:
        return
    cols = ", ".join(safe)
    placeholders = ", ".join(f":{k}" for k in safe)
    set_clause = ", ".join(f"{k} = :{k}" for k in safe)
    with session_scope() as sess:
        sess.execute(
            text(
                f"""
                INSERT INTO instructor_profiles (user_id, {cols})
                VALUES (:user_id, {placeholders})
                ON CONFLICT(user_id) DO UPDATE SET {set_clause}
                """
            ),
            {"user_id": user_id, **safe},
        )


def get_instructor_courses(user_id: str) -> list[dict]:
    """Return all courses created by an instructor with enrollment and module counts."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT
                    c.id,
                    c.slug,
                    c.title,
                    c.description,
                    c.is_published,
                    c.published_at,
                    c.created_at,
                    (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count,
                    (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count
                FROM courses c
                WHERE c.created_by = :uid
                ORDER BY c.created_at DESC
                """
            ),
            {"uid": user_id},
        ).all()
    return [
        {
            "course_id": r[0],
            "slug": r[1],
            "title": r[2],
            "description": r[3],
            "is_published": bool(r[4]),
            "published_at": r[5],
            "created_at": r[6],
            "enrollment_count": r[7] or 0,
            "module_count": r[8] or 0,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Admin stats & management
# ---------------------------------------------------------------------------


def get_admin_stats() -> dict:
    """Return platform-wide aggregate stats for the admin dashboard."""
    now = _utcnow()
    today = now[:10]
    with session_scope() as sess:
        role_rows = sess.execute(
            text(
                """
                SELECT role, COUNT(*) AS cnt
                FROM users
                WHERE deleted_at IS NULL
                GROUP BY role
                """
            )
        ).all()
        total_enrollments = sess.execute(
            text("SELECT COUNT(*) FROM enrollments")
        ).scalar_one()
        active_sessions = sess.execute(
            text(
                "SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > :now"
            ),
            {"now": now},
        ).scalar_one()
        messages_today = sess.execute(
            text(
                "SELECT COALESCE(SUM(messages_sent), 0) FROM daily_student_activity WHERE day = :today"
            ),
            {"today": today},
        ).scalar_one()

    users_by_role = {r[0]: r[1] for r in role_rows}
    return {
        "total_students": users_by_role.get("student", 0),
        "total_instructors": users_by_role.get("instructor", 0),
        "total_admins": users_by_role.get("admin", 0),
        "total_users": sum(users_by_role.values()),
        "total_enrollments": total_enrollments or 0,
        "active_sessions": active_sessions or 0,
        "messages_today": messages_today or 0,
    }


def get_recent_users(limit: int = 20) -> list[dict]:
    """Return the most recently registered users."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT id, email, full_name, role, status, created_at, last_login_at
                FROM users
                WHERE deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).all()
    return [
        {
            "user_id": r[0],
            "email": r[1],
            "full_name": r[2],
            "role": r[3],
            "status": r[4],
            "created_at": r[5],
            "last_login_at": r[6],
        }
        for r in rows
    ]


def get_recent_audit(limit: int = 50) -> list[dict]:
    """Return recent audit log entries with actor name resolved."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT
                    al.id,
                    al.actor_user_id,
                    u.full_name  AS actor_name,
                    al.action,
                    al.target_table,
                    al.target_id,
                    al.ip_address,
                    al.created_at
                FROM audit_log al
                LEFT JOIN users u ON u.id = al.actor_user_id
                ORDER BY al.created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).all()
    return [
        {
            "log_id": r[0],
            "actor_user_id": r[1],
            "actor_name": r[2],
            "action": r[3],
            "target_table": r[4],
            "target_id": r[5],
            "ip_address": r[6],
            "created_at": r[7],
        }
        for r in rows
    ]
