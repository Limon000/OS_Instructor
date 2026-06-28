import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { AuthUser } from "../types";

const TOKEN_KEY = "os_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiFetchCurrentUser(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

async function apiLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Invalid email or password");
  }
  return res.json();
}

async function apiRegister(email: string, fullName: string, password: string, role: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, full_name: fullName, password, role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Registration failed");
  }
  return res.json();
}

async function apiLogout(token: string) {
  await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, fullName: string, password: string, role: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiFetchCurrentUser(token)
      .then(setUser)
      .catch(() => clearStoredToken())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiLogin(email, password);
    setStoredToken(data.token);
    setUser({ user_id: data.user_id, role: data.role });
  }

  async function register(email: string, fullName: string, password: string, role: string) {
    const data = await apiRegister(email, fullName, password, role);
    setStoredToken(data.token);
    setUser({ user_id: data.user_id, role: data.role });
  }

  function logout() {
    const token = getStoredToken();
    if (token) apiLogout(token).catch(() => {});
    clearStoredToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
