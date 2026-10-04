import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleLabel } from '../../lib/auth';
import { actionForPath, USER_ADMIN_KEYS } from '../../lib/rbac';
import { useTheme } from '../../theme/ThemeProvider';
import { fmtDateTime } from '../../lib/format';
import { ViewAsControl, ViewAsBanner } from './ViewAs';
import { MASTER_LISTS, masterListPath } from '../../modules/masterLists';
import { useModuleCounts, countLabel } from '../../lib/counts';
import { NotificationBell } from './NotificationBell';
import './layout.css';
import { RITHI_LOGO } from '../../lib/brand';
import { watchMachineRegister } from '../../lib/machinestore';
import { clearMasterCache } from '../../lib/masters';
import { supabaseConfigured, globalSearchKind } from '../../lib/supabase';
import { useAuditMode } from '../../lib/auditMode';
import { HIT_GROUPS, MIN_CHARS, PER_KIND, searchTerm, shownHits, type HitKind, type SearchHit } from '../../lib/globalSearch';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  // A NON-AUDITABLE screen (Spare Recycling, 0355): left out of the menu while
  // Audit Mode is on. The database refuses its rows then too; this is the
  // courtesy, that is the rule.
  hideInAudit?: boolean;
  alwaysOpen?: boolean; // visible to every role, not RBAC-gated (e.g. help pages)
  // THE PERMISSION, where the path is not it. Reports is one page with a tab
  // per report, so its entries are `/exports/consumption` and `/exports/kpi` —
  // and `mod:/exports/consumption` is a key nobody holds. One module, two ways
  // in; without this the whole heading would be invisible to everyone.
  perm?: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
  // FLASH THIS HEADING UNTIL SOMEBODY HAS BEEN THERE (the user, 2026-09-09:
  // "can u make a heading flash??"). Set on Knowledge Base, which people have
  // to know exists before they will look for it.
  //
  // IT STOPS, AND THAT IS THE WHOLE DESIGN. A heading that flashes for ever is
  // not a signal, it is wallpaper: people stop seeing it within a day and it
  // has then cost them attention for nothing. This one runs a handful of
  // flashes and rests, and the moment anybody OPENS a page in the group it is
  // finished for good on that device.
  flash?: boolean;
}

export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '📊' },
      // RIGHT BELOW DASHBOARD, where it was asked for (2026-09-08). It is a
      // dashboard in its own right rather than an export, which is why it sits
      // here and not under Reports.
      // RIGHT UNDER THE DASHBOARD. It answers "what is waiting on me?" where
      // the Dashboard answers "how is the company doing?" — the first question
      // somebody asks when they sign in, so it is the first thing under it.
      { to: '/workload', label: 'My Workload', icon: '⚡' },
      // PRODUCT FAILURE ANALYSIS AND SPARE INSIGHTS MOVED TO QUALITY &
      // ANALYTICS (the user, 2026-09-15). Both sat here because they are
      // dashboards; but what they analyse — why products fail, what is being
      // consumed to fix them — is the question that group exists to ask.
      // Overview keeps the two "look something up" screens.
      { to: '/lookup', label: 'Product & Party Search', icon: '🔎' },
      // BESIDE THE OTHER "LOOK SOMETHING UP" SCREEN (the user, 2026-09-14:
      // "Add this to overview"). Product & Party Search answers "which
      // machines"; this answers "what happened to THIS one". Not under
      // Reports, where it first went: a report is a file you take away.
      { to: '/machine-history', label: 'Machine History', icon: '🔬' },
      // PART SEARCH (the user, 2026-10-01): a third "look something up"
      // screen -- read only for everyone, Admin included, and no download.
      { to: '/part-search', label: 'Part Search', icon: '🧩' },
      // DAILY CALL REVIEW MOVED TO QUALITY & ANALYTICS and CALL REVIEW TO
      // SERVICE CALLS (the user, 2026-09-12). Both sat here because they were
      // built here, not because this is where they belong: the DCCR is the
      // quality record the Field Failure Register is raised from, and the Call
      // Review is somebody reading a call — which is what Service Calls is.
    ],
  },
  {
    // RIGHT BELOW OVERVIEW (the user, 2026-09-12: "Move the Whole Quality and
    // Analytics Below OverView"). It is the group the business is run from —
    // the review, the failure register, the KPIs and the objective — and it was
    // nine headings down, under the day-to-day registers.
    title: 'Quality & Analytics',
    items: [
      // DAILY CALL REVIEW, from Overview. It heads this group rather than
      // trailing it: it is where the day's calls are judged, and the Field
      // Failure Register below it is RAISED BY that judgement (0167), so the
      // order on the menu is the order the work happens in.
      { to: '/daily-review', label: 'Daily Complaint Review Register (R/SER/35)', icon: '📅' },
      { to: '/failure-report', label: 'Field Failure Register', icon: '🧪' },
      // FROM OVERVIEW (the user, 2026-09-15). The three failure screens read
      // in order: the register of what failed, the analysis of why, and the
      // KPIs the two roll up into.
      { to: '/product-failure', label: 'Product Failure Analysis', icon: '📈' },
      { to: '/kpi', label: 'KPI & Failure Analysis', icon: '📈' },
      { to: '/spare-insights', label: 'Spare Insights', icon: '🔎' },
      { to: '/objective', label: 'Objective', icon: '🎯' },
    ],
  },
  {
    // SERVICE MANUALS LEFT THIS GROUP (the user, 2026-09-09: "Move Service
    // Manuals Under Knowledge Base"). It belongs with the other things somebody
    // READS to do the job; what stays here is the controlled QMS shelf, which
    // is a different act — those documents govern the work rather than explain
    // it, and their write right (`qms.manage`) is separate for that reason.
    title: 'Documents',
    items: [
      { to: '/qms', label: 'QMS Documents', icon: '📗' },
      { to: '/training', label: 'Training', icon: '🎓' },
    ],
  },
  {
    title: 'Contracts & Warranty',
    items: [
      { to: '/warranties', label: 'Warranty Register', icon: '🛡️' },
      { to: '/contracts', label: 'Contract Register', icon: '📋' },
      { to: '/ownership-transfer', label: 'Ownership Transfer', icon: '🔁' },
    ],
  },
  {
    // ABOVE SERVICE CALLS (the user, 2026-09-09: "why did the knowledge base
    // not move up (before Service calls) -- rearrange it"). It was left at the
    // bottom where "Help" had been, which is where you put a thing people are
    // assumed to already know. It is read BEFORE the work, not after it, so it
    // sits above the registers.
    //
    // KNOWLEDGE BASE IS THE HEADING NOW (the user, 2026-09-09: "Promote
    // Knowledge Base to a heading with 1 topic - how to use"), where it used to
    // be a single item under "Help". Everything somebody READS to do the job
    // sits under it.
    //
    // HOW TO USE IS FIRST because it is what a new starter needs first — it
    // used to be the bottom half of the Knowledge Base page, below a wall of
    // team articles.
    //
    // FIELD SOLUTIONS IS HERE RATHER THAN GONE. The ask named one topic and
    // then added Service Manuals; the team's articles are a third thing and
    // dropping the entry would leave them written but unreachable except
    // through a call. It is one line to remove if it is not wanted.
    title: 'Knowledge Base',
    flash: true,
    items: [
      { to: '/knowledge-base/how-to', label: 'How to Use RITHI CRM', icon: '📖', alwaysOpen: true },
      // A DIFFERENT QUESTION FROM THE ONE ABOVE. How to Use answers "what do I
      // click"; this answers "why does the form already know that" — the
      // masters behind a call, what the system refuses, and what it will not
      // proceed without. `alwaysOpen` like its neighbours: there is nothing
      // here to grant, and a page explaining how the system works is of most
      // use to whoever has just been refused something by it.
      // NOT `alwaysOpen` ANY MORE (the user, 2026-09-16: "Limit Exposure to
      // Admin, NSM, Zoho, Technical Support"). Dropping the flag is what makes
      // the menu entry follow the permission; the permission itself is the
      // module key, granted to those four roles by 0209. Removing a menu entry
      // does not restrict a page — the route still answers.
      { to: '/knowledge-base/how-it-works', label: 'How RITHI Functions', icon: '🧭' },
      { to: '/knowledge-base', label: 'Field Solutions', icon: '🧠', alwaysOpen: true },
      { to: '/service-manuals', label: 'Service Manuals', icon: '📘' },
      { to: '/service-manuals/notes', label: 'Technical / Service Notes', icon: '📝' },
    ],
  },
  {
    title: 'Service Calls',
    items: [
      { to: '/request-registration', label: 'Request Registration', icon: '📝' },
      { to: '/pending-registrations', label: 'Pending Registrations', icon: '⏳' },
      { to: '/field-calls', label: 'Field Call Register', icon: '📡' },
      { to: '/installations', label: 'Installation Calls', icon: '🔧' },
      { to: '/pm-calls', label: 'Preventive (PM)', icon: '🗓️' },
      { to: '/pending-calls', label: 'Pending Calls', icon: '🔥' },
      { to: '/reports', label: 'Visit Reports / Service Reports', icon: '🗒️' },
      // CALL REVIEW, from Overview. It is read against a call, beside the
      // registers it reads from.
      { to: '/call-review', label: 'Call Review', icon: '🔎' },
      // CUSTOMER FEEDBACK, from Quality & Analytics (the user, 2026-09-12).
      // The feedback is collected on a CALL — it is the last step of the visit,
      // not an analysis of many — so it is filled in where the call is worked.
      { to: '/feedback', label: 'Customer Feedback', icon: '⭐' },
      // BULK REPORT MAPPING AND PM BULK UPLOAD MOVED TO ADMINISTRATION (the
      // user, 2026-09-12). Both were already admin-only; they are bulk data
      // operations sitting among the screens an engineer uses every day.
    ],
  },
  {
    title: 'Spares',
    items: [
      { to: '/spare-requests', label: 'Spare Requests', icon: '📦' },
      { to: '/spare-rm-approval', label: 'RM Approval', icon: '✅' },
      { to: '/spare-dispatch', label: 'Pending Dispatch', icon: '🚚' },
      // STOCK OUT — the flat list that was a tab on Pending Dispatch, now a
      // page (the user, 2026-09-12). Directly below the queue, because the two
      // are the same register either side of the dispatch.
      { to: '/stock-out', label: 'Stock Out', icon: '📄' },
      { to: '/spare-consumption', label: 'Spare Consumption', icon: '🧾' },
      { to: '/handstock', label: 'Hand Stock', icon: '🎒' },
      { to: '/mrn', label: 'Material Returns', icon: '↩️' },
      { to: '/stock-transfer', label: 'Stock Transfer', icon: '🔄' },
    ],
  },
  {
    // INDOOR SERVICE — its own group, sitting after Spares because that is the
    // order the work happens in: the machine leaves the field, passes through
    // the workshop, and goes back. A group with no items renders as nothing
    // (see below), which is why this heading could not be added before the
    // register existed.
    title: 'Indoor Service',
    items: [
      { to: '/indoor', label: 'Indoor Service Register', icon: '🏭' },
      // A parallel track of its own (the user, 2026-10-04): its own MRS, stock
      // out with cost, hand stock and consumption -- never the regular ones.
      { to: '/indoor/recycling', label: 'Spare Recycling', icon: '♻️', hideInAudit: true },
    ],
  },
  {
    // A HEADING, not a page under Quality & Analytics (the user, 2026-09-08).
    // Every export is taken from here and the list grows — "and more to come"
    // was the brief when the screen was created — so each report is its own
    // entry rather than a tab somebody has to know is there. They are one
    // named by `perm` above, because the path is no longer the permission —
    // and since 2026-09-09 each report has its OWN key, inheriting from
    // `mod:/exports`, so access can be given report by report.
    title: 'Reports',
    items: [
      // EACH REPORT IS ITS OWN KEY now (the user, 2026-09-09), and each falls
      // back to `mod:/exports` — so a role given Reports still sees all three
      // and one given a single report sees only that entry.
      { to: '/exports/consumption', label: 'Consumption Report', icon: '🔩', perm: 'mod:/exports/consumption' },
      { to: '/exports/kpi', label: 'KPI Export', icon: '📈', perm: 'mod:/exports/kpi' },
      { to: '/exports/unused', label: 'Not Consumed Against this Call', icon: '🚩', perm: 'mod:/exports/unused' },
      { to: '/exports/calls', label: 'Call Report', icon: '📞', perm: 'mod:/exports/calls' },
      { to: '/exports/feedback', label: 'Customer Feedback Report', icon: '⭐', perm: 'mod:/exports/feedback' },
      // Beside the feedback report it checks, and LAST in the group so the
      // permission matrix's order matches this one.
      { to: '/feedback-without-report', label: 'Feedback Without a Report', icon: '🔎', adminOnly: true },
      // HAND STOCK REPORT — administrators to begin with (the user,
      // 2026-09-24: "Default access to Admin/Super Admin, Rest of the Access I
      // will select from Roles & Permissions"). `admin: true` on the module
      // keeps the key out of every other role's defaults; 0241 grants it to
      // admin and technical_support.
      //
      // NOT `adminOnly`. That flag shows an entry to whoever holds
      // `admin.view`, while the page itself asks for `mod:/handstock-report`
      // -- so a role ticked on Roles & Permissions could open the page and had
      // no menu entry for it, and Zoho Migration (admin.view, no key) had an
      // entry that opened the lock screen. The entry asks for the same key the
      // page does, which is the per-role grant the user said they would make.
      { to: '/handstock-report', label: 'Hand Stock Report', icon: '📦' },
      // Administrators only to begin with (0319); the entry asks for the same
      // key the page and its data do.
      { to: '/install-calls-unmapped', label: 'Machines Without an Installation Call', icon: '🧰' },
    ],
  },
  {
    // ABOVE ADMINISTRATION (the user, 2026-09-12: "Move Master Above
    // Administration"), where it used to sit second. The masters are REFERENCE
    // DATA — they are maintained occasionally and read constantly through the
    // pickers, not opened daily — so they belong with the setup screens rather
    // than above the work.
    title: 'Master',
    items: [
      { to: '/parties', label: 'Party Master', icon: '🏥' },
      { to: '/product-database', label: 'Product Database', icon: '🩺' },
      // 2.0 — the same machines derived from the registers rather than stored.
      { to: '/product-database-2', label: 'Product Database 2.0', icon: '🧬' },
      // THE CATALOGUE, beside the register of machines it describes. One row
      // per product LINE; the Database is one row per MACHINE.
      { to: '/product-master', label: 'Product Master', icon: '📖' },
      { to: '/user-master', label: 'User Master', icon: '👤' },
      { to: '/parts', label: 'Part Master', icon: '🔩' },
      { to: '/masters', label: 'All Masters', icon: '🗂️' },
      ...MASTER_LISTS.map((l) => ({ to: masterListPath(l.key), label: l.label, icon: l.icon })),
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/missing-visit-reports', label: 'Solved Without a Report', icon: '📭', adminOnly: true },
      { to: '/tracker', label: 'Tracker', icon: '🧭' },
      { to: '/roles', label: 'Roles & Permissions', icon: '🔐', adminOnly: true },
      { to: '/audit', label: 'Audit Log', icon: '🧾', adminOnly: true },
      { to: '/bulk-uploads', label: 'Bulk Uploads', icon: '⤵', adminOnly: true },
      // THE TWO BULK UPLOADERS, from Service Calls (the user, 2026-09-12).
      // Beside Bulk Uploads, which is the importer they belong with — Bulk
      // Uploads does the registers, these two do the things it does not (a
      // report's mapping, a PM schedule), and keeping them apart is what made
      // somebody look for a table in the wrong one.
      { to: '/report-mapping', label: 'Bulk Report Mapping', icon: '🧩', adminOnly: true },
      { to: '/data-export', label: 'Data Export', icon: '⬇️', adminOnly: true },
      // WHICH DEVICES HOLD THE OFFLINE REGISTERS (0249) -- the user, 2026-09-29:
      // "Build the cache status report for my desk."
      { to: '/device-cache', label: 'Device Cache Status', icon: '📶', adminOnly: true },
      { to: '/pm-bulk-upload', label: 'PM Bulk Upload', icon: '⬆️', adminOnly: true },
      { to: '/admin-config', label: 'Admin Config', icon: '🛠️', adminOnly: true },
      { to: '/software-validation', label: 'Software Validation', icon: '🧪', adminOnly: true },
      { to: '/settings', label: 'Settings', icon: '⚙️', adminOnly: true },
      { to: '/version-history', label: 'Version History', icon: '🗂️' },
    ],
  },
];

// WHO SEES A NAV ITEM. An ordinary item asks for its own module key. An
// ADMIN-ONLY one asked for `manage-users` -- the right to CHANGE users -- so
// there was no way to let somebody merely look at the administration pages.
// `admin.view` opens them read-only (Technical Support, 2026-09-08); every
// control on them still asks separately for the right that changes something.
// AND AN ADMINISTRATION PAGE A ROLE HAS BEEN GIVEN IS IN ITS MENU (the user,
// 2026-09-30: the admin actions are tickable per role). Its own page key opens
// it at the route guard already; without this a role given Bulk Uploads could
// reach it only by typing the address.
const navItemVisible = (it: NavItem, can: (a: string) => boolean, auditOn = false): boolean =>
  !(it.hideInAudit && auditOn) && (!!it.alwaysOpen
  || (it.adminOnly
    ? (USER_ADMIN_KEYS.some((k) => can(k)) || can('admin.view') || can(it.perm ?? actionForPath(it.to)))
    : can(it.perm ?? actionForPath(it.to))));

// GLOBAL SEARCH (the user, 2026-10-01: "This has to search Modules / Content /
// Calls / Spare Request -- basically all Content"). Screen names first, as
// before; then, from three characters, one group per register -- calls, call
// requests, spares, consumption, parties, machines, parts, documents, the
// Knowledge Base and FFRs -- each filled in as its own read returns, so one slow
// register does not hold the rest. A hit OPENS THAT RECORD on its own screen
// (their answer), and is offered only where the person may open that screen;
// the rows themselves are whatever the database's row-level security lets them
// read. The rules of each hit are src/lib/globalSearch.ts.
function ModuleSearch() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const auditOn = useAuditMode().on;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Partial<Record<HitKind, SearchHit[]>>>({});
  const [pending, setPending] = useState<Set<HitKind>>(new Set());
  const [failed, setFailed] = useState<Set<HitKind>>(new Set());
  const [hi, setHi] = useState(0);
  const items = useMemo(
    () => NAV.flatMap((g) => g.items.filter((it) => navItemVisible(it, can, auditOn)).map((it) => ({ ...it, group: g.title }))),
    [can, auditOn],
  );
  const modules = q.trim()
    ? items.filter((it) => `${it.label} ${it.group}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : [];
  // Only the registers whose screen this person may open are searched at all.
  const kinds = useMemo(() => HIT_GROUPS.filter((g) => {
    const probe: Record<HitKind, string> = {
      call: '/field-calls', request: '/pending-registrations', spare: '/spare-requests',
      consumption: '/spare-consumption', party: '/parties', machine: '/machine-history',
      part: '/part-search', document: '/service-manuals', kb: '', ffr: '/failure-report',
    };
    if (g.kind === 'kb') return true;   // Field Solutions is open to everyone
    if (g.kind === 'call') return ['/field-calls', '/installations', '/pm-calls'].some((r) => can(actionForPath(r)));
    if (g.kind === 'document') return ['/service-manuals', '/service-manuals/notes', '/qms'].some((r) => can(actionForPath(r)));
    return can(actionForPath(probe[g.kind]));
  }), [can]);

  // Debounced: a register read per keystroke would be ten round trips a letter.
  useEffect(() => {
    const term = searchTerm(q);
    if (!supabaseConfigured() || term.length < MIN_CHARS) { setHits({}); setPending(new Set()); setFailed(new Set()); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      setHits({}); setFailed(new Set());
      setPending(new Set(kinds.map((k) => k.kind)));
      kinds.forEach(({ kind }) => {
        void globalSearchKind(kind, term)
          .then((h) => { if (alive) setHits((m) => ({ ...m, [kind]: h.filter((x) => !x.route || can(actionForPath(x.route))) })); })
          .catch(() => { if (alive) setFailed((f) => new Set(f).add(kind)); })
          .finally(() => { if (alive) setPending((p) => { const n = new Set(p); n.delete(kind); return n; }); });
      });
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, kinds, can]);

  // One flat list for the keyboard: modules, then each group's hits in order.
  const flat: ({ t: 'mod'; to: string } | { t: 'hit'; hit: SearchHit })[] = [
    ...modules.map((m) => ({ t: 'mod' as const, to: m.to })),
    ...kinds.flatMap((g) => shownHits(hits[g.kind] ?? []).shown.map((hit) => ({ t: 'hit' as const, hit }))),
  ];
  useEffect(() => { setHi(0); }, [q]);

  const close = () => { setQ(''); setOpen(false); };
  const goModule = (to: string) => { navigate(to); close(); };
  const goHit = (h: SearchHit) => {
    if (h.href) window.open(h.href, '_blank', 'noopener,noreferrer');
    else if (h.to) navigate(h.to, { state: h.state });
    close();
  };
  const activate = (i: number) => {
    const f = flat[i]; if (!f) return;
    if (f.t === 'mod') goModule(f.to); else goHit(f.hit);
  };

  const term = searchTerm(q);
  const searching = term.length >= MIN_CHARS && supabaseConfigured();
  const anyHit = kinds.some((g) => (hits[g.kind] ?? []).length);
  let idx = modules.length;

  return (
    <div className="mod-search">
      <span className="mod-search-icon">🔎</span>
      <input
        className="input mod-search-input"
        placeholder="Search modules, calls, spares, parties, parts, documents…"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(flat.length - 1, 0))); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
          if (e.key === 'Enter') { activate(hi); return; }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim() && (
        <>
          <div className="mod-search-backdrop" onClick={() => setOpen(false)} />
          <div className="mod-search-menu" role="listbox">
            {modules.length > 0 && <div className="mod-search-group">Modules</div>}
            {modules.map((it, i) => (
              <button key={it.to} className={`mod-search-item${hi === i ? ' is-hi' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); goModule(it.to); }}>
                <span className="mod-search-item-ic">{it.icon}</span>
                <span className="mod-search-item-tx"><b>{it.label}</b><span className="muted"> · {it.group}</span></span>
              </button>
            ))}
            {!searching && modules.length === 0 && (
              <div className="muted mod-search-empty">
                {supabaseConfigured() ? `No modules match. Type ${MIN_CHARS} or more characters to search records too.` : 'No modules match.'}
              </div>
            )}
            {searching && kinds.map((g) => {
              const { shown: list, more } = shownHits(hits[g.kind] ?? []);
              if (!list.length && !failed.has(g.kind)) return null;
              return (
                <div key={g.kind}>
                  <div className="mod-search-group">{g.icon} {g.label}</div>
                  {failed.has(g.kind) && <div className="muted mod-search-empty">Could not search {g.label.toLowerCase()} just now.</div>}
                  {list.map((h) => {
                    const i = idx++;
                    return (
                      <button key={h.key} className={`mod-search-item${hi === i ? ' is-hi' : ''}`}
                        onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); goHit(h); }}>
                        <span className="mod-search-item-ic">{h.href ? '↗' : g.icon}</span>
                        <span className="mod-search-item-tx"><b>{h.title || '—'}</b>{h.sub && <span className="muted"> · {h.sub}</span>}</span>
                      </button>
                    );
                  })}
                  {more && <div className="muted mod-search-empty">The first {PER_KIND} of more — type more of the name or number, or open {g.label} to see them all.</div>}
                </div>
              );
            })}
            {searching && pending.size > 0 && <div className="muted mod-search-empty">Searching {pending.size} more {pending.size === 1 ? 'register' : 'registers'}…</div>}
            {searching && pending.size === 0 && !anyHit && modules.length === 0 && failed.size === 0 && (
              <div className="muted mod-search-empty">Nothing you can open matches “{term}”.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Compact theme picker — a small 🎨 button with a dropdown of themes.
function ThemeMenu() {
  const { theme, themes, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="theme-mini">
      <button className="btn btn-ghost btn-sm theme-mini-btn" title={`Theme: ${theme.name}`} onClick={() => setOpen((o) => !o)}>🎨</button>
      {open && (
        <>
          <div className="theme-mini-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-mini-menu">
            {themes.map((t) => (
              <button key={t.id} className={`theme-mini-item ${t.id === theme.id ? 'active' : ''}`} onClick={() => { setThemeId(t.id); setOpen(false); }}>
                {t.id === theme.id ? '✓ ' : ''}{t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can, managerViewMode, setManagerViewMode } = useAuth();
  const auditOn = useAuditMode().on;
  // FROM THE USER MASTER, and blank for anybody whose row does not carry one —
  // which is most of a part-filled directory. The chip then shows the name and
  // the permission alone rather than an empty line where a job title should be.
  const designation = String(user?.designation ?? '').trim();
  const navCounts = useModuleCounts();
  const navigate = useNavigate();
  const isManagerRole = user?.rbacRole === 'rm' || user?.rbacRole === 'rgm';
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('rithi.sidebarCollapsed') === '1'; } catch { return false; }
  });
  // SEEN, PER DEVICE. localStorage rather than the database: this is a nudge
  // about the MENU, not a fact about the person — somebody who has found the
  // Knowledge Base on their laptop has not found it on the ward tablet they
  // pick up once a week. Every access is guarded, because a private window or
  // a browser set to block site data throws on the accessor itself.
  const [seenGroups, setSeenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('rithi.nav.seen') ?? '{}') as Record<string, boolean>; }
    catch { return {}; }
  });
  const markSeen = (title: string) => {
    setSeenGroups((cur) => {
      if (cur[title]) return cur;
      const next = { ...cur, [title]: true };
      try { localStorage.setItem('rithi.nav.seen', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const [mobileOpen, setMobileOpen] = useState(false);

  // THE MACHINE REGISTER ON THIS DEVICE (machinestore.ts): downloaded once the
  // person is signed in, refreshed every six hours and whenever the signal or
  // the app comes back. A no-op while the copy is fresh.
  useEffect(() => {
    if (user && supabaseConfigured()) watchMachineRegister();
  }, [user]);

  // Persist the desktop collapse so it sticks across sessions.
  useEffect(() => {
    try { localStorage.setItem('rithi.sidebarCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('rithi.navGroups') ?? '{}'); } catch { return {}; }
  });
  const location = useLocation();

  const toggleGroup = (title: string) =>
    setOpenGroups((g) => {
      const next = { ...g, [title]: g[title] === false ? true : false };
      try { localStorage.setItem('rithi.navGroups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  // Collapse / expand every nav group at once.
  const allGroupsCollapsed = NAV.every((g) => openGroups[g.title] === false);
  const toggleAllGroups = () => {
    const next: Record<string, boolean> = {};
    NAV.forEach((g) => { next[g.title] = allGroupsCollapsed; }); // if all collapsed → expand (true), else collapse (false)
    setOpenGroups(next);
    try { localStorage.setItem('rithi.navGroups', JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Close the mobile drawer whenever the route changes.
  const closeMobile = () => setMobileOpen(false);

  // Clear Cache and Update — the mobile equivalent of Ctrl/Win+Shift+R. Drops the cached
  // rows and sync markers and any service-worker/HTTP caches, then hard-reloads
  // with a cache-busting param so the freshest deployed build is fetched.
  //
  // `rithi.cache.` is the important one and was missing: every register restores
  // its rows from there before the network answers, so a force update that left
  // them in place could not clear a screen stuck on stale data.
  // ---- is this tab still the current build? --------------------------------
  //
  // The build writes `version.json` beside index.html. A tab asks for it on
  // focus and every few minutes; if the build ID has moved, the update is
  // ANNOUNCED rather than left to be noticed. A fix can be deployed, confirmed
  // deployed, and still be invisible to the person who reported the fault --
  // that happened, twice, and cost a round trip each time.
  const [newBuild, setNewBuild] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const url = new URL('version.json', document.baseURI);
        url.searchParams.set('ts', String(Date.now()));
        const r = await fetch(url.toString(), { cache: 'no-store' });
        if (!r.ok) return;
        const v = await r.json() as { buildId?: string; version?: string };
        if (!stop && v.buildId && v.buildId !== __BUILD_ID__) setNewBuild(v.version ?? '');
      } catch { /* offline, or a stale tab: nothing to say */ }
    };
    void check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => { stop = true; window.clearInterval(id); window.removeEventListener('focus', check); };
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rithi.cache.') || k.startsWith('rithi.sync.')) localStorage.removeItem(k);
      });
      // THE DROPDOWN LISTS TOO (products, customers, complaints...). This button
      // is the repair tool, and it never cleared them -- so a stored product list
      // cut short on a phone survived every press of it, while the help said
      // otherwise. The offline machine register and Party Master are NOT these:
      // they are kept (machinestore.ts) and refresh on their own.
      clearMasterCache();
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
      if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
    } catch { /* best-effort */ }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  };

  // UPDATE NOW -- a new release is picked up by a reload that KEEPS the offline
  // machine register and Party Master (the user, 2026-09-29). Every release gets
  // new file names and there is no offline app-shell, so re-downloading twenty
  // thousand machines was never what updating needed.
  //
  // THE SCREENS' OWN REMEMBERED LISTS ARE STILL CLEARED, exactly as Clear Cache
  // does -- the user's caution: "I have a gut feeling that we might have some
  // issues in other modules if we don't clear cache." Those are small (the last
  // page a screen showed), a release CAN change their shape, and each screen
  // re-fetches them in seconds. Only the two big registers are spared.
  // "Clear Cache and Update" stays for when something is actually stuck.
  const updateNow = () => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rithi.cache.') || k.startsWith('rithi.sync.')) localStorage.removeItem(k);
      });
    } catch { /* best-effort */ }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  };

  const toggleSidebar = () => {
    // On phones & tablets the ☰ opens the off-canvas drawer; on desktop it
    // collapses the sidebar to the icon rail.
    if (window.matchMedia('(max-width: 1024px)').matches) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  return (
    <div className={`app-shell ${collapsed ? 'app-collapsed' : ''} ${mobileOpen ? 'app-mobile-open' : ''}`}>
      {newBuild && (
        <div className="app-newbuild">
          {/* THE CHECK COMPARES BUILD IDS; THE MESSAGE USED TO PRINT THE
              VERSION. A deploy that changes no version — SQL, a document, a
              diagnostic — therefore announced "A newer version (v0.9.293) is
              out — this tab is still on v0.9.293", telling somebody to update
              to exactly what they already have. Reported 2026-09-18.

              That is not a cosmetic slip: this banner exists because a fix can
              be merged, deployed and still invisible to the person who
              reported the fault, and a banner that cries wolf is one people
              learn to dismiss — which costs the round trip it was built to
              save. So it names a version only when the version actually
              differs, and otherwise says what IS true: the build is older. */}
          <span>
            {newBuild && newBuild !== __APP_VERSION__
              ? `A newer version (v${newBuild}) is out — this tab is still on v${__APP_VERSION__}.`
              : `An update is out — this tab is running an earlier build of v${__APP_VERSION__}.`}
          </span>
          <button className="btn btn-sm btn-primary" onClick={updateNow} title="Reload into the new version. Keeps the machine and customer lists stored on this device for offline search.">
            ⟳ Update now
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setNewBuild(null)} title="Hide until the next check">✕</button>
        </div>
      )}
      {mobileOpen && <div className="sidebar-backdrop" onClick={closeMobile} />}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src={RITHI_LOGO} alt="RITHI CRM" />
          {!collapsed && (
            <div>
              <div className="sidebar-name">RITHI CRM</div>
              <div className="sidebar-tag">Field Service</div>
            </div>
          )}
        </div>
        <nav className="sidebar-nav">
          {!collapsed && (
            <button className="nav-collapse-all" onClick={toggleAllGroups} title={allGroupsCollapsed ? 'Expand all groups' : 'Collapse all groups'}>
              {allGroupsCollapsed ? '⊞ Expand all' : '⊟ Collapse all'}
            </button>
          )}
          {NAV.map((group) => {
            const items = group.items.filter((i) => navItemVisible(i, can, auditOn));
            if (items.length === 0) return null;
            const open = openGroups[group.title] !== false; // default open
            const flashing = !!group.flash && !seenGroups[group.title];
            return (
              <div className="nav-group" key={group.title}>
                {!collapsed && (
                  <button
                    className={`nav-group-title nav-group-toggle${flashing ? ' nav-group-flash' : ''}`}
                    onClick={() => toggleGroup(group.title)}
                    title={open ? 'Collapse' : 'Expand'}
                  >
                    <span className={`nav-group-caret ${open ? 'open' : ''}`}>▸</span>
                    {group.title}
                  </button>
                )}
                {(collapsed || open) &&
                  items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                      title={item.label}
                      // OPENING A PAGE IN THE GROUP ENDS THE FLASH, permanently
                      // on this device. Not the heading's own click: expanding
                      // and collapsing a group is not the same as having gone
                      // and looked, and a nudge that a stray click switches off
                      // has not done its job.
                      onClick={() => { markSeen(group.title); closeMobile(); }}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {!collapsed && <span className="nav-label">{item.label}</span>}
                      {!collapsed && navCounts[item.to] && (
                        <span className="nav-count">{countLabel(navCounts[item.to])}</span>
                      )}
                    </NavLink>
                  ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button className="btn btn-ghost btn-sm" onClick={toggleSidebar} title="Toggle menu">
            ☰
          </button>
          <div className="header-crumb">{crumbFor(location.pathname)}</div>
          <ModuleSearch />
          {isManagerRole && (
            <button
              className={`btn btn-ghost btn-sm ${managerViewMode === 'team' ? 'viewas-active' : ''}`}
              onClick={() => setManagerViewMode(managerViewMode === 'team' ? 'mine' : 'team')}
              title="Switch between your own calls and your whole team's"
            >
              {managerViewMode === 'team' ? '👥 Team calls' : '🙋 My calls'}
            </button>
          )}
          <ViewAsControl />
          <NotificationBell />
          <ThemeMenu />

          <div className="header-user">
            <button className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
              {/* "?" USED TO BE THE ONLY SIGN that a profile had not loaded, and
                  it reads as a rendering glitch rather than as a problem with
                  the account. It still shows — there is nothing else to draw —
                  but it is now marked, and the menu below says what it means. */}
              <span className={`user-avatar${user?.unresolved ? ' user-avatar-unresolved' : ''}`}
                title={user?.unresolved ? 'Your profile did not load — open My Profile' : undefined}>
                {user?.fullName?.[0] ?? '?'}</span>
              {/* THE DESIGNATION AND THE PERMISSION ARE DIFFERENT THINGS AND
                  ROUTINELY DIFFER (the user, 2026-09-18, pointing at a User
                  Master row reading Designation "Regional Manager" beside Role
                  "Reporting Manager"). The DESIGNATION is the job somebody
                  holds in the company; the second line is what this application
                  grants them, and the user named it PERMISSION rather than
                  "RITHI role" — their word, and the clearer one, since it says
                  what the value DOES rather than which system it belongs to.
                  Showing one unlabelled where the other used to be is how they
                  get read as the same thing, so the line SAYS which it is. */}
              <span className="user-meta">
                <span className="user-name">{user?.fullName}</span>
                {!!designation && <span className="user-designation">{designation}</span>}
                <span className="user-role">Permission · {roleLabel(user)}</span>
              </span>
              <span>▾</span>
            </button>
            {menuOpen && (
              <div className="user-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="user-menu-head">
                  <b>{user?.fullName}</b>
                  <div className="muted">{user?.email}</div>
                  {/* Both, LABELLED, where there is room to label them. The chip
                      has to be terse; this does not. */}
                  <dl className="user-menu-facts">
                    <dt>Designation</dt>
                    <dd>{designation || <span className="muted">not set in User Master</span>}</dd>
                    <dt>Permission</dt>
                    <dd>{roleLabel(user)}</dd>
                  </dl>
                </div>
                <button className="user-menu-item" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>My Profile</button>
                <button className="user-menu-item" disabled={refreshing} onClick={() => void forceRefresh()}>
                  <span>🧹 Clear Cache and Update</span>
                  <small className="muted">If the app looks old or stuck</small>
                </button>
                <button className="user-menu-item" onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        <ViewAsBanner />
        <main className="app-content">{children}</main>

        <footer className="app-footer" title={`Built ${__BUILD_TIME__}`}>
          <span><b>RITHI CRM</b>&nbsp;v{__APP_VERSION__}</span>
          <span className="foot-sep">·</span>
          <span>build #{__BUILD_NUMBER__}</span>
          <span className="foot-sep">·</span>
          <span className="foot-hide-sm">ID {__BUILD_ID__}</span>
          <span className="foot-sep foot-hide-sm">·</span>
          <span className="foot-hide-sm">built {fmtDateTime(__BUILD_TIME__)}</span>
          <span className="foot-spacer" />
          {/* NAMED FOR WHAT IT DOES, AND PUT WHERE IT IS FOUND. "Force update"
              in the footer was a thing you had to be told about: a first-time
              user reading the footer had no reason to read "force" as "clear
              the cache". It now says so, it is a solid button rather than a
              grey one, and the same command sits in the user menu — which is
              where somebody who thinks "the app is stuck" actually looks. */}
          <button
            className="btn btn-primary foot-refresh"
            onClick={() => void forceRefresh()}
            disabled={refreshing}
            title="Clears this device's cached data and reloads the newest version (the app's Ctrl/Win + Shift + R)"
          >
            {refreshing ? 'Updating…' : '🧹 Clear Cache and Update'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function crumbFor(path: string): string {
  for (const g of NAV) {
    for (const i of g.items) {
      if (i.to === path) return `${g.title} · ${i.label}`;
    }
  }
  return 'RITHI CRM';
}
