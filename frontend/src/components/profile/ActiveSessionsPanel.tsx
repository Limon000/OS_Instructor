import { useState } from "react";
import type { SessionOut } from "../../api/profile";
import { profileApi } from "../../api/profile";

interface Props {
  sessions: SessionOut[];
  onRevoked: (session_id: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function ActiveSessionsPanel({ sessions, onRevoked }: Props) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(session_id: string) {
    setRevoking(session_id);
    setError(null);
    try {
      await profileApi.revokeSession(session_id);
      onRevoked(session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="asp-root">
      <h3 className="asp-title">Active Sessions</h3>
      <p className="asp-desc">
        These are all currently active login sessions for your account.
      </p>

      {error && <p className="asp-error">{error}</p>}

      {sessions.length === 0 ? (
        <p className="asp-empty">No active sessions found.</p>
      ) : (
        <ul className="asp-list">
          {sessions.map((s) => (
            <li key={s.session_id} className="asp-item">
              <div className="asp-item-info">
                <div className="asp-item-dates">
                  <span>Started: {formatDate(s.created_at)}</span>
                  <span>Expires: {formatDate(s.expires_at)}</span>
                </div>
                {s.is_current && (
                  <span className="asp-current-badge">Current session</span>
                )}
              </div>
              {!s.is_current && (
                <button
                  className="asp-revoke-btn"
                  onClick={() => handleRevoke(s.session_id)}
                  disabled={revoking === s.session_id}
                  aria-label="Revoke this session"
                >
                  {revoking === s.session_id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
