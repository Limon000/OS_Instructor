"""Pydantic request / response models for the OS Instructor API."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


class VisualPayload(BaseModel):
    kind: Literal["matplotlib", "graphviz"]
    data: str


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    messages: list[Message]
    mode: Literal["A", "B", "C", ""] = ""
    user_input: str
    original_off_topic: Optional[str] = None


class ChatResponse(BaseModel):
    role: str = "assistant"
    content: str
    visual: Optional[VisualPayload] = None
    is_off_topic: bool = False


class GreetingResponse(BaseModel):
    content: str
    visual: Optional[VisualPayload] = None
    is_greeting_state: bool


class ModeSelectRequest(BaseModel):
    session_id: str
    mode: Literal["A", "B", "C"]
    messages: list[Message] = []


# ── Session ──────────────────────────────────────────────────────────────────

class SessionData(BaseModel):
    messages: list[Message] = []
    mode: Literal["A", "B", "C", ""] = ""
    last_session: Optional[str] = None


class SaveSessionRequest(BaseModel):
    session_id: str
    messages: list[Message]
    mode: Literal["A", "B", "C", ""] = ""


class FinishSessionRequest(BaseModel):
    session_id: str
    messages: list[Message]
    mode: Literal["A", "B", "C", ""] = ""


class FinishSessionResponse(BaseModel):
    farewell: str
    visual: Optional[VisualPayload] = None


# ── Visual ───────────────────────────────────────────────────────────────────

class VisualRequest(BaseModel):
    tag_name: str
    args: str = ""
