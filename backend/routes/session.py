"""Session routes — all operations keyed by session_id."""

from __future__ import annotations

from fastapi import APIRouter, Query

from backend.models import (
    FinishSessionRequest,
    FinishSessionResponse,
    Message,
    SaveSessionRequest,
    SessionData,
    VisualPayload,
)
from backend.services.llm import aria_respond, load_system_prompt, parse_visual_tag
from backend.services.session_store import delete_progress, load_progress, save_progress
from backend.services.visual_service import serialize_visual

router = APIRouter()


def _make_visual(tag_name: str, tag_args: str) -> VisualPayload | None:
    raw = serialize_visual(tag_name, tag_args)
    if raw is None:
        return None
    return VisualPayload(kind=raw["kind"], data=raw["data"])


@router.get("", response_model=SessionData)
def get_session(session_id: str = Query(...)) -> SessionData:
    messages, mode, last_session = load_progress(session_id)
    if messages is None:
        return SessionData()
    return SessionData(
        messages=[Message(**m) for m in messages],
        mode=mode,  # type: ignore[arg-type]
        last_session=last_session,
    )


@router.post("/save")
def save_session(req: SaveSessionRequest) -> dict:
    save_progress(req.session_id, [m.model_dump() for m in req.messages], req.mode)
    return {"ok": True}


@router.delete("")
def clear_session(session_id: str = Query(...)) -> dict:
    delete_progress(session_id)
    return {"ok": True}


@router.post("/finish", response_model=FinishSessionResponse)
def finish_session(req: FinishSessionRequest) -> FinishSessionResponse:
    messages_dicts = [m.model_dump() for m in req.messages]
    save_progress(req.session_id, messages_dicts, req.mode)

    system_prompt = load_system_prompt()
    farewell_prompt = (
        "The user has just finished their session. Look at the conversation history "
        "and write a warm farewell message that:\n"
        "1. Says goodbye warmly\n"
        "2. Lists the topics they covered today with checkmarks (✅)\n"
        "3. Ends with: 'Would you like to continue from there, or is there something else "
        "you\\'d like to explore? See you next time! 👋'"
    )
    farewell_msgs = messages_dicts + [{"role": "user", "content": "[FINISH_SESSION]"}]
    farewell_text = aria_respond(farewell_prompt, farewell_msgs)
    clean, tag_name, tag_args = parse_visual_tag(farewell_text)
    return FinishSessionResponse(
        farewell=clean,
        visual=_make_visual(tag_name, tag_args),
    )
