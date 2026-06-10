import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OffTopicOverlay from "../components/OffTopicOverlay";
import { SessionContext } from "../context/SessionContext";
import type { Mode } from "../types";

function makeCtx(overrides = {}) {
  return {
    sessionId: "test-id",
    messages: [],
    mode: "" as Mode,
    isGreetingState: false,
    pendingOffTopic: "What is 2+2?",
    isThinking: false,
    error: null,
    clearError: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    selectMode: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    newSession: vi.fn().mockResolvedValue(undefined),
    confirmOffTopicYes: vi.fn().mockResolvedValue(undefined),
    confirmOffTopicNo: vi.fn(),
    ...overrides,
  };
}

describe("OffTopicOverlay", () => {
  it("renders Yes and No buttons", () => {
    const ctx = makeCtx();
    render(
      <SessionContext.Provider value={ctx as never}>
        <OffTopicOverlay />
      </SessionContext.Provider>
    );
    expect(screen.getByLabelText(/Yes, explain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/No, continue/i)).toBeInTheDocument();
  });

  it("calls confirmOffTopicYes on Yes click", () => {
    const ctx = makeCtx();
    render(
      <SessionContext.Provider value={ctx as never}>
        <OffTopicOverlay />
      </SessionContext.Provider>
    );
    fireEvent.click(screen.getByLabelText(/Yes, explain/i));
    expect(ctx.confirmOffTopicYes).toHaveBeenCalledOnce();
  });

  it("calls confirmOffTopicNo on No click", () => {
    const ctx = makeCtx();
    render(
      <SessionContext.Provider value={ctx as never}>
        <OffTopicOverlay />
      </SessionContext.Provider>
    );
    fireEvent.click(screen.getByLabelText(/No, continue/i));
    expect(ctx.confirmOffTopicNo).toHaveBeenCalledOnce();
  });

  it("calls confirmOffTopicNo on Escape key", () => {
    const ctx = makeCtx();
    render(
      <SessionContext.Provider value={ctx as never}>
        <OffTopicOverlay />
      </SessionContext.Provider>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(ctx.confirmOffTopicNo).toHaveBeenCalledOnce();
  });
});
