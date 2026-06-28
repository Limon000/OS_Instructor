import { useEffect, useState } from "react";
import { profileApi } from "../api/profile";
import type { ProfileData, AdminStats, AdminUserOut, AuditEntryOut, SessionOut } from "../api/profile";
import ProfileHeader from "../components/profile/ProfileHeader";
import AdminStatsCard from "../components/profile/AdminStatsCard";
import AdminUserTable from "../components/profile/AdminUserTable";
import AdminAuditLog from "../components/profile/AdminAuditLog";
import PasswordChangeForm from "../components/profile/PasswordChangeForm";
import ActiveSessionsPanel from "../components/profile/ActiveSessionsPanel";

type Tab = "overview" | "users" | "audit" | "security";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "audit", label: "Audit Log" },
  { key: "security", label: "Security" },
];

const EMPTY_STATS: AdminStats = {
  total_students: 0,
  total_instructors: 0,
  total_admins: 0,
  total_users: 0,
  total_enrollments: 0,
  active_sessions: 0,
  messages_today: 0,
};

interface Props {
  profile: ProfileData;
}

export default function AdminDashboard({ profile }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [audit, setAudit] = useState<AuditEntryOut[]>([]);
  const [sessions, setSessions] = useState<SessionOut[]>([]);

  useEffect(() => {
    Promise.all([
      profileApi.getAdminStats(),
      profileApi.getAdminUsers(),
      profileApi.getAdminAudit(),
      profileApi.getSessions(),
    ]).then(([s, u, a, sess]) => {
      setStats(s);
      setUsers(u);
      setAudit(a);
      setSessions(sess);
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
            <AdminStatsCard stats={stats} />
          </div>
        )}
        {tab === "users" && (
          <div className="pp-section">
            <AdminUserTable users={users} />
          </div>
        )}
        {tab === "audit" && (
          <div className="pp-section">
            <AdminAuditLog entries={audit} />
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
