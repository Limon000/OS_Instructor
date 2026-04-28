import { useEffect, useRef, useState } from "react";
import type { Viz } from "@viz-js/viz";
import MessageBubble from "./MessageBubble";
import ThinkingIndicator from "./ThinkingIndicator";
import ModeSelector from "./ModeSelector";
import OffTopicOverlay from "./OffTopicOverlay";
import { useSession } from "../context/SessionContext";

const HIDDEN = new Set(["Hello", "[RESUME_SESSION]"]);

interface Props { viz: Viz | null }

export default function ChatWindow({ viz }: Props) {
  const {
    messages,
    isGreetingState,
    pendingOffTopic,
    isThinking,
    error,
    clearError,
    sendMessage,
  } = useSession();

  const [inputText, setInputText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isUserScrolledRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Focus input after greeting resolves
  useEffect(() => {
    if (!isGreetingState && !isThinking) {
      inputRef.current?.focus();
    }
  }, [isGreetingState, isThinking]);

  // Auto-scroll unless user has scrolled up
  useEffect(() => {
    if (!isUserScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    isUserScrolledRef.current = !atBottom;
  };

  const displayed = messages.filter(
    (m) => !(m.role === "user" && HIDDEN.has(m.content))
  );

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "0 16px",
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            margin: "12px 0 0",
            padding: "10px 14px",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            color: "var(--color-error-text)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠️ {error}</span>
          <button
            onClick={clearError}
            aria-label="Dismiss error"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-error-text)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Message list — live region for screen readers */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        aria-busy={isThinking}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", paddingTop: 16 }}
      >
        {displayed.map((msg, i) => (
          <MessageBubble key={i} message={msg} viz={viz} />
        ))}
        {isThinking && !messages.some((m) => m.isStreaming) && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Mode selector cards (greeting state only) */}
      {isGreetingState && !isThinking && <ModeSelector />}

      {/* Off-topic overlay */}
      {pendingOffTopic && <OffTopicOverlay />}

      {/* Chat input */}
      <form onSubmit={handleSubmit} style={{ paddingBottom: 16, paddingTop: 8 }}>
        <label htmlFor="chat-input" className="sr-only">
          Message Limon
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Limon anything about Operating Systems… (Enter to send, Shift+Enter for newline)"
            disabled={!!pendingOffTopic || isThinking}
            rows={1}
            aria-disabled={!!pendingOffTopic || isThinking}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--color-border)",
              fontSize: 14,
              outline: "none",
              resize: "none",
              fontFamily: "var(--font-sans)",
              lineHeight: 1.5,
              overflowY: "auto",
              maxHeight: 120,
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || !!pendingOffTopic || isThinking}
            aria-label="Send message"
            style={{
              padding: "10px 18px",
              borderRadius: "var(--radius-btn)",
              border: "none",
              background: "var(--color-primary)",
              color: "white",
              fontWeight: 600,
              cursor:
                !inputText.trim() || !!pendingOffTopic || isThinking
                  ? "not-allowed"
                  : "pointer",
              opacity: !inputText.trim() || !!pendingOffTopic || isThinking ? 0.6 : 1,
              alignSelf: "stretch",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
