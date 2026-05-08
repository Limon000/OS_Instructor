import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Viz } from "@viz-js/viz";
import CourseOutlineSidebar from "../components/CourseOutlineSidebar";
import MessageBubble from "../components/MessageBubble";
import ThinkingIndicator from "../components/ThinkingIndicator";
import VisualRenderer from "../components/VisualRenderer";
import { useSession } from "../context/SessionContext";
import { getFirstIncompleteTopic, getModuleForTopic, getNextTopicId, getTopicById } from "../data/courseOutline";
import "./ModeBPage.css";

interface Props {
  viz: Viz | null;
}

export default function ModeBPage({ viz }: Props) {
  const navigate = useNavigate();
  const {
    currentTopicId,
    completedTopics,
    topicContent,
    isTeachingTopic,
    topicQAMessages,
    isThinking,
    error,
    clearError,
    goToTopic,
    moveToNextTopic,
    sendTopicQuestion,
  } = useSession();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [qaInput, setQaInput] = useState("");
  const qaBottomRef = useRef<HTMLDivElement>(null);
  const qaInputRef = useRef<HTMLTextAreaElement>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);

  // Scroll to top of content when a new topic starts streaming
  useEffect(() => {
    if (isTeachingTopic) {
      contentTopRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isTeachingTopic, currentTopicId]);

  // Scroll Q&A to bottom when new messages arrive
  useEffect(() => {
    qaBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [topicQAMessages]);

  // Focus Q&A input when content finishes loading
  useEffect(() => {
    if (!isTeachingTopic && topicContent) {
      qaInputRef.current?.focus();
    }
  }, [isTeachingTopic, topicContent]);

  const handleQASend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = qaInput.trim();
    if (!text || isThinking) return;
    setQaInput("");
    await sendTopicQuestion(text);
  };

  const handleQAKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQASend(e as unknown as React.FormEvent);
    }
  };

  // Derive breadcrumb
  const topic = currentTopicId ? getTopicById(currentTopicId) : null;
  const mod = currentTopicId ? getModuleForTopic(currentTopicId) : null;
  const nextId = currentTopicId ? getNextTopicId(currentTopicId) : null;
  const firstIncomplete = getFirstIncompleteTopic(completedTopics);

  const isAllDone = topicContent && !isTeachingTopic && !currentTopicId;
  const showContent = isTeachingTopic || topicContent;

  return (
    <div className="mode-b-layout">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 199,
          }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Header */}
      <header className="mode-b-header">
        <button
          className="mode-b-sidebar-toggle"
          aria-label="Open course outline"
          onClick={() => setSidebarOpen(true)}
        >
          ☰ Outline
        </button>
        <button className="mode-b-back-btn" onClick={() => navigate("/")}>
          ← Home
        </button>
        <span className="mode-b-header-title">📘 Limon — OS Course Instructor</span>
        <span className="mode-b-badge">🗺️ Mode B</span>
      </header>

      <div className="mode-b-body">
        {/* Left: course outline sidebar — open class applied via sibling prop */}
        <CourseOutlineSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Right: main content */}
        <main className="mode-b-main">
          {/* Breadcrumb */}
          {topic && mod && (
            <div className="mode-b-breadcrumb">
              Module {mod.num} — {mod.title}
              <span>›</span>
              Topic {currentTopicId}: {topic.title}
            </div>
          )}

          {/* Error banner */}
          {error && error !== "BACKEND_DOWN" && (
            <div className="mode-b-error" role="alert">
              <span>⚠️ {error}</span>
              <button onClick={clearError} aria-label="Dismiss">✕</button>
            </div>
          )}

          {/* Scrollable area — topic content only */}
          <div className="mode-b-scroll-area">
            {/* No topic selected yet — start screen */}
            {!showContent && !isAllDone && (
              <div className="mode-b-start-area">
                <div style={{ fontSize: 56 }}>📚</div>
                {completedTopics.length > 0 ? (
                  <>
                    <h2>Welcome back!</h2>
                    <p>
                      You've completed <strong>{completedTopics.length}</strong> topic
                      {completedTopics.length !== 1 ? "s" : ""} so far.{" "}
                      {firstIncomplete
                        ? `Continue with Topic ${firstIncomplete.id}.`
                        : "You've covered every topic!"}
                    </p>
                    {firstIncomplete && (
                      <button
                        className="mode-b-start-btn"
                        onClick={() => goToTopic(firstIncomplete.id)}
                      >
                        ▶ Continue: Topic {firstIncomplete.id} — {firstIncomplete.title}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h2>Start the Structured OS Course</h2>
                    <p>
                      Work through all 10 modules topic by topic. After each topic you can ask
                      questions, then move on when you're ready.
                    </p>
                    <button
                      className="mode-b-start-btn"
                      onClick={() => goToTopic("1.1")}
                    >
                      ▶ Start Topic 1.1 — What is an OS?
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Topic teaching content */}
            {showContent && (
              <div className="mode-b-topic-content">
                <div ref={contentTopRef} />
                {topic && mod && (
                  <div className="mode-b-topic-header">
                    <h2>
                      Topic {currentTopicId}: {topic.title}
                    </h2>
                    <p>Module {mod.num} — {mod.title}</p>
                  </div>
                )}

                {(topicContent || isTeachingTopic) && (
                  <MessageBubble
                    message={
                      topicContent ?? {
                        role: "assistant",
                        content: "",
                        isStreaming: true,
                      }
                    }
                    viz={viz}
                  />
                )}

                {topicContent?.visual && !isTeachingTopic && (
                  <div style={{ marginTop: 16 }}>
                    <VisualRenderer visual={topicContent.visual} viz={viz} />
                  </div>
                )}
              </div>
            )}

            {/* Completion message */}
            {isAllDone && topicContent && (
              <div className="mode-b-topic-content">
                <MessageBubble message={topicContent} viz={viz} />
              </div>
            )}
          </div>

          {/* Interaction panel — Q&A + next button, fixed at bottom */}
          {topicContent && !isTeachingTopic && !isAllDone && (
            <div className="mode-b-interaction-panel">
              {/* Q&A messages (scrollable) */}
              <div
                className="mode-b-qa-messages"
                role="log"
                aria-live="polite"
                aria-label="Q&A conversation"
              >
                {topicQAMessages.length === 0 && (
                  <p className="mode-b-qa-hint">💬 Questions about this topic? Ask below.</p>
                )}
                {topicQAMessages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} viz={viz} />
                ))}
                {isThinking && <ThinkingIndicator />}
                <div ref={qaBottomRef} />
              </div>

              {/* Input row */}
              <form className="mode-b-qa-form" onSubmit={handleQASend}>
                <label htmlFor="qa-input" className="sr-only">
                  Ask a question about this topic
                </label>
                <textarea
                  id="qa-input"
                  ref={qaInputRef}
                  className="mode-b-qa-input"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={handleQAKeyDown}
                  placeholder="Ask anything about this topic… (Enter to send)"
                  disabled={isThinking}
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
                  }}
                />
                <button
                  type="submit"
                  className="mode-b-qa-send"
                  disabled={!qaInput.trim() || isThinking}
                  aria-label="Send question"
                >
                  Send
                </button>
              </form>

              {/* Next topic bar */}
              <div className="mode-b-next-bar">
                {topicQAMessages.length === 0 && (
                  <button
                    className="mode-b-skip-link"
                    onClick={moveToNextTopic}
                    disabled={isThinking}
                  >
                    No questions — skip
                  </button>
                )}
                <button
                  className="mode-b-next-btn"
                  onClick={moveToNextTopic}
                  disabled={isThinking}
                  aria-label={nextId ? "Move to next topic" : "Complete the course"}
                >
                  {nextId ? "✅ Got it! Next Topic →" : "🎉 Finish Course"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
