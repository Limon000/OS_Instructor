import { useEffect, useState } from "react";
import { profileApi } from "../api/profile";
import type { ProfileData, ActivityDay, EnrollmentOut, AssessmentAttemptOut, SessionOut } from "../api/profile";
import ProfileHeader from "../components/profile/ProfileHeader";
import StudentStatsCard from "../components/profile/StudentStatsCard";
import ProfileEditForm from "../components/profile/ProfileEditForm";
import PasswordChangeForm from "../components/profile/PasswordChangeForm";
import ActivityHeatmap from "../components/profile/ActivityHeatmap";
import LearningProgressSection from "../components/profile/LearningProgressSection";
import AssessmentHistorySection from "../components/profile/AssessmentHistorySection";
import ActiveSessionsPanel from "../components/profile/ActiveSessionsPanel";

type Tab = "overview" | "edit" | "learning" | "security";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "edit", label: "Edit Profile" },
  { key: "learning", label: "Learning" },
  { key: "security", label: "Security" },
];

interface Props {
  profile: ProfileData;
  onProfileUpdated: (p: ProfileData) => void;
}

export default function StudentDashboard({ profile, onProfileUpdated }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentOut[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttemptOut[]>([]);
  const [sessions, setSessions] = useState<SessionOut[]>([]);

  useEffect(() => {
    Promise.all([
      profileApi.getActivity(),
      profileApi.getProgress(),
      profileApi.getAssessments(),
      profileApi.getSessions(),
    ]).then(([a, e, at, s]) => {
      setActivity(a);
      setEnrollments(e);
      setAttempts(at);
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
            <StudentStatsCard profile={profile} />
          </div>
        )}
        {tab === "edit" && (
          <div className="pp-section">
            <ProfileEditForm profile={profile} onSaved={onProfileUpdated} />
          </div>
        )}
        {tab === "learning" && (
          <div className="pp-section">
            <LearningProgressSection enrollments={enrollments} />
            <ActivityHeatmap activity={activity} />
            <AssessmentHistorySection attempts={attempts} />
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
