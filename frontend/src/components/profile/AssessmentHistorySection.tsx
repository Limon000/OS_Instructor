import type { AssessmentAttemptOut } from "../../api/profile";

interface Props {
  attempts: AssessmentAttemptOut[];
}

const KIND_LABEL: Record<string, string> = {
  topic_quiz: "Topic Quiz",
  module_quiz: "Module Quiz",
  final_exam: "Final Exam",
  diagnostic: "Diagnostic",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AssessmentHistorySection({ attempts }: Props) {
  if (attempts.length === 0) {
    return (
      <div className="ahs-root">
        <h3 className="ahs-title">Assessment History</h3>
        <p className="ahs-empty">No assessments taken yet.</p>
      </div>
    );
  }

  return (
    <div className="ahs-root">
      <h3 className="ahs-title">Assessment History</h3>
      <div className="ahs-table-wrap">
        <table className="ahs-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Result</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.attempt_id}>
                <td>{KIND_LABEL[a.kind] ?? a.kind}</td>
                <td>
                  <span
                    className="ahs-badge"
                    style={{
                      background: a.passed ? "#dcfce7" : "#fee2e2",
                      color: a.passed ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {a.passed ? "Passed" : a.outcome === "in_progress" ? "In progress" : "Failed"}
                  </span>
                </td>
                <td>{a.score_pct != null ? `${Math.round(a.score_pct)}%` : "—"}</td>
                <td>{formatDate(a.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
