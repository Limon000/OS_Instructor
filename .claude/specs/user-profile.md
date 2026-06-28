# User Profile Dashboard

## Overview
Every logged-in student has a profile dashboard that surfaces all personally-relevant data
stored in the database: identity, editable preferences, learning statistics, activity history,
enrollment/topic progress, assessment history, and active session management.

The dashboard is reachable at `/profile` and is protected (redirects to `/login` if no token).

---

## DB Tables Used

| Table | Purpose |
|---|---|
| `users` | Core identity: email, full_name, role, status, created_at, last_login_at |
| `user_profiles` | Editable preferences: avatar_url, bio, timezone, preferred_lang |
| `student_profiles` | Learning stats: proficiency_level, streak_days, longest_streak, time_spent_minutes |
| `auth_sessions` | Active login sessions (view + revoke) |
| `daily_student_activity` | Per-day activity rollup (last 30 days) |
| `enrollments` | Course enrollment with progress_pct |
| `topic_progress` | Per-topic completion status |
| `attempts` | Assessment attempt history with scores |
| `assessments` | Assessment metadata (kind) |

---

## Backend API

All routes require `Authorization: Bearer <token>`. Router prefix: `/api/profile`.

```
GET    /api/profile                        → ProfileOut
PATCH  /api/profile                        → ProfileOut
POST   /api/profile/change-password        → {"message": "Password updated"}
GET    /api/profile/activity               → list[ActivityDay]
GET    /api/profile/progress               → list[EnrollmentOut]
GET    /api/profile/assessments            → list[AssessmentAttemptOut]
GET    /api/profile/sessions               → list[SessionOut]
DELETE /api/profile/sessions/{session_id}  → {"message": "Session revoked"}
```

### Pydantic Models

**ProfileOut** — full_name, email, bio, avatar_url, timezone, preferred_lang, role, status,
created_at, last_login_at, proficiency_level, streak_days, longest_streak, time_spent_minutes,
last_activity_date

**ProfileUpdate** — all Optional: full_name, bio, avatar_url, timezone, preferred_lang

**PasswordChangeRequest** — old_password, new_password (min 8 chars)

**ActivityDay** — day, messages_sent, topics_visited, quiz_attempts, time_spent_minutes

**EnrollmentOut** — enrollment_id, mode, status, progress_pct, current_topic_id, completed_topics,
total_topics

**AssessmentAttemptOut** — attempt_id, kind, outcome, score_pct, passed, started_at

**SessionOut** — session_id, created_at, expires_at, is_current (bool)

---

## Files Changed

### New
- `db/profile_repo.py` — raw-SQL repository
- `backend/routes/profile.py` — FastAPI router
- `frontend/src/api/profile.ts` — typed API helpers
- `frontend/src/components/profile/` — 8 components
- `frontend/src/pages/ProfilePage.tsx` + `ProfilePage.css`

### Modified
- `backend/main.py` — register profile_router
- `frontend/src/App.tsx` — add `/profile` route
- `frontend/src/pages/ModeSelectPage.tsx` — add Profile nav button

---

## Frontend — 4 Tabs

| Tab | Components |
|---|---|
| Overview | ProfileHeader, StudentStatsCard |
| Edit Profile | ProfileEditForm |
| Learning | LearningProgressSection, AssessmentHistorySection, ActivityHeatmap |
| Security | PasswordChangeForm, ActiveSessionsPanel |

---

## Acceptance Criteria

1. `GET /api/profile` returns all fields; nulls are allowed on a fresh account.
2. `PATCH /api/profile` with `{"bio": "hello", "timezone": "UTC"}` persists correctly.
3. `PATCH /api/profile` with `{"full_name": "New Name"}` updates `users.full_name`.
4. `POST /api/profile/change-password` with wrong old password returns HTTP 400.
5. After a successful password change, login with the new password succeeds.
6. `GET /api/profile/activity` returns an array (empty OK on fresh accounts).
7. `GET /api/profile/sessions` includes the current session with `is_current: true`.
8. `DELETE /api/profile/sessions/{current_id}` returns HTTP 400.
9. `DELETE /api/profile/sessions/{other_id}` revokes that session.
10. Navigating to `/profile` without a token redirects to `/login`.
11. All 4 tabs render without error on a fresh account.
12. Edit Profile form pre-fills with existing values and saves on submit.
13. Password form validates new_password === confirm_password client-side.
14. Activity heatmap renders 30 day cells with intensity based on messages_sent.
15. Profile link in ModeSelectPage navigates to `/profile`.
