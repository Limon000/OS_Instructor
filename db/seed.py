"""Idempotent seeders for OS_Instructor.

Run as a module:
    python -m db.seed
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from sqlalchemy import text

from db.connection import engine, session_scope

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INSTRUCTOR_MD = PROJECT_ROOT / ".claude" / "instructor.md"

# Single source of truth — the runtime VISUAL_MAP in visuals.py should mirror this.
VISUAL_TAGS: list[tuple[str, str, str, str | None]] = [
    ("process_state_diagram", "Process lifecycle states",             "graphviz",   None),
    ("gantt_chart",           "CPU scheduling Gantt chart",           "matplotlib", "P1=4,P2=3"),
    ("os_layer_diagram",      "OS layered architecture",              "graphviz",   None),
    ("memory_hierarchy",      "Memory pyramid hierarchy",             "matplotlib", None),
    ("paging_diagram",        "Logical → Page Table → Physical",      "matplotlib", None),
    ("page_replacement",      "Frame table with fault highlight",     "matplotlib", "FIFO"),
    ("disk_scheduling",       "Disk head movement chart",             "matplotlib", "98,183,37"),
    ("raid_diagram",          "RAID block layout",                    "matplotlib", "RAID5"),
    ("semaphore_diagram",     "Producer → Buffer → Consumer",         "graphviz",   None),
    ("dining_philosophers",   "Dining philosophers graph",            "graphviz",   None),
]

# Topic-code → visual tag mapping per instructor.md "VISUAL TAGGING RULE".
TOPIC_VISUAL_HINTS: dict[str, str] = {
    "1.3": "os_layer_diagram",
    "2.1": "process_state_diagram",
    "2.2": "gantt_chart",
    "3.1": "gantt_chart",
    "3.2": "gantt_chart",
    "3.3": "gantt_chart",
    "4.2": "semaphore_diagram",
    "4.3": "dining_philosophers",
    "5.1": "memory_hierarchy",
    "5.3": "paging_diagram",
    "6.1": "page_replacement",
    "7.4": "disk_scheduling",
    "7.5": "raid_diagram",
}


# ---------------------------------------------------------------------------
# Visual tags
# ---------------------------------------------------------------------------


def seed_visual_tags() -> int:
    """Insert any missing rows in `visual_tag_specs`. Returns rows inserted."""
    inserted = 0
    with session_scope() as sess:
        for tag, desc, kind, sample in VISUAL_TAGS:
            res = sess.execute(
                text(
                    """
                    INSERT INTO visual_tag_specs (tag_name, description, renderer_kind, sample_args)
                    VALUES (:t, :d, :k, :s)
                    ON CONFLICT(tag_name) DO NOTHING
                    """
                ),
                {"t": tag, "d": desc, "k": kind, "s": sample},
            )
            inserted += res.rowcount or 0
    return inserted


# ---------------------------------------------------------------------------
# Course / modules / topics — parsed from .claude/instructor.md
# ---------------------------------------------------------------------------

_MODULE_RE = re.compile(r"^MODULE\s+(\d+)\s+—\s+(.+?)\s*$")
_TOPIC_RE = re.compile(r"^\s*-\s+Topic\s+(\d+\.\d+):\s+(.+?)\s*$")


def _parse_outline(md_text: str) -> list[dict]:
    """Parse the COURSE OUTLINE block from instructor.md.

    Returns: [{'position': int, 'title': str, 'topics': [{'code','title'}, ...]}]
    """
    modules: list[dict] = []
    current: dict | None = None
    for line in md_text.splitlines():
        m = _MODULE_RE.match(line)
        if m:
            if current:
                modules.append(current)
            current = {
                "position": int(m.group(1)),
                "title": m.group(2).strip(),
                "topics": [],
            }
            continue
        t = _TOPIC_RE.match(line)
        if t and current is not None:
            current["topics"].append({"code": t.group(1), "title": t.group(2).strip()})
    if current:
        modules.append(current)
    return modules


def _ensure_seed_admin(sess) -> str:
    """Return an admin user_id, creating a sentinel admin if none exists.

    The seed admin's password_hash is a sentinel that does not match any
    real argon2 hash — login is impossible until rotated by a real admin.
    """
    row = sess.execute(
        text("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1")
    ).first()
    if row:
        return row[0]
    admin_id = uuid.uuid4().hex
    sess.execute(
        text(
            """
            INSERT INTO users (id, email, password_hash, full_name, role, status)
            VALUES (:id, 'seed-admin@os-instructor.local',
                    '!seed-locked!', 'Seed Admin', 'admin', 'active')
            """
        ),
        {"id": admin_id},
    )
    return admin_id


def seed_course_from_instructor_md(md_path: Path = INSTRUCTOR_MD) -> dict:
    """Parse instructor.md and upsert the course, modules, and topics.

    Returns a small report: {'course_id', 'modules', 'topics'}.
    """
    md_text = md_path.read_text(encoding="utf-8")
    outline = _parse_outline(md_text)

    with session_scope() as sess:
        admin_id = _ensure_seed_admin(sess)

        # Course
        course_row = sess.execute(
            text("SELECT id FROM courses WHERE slug = 'os-fundamentals'")
        ).first()
        if course_row:
            course_id = course_row[0]
        else:
            course_id = uuid.uuid4().hex
            sess.execute(
                text(
                    """
                    INSERT INTO courses (id, slug, title, description,
                                         primary_reference, created_by, is_published)
                    VALUES (:id, 'os-fundamentals',
                            'Operating Systems — Limon Course',
                            'A 10-module Operating Systems course taught by Limon.',
                            'Silberschatz, Galvin & Gagne — Operating System Concepts, 10th ed.',
                            :uid, 1)
                    """
                ),
                {"id": course_id, "uid": admin_id},
            )

        # Modules + topics
        module_count = 0
        topic_count = 0
        for mod in outline:
            existing = sess.execute(
                text("SELECT id FROM modules WHERE course_id = :c AND position = :p"),
                {"c": course_id, "p": mod["position"]},
            ).first()
            if existing:
                module_id = existing[0]
            else:
                module_id = uuid.uuid4().hex
                sess.execute(
                    text(
                        """
                        INSERT INTO modules (id, course_id, position, title)
                        VALUES (:id, :c, :p, :t)
                        """
                    ),
                    {"id": module_id, "c": course_id, "p": mod["position"], "t": mod["title"]},
                )
                module_count += 1

            for idx, top in enumerate(mod["topics"], start=1):
                t_existing = sess.execute(
                    text("SELECT id FROM topics WHERE module_id = :m AND code = :c"),
                    {"m": module_id, "c": top["code"]},
                ).first()
                if t_existing:
                    continue
                sess.execute(
                    text(
                        """
                        INSERT INTO topics (id, module_id, position, code, title,
                                            visual_tag_name)
                        VALUES (:id, :m, :p, :code, :title, :vt)
                        """
                    ),
                    {
                        "id": uuid.uuid4().hex,
                        "m": module_id,
                        "p": idx,
                        "code": top["code"],
                        "title": top["title"],
                        "vt": TOPIC_VISUAL_HINTS.get(top["code"]),
                    },
                )
                topic_count += 1

    return {"course_id": course_id, "modules_inserted": module_count, "topics_inserted": topic_count}


# ---------------------------------------------------------------------------
# Bootstrap entrypoint
# ---------------------------------------------------------------------------


def main() -> None:
    tags_inserted = seed_visual_tags()
    report = seed_course_from_instructor_md()
    print(json.dumps({"visual_tags_inserted": tags_inserted, **report}, indent=2))


if __name__ == "__main__":
    main()
