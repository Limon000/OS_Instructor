import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Viz } from "@viz-js/viz";
import { useSession } from "../context/SessionContext";
import Sidebar from "../components/Sidebar";
import MessageBubble from "../components/MessageBubble";
import ThinkingIndicator from "../components/ThinkingIndicator";
import OffTopicOverlay from "../components/OffTopicOverlay";
import "./ModeCPage.css";

const HIDDEN = new Set(["Hello", "[RESUME_SESSION]"]);

interface Props { viz: Viz | null }

export default function ModeCPage({ viz }: Props) {
  const { messages, isThinking, pendingOffTopic, error, clearError, sendMessage } = useSession();
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isUserScrolledRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  const displayed = messages.filter(m => !(m.role === "user" && HIDDEN.has(m.content)));
  const hasUserMessages = messages.some(m => m.role === "user" && !HIDDEN.has(m.content));

  useEffect(() => {
    if (!isThinking) inputRef.current?.focus();
  }, [isThinking, hasUserMessages]);

  useEffect(() => {
    if (!isUserScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    isUserScrolledRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 50;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isThinking || pendingOffTopic) return;
    setInputText("");
    isUserScrolledRef.current = false;
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="mc-shell">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="mc-main">
        {/* Header */}
        <div className="mc-header">
          <button
            className="sidebar-toggle"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <button className="mc-back-btn" onClick={() => navigate("/")} aria-label="Back to home">
            ← Home
          </button>
          <span className="mc-header-title">📘 Limon — OS Course Instructor</span>
        </div>

        {/* Error banner */}
        {error && (
          <div role="alert" className="mc-error-banner">
            {error === "BACKEND_DOWN" ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Backend server is not running</div>
                <pre className="mc-error-pre">
                  {`cd OS_Instructor\nPYTHONPATH=. uvicorn backend.main:app --reload --port 8000`}
                </pre>
                <button onClick={() => window.location.reload()} className="mc-error-retry">
                  🔄 Retry
                </button>
              </>
            ) : (
              <div className="mc-error-row">
                <span>⚠️ {error}</span>
                <button onClick={clearError} aria-label="Dismiss error">✕</button>
              </div>
            )}
          </div>
        )}

        {!hasUserMessages ? (
          /* ── Empty state: Claude-like centered layout ── */
          <div className="mc-empty">
            <div className="mc-empty-inner">
              <div className="mc-empty-icon" aria-hidden="true">🧪</div>
              {isThinking ? (
                <p className="mc-empty-hint">Connecting to Limon...</p>
              ) : (
                <>
                  <h1 className="mc-empty-title">Hello! I'm Limon,</h1>
                  <p className="mc-empty-subtitle">your Operating System knowledge assessor.</p>
                  <p className="mc-empty-hint">
                    Tell me about your OS background and I'll build a personalised study plan.
                  </p>
                </>
              )}

              <form onSubmit={handleSubmit} className="mc-empty-form">
                <label htmlFor="mc-empty-input" className="sr-only">Message Limon</label>
                <div className="mc-empty-input-wrap">
                  <textarea
                    id="mc-empty-input"
                    ref={inputRef}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Tell me about your OS knowledge..."
                    disabled={isThinking}
                    rows={1}
                    className="mc-empty-textarea"
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isThinking}
                    aria-label="Send message"
                    className="mc-empty-send"
                  >
                    ↑
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* ── Chat state: messages + bottom input ── */
          <>
            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label="Conversation"
              aria-busy={isThinking}
              onScroll={handleScroll}
              className="mc-log"
            >
              {displayed.map((msg, i) => (
                <MessageBubble key={i} message={msg} viz={viz} />
              ))}
              {isThinking && !messages.some(m => m.isStreaming) && <ThinkingIndicator />}
              <div ref={bottomRef} />
            </div>

            {pendingOffTopic && <OffTopicOverlay />}

            <form onSubmit={handleSubmit} className="mc-chat-form">
              <label htmlFor="mc-chat-input" className="sr-only">Message Limon</label>
              <div className="mc-chat-input-row">
                <textarea
                  id="mc-chat-input"
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Limon anything about Operating Systems… (Enter to send, Shift+Enter for newline)"
                  disabled={!!pendingOffTopic || isThinking}
                  rows={1}
                  aria-disabled={!!pendingOffTopic || isThinking}
                  className="mc-chat-textarea"
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || !!pendingOffTopic || isThinking}
                  aria-label="Send message"
                  className="mc-chat-send"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
