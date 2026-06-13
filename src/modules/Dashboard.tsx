import { useMemo } from 'react';
import { useCollection } from '../lib/hooks';
import { C } from './collections';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart, ColumnChart } from '../components/charts/Charts';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { fmtCurrency, fmtDate, lookup, statusBadge } from '../lib/format';
import { STATUS_TONES } from './collections';

const last6Months = () => {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${m.getMonth()}`, label: m.toLocaleString('en', { month: 'short' }) });
  }
  return out;
};

export function Dashboard() {
  const parties = useCollection(C.parties);
  const products = useCollection(C.products);
  const breakdowns = useCollection(C.breakdowns);
  const pmcalls = useCollection(C.pmcalls);
  const contracts = useCollection(C.contracts);
  const invoices = useCollection(C.invoices);
  const feedback = useCollection(C.feedback);

  const openCalls = breakdowns.filter((b) => b.status !== 'Closed' && b.status !== 'Cancelled');
  const closedCalls = breakdowns.filter((b) => b.status === 'Closed');
  const overduePM = pmcalls.filter((p) => p.status === 'Overdue');

  const avgRating = useMemo(() => {
    if (feedback.length === 0) return 0;
    return feedback.reduce((s, f) => s + (Number(f.rating) || 0), 0) / feedback.length;
  }, [feedback]);

  const revenue = invoices.reduce((s, inv) => {
    const items = (inv.items as { qty: number; rate: number; gst: number }[]) ?? [];
    return s + items.reduce((a, l) => a + l.qty * l.rate * (1 + l.gst / 100), 0);
  }, 0);

  // status mix
  const statusMix = useMemo(() => {
    const counts: Record<string, number> = {};
    breakdowns.forEach((b) => {
      const s = String(b.status ?? 'Open');
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [breakdowns]);

  // calls per month
  const monthly = useMemo(() => {
    const months = last6Months();
    return months.map((m) => {
      const count = breakdowns.filter((b) => {
        const d = new Date(String(b.reportedDate));
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      }).length;
      return { label: m.label, value: count };
    });
  }, [breakdowns]);

  // product-wise call volume
  const productVolume = useMemo(() => {
    const counts: Record<string, number> = {};
    breakdowns.forEach((b) => {
      const name = lookup(C.products, b.productId, 'name');
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [breakdowns]);

  const recentCalls = [...breakdowns].reverse().slice(0, 6);

  return (
    <div>
      <PageHeader title="Service Dashboard" subtitle="Field service operations at a glance" icon="📊" />

      <KpiGrid min={210}>
        <KpiCard label="Open Calls" value={openCalls.length} tone="warning" icon="⚠️" sub={`${breakdowns.length} total`} />
        <KpiCard label="Closed Calls" value={closedCalls.length} tone="success" icon="✅"
          sub={breakdowns.length ? `${Math.round((closedCalls.length / breakdowns.length) * 100)}% closure` : '—'} />
        <KpiCard label="Overdue PM" value={overduePM.length} tone="danger" icon="🗓️" sub={`${pmcalls.length} scheduled`} />
        <KpiCard label="Active Contracts" value={contracts.filter((c) => c.status === 'Active').length} tone="info" icon="📋" />
        <KpiCard label="Avg. CSAT" value={avgRating ? avgRating.toFixed(1) + ' ★' : '—'} tone="primary" icon="⭐" sub={`${feedback.length} responses`} />
        <KpiCard label="Invoiced Revenue" value={fmtCurrency(revenue)} tone="success" icon="💳" sub={`${invoices.length} invoices`} />
        <KpiCard label="Registered Parties" value={parties.length} tone="neutral" icon="🏥" />
        <KpiCard label="Products" value={products.length} tone="neutral" icon="🩺" />
      </KpiGrid>

      <div className="dash-grid">
        <SectionCard title="Breakdown Calls — last 6 months">
          <ColumnChart data={monthly} />
        </SectionCard>
        <SectionCard title="Call Status Mix">
          {statusMix.length ? <DonutChart data={statusMix} /> : <div className="muted">No call data yet</div>}
        </SectionCard>
        <SectionCard title="Product-wise Call Volume (Top 6)">
          <BarChart data={productVolume} />
        </SectionCard>
        <SectionCard title="Recent Calls">
          <div className="list-tight">
            {recentCalls.length === 0 && <div className="muted">No calls yet</div>}
            {recentCalls.map((b) => (
              <div className="list-tight-row" key={b.id}>
                <div>
                  <b>{String(b.code)}</b> · {lookup(C.parties, b.partyId, 'name')}
                  <div className="muted" style={{ fontSize: 12 }}>{String(b.complaint ?? '').slice(0, 50)}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  {statusBadge(b.status, STATUS_TONES)}
                  <span className="muted" style={{ fontSize: 11.5 }}>{fmtDate(b.reportedDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
