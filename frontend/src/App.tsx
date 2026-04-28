import { useEffect, useState } from "react";
import type { Viz } from "@viz-js/viz";
import { SessionProvider } from "./context/SessionContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/AppShell";

export default function App() {
  const [viz, setViz] = useState<Viz | null>(null);

  // Dynamic import keeps the ~5 MB WASM out of the initial bundle
  useEffect(() => {
    import("@viz-js/viz")
      .then(({ instance }) => instance())
      .then(setViz)
      .catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppShell viz={viz} />
      </SessionProvider>
    </ErrorBoundary>
  );
}
