# Mode B — Coursera-Style Learning UI

## Goal

When the user selects **Mode B** ("Start from zero"), replace the standard chat
layout with a Coursera-style two-panel layout that walks through all 10 OS
modules topic by topic. No video — the AI streams structured text teaching
content for each topic. After each topic the user can ask follow-up questions
(1-on-1 chat), then move to the next topic.

---

## Reference UI (Screenshot: Coursera course player)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Home              📘 Limon — OS Course Instructor        [Mode B]    │
├──────────────────────────┬──────────────────────────────────────────────┤
│  COURSE OUTLINE          │  Module 1  ›  Topic 1.1                      │
│  ────────────────────    │  ──────────────────────────────────────────  │
│  ▾ Module 1 — Intro      │                                              │
│    ✅  Topic 1.1         │   [AI teaching content streams here]         │
│    ●   Topic 1.2 ←active │   1) Concept Overview                        │
│    ○   Topic 1.3         │   2) Deep Explanation + analogies            │
│    ○   Topic 1.4         │   3) Example / Walkthrough                   │
│    ○   Topic 1.5         │   4) Connections to related topics           │
│                          │   [Visual diagram if applicable]             │
│  ▸ Module 2 — Processes  │                                              │
│  ▸ Module 3 — CPU Sched  │  ──────────────────────────────────────────  │
│  ▸ Module 4 — Sync       │  💬 Questions about this topic?              │
│  ▸ Module 5 — Memory     │                                              │
│  ▸ Module 6 — VM         │   [Q&A chat messages appear here]           │
│  ▸ Module 7 — Storage    │                                              │
│  ▸ Module 8 — I/O        │   [chat input + Send]                        │
│  ▸ Module 9 — Security   │  ──────────────────────────────────────────  │
│  ▸ Module 10 — Advanced  │   [ ✅ Got it! Move to Next Topic → ]        │
└──────────────────────────┴──────────────────────────────────────────────┘
```

---

## Topic Data (static, in frontend)

Defined in `frontend/src/data/courseOutline.ts` (extracted from instructor.md):

```ts
export interface Topic {
  id: string;        // "1.1", "2.3", etc.
  title: string;     // "What is an OS? Goals & Functions"
}

export interface Module {
  num: number;
  title: string;
  topics: Topic[];
}

export const MODULES: Module[] = [ /* all 10 modules, 46 topics */ ];

export function getNextTopicId(currentId: string): string | null { ... }
export function getTopicById(id: string): Topic | undefined { ... }
```

---

## Layout — New Component Tree

```
App.tsx
└── ChatPage
    ├── mode === "B" && !isGreetingState  →  <ModeBPage viz={viz} />
    └── mode !== "B" || isGreetingState   →  <AppShell viz={viz} />   (unchanged)
```

### New files

| File | Purpose |
|---|---|
| `frontend/src/data/courseOutline.ts` | Static module/topic data |
| `frontend/src/pages/ModeBPage.tsx` | Two-panel Coursera layout |
| `frontend/src/pages/ModeBPage.css` | Layout + sidebar styles |
| `frontend/src/components/CourseOutlineSidebar.tsx` | Left panel — module tree |
| `backend/routes/mode_b.py` | `POST /api/mode-b/teach-topic` SSE endpoint |

### Modified files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Render `ModeBPage` when `mode === "B"` |
| `frontend/src/context/SessionContext.tsx` | Add Mode B state fields + actions |
| `frontend/src/api/client.ts` | Add `api.teachTopic()` streaming call |
| `frontend/src/types.ts` | Add `TeachTopicRequest` |
| `backend/main.py` | Register `mode_b_router` at `/api/mode-b` |
| `backend/models.py` | Add `TeachTopicRequest` Pydantic model |
| `backend/services/session_store.py` | Persist `completed_topics` list |

---

## Backend

### New endpoint — `POST /api/mode-b/teach-topic`

File: `backend/routes/mode_b.py`

```python
@router.post("/teach-topic")
async def teach_topic(req: TeachTopicRequest) -> EventSourceResponse:
    """Stream structured teaching content for one topic."""
    system_prompt = load_system_prompt()

    topic_prompt = (
        f"Teach Topic {req.topic_id}: {req.topic_title}. "
        "Use the structured teaching protocol:\n"
        "1) 🔍 CONCEPT OVERVIEW — define clearly, state why it matters\n"
        "2) 🧩 DEEP EXPLANATION — sub-concepts, real-world analogies, "
        "   pseudocode or ASCII diagram if applicable\n"
        "3) 💡 EXAMPLE / WALKTHROUGH — concrete step-by-step example\n"
        "4) 🔗 CONNECTIONS — link to related OS topics, what to study next\n"
        "Do NOT include quiz questions. End with: "
        "'Feel free to ask me anything about this topic! 💬'"
    )

    async def generate():
        input_state = {
            "raw_messages": [{"role": "user", "content": topic_prompt}],
            "mode": "B",
            "user_input": topic_prompt,
            "original_off_topic": None,
            "system_prompt": system_prompt,
            "classification": "on_topic",   # skip classify_node
            "response": "", "visual_tag": "", "visual_args": "",
        }
        # Stream using instructor_node only (no classify step)
        ...
    return EventSourceResponse(generate())
```

**Pydantic model** (`backend/models.py`):
```python
class TeachTopicRequest(BaseModel):
    session_id: str
    topic_id: str    # "1.1"
    topic_title: str # "What is an OS? Goals & Functions"
```

**Session store** — add `completed_topics: list[str]` to the saved JSON:
```json
{
  "last_session": "...",
  "mode": "B",
  "messages": [...],
  "completed_topics": ["1.1", "1.2"]
}
```

Expose via `load_progress()` return value (add 4th return item) and accept via
`save_progress()`.

---

## Frontend State (`SessionContext.tsx`)

### New state fields

```ts
interface SessionState {
  // ... existing fields ...

  // Mode B specific
  currentTopicId: string;           // "1.1"  (empty = not started)
  completedTopics: string[];        // ["1.1", "1.2", ...]
  topicContent: Message | null;     // the streamed teaching block
  topicQAMessages: Message[];       // Q&A chat for current topic
  isTeachingTopic: boolean;         // true while teach-topic stream in flight

  goToTopic: (id: string) => Promise<void>;
  moveToNextTopic: () => void;
  sendTopicQuestion: (text: string) => Promise<void>;
}
```

### `goToTopic(id)`

1. Set `currentTopicId = id`
2. Set `isTeachingTopic = true`, clear `topicContent` and `topicQAMessages`
3. Call `api.teachTopic(sessionId, id, title, onEvent, signal)`
4. On `token` → append delta to `topicContent.content`
5. On `done` → set `topicContent.isStreaming = false`, attach `visual`, set `isTeachingTopic = false`
6. Save session via `api.saveSession()`

### `moveToNextTopic()`

1. Add `currentTopicId` to `completedTopics`
2. Call `getNextTopicId(currentTopicId)` → next ID or `null`
3. If next exists: call `goToTopic(next)`
4. If `null` (all done): show Module completion message
5. Persist `completedTopics` to backend

### `sendTopicQuestion(text)`

Uses existing `api.chatStream()` but scoped to `topicQAMessages` (not global
`messages`). The system prompt for Q&A is Mode B's prompt with context of the
current topic injected.

---

## Frontend Components

### `ModeBPage.tsx`

Two-column CSS Grid layout:

```tsx
<div className="mode-b-layout">
  <header className="mode-b-header">
    <button onClick={() => navigate("/")}>← Home</button>
    <span>📘 Limon — OS Course Instructor</span>
    <span className="mode-badge">🗺️ Mode B</span>
  </header>

  <div className="mode-b-body">
    <CourseOutlineSidebar />

    <main className="mode-b-main">
      <TopicBreadcrumb />        {/* "Module 1 › Topic 1.1" */}
      <TopicContentPanel />      {/* streamed teaching content + visual */}
      <TopicQASection />         {/* Q&A chat */}
      <NextTopicBar />           {/* "Got it! Move to Next Topic →" */}
    </main>
  </div>
</div>
```

### `CourseOutlineSidebar.tsx`

```tsx
{MODULES.map(mod => (
  <ModuleSection key={mod.num} module={mod}
    isExpanded={expandedModules.has(mod.num)}
    onToggle={() => toggleModule(mod.num)}
  >
    {mod.topics.map(topic => (
      <TopicRow
        key={topic.id}
        topic={topic}
        status={
          completedTopics.includes(topic.id) ? "completed" :
          topic.id === currentTopicId         ? "active"    : "pending"
        }
        onClick={() => goToTopic(topic.id)}
      />
    ))}
  </ModuleSection>
))}
```

**Topic row states:**
- `completed` → ✅ green checkmark, muted text
- `active` → ● filled blue dot, bold text, blue left border
- `pending` → ○ empty circle, normal text

Auto-expand the module that contains the `currentTopicId`.

### `TopicContentPanel.tsx`

```tsx
{!topicContent && !isTeachingTopic && (
  <StartTopicButton onClick={() => goToTopic(currentTopicId || "1.1")} />
)}

{(topicContent || isTeachingTopic) && (
  <MessageBubble
    message={topicContent ?? { role: "assistant", content: "", isStreaming: true }}
    viz={viz}
  />
)}
```

Reuses the existing `MessageBubble` + `VisualRenderer` — no new rendering logic.

### `TopicQASection.tsx`

```tsx
<section className="topic-qa">
  <h3>💬 Questions about this topic?</h3>

  <div className="qa-messages" role="log" aria-live="polite">
    {topicQAMessages.map((m, i) => <MessageBubble key={i} message={m} viz={viz} />)}
    {isThinking && <ThinkingIndicator />}
  </div>

  <form onSubmit={handleSend}>
    <textarea placeholder="Ask anything about this topic…" />
    <button type="submit">Send</button>
  </form>
</section>
```

Only shown after `topicContent` has fully loaded (`isTeachingTopic === false`).

### `NextTopicBar.tsx`

```tsx
<div className="next-topic-bar">
  <button
    className="next-topic-btn"
    onClick={moveToNextTopic}
    disabled={isTeachingTopic || isThinking}
  >
    {hasNext ? "✅ Got it! Move to Next Topic →" : "🎉 Module Complete! Continue →"}
  </button>
</div>
```

Pinned to the bottom of the main panel (sticky footer within the right column).
Always visible once teaching content has been delivered.

---

## CSS (`ModeBPage.css`)

```css
.mode-b-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.mode-b-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border);
  background: white;
}

.mode-b-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.course-outline-sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-sidebar-bg);
  overflow-y: auto;
  padding: 16px 0;
}

.module-header { ... }         /* clickable, chevron toggle */
.topic-row { ... }             /* pending / active / completed states */
.topic-row.active {
  background: var(--color-primary-bg);
  border-left: 3px solid var(--color-primary);
  font-weight: 600;
}
.topic-row.completed { color: var(--color-muted); }

/* Main panel */
.mode-b-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topic-content-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.topic-qa {
  border-top: 1px solid var(--color-border);
  padding: 16px 32px;
  max-height: 340px;
  overflow-y: auto;
}

.next-topic-bar {
  border-top: 1px solid var(--color-border);
  padding: 14px 32px;
  background: white;
}

/* Responsive */
@media (max-width: 900px) {
  .mode-b-body { grid-template-columns: 1fr; }
  .course-outline-sidebar { display: none; }
  .course-outline-sidebar.open { display: block; position: fixed; ... }
}
```

---

## User Flow (Mode B)

```
1. User clicks Mode B card on greeting screen
        ↓
2. /api/mode-select → backend sends opening message
   (mode set to "B", isGreetingState = false)
        ↓
3. App.tsx detects mode === "B" → renders <ModeBPage>
        ↓
4. ModeBPage loads:
   - CourseOutlineSidebar (all modules, Module 1 expanded)
   - Main panel shows "Start Topic 1.1" button (or auto-starts)
        ↓
5. User clicks topic / auto-start → goToTopic("1.1")
   → POST /api/mode-b/teach-topic streams content
   → MessageBubble updates token by token (isStreaming cursor)
   → On done: visual attached if applicable
        ↓
6. After content loads:
   - TopicQASection appears: "💬 Questions about this topic?"
   - NextTopicBar appears: "Got it! Move to Next Topic →"
        ↓
7a. User asks a question:
    → sendTopicQuestion() → /api/chat/stream (Q&A mode)
    → Answer streams into topicQAMessages
    → Can ask multiple follow-ups
    → "Move to Next Topic →" always available
        ↓
7b. User clicks "Move to Next Topic →":
    → moveToNextTopic()
    → currentTopicId marked complete (✅ in sidebar)
    → goToTopic("1.2") auto-starts
        ↓
8. After all topics in a module: module header shows ✅
9. After all 10 modules: show completion celebration
```

---

## Session Persistence

The `completed_topics` array is saved in `sessions/<uuid>.json` and restored on
page reload. When the user returns, `goToTopic` is called with the first
incomplete topic automatically (or the one they were on).

```json
{
  "mode": "B",
  "completed_topics": ["1.1", "1.2", "1.3"],
  "current_topic_id": "1.4",
  "messages": [...],
  "last_session": "2025-05-08T20:55:00"
}
```

---

## Build Order

1. `backend/services/session_store.py` — add `completed_topics` + `current_topic_id`
2. `backend/models.py` — add `TeachTopicRequest`
3. `backend/routes/mode_b.py` — SSE teach-topic endpoint
4. `backend/main.py` — register `/api/mode-b` router
5. `frontend/src/data/courseOutline.ts` — static module/topic data + helpers
6. `frontend/src/types.ts` — add `TeachTopicRequest`
7. `frontend/src/api/client.ts` — add `api.teachTopic()`
8. `frontend/src/context/SessionContext.tsx` — Mode B state + actions
9. `frontend/src/components/CourseOutlineSidebar.tsx`
10. `frontend/src/pages/ModeBPage.tsx` + `ModeBPage.css`
11. `frontend/src/App.tsx` — conditional render `ModeBPage`

---

## Acceptance Criteria

| # | Test |
|---|---|
| 1 | Clicking Mode B card shows the two-panel Coursera layout |
| 2 | All 10 modules appear in the left sidebar, Module 1 auto-expanded |
| 3 | Clicking a topic starts streaming its teaching content |
| 4 | Teaching content shows all 4 sections (Overview, Deep, Example, Connections) |
| 5 | Visual diagrams render inline when the AI appends a `[VISUAL:...]` tag |
| 6 | Q&A section appears after content finishes streaming |
| 7 | User can ask multiple follow-up questions before moving on |
| 8 | "Got it! Move to Next Topic →" marks topic complete + advances |
| 9 | Completed topics show ✅ in sidebar; active topic highlighted in blue |
| 10 | After all topics in a module, module header shows ✅ |
| 11 | Page reload resumes from the last active topic |
| 12 | Sidebar collapses on mobile with a toggle button |
| 13 | Mode A and Mode C still use the original AppShell layout (no regression) |
