# Frontend — React.js + FastAPI

## Overview

Replace the Streamlit UI with a React.js SPA (Vite + TypeScript) backed by a
FastAPI server. All AI logic, visual rendering, and session persistence stay in
Python; the browser gets a richer, interactive UI.

> **Review note (Google FE):** Sections marked ⚠️ were gaps in the original
> spec. They are requirements, not suggestions.

---

## Architecture

```
browser (React/Vite :5173)  ←→  FastAPI (:8000)  ←→  Ollama + visuals.py
```

Vite's dev-proxy forwards every `/api/*` request to `http://localhost:8000`.
Session data is stored server-side, keyed by `sessionId` (see §Concurrency).

---

## Backend (`backend/`)

### File map

| File | Role |
|---|---|
| `backend/main.py` | FastAPI app, CORS, CSP headers, router registration |
| `backend/models.py` | Pydantic request / response schemas |
| `backend/routes/chat.py` | `/api/greeting`, `/api/chat` (SSE stream), `/api/mode-select` |
| `backend/routes/session.py` | `GET/POST/DELETE /api/session`, `POST /api/session/finish` |
| `backend/routes/visual.py` | `POST /api/visual` (standalone test endpoint) |
| `backend/services/llm.py` | `classify_message`, `aria_respond_stream`, `load_system_prompt`, `parse_visual_tag`, constants |
| `backend/services/session_store.py` | `save_progress`, `load_progress`, `delete_progress` — keyed by `sessionId` |
| `backend/services/visual_service.py` | `serialize_visual` — wraps `visuals.py` |
| `backend/requirements.txt` | `fastapi uvicorn[standard] ollama matplotlib graphviz python-multipart sse-starlette` |

### Pydantic models

```
ChatRequest        { session_id, messages, mode, user_input, original_off_topic? }
ChatResponse       { content, visual: VisualPayload|None, is_off_topic: bool }
VisualPayload      { kind: "matplotlib"|"graphviz", data: str }
                   ↳ matplotlib → base64 PNG string
                   ↳ graphviz  → raw DOT source (rendered in browser via WASM)
ModeSelectRequest  { session_id, mode, messages }
FinishSessionRequest  { session_id, messages, mode }
FinishSessionResponse { farewell, visual: VisualPayload|None }
SessionData        { messages, mode, last_session }
GreetingResponse   { content, visual, is_greeting_state: bool }
```

### Endpoint summary

| Method | Path | Behaviour |
|---|---|---|
| POST | `/api/greeting` | Returns fresh greeting or resume-welcome; returns `is_greeting_state` |
| GET | `/api/chat/stream` | **SSE stream** — classifies, then streams LLM tokens; final event carries `visual` payload |
| POST | `/api/mode-select` | Runs `_MODE_INIT_PAYLOAD[mode]` → first mode message (non-streaming) |
| GET | `/api/session` | Reads session file for `?session_id=` |
| POST | `/api/session/save` | Writes session file |
| DELETE | `/api/session` | Deletes session file |
| POST | `/api/session/finish` | Save + farewell generation |
| POST | `/api/visual` | Serialise one tag independently |

### ⚠️ Streaming LLM responses (SSE)

`GET /api/chat/stream?session_id=...` with query params or
`EventSource` body via POST — use `sse-starlette`'s `EventSourceResponse`.

Protocol:
```
data: {"type":"token","delta":"Here is"}
data: {"type":"token","delta":" the explanation"}
data: {"type":"done","visual":{"kind":"matplotlib","data":"iVBOR..."}}
data: {"type":"error","message":"Ollama unreachable"}
```

Server accumulates full response to parse `[VISUAL:...]` tag; strips it before
streaming. Visual payload is only sent in the `done` event.

The frontend appends each `delta` to the in-progress assistant bubble in real
time. On `done`, it attaches `visual`. On `error`, it shows the error state.

### ⚠️ Request timeouts

All Ollama calls must be wrapped with a configurable timeout (default 60 s).
If the model doesn't respond within the limit, return `{"type":"error","message":"Response timed out"}` and close the stream.

```python
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT", "60"))
```

### ⚠️ Concurrency — session isolation

`progress.json` is a single file; two browser tabs corrupt each other.

Fix: generate a `sessionId` (UUID4) in the browser on first load, store it in
`sessionStorage` (survives page refresh, not new tabs). The backend stores
sessions as `sessions/{session_id}.json`.

`sessionStorage` was chosen over `localStorage` deliberately: a new tab gets
a fresh session; a page refresh within the same tab resumes.

### ⚠️ Security — CSP and CORS

**CORS:** `allow_origins` must come from an env var, not be hardcoded.
```python
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
```

**Content-Security-Policy header** on every response:
```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' 'wasm-unsafe-eval';   ← required for @viz-js/viz WASM
  style-src   'self' 'unsafe-inline';      ← required for inline styles
  img-src     'self' data:;                ← required for base64 PNG visuals
  connect-src 'self';
```

`'wasm-unsafe-eval'` is required to instantiate Graphviz WASM; it is safer
than `'unsafe-eval'` and is the correct directive for WASM modules.

### Visual serialisation strategy

- **matplotlib** → `fig.savefig(BytesIO, format="png", dpi=120)` → base64 string.
  `plt.close(fig)` called immediately to prevent memory accumulation.
- **graphviz** → return raw DOT source string (`dot` binary not required).
  Browser renders DOT → SVG via `@viz-js/viz` (WASM).

### Path resolution

```python
REPO_ROOT     = Path(__file__).parent.parent.parent  # from backend/services/
SESSIONS_DIR  = REPO_ROOT / "sessions"               # replaces progress.json
SYSTEM_PROMPT = REPO_ROOT / ".claude" / "instructor.md"
```

Launch: `PYTHONPATH=. uvicorn backend.main:app --reload --port 8000`

---

## Frontend (`frontend/`)

### Stack

| Package | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | 5+ | Build tool + dev server |
| TypeScript | 5+ | Type safety |
| `react-markdown` | latest | Safe markdown rendering |
| `remark-gfm` | latest | Tables, strikethrough in markdown |
| `@viz-js/viz` | latest | Graphviz WASM — DOT → SVG in browser |
| `dompurify` | latest | Sanitise Graphviz SVG before injection |

### ⚠️ Environment configuration

All environment-specific values go in `.env` files, never hardcoded:

```
# frontend/.env.development
VITE_API_BASE_URL=http://localhost:8000
```

```ts
// api/client.ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
```

Add `frontend/.env*` to `.gitignore`.

### Component tree

```
App  (lazy-loads @viz-js/viz WASM → VizContext; renders <VizGate> while loading)
└── SessionProvider
    └── ErrorBoundary          ← catches render-time crashes
        └── AppShell  (CSS grid: sidebar 260px | main flex-grow)
            ├── Sidebar
            │   ├── ModeBadge           reads mode from context
            │   ├── TopicsExpander      regex /Topic \d+\.\d+/g on assistant messages
            │   ├── ProgressBar         Mode B only; /Day (\d+)/g → max / 70
            │   ├── FinishSessionBtn    POST /api/session/finish
            │   └── NewSessionBtn       DELETE /api/session → reset → greeting
            └── MainPanel
                ├── ModeSelector        full-panel overlay when isGreetingState; 3 cards
                ├── ChatWindow          virtualised MessageBubble list (see §Performance)
                │   └── MessageBubble
                │       ├── react-markdown + remark-gfm
                │       └── VisualRenderer
                │           ├── <img base64>      (matplotlib)
                │           └── DOMPurify SVG div (graphviz via @viz-js/viz)
                ├── OffTopicOverlay     Yes / No buttons; shown when pendingOffTopic set
                └── ChatInputBar        disabled while pendingOffTopic !== null
```

### ⚠️ TypeScript — strict union types

```ts
// types.ts
export type Mode = "A" | "B" | "C" | "";
export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
  visual?: VisualPayload | null;
  isStreaming?: boolean;  // true while SSE is in-flight for this bubble
}
```

`mode: string` everywhere in the existing code must be narrowed to `Mode`.

### Session state (`SessionContext.tsx`)

| Field | Type | Populated from |
|---|---|---|
| `sessionId` | `string` | Generated once; stored in `sessionStorage` |
| `messages` | `Message[]` | `GET /api/session?session_id=` on mount |
| `mode` | `Mode` | `GET /api/session` on mount |
| `isGreetingState` | `boolean` | `POST /api/greeting` response |
| `pendingOffTopic` | `string \| null` | Set when `ChatResponse.is_off_topic === true` |
| `isThinking` | `boolean` | True while any API call is in-flight |
| `error` | `string \| null` | Last API error message; cleared on next send |

### ⚠️ Streaming in `SessionContext`

```ts
async function sendMessage(text: string) {
  const userMsg = { role: "user" as Role, content: text };
  const streamingMsg = { role: "assistant" as Role, content: "", isStreaming: true };
  setMessages(prev => [...prev, userMsg, streamingMsg]);
  setIsThinking(true);

  const es = new EventSource(`/api/chat/stream?...`);

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "token") {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: next[next.length - 1].content + data.delta,
        };
        return next;
      });
    } else if (data.type === "done") {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          isStreaming: false,
          visual: data.visual ?? null,
        };
        return next;
      });
      es.close();
      setIsThinking(false);
    } else if (data.type === "error") {
      setError(data.message);
      es.close();
      setIsThinking(false);
    }
  };
}
```

### ⚠️ Error handling

**API errors** — every `fetch` / `EventSource` call is wrapped in try/catch.
Errors set `context.error`, which `ChatWindow` renders as a dismissible inline
banner above the input bar. The failed message bubble shows a retry button.

**React error boundary** — `<ErrorBoundary>` wraps `AppShell`. On uncaught
render error, show a full-page fallback with a "Reload" button. Do not expose
stack traces to the user.

**Ollama unreachable** — if `POST /api/greeting` returns 503, show a specific
message: "Ollama is not running. Start it with `ollama serve` and refresh."

### ⚠️ Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| Chat input has visible label | `<label htmlFor="chat-input">Message</label>` (visually hidden via `.sr-only`) |
| Send button has accessible name | `aria-label="Send message"` |
| Message list is a live region | `<div role="log" aria-live="polite" aria-label="Conversation">` |
| Thinking indicator announced | `aria-label="Limon is thinking"` + `aria-busy="true"` on the log |
| Mode cards are buttons | Native `<button>` — not `<div onClick>` |
| Keyboard: Enter to send | `onKeyDown` on textarea; Shift+Enter inserts newline |
| Keyboard: Escape dismisses overlay | `useEffect` listening to `keydown` in `OffTopicOverlay` |
| Focus management after mode select | `useEffect` focuses the chat input after `isGreetingState → false` |
| Color contrast | All text/bg combinations must meet AA (4.5:1 normal, 3:1 large text). `#2E86C1` on white = 4.6:1 ✓ |
| `<img>` for matplotlib | `alt="OS diagram — [topic name]"` derived from the visual tag |

### ⚠️ Design tokens

All colors, radii, and spacing values must be declared as CSS custom properties
in `index.css`, not hardcoded in inline styles or component files.

```css
:root {
  --color-primary:      #2E86C1;
  --color-primary-bg:   #EBF5FB;
  --color-user-bg:      #F2F3F4;
  --color-sidebar-bg:   #FAFAFA;
  --color-text-heading: #154360;
  --color-border:       #ddd;
  --radius-bubble:      12px;
  --radius-btn:         8px;
  --sidebar-width:      260px;
}
```

### ⚠️ Performance

**WASM lazy-load** — `@viz-js/viz` must be loaded with a dynamic import so it
does not block the initial bundle parse:

```ts
// App.tsx
useEffect(() => {
  import("@viz-js/viz").then(({ instance }) => instance()).then(setViz);
}, []);
```

Vite will automatically code-split this into a separate chunk. The app renders
and is interactive before the WASM loads; diagrams show a placeholder skeleton
until the viz instance is ready.

**Message list** — for conversations exceeding ~50 messages, use
`@tanstack/react-virtual` to virtualise the list and avoid rendering all
bubbles to the DOM simultaneously.

**Memoisation** — `MessageBubble` should be wrapped in `React.memo` to prevent
re-renders when only the latest streaming message changes.

**Auto-scroll** — use a `useEffect` that calls `scrollIntoView` on the last
message element. Skip auto-scroll if the user has manually scrolled up (detect
via `onScroll` and a `isUserScrolled` ref).

### ⚠️ Responsive design

The layout must work at three breakpoints:

| Breakpoint | Layout |
|---|---|
| `≥ 900px` (desktop) | Sidebar 260px + main panel side-by-side |
| `600–899px` (tablet) | Sidebar collapses to a hamburger drawer |
| `< 600px` (mobile) | Sidebar hidden; drawer toggle button in header |

Use CSS media queries, not JavaScript `window.innerWidth`.

```css
@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar   { display: none; }
  .sidebar.open { display: flex; position: fixed; z-index: 100; width: 260px; height: 100vh; }
}
```

### Graphviz rendering

```ts
// App.tsx — dynamic import, not blocking
useEffect(() => {
  import("@viz-js/viz").then(({ instance }) => instance()).then(setViz);
}, []);

// VisualRenderer.tsx — per diagram
const svg = viz.renderString(payload.data, { format: "svg" });
const clean = DOMPurify.sanitize(svg, {
  USE_PROFILES: { svg: true },
  ADD_ATTR: ["xmlns"],     // preserve namespace for correct rendering
});
<div dangerouslySetInnerHTML={{ __html: clean }} />
```

---

## ⚠️ Testing strategy

| Layer | Tool | What to test |
|---|---|---|
| Unit | Vitest | `parse_visual_tag` port, `classify_message` mock, context state transitions |
| Component | React Testing Library | `ModeSelector` renders 3 buttons; `OffTopicOverlay` Yes/No calls correct handlers; `MessageBubble` renders markdown and image |
| E2E | Playwright | Full flows: fresh greeting, mode select, chat, off-topic guard, session save/resume |

Minimum coverage gate: 70% on `src/context/` and `src/components/`.

**Key E2E scenarios:**
1. `greeting.spec.ts` — fresh load shows 3 cards; clicking Mode A triggers chat
2. `chat.spec.ts` — sending "What is a semaphore?" gets a non-empty response
3. `offtopic.spec.ts` — "Solve 2+2" shows overlay; Yes/No both dismiss it correctly
4. `session.spec.ts` — Finish Session → reload → resume message shown
5. `streaming.spec.ts` — tokens appear progressively (check DOM growth during stream)

---

## Files changed / added

| File | Change |
|---|---|
| `backend/` (9 files) | New — FastAPI server |
| `frontend/` (16 files + tests) | New — React SPA |
| `sessions/` | New — per-session JSON files (replaces single `progress.json`) |
| `.claude/specs/frontend.md` | This file |
| `app.py` | Retired — not run; kept for reference |
| `visuals.py` | Unchanged — imported by backend |
| `progress.json` | Migrated to `sessions/<uuid>.json` on first run |

---

## Acceptance criteria

| # | Test | How to verify |
|---|---|---|
| 1 | Fresh load → greeting + 3 mode cards | Manual + Playwright `greeting.spec.ts` |
| 2 | Mode A card → first reply; sidebar shows "Mode A" | Manual + Playwright |
| 3 | OS question → tokens stream in, matplotlib PNG renders | Manual streaming observation |
| 4 | Process-states question → graphviz SVG via WASM | Manual; check devtools for `wasm` resource |
| 5 | Off-topic input → overlay; input disabled | Manual + Playwright `offtopic.spec.ts` |
| 6 | "Yes, explain it" → explanation streamed; overlay dismissed | Manual |
| 7 | "No, continue" → course message; overlay dismissed | Manual |
| 8 | Finish Session → `sessions/<id>.json` written; farewell shown | Check file system |
| 9 | Reload same tab → resume message (sessionStorage id preserved) | Manual |
| 10 | New tab → fresh session (new UUID, new session file) | Manual |
| 11 | Start New Session → session file deleted; greeting shown | Manual |
| 12 | Sidebar topics list populated after discussion | Manual |
| 13 | Mode B progress bar advances as Day N appears | Manual |
| 14 | API docs at `http://localhost:8000/docs` | `curl` |
| 15 | Keyboard: Enter sends; Shift+Enter newline | Manual keyboard test |
| 16 | Keyboard: Escape dismisses off-topic overlay | Manual keyboard test |
| 17 | Screen reader announces new assistant messages | NVDA/VoiceOver manual test |
| 18 | App renders before WASM loads; diagram shows skeleton | Throttle network in devtools |
| 19 | Ollama down → specific error message shown (not spinner) | Kill Ollama, reload |
| 20 | Two tabs open → independent sessions, no corruption | Open 2 tabs, chat in both |
