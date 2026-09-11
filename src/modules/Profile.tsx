import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth, roleLabel } from '../lib/auth';
import { permsForRole, DEFAULT_PERMS, FUNCTIONAL_ACTIONS, MODULES, moduleAction, legacyToRbac } from '../lib/rbac';
import { useTheme } from '../theme/ThemeProvider';
import { ChangePassword } from './ChangePassword';

// ===========================================================================
// MY PROFILE — the signed-in user's own page: who they are, changing their
// password, and picking a theme. Everyone gets this (unlike Settings, which is
// admin-only and holds the connection / template / data controls).
// ===========================================================================

export function Profile() {
  const { user, rolePerms, viewAs, realUser } = useAuth();
  const { theme, themes, setThemeId } = useTheme();

  const rows: [string, string][] = [
    ['Name', user?.fullName || '—'],
    ['Email', user?.email || '—'],
    ['Role', roleLabel(user) || '—'],
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

      {/* ---------------------------------------------------------------
          WHY CAN I NOT DO THIS?

          Reported 2026-09-11: an administrator using "View as" saw three
          actions on a call and the engineer signing in himself saw one. Both
          go through the SAME can(), so the difference had to be in the inputs —
          and there was no way, from either screen, to see what those inputs
          were. Two people comparing screenshots is not a diagnosis.

          So the screen says it: the role key actually in effect, WHERE the
          permissions came from (the stored role row or the built-in defaults —
          the distinction this project has been caught by more than once), and
          exactly what is held. One screenshot now answers it.
          --------------------------------------------------------------- */}
      <PermissionsPanel user={user} rolePerms={rolePerms} previewing={!!viewAs} realName={realUser?.fullName} />

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


// ---------------------------------------------------------------------------
// The access this session is ACTUALLY running with — not what a role is
// supposed to carry, but what `can()` will answer with right now.
// ---------------------------------------------------------------------------
function PermissionsPanel({ user, rolePerms, previewing, realName }: {
  user: ReturnType<typeof useAuth>['user'];
  rolePerms: Record<string, string[]>;
  previewing: boolean;
  realName?: string;
}) {
  if (!user) return null;
  const roleKey = user.rbacRole || legacyToRbac(user.role);
  const stored = rolePerms[roleKey];
  // THE DISTINCTION THAT MATTERS. A stored row that exists but is EMPTY falls
  // back to the defaults silently — which is exactly how a role can look
  // configured on Roles & Permissions and behave like something else.
  const fromStored = !!(stored && stored.length);
  const granted = permsForRole(roleKey, rolePerms);
  const extras = user.extraPermissions ?? [];
  const label = (k: string) =>
    FUNCTIONAL_ACTIONS.find((a) => a.key === k)?.label
    ?? MODULES.find((m) => moduleAction(m.path) === k)?.label
    ?? k;
  const actions = granted.filter((k) => !k.startsWith('mod:'));
  const pages = granted.filter((k) => k.startsWith('mod:'));

  return (
    <>
      <div style={{ height: 16 }} />
      <SectionCard title="What I can do">
        {previewing && (
          <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 10 }}>
            <span>
              This is the <b>preview</b> identity, not {realName || 'your'} own access — it is what
              the app is behaving as while the preview is on.
            </span>
          </div>
        )}
        <div className="assoc-scroll">
          <table className="assoc-table" style={{ minWidth: 320, maxWidth: 620 }}>
            <tbody>
              <tr><td style={{ width: 170, color: 'var(--muted)' }}>Role in effect</td>
                  <td><b>{roleLabel(user)}</b> <span className="muted">({roleKey})</span></td></tr>
              <tr><td style={{ color: 'var(--muted)' }}>Permissions come from</td>
                  <td>{fromStored
                    ? <b>the role as configured under Roles &amp; Permissions</b>
                    : <><b>the built-in defaults</b> — no permissions are stored for this
                        role, so it falls back. Anything set on Roles &amp; Permissions for
                        “{roleLabel(user)}” is NOT in effect.</>}</td></tr>
              <tr><td style={{ color: 'var(--muted)' }}>Granted to me personally</td>
                  <td>{extras.length ? extras.map(label).join(', ') : <span className="muted">none</span>}</td></tr>
            </tbody>
          </table>
        </div>

        <h4 className="ind-sub" style={{ marginTop: 14 }}>Actions</h4>
        <div className="muted rep-hint" style={{ marginBottom: 6 }}>
          {actions.length} action{actions.length === 1 ? '' : 's'}. An action missing here is why a
          button is missing on a screen — the database refuses it too, so it is never just hidden.
        </div>
        <div className="kb-jump">
          {actions.map((k) => <span key={k} className="ind-chip" title={k}>{label(k)}</span>)}
          {actions.length === 0 && <span className="muted">None — this login can only look.</span>}
        </div>

        <h4 className="ind-sub" style={{ marginTop: 14 }}>Pages</h4>
        <div className="kb-jump">
          {pages.map((k) => <span key={k} className="ind-chip" title={k}>{label(k)}</span>)}
          {pages.length === 0 && <span className="muted">Falling back to the default pages for this role.</span>}
        </div>

        <div className="muted rep-hint" style={{ marginTop: 12 }}>
          {fromStored
            ? 'An administrator changes these under Roles & Permissions; sign out and in to pick up a change.'
            : `No row is stored for “${roleKey}”. Saving that role once on Roles & Permissions is what makes it take effect. Until then this login runs on the built-in defaults, which are ${(DEFAULT_PERMS[roleKey] ?? DEFAULT_PERMS.engineer).length} actions.`}
        </div>
      </SectionCard>
    </>
  );
}
