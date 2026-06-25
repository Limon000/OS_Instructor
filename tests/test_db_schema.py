"""Schema invariant + session lifecycle tests for OS_Instructor."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import text


# ---------------------------------------------------------------------------
# § Pragmas and bootstrap
# ---------------------------------------------------------------------------


def test_required_pragmas_are_set(db):
    """Connection must apply foreign_keys=ON, WAL, NORMAL sync, busy_timeout."""
    with db.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys;")).scalar() == 1
        assert str(conn.execute(text("PRAGMA journal_mode;")).scalar()).lower() == "wal"
        assert conn.execute(text("PRAGMA busy_timeout;")).scalar() == 5000


def test_visual_tag_specs_seeded(db):
    with db.connect() as conn:
        n = conn.execute(text("SELECT COUNT(*) FROM visual_tag_specs")).scalar_one()
    assert n == 10  # mirrors VISUAL_TAGS in db/seed.py


# ---------------------------------------------------------------------------
# § Role guards (the value-add over a Postgres CHECK constraint)
# ---------------------------------------------------------------------------


def _make_user(db, role: str) -> str:
    uid = uuid.uuid4().hex
    with db.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO users (id, email, password_hash, full_name, role, status)
                VALUES (:id, :em, '!locked!', 'Test', :role, 'active')
                """
            ),
            {"id": uid, "em": f"{uid}@example.com", "role": role},
        )
    return uid


def test_student_profile_rejects_non_student(db):
    instructor_id = _make_user(db, "instructor")
    with pytest.raises(Exception) as exc:
        with db.begin() as conn:
            conn.execute(
                text("INSERT INTO student_profiles (user_id) VALUES (:id)"),
                {"id": instructor_id},
            )
    assert "student" in str(exc.value).lower()


def test_instructor_profile_rejects_non_instructor(db):
    student_id = _make_user(db, "student")
    with pytest.raises(Exception) as exc:
        with db.begin() as conn:
            conn.execute(
                text("INSERT INTO instructor_profiles (user_id) VALUES (:id)"),
                {"id": student_id},
            )
    assert "instructor" in str(exc.value).lower()


def test_courses_must_be_authored_by_instructor_or_admin(db):
    student_id = _make_user(db, "student")
    with pytest.raises(Exception):
        with db.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO courses (id, slug, title, created_by)
                    VALUES (:id, 'badcourse', 'Bad', :uid)
                    """
                ),
                {"id": uuid.uuid4().hex, "uid": student_id},
            )

    instructor_id = _make_user(db, "instructor")
    with db.begin() as conn:  # this one must succeed
        conn.execute(
            text(
                """
                INSERT INTO courses (id, slug, title, created_by)
                VALUES (:id, 'goodcourse', 'Good', :uid)
                """
            ),
            {"id": uuid.uuid4().hex, "uid": instructor_id},
        )


def test_only_students_can_enroll(db):
    instructor_id = _make_user(db, "instructor")
    admin_id = _make_user(db, "admin")
    course_id = uuid.uuid4().hex
    with db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO courses (id, slug, title, created_by) "
                "VALUES (:id, 'c1', 'C', :uid)"
            ),
            {"id": course_id, "uid": instructor_id},
        )

    # Admin trying to enroll should fail.
    with pytest.raises(Exception):
        with db.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO enrollments (id, student_id, course_id, mode) "
                    "VALUES (:id, :sid, :cid, 'single_topic')"
                ),
                {"id": uuid.uuid4().hex, "sid": admin_id, "cid": course_id},
            )


# ---------------------------------------------------------------------------
# § Assessment scope CHECK (exactly one of course/module/topic)
# ---------------------------------------------------------------------------


def test_assessment_scope_check_rejects_two_scopes(db):
    instr = _make_user(db, "instructor")
    course_id = uuid.uuid4().hex
    module_id = uuid.uuid4().hex
    with db.begin() as conn:
        conn.execute(
            text("INSERT INTO courses (id, slug, title, created_by) VALUES (:id,'c2','C2',:uid)"),
            {"id": course_id, "uid": instr},
        )
        conn.execute(
            text("INSERT INTO modules (id, course_id, position, title) VALUES (:id,:cid,1,'M1')"),
            {"id": module_id, "cid": course_id},
        )

    with pytest.raises(Exception):
        with db.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO assessments (id, kind, course_id, module_id,
                                             title, num_questions, created_by)
                    VALUES (:id, 'module_quiz', :cid, :mid, 'Bad', 5, :uid)
                    """
                ),
                {"id": uuid.uuid4().hex, "cid": course_id, "mid": module_id, "uid": instr},
            )


# ---------------------------------------------------------------------------
# § Session lifecycle — Finish Session vs Start New Session
# ---------------------------------------------------------------------------


def test_finish_session_marks_finished_and_preserves_messages(db):
    from db.sessions_repo import append_message, finish_session, load_messages, start_session

    student_id = _make_user(db, "student")
    sid = start_session(student_id, title="lesson 1")
    append_message(sid, role="user", content="Hello", classification="casual")
    append_message(sid, role="assistant", content="Hi! 😊", classification="casual")
    finish_session(sid)

    with db.connect() as conn:
        status = conn.execute(text("SELECT status FROM sessions WHERE id=:s"), {"s": sid}).scalar()
    assert status == "finished"
    assert len(load_messages(sid)) == 2


def test_start_new_session_abandons_prior_active(db):
    from db.sessions_repo import abandon_active_sessions, find_active_session, start_session

    student_id = _make_user(db, "student")
    sid_old = start_session(student_id)
    abandoned = abandon_active_sessions(student_id)
    sid_new = start_session(student_id)

    assert abandoned == 1
    assert find_active_session(student_id) == sid_new

    with db.connect() as conn:
        status = conn.execute(
            text("SELECT status FROM sessions WHERE id=:s"), {"s": sid_old}
        ).scalar()
    assert status == "abandoned"


# ---------------------------------------------------------------------------
# § Visual tag persistence
# ---------------------------------------------------------------------------


def test_visual_tag_in_assistant_message_creates_message_visual(db):
    from db.sessions_repo import append_message, start_session

    student_id = _make_user(db, "student")
    sid = start_session(student_id)
    msg_id = append_message(
        sid,
        role="assistant",
        content="Here is a Gantt chart for FCFS: [VISUAL:gantt_chart:P1=4,P2=3]",
        classification="on_topic",
    )

    with db.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT tag_name, params, render_status FROM message_visuals WHERE message_id=:m"
            ),
            {"m": msg_id},
        ).all()
    assert len(rows) == 1
    tag, params, status = rows[0]
    assert tag == "gantt_chart"
    assert status == "pending"
    assert json.loads(params) == {"args": "P1=4,P2=3"}


# ---------------------------------------------------------------------------
# § Auth flow
# ---------------------------------------------------------------------------


def test_signup_login_resolve_token_revoke(db):
    from db.auth import login, resolve_token, revoke_token, signup

    uid = signup(email="lina@example.com", password="hunter2-strong-pass", full_name="Lina", role="student")
    assert uid

    result = login("lina@example.com", "hunter2-strong-pass")
    assert result is not None
    user_id, token = result
    assert user_id == uid

    resolved = resolve_token(token)
    assert resolved == (uid, "student")

    revoke_token(token)
    assert resolve_token(token) is None


def test_login_rejects_bad_password(db):
    from db.auth import login, signup

    signup(email="bob@example.com", password="correct-horse-battery", full_name="Bob", role="instructor")
    assert login("bob@example.com", "wrong-password") is None


# ---------------------------------------------------------------------------
# § Course seeder against the real instructor.md
# ---------------------------------------------------------------------------


def test_seed_course_from_instructor_md_inserts_10_modules(db):
    from db.seed import seed_course_from_instructor_md

    report = seed_course_from_instructor_md()
    assert report["modules_inserted"] == 10
    assert report["topics_inserted"] >= 40

    with db.connect() as conn:
        topic_codes = {
            r[0]
            for r in conn.execute(text("SELECT code FROM topics")).all()
        }
    # Sanity-check a few known codes from instructor.md
    for expected in ("1.1", "2.1", "5.3", "6.1", "10.4"):
        assert expected in topic_codes
