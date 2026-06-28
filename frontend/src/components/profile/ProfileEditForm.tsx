import { useState } from "react";
import type { ProfileData, ProfileUpdate } from "../../api/profile";
import { profileApi } from "../../api/profile";

interface Props {
  profile: ProfileData;
  onSaved: (updated: ProfileData) => void;
}

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "tr", label: "Turkish" },
];

export default function ProfileEditForm({ profile, onSaved }: Props) {
  const [fields, setFields] = useState<ProfileUpdate>({
    full_name: profile.full_name,
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
    timezone: profile.timezone ?? "UTC",
    preferred_lang: profile.preferred_lang ?? "en",
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof ProfileUpdate, val: string) {
    setFields((f) => ({ ...f, [key]: val }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: ProfileUpdate = {};
      if (fields.full_name?.trim()) payload.full_name = fields.full_name.trim();
      if (fields.bio !== undefined) payload.bio = fields.bio;
      if (fields.avatar_url !== undefined) payload.avatar_url = fields.avatar_url;
      if (fields.timezone) payload.timezone = fields.timezone;
      if (fields.preferred_lang) payload.preferred_lang = fields.preferred_lang;
      const updated = await profileApi.updateProfile(payload);
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
      <h3 className="pef-title">Edit Profile</h3>

      <label className="pef-label">
        Full Name
        <input
          className="pef-input"
          type="text"
          value={fields.full_name ?? ""}
          onChange={(e) => set("full_name", e.target.value)}
          maxLength={120}
          required
        />
      </label>

      <label className="pef-label">
        Bio
        <textarea
          className="pef-textarea"
          value={fields.bio ?? ""}
          onChange={(e) => set("bio", e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell us a little about yourself…"
        />
        <span className="pef-count">{(fields.bio ?? "").length}/500</span>
      </label>

      <label className="pef-label">
        Avatar URL
        <input
          className="pef-input"
          type="url"
          value={fields.avatar_url ?? ""}
          onChange={(e) => set("avatar_url", e.target.value)}
          placeholder="https://example.com/avatar.png"
        />
      </label>

      <label className="pef-label">
        Timezone
        <select
          className="pef-select"
          value={fields.timezone ?? "UTC"}
          onChange={(e) => set("timezone", e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </label>

      <label className="pef-label">
        Preferred Language
        <select
          className="pef-select"
          value={fields.preferred_lang ?? "en"}
          onChange={(e) => set("preferred_lang", e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </label>

      {error && <p className="pef-error">{error}</p>}
      {success && <p className="pef-success">Profile saved!</p>}

      <button className="pef-btn" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
