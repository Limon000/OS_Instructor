import type { ProfileData } from "../../api/profile";

interface Props {
  profile: ProfileData;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const ROLE_COLORS: Record<string, string> = {
  student: "#2E86C1",
  instructor: "#16a34a",
  admin: "#7c3aed",
};

export default function ProfileHeader({ profile }: Props) {
  const avatarBg = ROLE_COLORS[profile.role] ?? "#888";

  return (
    <div className="ph-root">
      <div className="ph-avatar" style={{ background: avatarBg }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.full_name} className="ph-avatar-img" />
        ) : (
          <span className="ph-initials">{initials(profile.full_name)}</span>
        )}
      </div>

      <div className="ph-info">
        <h2 className="ph-name">{profile.full_name}</h2>
        <p className="ph-email">{profile.email}</p>
        <div className="ph-meta">
          <span className="ph-role-badge" style={{ background: avatarBg }}>
            {profile.role}
          </span>
          <span className="ph-since">Member since {formatDate(profile.created_at)}</span>
          {profile.last_login_at && (
            <span className="ph-since">Last login {formatDate(profile.last_login_at)}</span>
          )}
        </div>
        {profile.bio && <p className="ph-bio">{profile.bio}</p>}
      </div>
    </div>
  );
}
