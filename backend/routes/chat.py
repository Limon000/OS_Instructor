"""Chat routes: /api/greeting, /api/chat/stream, /api/mode-select."""

from __future__ import annotations

import json

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from backend.models import (
    ChatRequest,
    ChatResponse,
    GreetingResponse,
    ModeSelectRequest,
    VisualPayload,
)
from backend.services.graph import ChatState, chat_graph
from backend.services.llm import (
    _MODE_INIT_PAYLOAD,
    aria_respond,
    load_system_prompt,
    parse_visual_tag,
)
from backend.services.session_store import load_progress
from backend.services.visual_service import serialize_visual

router = APIRouter()


def _make_visual(tag_name: str, tag_args: str) -> VisualPayload | None:
    raw = serialize_visual(tag_name, tag_args)
    if raw is None:
        return None
    return VisualPayload(kind=raw["kind"], data=raw["data"])


def _visual_dict(tag_name: str, tag_args: str) -> dict | None:
    raw = serialize_visual(tag_name, tag_args)
    if raw is None:
        return None
    return raw


@router.post("/greeting", response_model=GreetingResponse)
def greeting(session_id: str = Query(...)) -> GreetingResponse:
    system_prompt = load_system_prompt()
    saved_messages, saved_mode, _ = load_progress(session_id)

    if saved_messages:
        resume_trigger = saved_messages + [{"role": "user", "content": "[RESUME_SESSION]"}]
        content = aria_respond(system_prompt, resume_trigger, mode=saved_mode)
        clean, tag_name, tag_args = parse_visual_tag(content)
        return GreetingResponse(
            content=clean,
            visual=_make_visual(tag_name, tag_args),
            is_greeting_state=False,
        )

    greeting_trigger = [{"role": "user", "content": "Hello"}]
    content = aria_respond(system_prompt, greeting_trigger)
    clean, tag_name, tag_args = parse_visual_tag(content)
    return GreetingResponse(
        content=clean,
        visual=_make_visual(tag_name, tag_args),
        is_greeting_state=True,
    )


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> EventSourceResponse:
    system_prompt = load_system_prompt()
    messages_dicts = [m.model_dump() for m in req.messages]

    async def generate():
        input_state: ChatState = {
            "raw_messages": messages_dicts,
            "mode": req.mode,
            "user_input": req.user_input,
            "original_off_topic": req.original_off_topic,
            "system_prompt": system_prompt,
            "classification": "",
            "response": "",
            "visual_tag": "",
            "visual_args": "",
        }

        final_output = None
        try:
            async for event in chat_graph.astream_events(input_state, version="v2"):
                kind = event["event"]

                # Stream tokens only from instructor_node, not from classify_node
                if kind == "on_chat_model_stream":
                    if event.get("metadata", {}).get("langgraph_node") == "instructor_node":
                        delta = event["data"]["chunk"].content
                        if delta:
                            yield {"data": json.dumps({"type": "token", "delta": delta})}

                elif kind == "on_chain_end" and event["name"] == "LangGraph":
                    final_output = event["data"]["output"]

        except Exception as e:
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
            return

        if final_output is None:
            yield {"data": json.dumps({"type": "error", "message": "Graph produced no output"})}
            return

        if final_output["classification"] == "off_topic":
            yield {"data": json.dumps({"type": "offtopic", "content": final_output["response"]})}
        else:
            visual = _visual_dict(final_output["visual_tag"], final_output["visual_args"])
            yield {"data": json.dumps({
                "type": "done",
                "content": final_output["response"],
                "visual": visual,
            })}

    return EventSourceResponse(generate())


@router.post("/mode-select", response_model=ChatResponse)
def mode_select(req: ModeSelectRequest) -> ChatResponse:
    system_prompt = load_system_prompt()
    payload = _MODE_INIT_PAYLOAD.get(req.mode, "")
    fresh_msgs = [{"role": "user", "content": payload}]
    response_text = aria_respond(system_prompt, fresh_msgs, mode=req.mode)
    clean, tag_name, tag_args = parse_visual_tag(response_text)
    return ChatResponse(
        content=clean,
        visual=_make_visual(tag_name, tag_args),
    )
