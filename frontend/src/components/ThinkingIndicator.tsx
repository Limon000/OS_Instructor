export default function ThinkingIndicator() {
  return (
    <div
      style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}
      role="status"
      aria-label="Limon is thinking"
    >
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "var(--radius-bubble)",
          background: "var(--color-primary-bg)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span className="os-dot" style={{ animationDelay: "0s" }} />
        <span className="os-dot" style={{ animationDelay: "0.2s" }} />
        <span className="os-dot" style={{ animationDelay: "0.4s" }} />
      </div>
    </div>
  );
}
