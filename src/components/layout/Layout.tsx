import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABELS } from '../../lib/auth';
import { useTheme } from '../../theme/ThemeProvider';
import { fmtDateTime } from '../../lib/format';
import { ViewAsControl, ViewAsBanner } from './ViewAs';
import './layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '📊' },
      { to: '/daily-review', label: 'Daily Call Review', icon: '📅' },
    ],
  },
  {
    title: 'Masters',
    items: [
      { to: '/parties', label: 'Party Master', icon: '🏥' },
      { to: '/product-master', label: 'Product Master', icon: '🩺' },
      { to: '/user-master', label: 'User Master', icon: '👤' },
      { to: '/parts', label: 'Part Master', icon: '🔩' },
    ],
  },
  {
    title: 'Contracts & Warranty',
    items: [
      { to: '/warranties', label: 'Warranty Register', icon: '🛡️' },
      { to: '/contracts', label: 'Contract Register', icon: '📋' },
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
      { to: '/reports', label: 'Reports', icon: '🗒️' },
    ],
  },
  {
    title: 'Spares',
    items: [
      { to: '/spare-requests', label: 'Spare Requests', icon: '📦' },
      { to: '/spare-consumption', label: 'Spare Consumption', icon: '🧾' },
    ],
  },
  {
    title: 'Quality & Analytics',
    items: [
      { to: '/feedback', label: 'Customer Feedback', icon: '⭐' },
      { to: '/failure-report', label: 'Field Failure Report', icon: '🧪' },
      { to: '/kpi', label: 'KPI & Failure Analysis', icon: '📈' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'User Access', icon: '👥', adminOnly: true },
      { to: '/admin-config', label: 'Admin Config', icon: '🛠️', adminOnly: true },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
      { to: '/version-history', label: 'Version History', icon: '🗂️' },
    ],
  },
];

// Global search across all modules (nav items). Jump straight to any screen.
function ModuleSearch() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => NAV.flatMap((g) => g.items.filter((it) => !it.adminOnly || can('manage-users')).map((it) => ({ ...it, group: g.title }))),
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
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('rithi.sidebarCollapsed') === '1'; } catch { return false; }
  });
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

  // Close the mobile drawer whenever the route changes.
  const closeMobile = () => setMobileOpen(false);

  // Force update — the mobile equivalent of Ctrl/Win+Shift+R. Drops cached
  // sheet-sync markers and any service-worker/HTTP caches, then hard-reloads
  // with a cache-busting param so the freshest deployed build is fetched.
  const [refreshing, setRefreshing] = useState(false);
  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('rithi.sync.')) localStorage.removeItem(k); });
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
      {mobileOpen && <div className="sidebar-backdrop" onClick={closeMobile} />}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-logo">⚕️</span>
          {!collapsed && (
            <div>
              <div className="sidebar-name">RITHI CRM</div>
              <div className="sidebar-tag">Field Service</div>
            </div>
          )}
        </div>
        <nav className="sidebar-nav">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.adminOnly || can('manage-users'));
            if (items.length === 0) return null;
            const open = openGroups[group.title] !== false; // default open
            return (
              <div className="nav-group" key={group.title}>
                {!collapsed && (
                  <button
                    className="nav-group-title nav-group-toggle"
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
                      onClick={closeMobile}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {!collapsed && <span className="nav-label">{item.label}</span>}
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
          <ViewAsControl />
          <ThemeMenu />

          <div className="header-user">
            <button className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
              <span className="user-avatar">{user?.fullName?.[0] ?? '?'}</span>
              <span className="user-meta">
                <span className="user-name">{user?.fullName}</span>
                <span className="user-role">{user ? ROLE_LABELS[user.role] : ''}</span>
              </span>
              <span>▾</span>
            </button>
            {menuOpen && (
              <div className="user-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="user-menu-head">
                  <b>{user?.fullName}</b>
                  <div className="muted">{user?.email}</div>
                </div>
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
          <button
            className="btn btn-sm foot-refresh"
            onClick={() => void forceRefresh()}
            disabled={refreshing}
            title="Force update — reloads the latest build & re-syncs (like Ctrl/Win+Shift+R)"
          >
            {refreshing ? '…' : '⟳ Force update'}
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
