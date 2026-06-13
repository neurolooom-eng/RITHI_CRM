import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, ROLE_LABELS } from '../../lib/auth';
import { useTheme } from '../../theme/ThemeProvider';
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
      { to: '/products', label: 'Product Master', icon: '🩺' },
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
      { to: '/installations', label: 'Installation Calls', icon: '🔧' },
      { to: '/pm-calls', label: 'Preventive (PM)', icon: '🗓️' },
      { to: '/breakdowns', label: 'Breakdown Calls', icon: '⚠️' },
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
    title: 'Billing',
    items: [
      { to: '/quotes', label: 'Quotations', icon: '🧮' },
      { to: '/invoices', label: 'Invoices', icon: '💳' },
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
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const { theme, themes, setThemeId } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  const closeMobile = () => setMobileOpen(false);

  const toggleSidebar = () => {
    // On phones the ☰ opens the off-canvas drawer; on desktop it collapses.
    if (window.matchMedia('(max-width: 760px)').matches) {
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
            return (
              <div className="nav-group" key={group.title}>
                {!collapsed && <div className="nav-group-title">{group.title}</div>}
                {items.map((item) => (
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
          <div className="spacer" />

          <select
            className="select header-theme"
            value={theme.id}
            onChange={(e) => setThemeId(e.target.value)}
            title="Theme"
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

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

        <main className="app-content">{children}</main>
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
