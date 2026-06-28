import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { profileApi } from "../api/profile";
import type { ProfileData } from "../api/profile";
import StudentDashboard from "./StudentDashboard";
import InstructorDashboard from "./InstructorDashboard";
import AdminDashboard from "./AdminDashboard";
import "./ProfilePage.css";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    profileApi
      .getProfile()
      .then(setProfile)
      .catch((err) => setLoadErr(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setFetching(false));
  }, [isAuthenticated]);

  if (isLoading || fetching) {
    return (
      <div className="pp-layout profile-view">
        <div className="pp-loading">Loading profile…</div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="pp-layout profile-view">
        <div className="pp-error">{loadErr}</div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="pp-layout profile-view">
      <header className="pp-header">
        <button className="pp-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <span className="pp-header-title">My Profile</span>
        <span className="pp-role-hint">
          {profile.role === "admin" && "Admin Dashboard"}
          {profile.role === "instructor" && "Instructor Dashboard"}
          {profile.role === "student" && "Student Dashboard"}
        </span>
      </header>

      {profile.role === "student" && (
        <StudentDashboard profile={profile} onProfileUpdated={setProfile} />
      )}
      {profile.role === "instructor" && (
        <InstructorDashboard profile={profile} onProfileUpdated={setProfile} />
      )}
      {profile.role === "admin" && (
        <AdminDashboard profile={profile} />
      )}
    </div>
  );
}
