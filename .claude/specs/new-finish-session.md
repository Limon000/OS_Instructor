# New Finish Session — Two Session Buttons

## Overview

The sidebar has two distinct session control buttons with different behaviors.

---

## 💾 Finish Session

**Purpose:** Save progress and pause — resume next time.

**Behavior:**
1. Saves the full conversation to `progress.json`
2. Clears the current session state
3. On next app load → `progress.json` is found → Limon resumes with a "Welcome back" message

**Use when:** You want to stop for now and continue from where you left off later.

---

## 🔄 Start New Session

**Purpose:** Wipe everything and start completely fresh.

**Behavior:**
1. Deletes `progress.json` (if it exists)
2. Clears the current session state
3. On next app load → no saved session → Limon shows the fresh greeting

**Use when:** You want to start a brand new learning journey from scratch.

---

## Code Location

Both buttons are in `app.py` inside the `with st.sidebar:` block (`app.py:110–122`).

```python
# 💾 Finish Session — saves progress.json, resumes next time
if st.button("💾 Finish Session", type="primary", use_container_width=True):
    if st.session_state.get("messages"):
        save_progress(st.session_state.messages)
        st.success("Progress saved! See you next time. 👋")
        st.session_state.clear()
        st.rerun()

# 🔄 Start New Session — deletes progress.json, fresh start
if st.button("🔄 Start New Session", use_container_width=True):
    PROGRESS_FILE.unlink(missing_ok=True)
    st.session_state.clear()
    st.rerun()
```

## Related Files

| File | Role |
|------|------|
| `progress.json` | Stores conversation history between sessions |
| `app.py:65` | `save_progress()` — writes messages to `progress.json` |
| `app.py:73` | `load_progress()` — reads `progress.json` on startup |
