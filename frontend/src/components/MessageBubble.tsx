import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Viz } from "@viz-js/viz";
import VisualRenderer from "./VisualRenderer";
import type { Message } from "../types";

interface Props {
  message: Message;
  viz: Viz | null;
}

function MessageBubble({ message, viz }: Props) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isAssistant ? "flex-start" : "flex-end",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: "var(--radius-bubble)",
          background: isAssistant ? "var(--color-primary-bg)" : "var(--color-user-bg)",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        {isAssistant && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-primary)",
              display: "block",
              marginBottom: 4,
            }}
            aria-hidden="true"
          >
            📘 Limon
          </span>
        )}

        <div className={`prose${message.isStreaming ? " streaming-cursor" : ""}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {message.visual && !message.isStreaming && (
          <VisualRenderer visual={message.visual} viz={viz} />
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
