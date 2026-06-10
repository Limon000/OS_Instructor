#!/usr/bin/env python3
"""ARIA — Adaptive Reasoning Instructor for Academics (CLI chatbot)."""

import sys
from pathlib import Path

import ollama

MODEL = "qwen2.5-coder:7b"
SYSTEM_PROMPT_PATH = Path(__file__).parent / ".claude" / "instructor.md"


def load_system_prompt() -> str:
    if not SYSTEM_PROMPT_PATH.exists():
        print(f"Error: system prompt not found at {SYSTEM_PROMPT_PATH}", file=sys.stderr)
        sys.exit(1)
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def chat(system_prompt: str, messages: list) -> str:
    ollama_messages = [{"role": "system", "content": system_prompt}] + messages
    try:
        response = ollama.chat(model=MODEL, messages=ollama_messages)
        return response.message.content
    except Exception as e:
        print(f"Ollama error: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    system_prompt = load_system_prompt()
    messages: list = []

    print("\n" + "=" * 60)
    print("  Limon — OS Course Instructor  (type /quit to exit)")
    print("=" * 60 + "\n")

    greeting_trigger = [{"role": "user", "content": "Hello"}]
    greeting = chat(system_prompt, greeting_trigger)
    print(f"ARIA:\n{greeting}\n")
    messages.append({"role": "user", "content": "Hello"})
    messages.append({"role": "assistant", "content": greeting})

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("/quit", "/exit", "quit", "exit"):
            print("Goodbye!")
            break

        messages.append({"role": "user", "content": user_input})
        response_text = chat(system_prompt, messages)
        messages.append({"role": "assistant", "content": response_text})
        print(f"\nARIA:\n{response_text}\n")


if __name__ == "__main__":
    main()
