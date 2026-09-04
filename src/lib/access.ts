// ---------------------------------------------------------------------------
// Role-based call visibility.
//
// Engineers see only the calls allotted to them. The mapping is:
//   logged-in mail id  →  their "User Name" in the User Master
//   → compared against the call's "Call Allocated To" value.
//
// A Regional Manager (RM) — anyone another user reports to via the RM / RGM
// columns — sees the calls of every engineer in their reporting sub-tree
// (transitively, so an RGM sees their RMs and those RMs' engineers too).
// Administrators / super admins see all calls.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { listUsers, dataConfigured } from './sheets';
import { useAuth } from './auth';
import { roleSeesAllCalls } from './rbac';

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Read the first non-empty value among candidate header names (User Master
// columns vary slightly across exports).
function pick(row: Record<string, unknown>, candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
const H_NAME = ['User Name', 'UserName', 'Name', 'Engineer Name'];
const H_EMAIL = ['Email ID', 'Email-ID', 'Email', 'Email Id'];
const H_GMAIL = ['GMAIL ID', 'Gmail ID', 'Gmail', 'GMail ID'];
const H_RM = ['RM', 'Reporting Manager', 'Reporting Mgr', 'Reporting Manager Name'];
const H_RGM = ['RGM', 'Regional Manager', 'Regional General Manager', 'RGM Name'];

export interface AccessScope {
  ready: boolean;
  all: boolean; // can see every call (admin / super admin)
  names: Set<string>; // allowed "Call Allocated To" values (normalised)
  isManager: boolean; // has at least one reporting engineer
  reports: string[]; // display names of engineers in the sub-tree
  selfName: string; // this user's canonical User Master name
}

const EMPTY: AccessScope = { ready: false, all: false, names: new Set(), isManager: false, reports: [], selfName: '' };

// The User Master is loaded once per session and shared across screens.
let umPromise: Promise<Record<string, unknown>[]> | null = null;
function loadUserMaster(): Promise<Record<string, unknown>[]> {
  if (!umPromise) umPromise = listUsers('', 2000).catch(() => [] as Record<string, unknown>[]);
  return umPromise;
}

export function useAccessScope(): AccessScope {
  const { user, can, viewAs, managerViewMode } = useAuth();
  const [scope, setScope] = useState<AccessScope>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    // While an admin is previewing "as" an engineer, scope to that identity.
    const identity = viewAs ?? user;
    if (!identity) { setScope({ ...EMPTY, ready: true }); return; }

    // Administrators and super admins see every call — unless they are actively
    // previewing as someone else, in which case we scope to that person.
    if (!viewAs && can('manage-users')) {
      setScope({ ready: true, all: true, names: new Set(), isManager: true, reports: [], selfName: identity.fullName });
      return;
    }

    // Office / coordination roles (Hotline, NSM, Commercial, Spare Coordinator,
    // Stores, Tally) are not tied to call allocations — they see every call.
    // A per-user "View all data" grant (e.g. a Permissions + Data clone) does
    // the same. Applies in "view as" preview too (identity is the previewed user).
    if (roleSeesAllCalls(identity.rbacRole) || can('data.view_all')) {
      setScope({ ready: true, all: true, names: new Set(), isManager: true, reports: [], selfName: identity.fullName });
      return;
    }

    const selfName0 = norm(identity.fullName);
    const emailNorm = norm(identity.email);
    const usernameNorm = norm(identity.username);

    // Offline / no data source: fall back to the user's own name only.
    if (!dataConfigured()) {
      setScope({ ready: true, all: false, names: new Set([selfName0].filter(Boolean)), isManager: false, reports: [], selfName: identity.fullName });
      return;
    }

    void loadUserMaster().then((rows) => {
      if (cancelled) return;

      // 1) Map the logged-in mail id → this user's canonical User Master name.
      const myRow = rows.find((r) => {
        const e = norm(pick(r, H_EMAIL)); const g = norm(pick(r, H_GMAIL));
        return (e && (e === emailNorm || e === usernameNorm)) || (g && (g === emailNorm || g === usernameNorm));
      });
      const selfDisplay = myRow ? pick(myRow, H_NAME) : identity.fullName;
      const selfName = norm(selfDisplay) || selfName0;

      // 2) Build manager → reports adjacency from the RM / RGM columns.
      const children = new Map<string, { name: string; norm: string }[]>();
      rows.forEach((r) => {
        const name = pick(r, H_NAME);
        const nn = norm(name);
        if (!nn) return;
        [norm(pick(r, H_RM)), norm(pick(r, H_RGM))].forEach((mgr) => {
          if (!mgr || mgr === nn) return;
          if (!children.has(mgr)) children.set(mgr, []);
          children.get(mgr)!.push({ name, norm: nn });
        });
      });

      // 3) Breadth-first walk of the sub-tree rooted at this user.
      const allowed = new Set<string>();
      const reports: string[] = [];
      const seen = new Set<string>([selfName]);
      const queue = [selfName];
      while (queue.length) {
        const cur = queue.shift()!;
        (children.get(cur) ?? []).forEach((c) => {
          if (seen.has(c.norm)) return;
          seen.add(c.norm);
          allowed.add(c.norm);
          reports.push(c.name);
          queue.push(c.norm);
        });
      }
      const isManager = allowed.size > 0;
      // A manager viewing "My calls" is scoped to just themselves; "Team"
      // (default) keeps the whole reporting sub-tree.
      const names = (isManager && managerViewMode === 'mine')
        ? new Set([selfName].filter(Boolean))
        : (selfName ? new Set([...allowed, selfName]) : allowed);

      setScope({ ready: true, all: false, names, isManager, reports, selfName: selfDisplay || identity.fullName });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, viewAs?.id, viewAs?.email, managerViewMode]);

  return scope;
}

// ---------------------------------------------------------------------------
// WHOSE NAME MAY I PUT ON THIS?
//
// A Reporting Manager raises call requests, spare requests and visit reports on
// behalf of their engineers, so every one of those screens needs the same list:
// the people reporting to them, and themselves. It was written out inline on the
// report screen and not at all on the other two — the spare request offered the
// WHOLE directory (2,000 names, anyone in the company), and a call request could
// only ever be raised in your own name.
//
// One list, one rule, from the scope that already knows it:
//   • an administrator or an office desk — everyone in the User Master;
//   • a manager — their reporting sub-tree, and themselves;
//   • an engineer — themselves.
//
// `current` is kept whatever the rule says: a value already on the record is
// never silently dropped by opening the screen that shows it.
// ---------------------------------------------------------------------------
export function useTeamEngineers(current?: string): { names: string[]; canPick: boolean; ready: boolean } {
  const scope = useAccessScope();
  const [directory, setDirectory] = useState<string[]>([]);

  useEffect(() => {
    if (!scope.all || !dataConfigured()) return;
    let cancelled = false;
    void loadUserMaster().then((rows) => {
      if (cancelled) return;
      // ACTIVE users only. A list that offers somebody who has left is a list
      // that lets you allot a call, or open a hand-stock balance, against a
      // person who cannot act on it. The row currently ON a record is added
      // back by the caller through `current`, so an existing value still reads
      // correctly after that person leaves.
      setDirectory([...new Set(rows
        .filter((r) => !/^(false|no|0|inactive)$/i.test(String(r['Validity'] ?? '').trim()))
        .map((r) => pick(r, H_NAME)).filter(Boolean))]);
    });
    return () => { cancelled = true; };
  }, [scope.all]);

  const base = scope.all
    ? directory
    : scope.isManager ? [scope.selfName, ...scope.reports] : [scope.selfName];

  const names = [...new Set([...base, current ?? ''].map((n) => String(n ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  return { names, canPick: names.length > 1, ready: scope.ready && (!scope.all || directory.length > 0) };
}

const H_REGION = ['REGION', 'Region', 'Zone'];

// ---------------------------------------------------------------------------
// WHICH REGION IS THIS ROW IN?
//
// A call does not carry a region — the User Master does, against the engineer.
// So a register that groups by region reads it off the allottee. A name the
// directory does not know, or a row nobody is allotted to, has no region: it
// gathers under the blank heading rather than being guessed at.
// ---------------------------------------------------------------------------
export function useRegionByEngineer(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!dataConfigured()) return;
    let cancelled = false;
    void loadUserMaster().then((rows) => {
      if (cancelled) return;
      const m = new Map<string, string>();
      rows.forEach((r) => {
        const n = norm(pick(r, H_NAME));
        const region = pick(r, H_REGION);
        if (n && region) m.set(n, region);
      });
      setMap(m);
    });
    return () => { cancelled = true; };
  }, []);
  return map;
}

// Is a call with this allottee visible under the given scope?
export function allowsAllottee(scope: AccessScope, allottee: unknown): boolean {
  if (scope.all) return true;
  return scope.names.has(norm(allottee));
}

// ---------------------------------------------------------------------------
// "View as" preview fidelity.
//
// Row-level security scopes what the DATABASE returns, and it answers for the
// signed-in session. "View as" is a client-side identity: the query still runs
// as the real user, so an administrator previewing a manager gets their OWN
// rows back — which is the one question the preview exists to answer, answered
// wrongly.
//
// So while a preview is active, narrow the fetched rows to the previewed
// person's scope. In a real session this is a no-op: RLS has already done it,
// and `all` short-circuits for administrators and the office desks.
//
// `nameFields` are the columns naming an engineer (a transfer has two: from
// and to). `emailFields` catch a row that carries the address but not the
// canonical User Master name.
export function inPreviewScope(
  scope: AccessScope,
  row: unknown,
  nameFields: string[],
  emailFields: string[] = [],
  email = '',
): boolean {
  if (scope.all) return true;
  const r = (row ?? {}) as Record<string, unknown>;
  if (nameFields.some((f) => scope.names.has(norm(r[f])))) return true;
  const mine = norm(email);
  return !!mine && emailFields.some((f) => norm(r[f]) === mine);
}

// Apply it only while previewing; otherwise hand the rows straight back.
export function previewScoped<T>(
  rows: T[],
  previewing: boolean,
  scope: AccessScope,
  nameFields: string[],
  emailFields: string[] = [],
  email = '',
): T[] {
  if (!previewing || scope.all) return rows;
  return rows.filter((r) => inPreviewScope(scope, r, nameFields, emailFields, email));
}

// Short label describing the active scope (for a toolbar chip).
export function scopeLabel(scope: AccessScope): string {
  if (!scope.ready) return '⏳ Applying access…';
  if (scope.all) return '🌐 All calls';
  if (scope.isManager) return `👥 Team view · ${scope.reports.length} engineer${scope.reports.length === 1 ? '' : 's'}`;
  return '🙋 My calls';
}
