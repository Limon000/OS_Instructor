# Mode A — Single Topic Teaching

## Overview

Mode A is the **Topic Explorer** learning mode. It is triggered when a user asks
about a specific OS concept and delivers a structured, 5-section explanation with
a 3-question quiz, optional visual diagrams, and an off-topic guard.

Route: `/mode-a` — dedicated page (`ModeAPage.tsx`). Navigated to from
`ModeSelectPage` when the user clicks the Mode A card.

---

## Trigger Conditions

Mode A is selected when the user's first message matches one of:
- A direct topic question: "Explain paging", "What is a semaphore?"
- A how-does-it-work question: "How does Round Robin work?"
- Clicking the **Mode A — Topic Explorer** card on `ModeSelectPage` (`/select`)
- Clicking the **Mode A — Ask a Topic** card in the inline `ModeSelector`
  (shown when `isGreetingState === true` inside `AppShell`)

---

## Teaching Protocol (5 Sections)

When a user names an OS topic, the instructor responds with this structure in
a single streaming response:

```
1. 🔍 CONCEPT OVERVIEW
   - Define the topic clearly in plain language
   - State WHY it matters in the OS context

2. 🧩 DEEP EXPLANATION
   - Break down with sub-concepts
   - Use real-world analogies (kitchens, offices, traffic)
   - Show pseudocode or ASCII diagram if applicable

3. 💡 EXAMPLE / WALKTHROUGH
   - Concrete, step-by-step example
   - If algorithm-based, trace through with sample data

4. 🔗 CONNECTIONS
   - Link to related OS concepts
   - Mention prerequisite and follow-on topics

5. ✅ QUICK QUIZ (3 questions)
   - Q1: Factual (recall)
   - Q2: Conceptual (explain/compare)
   - Q3: Applied (problem-solving / trace)
   - Wait for user answers before giving feedback
```

The instructor DOES NOT show a greeting or mode menu inside Mode A — the
`_MODE_SYSTEM_PROMPTS["A"]` in `backend/services/llm.py:30` enforces this.

---

## Mode Initialization

When Mode A is selected, the frontend calls `POST /api/mode-select` with
`mode="A"`. The backend uses `_MODE_INIT_PAYLOAD["A"]` (llm.py:21):

```python
"A": "Greet the user briefly. Say exactly: '👋 Hello! I'm Limon, your Operating System course instructor.\nHow can I help you today?' — nothing else."
```

The instructor responds with a short greeting only. The user then asks any OS
topic freely. This response is appended as the second assistant bubble.

---

## LLM System Prompt (Mode A)

Active prompt during Mode A chat (`backend/services/llm.py:26`):

```
You are Limon, an expert Operating Systems instructor.
The user wants to learn about a specific OS topic.
When they name a topic, explain it with:
1) a clear overview, 2) detailed explanation with analogies,
3) a concrete example or pseudocode, 4) connections to related topics,
5) three quiz questions.
Be warm, structured, and educational. Never show a menu or greeting.
```

This prompt overrides the full `instructor.md` for streaming chat calls. The
full `instructor.md` is used only for greeting and resume-session generation.

---

## Quiz Feedback Protocol

After the user submits answers to the 3 quiz questions:

- **Correct answers** → reinforce with a brief explanation
- **Wrong answers** → identify the misconception, re-explain with a new analogy,
  then re-ask a similar question to confirm understanding

The quiz is conducted in the normal chat stream — no separate endpoint.

---

## Off-Topic Guard in Mode A

During Mode A, every user message passes through the 3-way classifier in
`backend/services/graph.py` (LangGraph `classify_node`):

| Classification | Action |
|---|---|
| `on_topic` | Route to `instructor_node` → stream response |
| `casual` | Route to `instructor_node` → brief warm reply (1–3 sentences) |
| `off_topic` | Return `{"type":"offtopic"}` event → show `OffTopicOverlay` |

**Off-topic overlay flow:**
1. `SessionContext` sets `pendingOffTopic = userInput`
2. `OffTopicOverlay` renders with Yes / No buttons; `ChatInputBar` is disabled
3. **Yes** → `confirmOffTopicYes()` calls `/api/chat/stream` with
   `original_off_topic=userInput`, `user_input="Yes, explain it"` → brief
   explanation streamed, then invitation to return to OS
4. **No** → `confirmOffTopicNo()` appends "No, continue the course" message
   and a course-redirect reply; no API call needed

Ambiguous messages (e.g., "explain scheduling") default to `on_topic`.
OS-internals questions (system calls, concurrency, memory allocation) are
always `on_topic`.

**Overlay keyboard:** Escape key dismisses the overlay (handled by
`useEffect` on `keydown` inside `OffTopicOverlay`).

---

## Visual Diagrams

Mode A topics that have a matching visual renderer append ONE tag at the end of
the LLM response. The tag is stripped before display; the visual is sent in the
SSE `done` event as a `VisualPayload`.

| Tag | Diagram | Used for |
|---|---|---|
| `[VISUAL:process_state_diagram]` | State machine (graphviz) | Topic 2.1 |
| `[VISUAL:gantt_chart:P1=4,P2=3]` | Scheduling Gantt (matplotlib) | Topics 2.2, 3.x |
| `[VISUAL:os_layer_diagram]` | OS layers (graphviz) | Topic 1.3 |
| `[VISUAL:memory_hierarchy]` | Memory pyramid (matplotlib) | Topic 5.1 |
| `[VISUAL:paging_diagram]` | Page table grid (matplotlib) | Topic 5.3 |
| `[VISUAL:page_replacement:FIFO]` | Frame table (matplotlib) | Topic 6.1 |
| `[VISUAL:disk_scheduling:98,183,37]` | Head movement chart (matplotlib) | Topic 7.4 |
| `[VISUAL:raid_diagram:RAID5]` | RAID block layout (matplotlib) | Topic 7.5 |
| `[VISUAL:semaphore_diagram]` | Producer→Buffer→Consumer (graphviz) | Topic 4.2 |
| `[VISUAL:dining_philosophers]` | Philosopher–fork graph (graphviz) | Topic 4.3 |

`VisualRenderer` in `frontend/src/components/VisualRenderer.tsx` renders:
- **matplotlib** → `<img>` with base64 PNG; `alt="OS diagram — [topic name]"`
- **graphviz** → DOT → SVG via `@viz-js/viz` WASM, sanitised with DOMPurify

---

## Session Handling

- `sessionId` is a UUID4 stored in `sessionStorage` (survives refresh, not new
  tabs) and generated by `getOrCreateSessionId()` in `SessionContext.tsx:13`.
- On every `/api/chat/stream` call, the frontend includes `session_id`,
  `messages`, `mode="A"`, and `user_input`.
- The backend does NOT auto-save after every chat turn in Mode A.
  `POST /api/session/save` is called explicitly by the "Finish Session" button.
- **Finish Session** → `POST /api/session/finish` → saves
  `sessions/{session_id}.json` and returns a farewell message.
- **Resume** → on reload, `GET /api/session?session_id=` restores `messages`
  and `mode`; `POST /api/greeting` generates the resume welcome message using
  the `[RESUME_SESSION]` trigger.

---

## Frontend Components (Mode A)

### Routing

| Path | Component | Condition |
|---|---|---|
| `/select` | `ModeSelectPage` | User picks Mode A card → navigates to `/chat?autoMode=A` |
| `/chat` | `ChatPage` → `AppShell` | Mode A or C (not B) |

### Component tree for Mode A

```
App
└── ChatPage (SessionProvider autoMode="A")
    └── ErrorBoundary
        └── AppShell
            ├── Sidebar
            │   ├── ModeBadge        shows "Mode A"
            │   ├── TopicsExpander   regex /Topic \d+\.\d+/g on assistant msgs
            │   ├── FinishSessionBtn POST /api/session/finish
            │   └── NewSessionBtn    DELETE /api/session → reload
            └── main
                ├── Header           ← Home button + title
                └── ChatWindow (viz)
                    ├── ModeSelector  shown only when isGreetingState===true
                    ├── MessageBubble[] (react-markdown + VisualRenderer)
                    ├── ThinkingIndicator (aria-busy while isThinking)
                    ├── OffTopicOverlay (shown when pendingOffTopic !== null)
                    └── ChatInputBar  (disabled while pendingOffTopic !== null)
```

Note: `ProgressBar` is **not** shown in Mode A (Mode B only).

### ModeSelectPage (`frontend/src/pages/ModeSelectPage.tsx`)

Full-page card picker at `/select`. Mode A card:
```
icon: "📖"
title: "Mode A"
subtitle: "Topic Explorer"
color: "#2E86C1"
features: ["Ask any topic freely", "Deep structured explanations",
           "Visual diagrams", "Quiz questions per topic"]
```
Clicking it calls `navigate("/chat", { state: { autoMode: "A" } })`.

### ModeSelector (`frontend/src/components/ModeSelector.tsx`)

Inline 3-card selector rendered inside `ChatWindow` when `isGreetingState===true`.
Mode A card calls `selectMode("A")` → `POST /api/mode-select`.

### ChatWindow / MessageBubble

- Each assistant turn is a `MessageBubble` with `react-markdown` + `remark-gfm`.
- While streaming, `isStreaming: true` sets a blinking cursor.
- On `done` event, `visual` is attached to the message and rendered by
  `VisualRenderer`.
- Message list has `role="log" aria-live="polite"` for screen-reader announce.

---

## Backend Endpoints (Mode A)

| Method | Path | Used by Mode A |
|---|---|---|
| `POST` | `/api/greeting` | Initial greeting / resume-session message |
| `POST` | `/api/mode-select` | Mode A initialization (topic list + topic prompt) |
| `POST` | `/api/chat/stream` (SSE) | Every user message; classifies + streams response |
| `GET` | `/api/session` | Restore messages on reload |
| `POST` | `/api/session/finish` | Finish Session button |
| `DELETE` | `/api/session` | New Session button |

The streaming endpoint (`chat.py:69`) uses LangGraph (`graph.py`) with two nodes:
- **classify_node** → calls classifier LLM, sets `state["classification"]`
- **instructor_node** → streams tokens from Mode A system prompt; strips visual tag

---

## Accessibility Requirements

| Requirement | Implementation |
|---|---|
| Chat input has label | `<label htmlFor="chat-input">` visually hidden via `.sr-only` |
| Send button | `aria-label="Send message"` |
| Message list | `role="log" aria-live="polite" aria-label="Conversation"` |
| Thinking indicator | `aria-label="Limon is thinking"` + `aria-busy="true"` |
| Mode cards | Native `<button>`, not `<div onClick>` |
| Enter to send | `onKeyDown` on textarea; Shift+Enter inserts newline |
| Escape dismisses overlay | `useEffect keydown` in `OffTopicOverlay` |
| Focus after mode select | `useEffect` focuses chat input when `isGreetingState → false` |

---

## Acceptance Criteria

| # | Scenario | How to verify |
|---|---|---|
| A-1 | `/select` shows Mode A card with correct copy and color | Visual check |
| A-2 | Clicking Mode A card navigates to `/chat` and shows topic list | Manual |
| A-3 | Asking "What is paging?" returns 5-section response (Overview → Quiz) | Manual |
| A-4 | Quiz waits for user answers before giving feedback | Manual |
| A-5 | Correct quiz answer gets a reinforcing explanation | Manual |
| A-6 | Wrong quiz answer gets re-explanation + similar follow-up question | Manual |
| A-7 | Paging question renders `[VISUAL:paging_diagram]` as image | Manual + devtools |
| A-8 | Process states question renders graphviz SVG | Manual; check for `wasm` resource |
| A-9 | Off-topic message shows overlay; input is disabled | Manual + Playwright `offtopic.spec.ts` |
| A-10 | "Yes, explain it" streams explanation then returns to OS | Manual |
| A-11 | "No, continue the course" dismisses overlay; OS reply appears | Manual |
| A-12 | Escape key dismisses off-topic overlay | Manual keyboard test |
| A-13 | Casual message ("Good morning!") gets brief warm reply, no off-topic guard | Manual |
| A-14 | Sidebar shows "Mode A" badge | Visual check |
| A-15 | Sidebar TopicsExpander lists topics mentioned in the session | After discussing 2+ topics |
| A-16 | Finish Session saves `sessions/<id>.json`; farewell shown | Check file system |
| A-17 | Reload same tab → resume welcome listing covered topics | Manual (sessionStorage) |
| A-18 | New tab → fresh session (new UUID, fresh greeting) | Open 2 tabs |
| A-19 | Enter sends; Shift+Enter inserts newline | Manual keyboard |
| A-20 | Screen reader announces new assistant messages | VoiceOver / NVDA |
