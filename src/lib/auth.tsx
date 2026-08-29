import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, genId, type BaseRecord } from './db';
import { authLogin, authSetPassword, listUsers, sheetsConfigured, type SheetUser } from './sheets';
import { sbSignIn, sbSignOut, sbCurrentProfile, sbListProfiles, sbOnAuthChange, getRolePerms, supabaseConfigured, hasPendingRecovery, sbConsumeRecovery, sbUpdatePassword, type Profile } from './supabase';
import { DEFAULT_PERMS, permsForRole, toCanonical, legacyToRbac } from './rbac';
import { setAuditUser, logAudit } from './audit';

const auditIdentity = (u: User | null) => u ? { actor: u.fullName || u.email, role: (u.rbacRole || legacyToRbac(u.role)), email: u.email } : null;

// Map a profiles.role (admin | rm | rgm | engineer | viewer) to an app Role.
function roleFromProfile(r: string): Role {
  const v = (r || '').toLowerCase();
  if (v === 'admin') return 'admin';
  if (v === 'rm' || v === 'rgm' || v === 'manager') return 'manager';
  if (v === 'viewer') return 'viewer';
  return 'engineer';
}
function profileToUser(p: Profile): User {
  return {
    id: p.id,
    username: p.email,
    fullName: p.full_name || p.email,
    email: p.email,
    role: roleFromProfile(p.role),
    passwordHash: '',
    active: p.active !== false,
    activated: true,
    authSource: 'supabase',
    designation: p.designation,
    reportingManager: p.reporting_manager_email,
    regionalManager: p.regional_manager_email,
    rbacRole: (p.role || 'engineer').toLowerCase(),
    extraPermissions: Array.isArray(p.extra_permissions) ? p.extra_permissions : [],
  } as User;
}

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
  authSource?: 'local' | 'sheet' | 'supabase'; // where the user authenticates
  region?: string;
  activated?: boolean; // has the user set a password / logged in at least once
  designation?: string; // from the User Master (e.g. Engineer, Regional Manager)
  reportingManager?: string; // RM — the name this user reports to
  regionalManager?: string; // RGM — the regional (general) manager
  rbacRole?: string; // raw role key for RBAC (admin|rgm|rm|engineer|hotline|spare_coordinator|tally_coordinator|...)
  extraPermissions?: string[]; // per-user actions granted beyond the role
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Service Manager',
  engineer: 'Field Engineer',
  viewer: 'Viewer',
};

const USERS = 'users';
const SESSION_KEY = 'rithi.session';
const VIEWAS_KEY = 'rithi.viewAs'; // admin "View as engineer" preview identity

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
  booting: boolean; // true while restoring a persisted session (avoid login flash)
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
  can: (action: string) => boolean; // RBAC: legacy keys + canonical action keys
  rolePerms: Record<string, string[]>; // role → allowed actions (admin-editable)
  reloadRoles: () => Promise<void>;
  reloadUsers: () => Promise<void>; // refresh the profiles list after admin edits
  // Password reset: true while the user arrived on a recovery link and still
  // has to choose a new password. finishRecovery() sets it and clears the flag.
  recovering: boolean;
  finishRecovery: (password: string) => Promise<{ ok: boolean; error?: string }>;
  cancelRecovery: () => void;
  // The actual logged-in user (never the impersonated one) and whether they are
  // a real administrator — used to gate the "View as" control itself.
  realUser: User | null;
  isAdmin: boolean;
  // Admin preview: act as another (engineer) identity so every page shows what
  // that user would see. null when not previewing.
  viewAs: User | null;
  setViewAs: (u: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [viewAsRaw, setViewAsRaw] = useState<User | null>(() => {
    try { const r = localStorage.getItem(VIEWAS_KEY); return r ? (JSON.parse(r) as User) : null; } catch { return null; }
  });

  // Supabase-backed identity (when a database is connected). supaUser is the
  // signed-in profile; supaUsers is the visible profiles list (all for admins).
  const supaMode = supabaseConfigured();
  const [supaUser, setSupaUser] = useState<User | null>(null);
  const [supaUsers, setSupaUsers] = useState<User[]>([]);
  const [supaBooting, setSupaBooting] = useState<boolean>(supaMode);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>(DEFAULT_PERMS);
  // A recovery link was captured at boot (see takeRecoveryFromUrl): exchange it
  // for a session so the user can set a new password.
  const [recovering, setRecovering] = useState(false);
  const reloadRoles = async () => { if (supaMode) { const p = await getRolePerms(); if (Object.keys(p).length) setRolePerms((cur) => ({ ...cur, ...p })); } };
  const reloadUsers = async () => { if (supaMode) { const list = await sbListProfiles(); setSupaUsers(list.map(profileToUser)); } };

  useEffect(() => {
    if (!supaMode || !hasPendingRecovery()) return;
    void sbConsumeRecovery().then((r) => setRecovering(r.ok));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supaMode]);

  const finishRecovery: AuthContextValue['finishRecovery'] = async (password) => {
    const res = await sbUpdatePassword(password);
    if (res.ok) setRecovering(false);
    return res;
  };
  const cancelRecovery = () => { setRecovering(false); void sbSignOut(); };

  useEffect(() => seedUsers(), []);
  useEffect(() => db.subscribe(USERS, refresh), []);

  // Hydrate from the persisted Supabase session on load, and whenever auth changes.
  useEffect(() => {
    if (!supaMode) { setSupaBooting(false); return; }
    let alive = true;
    const hydrate = async () => {
      const p = await sbCurrentProfile();
      if (!alive) return;
      const u = p ? profileToUser(p) : null;
      setSupaUser(u);
      setAuditUser(auditIdentity(u));
      if (p) { const list = await sbListProfiles(); if (alive) setSupaUsers(list.map(profileToUser)); }
      else setSupaUsers([]);
      if (alive) setSupaBooting(false);
    };
    void hydrate();
    void reloadRoles();
    const off = sbOnAuthChange(() => { void hydrate(); });
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supaMode]);

  const localUsers = db.list(USERS) as User[];
  const users = supaMode ? supaUsers : localUsers;
  const user = supaMode ? supaUser : (localUsers.find((u) => u.id === userId && u.active) ?? null);
  void tick;

  // Real admin? (super admin or admin role). Impersonation is only offered to,
  // and only honoured for, real admins.
  const realUser = user;
  const isAdmin = !!realUser && (isSuper(realUser.email, realUser.username) || realUser.role === 'admin');
  const viewAs = isAdmin ? viewAsRaw : null;
  // Identity the app should behave as (permissions + data scope).
  const effectiveUser = viewAs ?? user;

  const setViewAs = (u: User | null) => {
    if (u && !isAdmin) return; // only real admins may preview as someone else
    setViewAsRaw(u);
    try { u ? localStorage.setItem(VIEWAS_KEY, JSON.stringify(u)) : localStorage.removeItem(VIEWAS_KEY); } catch { /* ignore */ }
  };

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
    // 0) Supabase (email + password) — the primary path once a DB is connected.
    if (supaMode) {
      const t0 = performance.now();
      const res = await sbSignIn(idNorm, password);
      if (!res.ok) {
        logAudit({ action: 'login_failed', email: idNorm, status: 'error', error: res.error, duration_ms: Math.round(performance.now() - t0) });
        const m = (res.error || '').toLowerCase();
        if (m.includes('invalid login')) return { ok: false, error: 'Incorrect email or password.' };
        if (m.includes('not confirmed')) return { ok: false, error: 'Email not confirmed — turn off "Confirm email" in Supabase, or confirm the address.' };
        return { ok: false, error: res.error || 'Login failed.' };
      }
      const p = await sbCurrentProfile();
      const u = p ? profileToUser(p) : null;
      if (u) { setSupaUser(u); setAuditUser(auditIdentity(u)); const list = await sbListProfiles(); setSupaUsers(list.map(profileToUser)); }
      logAudit({ action: 'login', status: 'ok', duration_ms: Math.round(performance.now() - t0) });
      return { ok: true };
    }
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
    setViewAs(null);
    setUserId(null);
    if (supaMode) { logAudit({ action: 'logout', status: 'ok' }); setAuditUser(null); setSupaUser(null); setSupaUsers([]); void sbSignOut(); }
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
    const u = effectiveUser; // reflects the impersonated engineer while previewing
    if (!u) return false;
    if (action === 'view') return true; // any signed-in user can view
    if (isSuper(u.email, u.username)) return true; // super admins — all rights
    const roleKey = u.rbacRole || legacyToRbac(u.role);
    if (roleKey === 'admin') return true;
    const canonical = toCanonical(action);
    return permsForRole(roleKey, rolePerms).includes(canonical) || (u.extraPermissions?.includes(canonical) ?? false);
  };

  return (
    <AuthContext.Provider
      value={{ user, users, booting: supaBooting, login, setPassword, importSheetUsers, logout, createUser, updateUser, removeUser, can, rolePerms, reloadRoles, reloadUsers, recovering, finishRecovery, cancelRecovery, realUser, isAdmin, viewAs, setViewAs }}
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
