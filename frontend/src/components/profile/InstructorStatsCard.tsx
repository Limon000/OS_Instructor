import type { InstructorProfileData } from "../../api/profile";

interface Props {
  instructor: InstructorProfileData;
}

export default function InstructorStatsCard({ instructor }: Props) {
  const areas: string[] = (() => {
    if (!instructor.expertise_areas) return [];
    try {
      const parsed = JSON.parse(instructor.expertise_areas);
      return Array.isArray(parsed) ? parsed : [instructor.expertise_areas];
    } catch {
      return instructor.expertise_areas.split(",").map((s) => s.trim()).filter(Boolean);
    }
  })();

  return (
    <div className="isc-root">
      <h3 className="isc-title">Instructor Info</h3>
      <div className="isc-grid">
        {instructor.title && (
          <div className="isc-stat">
            <span className="isc-label">Title</span>
            <span className="isc-value">{instructor.title}</span>
          </div>
        )}
        {instructor.years_experience != null && (
          <div className="isc-stat">
            <span className="isc-label">Experience</span>
            <span className="isc-value">{instructor.years_experience} years</span>
          </div>
        )}
      </div>

      {areas.length > 0 && (
        <div className="isc-areas">
          <span className="isc-label">Expertise Areas</span>
          <div className="isc-tags">
            {areas.map((a) => (
              <span key={a} className="isc-tag">{a}</span>
            ))}
          </div>
        </div>
      )}

      {instructor.bio_long && (
        <div className="isc-bio">
          <span className="isc-label">About</span>
          <p className="isc-bio-text">{instructor.bio_long}</p>
        </div>
      )}
    </div>
  );
}
