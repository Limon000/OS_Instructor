"""Limon — OS Course Instructor (Streamlit web UI)."""

import json
import re
from datetime import datetime
from pathlib import Path

import ollama
import streamlit as st

from visuals import render_visual

MODEL = "qwen2.5-coder:7b"
SYSTEM_PROMPT_PATH = Path(__file__).parent / ".claude" / "instructor.md"
PROGRESS_FILE = Path(__file__).parent / "progress.json"

_VISUAL_RE = re.compile(r"\[VISUAL:([a-z_]+)(?::([^\]]*))?\]", re.IGNORECASE)

OFF_TOPIC_MSG = (
    "📌 Just so you know, **{topic}** is not part of this Operating Systems course.\n\n"
    "But if you're curious, I'm happy to explain it as a special request! 😊"
)

_CLASSIFIER_PROMPT = (
    "Answer only YES or NO — nothing else.\n"
    "Is the following message related to Operating Systems (OS) topics such as "
    "processes, threads, scheduling, memory management, file systems, I/O, "
    "synchronization, virtualization, or OS security?\n\n"
    "Message: {message}\n\nAnswer:"
)


def _short_label(text: str) -> str:
    words = text.split()
    label = " ".join(words[:6])
    return label + ("…" if len(words) > 6 else "")


def is_on_topic(user_input: str) -> bool:
    try:
        resp = ollama.chat(
            model=MODEL,
            messages=[{"role": "user", "content": _CLASSIFIER_PROMPT.format(message=user_input)}],
        )
        return resp.message.content.strip().upper().startswith("Y")
    except Exception:
        return True


def parse_visual_tag(text: str) -> tuple[str, str, str]:
    match = _VISUAL_RE.search(text)
    if not match:
        return text, "", ""
    clean = _VISUAL_RE.sub("", text).strip()
    return clean, match.group(1).lower(), (match.group(2) or "")


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


def display_visual(tag_name: str, args: str) -> None:
    if not tag_name:
        return
    kind, data = render_visual(tag_name, args)
    if kind == "matplotlib":
        st.pyplot(data)
    elif kind == "graphviz":
        st.graphviz_chart(data)


def main() -> None:
    st.set_page_config(page_title="Limon — OS Instructor", page_icon="📘", layout="centered")
    st.title("📘 Limon — OS Course Instructor")
    st.caption("Your Personal Operating System Instructor")

    system_prompt = load_system_prompt()

    if st.session_state.get("show_farewell"):
        st.session_state.pop("show_farewell")
        saved = load_progress()
        farewell_msgs = (saved or []) + [{"role": "user", "content": "[FINISH_SESSION]"}]
        farewell_prompt = (
            "The user has just finished their session. Look at the conversation history "
            "and write a warm farewell message that:\n"
            "1. Says goodbye warmly\n"
            "2. Lists the topics they covered today with checkmarks (✅)\n"
            "3. Ends with: 'Would you like to continue from there, or is there something else "
            "you\\'d like to explore? See you next time! 👋'"
        )
        farewell_text = aria_respond(farewell_prompt, farewell_msgs)
        st.session_state.messages = [{"role": "assistant", "content": farewell_text}]

    with st.sidebar:
        st.markdown("### Session")

        if st.button("💾 Finish Session", type="primary", use_container_width=True):
            if st.session_state.get("messages"):
                save_progress(st.session_state.messages)
                st.session_state.clear()
                st.session_state["show_farewell"] = True
                st.rerun()

        if st.button("🔄 Start New Session", use_container_width=True):
            PROGRESS_FILE.unlink(missing_ok=True)
            st.session_state.clear()
            st.rerun()

    if "messages" not in st.session_state:
        saved = load_progress()
        if saved:
            st.session_state.messages = saved
            resume_trigger = saved + [{"role": "user", "content": "[RESUME_SESSION]"}]
            welcome_back = aria_respond(system_prompt, resume_trigger)
            st.session_state.messages.append({"role": "user", "content": "[RESUME_SESSION]"})
            st.session_state.messages.append({"role": "assistant", "content": welcome_back})
        else:
            st.session_state.messages = []
            greeting_trigger = [{"role": "user", "content": "Hello"}]
            greeting = aria_respond(system_prompt, greeting_trigger)
            st.session_state.messages.append({"role": "user", "content": "Hello"})
            st.session_state.messages.append({"role": "assistant", "content": greeting})

    hidden = {"Hello", "[RESUME_SESSION]"}
    display_messages = [
        m for i, m in enumerate(st.session_state.messages)
        if not (m["role"] == "user" and m["content"] in hidden and i < 2)
    ]
    for msg in display_messages:
        with st.chat_message(msg["role"], avatar="📘" if msg["role"] == "assistant" else None):
            clean, tag_name, tag_args = parse_visual_tag(msg["content"])
            st.markdown(clean)
            display_visual(tag_name, tag_args)

    # Yes / No buttons when an off-topic question is pending
    if st.session_state.get("pending_off_topic"):
        col1, col2 = st.columns(2)
        with col1:
            if st.button("✅ Yes, explain it", use_container_width=True, type="primary"):
                pending = st.session_state.pop("pending_off_topic")
                st.session_state.messages.append({"role": "user", "content": "Yes, explain it"})
                with st.spinner("Limon is thinking..."):
                    explain_msgs = [
                        {
                            "role": "user",
                            "content": (
                                f"Briefly explain this in a friendly way: {pending}. "
                                "After explaining, say: Now, back to OS! What would you like to explore? 📘"
                            ),
                        }
                    ]
                    response_text = aria_respond(
                        "You are a helpful and concise assistant.", explain_msgs
                    )
                st.session_state.messages.append({"role": "assistant", "content": response_text})
                st.rerun()
        with col2:
            if st.button("❌ No, continue the course", use_container_width=True):
                st.session_state.pop("pending_off_topic", None)
                st.session_state.messages.append({"role": "user", "content": "No, continue the course"})
                st.session_state.messages.append(
                    {"role": "assistant", "content": "Got it! Let's stay on track. 📘 What OS topic would you like to explore?"}
                )
                st.rerun()

    pending = bool(st.session_state.get("pending_off_topic"))
    if user_input := st.chat_input(
        "Ask Limon anything about Operating Systems...", disabled=pending
    ):
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        with st.chat_message("assistant", avatar="📘"):
            with st.spinner("Limon is thinking..."):
                if not is_on_topic(user_input):
                    st.session_state["pending_off_topic"] = user_input
                    response_text = OFF_TOPIC_MSG.format(topic=_short_label(user_input))
                else:
                    st.session_state.pop("pending_off_topic", None)
                    response_text = aria_respond(system_prompt, st.session_state.messages)
            clean, tag_name, tag_args = parse_visual_tag(response_text)
            st.markdown(clean)
            display_visual(tag_name, tag_args)

        st.session_state.messages.append({"role": "assistant", "content": response_text})
        st.rerun()


if __name__ == "__main__":
    main()
