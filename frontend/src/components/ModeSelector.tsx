import { useEffect, useRef } from "react";
import { useSession } from "../context/SessionContext";
import type { Mode } from "../types";

const MODES: { key: Mode; icon: string; title: string; desc: string }[] = [
  {
    key: "A",
    icon: "📖",
    title: "Mode A — Ask a Topic",
    desc: "Ask me about any specific OS topic and I'll teach it deeply.",
  },
  {
    key: "B",
    icon: "🗺️",
    title: "Mode B — Start from Zero",
    desc: "Get a full structured week-by-week learning roadmap.",
  },
  {
    key: "C",
    icon: "🧪",
    title: "Mode C — I Know Some OS",
    desc: "Take a quick assessment and get a personalised study plan.",
  },
];

export default function ModeSelector() {
  const { selectMode, isThinking } = useSession();
  const firstCardRef = useRef<HTMLButtonElement>(null);

  // Focus the first card when it appears so keyboard users can navigate immediately
  useEffect(() => {
    firstCardRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label="Choose a learning mode"
      style={{ display: "flex", gap: 12, padding: "12px 0", flexWrap: "wrap" }}
    >
      {MODES.map(({ key, icon, title, desc }, idx) => (
        <button
          key={key}
          ref={idx === 0 ? firstCardRef : undefined}
          onClick={() => selectMode(key)}
          disabled={isThinking}
          aria-label={`${title}: ${desc}`}
          style={{
            flex: "1 1 180px",
            padding: "16px 12px",
            borderRadius: "var(--radius-card)",
            border: "2px solid var(--color-primary)",
            background: "white",
            cursor: isThinking ? "not-allowed" : "pointer",
            textAlign: "left",
            transition: "background 0.15s",
            opacity: isThinking ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isThinking) (e.currentTarget).style.background = "var(--color-primary-bg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget).style.background = "white";
          }}
          onFocus={(e) => {
            (e.currentTarget).style.background = "var(--color-primary-bg)";
          }}
          onBlur={(e) => {
            (e.currentTarget).style.background = "white";
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "var(--color-heading)",
              marginBottom: 4,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 13, color: "#555" }}>{desc}</div>
        </button>
      ))}
    </div>
  );
}
