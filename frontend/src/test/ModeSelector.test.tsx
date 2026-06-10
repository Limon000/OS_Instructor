import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModeSelector from "../components/ModeSelector";
import { SessionContext } from "../context/SessionContext";
import type { Mode } from "../types";

function makeCtx(overrides: Partial<{
  selectMode: (m: Mode) => Promise<void>;
  isThinking: boolean;
}> = {}) {
  return {
    sessionId: "test-id",
    messages: [],
    mode: "" as Mode,
    isGreetingState: true,
    pendingOffTopic: null,
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

function renderWithCtx(ctx: ReturnType<typeof makeCtx>) {
  return render(
    <SessionContext.Provider value={ctx as never}>
      <ModeSelector />
    </SessionContext.Provider>
  );
}

describe("ModeSelector", () => {
  it("renders three mode cards", () => {
    renderWithCtx(makeCtx());
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("calls selectMode with correct key on click", () => {
    const selectMode = vi.fn().mockResolvedValue(undefined);
    renderWithCtx(makeCtx({ selectMode }));
    fireEvent.click(screen.getByLabelText(/Mode A/i));
    expect(selectMode).toHaveBeenCalledWith("A");
  });

  it("disables all cards while isThinking", () => {
    renderWithCtx(makeCtx({ isThinking: true }));
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
