"""Limon — OS Course Instructor (Streamlit web UI)."""

import json
from datetime import datetime
from pathlib import Path

import ollama
import streamlit as st

MODEL = "qwen2.5-coder:7b"
SYSTEM_PROMPT_PATH = Path(__file__).parent / ".claude" / "instructor.md"
PROGRESS_FILE = Path(__file__).parent / "progress.json"


@st.cache_data
def load_system_prompt() -> str:
    if not SYSTEM_PROMPT_PATH.exists():
        st.error(f"System prompt not found at {SYSTEM_PROMPT_PATH}")
        st.stop()
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def save_progress(messages: list) -> None:
    data = {
        "last_session": datetime.now().isoformat(),
        "messages": messages,
    }
    PROGRESS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_progress() -> list | None:
    if not PROGRESS_FILE.exists():
        return None
    try:
        data = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        return data.get("messages")
    except (json.JSONDecodeError, KeyError):
        return None


def aria_respond(system_prompt: str, messages: list) -> str:
    ollama_messages = [{"role": "system", "content": system_prompt}] + messages
    try:
        response = ollama.chat(model=MODEL, messages=ollama_messages)
        return response.message.content
    except Exception as e:
        st.error(f"Ollama error: {e}")
        st.stop()


def main() -> None:
    st.set_page_config(page_title="Limon — OS Instructor", page_icon="📘", layout="centered")
    st.title("📘 Limon — OS Course Instructor")
    st.caption("Your Personal Operating System Instructor")

    system_prompt = load_system_prompt()

    # Sidebar: Finish Session button
    with st.sidebar:
        st.markdown("### Session")
        if st.button("Finish Session", type="primary", use_container_width=True):
            if st.session_state.get("messages"):
                save_progress(st.session_state.messages)
                st.success("Progress saved! See you next time.")
                st.session_state.clear()
                st.rerun()

    if "messages" not in st.session_state:
        saved = load_progress()
        if saved:
            # Resume previous session
            st.session_state.messages = saved
            resume_trigger = saved + [{"role": "user", "content": "[RESUME_SESSION]"}]
            welcome_back = aria_respond(system_prompt, resume_trigger)
            st.session_state.messages.append({"role": "user", "content": "[RESUME_SESSION]"})
            st.session_state.messages.append({"role": "assistant", "content": welcome_back})
        else:
            # Fresh start
            st.session_state.messages = []
            greeting_trigger = [{"role": "user", "content": "Hello"}]
            greeting = aria_respond(system_prompt, greeting_trigger)
            st.session_state.messages.append({"role": "user", "content": "Hello"})
            st.session_state.messages.append({"role": "assistant", "content": greeting})

    # Display conversation (hide internal trigger messages)
    hidden = {"Hello", "[RESUME_SESSION]"}
    display_messages = [
        m for i, m in enumerate(st.session_state.messages)
        if not (m["role"] == "user" and m["content"] in hidden and
                i < 2)
    ]
    for msg in display_messages:
        with st.chat_message(msg["role"], avatar="📘" if msg["role"] == "assistant" else None):
            st.markdown(msg["content"])

    if user_input := st.chat_input("Ask Limon anything about Operating Systems..."):
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        with st.chat_message("assistant", avatar="📘"):
            with st.spinner("Limon is thinking..."):
                response_text = aria_respond(system_prompt, st.session_state.messages)
            st.markdown(response_text)

        st.session_state.messages.append({"role": "assistant", "content": response_text})


if __name__ == "__main__":
    main()
