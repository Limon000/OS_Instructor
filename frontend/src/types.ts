export type Mode = "A" | "B" | "C" | "";
export type Role = "user" | "assistant";

export interface VisualPayload {
  kind: "matplotlib" | "graphviz";
  data: string;
}

export interface Message {
  role: Role;
  content: string;
  visual?: VisualPayload | null;
  isStreaming?: boolean;
}

export interface GreetingResponse {
  content: string;
  visual: VisualPayload | null;
  is_greeting_state: boolean;
}

export interface ChatStreamEvent {
  type: "token" | "done" | "offtopic" | "error";
  delta?: string;
  content?: string;
  visual?: VisualPayload | null;
  message?: string;
}

export interface SessionData {
  messages: { role: Role; content: string }[];
  mode: Mode;
  last_session: string | null;
}

export interface FinishSessionResponse {
  farewell: string;
  visual: VisualPayload | null;
}

export interface ModeSelectResponse {
  content: string;
  visual: VisualPayload | null;
  is_off_topic: boolean;
}
