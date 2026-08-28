import { PageHeader, SectionCard } from '../components/ui/ui';
import { fmtDate, fmtDateTime } from '../lib/format';
import { CHANGELOG } from '../lib/changelog';
import './versionhistory.css';

// ===========================================================================
// VERSION HISTORY — in-app changelog. Shows the current build (from the Vite
// build-time metadata) and a table of released changes.
// ===========================================================================

export function VersionHistory() {
  return (
    <div>
      <PageHeader title="Version History" subtitle="Build info and the log of changes to this app." icon="🗂️" />

      <SectionCard title="Current build">
        <div className="settings-defaults" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div><b>Version</b><div className="muted">v{__APP_VERSION__}</div></div>
          <div><b>Build number</b><div className="muted">#{__BUILD_NUMBER__}</div></div>
          <div><b>Build ID</b><div className="muted">{__BUILD_ID__}</div></div>
          <div><b>Built</b><div className="muted">{fmtDateTime(__BUILD_TIME__)}</div></div>
        </div>
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard title="Change log">
        <div style={{ overflowX: 'auto' }}>
          <table className="vh-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date</th>
                <th>Summary</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {CHANGELOG.map((e) => (
                <tr key={e.version}>
                  <td><span className="badge badge-primary">v{e.version}</span></td>
                  <td className="vh-nowrap">{fmtDate(e.date)}</td>
                  <td><b>{e.title}</b></td>
                  <td>
                    <ul className="vh-list">
                      {e.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
