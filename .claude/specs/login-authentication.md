# Spec: Login Authentication

## Overview
Add user registration and login to OS_Instructor. The platform currently identifies sessions by browser-generated UUID stored in sessionStorage — no user accounts exist. This feature adds a SQLite-backed user table, JWT-based auth, protected routes on the frontend, and a polished login/register UI that matches the existing design system.

The existing session flow (UUID → JSON file) is preserved unchanged. Auth is a layer on top: once logged in, users continue to get a session UUID for the current chat session.

---

## Backend

### Dependencies (`backend/requirements.txt`)
Add:
```
sqlalchemy>=2.0.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
email-validator>=2.0
```
(`python-multipart` is already present — keep it.)

---

### Database (`backend/database.py`) — new file
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./sessions/users.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

### User ORM Model (`backend/models_db.py`) — new file
```python
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

> **Why lambda?** `default=datetime.now(timezone.utc)` would call it once at import time. The lambda is evaluated per-row. `datetime.utcnow()` is deprecated in Python 3.12 and removed in 3.13.

---

### Pydantic Auth Schemas (`backend/models.py`) — extend existing file
Add to imports: `from pydantic import EmailStr, Field` and `from datetime import datetime`

```python
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime

    class Config:
        from_attributes = True
```

> **Why `min_length=8`?** Frontend validation is client-side-only and easily bypassed with `curl`. The backend must enforce password policy independently.

---

### Auth Service (`backend/services/auth.py`) — new file
```python
import os
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models_db import User

_SECRET_KEY = os.getenv("SECRET_KEY")
if not _SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is not set. "
        "Generate one with: openssl rand -hex 32"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour — refresh via /api/auth/refresh

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Pre-computed dummy hash for timing-safe login (prevents user enumeration)
_DUMMY_HASH = pwd_context.hash("dummy-sentinel-never-matches")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}  # sub must be a string (JWT RFC 7519)
    return jwt.encode(payload, _SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)  # sub is always a string from JWT; convert back to int
    except (JWTError, ValueError):
        raise credentials_exception
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user
```

---

### Auth Routes (`backend/routes/auth.py`) — new file
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models_db import User
from backend.models import UserRegister, UserLogin, TokenResponse, UserOut
from backend.services.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, _DUMMY_HASH
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: UserRegister, db: Session = Depends(get_db)):
    normalized_email = body.email.lower().strip()
    if db.query(User).filter(User.email == normalized_email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=normalized_email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    # Always call verify_password — prevents timing-based user enumeration.
    # _DUMMY_HASH ensures bcrypt runs even when user doesn't exist.
    password_ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh(current_user: User = Depends(get_current_user)):
    return TokenResponse(access_token=create_access_token(current_user.id))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout():
    # JWT is stateless — real revocation requires a server-side blocklist (e.g., Redis).
    # For now, the client simply drops the token.
    return {"message": "Logged out"}
```

---

### App Entry Point (`backend/main.py`) — modify
```python
# Replace the old @app.on_event("startup") pattern with lifespan:
from contextlib import asynccontextmanager
from backend.database import engine, Base
from backend.routes.auth import router as auth_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="OS Instructor API", lifespan=lifespan)

# Register auth router alongside existing routers:
app.include_router(auth_router, prefix="/api")
```

> `@app.on_event("startup")` is deprecated since FastAPI 0.93. The `lifespan` pattern is the current standard.

---

## Frontend

### TypeScript Types (`frontend/src/types.ts`) — extend
```typescript
export interface AuthUser {
  id: number;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
```

---

### Auth API helpers (`frontend/src/api/client.ts`) — extend
```typescript
export function getStoredToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setStoredToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

export function clearStoredToken(): void {
  localStorage.removeItem("auth_token");
}

export function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginUser(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Login failed");
  return res.json();
}

export async function registerUser(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Registration failed");
  return res.json();
}

export async function refreshToken(): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json();
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}
```

Add `authHeaders()` to all existing API calls that hit protected routes.

---

### Auth Context (`frontend/src/context/AuthContext.tsx`) — new file
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AuthUser } from "../types";
import {
  loginUser, registerUser, fetchCurrentUser,
  setStoredToken, clearStoredToken, getStoredToken,
} from "../api/client";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setIsLoading(false); return; }
    fetchCurrentUser()
      .then(setUser)
      .catch(() => clearStoredToken())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { access_token } = await loginUser(email, password);
    setStoredToken(access_token);
    const me = await fetchCurrentUser();
    setUser(me);
  }

  async function register(email: string, password: string) {
    const { access_token } = await registerUser(email, password);
    setStoredToken(access_token);
    const me = await fetchCurrentUser();
    setUser(me);
  }

  function logout() {
    clearStoredToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
```

---

### Protected Route (`frontend/src/components/ProtectedRoute.tsx`) — new file
```typescript
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Show spinner instead of null — prevents blank-screen flash during token validation
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="os-thinking" aria-label="Loading…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve the destination so login can redirect back
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}
```

---

### Login Page (`frontend/src/pages/LoginPage.tsx`) — new file
```typescript
import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./auth.css";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") ?? "/select";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Sign in to OS Instructor</h1>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
```

---

### Register Page (`frontend/src/pages/RegisterPage.tsx`) — new file
```typescript
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./auth.css";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      navigate("/select", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

---

### Shared Auth CSS (`frontend/src/pages/auth.css`) — new file
One file for both login and register pages. Eliminates the duplicate-CSS bug.

```css
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-sidebar-bg);
}

.auth-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 2.5rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.auth-title {
  color: var(--color-heading);
  margin-bottom: 1.5rem;
  font-size: 1.4rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--color-text);
}

.auth-form input {
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-btn);
  font-size: 1rem;
  font-family: var(--font-sans);
}

.auth-form input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.auth-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-btn);
  padding: 0.75rem;
  font-size: 1rem;
  font-family: var(--font-sans);
  cursor: pointer;
  margin-top: 0.5rem;
  transition: background 0.15s;
}

.auth-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.auth-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.auth-error {
  color: var(--color-error-text);
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-btn);
  padding: 0.6rem 0.8rem;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.auth-footer {
  text-align: center;
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--color-muted);
}

.auth-footer a {
  color: var(--color-primary);
  text-decoration: none;
}

.auth-footer a:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .auth-card {
    margin: 1rem;
    padding: 1.5rem;
  }
}
```

---

### App Router (`frontend/src/App.tsx`) — modify
```typescript
// Wrap entire app in AuthProvider:
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Routes:
<AuthProvider>
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/select" element={<ProtectedRoute><ModeSelectPage /></ProtectedRoute>} />
    <Route path="/mode-a" element={<ProtectedRoute><ModeAPage /></ProtectedRoute>} />
    <Route path="/mode-b" element={<ProtectedRoute><ModeBPage /></ProtectedRoute>} />
    <Route path="/mode-c" element={<ProtectedRoute><ModeCPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
</AuthProvider>
```

---

### HomePage.tsx — modify
```typescript
import { useNavigate } from "react-router-dom";

const navigate = useNavigate();

// Login button:   onClick={() => navigate("/login")}
// Start Learning: onClick={() => navigate("/login")}
```

---

### Sidebar.tsx — modify
```typescript
const { user, logout } = useAuth();
const navigate = useNavigate();

function handleLogout() {
  logout();
  navigate("/login");
}

// In JSX: display user.email and a "Sign Out" button that calls handleLogout()
```

---

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `SECRET_KEY` | **none — required** | Generate: `openssl rand -hex 32`. App raises `ValueError` at startup if unset. |

Set in a `.env` file (already in `.gitignore`).

---

## Known Limitations (out of scope)

- **No token revocation:** Logout only clears the client-side token. A server-side blacklist (e.g., Redis `SETEX`) would be needed for real revocation. The 1-hour expiry limits the damage window.
- **No rate limiting:** `/api/auth/login` has no brute-force protection. Add `slowapi` or a reverse-proxy rule in production.

---

## File Summary

### New files
| Path | Purpose |
|------|---------|
| `backend/database.py` | SQLAlchemy engine, Base, `get_db()` |
| `backend/models_db.py` | `User` ORM model |
| `backend/services/auth.py` | JWT utils, bcrypt, `get_current_user` |
| `backend/routes/auth.py` | `/register`, `/login`, `/refresh`, `/me`, `/logout` |
| `frontend/src/context/AuthContext.tsx` | Global auth state + actions |
| `frontend/src/components/ProtectedRoute.tsx` | Route guard with spinner + `?next=` |
| `frontend/src/pages/LoginPage.tsx` | Login form with redirect preservation |
| `frontend/src/pages/RegisterPage.tsx` | Register form with client+server validation |
| `frontend/src/pages/auth.css` | Shared auth styles (replaces two duplicate files) |

### Modified files
| Path | Change |
|------|--------|
| `backend/requirements.txt` | Add `sqlalchemy`, `python-jose[cryptography]`, `passlib[bcrypt]`, `email-validator>=2.0` |
| `backend/models.py` | Add `UserRegister`, `UserLogin`, `TokenResponse`, `UserOut` schemas |
| `backend/main.py` | `lifespan` context manager + register auth router |
| `frontend/src/types.ts` | Add `AuthUser`, `TokenResponse` interfaces |
| `frontend/src/api/client.ts` | Add auth helpers + token header utility + `refreshToken` |
| `frontend/src/App.tsx` | Add `/login`, `/register` routes + `AuthProvider` + protect learning routes |
| `frontend/src/pages/HomePage.tsx` | Wire Login/Start Learning buttons to `/login` |
| `frontend/src/components/Sidebar.tsx` | User email display + Sign Out button |

---

## Verification

1. `pip install -r backend/requirements.txt` — must succeed without errors
2. Start backend without `SECRET_KEY` env var → expect `ValueError` at startup
3. Start with `SECRET_KEY=test-key uvicorn backend.main:app ...` → `sessions/users.db` created
4. `POST /api/auth/register` with `password="abc"` → `422 Unprocessable Entity`
5. `POST /api/auth/register` with same email twice → `409 Conflict`
6. `POST /api/auth/login` with wrong password → `401`; timing should be ≈ same as user-not-found
7. Decoded JWT `exp` claim → ~1 hour from now (not 7 days)
8. `POST /api/auth/refresh` with valid token → new token returned
9. Browser: navigate to `/mode-b` unauthenticated → `?next=%2Fmode-b` in login URL → after login lands on `/mode-b`
10. Page reload → stays logged in; loading spinner briefly visible, no blank screen
11. Logout → token cleared → redirected to `/login`
12. `Test@Example.COM` and `test@example.com` → should be treated as the same email (409 on second register)
