# Mode C — Knowledge Assessment

## Overview

Mode C is the **Assessment First** learning mode. It is triggered when a user
claims prior OS knowledge. The instructor runs a structured 4-step diagnostic
protocol — 5 targeted questions → level classification → personalised roadmap →
adapted teaching — all through the normal chat stream.

Route: `/mode-c` — dedicated page (`ModeCPage.tsx`). Navigated to from
`ModeSelectPage` when the user clicks the Mode C card.

---

## Trigger Conditions

Mode C is selected when:
- Clicking the **Mode C — Assessment First** card on `ModeSelectPage` (`/select`)
- User says phrases like "I know a bit about OS", "I studied this before",
  "I understand processes but not memory management" (inline `ModeSelector`)

---

## Assessment Protocol (4 Steps)

### Step 1 — Diagnostic Interview

The instructor asks **5 targeted questions**, one at a time, spanning different
modules:

```
Q1. What is the difference between a process and a thread?
Q2. Explain how the Banker's Algorithm works.
Q3. What causes thrashing and how is it resolved?
Q4. Compare SCAN vs C-SCAN disk scheduling.
Q5. What is a page fault and what happens after one occurs?
```

Questions are asked sequentially — the next question is only asked after the
user responds to the previous one. The instructor does NOT dump all 5 at once.

### Step 2 — Evaluate Responses

After all 5 answers, the instructor classifies the user into one of three levels:

| Level | Badge | Meaning |
|---|---|---|
| Beginner-Intermediate | 🟡 | Knows basics, unclear on mechanisms |
| Intermediate | 🟠 | Understands core topics, weak on advanced ones |
| Advanced | 🟢 | Solid grasp, needs depth on edge cases and internals |

### Step 3 — Generate Personalised Roadmap

Based on the diagnosed level, the instructor builds a custom study plan:

- **Skip** topics the user clearly knows
- **Review** topics with partial understanding
- **Focus** on topics where the user is weak
- **Deep Dive** on topics never covered

Example output for an Intermediate user:
```
✅ Skip:       Module 1 (knows OS basics)
✅ Skip:       Module 2 (understands processes)
🔁 Review:    Module 3 (CPU Scheduling — some gaps)
📚 Focus:     Module 4, 5, 6 (Sync, Memory, VM — weak)
📚 Deep Dive: Module 9, 10 (Security & Advanced — never covered)
```

### Step 4 — Teach According to Personalised Roadmap

The instructor follows the same day-by-day format as Mode B but adapted:
- More advanced language for competent areas
- Skips foundational hand-holding where the user is already strong
- Uses the Mode A 5-section teaching protocol for each assigned topic

---

## Mode Initialization

When Mode C is selected, the frontend calls `POST /api/mode-select` with
`mode="C"`. The backend uses `_MODE_INIT_PAYLOAD["C"]` (`llm.py:23`):

```python
"C": "Immediately begin the KNOWLEDGE ASSESSMENT PROTOCOL. Ask the user the 5 diagnostic questions now."
```

The instructor responds by asking the **first** diagnostic question only (not
all 5 at once). This response is shown as the first chat bubble in `ModeCPage`.

Unlike Mode A there is **no generic greeting** — Mode C goes straight into
the first diagnostic question.

---

## LLM System Prompt (Mode C)

Active prompt during Mode C streaming chat (`llm.py:45` and `graph.py:56`):

```
You are Limon, an expert Operating Systems instructor.
The user has some prior OS knowledge.
Ask them exactly 5 diagnostic questions, one at a time, covering:
processes vs threads, Banker's Algorithm, thrashing, disk scheduling, page faults.
After all answers, classify their level as Beginner-Intermediate, Intermediate, or Advanced
and give a personalized study plan. Never show a menu or greeting.
```

This overrides the full `instructor.md` for all streaming chat calls in Mode C.

---

## Off-Topic Guard in Mode C

Mode C uses the same 3-way LangGraph classifier as Mode A (`graph.py:106`):

| Classification | Action |
|---|---|
| `on_topic` | Route to `instructor_node` → stream response |
| `casual` | Route to `instructor_node` → brief warm reply (1–3 sentences) |
| `off_topic` | Return `{"type":"offtopic"}` event → show `OffTopicOverlay` |

**Important:** During the 5-question assessment, most user messages (e.g.,
"I know about processes but not threads") classify as `on_topic` since they
directly relate to OS knowledge. The off-topic guard only fires for genuinely
unrelated messages (creative writing, math, etc.).

**Off-topic overlay flow** (identical to Mode A):
1. `SessionContext` sets `pendingOffTopic = userInput`
2. `OffTopicOverlay` renders with Yes / No buttons; input is disabled
3. **Yes** → streams a brief off-topic explanation, then returns to assessment
4. **No** → dismisses overlay, resumes assessment from where it left off

**Overlay keyboard:** Escape key dismisses the overlay (`OffTopicOverlay.tsx`).

---

## Visual Diagrams

Mode C may render visuals during Step 4 (personalised teaching). The same
visual tag library as Mode A applies:

| Tag | Diagram | Triggered when |
|---|---|---|
| `[VISUAL:process_state_diagram]` | State machine (graphviz) | Teaching Topic 2.1 |
| `[VISUAL:gantt_chart:P1=4,P2=3]` | Scheduling Gantt (matplotlib) | Topics 2.2, 3.x |
| `[VISUAL:os_layer_diagram]` | OS layers (graphviz) | Topic 1.3 |
| `[VISUAL:memory_hierarchy]` | Memory pyramid (matplotlib) | Topic 5.1 |
| `[VISUAL:paging_diagram]` | Page table grid (matplotlib) | Topic 5.3 |
| `[VISUAL:page_replacement:FIFO]` | Frame table (matplotlib) | Topic 6.1 |
| `[VISUAL:disk_scheduling:98,183,37]` | Head movement chart (matplotlib) | Topic 7.4 |
| `[VISUAL:raid_diagram:RAID5]` | RAID block layout (matplotlib) | Topic 7.5 |
| `[VISUAL:semaphore_diagram]` | Producer→Buffer→Consumer (graphviz) | Topic 4.2 |
| `[VISUAL:dining_philosophers]` | Philosopher–fork graph (graphviz) | Topic 4.3 |

Visuals are **unlikely during the diagnostic phase** (Q1–Q5). They appear
primarily during Step 4 personalised teaching.

---

## Session Handling

Identical to Mode A:

- `sessionId` → UUID4 in `sessionStorage`; generated by `getOrCreateSessionId()`
  in `SessionContext.tsx:13`.
- No auto-save on every chat turn; the "Finish Session" button triggers
  `POST /api/session/finish`.
- **Resume** → on reload, `GET /api/session` restores `messages` and `mode="C"`;
  `POST /api/greeting` generates a resume welcome that lists covered questions.
- **New Session** → deletes session file, reloads the page with a new UUID.

---

## Frontend Components (Mode C)

### Routing

| Path | Component | Condition |
|---|---|---|
| `/select` | `ModeSelectPage` | User picks Mode C card → `navigate("/mode-c")` |
| `/mode-c` | `ModeCLearningPage` → `ModeCPage` | Dedicated route (`App.tsx`) |

### Component tree

```
App
└── ModeCLearningPage (SessionProvider autoMode="C")
    └── ErrorBoundary
        └── ModeCPage (viz)
            ├── Sidebar
            │   ├── ModeBadge        shows "🧪 Mode C — Assessment"
            │   ├── TopicsExpander   regex /Topic \d+\.\d+/g on assistant msgs
            │   ├── FinishSessionBtn POST /api/session/finish
            │   └── NewSessionBtn    DELETE /api/session → reload
            └── mc-main
                ├── mc-header        ← Home button + title
                └── [conditional on hasUserMessages]
                    ├── mc-empty     centered layout (before first user msg)
                    │   ├── 🧪 icon (56px, purple drop-shadow)
                    │   ├── "Hello! I'm Limon,"
                    │   ├── "your Operating System knowledge assessor."
                    │   ├── hint text
                    │   └── Claude-style rounded input (↑ send button)
                    └── mc-chat      scrollable messages + bottom input bar
                        ├── mc-log   (role="log" aria-live="polite")
                        │   └── MessageBubble[] + ThinkingIndicator
                        ├── OffTopicOverlay (when pendingOffTopic !== null)
                        └── mc-chat-form (textarea + Send button)
```

Note: `ProgressBar` is **not** shown in Mode C (Mode B only).

### ModeSelectPage (`frontend/src/pages/ModeSelectPage.tsx`)

Mode C card definition:
```typescript
{
  key: "C",
  icon: "🧪",
  title: "Mode C",
  subtitle: "Assessment First",
  desc: "Take a quick diagnostic quiz and get a personalized study plan tailored to your current knowledge level.",
  features: ["5-question diagnostic", "Identify knowledge gaps",
             "Custom study plan", "Targeted learning path"],
  color: "#7c3aed",
}
```
Clicking calls `navigate("/mode-c")`.

### ModeCPage (`frontend/src/pages/ModeCPage.tsx`)

Two-state layout keyed on `hasUserMessages`:

**Empty state** (`hasUserMessages === false`):
- Centered column, max-width 640px
- `🧪` icon (56px, purple drop-shadow)
- Title: `"Hello! I'm Limon,"`
- Subtitle: `"your Operating System knowledge assessor."`
- Hint: `"Tell me about your OS background and I'll build a personalised study plan."`
- Input placeholder: `"Tell me about your OS knowledge..."`
- Circular purple `↑` send button inside a rounded-18px input card with focus glow

**Chat state** (`hasUserMessages === true`):
- Scrollable `mc-log` with `MessageBubble` components
- `OffTopicOverlay` when `pendingOffTopic !== null`
- Bottom `mc-chat-form` with textarea + `Send` button

### CSS Accent Colour (`ModeCPage.css`)

Mode C uses `#7c3aed` (purple) for all interactive elements:

```css
:root {
  --color-c-primary:       #7c3aed;
  --color-c-primary-hover: #6d28d9;
  --color-c-primary-bg:    #f5f3ff;
}
```

These tokens apply to: send button, input focus ring, back button hover,
error retry button.

---

## Backend Endpoints (Mode C)

| Method | Path | Used by Mode C |
|---|---|---|
| `POST` | `/api/greeting` | Initial greeting / resume-session message |
| `POST` | `/api/mode-select` | Mode C init (first diagnostic question) |
| `POST` | `/api/chat/stream` (SSE) | Every user message; classifies + streams |
| `GET` | `/api/session` | Restore messages on reload |
| `POST` | `/api/session/finish` | Finish Session button |
| `DELETE` | `/api/session` | New Session button |

The streaming endpoint (`chat.py:69`) uses LangGraph (`graph.py`) with:
- **classify_node** → 3-way: `on_topic` / `casual` / `off_topic`
- **instructor_node** → streams tokens using `_MODE_SYSTEM_PROMPTS["C"]`
- **parse_visual_node** → strips `[VISUAL:...]` tag; attaches to `done` event

The `mode="C"` field on every `ChatRequest` ensures `instructor_node` picks
the correct assessment system prompt.

---

## Accessibility Requirements

| Requirement | Implementation |
|---|---|
| Chat input has label | `<label htmlFor="mc-empty-input">` / `<label htmlFor="mc-chat-input">` via `.sr-only` |
| Send button | `aria-label="Send message"` on both empty and chat state buttons |
| Message list | `role="log" aria-live="polite" aria-label="Conversation"` |
| Thinking indicator | `aria-busy={isThinking}` on the log div |
| Mode cards | Native `<button>` on `ModeSelectPage` |
| Enter to send | `onKeyDown` on textarea; Shift+Enter inserts newline |
| Escape dismisses overlay | `useEffect keydown` inside `OffTopicOverlay` |
| Auto-focus input | `useEffect` focuses textarea when `isThinking` resolves |

---

## Acceptance Criteria

| # | Scenario | How to verify |
|---|---|---|
| C-1 | `/select` shows Mode C card with purple color and correct copy | Visual check |
| C-2 | Clicking Mode C card navigates to `/mode-c` | Manual |
| C-3 | Empty state shows `🧪` icon, title, subtitle, hint, centered input | Visual check |
| C-4 | Empty state input has purple focus ring when focused | Manual keyboard / click |
| C-5 | Typing in empty state and pressing Enter submits first message | Manual |
| C-6 | After first message, layout transitions to chat state | Manual |
| C-7 | Mode init response asks only the first diagnostic question (not all 5) | Manual |
| C-8 | Each question is asked one at a time as conversation progresses | Manual — answer Q1, confirm Q2 appears |
| C-9 | After Q5, instructor outputs level classification (🟡/🟠/🟢) | Manual |
| C-10 | After classification, personalised roadmap shown (Skip/Review/Focus/Deep Dive) | Manual |
| C-11 | Step 4 teaching uses Mode A 5-section protocol for each assigned topic | Manual |
| C-12 | Visuals appear during Step 4 teaching (e.g. paging → `paging_diagram`) | Manual + devtools |
| C-13 | Off-topic message during assessment shows overlay; input disabled | Manual |
| C-14 | "Yes, explain it" → brief explanation → returns to assessment | Manual |
| C-15 | "No, continue" → overlay dismissed; assessment resumes | Manual |
| C-16 | Escape dismisses off-topic overlay | Manual keyboard |
| C-17 | Casual message ("Good morning!") gets brief warm reply; assessment continues | Manual |
| C-18 | Sidebar shows `"🧪 Mode C — Assessment"` badge | Visual check |
| C-19 | Sidebar TopicsExpander populates once Step 4 teaching begins | Manual — after roadmap starts |
| C-20 | Finish Session saves `sessions/<id>.json`; farewell shown | Check file system |
| C-21 | Reload same tab → resume welcome summarising covered questions | Manual (sessionStorage) |
| C-22 | New tab → fresh session (new UUID, fresh first question) | Open 2 tabs |
| C-23 | Enter sends; Shift+Enter inserts newline | Manual keyboard |
| C-24 | Screen reader announces new assessment questions as they stream | VoiceOver / NVDA |
