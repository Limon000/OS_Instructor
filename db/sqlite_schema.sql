-- =====================================================================
-- OS_Instructor — Relational Schema (SQLite 3.38+)
-- =====================================================================
-- This is the SQLite port of db/schema.sql (PostgreSQL).
--
-- Translations applied:
--   * UUID                  -> TEXT  (app-side uuid4().hex)
--   * ENUM                  -> TEXT + CHECK (col IN (...))
--   * TIMESTAMPTZ           -> TEXT  (ISO-8601 UTC)
--   * CITEXT (email)        -> TEXT COLLATE NOCASE
--   * JSONB                 -> TEXT  + CHECK (col IS NULL OR json_valid(col))
--   * INET                  -> TEXT
--   * TEXT[]                -> TEXT  (JSON-encoded array)
--   * BIGSERIAL (audit_log) -> INTEGER PRIMARY KEY (rowid alias)
--   * PL/pgSQL triggers     -> plain SQL triggers
--
-- Required pragmas (set by db/connection.py on every connection):
--   PRAGMA journal_mode = WAL;
--   PRAGMA foreign_keys = ON;
--   PRAGMA synchronous  = NORMAL;
--   PRAGMA busy_timeout = 5000;
-- =====================================================================

-- =====================================================================
-- 1. IDENTITY & ACCESS
-- =====================================================================

CREATE TABLE users (
    id                TEXT PRIMARY KEY,
    email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash     TEXT NOT NULL,
    full_name         TEXT NOT NULL,
    role              TEXT NOT NULL
                      CHECK (role IN ('admin','instructor','student')),
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('active','suspended','pending','deleted')),
    email_verified_at TEXT,
    last_login_at     TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at        TEXT
) STRICT;
CREATE INDEX ix_users__role_status ON users(role, status) WHERE deleted_at IS NULL;

CREATE TABLE user_profiles (
    user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_url     TEXT,
    bio            TEXT,
    timezone       TEXT NOT NULL DEFAULT 'UTC',
    preferred_lang TEXT NOT NULL DEFAULT 'en',
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE auth_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    ip_address  TEXT,
    user_agent  TEXT,
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX ix_auth_sessions__user_active ON auth_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions__expires     ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_resets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE student_profiles (
    user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    proficiency_level   TEXT CHECK (proficiency_level IN
                          ('beginner','beginner_intermediate','intermediate','advanced')),
    daily_streak        INTEGER NOT NULL DEFAULT 0,
    longest_streak      INTEGER NOT NULL DEFAULT 0,
    last_active_day     TEXT,
    total_minutes_spent INTEGER NOT NULL DEFAULT 0,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE instructor_profiles (
    user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title            TEXT,
    years_experience INTEGER,
    expertise_areas  TEXT CHECK (expertise_areas IS NULL OR json_valid(expertise_areas)),
    bio_long         TEXT,
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- =====================================================================
-- 2. COURSE CONTENT
-- =====================================================================

CREATE TABLE courses (
    id                TEXT PRIMARY KEY,
    slug              TEXT NOT NULL UNIQUE,
    title             TEXT NOT NULL,
    description       TEXT,
    primary_reference TEXT,
    created_by        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_published      INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
    published_at      TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX ix_courses__published ON courses(is_published) WHERE is_published = 1;

CREATE TABLE modules (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (course_id, position)
) STRICT;
CREATE INDEX ix_modules__course ON modules(course_id);

CREATE TABLE visual_tag_specs (
    tag_name      TEXT PRIMARY KEY,
    description   TEXT,
    renderer_kind TEXT NOT NULL CHECK (renderer_kind IN ('matplotlib','graphviz')),
    params_schema TEXT CHECK (params_schema IS NULL OR json_valid(params_schema)),
    sample_args   TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE topics (
    id                  TEXT PRIMARY KEY,
    module_id           TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    code                TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    learning_objectives TEXT CHECK (learning_objectives IS NULL OR json_valid(learning_objectives)),
    chapter_ref         TEXT,
    visual_tag_name     TEXT REFERENCES visual_tag_specs(tag_name) ON DELETE SET NULL,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (module_id, position),
    UNIQUE (module_id, code)
) STRICT;
CREATE INDEX ix_topics__module ON topics(module_id);

CREATE TABLE topic_resources (
    id          TEXT PRIMARY KEY,
    topic_id    TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    url_or_path TEXT,
    citation    TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX ix_topic_resources__topic ON topic_resources(topic_id);

-- =====================================================================
-- 3. ENROLLMENT & PROGRESS
-- =====================================================================

CREATE TABLE enrollments (
    id               TEXT PRIMARY KEY,
    student_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    mode             TEXT NOT NULL CHECK (mode IN ('single_topic','beginner_zero','prior_knowledge')),
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','dropped','paused')),
    current_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
    progress_pct     REAL NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    enrolled_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at     TEXT,
    UNIQUE (student_id, course_id)
) STRICT;
CREATE INDEX ix_enrollments__student_status ON enrollments(student_id, status);

CREATE TABLE learning_paths (
    id                TEXT PRIMARY KEY,
    enrollment_id     TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    mode              TEXT NOT NULL CHECK (mode IN ('single_topic','beginner_zero','prior_knowledge')),
    proficiency_level TEXT CHECK (proficiency_level IN
                        ('beginner','beginner_intermediate','intermediate','advanced')),
    version           INTEGER NOT NULL DEFAULT 1,
    generated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (enrollment_id, version)
) STRICT;

CREATE TABLE assessments (
    id                 TEXT PRIMARY KEY,
    kind               TEXT NOT NULL CHECK (kind IN
                         ('topic_quiz','module_quiz','final_exam','diagnostic')),
    course_id          TEXT REFERENCES courses(id) ON DELETE CASCADE,
    module_id          TEXT REFERENCES modules(id) ON DELETE CASCADE,
    topic_id           TEXT REFERENCES topics(id)  ON DELETE CASCADE,
    title              TEXT NOT NULL,
    num_questions      INTEGER NOT NULL,
    pass_threshold_pct REAL NOT NULL DEFAULT 70 CHECK (pass_threshold_pct BETWEEN 0 AND 100),
    time_limit_sec     INTEGER,
    created_by         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
      (CASE WHEN topic_id  IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN module_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN course_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
) STRICT;
CREATE INDEX ix_assessments__kind  ON assessments(kind);
CREATE INDEX ix_assessments__scope ON assessments(course_id, module_id, topic_id);

CREATE TABLE learning_path_items (
    id               TEXT PRIMARY KEY,
    learning_path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    day_number       INTEGER NOT NULL,
    item_kind        TEXT NOT NULL,
    topic_id         TEXT REFERENCES topics(id)      ON DELETE SET NULL,
    assessment_id    TEXT REFERENCES assessments(id) ON DELETE SET NULL,
    status           TEXT NOT NULL DEFAULT 'planned',
    scheduled_for    TEXT,
    completed_at     TEXT,
    UNIQUE (learning_path_id, day_number)
) STRICT;

CREATE TABLE topic_progress (
    student_id       TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    topic_id         TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','completed','mastered')),
    mastery_score    REAL CHECK (mastery_score IS NULL OR mastery_score BETWEEN 0 AND 100),
    first_visited_at TEXT,
    last_visited_at  TEXT,
    completed_at     TEXT,
    PRIMARY KEY (student_id, topic_id)
) STRICT;
CREATE INDEX ix_topic_progress__student_status ON topic_progress(student_id, status);

CREATE TABLE module_progress (
    student_id     TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    module_id      TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started','in_progress','completed','mastered')),
    quiz_score_pct REAL CHECK (quiz_score_pct IS NULL OR quiz_score_pct BETWEEN 0 AND 100),
    started_at     TEXT,
    completed_at   TEXT,
    PRIMARY KEY (student_id, module_id)
) STRICT;

-- =====================================================================
-- 4. ASSESSMENT QUESTIONS & ATTEMPTS
-- =====================================================================

CREATE TABLE questions (
    id            TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN
                    ('factual','conceptual','applied','mcq','short_answer','tracing')),
    prompt        TEXT NOT NULL,
    explanation   TEXT,
    difficulty    INTEGER CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
    points        INTEGER NOT NULL DEFAULT 1,
    created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (assessment_id, position)
) STRICT;

CREATE TABLE question_options (
    id          TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    is_correct  INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
    UNIQUE (question_id, position)
) STRICT;

CREATE TABLE attempts (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id  TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    outcome        TEXT NOT NULL DEFAULT 'in_progress'
                   CHECK (outcome IN ('in_progress','submitted','graded','expired')),
    score_pct      REAL CHECK (score_pct IS NULL OR score_pct BETWEEN 0 AND 100),
    passed         INTEGER CHECK (passed IS NULL OR passed IN (0,1)),
    started_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    submitted_at   TEXT,
    graded_at      TEXT,
    UNIQUE (student_id, assessment_id, attempt_number)
) STRICT;
CREATE INDEX ix_attempts__student    ON attempts(student_id);
CREATE INDEX ix_attempts__assessment ON attempts(assessment_id);

CREATE TABLE attempt_answers (
    id                 TEXT PRIMARY KEY,
    attempt_id         TEXT NOT NULL REFERENCES attempts(id)  ON DELETE CASCADE,
    question_id        TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    selected_option_id TEXT REFERENCES question_options(id)   ON DELETE SET NULL,
    raw_answer         TEXT,
    is_correct         INTEGER CHECK (is_correct IS NULL OR is_correct IN (0,1)),
    points_awarded     REAL,
    feedback           TEXT,
    scored_at          TEXT,
    UNIQUE (attempt_id, question_id)
) STRICT;

-- =====================================================================
-- 5. CONVERSATIONS (replaces progress.json)
-- =====================================================================

CREATE TABLE sessions (
    id               TEXT PRIMARY KEY,
    student_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id    TEXT REFERENCES enrollments(id) ON DELETE SET NULL,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','finished','abandoned')),
    title            TEXT,
    started_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    ended_at         TEXT
) STRICT;
CREATE INDEX ix_sessions__student_status ON sessions(student_id, status);

CREATE TABLE messages (
    id             TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence_num   INTEGER NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    classification TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (classification IN ('on_topic','casual','off_topic','system','unknown')),
    topic_id       TEXT REFERENCES topics(id) ON DELETE SET NULL,
    content        TEXT NOT NULL,
    token_count    INTEGER,
    latency_ms     INTEGER,
    model_name     TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (session_id, sequence_num)
) STRICT;
CREATE INDEX ix_messages__session_created ON messages(session_id, created_at);
CREATE INDEX ix_messages__classification  ON messages(classification);

CREATE TABLE message_visuals (
    id            TEXT PRIMARY KEY,
    message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    tag_name      TEXT NOT NULL REFERENCES visual_tag_specs(tag_name) ON DELETE RESTRICT,
    raw_tag       TEXT NOT NULL,
    params        TEXT CHECK (params IS NULL OR json_valid(params)),
    render_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (render_status IN ('pending','rendered','failed','skipped')),
    rendered_at   TEXT,
    error_message TEXT
) STRICT;
CREATE INDEX ix_message_visuals__tag     ON message_visuals(tag_name);
CREATE INDEX ix_message_visuals__message ON message_visuals(message_id);

CREATE TABLE off_topic_events (
    id             TEXT PRIMARY KEY,
    message_id     TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    detected_label TEXT,
    user_choice    TEXT NOT NULL DEFAULT 'pending'
                   CHECK (user_choice IN ('pending','explain','continue')),
    decided_at     TEXT
) STRICT;
CREATE INDEX ix_off_topic_events__choice ON off_topic_events(user_choice);

-- =====================================================================
-- 6. DIAGNOSTICS, AUDIT, FLAGS, ROLLUPS
-- =====================================================================

CREATE TABLE diagnostic_interviews (
    id             TEXT PRIMARY KEY,
    student_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id  TEXT REFERENCES enrollments(id) ON DELETE SET NULL,
    level_assigned TEXT CHECK (level_assigned IN
                     ('beginner','beginner_intermediate','intermediate','advanced')),
    raw_responses  TEXT NOT NULL CHECK (json_valid(raw_responses)),
    completed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX ix_diagnostic_interviews__student ON diagnostic_interviews(student_id);

CREATE TABLE audit_log (
    id            INTEGER PRIMARY KEY,                -- rowid alias, autoincrement-by-default
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_table  TEXT,
    target_id     TEXT,
    before_state  TEXT CHECK (before_state IS NULL OR json_valid(before_state)),
    after_state   TEXT CHECK (after_state  IS NULL OR json_valid(after_state)),
    ip_address    TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX ix_audit_log__actor   ON audit_log(actor_user_id);
CREATE INDEX ix_audit_log__target  ON audit_log(target_table, target_id);
CREATE INDEX ix_audit_log__created ON audit_log(created_at DESC);

CREATE TABLE feature_flags (
    key        TEXT PRIMARY KEY,
    enabled    INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
    payload    TEXT CHECK (payload IS NULL OR json_valid(payload)),
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE daily_student_activity (
    student_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day                TEXT NOT NULL,
    messages_sent      INTEGER NOT NULL DEFAULT 0,
    topics_visited     INTEGER NOT NULL DEFAULT 0,
    quiz_attempts      INTEGER NOT NULL DEFAULT 0,
    time_spent_minutes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, day)
) STRICT;

CREATE TABLE topic_difficulty_stats (
    topic_id       TEXT PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
    attempts_total INTEGER NOT NULL DEFAULT 0,
    pass_count     INTEGER NOT NULL DEFAULT 0,
    avg_score_pct  REAL,
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- =====================================================================
-- 7. TRIGGERS
--   (a) updated_at auto-maintenance on mutable entities
--   (b) role-guard triggers for profile and authoring tables
-- =====================================================================

-- updated_at on users
CREATE TRIGGER trg_users_upd AFTER UPDATE ON users
FOR EACH ROW BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_courses_upd AFTER UPDATE ON courses
FOR EACH ROW BEGIN
  UPDATE courses SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_modules_upd AFTER UPDATE ON modules
FOR EACH ROW BEGIN
  UPDATE modules SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_topics_upd AFTER UPDATE ON topics
FOR EACH ROW BEGIN
  UPDATE topics SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_assessments_upd AFTER UPDATE ON assessments
FOR EACH ROW BEGIN
  UPDATE assessments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- Role guard: student_profiles must point at a 'student' user
CREATE TRIGGER trg_student_profile_role_ins
BEFORE INSERT ON student_profiles
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.user_id) <> 'student'
BEGIN
  SELECT RAISE(ABORT, 'student_profiles.user_id must reference a user with role=student');
END;

CREATE TRIGGER trg_student_profile_role_upd
BEFORE UPDATE ON student_profiles
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.user_id) <> 'student'
BEGIN
  SELECT RAISE(ABORT, 'student_profiles.user_id must reference a user with role=student');
END;

-- Role guard: instructor_profiles must point at an 'instructor' user
CREATE TRIGGER trg_instructor_profile_role_ins
BEFORE INSERT ON instructor_profiles
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.user_id) <> 'instructor'
BEGIN
  SELECT RAISE(ABORT, 'instructor_profiles.user_id must reference a user with role=instructor');
END;

CREATE TRIGGER trg_instructor_profile_role_upd
BEFORE UPDATE ON instructor_profiles
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.user_id) <> 'instructor'
BEGIN
  SELECT RAISE(ABORT, 'instructor_profiles.user_id must reference a user with role=instructor');
END;

-- Role guard: courses must be authored by instructor or admin
CREATE TRIGGER trg_course_author_role_ins
BEFORE INSERT ON courses
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.created_by) NOT IN ('instructor','admin')
BEGIN
  SELECT RAISE(ABORT, 'courses.created_by must be an instructor or admin');
END;

CREATE TRIGGER trg_course_author_role_upd
BEFORE UPDATE ON courses
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.created_by) NOT IN ('instructor','admin')
BEGIN
  SELECT RAISE(ABORT, 'courses.created_by must be an instructor or admin');
END;

-- Role guard: only students can enroll
CREATE TRIGGER trg_enrollment_role_ins
BEFORE INSERT ON enrollments
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.student_id) <> 'student'
BEGIN
  SELECT RAISE(ABORT, 'enrollments.student_id must be a user with role=student');
END;

CREATE TRIGGER trg_enrollment_role_upd
BEFORE UPDATE ON enrollments
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.student_id) <> 'student'
BEGIN
  SELECT RAISE(ABORT, 'enrollments.student_id must be a user with role=student');
END;

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================
