import { useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { ConsumptionReport } from './ConsumptionReport';
import { KpiExport } from './KpiExport';
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
// ===========================================================================

type Tab = 'consumption' | 'kpi';

const REPORTS: { key: Tab; label: string; icon: string; blurb: string }[] = [
  { key: 'consumption', label: 'Consumption Report', icon: '🔩',
    blurb: 'Every spare booked, with its call around it — filtered and with the columns you choose.' },
  { key: 'kpi', label: 'KPI Export', icon: '📈',
    blurb: 'The KPI workbook’s Field_INST tab, in its own columns and order.' },
];

export function ReportsHub() {
  const [tab, setTab] = useState<Tab>('consumption');
  const current = REPORTS.find((r) => r.key === tab);

  return (
    <div>
      <PageHeader
        title="Reports" icon="📄"
        subtitle={current?.blurb ?? 'Every export, in one place.'}
      />
      <div className="dccr-tabs" role="tablist">
        {REPORTS.map((r) => (
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
      {tab === 'consumption' ? <ConsumptionReport /> : <KpiExport />}
    </div>
  );
}
