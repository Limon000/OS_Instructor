import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";
import type { Message, Mode } from "../types";

function getOrCreateSessionId(): string {
  const key = "os_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

interface SessionState {
  sessionId: string;
  messages: Message[];
  mode: Mode;
  isGreetingState: boolean;
  pendingOffTopic: string | null;
  isThinking: boolean;
  error: string | null;
  clearError: () => void;
  sendMessage: (text: string) => Promise<void>;
  selectMode: (mode: Mode) => Promise<void>;
  finishSession: () => Promise<void>;
  newSession: () => Promise<void>;
  confirmOffTopicYes: () => Promise<void>;
  confirmOffTopicNo: () => void;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const sessionId = useRef(getOrCreateSessionId()).current;
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<Mode>("");
  const [isGreetingState, setIsGreetingState] = useState(false);
  const [pendingOffTopic, setPendingOffTopic] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ── initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      setIsThinking(true);
      try {
        const session = await api.getSession(sessionId);
        if (session.mode) setMode(session.mode);

        const greeting = await api.greeting(sessionId);
        const greetingMsg: Message = {
          role: "assistant",
          content: greeting.content,
          visual: greeting.visual,
        };
        if (session.messages.length > 0) {
          const restored: Message[] = session.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          setMessages([...restored, greetingMsg]);
        } else {
          setMessages([greetingMsg]);
        }
        setIsGreetingState(greeting.is_greeting_state);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "OLLAMA_UNREACHABLE") {
          setError("Ollama is not running. Start it with `ollama serve` and refresh.");
        } else {
          setError(msg);
        }
      } finally {
        setIsThinking(false);
      }
    })();
  }, [sessionId]);

  // ── streaming sendMessage ───────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: "user", content: text };
      const streamingMsg: Message = { role: "assistant", content: "", isStreaming: true };
      const next = [...messages, userMsg];
      setMessages([...next, streamingMsg]);
      setIsThinking(true);
      setError(null);

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await api.chatStream(
          sessionId,
          next,
          mode,
          text,
          null,
          (event) => {
            if (event.type === "token") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + (event.delta ?? ""),
                };
                return updated;
              });
            } else if (event.type === "done") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: event.content ?? "",
                  visual: event.visual ?? null,
                  isStreaming: false,
                };
                return updated;
              });
            } else if (event.type === "offtopic") {
              setPendingOffTopic(text);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: event.content ?? "",
                  isStreaming: false,
                };
                return updated;
              });
            } else if (event.type === "error") {
              const errMsg = event.message ?? "Unknown error";
              setError(errMsg);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: `⚠️ ${errMsg}`,
                  isStreaming: false,
                };
                return updated;
              });
            }
          },
          abort.signal
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        const errMsg =
          msg === "OLLAMA_UNREACHABLE"
            ? "Ollama is not running. Start it with `ollama serve` and refresh."
            : msg;
        setError(errMsg);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `⚠️ ${errMsg}`,
            isStreaming: false,
          };
          return updated;
        });
      } finally {
        setIsThinking(false);
      }
    },
    [messages, mode, sessionId]
  );

  // ── mode selection ──────────────────────────────────────────────────────────
  const selectMode = useCallback(
    async (selectedMode: Mode) => {
      setIsThinking(true);
      setError(null);
      try {
        const res = await api.modeSelect(sessionId, selectedMode as "A" | "B" | "C", messages);
        setMode(selectedMode);
        setIsGreetingState(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.content, visual: res.visual },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsThinking(false);
      }
    },
    [messages, sessionId]
  );

  // ── finish session ──────────────────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    setIsThinking(true);
    setError(null);
    try {
      const res = await api.finishSession(sessionId, messages, mode);
      setMessages([{ role: "assistant", content: res.farewell, visual: res.visual }]);
      setMode("");
      setIsGreetingState(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsThinking(false);
    }
  }, [messages, mode, sessionId]);

  // ── new session ─────────────────────────────────────────────────────────────
  const newSession = useCallback(async () => {
    await api.clearSession(sessionId);
    setIsThinking(true);
    setError(null);
    try {
      // Generate a new session ID for the new session
      const newId = crypto.randomUUID();
      sessionStorage.setItem("os_session_id", newId);
      // Reload so the new ID is picked up cleanly
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsThinking(false);
    }
  }, [sessionId]);

  // ── off-topic yes/no ────────────────────────────────────────────────────────
  const confirmOffTopicYes = useCallback(async () => {
    if (!pendingOffTopic) return;
    const original = pendingOffTopic;
    setPendingOffTopic(null);

    const yesMsg: Message = { role: "user", content: "Yes, explain it" };
    const streamingMsg: Message = { role: "assistant", content: "", isStreaming: true };
    const next = [...messages, yesMsg];
    setMessages([...next, streamingMsg]);
    setIsThinking(true);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await api.chatStream(
        sessionId,
        next,
        mode,
        "Yes, explain it",
        original,
        (event) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + (event.delta ?? ""),
              };
              return updated;
            });
          } else if (event.type === "done") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: event.content ?? "",
                visual: event.visual ?? null,
                isStreaming: false,
              };
              return updated;
            });
          }
        },
        abort.signal
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsThinking(false);
    }
  }, [messages, mode, pendingOffTopic, sessionId]);

  const confirmOffTopicNo = useCallback(() => {
    setPendingOffTopic(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "No, continue the course" },
      {
        role: "assistant",
        content: "Got it! Let's stay on track. 📘 What OS topic would you like to explore?",
      },
    ]);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        messages,
        mode,
        isGreetingState,
        pendingOffTopic,
        isThinking,
        error,
        clearError,
        sendMessage,
        selectMode,
        finishSession,
        newSession,
        confirmOffTopicYes,
        confirmOffTopicNo,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
