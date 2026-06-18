# OS_Instructor — Database Design

**Engine:** PostgreSQL 14+ (primary) · SQLite 3 (local dev, subset)
**DDL:** `schema.sql`
**Roles:** `admin`, `instructor`, `student`

---

## 1. Goals

The data model has to support three concerns that the current `progress.json` file cannot:

1. **Multi-tenant identity** — three distinct roles (admin, instructor, student) with different write paths and visibility scopes.
2. **A persistent course taxonomy** — 10 modules and ~50 topics, authored by instructors, consumed by students, governed by admins.
3. **Per-student state at scale** — enrollments, learning paths, granular topic/module progress, quiz attempts, conversational sessions, and the `[VISUAL:...]` tag stream — durable across the "Finish Session" / "Start New Session" lifecycle.

A secondary goal is **observability**: an audit log for admin actions, classified message logs for product analytics, and rollup tables for dashboards without scanning the raw `messages` table.

---

## 2. Logical Areas

The schema is partitioned into eight logical areas, each a section in `schema.sql`:

| § | Area | Owns |
|---|---|---|
| 1 | Identity & Access | `users`, `user_profiles`, `auth_sessions`, `password_resets`, `student_profiles`, `instructor_profiles` |
| 2 | Course Content | `courses`, `modules`, `topics`, `topic_resources`, `visual_tag_specs` |
| 3 | Enrollment & Learning Paths | `enrollments`, `learning_paths`, `learning_path_items`, `topic_progress`, `module_progress` |
| 4 | Assessments | `assessments`, `questions`, `question_options`, `attempts`, `attempt_answers` |
| 5 | Conversations | `sessions`, `messages`, `message_visuals`, `off_topic_events` |
| 6 | Diagnostics | `diagnostic_interviews` |
| 7 | Audit & Governance | `audit_log`, `feature_flags` |
| 8 | Analytics Rollups | `daily_student_activity`, `topic_difficulty_stats` |

---

## 3. Entity Relationship Overview

```
                       ┌──────────┐
                       │  users   │ role ∈ {admin, instructor, student}
                       └────┬─────┘
        ┌──────────────────┼───────────────────────────────┐
        │                  │                               │
┌───────▼────────┐ ┌───────▼───────────┐         ┌─────────▼──────────┐
│student_profiles│ │instructor_profiles│         │ audit_log (actor)  │
└────────────────┘ └───────────────────┘         └────────────────────┘
        │                  │
        │                  │ created_by
        │           ┌──────▼──────┐
        │           │   courses   │
        │           └──────┬──────┘
        │                  │
        │           ┌──────▼──────┐
        │           │   modules   │ (10 per course)
        │           └──────┬──────┘
        │                  │
        │           ┌──────▼──────┐
        │           │   topics    │ ── visual_tag_specs
        │           └──────┬──────┘
        │                  │
        │           ┌──────▼──────────┐
        │           │ topic_resources │
        │           └─────────────────┘
        │
        │ ┌──────────────┐         ┌───────────────┐
        ├─▶ enrollments  │────────▶│ learning_paths│──▶ learning_path_items
        │ └──────┬───────┘         └───────────────┘
        │        │
        │ ┌──────▼────────┐  ┌────────────────┐
        ├─▶  sessions     │─▶│    messages    │──▶ message_visuals
        │ └───────────────┘  └────────┬───────┘     off_topic_events
        │                             │
        │ ┌───────────────┐           │
        ├─▶  attempts     │──▶ attempt_answers
        │ └───────┬───────┘           │
        │         │                   │
        │ ┌───────▼───────┐  ┌────────▼───────┐
        ├─▶ topic_progress│  │ module_progress│
        │ └───────────────┘  └────────────────┘
        │
        └─▶ diagnostic_interviews
```

---

## 4. Role Model

A single-role-per-user enum on `users.role` is chosen over a full RBAC join because the three roles are mutually exclusive in this domain and never composed. Role-based authorisation lives at the application layer (FastAPI middleware), but the **database enforces invariants** via triggers (§9 of the DDL):

| Invariant | Enforced by |
|---|---|
| `student_profiles.user_id` must reference a `student` | `trg_student_profile_role` |
| `instructor_profiles.user_id` must reference an `instructor` | `trg_instructor_profile_role` |
| `courses.created_by` must be `instructor` or `admin` | `trg_course_author_role` |
| `enrollments.student_id` must be a `student` | `trg_enrollment_role` |

### Role × Table write matrix

A pragmatic mental model of who writes what. (Reads are largely permissive; the admin can read everything.)

| Table | Admin | Instructor | Student |
|---|---|---|---|
| `users`, `user_profiles` | full | self only | self only |
| `auth_sessions`, `password_resets` | revoke any | self | self |
| `courses`, `modules`, `topics`, `topic_resources` | full | own courses | read only |
| `visual_tag_specs` | full | full | read only |
| `enrollments` | full | read | self insert/update |
| `learning_paths`, `learning_path_items` | full | read | self generated |
| `topic_progress`, `module_progress` | full | read | self only |
| `assessments`, `questions`, `question_options` | full | own course | read only |
| `attempts`, `attempt_answers` | full | read | self only |
| `sessions`, `messages`, `message_visuals`, `off_topic_events` | full | read | self only |
| `diagnostic_interviews` | full | read aggregate | self only |
| `audit_log` | append-only read | — | — |
| `feature_flags` | full | read | read |

---

## 5. Salient design decisions

### 5.1 UUID primary keys
All externally-visible IDs are `UUID v4` from `pgcrypto.gen_random_uuid()`. Rationale: safe to expose in URLs, no enumeration leakage, and trivially shardable later. The exception is `audit_log` which uses `BIGSERIAL` because it is write-heavy and never URL-addressable.

### 5.2 Conversational state replaces `progress.json`
The flat JSON file is replaced by the `sessions` + `messages` pair. The two sidebar buttons map naturally:

- **💾 Finish Session** → `UPDATE sessions SET status='finished', ended_at=now() WHERE id=?` — messages are preserved and resumable.
- **🔄 Start New Session** → mark the prior session `abandoned` (or hard-delete after a retention window) and `INSERT` a fresh row. The conversation is never silently lost.

`messages.classification` records the three-way `classify_message()` output (`on_topic` / `casual` / `off_topic`) at write time. This is what powers product analytics — "what fraction of inbound traffic is small talk?" becomes a one-line aggregate.

### 5.3 Visual tags as first-class data
`visual_tag_specs` is the single source of truth — mirrored at runtime by `VISUAL_MAP` in `visuals.py`. Every `[VISUAL:...]` tag emitted by Limon becomes a row in `message_visuals` with parsed `params` JSONB and a `render_status`. This gives us:

- exact-once accounting of which diagrams were rendered to which student,
- a clean error trail when a renderer fails (e.g. malformed `P1=4,P2=` args),
- analytics on which diagrams are most consumed (drives prioritisation of new renderers).

### 5.4 Off-topic dialog modelled as events
`off_topic_events` captures the Yes/No follow-up specified in `off-topic.md`. The `user_choice` enum (`pending` → `explain` | `continue`) records which branch the user took, enabling a metric like "off-topic acceptance rate" without text parsing.

### 5.5 Assessment scope check
`assessments` has nullable `course_id`, `module_id`, and `topic_id`. A `CHECK` constraint enforces that **exactly one** is non-null, modelling the topic-quiz / module-quiz / final-exam hierarchy cleanly without table-per-kind explosion.

### 5.6 Compound primary keys for progress tables
`topic_progress (student_id, topic_id)` and `module_progress (student_id, module_id)` use compound PKs because the row's identity *is* the pair. This eliminates a surrogate index, reduces row size, and the natural key gives free upsert semantics:

```sql
INSERT INTO topic_progress (student_id, topic_id, status, last_visited_at)
VALUES ($1, $2, 'in_progress', now())
ON CONFLICT (student_id, topic_id) DO UPDATE
   SET status = EXCLUDED.status,
       last_visited_at = EXCLUDED.last_visited_at;
```

### 5.7 Soft delete on `users` only
Only `users.deleted_at` is soft. Everything cascades on user deletion via FK `ON DELETE CASCADE` — but soft-deleting the user preserves enrollment and audit history until a scheduled job hard-deletes after the retention window (typically 30 days, GDPR-compliant).

### 5.8 ENUM vs lookup tables
ENUM types were chosen for values that change rarely (roles, statuses, classifications). Where the set is expected to evolve (e.g. `topic_resources.kind` or `learning_path_items.item_kind`), `VARCHAR` is used to avoid the operational cost of `ALTER TYPE … ADD VALUE` migrations.

---

## 6. Indexing strategy

The indexes in `schema.sql` are not speculative — each one targets a known query path:

| Index | Query it serves |
|---|---|
| `ix_users__role_status` (partial, `WHERE deleted_at IS NULL`) | Admin dashboards filtering by role |
| `ix_auth_sessions__user_active` (partial, `WHERE revoked_at IS NULL`) | Login → active session lookup |
| `ix_courses__published` (partial, `WHERE is_published`) | Student-facing course list |
| `ix_enrollments__student_status` | "What's my current enrollment?" hot path |
| `ix_messages__session_created` | Conversation rehydration on resume |
| `ix_messages__classification` | Classification analytics |
| `ix_attempts__student` / `__assessment` | Gradebook views |
| `ix_audit_log__created DESC` | Admin tail-of-log views |

Partial indexes are favoured wherever the predicate eliminates >50% of rows — smaller index, faster writes, identical read latency.

---

## 7. Retention & GDPR

| Data | Retention | Mechanism |
|---|---|---|
| `auth_sessions` (revoked or expired) | 30 days | nightly job `DELETE WHERE coalesce(revoked_at, expires_at) < now() - interval '30 days'` |
| `password_resets` (used or expired) | 7 days | same pattern |
| `users` (soft-deleted) | 30 days | nightly hard-delete; cascades wipe student-owned rows |
| `messages` (abandoned sessions) | 90 days | nightly purge if `sessions.status='abandoned'` |
| `audit_log` | 2 years | quarterly archive to cold storage |
| `daily_student_activity` | indefinite (aggregate, anonymised after user delete) | — |

---

## 8. SQLite parity (local development)

For local dev without a Postgres server, the schema runs on SQLite 3 with these substitutions:

| Postgres | SQLite |
|---|---|
| `UUID` + `gen_random_uuid()` | `TEXT` + app-side UUID generation |
| `TIMESTAMPTZ` | `TEXT` ISO-8601 |
| `CITEXT` | `TEXT COLLATE NOCASE` |
| `ENUM` types | `TEXT` + `CHECK (col IN (...))` |
| `JSONB` | `TEXT` (JSON1 extension for queries) |
| `INET` | `TEXT` |
| Triggers (PL/pgSQL) | SQLite triggers in SQL |
| Partial indexes | supported as-is |

A generator script (`tools/gen_sqlite_schema.py`, future) will mechanically transform `schema.sql`. Until then, the test suite should run against Postgres in CI and SQLite is dev-machine convenience only.

---

## 9. Open questions for review

1. **OAuth / SSO** — `password_hash` assumes local auth. If we add Google SSO, we need an `auth_identities (user_id, provider, provider_user_id)` table.
2. **Multi-course generalisation** — the schema already supports many courses, but the current product is single-course. The `course_id` columns add modest cost now and remove a painful migration later.
3. **LLM message provenance** — `messages.model_name` is captured but prompt versioning is not. A `prompt_versions` table keyed off `instructor.md` commit SHA would let us A/B teaching prompts.
4. **Question bank reuse** — `questions` are currently scoped to a single `assessment_id`. If reuse becomes a need, introduce `question_bank` + `assessment_questions` (many-to-many).

---

## 10. How to apply

```bash
# Postgres 14+
createdb os_instructor
psql -d os_instructor -f db/schema.sql

# Verify
psql -d os_instructor -c "\dt"
psql -d os_instructor -c "SELECT tag_name, renderer_kind FROM visual_tag_specs;"
```

The seed at the bottom of `schema.sql` populates `visual_tag_specs`. Course / module / topic content should be loaded via a separate seed migration that parses `.claude/instructor.md`.
