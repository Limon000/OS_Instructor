import { useNavigate } from "react-router-dom";
import type { Mode } from "../types";
import "./ModeSelectPage.css";

const MODES: {
  key: Exclude<Mode, "">;
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  features: string[];
  color: string;
  recommended?: boolean;
}[] = [
  {
    key: "A",
    icon: "📖",
    title: "Mode A",
    subtitle: "Topic Explorer",
    desc: "Ask about any specific OS topic and get a deep, structured explanation with examples and diagrams.",
    features: ["Ask any topic freely", "Deep structured explanations", "Visual diagrams", "Quiz questions per topic"],
    color: "#2E86C1",
  },
  {
    key: "B",
    icon: "🗺️",
    title: "Mode B",
    subtitle: "Structured Roadmap",
    desc: "Follow a complete learning roadmap through all 10 OS modules, topic by topic with full progress tracking.",
    features: ["10 modules • 46 topics", "Step-by-step guided progress", "Completion tracking", "Q&A after each topic"],
    color: "#16a34a",
    recommended: true,
  },
  {
    key: "C",
    icon: "🧪",
    title: "Mode C",
    subtitle: "Assessment First",
    desc: "Take a quick diagnostic quiz and get a personalized study plan tailored to your current knowledge level.",
    features: ["5-question diagnostic", "Identify knowledge gaps", "Custom study plan", "Targeted learning path"],
    color: "#7c3aed",
  },
];

export default function ModeSelectPage() {
  const navigate = useNavigate();

  const handleSelect = (key: "A" | "B" | "C") => {
    if (key === "A") {
      navigate("/mode-a");
    } else if (key === "B") {
      navigate("/mode-b");
    } else {
      navigate("/mode-c");
    }
  };

  return (
    <div className="ms-layout">
      <header className="ms-header">
        <button className="ms-back-btn" onClick={() => navigate("/")}>
          ← Home
        </button>
        <span className="ms-header-title">📘 OS Course Instructor</span>
        <button className="ms-back-btn" style={{ marginLeft: "auto" }} onClick={() => navigate("/profile")}>
          My Profile
        </button>
      </header>

      <main className="ms-main">
        <div className="ms-hero">
          <h1 className="ms-title">Choose Your Learning Mode</h1>
          <p className="ms-subtitle">
            Select the mode that matches your goal. You can always start a new session to try a different approach.
          </p>
        </div>

        <div className="ms-cards">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`ms-card${m.recommended ? " ms-card--recommended" : ""}`}
              style={{ "--card-color": m.color } as React.CSSProperties}
              onClick={() => handleSelect(m.key)}
            >
              {m.recommended && <span className="ms-badge">⭐ Recommended</span>}

              <div className="ms-card-icon">{m.icon}</div>
              <div className="ms-card-title">{m.title}</div>
              <div className="ms-card-subtitle">{m.subtitle}</div>
              <p className="ms-card-desc">{m.desc}</p>

              <ul className="ms-card-features">
                {m.features.map((f, i) => (
                  <li key={i}>✓ {f}</li>
                ))}
              </ul>

              <span className="ms-card-cta">Start {m.title} →</span>
            </button>
          ))}
        </div>
      </main>

      <footer className="ms-footer">
        All modes use the same AI instructor (Limon) · Progress is automatically saved
      </footer>
    </div>
  );
}
