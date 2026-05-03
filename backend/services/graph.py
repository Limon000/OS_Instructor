"""LangGraph chat graph for OS Instructor."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal, Optional, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph

MODEL = "qwen2.5-coder:7b"
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))

_VISUAL_RE = re.compile(r"\[VISUAL:([a-z_]+)(?::([^\]]*))?\]", re.IGNORECASE)

OFF_TOPIC_MSG = (
    "📌 Just so you know, **{topic}** is not part of this Operating Systems course.\n\n"
    "But if you're curious, I'm happy to explain it as a special request! 😊"
)

_CLASSIFIER_PROMPT = (
    "Classify the following message into exactly one category. "
    "Answer only the category name — nothing else.\n\n"
    "Categories:\n"
    "- ON_TOPIC: related to Operating Systems (processes, threads, scheduling, "
    "memory management, file systems, I/O, synchronization, virtualization, OS security)\n"
    "- CASUAL: social or conversational messages — greetings, thanks, affirmations, "
    "mood expressions, small talk, transitions between topics\n"
    "- OFF_TOPIC: unrelated to OS — general coding, math, history, creative writing, "
    "personal advice\n\n"
    "Message: {message}\n\nCategory:"
)

_MODE_SYSTEM_PROMPTS = {
    "A": (
        "You are Limon, an expert Operating Systems instructor. "
        "The user wants to learn about a specific OS topic. "
        "When they name a topic, explain it with: "
        "1) a clear overview, 2) detailed explanation with analogies, "
        "3) a concrete example or pseudocode, 4) connections to related topics, "
        "5) three quiz questions. "
        "Be warm, structured, and educational. Never show a menu or greeting."
    ),
    "B": (
        "You are Limon, an expert Operating Systems instructor. "
        "The user wants to learn OS from scratch. "
        "Create a week-by-week study roadmap covering: OS basics, processes, "
        "CPU scheduling, synchronization, memory management, virtual memory, "
        "file systems, I/O, security, and advanced topics. "
        "Format it as Week 1 → Day 1: topic, Day 2: topic, etc. "
        "Then ask which day they want to start. Never show a menu or greeting."
    ),
    "C": (
        "You are Limon, an expert Operating Systems instructor. "
        "The user has some prior OS knowledge. "
        "Ask them exactly 5 diagnostic questions, one at a time, covering: "
        "processes vs threads, Banker's Algorithm, thrashing, disk scheduling, page faults. "
        "After all answers, classify their level as Beginner-Intermediate, Intermediate, or Advanced "
        "and give a personalized study plan. Never show a menu or greeting."
    ),
}

# ── LLM instances ─────────────────────────────────────────────────────────────

_llm = ChatOllama(model=MODEL, timeout=OLLAMA_TIMEOUT)
_classifier_llm = ChatOllama(model=MODEL, temperature=0)


# ── State ─────────────────────────────────────────────────────────────────────

class ChatState(TypedDict):
    raw_messages: list[dict]
    mode: str
    user_input: str
    original_off_topic: Optional[str]
    system_prompt: str
    classification: str
    response: str
    visual_tag: str
    visual_args: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _short_label(text: str) -> str:
    words = text.split()
    label = " ".join(words[:6])
    return label + ("…" if len(words) > 6 else "")


def _dicts_to_langchain(raw_messages: list[dict], system_prompt: str) -> list:
    msgs = [SystemMessage(content=system_prompt)]
    for m in raw_messages:
        if m["role"] == "user":
            msgs.append(HumanMessage(content=m["content"]))
        else:
            msgs.append(AIMessage(content=m["content"]))
    return msgs


# ── Nodes ─────────────────────────────────────────────────────────────────────

def classify_node(state: ChatState) -> dict:
    prompt = _CLASSIFIER_PROMPT.format(message=state["user_input"])
    try:
        result = _classifier_llm.invoke([HumanMessage(content=prompt)])
        text = result.content.strip().upper()
        if text.startswith("CASUAL"):
            return {"classification": "casual"}
        if text.startswith("OFF_TOPIC") or text.startswith("NO"):
            return {"classification": "off_topic"}
        return {"classification": "on_topic"}
    except Exception:
        return {"classification": "on_topic"}


def off_topic_node(state: ChatState) -> dict:
    msg = OFF_TOPIC_MSG.format(topic=_short_label(state["user_input"]))
    return {"response": msg, "visual_tag": "", "visual_args": ""}


async def instructor_node(state: ChatState) -> dict:
    if state.get("original_off_topic"):
        content = (
            f"Briefly explain this in a friendly way: {state['original_off_topic']}. "
            "After explaining, say: Now, back to OS! What would you like to explore? 📘"
        )
        messages = [
            SystemMessage(content="You are a helpful and concise assistant."),
            HumanMessage(content=content),
        ]
    else:
        active_sys = _MODE_SYSTEM_PROMPTS.get(state["mode"], state["system_prompt"])
        messages = _dicts_to_langchain(state["raw_messages"], active_sys)

    result = await _llm.ainvoke(messages)
    return {"response": result.content}


def parse_visual_node(state: ChatState) -> dict:
    text = state["response"]
    match = _VISUAL_RE.search(text)
    if not match:
        return {"response": text, "visual_tag": "", "visual_args": ""}
    clean = _VISUAL_RE.sub("", text).strip()
    return {
        "response": clean,
        "visual_tag": match.group(1).lower(),
        "visual_args": match.group(2) or "",
    }


def route_after_classify(state: ChatState) -> Literal["off_topic_node", "instructor_node"]:
    if state["classification"] == "off_topic":
        return "off_topic_node"
    return "instructor_node"


# ── Graph ─────────────────────────────────────────────────────────────────────

def build_chat_graph():
    builder = StateGraph(ChatState)

    builder.add_node("classify_node", classify_node)
    builder.add_node("off_topic_node", off_topic_node)
    builder.add_node("instructor_node", instructor_node)
    builder.add_node("parse_visual_node", parse_visual_node)

    builder.add_edge(START, "classify_node")
    builder.add_conditional_edges("classify_node", route_after_classify)
    builder.add_edge("off_topic_node", END)
    builder.add_edge("instructor_node", "parse_visual_node")
    builder.add_edge("parse_visual_node", END)

    return builder.compile()


chat_graph = build_chat_graph()
