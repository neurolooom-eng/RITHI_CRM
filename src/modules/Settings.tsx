import { useTheme } from '../theme/ThemeProvider';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useCollection } from '../lib/hooks';
import { TemplatePlaceholder } from './TemplatePlaceholder';
import { useAuth } from '../lib/auth';

export function Settings() {
  const { theme, themes, setThemeId } = useTheme();
  const { can } = useAuth();
  const templates = useCollection('templates');

  const resetData = () => {
    if (!confirm('This clears ALL demo data (parties, products, calls, etc.) but keeps users & theme. Continue?')) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rithi.db.') && !k.endsWith('users'))
      .forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, design-system defaults & templates" icon="⚙️" />

      <SectionCard title="Color Theme">
        <div className="muted" style={{ marginBottom: 12 }}>
          Pick a theme — the whole application re-skins instantly. Light & dark options included.
        </div>
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

      {can('manage-users') && (
        <>
          <div style={{ height: 16 }} />
          <SectionCard title="Data">
            <div className="row">
              <div className="muted">Reset all demo records (keeps users & theme).</div>
              <div className="spacer" />
              <button className="btn btn-danger" onClick={resetData}>Reset Demo Data</button>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
