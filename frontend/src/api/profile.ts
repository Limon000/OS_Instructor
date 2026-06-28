import { getStoredToken } from "../context/AuthContext";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface ProfileData {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string | null;
  last_login_at: string | null;
  avatar_url: string | null;
  bio: string | null;
  timezone: string | null;
  preferred_lang: string | null;
  proficiency_level: string | null;
  daily_streak: number;
  longest_streak: number;
  total_minutes_spent: number;
  last_active_day: string | null;
}

export interface ProfileUpdate {
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  timezone?: string;
  preferred_lang?: string;
}

export interface ActivityDay {
  day: string;
  messages_sent: number;
  topics_visited: number;
  quiz_attempts: number;
  time_spent_minutes: number;
}

export interface EnrollmentOut {
  enrollment_id: string;
  mode: string;
  status: string;
  progress_pct: number;
  current_topic_id: string | null;
  completed_topics: number;
  total_topics: number;
}

export interface AssessmentAttemptOut {
  attempt_id: string;
  kind: string;
  outcome: string;
  score_pct: number | null;
  passed: boolean;
  started_at: string | null;
}

export interface SessionOut {
  session_id: string;
  created_at: string | null;
  expires_at: string | null;
  is_current: boolean;
}

export interface InstructorProfileData {
  title: string | null;
  years_experience: number | null;
  expertise_areas: string | null;
  bio_long: string | null;
}

export interface InstructorUpdate {
  title?: string;
  years_experience?: number;
  expertise_areas?: string;
  bio_long?: string;
}

export interface CourseOut {
  course_id: string;
  slug: string;
  title: string;
  description: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string | null;
  enrollment_count: number;
  module_count: number;
}

export interface AdminStats {
  total_students: number;
  total_instructors: number;
  total_admins: number;
  total_users: number;
  total_enrollments: number;
  active_sessions: number;
  messages_today: number;
}

export interface AdminUserOut {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string | null;
  last_login_at: string | null;
}

export interface AuditEntryOut {
  log_id: number;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  ip_address: string | null;
  created_at: string | null;
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const profileApi = {
  getProfile: () =>
    apiFetch<ProfileData>("/api/profile"),

  updateProfile: (data: ProfileUpdate) =>
    apiFetch<ProfileData>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (old_password: string, new_password: string) =>
    apiFetch<{ message: string }>("/api/profile/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),

  getActivity: () =>
    apiFetch<ActivityDay[]>("/api/profile/activity"),

  getProgress: () =>
    apiFetch<EnrollmentOut[]>("/api/profile/progress"),

  getAssessments: () =>
    apiFetch<AssessmentAttemptOut[]>("/api/profile/assessments"),

  getSessions: () =>
    apiFetch<SessionOut[]>("/api/profile/sessions"),

  revokeSession: (session_id: string) =>
    apiFetch<{ message: string }>(`/api/profile/sessions/${encodeURIComponent(session_id)}`, {
      method: "DELETE",
    }),

  // Instructor
  getInstructorProfile: () =>
    apiFetch<InstructorProfileData>("/api/profile/instructor"),

  updateInstructorProfile: (data: InstructorUpdate) =>
    apiFetch<InstructorProfileData>("/api/profile/instructor", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  getInstructorCourses: () =>
    apiFetch<CourseOut[]>("/api/profile/instructor/courses"),

  // Admin
  getAdminStats: () =>
    apiFetch<AdminStats>("/api/profile/admin/stats"),

  getAdminUsers: () =>
    apiFetch<AdminUserOut[]>("/api/profile/admin/users"),

  getAdminAudit: () =>
    apiFetch<AuditEntryOut[]>("/api/profile/admin/audit"),
};
