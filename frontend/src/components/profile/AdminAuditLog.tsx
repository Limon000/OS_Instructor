import type { AuditEntryOut } from "../../api/profile";

interface Props {
  entries: AuditEntryOut[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminAuditLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="aal-root">
        <h3 className="aal-title">Audit Log</h3>
        <p className="aal-empty">No audit events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="aal-root">
      <h3 className="aal-title">Recent Audit Events</h3>
      <div className="aal-table-wrap">
        <table className="aal-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.log_id}>
                <td className="aal-date">{formatDate(e.created_at)}</td>
                <td>{e.actor_name ?? e.actor_user_id ?? "system"}</td>
                <td>
                  <code className="aal-action">{e.action}</code>
                </td>
                <td className="aal-target">
                  {e.target_table ? (
                    <span>
                      <span className="aal-table-name">{e.target_table}</span>
                      {e.target_id && <span className="aal-muted"> #{e.target_id.slice(0, 8)}</span>}
                    </span>
                  ) : "—"}
                </td>
                <td className="aal-ip">{e.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
