import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { caught: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { caught: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      caught: true,
      message: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }

  render() {
    if (!this.state.caught) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, color: "var(--color-heading)", margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: "var(--color-muted)", maxWidth: 400 }}>{this.state.message}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 24px",
            borderRadius: "var(--radius-btn)",
            border: "none",
            background: "var(--color-primary)",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
