"""Auth routes — thin FastAPI wrapper around db.auth functions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError

from db import auth as db_auth

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="student", pattern="^(student|instructor)$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user_id: str
    token: str
    role: str


class MeResponse(BaseModel):
    user_id: str
    role: str


# ---------------------------------------------------------------------------
# Dependency — extract Bearer token
# ---------------------------------------------------------------------------


def _get_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return creds.credentials


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest):
    try:
        user_id = db_auth.signup(
            email=body.email.lower().strip(),
            password=body.password,
            full_name=body.full_name.strip(),
            role=body.role,
        )
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Email already registered")

    result = db_auth.login(body.email.lower().strip(), body.password)
    if result is None:
        raise HTTPException(status_code=500, detail="Registration succeeded but login failed")
    _, raw_token = result
    return AuthResponse(user_id=user_id, token=raw_token, role=body.role)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    result = db_auth.login(body.email.lower().strip(), body.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_id, raw_token = result

    resolved = db_auth.resolve_token(raw_token)
    role = resolved[1] if resolved else "student"
    return AuthResponse(user_id=user_id, token=raw_token, role=role)


@router.get("/me", response_model=MeResponse)
def me(raw_token: str = Depends(_get_token)):
    resolved = db_auth.resolve_token(raw_token)
    if resolved is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id, role = resolved
    return MeResponse(user_id=user_id, role=role)


@router.post("/logout")
def logout(raw_token: str = Depends(_get_token)):
    db_auth.revoke_token(raw_token)
    return {"message": "Logged out"}
