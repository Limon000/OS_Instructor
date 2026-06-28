"""Profile routes — view and edit the current user's profile and related data."""

from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from db import auth as db_auth
from db import profile_repo

router = APIRouter(prefix="/profile", tags=["profile"])
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Auth dependency (same pattern as auth.py)
# ---------------------------------------------------------------------------


def _get_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return creds.credentials


def _resolve(raw_token: str = Depends(_get_token)) -> tuple[str, str]:
    result = db_auth.resolve_token(raw_token)
    if result is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return result  # (user_id, role)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ProfileOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    status: str
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None
    preferred_lang: Optional[str] = None
    proficiency_level: Optional[str] = None
    daily_streak: int = 0
    longest_streak: int = 0
    total_minutes_spent: int = 0
    last_active_day: Optional[str] = None


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=120)
    bio: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)
    timezone: Optional[str] = Field(None, max_length=64)
    preferred_lang: Optional[str] = Field(None, max_length=16)


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ActivityDay(BaseModel):
    day: str
    messages_sent: int = 0
    topics_visited: int = 0
    quiz_attempts: int = 0
    time_spent_minutes: int = 0


class EnrollmentOut(BaseModel):
    enrollment_id: str
    mode: str
    status: str
    progress_pct: float = 0.0
    current_topic_id: Optional[str] = None
    completed_topics: int = 0
    total_topics: int = 0


class AssessmentAttemptOut(BaseModel):
    attempt_id: str
    kind: str
    outcome: str
    score_pct: Optional[float] = None
    passed: bool = False
    started_at: Optional[str] = None


class SessionOut(BaseModel):
    session_id: str
    created_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_current: bool = False


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _row_to_profile(row: dict) -> ProfileOut:
    return ProfileOut(
        user_id=row["id"],
        email=row["email"],
        full_name=row["full_name"],
        role=row["role"],
        status=row["status"],
        created_at=row.get("created_at"),
        last_login_at=row.get("last_login_at"),
        avatar_url=row.get("avatar_url"),
        bio=row.get("bio"),
        timezone=row.get("timezone"),
        preferred_lang=row.get("preferred_lang"),
        proficiency_level=row.get("proficiency_level"),
        daily_streak=row.get("daily_streak") or 0,
        longest_streak=row.get("longest_streak") or 0,
        total_minutes_spent=row.get("total_minutes_spent") or 0,
        last_active_day=row.get("last_active_day"),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=ProfileOut)
def get_profile(identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    row = profile_repo.get_profile(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_profile(row)


@router.patch("", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    updates = body.model_dump(exclude_none=True)
    if updates:
        profile_repo.upsert_user_profile(user_id, **updates)
    row = profile_repo.get_profile(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_profile(row)


@router.post("/change-password")
def change_password(body: PasswordChangeRequest, identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    ok = profile_repo.change_password(user_id, body.old_password, body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return {"message": "Password updated"}


@router.get("/activity", response_model=list[ActivityDay])
def get_activity(identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    return profile_repo.get_activity(user_id, days=30)


@router.get("/progress", response_model=list[EnrollmentOut])
def get_progress(identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    return profile_repo.get_enrollments_progress(user_id)


@router.get("/assessments", response_model=list[AssessmentAttemptOut])
def get_assessments(identity: tuple[str, str] = Depends(_resolve)):
    user_id, _ = identity
    return profile_repo.get_assessment_history(user_id)


@router.get("/sessions", response_model=list[SessionOut])
def get_sessions(
    raw_token: str = Depends(_get_token),
    identity: tuple[str, str] = Depends(_resolve),
):
    user_id, _ = identity
    current_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return profile_repo.get_auth_sessions(user_id, current_token_hash=current_hash)


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str = Path(...),
    raw_token: str = Depends(_get_token),
    identity: tuple[str, str] = Depends(_resolve),
):
    user_id, _ = identity
    current_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    sessions = profile_repo.get_auth_sessions(user_id, current_token_hash=current_hash)
    for s in sessions:
        if s["session_id"] == session_id and s["is_current"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot revoke your current session — use /api/auth/logout instead",
            )
    ok = profile_repo.revoke_session(user_id, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session revoked"}


# ---------------------------------------------------------------------------
# Instructor-specific routes
# ---------------------------------------------------------------------------


class InstructorProfileOut(BaseModel):
    title: Optional[str] = None
    years_experience: Optional[int] = None
    expertise_areas: Optional[str] = None
    bio_long: Optional[str] = None


class InstructorUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=120)
    years_experience: Optional[int] = Field(None, ge=0, le=80)
    expertise_areas: Optional[str] = Field(None, max_length=1000)
    bio_long: Optional[str] = Field(None, max_length=2000)


class CourseOut(BaseModel):
    course_id: str
    slug: str
    title: str
    description: Optional[str] = None
    is_published: bool
    published_at: Optional[str] = None
    created_at: Optional[str] = None
    enrollment_count: int = 0
    module_count: int = 0


@router.get("/instructor", response_model=InstructorProfileOut)
def get_instructor_profile(identity: tuple[str, str] = Depends(_resolve)):
    user_id, role = identity
    if role != "instructor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor access only")
    row = profile_repo.get_instructor_profile(user_id)
    return InstructorProfileOut(**(row or {}))


@router.patch("/instructor", response_model=InstructorProfileOut)
def update_instructor_profile(body: InstructorUpdate, identity: tuple[str, str] = Depends(_resolve)):
    user_id, role = identity
    if role != "instructor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor access only")
    updates = body.model_dump(exclude_none=True)
    if updates:
        profile_repo.upsert_instructor_profile(user_id, **updates)
    row = profile_repo.get_instructor_profile(user_id)
    return InstructorProfileOut(**(row or {}))


@router.get("/instructor/courses", response_model=list[CourseOut])
def get_instructor_courses(identity: tuple[str, str] = Depends(_resolve)):
    user_id, role = identity
    if role != "instructor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor access only")
    return profile_repo.get_instructor_courses(user_id)


# ---------------------------------------------------------------------------
# Admin-specific routes
# ---------------------------------------------------------------------------


class AdminStats(BaseModel):
    total_students: int
    total_instructors: int
    total_admins: int
    total_users: int
    total_enrollments: int
    active_sessions: int
    messages_today: int


class AdminUserOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    status: str
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


class AuditEntryOut(BaseModel):
    log_id: int
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = None
    action: str
    target_table: Optional[str] = None
    target_id: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[str] = None


def _require_admin(identity: tuple[str, str] = Depends(_resolve)) -> tuple[str, str]:
    _, role = identity
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access only")
    return identity


@router.get("/admin/stats", response_model=AdminStats)
def get_admin_stats(identity: tuple[str, str] = Depends(_require_admin)):
    return profile_repo.get_admin_stats()


@router.get("/admin/users", response_model=list[AdminUserOut])
def get_admin_users(identity: tuple[str, str] = Depends(_require_admin)):
    return profile_repo.get_recent_users(limit=50)


@router.get("/admin/audit", response_model=list[AuditEntryOut])
def get_admin_audit(identity: tuple[str, str] = Depends(_require_admin)):
    return profile_repo.get_recent_audit(limit=50)
