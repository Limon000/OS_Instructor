import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { Viz } from "@viz-js/viz";
import { SessionProvider } from "./context/SessionContext";
import ErrorBoundary from "./components/ErrorBoundary";
import HomePage from "./pages/HomePage";
import ModeSelectPage from "./pages/ModeSelectPage";
import ModeAPage from "./pages/ModeAPage";
import ModeBPage from "./pages/ModeBPage";
import ModeCPage from "./pages/ModeCPage";

function ModeALearningPage({ viz }: { viz: Viz | null }) {
  return (
    <ErrorBoundary>
      <SessionProvider autoMode="A">
        <ModeAPage viz={viz} />
      </SessionProvider>
    </ErrorBoundary>
  );
}

function ModeBLearningPage({ viz }: { viz: Viz | null }) {
  return (
    <ErrorBoundary>
      <SessionProvider autoMode="B">
        <ModeBPage viz={viz} />
      </SessionProvider>
    </ErrorBoundary>
  );
}

function ModeCLearningPage({ viz }: { viz: Viz | null }) {
  return (
    <ErrorBoundary>
      <SessionProvider autoMode="C">
        <ModeCPage viz={viz} />
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
        <Route path="/select" element={<ModeSelectPage />} />
        <Route path="/mode-a" element={<ModeALearningPage viz={viz} />} />
        <Route path="/mode-b" element={<ModeBLearningPage viz={viz} />} />
        <Route path="/mode-c" element={<ModeCLearningPage viz={viz} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
