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
  const { user, can, viewAs } = useAuth();
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
    // Applies in "view as" preview too (identity is the previewed user).
    if (roleSeesAllCalls(identity.rbacRole)) {
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
      if (selfName) allowed.add(selfName); // always include one's own calls

      setScope({ ready: true, all: false, names: allowed, isManager, reports, selfName: selfDisplay || identity.fullName });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, viewAs?.id, viewAs?.email]);

  return scope;
}

// Is a call with this allottee visible under the given scope?
export function allowsAllottee(scope: AccessScope, allottee: unknown): boolean {
  if (scope.all) return true;
  return scope.names.has(norm(allottee));
}

// Short label describing the active scope (for a toolbar chip).
export function scopeLabel(scope: AccessScope): string {
  if (!scope.ready) return '⏳ Applying access…';
  if (scope.all) return '🌐 All calls';
  if (scope.isManager) return `👥 Team view · ${scope.reports.length} engineer${scope.reports.length === 1 ? '' : 's'}`;
  return '🙋 My calls';
}
