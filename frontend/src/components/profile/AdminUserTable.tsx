import type { AdminUserOut } from "../../api/profile";

interface Props {
  users: AdminUserOut[];
}

const ROLE_COLOR: Record<string, string> = {
  student: "#2E86C1",
  instructor: "#16a34a",
  admin: "#7c3aed",
};

const STATUS_COLOR: Record<string, string> = {
  active: "#16a34a",
  suspended: "#dc2626",
  pending: "#b45309",
  deleted: "#888",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUserTable({ users }: Props) {
  if (users.length === 0) {
    return (
      <div className="aut-root">
        <h3 className="aut-title">Recent Users</h3>
        <p className="aut-empty">No users found.</p>
      </div>
    );
  }

  return (
    <div className="aut-root">
      <h3 className="aut-title">Recent Users ({users.length})</h3>
      <div className="aut-table-wrap">
        <table className="aut-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td className="aut-name">{u.full_name}</td>
                <td className="aut-email">{u.email}</td>
                <td>
                  <span
                    className="aut-badge"
                    style={{ background: `${ROLE_COLOR[u.role]}22`, color: ROLE_COLOR[u.role] }}
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  <span
                    className="aut-badge"
                    style={{ background: `${STATUS_COLOR[u.status]}22`, color: STATUS_COLOR[u.status] }}
                  >
                    {u.status}
                  </span>
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td>{formatDate(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
