import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { useTheme } from '../theme/ThemeProvider';
import { ChangePassword } from './ChangePassword';

// ===========================================================================
// MY PROFILE — the signed-in user's own page: who they are, changing their
// password, and picking a theme. Everyone gets this (unlike Settings, which is
// admin-only and holds the connection / template / data controls).
// ===========================================================================

export function Profile() {
  const { user } = useAuth();
  const { theme, themes, setThemeId } = useTheme();

  const rows: [string, string][] = [
    ['Name', user?.fullName || '—'],
    ['Email', user?.email || '—'],
    ['Role', user ? (ROLE_LABELS[user.role] ?? user.role) : '—'],
    ...(user?.designation ? [['Designation', user.designation] as [string, string]] : []),
    ...(user?.region ? [['Region', user.region] as [string, string]] : []),
  ];

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your account, password and appearance" icon="👤" />

      <SectionCard title="Account">
        <div className="assoc-scroll">
          <table className="assoc-table" style={{ minWidth: 320, maxWidth: 520 }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><td style={{ width: 140, color: 'var(--muted)' }}>{k}</td><td><b>{v}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted rep-hint" style={{ marginTop: 8 }}>
          Your role and access are managed by an administrator under User Access.
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <ChangePassword />

      <div style={{ height: 16 }} />

      <SectionCard title="Appearance">
        <div className="muted" style={{ marginBottom: 12 }}>Pick a theme — the whole app re-skins instantly.</div>
        <div className="theme-grid">
          {themes.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch ${theme.id === t.id ? 'theme-swatch-active' : ''}`}
              onClick={() => setThemeId(t.id)}
            >
              <div className="theme-swatch-bars">
                <span style={{ background: t.colors.sidebarBg }} />
                <span style={{ background: t.colors.primary }} />
                <span style={{ background: t.colors.accent }} />
                <span style={{ background: t.colors.surface, border: `1px solid ${t.colors.border}` }} />
              </div>
              <div className="theme-swatch-name">
                {t.name}
                {theme.id === t.id && <span className="badge badge-primary">Active</span>}
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t.scheme}</div>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
