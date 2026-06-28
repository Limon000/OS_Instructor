import { useState } from "react";
import { profileApi } from "../../api/profile";

export default function PasswordChangeForm() {
  const [old_password, setOld] = useState("");
  const [new_password, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (new_password !== confirm) {
      setError("New passwords do not match");
      return;
    }
    if (new_password.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await profileApi.changePassword(old_password, new_password);
      setSuccess(true);
      setOld("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pcf-form" onSubmit={handleSubmit}>
      <h3 className="pcf-title">Change Password</h3>

      <label className="pcf-label">
        Current Password
        <input
          className="pcf-input"
          type="password"
          value={old_password}
          onChange={(e) => { setOld(e.target.value); setError(null); setSuccess(false); }}
          required
          autoComplete="current-password"
        />
      </label>

      <label className="pcf-label">
        New Password
        <input
          className="pcf-input"
          type="password"
          value={new_password}
          onChange={(e) => { setNew(e.target.value); setError(null); setSuccess(false); }}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>

      <label className="pcf-label">
        Confirm New Password
        <input
          className="pcf-input"
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null); setSuccess(false); }}
          required
          autoComplete="new-password"
        />
      </label>

      {error && <p className="pcf-error">{error}</p>}
      {success && <p className="pcf-success">Password changed successfully!</p>}

      <button className="pcf-btn" type="submit" disabled={saving}>
        {saving ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}
