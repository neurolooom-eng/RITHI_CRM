import { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { SignaturePad } from '../components/ui/SignaturePad';
import { sbMySignature, sbSaveMySignature, sbClearMySignature, supabaseConfigured } from '../lib/supabase';
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

      <MySignatureCard />

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
// MY SIGNATURE.
//
// The user's ask (2026-09-12): "Add a Provision for users to Save their
// signatures." Here rather than in Settings because Settings is
// administrator-only and this is the most personal thing in the system —
// nobody else can save it, and nobody else can read it back (0172).
//
// THE PAGE SAYS SO, in as many words. A signature is worth what its exclusivity
// is worth, and a person deciding whether to put their own mark into a computer
// is entitled to know who can get at it. It also says the other half — the part
// people would otherwise discover by being surprised: a document prints your
// signature only when YOU print it. Somebody else printing the same document
// gets a blank block to sign by hand, because the alternative is a system that
// signs documents on people's behalf.
// ---------------------------------------------------------------------------
function MySignatureCard() {
  const { user } = useAuth();
  const onDb = supabaseConfigured();
  const [ink, setInk] = useState('');
  const [nameLine, setNameLine] = useState('');
  const [titleLine, setTitleLine] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!onDb) { setLoaded(true); return; }
    void sbMySignature().then((s) => {
      setInk(s?.signature ?? '');
      setSaved(s?.signature ?? '');
      // Defaulted from the profile only when nothing has been saved: once
      // somebody has signed, the name they signed UNDER is theirs to keep, not
      // something a later profile edit rewrites under their mark.
      setNameLine(s?.name_line || (user?.fullName ?? ''));
      setTitleLine(s?.title_line || (user?.designation ?? ''));
      setLoaded(true);
    });
  }, [onDb, user?.fullName, user?.designation]);

  const dirty = ink !== saved;

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await sbSaveMySignature({ signature: ink, name_line: nameLine.trim(), title_line: titleLine.trim() });
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: /user_signatures|does not exist|schema cache/i.test(res.error ?? '')
        ? 'Saving a signature needs migration 0172_user_signatures.sql — run it in the Supabase SQL editor (apply bundle: rbac.sql).'
        : (res.error ?? 'Could not save your signature.') });
      return;
    }
    setSaved(ink);
    setMsg({ tone: 'ok', text: 'Saved. Documents you print will carry it.' });
  };

  const remove = async () => {
    setBusy(true); setMsg(null);
    const res = await sbClearMySignature();
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not remove your signature.' }); return; }
    setInk(''); setSaved('');
    setMsg({ tone: 'ok', text: 'Removed. Documents will print an empty block to sign by hand.' });
  };

  return (
    <SectionCard title="My Signature">
      <div className="muted" style={{ marginBottom: 12 }}>
        Sign once here and the documents you print carry it — the Delivery Challan,
        the Declaration and the Field Failure Report.
      </div>

      {!onDb ? (
        <div className="muted">Connect to Supabase to save a signature.</div>
      ) : !loaded ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <SignaturePad value={ink} onChange={setInk} />

          <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Name printed under it</span>
              <input className="input" value={nameLine} onChange={(e) => setNameLine(e.target.value)} />
            </label>
            <label className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Designation (optional)</span>
              <input className="input" value={titleLine} onChange={(e) => setTitleLine(e.target.value)}
                     placeholder="Service Engineer" />
            </label>
          </div>

          {saved && (
            <div style={{ marginTop: 14 }}>
              <div className="field-label">As it will print</div>
              <div className="sig-preview"><img src={saved} alt="Your saved signature" /></div>
              <div className="sig-caption">
                <b>{nameLine || '—'}</b>{titleLine ? ` · ${titleLine}` : ''}
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy || !dirty || !ink} onClick={() => void save()}>
              {busy ? 'Saving…' : dirty ? '✔ Save signature' : '✔ Saved'}
            </button>
            {saved && (
              <button className="btn" disabled={busy} onClick={() => void remove()}>🗑 Remove my signature</button>
            )}
          </div>

          {msg && (
            <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginTop: 12 }}>
              <span>{msg.text}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
            </div>
          )}

          {/* WHO CAN SEE THIS. Said plainly, because a person deciding whether
              to put their own mark into a computer is entitled to know — and
              because the second half is the part that would otherwise be
              discovered by surprise. */}
          <div className="muted rep-hint" style={{ marginTop: 14 }}>
            <b>Only you can see this signature</b> — not your manager, and not an administrator.
            An administrator can see <i>whether</i> you have saved one, never the image, and can remove
            it when somebody leaves. It is printed on a document only when <b>you</b> are the one
            printing it; anyone else gets an empty block to sign by hand.
          </div>
        </>
      )}
    </SectionCard>
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
