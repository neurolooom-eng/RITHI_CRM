import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, genId, type BaseRecord } from './db';
import { authLogin, authSetPassword, listUsers, sheetsConfigured, type SheetUser } from './sheets';

// Super admins (dev access — all rights), matched by any of their login ids.
const SUPER_ADMINS = new Set([
  'service.almsind@gmail.com',
  'devika.m@airliquide.com',
  'devikamunusamy@gmail.com',
  'mmdev74@gmail.com',
]);
const isSuper = (...ids: (string | undefined)[]) =>
  ids.some((id) => id && SUPER_ADMINS.has(String(id).trim().toLowerCase()));

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
  authSource?: 'local' | 'sheet'; // 'sheet' users authenticate via the User Master
  region?: string;
  activated?: boolean; // has the user set a password / logged in at least once
  designation?: string; // from the User Master (e.g. Engineer, Regional Manager)
  reportingManager?: string; // RM — the name this user reports to
  regionalManager?: string; // RGM — the regional (general) manager
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
  if (db.list(USERS).length === 0) {
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
  // Ensure operational test logins exist even on browsers that already seeded
  // the demo users. Passwords are stored only as hashes (never plaintext here);
  // these will be superseded by the User Master login and can be reset anytime.
  ensureUser({
    username: 'service.almsind@gmail.com',
    fullName: 'ALMS Service',
    email: 'service.almsind@gmail.com',
    role: 'admin',
    passwordHash: '8c543c4f', // hash('Coxpass105!') — temporary test password, to be reset
  });
}

// Insert a user if one with the same username doesn't already exist (idempotent).
function ensureUser(u: {
  username: string;
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
}) {
  const exists = (db.list(USERS) as User[]).some(
    (x) => x.username.toLowerCase() === u.username.toLowerCase(),
  );
  if (exists) return;
  db.insert(USERS, { ...u, active: true });
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  needsPassword?: boolean; // first login: must set a password
}

interface AuthContextValue {
  user: User | null;
  users: User[];
  login: (username: string, password: string) => Promise<LoginResult>;
  setPassword: (id: string, password: string) => Promise<LoginResult>;
  importSheetUsers: () => Promise<{ added: number; total: number }>;
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

  const setSession = (id: string) => {
    localStorage.setItem(SESSION_KEY, id);
    setUserId(id);
  };

  // Create/refresh a local record for a User-Master-authenticated user so the
  // rest of the app (roles, context, engineer lists) works. Role: engineer.
  const upsertSheetUser = (su: SheetUser, id: string): string => {
    const username = String(su.email || su.gmail || id).toLowerCase();
    const existing = (db.list(USERS) as User[]).find((u) => u.username.toLowerCase() === username);
    const patch: Partial<User> = {
      username,
      fullName: su.name || id,
      email: su.email || id,
      role: isSuper(su.email, su.gmail, id) ? 'admin' : 'engineer',
      active: true,
      activated: true, // they've just authenticated
      authSource: 'sheet',
      region: su.region,
      designation: su.designation,
      reportingManager: su.rm,
      regionalManager: su.rgm,
    };
    if (existing) {
      db.update(USERS, existing.id, patch);
      return existing.id;
    }
    return db.insert(USERS, { ...patch, passwordHash: '' }).id;
  };

  // Import every User Master user into the local users list (role engineer, or
  // admin for super admins). Activation is preserved; new users start inactive.
  const importSheetUsers = async (): Promise<{ added: number; total: number }> => {
    const rows = await listUsers('', 1000);
    let added = 0;
    rows.forEach((u) => {
      const email = String(u['Email ID'] ?? '').trim();
      const gmail = String(u['GMAIL ID'] ?? '').trim();
      const username = (email || gmail || String(u['User Name'] ?? '')).toLowerCase();
      if (!username) return;
      const existing = (db.list(USERS) as User[]).find((x) => x.username.toLowerCase() === username);
      const patch: Partial<User> = {
        username,
        fullName: String(u['User Name'] ?? username),
        email: email || gmail,
        role: isSuper(email, gmail) ? 'admin' : 'engineer',
        active: String(u['Validity'] ?? '').toUpperCase() === 'TRUE',
        authSource: 'sheet',
        region: String(u['REGION'] ?? ''),
        designation: String(u['Designation'] ?? ''),
        reportingManager: String(u['RM'] ?? ''),
        regionalManager: String(u['RGM'] ?? ''),
      };
      if (existing) db.update(USERS, existing.id, patch);
      else { db.insert(USERS, { ...patch, passwordHash: '', activated: false }); added++; }
    });
    return { added, total: rows.length };
  };

  const authError = (code?: string): string => {
    switch (code) {
      case 'not_found': return 'ID not found in the User Master.';
      case 'inactive': return 'Your account is not active (Validity is not TRUE).';
      case 'bad_password': return 'Incorrect password.';
      case 'weak': return 'Password too short (minimum 5 characters).';
      default: return code || 'Login failed.';
    }
  };

  const login: AuthContextValue['login'] = async (id, password) => {
    const idNorm = id.trim();
    // 1) Local demo/offline accounts (username or email), password-checked here.
    const local = (db.list(USERS) as User[]).find(
      (u) => u.authSource !== 'sheet' &&
        (u.username.toLowerCase() === idNorm.toLowerCase() || String(u.email).toLowerCase() === idNorm.toLowerCase()),
    );
    if (local) {
      if (!local.active) return { ok: false, error: 'Account is disabled' };
      if (local.passwordHash !== hash(password)) return { ok: false, error: 'Incorrect password' };
      if (!local.activated) db.update(USERS, local.id, { activated: true });
      setSession(local.id);
      return { ok: true };
    }
    // 2) User Master via CallReg.
    if (sheetsConfigured()) {
      try {
        const res = await authLogin(idNorm, password);
        if (res.ok && res.needsPassword) return { ok: false, needsPassword: true };
        if (res.ok && res.user) { setSession(upsertSheetUser(res.user, idNorm)); return { ok: true }; }
        return { ok: false, error: authError(res.error) };
      } catch {
        return { ok: false, error: 'Could not reach the login service. Check the connection in Settings.' };
      }
    }
    return { ok: false, error: 'User not found' };
  };

  const setPassword: AuthContextValue['setPassword'] = async (id, password) => {
    if (!sheetsConfigured()) return { ok: false, error: 'No sheet connected.' };
    try {
      const res = await authSetPassword(id.trim(), password);
      if (res.ok && res.user) { setSession(upsertSheetUser(res.user, id.trim())); return { ok: true }; }
      return { ok: false, error: authError(res.error) };
    } catch {
      return { ok: false, error: 'Could not reach the login service.' };
    }
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
    if (isSuper(user.email, user.username)) return true; // dev access — all rights
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
      value={{ user, users, login, setPassword, importSheetUsers, logout, createUser, updateUser, removeUser, can }}
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
