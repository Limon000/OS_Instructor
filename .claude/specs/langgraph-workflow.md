# LangGraph Chat Workflow

## Source

`backend/services/graph.py` — compiled once at startup as `chat_graph`.
Invoked per request in `backend/routes/chat.py` via `chat_graph.astream_events()`.

---

## State Schema (`ChatState`)

```python
class ChatState(TypedDict):
    raw_messages:      list[dict]    # full conversation history (role/content dicts)
    mode:              str           # "A" | "B" | "C"
    user_input:        str           # latest user message text
    original_off_topic: Optional[str] # set when user says "Yes, explain it"
    system_prompt:     str           # full instructor.md content
    classification:    str           # "on_topic" | "casual" | "off_topic"
    response:          str           # final assistant text (visual tag stripped)
    visual_tag:        str           # e.g. "paging_diagram"
    visual_args:       str           # e.g. "FIFO" or "98,183,37"
```

---

## Full Workflow Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              ChatState (shared)              │
                    │  raw_messages, mode, user_input,            │
                    │  original_off_topic, system_prompt,         │
                    │  classification, response,                  │
                    │  visual_tag, visual_args                    │
                    └─────────────────────────────────────────────┘

                                      │
                                    START
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  classify_node   │  ← _classifier_llm (temp=0)
                            │                  │
                            │  Prompt: Is the  │
                            │  user_input...   │
                            │  ON_TOPIC?       │
                            │  CASUAL?         │
                            │  OFF_TOPIC?      │
                            └────────┬─────────┘
                                     │
                          sets classification =
                          "on_topic" | "casual" | "off_topic"
                                     │
                    ┌────────────────┴────────────────┐
                    │  route_after_classify()          │
                    │  (conditional edge)              │
                    └────────────┬───────────-─────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │ off_topic                            │ on_topic OR casual
              ▼                                      ▼
   ┌─────────────────────┐             ┌──────────────────────┐
   │   off_topic_node    │             │   instructor_node    │  ← _llm (async)
   │                     │             │                      │
   │  Builds the         │             │  Two sub-paths:      │
   │  "📌 Just so you    │             │                      │
   │  know..." message   │             │  [A] original_off_   │
   │  using first 6      │             │  topic set?          │
   │  words of input     │             │  → "Briefly explain  │
   │  as {topic}         │             │    {topic}, then     │
   │                     │             │    back to OS 📘"    │
   │  Sets:              │             │                      │
   │  response = msg     │             │  [B] normal turn:    │
   │  visual_tag = ""    │             │  → _MODE_SYSTEM_     │
   │  visual_args = ""   │             │    PROMPTS[mode] +   │
   └──────────┬──────────┘             │    full history      │
              │                        │                      │
             END                       │  Sets: response      │
                                       └──────────┬───────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  parse_visual_node   │
                                       │                      │
                                       │  Regex search for    │
                                       │  [VISUAL:tag:args]   │
                                       │  in response         │
                                       │                      │
                                       │  Found → strips tag, │
                                       │  sets visual_tag +   │
                                       │  visual_args         │
                                       │                      │
                                       │  Not found → passes  │
                                       │  response unchanged  │
                                       └──────────┬───────────┘
                                                  │
                                                 END
```

---

## Nodes

### `classify_node` (sync)

```python
def classify_node(state: ChatState) -> dict:
    prompt = _CLASSIFIER_PROMPT.format(message=state["user_input"])
    result = _classifier_llm.invoke([HumanMessage(content=prompt)])
    text = result.content.strip().upper()
    if text.startswith("CASUAL"):    return {"classification": "casual"}
    if text.startswith("OFF_TOPIC"): return {"classification": "off_topic"}
    return {"classification": "on_topic"}   # default / fallback
```

- Uses `_classifier_llm` with `temperature=0` for deterministic output.
- Classifier error → defaults to `"on_topic"` (safe fallback, avoids false positives).
- Three categories:

| Label | Meaning | Example |
|---|---|---|
| `ON_TOPIC` | OS-related question | "What is paging?" |
| `CASUAL` | Social / emotional message | "Good morning!", "Thanks!" |
| `OFF_TOPIC` | Unrelated to OS | "Solve 2+2", "Write me a poem" |

---

### `off_topic_node` (sync)

```python
def off_topic_node(state: ChatState) -> dict:
    msg = OFF_TOPIC_MSG.format(topic=_short_label(state["user_input"]))
    return {"response": msg, "visual_tag": "", "visual_args": ""}
```

- Produces a fixed template response — **no LLM call**.
- `_short_label()` takes the first 6 words of `user_input` as the topic label.
- Goes directly to `END` — skips `parse_visual_node`.

---

### `instructor_node` (async)

```python
async def instructor_node(state: ChatState) -> dict:
    if state.get("original_off_topic"):
        # "Yes, explain it" path
        messages = [SystemMessage(...), HumanMessage(f"Briefly explain: {original_off_topic}...")]
    else:
        # Normal teaching path
        active_sys = _MODE_SYSTEM_PROMPTS.get(state["mode"], state["system_prompt"])
        messages = _dicts_to_langchain(state["raw_messages"], active_sys)
    result = await _llm.ainvoke(messages)
    return {"response": result.content}
```

- Uses `_llm` (async) so `astream_events` can stream tokens to the frontend.
- **Sub-path A** (`original_off_topic` set): brief off-topic explanation → "back to OS 📘"
- **Sub-path B** (normal): picks system prompt by `mode` ("A"/"B"/"C") and passes full conversation history.
- `casual` messages take sub-path B and receive a warm 1–3 sentence reply.

---

### `parse_visual_node` (sync)

```python
def parse_visual_node(state: ChatState) -> dict:
    match = _VISUAL_RE.search(state["response"])
    if not match:
        return {"response": text, "visual_tag": "", "visual_args": ""}
    clean = _VISUAL_RE.sub("", text).strip()
    return {"response": clean, "visual_tag": match.group(1).lower(), "visual_args": match.group(2) or ""}
```

- Regex: `\[VISUAL:([a-z_]+)(?::([^\]]*))?\]`
- Strips the tag from `response` before the frontend receives it.
- `visual_tag` + `visual_args` are passed to `serialize_visual()` in `chat.py`
  and sent in the SSE `done` event as a `VisualPayload`.

---

## Edge Map

```python
builder.add_edge(START, "classify_node")
builder.add_conditional_edges("classify_node", route_after_classify)
#   off_topic → off_topic_node → END
#   on_topic / casual → instructor_node → parse_visual_node → END
builder.add_edge("off_topic_node", END)
builder.add_edge("instructor_node", "parse_visual_node")
builder.add_edge("parse_visual_node", END)
```

---

## LLM Instances

| Instance | Model | Temperature | Usage |
|---|---|---|---|
| `_classifier_llm` | `qwen2.5-coder:7b` | `0` | `classify_node` — deterministic labels |
| `_llm` | `qwen2.5-coder:7b` | default | `instructor_node` — streamed teaching responses |

Both timeout after `OLLAMA_TIMEOUT` seconds (default 60, override via env var).

---

## SSE Streaming Protocol

`chat.py` calls `chat_graph.astream_events(input_state, version="v2")` and
maps LangGraph events to SSE frames:

| LangGraph event | SSE frame sent |
|---|---|
| `on_chat_model_stream` from `instructor_node` | `{"type":"token","delta":"..."}` |
| `on_chain_end` (graph finished) + `classification == "off_topic"` | `{"type":"offtopic","content":"..."}` |
| `on_chain_end` (graph finished) + normal | `{"type":"done","content":"...","visual":{...}}` |
| Any exception | `{"type":"error","message":"..."}` |

Tokens are streamed only from `instructor_node` (filtered by
`event["metadata"]["langgraph_node"] == "instructor_node"`).
`classify_node` tokens are suppressed.

---

## Mode System Prompts

| Mode | Behaviour |
|---|---|
| `A` | 5-section teaching: overview → explanation → example → connections → quiz |
| `B` | Week-by-week roadmap + daily topic teaching |
| `C` | 5 diagnostic questions → level classification → personalised roadmap |
| fallback | Full `instructor.md` content (used for greeting / resume only) |
