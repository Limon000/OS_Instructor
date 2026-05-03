"""Session persistence — one JSON file per session under sessions/."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
SESSIONS_DIR = REPO_ROOT / "sessions"


def _session_path(session_id: str) -> Path:
    SESSIONS_DIR.mkdir(exist_ok=True)
    safe = "".join(c for c in session_id if c.isalnum() or c == "-")
    return SESSIONS_DIR / f"{safe}.json"


def save_progress(session_id: str, messages: list[dict], mode: str) -> None:
    data = {
        "last_session": datetime.now().isoformat(),
        "mode": mode,
        "messages": messages,
    }
    _session_path(session_id).write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_progress(session_id: str) -> tuple[list | None, str, str | None]:
    path = _session_path(session_id)
    if not path.exists():
        return None, "", None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("messages"), data.get("mode", ""), data.get("last_session")
    except (json.JSONDecodeError, KeyError):
        return None, "", None


def delete_progress(session_id: str) -> None:
    _session_path(session_id).unlink(missing_ok=True)
