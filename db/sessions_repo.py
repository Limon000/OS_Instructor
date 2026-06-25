"""Conversational session and message repo — replaces progress.json.

The two sidebar buttons in app.py map to:

  💾 Finish Session  -> finish_session(session_id)
       sets status='finished', ended_at=now(); messages are preserved.

  🔄 Start New Session -> abandon_active_sessions(student_id) then start_session(...)
       prior active sessions are marked 'abandoned'; conversation is never silently lost.

The legacy `progress.json` migrator at the bottom is a one-shot upgrade path.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

from sqlalchemy import text

from db.connection import session_scope

_VISUAL_RE = re.compile(r"\[VISUAL:([a-z_]+)(?::([^\]]*))?\]", re.IGNORECASE)


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


def start_session(student_id: str, *, enrollment_id: str | None = None, title: str | None = None) -> str:
    """Create a new active session and return its id."""
    sid = uuid.uuid4().hex
    with session_scope() as sess:
        sess.execute(
            text(
                """
                INSERT INTO sessions (id, student_id, enrollment_id, status, title)
                VALUES (:id, :sid, :eid, 'active', :title)
                """
            ),
            {"id": sid, "sid": student_id, "eid": enrollment_id, "title": title},
        )
    return sid


def finish_session(session_id: str) -> None:
    """Mark a session as finished (the 💾 Finish Session button)."""
    with session_scope() as sess:
        sess.execute(
            text(
                """
                UPDATE sessions
                   SET status='finished',
                       ended_at = :now,
                       last_activity_at = :now
                 WHERE id = :id AND status = 'active'
                """
            ),
            {"id": session_id, "now": _utcnow()},
        )


def abandon_active_sessions(student_id: str) -> int:
    """Abandon every active session for a student.

    Used by 🔄 Start New Session — the prior conversation is preserved
    in the table (status='abandoned') and the UI starts a fresh one.
    """
    with session_scope() as sess:
        res = sess.execute(
            text(
                """
                UPDATE sessions
                   SET status='abandoned',
                       ended_at = :now,
                       last_activity_at = :now
                 WHERE student_id = :sid AND status = 'active'
                """
            ),
            {"sid": student_id, "now": _utcnow()},
        )
        return res.rowcount or 0


def find_active_session(student_id: str) -> str | None:
    with session_scope() as sess:
        row = sess.execute(
            text(
                """
                SELECT id FROM sessions
                 WHERE student_id = :sid AND status = 'active'
              ORDER BY last_activity_at DESC LIMIT 1
                """
            ),
            {"sid": student_id},
        ).first()
        return row[0] if row else None


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


def append_message(
    session_id: str,
    *,
    role: str,
    content: str,
    classification: str = "unknown",
    topic_id: str | None = None,
    token_count: int | None = None,
    latency_ms: int | None = None,
    model_name: str | None = None,
) -> str:
    """Append a message to a session and persist any [VISUAL:...] tag found.

    Returns the new message_id.
    """
    if role not in {"user", "assistant", "system"}:
        raise ValueError(f"invalid role: {role}")
    if classification not in {"on_topic", "casual", "off_topic", "system", "unknown"}:
        raise ValueError(f"invalid classification: {classification}")

    msg_id = uuid.uuid4().hex
    with session_scope() as sess:
        # Next sequence number for this session
        seq = sess.execute(
            text("SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM messages WHERE session_id = :s"),
            {"s": session_id},
        ).scalar_one()

        sess.execute(
            text(
                """
                INSERT INTO messages (id, session_id, sequence_num, role, classification,
                                      topic_id, content, token_count, latency_ms, model_name)
                VALUES (:id, :s, :seq, :role, :cls, :tid, :content, :tok, :lat, :model)
                """
            ),
            {
                "id": msg_id,
                "s": session_id,
                "seq": seq,
                "role": role,
                "cls": classification,
                "tid": topic_id,
                "content": content,
                "tok": token_count,
                "lat": latency_ms,
                "model": model_name,
            },
        )

        sess.execute(
            text("UPDATE sessions SET last_activity_at = :now WHERE id = :s"),
            {"now": _utcnow(), "s": session_id},
        )

        # Persist any visual tag emitted by Limon
        if role == "assistant":
            for match in _VISUAL_RE.finditer(content):
                tag_name = match.group(1).lower()
                args = match.group(2)
                params_json = json.dumps({"args": args}) if args else None
                sess.execute(
                    text(
                        """
                        INSERT INTO message_visuals (id, message_id, tag_name, raw_tag, params)
                        VALUES (:id, :mid, :tag, :raw, :params)
                        """
                    ),
                    {
                        "id": uuid.uuid4().hex,
                        "mid": msg_id,
                        "tag": tag_name,
                        "raw": match.group(0),
                        "params": params_json,
                    },
                )
    return msg_id


def load_messages(session_id: str) -> list[dict]:
    """Return all messages for a session ordered by sequence_num."""
    with session_scope() as sess:
        rows = sess.execute(
            text(
                """
                SELECT sequence_num, role, classification, content, created_at
                  FROM messages WHERE session_id = :s ORDER BY sequence_num
                """
            ),
            {"s": session_id},
        ).all()
    return [
        {
            "sequence_num": r[0],
            "role": r[1],
            "classification": r[2],
            "content": r[3],
            "created_at": r[4],
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Legacy progress.json migrator (one-shot upgrade path)
# ---------------------------------------------------------------------------


def import_legacy_progress_json(student_id: str, progress_path: Path) -> str | None:
    """Read progress.json (the old flat history) into a single 'finished' session.

    Idempotent: if a session already exists titled "imported from progress.json",
    it is left alone. Returns the new session_id, or None if nothing to import.
    """
    if not progress_path.exists():
        return None
    data = json.loads(progress_path.read_text(encoding="utf-8"))
    messages: Sequence[dict] = data.get("messages") if isinstance(data, dict) else data
    if not messages:
        return None

    with session_scope() as sess:
        existing = sess.execute(
            text(
                "SELECT id FROM sessions WHERE student_id = :sid AND title = :t"
            ),
            {"sid": student_id, "t": "imported from progress.json"},
        ).first()
        if existing:
            return existing[0]

    sid = start_session(student_id, title="imported from progress.json")
    for msg in messages:
        append_message(
            sid,
            role=msg.get("role", "user"),
            content=msg.get("content", ""),
            classification=msg.get("classification", "unknown"),
        )
    finish_session(sid)
    return sid
