import { useEffect, useState } from "react";
import { profileApi } from "../api/profile";
import type { ProfileData, InstructorProfileData, CourseOut, SessionOut } from "../api/profile";
import ProfileHeader from "../components/profile/ProfileHeader";
import InstructorStatsCard from "../components/profile/InstructorStatsCard";
import InstructorEditForm from "../components/profile/InstructorEditForm";
import ProfileEditForm from "../components/profile/ProfileEditForm";
import InstructorCoursesSection from "../components/profile/InstructorCoursesSection";
import PasswordChangeForm from "../components/profile/PasswordChangeForm";
import ActiveSessionsPanel from "../components/profile/ActiveSessionsPanel";

type Tab = "overview" | "edit" | "courses" | "security";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "edit", label: "Edit Profile" },
  { key: "courses", label: "My Courses" },
  { key: "security", label: "Security" },
];

interface Props {
  profile: ProfileData;
  onProfileUpdated: (p: ProfileData) => void;
}

const EMPTY_INSTRUCTOR: InstructorProfileData = {
  title: null,
  years_experience: null,
  expertise_areas: null,
  bio_long: null,
};

export default function InstructorDashboard({ profile, onProfileUpdated }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [instructor, setInstructor] = useState<InstructorProfileData>(EMPTY_INSTRUCTOR);
  const [courses, setCourses] = useState<CourseOut[]>([]);
  const [sessions, setSessions] = useState<SessionOut[]>([]);

  useEffect(() => {
    Promise.all([
      profileApi.getInstructorProfile(),
      profileApi.getInstructorCourses(),
      profileApi.getSessions(),
    ]).then(([ip, c, s]) => {
      setInstructor(ip);
      setCourses(c);
      setSessions(s);
    });
  }, []);

  return (
    <>
      <nav className="pp-tabs" aria-label="Profile sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pp-tab${tab === t.key ? " pp-tab--active" : ""}`}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="pp-content">
        {tab === "overview" && (
          <div className="pp-section">
            <ProfileHeader profile={profile} />
            <InstructorStatsCard instructor={instructor} />
          </div>
        )}
        {tab === "edit" && (
          <div className="pp-section">
            <ProfileEditForm profile={profile} onSaved={onProfileUpdated} />
            <InstructorEditForm instructor={instructor} onSaved={setInstructor} />
          </div>
        )}
        {tab === "courses" && (
          <div className="pp-section">
            <InstructorCoursesSection courses={courses} />
          </div>
        )}
        {tab === "security" && (
          <div className="pp-section">
            <PasswordChangeForm />
            <ActiveSessionsPanel
              sessions={sessions}
              onRevoked={(id) => setSessions((s) => s.filter((x) => x.session_id !== id))}
            />
          </div>
        )}
      </main>
    </>
  );
}
