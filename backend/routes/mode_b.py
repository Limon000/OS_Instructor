"""Mode B routes — structured topic-by-topic teaching via SSE stream."""

from __future__ import annotations

import json
import re

from fastapi import APIRouter
from langchain_core.messages import HumanMessage, SystemMessage
from sse_starlette.sse import EventSourceResponse

from backend.models import TeachTopicRequest
from backend.services.graph import _llm
from backend.services.visual_service import serialize_visual

router = APIRouter()

_VISUAL_RE = re.compile(r"\[VISUAL:([a-z_]+)(?::([^\]]*))?\]", re.IGNORECASE)

_TEACH_SYSTEM_PROMPT = (
    "You are Limon, an expert Operating Systems instructor with 20+ years of experience. "
    "Teach the given topic in a clear, thorough, and structured way. "
    "Use real-world analogies, pseudocode, and ASCII diagrams where applicable. "
    "Reference Silberschatz (Dinosaur Book) or Tanenbaum when relevant. "
    "Do NOT include quiz questions — focus entirely on teaching the concept well."
)


@router.post("/teach-topic")
async def teach_topic(req: TeachTopicRequest) -> EventSourceResponse:
    """Stream structured teaching content for one OS topic (Mode B)."""

    topic_prompt = (
        f"Teach **Topic {req.topic_id}: {req.topic_title}**\n\n"
        "Use exactly this structure:\n\n"
        "## 🔍 Concept Overview\n"
        "Define the topic clearly in plain language. State WHY it matters in the OS context.\n\n"
        "## 🧩 Deep Explanation\n"
        "Break down the sub-concepts. Use a real-world analogy. "
        "Include pseudocode or an ASCII diagram if the concept benefits from one.\n\n"
        "## 💡 Example / Walkthrough\n"
        "Give a concrete, step-by-step example. "
        "If algorithm-based, trace through with sample data.\n\n"
        "## 🔗 Connections\n"
        "Link this topic to related OS concepts. "
        "Mention what topics to study before and after this one.\n\n"
        "End your response with exactly this line: "
        "'Feel free to ask me anything about this topic! 💬'"
    )

    messages = [
        SystemMessage(content=_TEACH_SYSTEM_PROMPT),
        HumanMessage(content=topic_prompt),
    ]

    async def generate():
        full_response = ""
        try:
            async for chunk in _llm.astream(messages):
                delta = chunk.content
                if delta:
                    full_response += delta
                    yield {"data": json.dumps({"type": "token", "delta": delta})}
        except Exception as e:
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
            return

        # Parse and strip visual tag; serialize to base64/DOT
        match = _VISUAL_RE.search(full_response)
        visual_dict = None
        clean_response = full_response
        if match:
            clean_response = _VISUAL_RE.sub("", full_response).strip()
            raw = serialize_visual(match.group(1).lower(), match.group(2) or "")
            if raw:
                visual_dict = raw

        yield {"data": json.dumps({
            "type": "done",
            "content": clean_response,
            "visual": visual_dict,
        })}

    return EventSourceResponse(generate())
