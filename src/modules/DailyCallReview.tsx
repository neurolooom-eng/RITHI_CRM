import { useMemo, useState } from 'react';
import { useCollection } from '../lib/hooks';
import { C, STATUS_TONES, PRIORITY_TONES } from './collections';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { DonutChart } from '../components/charts/Charts';
import { fmtDate, lookup, statusBadge, todayISO } from '../lib/format';
import type { BaseRecord } from '../lib/db';

interface ReviewRow extends BaseRecord {
  _type: string;
  _date: string;
  code: string;
  partyId: string;
  productId: string;
  engineer?: string;
  status?: string;
  priority?: string;
  detail?: string;
}

export function DailyCallReview() {
  const installations = useCollection(C.installations);
  const pmcalls = useCollection(C.pmcalls);
  const breakdowns = useCollection(C.breakdowns);
  const [date, setDate] = useState(todayISO());
  const [engineerFilter, setEngineerFilter] = useState('');

  const allRows = useMemo<ReviewRow[]>(() => {
    const map = (rows: BaseRecord[], type: string, dateKey: string, detailKey: string): ReviewRow[] =>
      rows.map((r) => ({
        ...r,
        _type: type,
        _date: String(r[dateKey] ?? '').slice(0, 10),
        code: String(r.code ?? ''),
        partyId: String(r.partyId ?? ''),
        productId: String(r.productId ?? ''),
        engineer: r.engineer as string,
        status: r.status as string,
        priority: r.priority as string,
        detail: String(r[detailKey] ?? ''),
      }));
    return [
      ...map(breakdowns, 'Breakdown', 'reportedDate', 'complaint'),
      ...map(installations, 'Installation', 'callDate', 'installNotes'),
      ...map(pmcalls, 'Preventive', 'dueDate', 'checklist'),
    ];
  }, [installations, pmcalls, breakdowns]);

  const engineers = useMemo(
    () => [...new Set(allRows.map((r) => r.engineer).filter(Boolean))] as string[],
    [allRows],
  );

  const dayRows = useMemo(() => {
    let r = allRows.filter((x) => x._date === date);
    if (engineerFilter) r = r.filter((x) => x.engineer === engineerFilter);
    return r;
  }, [allRows, date, engineerFilter]);

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    dayRows.forEach((r) => {
      const s = r.status ?? 'Open';
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [dayRows]);

  const columns: Column<ReviewRow>[] = [
    { key: '_type', header: 'Type', width: 110, wrap: false, render: (r) => <span className="badge badge-neutral">{r._type}</span> },
    { key: 'code', header: 'Call No.', width: 100, wrap: false },
    { key: 'partyId', header: 'Customer', width: 180, render: (r) => lookup(C.parties, r.partyId, 'name') },
    { key: 'productId', header: 'Product', width: 170, render: (r) => lookup(C.products, r.productId, 'name') },
    { key: 'detail', header: 'Details', width: 220 },
    { key: 'engineer', header: 'Engineer', width: 130, render: (r) => r.engineer || <span className="muted">Unassigned</span> },
    { key: 'priority', header: 'Priority', width: 100, wrap: false, render: (r) => (r.priority ? statusBadge(r.priority, PRIORITY_TONES) : '—') },
    { key: 'status', header: 'Status', width: 120, wrap: false, render: (r) => statusBadge(r.status, STATUS_TONES) },
  ];

  const open = dayRows.filter((r) => r.status !== 'Closed' && r.status !== 'Completed' && r.status !== 'Cancelled').length;
  const closed = dayRows.filter((r) => r.status === 'Closed' || r.status === 'Completed').length;

  return (
    <div>
      <PageHeader title="Daily Call Review" subtitle="Consolidated view of all calls for a chosen day" icon="📅" />

      <div className="filter-bar">
        <div>
          <label className="field-label">Review Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Engineer</label>
          <select className="select" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)}>
            <option value="">All engineers</option>
            {engineers.map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <KpiGrid min={180}>
        <KpiCard label="Total Calls" value={dayRows.length} tone="primary" icon="📞" />
        <KpiCard label="Open / In-Progress" value={open} tone="warning" />
        <KpiCard label="Closed / Completed" value={closed} tone="success" />
        <KpiCard label="Breakdowns" value={dayRows.filter((r) => r._type === 'Breakdown').length} tone="danger" />
        <KpiCard label="PM Visits" value={dayRows.filter((r) => r._type === 'Preventive').length} tone="info" />
      </KpiGrid>

      <div className="dash-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <SectionCard title={`Calls on ${fmtDate(date)}`}>
          <DataTable<ReviewRow>
            columns={columns}
            rows={dayRows}
            getRowId={(r) => r.id}
            storageKey="daily-review"
            rowsBeforeScroll={8}
            emptyText="No calls logged for this date."
          />
        </SectionCard>
        <SectionCard title="Status Breakdown">
          {byStatus.length ? <DonutChart data={byStatus} /> : <div className="muted">No calls</div>}
        </SectionCard>
      </div>
    </div>
  );
}
