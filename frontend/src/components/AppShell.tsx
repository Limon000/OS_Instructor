import { useState } from "react";
import type { Viz } from "@viz-js/viz";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";

interface Props { viz: Viz | null }

export default function AppShell({ viz }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Mobile overlay — closes sidebar on tap outside */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border)",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--color-heading)",
            background: "white",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            className="sidebar-toggle"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ☰
          </button>
          📘 Limon — OS Course Instructor
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ChatWindow viz={viz} />
        </div>
      </main>
    </div>
  );
}
