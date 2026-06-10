import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBubble from "../components/MessageBubble";

describe("MessageBubble", () => {
  it("renders assistant text with Limon label", () => {
    render(
      <MessageBubble
        message={{ role: "assistant", content: "Hello there!" }}
        viz={null}
      />
    );
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
    expect(screen.getByText(/Limon/i)).toBeInTheDocument();
  });

  it("renders user message without Limon label", () => {
    render(
      <MessageBubble
        message={{ role: "user", content: "What is paging?" }}
        viz={null}
      />
    );
    expect(screen.getByText("What is paging?")).toBeInTheDocument();
    expect(screen.queryByText(/Limon/i)).not.toBeInTheDocument();
  });

  it("applies streaming-cursor class while streaming", () => {
    const { container } = render(
      <MessageBubble
        message={{ role: "assistant", content: "Typing…", isStreaming: true }}
        viz={null}
      />
    );
    expect(container.querySelector(".streaming-cursor")).not.toBeNull();
  });

  it("does not render VisualRenderer while streaming", () => {
    const { container } = render(
      <MessageBubble
        message={{
          role: "assistant",
          content: "text",
          isStreaming: true,
          visual: { kind: "matplotlib", data: "abc" },
        }}
        viz={null}
      />
    );
    // img should not be present while streaming
    expect(container.querySelector("img")).toBeNull();
  });
});
