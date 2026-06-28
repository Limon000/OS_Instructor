import { useState } from "react";
import type { InstructorProfileData, InstructorUpdate } from "../../api/profile";
import { profileApi } from "../../api/profile";

interface Props {
  instructor: InstructorProfileData;
  onSaved: (updated: InstructorProfileData) => void;
}

function areasToString(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.join(", ") : raw;
  } catch {
    return raw;
  }
}

function stringToAreasJson(s: string): string {
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return JSON.stringify(parts);
}

export default function InstructorEditForm({ instructor, onSaved }: Props) {
  const [title, setTitle] = useState(instructor.title ?? "");
  const [years, setYears] = useState(String(instructor.years_experience ?? ""));
  const [areas, setAreas] = useState(areasToString(instructor.expertise_areas));
  const [bioLong, setBioLong] = useState(instructor.bio_long ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    const payload: InstructorUpdate = {};
    if (title.trim()) payload.title = title.trim();
    if (years.trim()) payload.years_experience = parseInt(years, 10);
    if (areas.trim()) payload.expertise_areas = stringToAreasJson(areas);
    if (bioLong.trim()) payload.bio_long = bioLong.trim();
    try {
      const updated = await profileApi.updateInstructorProfile(payload);
      onSaved(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pef-form" onSubmit={handleSubmit}>
      <h3 className="pef-title">Instructor Details</h3>

      <label className="pef-label">
        Title / Position
        <input
          className="pef-input"
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSuccess(false); setError(null); }}
          maxLength={120}
          placeholder="e.g. Associate Professor"
        />
      </label>

      <label className="pef-label">
        Years of Experience
        <input
          className="pef-input"
          type="number"
          value={years}
          onChange={(e) => { setYears(e.target.value); setSuccess(false); setError(null); }}
          min={0}
          max={80}
          placeholder="e.g. 10"
        />
      </label>

      <label className="pef-label">
        Expertise Areas
        <input
          className="pef-input"
          type="text"
          value={areas}
          onChange={(e) => { setAreas(e.target.value); setSuccess(false); setError(null); }}
          placeholder="e.g. Operating Systems, Networking, Algorithms"
        />
        <span className="pef-count">Comma-separated</span>
      </label>

      <label className="pef-label">
        Extended Bio
        <textarea
          className="pef-textarea"
          value={bioLong}
          onChange={(e) => { setBioLong(e.target.value); setSuccess(false); setError(null); }}
          maxLength={2000}
          rows={5}
          placeholder="Write a detailed bio for your profile page…"
        />
        <span className="pef-count">{bioLong.length}/2000</span>
      </label>

      {error && <p className="pef-error">{error}</p>}
      {success && <p className="pef-success">Instructor profile saved!</p>}

      <button className="pef-btn" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save Instructor Details"}
      </button>
    </form>
  );
}
