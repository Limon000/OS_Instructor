import type { EnrollmentOut } from "../../api/profile";

interface Props {
  enrollments: EnrollmentOut[];
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  single_topic: { label: "Mode A — Topic Explorer", color: "#2E86C1" },
  beginner_zero: { label: "Mode B — Structured Roadmap", color: "#16a34a" },
  prior_knowledge: { label: "Mode C — Assessment First", color: "#7c3aed" },
};

const STATUS_BADGE: Record<string, string> = {
  active: "#16a34a",
  completed: "#2E86C1",
  dropped: "#888",
  paused: "#b45309",
};

export default function LearningProgressSection({ enrollments }: Props) {
  if (enrollments.length === 0) {
    return (
      <div className="lps-root">
        <h3 className="lps-title">Learning Progress</h3>
        <p className="lps-empty">No enrollments yet — pick a mode to get started!</p>
      </div>
    );
  }

  return (
    <div className="lps-root">
      <h3 className="lps-title">Learning Progress</h3>
      <div className="lps-cards">
        {enrollments.map((e) => {
          const modeInfo = MODE_LABELS[e.mode] ?? { label: e.mode, color: "#888" };
          const statusColor = STATUS_BADGE[e.status] ?? "#888";
          const pct = Math.round(e.progress_pct);
          return (
            <div key={e.enrollment_id} className="lps-card">
              <div className="lps-card-header">
                <span className="lps-mode" style={{ color: modeInfo.color }}>
                  {modeInfo.label}
                </span>
                <span className="lps-status" style={{ color: statusColor }}>
                  {e.status}
                </span>
              </div>

              <div className="lps-bar-track">
                <div
                  className="lps-bar-fill"
                  style={{ width: `${pct}%`, background: modeInfo.color }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="lps-bar-label">
                <span>{pct}% complete</span>
                {e.total_topics > 0 && (
                  <span>{e.completed_topics} / {e.total_topics} topics</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
