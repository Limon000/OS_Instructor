# OS Instructor

An AI-powered Operating Systems course instructor that teaches interactively through three adaptive learning modes. Built with a FastAPI backend, React + TypeScript frontend, and a local Ollama LLM.

---

## Features

- **Three teaching modes** — single-topic Q&A, guided beginner roadmap, or assessment-based adaptive path
- **Streaming responses** — LLM tokens arrive in real time via Server-Sent Events
- **Auto-rendered visuals** — diagrams (Gantt charts, process state machines, memory hierarchies, RAID layouts, etc.) are generated server-side and displayed inline
- **Session persistence** — each browser tab gets an isolated session; page refresh resumes where you left off
- **Mode B Coursera layout** — structured two-panel course player with a 10-module outline, topic completion tracking, and per-topic Q&A
- **Off-topic guard** — non-OS questions are intercepted with a polite prompt before answering

---

## Architecture

```
browser (React/Vite :5173)  <->  FastAPI (:8000)  <->  Ollama (local LLM)
                                        |
                                   visuals.py  (matplotlib / graphviz)
                                   sessions/<uuid>.json
```

The Vite dev server proxies every `/api/*` request to `http://localhost:8000`. Sessions are stored server-side as `sessions/<uuid>.json`, keyed by a UUID generated in the browser on first load and kept in `sessionStorage`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | [Ollama](https://ollama.com) (local) |
| Backend | FastAPI, uvicorn, sse-starlette, LangGraph |
| Visuals | matplotlib, graphviz |
| Frontend | React 19, Vite 8, TypeScript 6 |
| Markdown | react-markdown + remark-gfm |
| Graphviz (browser) | @viz-js/viz (WASM) + DOMPurify |
| Testing | Vitest (unit), Playwright (E2E) |

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.com) running locally (`ollama serve`)
- A pulled model, e.g. `ollama pull llama3`

---

## Installation

### Backend

```bash
cd /path/to/OS_Instructor
pip install -r backend/requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

---

## Running

### 1. Start Ollama

```bash
ollama serve
```

### 2. Start the backend

```bash
PYTHONPATH=. uvicorn backend.main:app --reload --port 8000
```

API docs are available at `http://localhost:8000/docs`.

### 3. Start the frontend dev server

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `OLLAMA_TIMEOUT` | `60` | LLM response timeout in seconds |

Create `frontend/.env.development` for frontend config (already gitignored):

```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Teaching Modes

### Mode A — Single Topic
Ask about any specific OS topic and receive a structured response: concept overview, deep explanation with analogies, a worked example, connections to related topics, and a 3-question quiz.

### Mode B — Full Course from Zero (Coursera Layout)
A Coursera-style two-panel layout with a collapsible 10-module course outline on the left. Each topic streams structured teaching content (overview, explanation, example, connections). After content loads, a Q&A section opens for follow-up questions. Progress is persisted across page reloads.

### Mode C — Adaptive Assessment
A 5-question diagnostic determines your current level (Beginner-Intermediate / Intermediate / Advanced), then generates a personalized study roadmap that skips what you already know and focuses on gaps.

---

## Visual Diagrams

When teaching a topic, the instructor embeds a `[VISUAL:tag]` marker in its response. The backend strips the tag, generates the diagram, and sends it with the streaming `done` event.

| Tag | Diagram | Topics |
|---|---|---|
| `process_state_diagram` | State machine (New→Ready→Running→Waiting→Terminated) | 2.1 |
| `gantt_chart:P1=4,P2=3` | CPU scheduling Gantt chart | 2.2, 3.x |
| `os_layer_diagram` | OS layered architecture | 1.3 |
| `memory_hierarchy` | Memory pyramid | 5.1 |
| `paging_diagram` | Logical→Page Table→Physical grid | 5.3 |
| `page_replacement:FIFO` | Frame table with fault highlighting | 6.1 |
| `disk_scheduling:98,183,37` | Disk head movement chart | 7.4 |
| `raid_diagram:RAID5` | RAID block layout | 7.5 |
| `semaphore_diagram` | Producer→Buffer→Consumer flow | 4.2 |
| `dining_philosophers` | Circular philosopher–fork graph | 4.3 |

matplotlib diagrams are sent as base64 PNG; Graphviz diagrams are sent as DOT source and rendered in the browser via WASM.

---

## Project Structure

```
OS_Instructor/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, CSP, router registration
│   ├── models.py                # Pydantic request/response schemas
│   ├── requirements.txt
│   ├── routes/
│   │   ├── chat.py              # /api/greeting, /api/chat/stream, /api/mode-select
│   │   ├── mode_b.py            # /api/mode-b/teach-topic (SSE, Mode B only)
│   │   ├── session.py           # GET/POST/DELETE /api/session, /api/session/finish
│   │   └── visual.py            # POST /api/visual (standalone test)
│   └── services/
│       ├── graph.py             # LangGraph pipeline
│       ├── llm.py               # classify_message, aria_respond_stream, parse_visual_tag
│       ├── session_store.py     # save/load/delete sessions/<uuid>.json
│       └── visual_service.py    # serialize_visual — wraps visuals.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root — routes to AppShell or ModeBPage
│   │   ├── types.ts             # Shared TypeScript types
│   │   └── ...                  # Components, context, pages, API client
│   ├── e2e/                     # Playwright end-to-end tests
│   ├── package.json
│   └── vite.config.ts
├── sessions/                    # Per-session JSON files (gitignored)
├── visuals.py                   # All diagram renderer functions + VISUAL_MAP
├── app.py                       # Legacy Streamlit entry (retired, kept for reference)
└── .claude/
    ├── instructor.md            # LLM system prompt — all teaching rules + visual tagging
    └── specs/                   # Architecture specs for each major feature
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/greeting` | Returns greeting or resume-welcome message |
| GET | `/api/chat/stream` | SSE stream — classifies input, streams LLM response |
| POST | `/api/mode-select` | Runs mode initialisation, returns first mode message |
| POST | `/api/mode-b/teach-topic` | SSE stream — structured topic teaching (Mode B) |
| GET | `/api/session` | Read session by `?session_id=` |
| POST | `/api/session/save` | Write session |
| DELETE | `/api/session` | Delete session |
| POST | `/api/session/finish` | Save + generate farewell message |
| POST | `/api/visual` | Render a single visual tag independently |

SSE event protocol:

```
data: {"type":"token","delta":"Here is"}
data: {"type":"done","visual":{"kind":"matplotlib","data":"iVBOR..."}}
data: {"type":"error","message":"Ollama unreachable"}
```

---

## Testing

```bash
# Unit + component tests
cd frontend && npm test

# End-to-end tests (requires backend + Ollama running)
cd frontend && npm run test:e2e
```

Key E2E scenarios: fresh greeting → mode selection, streaming chat, off-topic overlay (Yes/No), session save/resume, two isolated tabs.

---

## Course Outline

10 modules, 46 topics — from OS fundamentals through advanced topics:

1. Introduction to Operating Systems
2. Process Management
3. CPU Scheduling
4. Process Synchronization
5. Memory Management
6. Virtual Memory
7. Storage & File Systems
8. I/O Systems
9. Security & Protection
10. Advanced Topics (Distributed Systems, Virtualization, Cloud, Linux Internals)

Primary reference: *Operating System Concepts* — Silberschatz, Galvin & Gagne (10th ed.)
