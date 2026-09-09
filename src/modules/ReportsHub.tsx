import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/ui';
import { ConsumptionReport } from './ConsumptionReport';
import { KpiExport } from './KpiExport';
import { UnusedSpareReport } from './UnusedSpareReport';
import { useAuth } from '../lib/auth';
import './dccr.css';

// ===========================================================================
// REPORTS — one place every export is taken from.
//
// The user, 2026-09-08: "there has to be a separate tab called as Reports.
// 1. Consumption Report 2. KPI export. and more to come."
//
// The last clause is the design brief. Until now an export lived on whichever
// screen prompted it -- the KPI workbook was on KPI & Failure Analysis, then on
// Objective, and the consumption report had been put on Visit Reports -- so
// finding one meant remembering which conversation it came out of. They collect
// here instead, and the next one is an entry in REPORTS below rather than a
// decision about which page it belongs to.
//
// NOT the same screen as Visit Reports / Service Reports. That one is a
// REGISTER: rows to look through, search and open. This is a place you leave
// with a file. Keeping them apart is why the tab exists at all.
//
// ONE TAB IS MOUNTED AT A TIME, not hidden with CSS. Each of these counts rows
// against the database as it loads, and a hidden tab doing that is work nobody
// asked for on a screen nobody is looking at.
//
// A REPORT AT A TIME, FOR ACCESS TOO (the user, 2026-09-09: "in Reports also i
// need to be able to give Access at a Sub Page level"). Each report has its own
// `mod:/exports/<key>`, inheriting from `mod:/exports`, so the tab strip shows
// only what this role may open. The URL is checked as well as the strip: a
// hidden tab that still opens when somebody pastes the link is not a
// permission, it is a suggestion.
// ===========================================================================

type Tab = 'consumption' | 'kpi' | 'unused';

const REPORTS: { key: Tab; label: string; icon: string; blurb: string }[] = [
  { key: 'consumption', label: 'Consumption Report', icon: '🔩',
    blurb: 'Every spare booked, with its call around it — filtered and with the columns you choose.' },
  { key: 'kpi', label: 'KPI Export', icon: '📈',
    blurb: 'The KPI workbook’s Field_INST tab, in its own columns and order.' },
  { key: 'unused', label: 'Not Consumed Against this Call', icon: '🚩',
    blurb: 'Spares that reached the engineer and were never booked against the call they were sent for.' },
];

const isTab = (v: string | undefined): v is Tab => REPORTS.some((r) => r.key === v);

export function ReportsHub() {
  // THE TAB IS IN THE URL, so the menu can link straight to a report and a
  // reader can send somebody "the consumption report" rather than "Reports,
  // then the second tab". An unknown tab falls back to the first rather than
  // rendering nothing — a mistyped link should still land on the screen.
  const { tab: param } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  // The reports THIS role may open. `can` falls back to the parent, so a role
  // holding `mod:/exports` still gets all of them.
  const allowed = REPORTS.filter((r) => can(`mod:/exports/${r.key}`));
  const first = allowed[0]?.key;

  const asked: Tab | undefined = isTab(param) ? param : undefined;
  const permitted = asked && allowed.some((r) => r.key === asked);
  const tab = permitted ? asked : first;
  const current = REPORTS.find((r) => r.key === tab);
  const setTab = (k: Tab) => navigate(`/exports/${k}`);

  // A bare /exports names no report, and so does a link to one this role may
  // not open: both land on the first report it CAN open, so the menu entry
  // lights up and the address is shareable. When it may open none, the address
  // is left alone and the notice below is what the screen says.
  useEffect(() => {
    if (!first) return;
    if (!asked || !permitted) navigate(`/exports/${first}`, { replace: true });
  }, [asked, permitted, first, navigate]);

  if (!first) {
    return (
      <div>
        <PageHeader title="Reports" icon="📄" subtitle="Every export, in one place." />
        <div className="sheet-banner sheet-banner-error">
          <span>No report is open to your role. An administrator grants these one by one under Roles &amp; Permissions → Reports.</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports" icon="📄"
        subtitle={current?.blurb ?? 'Every export, in one place.'}
      />
      <div className="dccr-tabs" role="tablist">
        {allowed.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={tab === r.key}
            className={`dccr-tab${tab === r.key ? ' is-on' : ''}`}
            onClick={() => setTab(r.key)}
          >
            <span aria-hidden>{r.icon}</span> {r.label}
          </button>
        ))}
      </div>
      {tab === 'consumption' ? <ConsumptionReport />
        : tab === 'kpi' ? <KpiExport />
        : <UnusedSpareReport />}
    </div>
  );
}
