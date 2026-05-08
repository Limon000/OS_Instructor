import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";
import { getNextTopicId, getTopicById } from "../data/courseOutline";
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

  // ── Mode B ──────────────────────────────────────────────────────────────────
  currentTopicId: string;
  completedTopics: string[];
  topicContent: Message | null;
  isTeachingTopic: boolean;
  topicQAMessages: Message[];
  goToTopic: (id: string) => Promise<void>;
  moveToNextTopic: () => void;
  sendTopicQuestion: (text: string) => Promise<void>;
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

  // Mode B state
  const [currentTopicId, setCurrentTopicId] = useState("");
  const [completedTopics, setCompletedTopics] = useState<string[]>([]);
  const [topicContent, setTopicContent] = useState<Message | null>(null);
  const [isTeachingTopic, setIsTeachingTopic] = useState(false);
  const [topicQAMessages, setTopicQAMessages] = useState<Message[]>([]);

  const initialized = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const teachAbortRef = useRef<AbortController | null>(null);
  const qaAbortRef = useRef<AbortController | null>(null);

  // Keep refs in sync for use inside callbacks without causing re-creation
  const completedTopicsRef = useRef(completedTopics);
  const messagesRef = useRef(messages);
  const modeRef = useRef(mode);
  useEffect(() => { completedTopicsRef.current = completedTopics; }, [completedTopics]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const clearError = useCallback(() => setError(null), []);

  // ── initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      setIsThinking(true);
      try {
        const session = await api.getSession(sessionId);
        // Don't restore mode — user must always pick a mode on the chat page.
        // Progress (completedTopics, currentTopicId) IS restored so Mode B resumes seamlessly.
        if (session.completed_topics?.length) setCompletedTopics(session.completed_topics);
        if (session.current_topic_id) setCurrentTopicId(session.current_topic_id);

        const greeting = await api.greeting(sessionId);
        const greetingMsg: Message = {
          role: "assistant",
          content: greeting.content,
          visual: greeting.visual,
        };
        setMessages([greetingMsg]);
        // Always start in greeting/mode-selection state so the 3 mode cards are always shown.
        setIsGreetingState(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "BACKEND_DOWN") {
          setError("BACKEND_DOWN");
        } else if (msg === "OLLAMA_UNREACHABLE") {
          setError("Ollama is not running. Start it with `ollama serve` and refresh.");
        } else {
          setError(msg);
        }
      } finally {
        setIsThinking(false);
      }
    })();
  }, [sessionId]);

  // ── streaming sendMessage ────────────────────────────────────────────────────
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
        await api.chatStream(sessionId, next, mode, text, null, (event) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + (event.delta ?? "") };
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
        }, abort.signal);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        const errMsg = msg === "OLLAMA_UNREACHABLE"
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

  // ── mode selection ───────────────────────────────────────────────────────────
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

  // ── finish session ───────────────────────────────────────────────────────────
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

  // ── new session ──────────────────────────────────────────────────────────────
  const newSession = useCallback(async () => {
    await api.clearSession(sessionId);
    setIsThinking(true);
    setError(null);
    try {
      const newId = crypto.randomUUID();
      sessionStorage.setItem("os_session_id", newId);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsThinking(false);
    }
  }, [sessionId]);

  // ── off-topic yes/no ─────────────────────────────────────────────────────────
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
      await api.chatStream(sessionId, next, mode, "Yes, explain it", original, (event) => {
        if (event.type === "token") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + (event.delta ?? "") };
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
      }, abort.signal);
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

  // ── Mode B: go to topic ──────────────────────────────────────────────────────
  const goToTopic = useCallback(
    async (topicId: string) => {
      const topic = getTopicById(topicId);
      if (!topic) return;

      teachAbortRef.current?.abort();
      const abort = new AbortController();
      teachAbortRef.current = abort;

      setCurrentTopicId(topicId);
      setTopicContent(null);
      setTopicQAMessages([]);
      setIsTeachingTopic(true);
      setError(null);

      try {
        await api.teachTopic(sessionId, topicId, topic.title, (event) => {
          if (event.type === "token") {
            setTopicContent((prev) => ({
              role: "assistant",
              content: (prev?.content ?? "") + (event.delta ?? ""),
              isStreaming: true,
            }));
          } else if (event.type === "done") {
            setTopicContent({
              role: "assistant",
              content: event.content ?? "",
              visual: event.visual ?? null,
              isStreaming: false,
            });
            setIsTeachingTopic(false);
            // persist current topic to session
            api.saveSession(
              sessionId,
              messagesRef.current,
              modeRef.current,
              completedTopicsRef.current,
              topicId
            ).catch(() => {/* non-critical */});
          } else if (event.type === "error") {
            setError(event.message ?? "Error loading topic");
            setIsTeachingTopic(false);
          }
        }, abort.signal);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : String(e));
          setIsTeachingTopic(false);
        }
      }
    },
    [sessionId]
  );

  // ── Mode B: move to next topic ───────────────────────────────────────────────
  const moveToNextTopic = useCallback(() => {
    if (!currentTopicId) return;

    const newCompleted = completedTopics.includes(currentTopicId)
      ? completedTopics
      : [...completedTopics, currentTopicId];
    setCompletedTopics(newCompleted);

    const nextId = getNextTopicId(currentTopicId);
    if (nextId) {
      api.saveSession(sessionId, messagesRef.current, modeRef.current, newCompleted, nextId)
        .catch(() => {/* non-critical */});
      goToTopic(nextId);
    } else {
      // All 46 topics complete
      api.saveSession(sessionId, messagesRef.current, modeRef.current, newCompleted, "")
        .catch(() => {/* non-critical */});
      setCurrentTopicId("");
      setTopicContent({
        role: "assistant",
        content:
          "🎉 **Congratulations!** You've completed all 10 modules of the OS course!\n\n" +
          "You now have a comprehensive understanding of Operating Systems from the ground up. " +
          "Keep exploring and applying these concepts — you're well-prepared for exams, interviews, " +
          "and real-world systems work! 🏆",
        isStreaming: false,
      });
      setTopicQAMessages([]);
    }
  }, [currentTopicId, completedTopics, sessionId, goToTopic]);

  // ── Mode B: send Q&A question for current topic ──────────────────────────────
  const sendTopicQuestion = useCallback(
    async (text: string) => {
      if (!topicContent) return;

      // Build conversation: topic teaching as first assistant msg + Q&A history + new user msg
      const contextMsg: Message = {
        role: "assistant",
        content: topicContent.content,
      };
      const userMsg: Message = { role: "user", content: text };
      const streamingMsg: Message = { role: "assistant", content: "", isStreaming: true };

      const history = [contextMsg, ...topicQAMessages, userMsg];
      setTopicQAMessages((prev) => [...prev, userMsg, streamingMsg]);
      setIsThinking(true);

      qaAbortRef.current?.abort();
      const abort = new AbortController();
      qaAbortRef.current = abort;

      try {
        await api.chatStream(sessionId, history, "B", text, null, (event) => {
          if (event.type === "token") {
            setTopicQAMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + (event.delta ?? "") };
              return updated;
            });
          } else if (event.type === "done") {
            setTopicQAMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: event.content ?? "",
                visual: event.visual ?? null,
                isStreaming: false,
              };
              return updated;
            });
          } else if (event.type === "error") {
            setError(event.message ?? "Unknown error");
            setTopicQAMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: `⚠️ ${event.message ?? "Unknown error"}`,
                isStreaming: false,
              };
              return updated;
            });
          }
        }, abort.signal);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setIsThinking(false);
      }
    },
    [topicContent, topicQAMessages, sessionId]
  );

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
        // Mode B
        currentTopicId,
        completedTopics,
        topicContent,
        isTeachingTopic,
        topicQAMessages,
        goToTopic,
        moveToNextTopic,
        sendTopicQuestion,
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
