import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, genId, type BaseRecord } from './db';

// ---------------------------------------------------------------------------
// Authentication & user access.
// POC-grade: credentials live in the local "users" collection with a salted
// hash (NOT production crypto — clearly a demo). Sessions persist the active
// user id in localStorage. Roles drive access control across modules.
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'manager' | 'engineer' | 'viewer';

export interface User extends BaseRecord {
  username: string;
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
  active: boolean;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Service Manager',
  engineer: 'Field Engineer',
  viewer: 'Viewer',
};

const USERS = 'users';
const SESSION_KEY = 'rithi.session';

// Deterministic, lightweight hash — sufficient to demonstrate password-gating.
function hash(pw: string): string {
  let h = 2166136261;
  const salted = 'rithi$' + pw;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function seedUsers() {
  if (db.list(USERS).length > 0) return;
  const now = new Date().toISOString();
  const make = (u: Partial<User>): User =>
    ({ id: genId(), createdAt: now, updatedAt: now, active: true, ...u }) as User;
  db.seedIfEmpty(USERS, [
    make({
      username: 'admin',
      fullName: 'Dr. Anita Rao',
      email: 'admin@rithi.health',
      role: 'admin',
      passwordHash: hash('admin123'),
    }),
    make({
      username: 'manager',
      fullName: 'Suresh Kumar',
      email: 'manager@rithi.health',
      role: 'manager',
      passwordHash: hash('manager123'),
    }),
    make({
      username: 'engineer',
      fullName: 'Ravi Menon',
      email: 'ravi@rithi.health',
      role: 'engineer',
      passwordHash: hash('engineer123'),
    }),
  ]);
}

interface AuthContextValue {
  user: User | null;
  users: User[];
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  createUser: (input: {
    username: string;
    fullName: string;
    email: string;
    role: Role;
    password: string;
  }) => { ok: boolean; error?: string };
  updateUser: (id: string, patch: Partial<User> & { password?: string }) => void;
  removeUser: (id: string) => void;
  can: (action: 'manage-users' | 'edit' | 'delete' | 'view') => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));

  useEffect(() => seedUsers(), []);
  useEffect(() => db.subscribe(USERS, refresh), []);

  const users = db.list(USERS) as User[];
  const user = users.find((u) => u.id === userId && u.active) ?? null;
  void tick;

  const login: AuthContextValue['login'] = (username, password) => {
    const match = (db.list(USERS) as User[]).find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!match) return { ok: false, error: 'User not found' };
    if (!match.active) return { ok: false, error: 'Account is disabled' };
    if (match.passwordHash !== hash(password)) return { ok: false, error: 'Incorrect password' };
    localStorage.setItem(SESSION_KEY, match.id);
    setUserId(match.id);
    return { ok: true };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUserId(null);
  };

  const createUser: AuthContextValue['createUser'] = (input) => {
    const exists = (db.list(USERS) as User[]).some(
      (u) => u.username.toLowerCase() === input.username.trim().toLowerCase(),
    );
    if (exists) return { ok: false, error: 'Username already taken' };
    if (input.password.length < 5) return { ok: false, error: 'Password too short (min 5)' };
    db.insert(USERS, {
      username: input.username.trim(),
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      role: input.role,
      passwordHash: hash(input.password),
      active: true,
    });
    return { ok: true };
  };

  const updateUser: AuthContextValue['updateUser'] = (id, patch) => {
    const { password, ...rest } = patch;
    const next: Partial<User> = { ...rest };
    if (password) next.passwordHash = hash(password);
    db.update(USERS, id, next);
  };

  const removeUser: AuthContextValue['removeUser'] = (id) => db.remove(USERS, id);

  const can: AuthContextValue['can'] = (action) => {
    if (!user) return false;
    const r = user.role;
    switch (action) {
      case 'manage-users':
        return r === 'admin';
      case 'delete':
        return r === 'admin' || r === 'manager';
      case 'edit':
        return r !== 'viewer';
      case 'view':
        return true;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, users, login, logout, createUser, updateUser, removeUser, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
