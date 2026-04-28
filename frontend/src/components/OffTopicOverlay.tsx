import { useEffect } from "react";
import { useSession } from "../context/SessionContext";

export default function OffTopicOverlay() {
  const { confirmOffTopicYes, confirmOffTopicNo, isThinking } = useSession();

  // Escape key dismisses as "No"
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") confirmOffTopicNo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmOffTopicNo]);

  return (
    <div
      role="group"
      aria-label="Off-topic response options"
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 0",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <button
        onClick={confirmOffTopicYes}
        disabled={isThinking}
        aria-label="Yes, explain the off-topic subject"
        style={{
          flex: 1,
          padding: "10px 0",
          borderRadius: "var(--radius-btn)",
          border: "none",
          background: "var(--color-primary)",
          color: "white",
          fontWeight: 600,
          cursor: isThinking ? "not-allowed" : "pointer",
          opacity: isThinking ? 0.6 : 1,
        }}
      >
        ✅ Yes, explain it
      </button>
      <button
        onClick={confirmOffTopicNo}
        disabled={isThinking}
        aria-label="No, continue the OS course (Escape)"
        style={{
          flex: 1,
          padding: "10px 0",
          borderRadius: "var(--radius-btn)",
          border: "1px solid var(--color-border)",
          background: "white",
          fontWeight: 600,
          cursor: isThinking ? "not-allowed" : "pointer",
          opacity: isThinking ? 0.6 : 1,
        }}
      >
        ❌ No, continue the course
      </button>
    </div>
  );
}
