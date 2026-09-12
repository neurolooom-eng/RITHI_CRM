import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleLabel } from '../../lib/auth';
import { actionForPath } from '../../lib/rbac';
import { useTheme } from '../../theme/ThemeProvider';
import { fmtDateTime } from '../../lib/format';
import { ViewAsControl, ViewAsBanner } from './ViewAs';
import { MASTER_LISTS, masterListPath } from '../../modules/masterLists';
import { useModuleCounts, countLabel } from '../../lib/counts';
import { NotificationBell } from './NotificationBell';
import './layout.css';
import { RITHI_LOGO } from '../../lib/brand';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
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
      { to: '/spare-insights', label: 'Spare Insights', icon: '🔎' },
      { to: '/lookup', label: 'Product & Party Search', icon: '🔎' },
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
      { to: '/daily-review', label: 'Daily Call Review', icon: '📅' },
      { to: '/failure-report', label: 'Field Failure Register', icon: '🧪' },
      { to: '/kpi', label: 'KPI & Failure Analysis', icon: '📈' },
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
      { to: '/knowledge-base', label: 'Field Solutions', icon: '🧠', alwaysOpen: true },
      { to: '/service-manuals', label: 'Service Manuals', icon: '📘' },
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
      { to: '/product-master', label: 'Product Master', icon: '🩺' },
      { to: '/user-master', label: 'User Master', icon: '👤' },
      { to: '/parts', label: 'Part Master', icon: '🔩' },
      { to: '/masters', label: 'All Masters', icon: '🗂️' },
      ...MASTER_LISTS.map((l) => ({ to: masterListPath(l.key), label: l.label, icon: l.icon })),
    ],
  },
  {
    title: 'Administration',
    items: [
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
const navItemVisible = (it: NavItem, can: (a: string) => boolean): boolean =>
  !!it.alwaysOpen
  || (it.adminOnly ? (can('manage-users') || can('admin.view')) : can(it.perm ?? actionForPath(it.to)));

// Global search across all modules (nav items). Jump straight to any screen.
function ModuleSearch() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => NAV.flatMap((g) => g.items.filter((it) => navItemVisible(it, can)).map((it) => ({ ...it, group: g.title }))),
    [can],
  );
  const results = q.trim()
    ? items.filter((it) => `${it.label} ${it.group}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const go = (to: string) => { navigate(to); setQ(''); setOpen(false); };
  return (
    <div className="mod-search">
      <span className="mod-search-icon">🔎</span>
      <input
        className="input mod-search-input"
        placeholder="Search modules…"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].to); if (e.key === 'Escape') setOpen(false); }}
      />
      {open && q.trim() && (
        <>
          <div className="mod-search-backdrop" onClick={() => setOpen(false)} />
          <div className="mod-search-menu">
            {results.length === 0 && <div className="muted mod-search-empty">No modules match.</div>}
            {results.map((it) => (
              <button key={it.to} className="mod-search-item" onMouseDown={(e) => { e.preventDefault(); go(it.to); }}>
                <span className="mod-search-item-ic">{it.icon}</span>
                <span className="mod-search-item-tx"><b>{it.label}</b><span className="muted"> · {it.group}</span></span>
              </button>
            ))}
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
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
      if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
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
          <span>A newer version{newBuild ? ` (v${newBuild})` : ''} is out — this tab is still on v{__APP_VERSION__}.</span>
          <button className="btn btn-sm" disabled={refreshing} onClick={() => void forceRefresh()}>
            {refreshing ? 'Updating…' : '🧹 Clear Cache and Update'}
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
            const items = group.items.filter((i) => navItemVisible(i, can));
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
              <span className="user-avatar">{user?.fullName?.[0] ?? '?'}</span>
              <span className="user-meta">
                <span className="user-name">{user?.fullName}</span>
                <span className="user-role">{roleLabel(user)}</span>
              </span>
              <span>▾</span>
            </button>
            {menuOpen && (
              <div className="user-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="user-menu-head">
                  <b>{user?.fullName}</b>
                  <div className="muted">{user?.email}</div>
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
