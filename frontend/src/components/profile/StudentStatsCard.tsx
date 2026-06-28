import type { ProfileData } from "../../api/profile";

interface Props {
  profile: ProfileData;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const PROFICIENCY_COLOR: Record<string, string> = {
  beginner: "#16a34a",
  intermediate: "#2E86C1",
  advanced: "#7c3aed",
  expert: "#b45309",
};

interface StatProps {
  label: string;
  value: string;
  sub?: string;
}

function Stat({ label, value, sub }: StatProps) {
  return (
    <div className="ssc-stat">
      <span className="ssc-value">{value}</span>
      <span className="ssc-label">{label}</span>
      {sub && <span className="ssc-sub">{sub}</span>}
    </div>
  );
}

export default function StudentStatsCard({ profile }: Props) {
  const profColor = PROFICIENCY_COLOR[profile.proficiency_level ?? ""] ?? "#888";

  return (
    <div className="ssc-root">
      <h3 className="ssc-title">Learning Stats</h3>
      {profile.proficiency_level && (
        <div className="ssc-proficiency" style={{ borderColor: profColor, color: profColor }}>
          {profile.proficiency_level.charAt(0).toUpperCase() + profile.proficiency_level.slice(1)}
        </div>
      )}
      <div className="ssc-grid">
        <Stat label="Current streak" value={`${profile.daily_streak}`} sub="days" />
        <Stat label="Longest streak" value={`${profile.longest_streak}`} sub="days" />
        <Stat label="Time spent" value={fmtTime(profile.total_minutes_spent)} />
        <Stat label="Last active" value={formatDate(profile.last_active_day)} />
      </div>
    </div>
  );
}
