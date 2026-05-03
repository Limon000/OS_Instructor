"""LLM service — blocking Ollama calls for greeting and mode-select."""

from __future__ import annotations

import os
import re
from pathlib import Path

import ollama
from fastapi import HTTPException

MODEL = "qwen2.5-coder:7b"
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))

REPO_ROOT = Path(__file__).parent.parent.parent
SYSTEM_PROMPT_PATH = REPO_ROOT / ".claude" / "instructor.md"

_VISUAL_RE = re.compile(r"\[VISUAL:([a-z_]+)(?::([^\]]*))?\]", re.IGNORECASE)

_MODE_INIT_PAYLOAD = {
    "A": "List all available OS topics from your course outline and ask the user which one they want to learn about.",
    "B": "Immediately generate the full week-by-week learning roadmap following the BEGINNER LEARNING PATH PROTOCOL.",
    "C": "Immediately begin the KNOWLEDGE ASSESSMENT PROTOCOL. Ask the user the 5 diagnostic questions now.",
}

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

_GREETING_OPTIONS = [
    ("[A]", "📖 [A] Ask me about any specific OS topic and I'll teach it deeply", "A"),
    ("[B]", "🗺️ [B] Say 'Start from zero' for a full structured learning roadmap", "B"),
    ("[C]", "🧪 [C] Say 'I have some knowledge' and I'll assess your level first", "C"),
]


def load_system_prompt() -> str:
    if not SYSTEM_PROMPT_PATH.exists():
        raise HTTPException(500, detail=f"System prompt not found at {SYSTEM_PROMPT_PATH}")
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def aria_respond(system_prompt: str, messages: list[dict], mode: str = "") -> str:
    active_prompt = _MODE_SYSTEM_PROMPTS.get(mode, system_prompt)
    ollama_messages = [{"role": "system", "content": active_prompt}] + messages
    try:
        response = ollama.chat(model=MODEL, messages=ollama_messages)
        return response.message.content
    except Exception as e:
        raise HTTPException(503, detail=f"Ollama error: {e}")


def parse_visual_tag(text: str) -> tuple[str, str, str]:
    match = _VISUAL_RE.search(text)
    if not match:
        return text, "", ""
    clean = _VISUAL_RE.sub("", text).strip()
    return clean, match.group(1).lower(), (match.group(2) or "")


def split_greeting(text: str) -> tuple[str, list, str]:
    lines = text.split("\n")
    header, footer, options = [], [], []
    in_options = False
    for line in lines:
        matched = next(((lbl, mode) for key, lbl, mode in _GREETING_OPTIONS if key in line), None)
        if matched:
            in_options = True
            options.append(matched)
        elif in_options:
            footer.append(line)
        else:
            header.append(line)
    return "\n".join(header), options, "\n".join(footer)
