"""Auth helpers — password hashing, signup, login, role checks.

Kept framework-agnostic: every function takes plain arguments and returns
plain values so it can be wired into FastAPI dependencies, Streamlit's
session_state, or a CLI without modification.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import text

from db.connection import session_scope

_hasher = PasswordHasher()

VALID_ROLES = ("admin", "instructor", "student")

SESSION_TOKEN_TTL = timedelta(days=7)


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, stored_hash: str) -> bool:
    try:
        return _hasher.verify(stored_hash, plain)
    except VerifyMismatchError:
        return False


# ---------------------------------------------------------------------------
# Signup / login
# ---------------------------------------------------------------------------


def signup(*, email: str, password: str, full_name: str, role: str) -> str:
    """Create a user with the given role. Returns user_id."""
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES}")
    uid = uuid.uuid4().hex
    with session_scope() as sess:
        sess.execute(
            text(
                """
                INSERT INTO users (id, email, password_hash, full_name, role, status)
                VALUES (:id, :email, :pwd, :name, :role, 'active')
                """
            ),
            {
                "id": uid,
                "email": email,
                "pwd": hash_password(password),
                "name": full_name,
                "role": role,
            },
        )
        # Provision the role-specific 1:1 profile row.
        if role == "student":
            sess.execute(
                text("INSERT INTO student_profiles (user_id) VALUES (:id)"),
                {"id": uid},
            )
        elif role == "instructor":
            sess.execute(
                text("INSERT INTO instructor_profiles (user_id) VALUES (:id)"),
                {"id": uid},
            )
    return uid


def login(email: str, password: str) -> tuple[str, str] | None:
    """Verify creds, mint a token, persist its hash, return (user_id, raw_token).

    Returns None if creds are invalid.
    """
    with session_scope() as sess:
        row = sess.execute(
            text(
                """
                SELECT id, password_hash, status FROM users
                 WHERE email = :email AND deleted_at IS NULL
                """
            ),
            {"email": email},
        ).first()
        if row is None:
            return None
        user_id, stored_hash, status = row
        if status != "active":
            return None
        if not verify_password(password, stored_hash):
            return None

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires = (datetime.now(timezone.utc) + SESSION_TOKEN_TTL).isoformat()

        sess.execute(
            text(
                """
                INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
                VALUES (:id, :uid, :tok, :exp)
                """
            ),
            {"id": uuid.uuid4().hex, "uid": user_id, "tok": token_hash, "exp": expires},
        )
        sess.execute(
            text("UPDATE users SET last_login_at = :now WHERE id = :id"),
            {"id": user_id, "now": datetime.now(timezone.utc).isoformat()},
        )
    return user_id, raw_token


def resolve_token(raw_token: str) -> tuple[str, str] | None:
    """Validate a token, return (user_id, role) or None."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    with session_scope() as sess:
        row = sess.execute(
            text(
                """
                SELECT u.id, u.role
                  FROM auth_sessions s
                  JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = :h
                   AND s.revoked_at IS NULL
                   AND s.expires_at  > :now
                   AND u.deleted_at  IS NULL
                """
            ),
            {"h": token_hash, "now": datetime.now(timezone.utc).isoformat()},
        ).first()
    return (row[0], row[1]) if row else None


def revoke_token(raw_token: str) -> None:
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    with session_scope() as sess:
        sess.execute(
            text(
                """
                UPDATE auth_sessions
                   SET revoked_at = :now
                 WHERE token_hash = :h AND revoked_at IS NULL
                """
            ),
            {"h": token_hash, "now": datetime.now(timezone.utc).isoformat()},
        )


# ---------------------------------------------------------------------------
# Role guard
# ---------------------------------------------------------------------------


class AuthorizationError(Exception):
    """Raised when a user lacks the role required for an action."""


def require_role(actor_role: str, *allowed: str) -> None:
    if actor_role not in allowed:
        raise AuthorizationError(
            f"role '{actor_role}' is not permitted; need one of {allowed}"
        )
