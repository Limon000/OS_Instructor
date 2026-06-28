import type { CourseOut } from "../../api/profile";

interface Props {
  courses: CourseOut[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function InstructorCoursesSection({ courses }: Props) {
  if (courses.length === 0) {
    return (
      <div className="ics-root">
        <h3 className="ics-title">My Courses</h3>
        <p className="ics-empty">No courses created yet.</p>
      </div>
    );
  }

  return (
    <div className="ics-root">
      <h3 className="ics-title">My Courses ({courses.length})</h3>
      <div className="ics-cards">
        {courses.map((c) => (
          <div key={c.course_id} className="ics-card">
            <div className="ics-card-header">
              <span className="ics-course-title">{c.title}</span>
              <span
                className="ics-pub-badge"
                style={{
                  background: c.is_published ? "#dcfce7" : "#fef9c3",
                  color: c.is_published ? "#16a34a" : "#b45309",
                }}
              >
                {c.is_published ? "Published" : "Draft"}
              </span>
            </div>
            {c.description && <p className="ics-desc">{c.description}</p>}
            <div className="ics-meta">
              <span>{c.module_count} module{c.module_count !== 1 ? "s" : ""}</span>
              <span>{c.enrollment_count} student{c.enrollment_count !== 1 ? "s" : ""}</span>
              <span>Created {formatDate(c.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
