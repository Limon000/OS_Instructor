-- =====================================================================
-- OS_Instructor — Relational Schema (PostgreSQL 14+)
-- =====================================================================
-- Author       : Database Engineering
-- Last updated : 2026-06-18
-- Target       : PostgreSQL 14+ (UUID, ENUM, JSONB, CITEXT, partial indexes)
-- Portability  : See DATABASE_DESIGN.md §"SQLite parity" for the subset
--                that maps cleanly onto SQLite for local development.
--
-- Conventions:
--   * PK     : UUID v4 (gen_random_uuid()), externally safe to expose.
--   * Time   : TIMESTAMPTZ stored in UTC.
--   * Delete : soft-delete on user-owned data (`deleted_at`); cascading
--              where loss of the parent makes the child meaningless.
--   * Naming : snake_case; plural tables; FK `fk_<table>__<col>`.
--   * Audit  : `created_at` / `updated_at` on every mutable entity;
--              `updated_at` maintained by trigger (§9).
--   * Roles  : enforced via triggers (§9) because Postgres CHECK
--              constraints cannot reference other rows.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- =====================================================================
-- 0. ENUM TYPES
-- =====================================================================
CREATE TYPE user_role             AS ENUM ('admin','instructor','student');
CREATE TYPE user_status           AS ENUM ('active','suspended','pending','deleted');
CREATE TYPE enrollment_mode       AS ENUM ('single_topic','beginner_zero','prior_knowledge');
CREATE TYPE enrollment_status     AS ENUM ('active','completed','dropped','paused');
CREATE TYPE proficiency_level     AS ENUM ('beginner','beginner_intermediate','intermediate','advanced');
CREATE TYPE topic_progress_status AS ENUM ('not_started','in_progress','completed','mastered');
CREATE TYPE assessment_kind       AS ENUM ('topic_quiz','module_quiz','final_exam','diagnostic');
CREATE TYPE question_type         AS ENUM ('factual','conceptual','applied','mcq','short_answer','tracing');
CREATE TYPE attempt_outcome       AS ENUM ('in_progress','submitted','graded','expired');
CREATE TYPE session_status        AS ENUM ('active','finished','abandoned');
CREATE TYPE message_role          AS ENUM ('user','assistant','system');
CREATE TYPE message_class         AS ENUM ('on_topic','casual','off_topic','system','unknown');
CREATE TYPE off_topic_choice      AS ENUM ('pending','explain','continue');
CREATE TYPE visual_render_status  AS ENUM ('pending','rendered','failed','skipped');

-- =====================================================================
-- 1. IDENTITY & ACCESS
-- =====================================================================

CREATE TABLE users (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email              CITEXT       NOT NULL UNIQUE,
    password_hash      TEXT         NOT NULL,                  -- argon2id recommended
    full_name          VARCHAR(120) NOT NULL,
    role               user_role    NOT NULL,
    status             user_status  NOT NULL DEFAULT 'pending',
    email_verified_at  TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX ix_users__role_status
    ON users(role, status) WHERE deleted_at IS NULL;

CREATE TABLE user_profiles (
    user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_url         TEXT,
    bio                TEXT,
    timezone           VARCHAR(64)  NOT NULL DEFAULT 'UTC',
    preferred_lang     VARCHAR(8)   NOT NULL DEFAULT 'en',
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash         TEXT NOT NULL UNIQUE,              -- never store raw token
    ip_address         INET,
    user_agent         TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auth_sessions__user_active
    ON auth_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions__expires
    ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_resets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash         TEXT NOT NULL UNIQUE,
    expires_at         TIMESTAMPTZ NOT NULL,
    used_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role-specific 1:1 extensions ---------------------------------------
CREATE TABLE student_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    proficiency_level    proficiency_level,   -- assigned by diagnostic (Mode C)
    daily_streak         INT  NOT NULL DEFAULT 0,
    longest_streak       INT  NOT NULL DEFAULT 0,
    last_active_day      DATE,
    total_minutes_spent  INT  NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE instructor_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title                VARCHAR(120),         -- "Professor", "TA"
    years_experience     SMALLINT,
    expertise_areas      TEXT[],
    bio_long             TEXT,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2. COURSE CONTENT (Taxonomy)
-- =====================================================================

CREATE TABLE courses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug               VARCHAR(64)  NOT NULL UNIQUE,
    title              VARCHAR(160) NOT NULL,
    description        TEXT,
    primary_reference  TEXT,                                  -- "Silberschatz 10e"
    created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_courses__published ON courses(is_published) WHERE is_published;

CREATE TABLE modules (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    position           SMALLINT NOT NULL,                     -- 1..10
    title              VARCHAR(160) NOT NULL,
    description        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, position)
);
CREATE INDEX ix_modules__course ON modules(course_id);

CREATE TABLE topics (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id          UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    position           SMALLINT NOT NULL,
    code               VARCHAR(8)  NOT NULL,                  -- "2.1", "5.3"
    title              VARCHAR(160) NOT NULL,
    description        TEXT,
    learning_objectives TEXT[],
    chapter_ref        VARCHAR(64),                           -- "Silberschatz Ch.3"
    visual_tag_name    VARCHAR(64),                           -- → visual_tag_specs.tag_name
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (module_id, position),
    UNIQUE (module_id, code)
);
CREATE INDEX ix_topics__module ON topics(module_id);

CREATE TABLE topic_resources (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id           UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    kind               VARCHAR(32) NOT NULL,                  -- 'book','man_page','link','code','pseudocode'
    title              VARCHAR(200) NOT NULL,
    url_or_path        TEXT,
    citation           TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_topic_resources__topic ON topic_resources(topic_id);

-- Visual-tag registry (single source of truth, mirrors VISUAL_MAP in visuals.py)
CREATE TABLE visual_tag_specs (
    tag_name           VARCHAR(64) PRIMARY KEY,               -- 'process_state_diagram'
    description        TEXT,
    renderer_kind      VARCHAR(16) NOT NULL,                  -- 'matplotlib' | 'graphviz'
    params_schema      JSONB,                                 -- optional JSON Schema
    sample_args        TEXT,                                  -- e.g. 'P1=4,P2=3'
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE topics
    ADD CONSTRAINT fk_topics__visual_tag
    FOREIGN KEY (visual_tag_name) REFERENCES visual_tag_specs(tag_name) ON DELETE SET NULL;

-- =====================================================================
-- 3. ENROLLMENT & LEARNING PATHS
-- =====================================================================

CREATE TABLE enrollments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    mode               enrollment_mode   NOT NULL,
    status             enrollment_status NOT NULL DEFAULT 'active',
    current_topic_id   UUID REFERENCES topics(id) ON DELETE SET NULL,
    progress_pct       NUMERIC(5,2) NOT NULL DEFAULT 0.00
                       CHECK (progress_pct BETWEEN 0 AND 100),
    enrolled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, course_id)
);
CREATE INDEX ix_enrollments__student_status ON enrollments(student_id, status);

CREATE TABLE learning_paths (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    mode               enrollment_mode NOT NULL,
    proficiency_level  proficiency_level,                     -- relevant for prior_knowledge mode
    version            SMALLINT NOT NULL DEFAULT 1,
    generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, version)
);

CREATE TABLE learning_path_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_path_id   UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    day_number         SMALLINT NOT NULL,
    item_kind          VARCHAR(16) NOT NULL,                  -- 'topic','review','rest','module_quiz','final_exam'
    topic_id           UUID REFERENCES topics(id) ON DELETE SET NULL,
    assessment_id      UUID,                                  -- FK added after assessments table
    status             VARCHAR(16) NOT NULL DEFAULT 'planned',-- 'planned','active','done','skipped'
    scheduled_for      DATE,
    completed_at       TIMESTAMPTZ,
    UNIQUE (learning_path_id, day_number)
);

CREATE TABLE topic_progress (
    student_id         UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    topic_id           UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status             topic_progress_status NOT NULL DEFAULT 'not_started',
    mastery_score      NUMERIC(5,2) CHECK (mastery_score BETWEEN 0 AND 100),
    first_visited_at   TIMESTAMPTZ,
    last_visited_at    TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    PRIMARY KEY (student_id, topic_id)
);
CREATE INDEX ix_topic_progress__student_status
    ON topic_progress(student_id, status);

CREATE TABLE module_progress (
    student_id         UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    module_id          UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    status             topic_progress_status NOT NULL DEFAULT 'not_started',
    quiz_score_pct     NUMERIC(5,2) CHECK (quiz_score_pct BETWEEN 0 AND 100),
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, module_id)
);

-- =====================================================================
-- 4. ASSESSMENTS (Quizzes & Exams)
-- =====================================================================

CREATE TABLE assessments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind               assessment_kind NOT NULL,
    course_id          UUID REFERENCES courses(id) ON DELETE CASCADE,
    module_id          UUID REFERENCES modules(id) ON DELETE CASCADE,
    topic_id           UUID REFERENCES topics(id)  ON DELETE CASCADE,
    title              VARCHAR(200) NOT NULL,
    num_questions      SMALLINT NOT NULL,
    pass_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00
                       CHECK (pass_threshold_pct BETWEEN 0 AND 100),
    time_limit_sec     INT,                                   -- NULL = untimed
    created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Exactly one scope must be set:
    CHECK (
      (CASE WHEN topic_id  IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN module_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN course_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX ix_assessments__kind ON assessments(kind);
CREATE INDEX ix_assessments__scope
    ON assessments(course_id, module_id, topic_id);

-- Late-bound FK from learning_path_items.assessment_id
ALTER TABLE learning_path_items
    ADD CONSTRAINT fk_learning_path_items__assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL;

CREATE TABLE questions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id      UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    position           SMALLINT NOT NULL,
    question_type      question_type NOT NULL,
    prompt             TEXT NOT NULL,
    explanation        TEXT,
    difficulty         SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
    points             SMALLINT NOT NULL DEFAULT 1,
    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assessment_id, position)
);

CREATE TABLE question_options (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id        UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position           SMALLINT NOT NULL,
    text               TEXT NOT NULL,
    is_correct         BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (question_id, position)
);

CREATE TABLE attempts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id      UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    attempt_number     SMALLINT NOT NULL,
    outcome            attempt_outcome NOT NULL DEFAULT 'in_progress',
    score_pct          NUMERIC(5,2) CHECK (score_pct BETWEEN 0 AND 100),
    passed             BOOLEAN,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at       TIMESTAMPTZ,
    graded_at          TIMESTAMPTZ,
    UNIQUE (student_id, assessment_id, attempt_number)
);
CREATE INDEX ix_attempts__student   ON attempts(student_id);
CREATE INDEX ix_attempts__assessment ON attempts(assessment_id);

CREATE TABLE attempt_answers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id         UUID NOT NULL REFERENCES attempts(id)  ON DELETE CASCADE,
    question_id        UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    selected_option_id UUID REFERENCES question_options(id)   ON DELETE SET NULL,
    raw_answer         TEXT,
    is_correct         BOOLEAN,
    points_awarded     NUMERIC(5,2),
    feedback           TEXT,
    scored_at          TIMESTAMPTZ,
    UNIQUE (attempt_id, question_id)
);

-- =====================================================================
-- 5. CONVERSATIONS (Sessions, Messages, Visuals)
--    Replaces the flat progress.json with a real session model.
-- =====================================================================

CREATE TABLE sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id      UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    status             session_status NOT NULL DEFAULT 'active',
    title              VARCHAR(200),
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at           TIMESTAMPTZ
);
CREATE INDEX ix_sessions__student_status ON sessions(student_id, status);
CREATE INDEX ix_sessions__enrollment
    ON sessions(enrollment_id) WHERE enrollment_id IS NOT NULL;
-- "Finish Session" → status='finished'; "Start New Session" → soft-delete the old.

CREATE TABLE messages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence_num       INT NOT NULL,                          -- monotonic per session
    role               message_role  NOT NULL,
    classification     message_class NOT NULL DEFAULT 'unknown',
    topic_id           UUID REFERENCES topics(id) ON DELETE SET NULL,
    content            TEXT NOT NULL,
    token_count        INT,
    latency_ms         INT,
    model_name         VARCHAR(64),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, sequence_num)
);
CREATE INDEX ix_messages__session_created ON messages(session_id, created_at);
CREATE INDEX ix_messages__classification  ON messages(classification);

-- One row per [VISUAL:...] tag emitted by the assistant.
CREATE TABLE message_visuals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id         UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    tag_name           VARCHAR(64) NOT NULL
                       REFERENCES visual_tag_specs(tag_name) ON DELETE RESTRICT,
    raw_tag            TEXT NOT NULL,                         -- "[VISUAL:gantt_chart:P1=4,P2=3]"
    params             JSONB,
    render_status      visual_render_status NOT NULL DEFAULT 'pending',
    rendered_at        TIMESTAMPTZ,
    error_message      TEXT
);
CREATE INDEX ix_message_visuals__tag     ON message_visuals(tag_name);
CREATE INDEX ix_message_visuals__message ON message_visuals(message_id);

-- Tracks the Yes/No follow-up dialog from off-topic.md.
CREATE TABLE off_topic_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id         UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    detected_label     VARCHAR(120),                          -- "[topic]" substituted
    user_choice        off_topic_choice NOT NULL DEFAULT 'pending',
    decided_at         TIMESTAMPTZ
);
CREATE INDEX ix_off_topic_events__choice ON off_topic_events(user_choice);

-- =====================================================================
-- 6. DIAGNOSTICS (Mode C — prior-knowledge assessment)
-- =====================================================================

CREATE TABLE diagnostic_interviews (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id      UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    level_assigned     proficiency_level,
    raw_responses      JSONB NOT NULL,                        -- 5 Q&A pairs
    completed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_diagnostic_interviews__student ON diagnostic_interviews(student_id);

-- =====================================================================
-- 7. AUDIT & GOVERNANCE (Admin purview)
-- =====================================================================

CREATE TABLE audit_log (
    id                 BIGSERIAL PRIMARY KEY,                 -- high write volume
    actor_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    action             VARCHAR(64) NOT NULL,                  -- 'user.suspend','course.publish'
    target_table       VARCHAR(64),
    target_id          UUID,
    before_state       JSONB,
    after_state        JSONB,
    ip_address         INET,
    user_agent         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_log__actor    ON audit_log(actor_user_id);
CREATE INDEX ix_audit_log__target   ON audit_log(target_table, target_id);
CREATE INDEX ix_audit_log__created  ON audit_log(created_at DESC);

CREATE TABLE feature_flags (
    key                VARCHAR(64) PRIMARY KEY,
    enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    payload            JSONB,
    updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. ANALYTICS ROLLUPS (denormalized; refreshed by nightly job)
-- =====================================================================

CREATE TABLE daily_student_activity (
    student_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day                DATE NOT NULL,
    messages_sent      INT NOT NULL DEFAULT 0,
    topics_visited     INT NOT NULL DEFAULT 0,
    quiz_attempts      INT NOT NULL DEFAULT 0,
    time_spent_minutes INT NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, day)
);

CREATE TABLE topic_difficulty_stats (
    topic_id           UUID PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
    attempts_total     INT NOT NULL DEFAULT 0,
    pass_count         INT NOT NULL DEFAULT 0,
    avg_score_pct      NUMERIC(5,2),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 9. TRIGGERS
--    (a) updated_at automation
--    (b) role guards for the 1:1 profile tables and authored content
-- =====================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'users','user_profiles','student_profiles','instructor_profiles',
      'courses','modules','topics','assessments','feature_flags',
      'enrollments','module_progress'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_upd
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t);
  END LOOP;
END $$;

-- Role guard for student_profiles -------------------------------------
CREATE OR REPLACE FUNCTION guard_student_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.user_id;
    IF r <> 'student' THEN
        RAISE EXCEPTION 'student_profiles.user_id (%) must reference a user with role=student', NEW.user_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_student_profile_role
    BEFORE INSERT OR UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION guard_student_profile_role();

-- Role guard for instructor_profiles ----------------------------------
CREATE OR REPLACE FUNCTION guard_instructor_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.user_id;
    IF r <> 'instructor' THEN
        RAISE EXCEPTION 'instructor_profiles.user_id (%) must reference a user with role=instructor', NEW.user_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_instructor_profile_role
    BEFORE INSERT OR UPDATE ON instructor_profiles
    FOR EACH ROW EXECUTE FUNCTION guard_instructor_profile_role();

-- Role guard: courses must be authored by instructor or admin ---------
CREATE OR REPLACE FUNCTION guard_course_author_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.created_by;
    IF r NOT IN ('instructor','admin') THEN
        RAISE EXCEPTION 'courses.created_by (%) must be an instructor or admin', NEW.created_by;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_course_author_role
    BEFORE INSERT OR UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION guard_course_author_role();

-- Role guard: only students can enroll --------------------------------
CREATE OR REPLACE FUNCTION guard_enrollment_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.student_id;
    IF r <> 'student' THEN
        RAISE EXCEPTION 'enrollments.student_id (%) must be a student', NEW.student_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_enrollment_role
    BEFORE INSERT OR UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION guard_enrollment_role();

-- Keep sessions.last_activity_at current whenever a new message is inserted
CREATE OR REPLACE FUNCTION update_session_last_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sessions SET last_activity_at = now() WHERE id = NEW.session_id;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_message_session_activity
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_session_last_activity();

-- =====================================================================
-- 10. SEED DATA — visual tag registry (mirrors VISUAL_MAP in visuals.py)
-- =====================================================================
INSERT INTO visual_tag_specs (tag_name, description, renderer_kind, sample_args) VALUES
  ('process_state_diagram', 'Process lifecycle states',         'graphviz',   NULL),
  ('gantt_chart',           'CPU scheduling Gantt chart',       'matplotlib', 'P1=4,P2=3'),
  ('os_layer_diagram',      'OS layered architecture',          'graphviz',   NULL),
  ('memory_hierarchy',      'Memory pyramid hierarchy',         'matplotlib', NULL),
  ('paging_diagram',        'Logical → Page Table → Physical',  'matplotlib', NULL),
  ('page_replacement',      'Frame table with fault highlight', 'matplotlib', 'FIFO'),
  ('disk_scheduling',       'Disk head movement chart',         'matplotlib', '98,183,37'),
  ('raid_diagram',          'RAID block layout',                'matplotlib', 'RAID5'),
  ('semaphore_diagram',     'Producer → Buffer → Consumer',     'graphviz',   NULL),
  ('dining_philosophers',   'Dining philosophers graph',        'graphviz',   NULL);

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================
