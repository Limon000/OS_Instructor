import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./auth.css";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await register(email, fullName, password);
      navigate("/select", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">💻</span>
          <span className="auth-logo-text">OS Instructor</span>
        </div>
        <h1 className="auth-title">Create your account</h1>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Full Name
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Jane Smith"
              required
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </label>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="auth-footer">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
