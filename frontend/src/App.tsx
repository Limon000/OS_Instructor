import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { Viz } from "@viz-js/viz";
import { SessionProvider } from "./context/SessionContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";

function ChatPage({ viz }: { viz: Viz | null }) {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppShell viz={viz} />
      </SessionProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  const [viz, setViz] = useState<Viz | null>(null);

  useEffect(() => {
    import("@viz-js/viz")
      .then(({ instance }) => instance())
      .then(setViz)
      .catch(console.error);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary>
              <div className="home-view">
                <HomePage />
              </div>
            </ErrorBoundary>
          }
        />
        <Route path="/chat" element={<ChatPage viz={viz} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
