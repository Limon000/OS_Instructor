import type { AdminStats } from "../../api/profile";

interface Props {
  stats: AdminStats;
}

interface StatProps {
  label: string;
  value: number | string;
  color?: string;
}

function Stat({ label, value, color = "var(--color-primary)" }: StatProps) {
  return (
    <div className="asc-stat">
      <span className="asc-value" style={{ color }}>{value}</span>
      <span className="asc-label">{label}</span>
    </div>
  );
}

export default function AdminStatsCard({ stats }: Props) {
  return (
    <div className="asc-root">
      <h3 className="asc-title">Platform Overview</h3>
      <div className="asc-grid">
        <Stat label="Total Users" value={stats.total_users} />
        <Stat label="Students" value={stats.total_students} color="#2E86C1" />
        <Stat label="Instructors" value={stats.total_instructors} color="#16a34a" />
        <Stat label="Admins" value={stats.total_admins} color="#7c3aed" />
        <Stat label="Enrollments" value={stats.total_enrollments} />
        <Stat label="Active Sessions" value={stats.active_sessions} color="#b45309" />
        <Stat label="Messages Today" value={stats.messages_today} />
      </div>
    </div>
  );
}
