import type {
  ChatStreamEvent,
  FinishSessionResponse,
  GreetingResponse,
  Message,
  Mode,
  ModeSelectResponse,
  SessionData,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 503) throw new Error("OLLAMA_UNREACHABLE");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
}

function serializeMessages(msgs: Message[]) {
  return msgs.map(({ role, content }) => ({ role, content }));
}

export const api = {
  greeting: (sessionId: string) =>
    post<GreetingResponse>(`/api/greeting?session_id=${encodeURIComponent(sessionId)}`),

  /** Opens a streaming POST and calls onEvent for each parsed SSE event. */
  chatStream: async (
    sessionId: string,
    messages: Message[],
    mode: Mode,
    userInput: string,
    originalOffTopic: string | null,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const res = await fetch(`${BASE}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        messages: serializeMessages(messages),
        mode,
        user_input: userInput,
        original_off_topic: originalOffTopic,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText);
      if (res.status === 503) throw new Error("OLLAMA_UNREACHABLE");
      throw new Error(`API ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          onEvent(JSON.parse(raw) as ChatStreamEvent);
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  },

  modeSelect: (sessionId: string, mode: Mode, messages: Message[]) =>
    post<ModeSelectResponse>("/api/mode-select", {
      session_id: sessionId,
      mode,
      messages: serializeMessages(messages),
    }),

  getSession: (sessionId: string) =>
    get<SessionData>(`/api/session?session_id=${encodeURIComponent(sessionId)}`),

  saveSession: (sessionId: string, messages: Message[], mode: Mode) =>
    post("/api/session/save", {
      session_id: sessionId,
      messages: serializeMessages(messages),
      mode,
    }),

  clearSession: (sessionId: string) =>
    del(`/api/session?session_id=${encodeURIComponent(sessionId)}`),

  finishSession: (sessionId: string, messages: Message[], mode: Mode) =>
    post<FinishSessionResponse>("/api/session/finish", {
      session_id: sessionId,
      messages: serializeMessages(messages),
      mode,
    }),
};
