import { PageHeader, SectionCard } from '../components/ui/ui';
import { useCollection } from '../lib/hooks';
import { TemplatePlaceholder } from './TemplatePlaceholder';
import { SheetConnection } from './SheetConnection';
import { DbConnection } from './DbConnection';
import { useAuth } from '../lib/auth';

// ===========================================================================
// SETTINGS — administrator-only: database & sheet connections, design-system
// reference, document templates and the data reset. A user's own account,
// password and theme live on the Profile page instead.
// ===========================================================================

export function Settings() {
  const { can } = useAuth();
  const templates = useCollection('templates');

  const resetData = () => {
    if (!confirm('This clears ALL demo data (parties, products, calls, etc.) but keeps users & theme. Continue?')) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rithi.db.') && !k.endsWith('users'))
      .forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  // TWO RIGHTS. `manage-users` runs this screen; `admin.view` opens it without
  // being able to change anything (Technical Support) -- which is the screen a
  // support login most needs, since what is connected is the first question
  // asked when something is not loading. Nothing here is a secret it is being
  // trusted with: the anon key is public by design, and the connection is this
  // browser's own setting.
  const mayManage = can('manage-users');
  const mayOpen = mayManage || can('admin.view');

  // Connection details, keys and templates are sensitive — admins only.
  if (!mayOpen) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Administrator settings" icon="⚙️" />
        <SectionCard title="Restricted">
          <div className="muted">
            These settings are for administrators. Manage your own account, password and theme on the <b>Profile</b> page.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connections, design-system defaults & templates" icon="⚙️" />

      {!mayManage && (
        <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 14 }}>
          <span>You can see how this app is set up, but not change it.</span>
        </div>
      )}

      <DbConnection readOnly={!mayManage} />

      <div style={{ height: 16 }} />

      <SheetConnection readOnly={!mayManage} />

      <div style={{ height: 16 }} />

      <SectionCard title="Design System Defaults">
        <div className="settings-defaults">
          <div>
            <b>Table System</b>
            <ul>
              <li>Text-wrap every cell (default on)</li>
              <li>Drag column headers to rearrange</li>
              <li>Drag right edge of a header to resize a column</li>
              <li>Sticky header row while scrolling</li>
              <li>10 rows visible before the body scrolls (configurable)</li>
              <li>Per-table layout (order + widths) is remembered</li>
            </ul>
          </div>
          <div>
            <b>Form System</b>
            <ul>
              <li>Schema-driven, 2-column responsive grid</li>
              <li>Required markers + inline validation on submit</li>
              <li>Section grouping, currency/date/select field types</li>
            </ul>
          </div>
          <div>
            <b>KPI & Dashboard</b>
            <ul>
              <li>Tone-coded KPI cards with trend & sparkline support</li>
              <li>Dependency-free bar / column / donut charts</li>
              <li>Reused across Dashboard, Daily Review, FFR & KPI screens</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      {/* Placeholders that are SAVED when they are filled, so they follow the
          same rule as everything else on this screen: visible to a read-only
          login, editable only by somebody who may change the setup. */}
      {mayManage && (
      <SectionCard title="Document Templates">
        <div className="muted" style={{ marginBottom: 12 }}>
          Placeholders for your official templates. {templates.length} saved.
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <TemplatePlaceholder templateKey="quotes-print" title="Quotation Template" />
          <TemplatePlaceholder templateKey="invoices-print" title="Invoice Template" />
          <TemplatePlaceholder templateKey="field-failure-report" title="Field Failure Report Template" />
          <TemplatePlaceholder templateKey="service-report" title="Service / Call Closure Report Template" />
          <TemplatePlaceholder templateKey="pm-checklist" title="PM Checklist Template" />
        </div>
      </SectionCard>
      )}

      <div style={{ height: 16 }} />

      {mayManage && (
        <SectionCard title="Data">
          <div className="row">
            <div className="muted">Reset all demo records (keeps users & theme).</div>
            <div className="spacer" />
            <button className="btn btn-danger" onClick={resetData}>Reset Demo Data</button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
