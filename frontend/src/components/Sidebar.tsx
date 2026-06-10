import { useSession } from "../context/SessionContext";

const MODE_LABELS: Record<string, string> = {
  A: "📖 Mode A — Single Topic",
  B: "🗺️ Mode B — Full Roadmap",
  C: "🧪 Mode C — Assessment",
};

const ROADMAP_TOTAL_DAYS = 70;
const TOPIC_RE = /Topic\s+\d+\.\d+/gi;
const DAY_RE = /\bDay\s+(\d+)\b/gi;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const { messages, mode, finishSession, newSession, isThinking } = useSession();

  const assistantText = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n");

  const topics = [...new Set(assistantText.match(TOPIC_RE) ?? [])];

  let maxDay = 0;
  if (mode === "B") {
    let m: RegExpExecArray | null;
    DAY_RE.lastIndex = 0;
    while ((m = DAY_RE.exec(assistantText)) !== null) {
      maxDay = Math.max(maxDay, parseInt(m[1], 10));
    }
  }

  return (
    <aside
      className={`sidebar${isOpen ? " open" : ""}`}
      aria-label="Learning progress"
      style={{
        width: "var(--sidebar-width)",
        borderRight: "1px solid var(--color-border)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "var(--color-sidebar-bg)",
        overflowY: "auto",
      }}
    >
      {/* Close button — mobile only */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--color-heading)" }}>
          📘 Limon
        </div>
        <button
          className="sidebar-toggle"
          onClick={onClose}
          aria-label="Close navigation"
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Mode badge */}
      <div>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>
          Current Mode
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: mode ? "var(--color-primary-bg)" : "#f0f0f0",
            fontSize: 13,
            fontWeight: 600,
            color: mode ? "var(--color-heading)" : "#aaa",
          }}
          aria-label={mode ? `Mode ${mode}: ${MODE_LABELS[mode]}` : "No mode selected"}
        >
          {mode ? MODE_LABELS[mode] : "— not selected —"}
        </div>
      </div>

      {/* Mode B progress bar */}
      {mode === "B" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>
            📅 Roadmap Progress
          </div>
          <div
            role="progressbar"
            aria-valuenow={maxDay}
            aria-valuemin={0}
            aria-valuemax={ROADMAP_TOTAL_DAYS}
            aria-label={`Day ${maxDay} of ${ROADMAP_TOTAL_DAYS}`}
            style={{
              background: "#e0e0e0",
              borderRadius: 4,
              height: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (maxDay / ROADMAP_TOTAL_DAYS) * 100)}%`,
                background: "var(--color-primary)",
                borderRadius: 4,
                transition: "width 0.4s",
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            Day {maxDay} / {ROADMAP_TOTAL_DAYS}
          </div>
        </div>
      )}

      {/* Topics covered */}
      {topics.length > 0 && (
        <details open>
          <summary
            style={{
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--color-heading)",
              userSelect: "none",
            }}
          >
            ✅ Topics Covered ({topics.length})
          </summary>
          <ul
            aria-label="Topics covered in this session"
            style={{
              marginTop: 8,
              paddingLeft: 16,
              fontSize: 12,
              color: "#444",
              lineHeight: 1.8,
            }}
          >
            {topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ flex: 1 }} />

      {/* Session buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={finishSession}
          disabled={isThinking || messages.length === 0}
          aria-label="Finish session and save progress"
          style={{
            padding: "10px 0",
            borderRadius: "var(--radius-btn)",
            border: "none",
            background: "var(--color-primary)",
            color: "white",
            fontWeight: 600,
            cursor: isThinking ? "not-allowed" : "pointer",
            opacity: isThinking || messages.length === 0 ? 0.6 : 1,
          }}
        >
          💾 Finish Session
        </button>
        <button
          onClick={newSession}
          disabled={isThinking}
          aria-label="Start a new session"
          style={{
            padding: "10px 0",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--color-border)",
            background: "white",
            fontWeight: 600,
            cursor: isThinking ? "not-allowed" : "pointer",
            opacity: isThinking ? 0.6 : 1,
          }}
        >
          🔄 Start New Session
        </button>
      </div>
    </aside>
  );
}
