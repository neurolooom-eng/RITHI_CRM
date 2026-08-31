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

  // Connection details, keys and templates are sensitive — admins only.
  if (!can('manage-users')) {
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

      <DbConnection />

      <div style={{ height: 16 }} />

      <SheetConnection />

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

      <div style={{ height: 16 }} />

      <SectionCard title="Data">
        <div className="row">
          <div className="muted">Reset all demo records (keeps users & theme).</div>
          <div className="spacer" />
          <button className="btn btn-danger" onClick={resetData}>Reset Demo Data</button>
        </div>
      </SectionCard>
    </div>
  );
}
