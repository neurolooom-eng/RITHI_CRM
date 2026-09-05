import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard, FacetChips } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart } from '../components/charts/Charts';
import { DataTable, type Column } from '../components/table/DataTable';
import {
  sbFailureRates, sbFailureModes, sbSpareUsage, supabaseConfigured,
  type FailureRate, type FailureMode, type SpareUsage,
} from '../lib/supabase';
import { useAccessScope, scopeLabel } from '../lib/access';
import { timeAgo } from '../lib/format';
import './fieldcalls.css';

// ===========================================================================
// KPI & FAILURE ANALYSIS — from the record, not from a spreadsheet.
//
// Three questions, and the reason each is asked THIS way:
//
//   FAILURE RATE is per machine in the field, not a call count. A product with
//   1,200 machines should generate more calls than one with 40, so a bare count
//   ranks the popular product as the unreliable one. The denominator is the
//   install base, which the Product Register already holds.
//
//   SPARE USE BY COVER is what parts cost us under warranty, under CMC, under
//   AMC and out of guarantee. The cover is a fact about the CALL and the parts
//   are on the consumption, so the join is the whole answer — and it is the
//   figure a contract is priced from.
//
//   SPARE USE BY REGION is the same figure per region, so a region consuming
//   twice its share can be looked at rather than argued about.
//
// Every figure is aggregated by the database (0101) and every view is
// security_invoker: an engineer's KPIs are their own calls, a manager's are
// their team's. That matters for how a rate READS — see the note on the rate
// table, which says so on the screen rather than leaving it to be discovered.
// ===========================================================================

const num = (n: unknown) => Number(n ?? 0);
const fmt = (n: number) => n.toLocaleString();

type RateRow = FailureRate & { id: string };
type ModeRow = FailureMode & { id: string };

const RATE_COLUMNS: Column<RateRow>[] = [
  { key: 'product', header: 'Product', width: 200 },
  { key: 'machines', header: 'Machines in the field', width: 150, wrap: false, render: (r) => fmt(num(r.machines)) },
  { key: 'calls_12m', header: 'Calls (12 months)', width: 140, wrap: false, render: (r) => fmt(num(r.calls_12m)) },
  {
    key: 'per_100_machines', header: 'Per 100 machines', width: 150, wrap: false,
    render: (r) => (r.per_100_machines == null
      ? <span className="muted" title="No machine of this product is in the Product Register, so there is nothing to divide by">—</span>
      : <b>{num(r.per_100_machines).toFixed(1)}</b>),
  },
  { key: 'calls_open', header: 'Still open', width: 110, wrap: false, render: (r) => fmt(num(r.calls_open)) },
  { key: 'calls_total', header: 'Calls (all time)', width: 130, wrap: false, render: (r) => fmt(num(r.calls_total)) },
];

const MODE_COLUMNS: Column<ModeRow>[] = [
  { key: 'complaint', header: 'Standard complaint', width: 340 },
  { key: 'product', header: 'Product', width: 180 },
  { key: 'calls_12m', header: 'Calls (12 months)', width: 140, wrap: false, render: (r) => fmt(num(r.calls_12m)) },
  { key: 'calls', header: 'Calls (all time)', width: 130, wrap: false, render: (r) => fmt(num(r.calls)) },
];

export function KpiAnalytics() {
  const navigate = useNavigate();
  const scope = useAccessScope();
  const [rates, setRates] = useState<FailureRate[]>([]);
  const [modes, setModes] = useState<FailureMode[]>([]);
  const [usage, setUsage] = useState<SpareUsage[]>([]);
  const [product, setProduct] = useState('');
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) { setMsg('Connect the database in Settings to build the KPIs.'); return; }
    setBusy(true); setMsg('');
    try {
      const [r, m, u] = await Promise.all([sbFailureRates(), sbFailureModes(), sbSpareUsage()]);
      setRates(r); setModes(m); setUsage(u); setLastSync(Date.now());
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      setMsg(/failure_rate_by_product|spare_usage|does not exist|schema cache/i.test(t)
        ? 'These KPIs need migration 0101_kpi_views.sql — run supabase/apply/performance.sql in the SQL editor.'
        : `Could not build the KPIs: ${t}`);
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  // ---- spare use, sliced by whatever the chips are set to -------------------
  const usageFiltered = useMemo(
    () => usage.filter((u) => (!product || u.product === product) && (!region || u.region === region)),
    [usage, product, region],
  );
  const roll = (key: 'cover' | 'region' | 'product') => {
    const by = new Map<string, { qty: number; calls: number; lines: number }>();
    usageFiltered.forEach((u) => {
      const k = String(u[key] ?? '') || '—';
      const had = by.get(k) ?? { qty: 0, calls: 0, lines: 0 };
      had.qty += num(u.qty); had.calls += num(u.calls); had.lines += num(u.lines);
      by.set(k, had);
    });
    return [...by].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.qty - a.qty);
  };
  const byCover = useMemo(() => roll('cover'), [usageFiltered]);
  const byRegion = useMemo(() => roll('region'), [usageFiltered]);
  const byProduct = useMemo(() => roll('product'), [usageFiltered]);

  const totalQty = usageFiltered.reduce((t, u) => t + num(u.qty), 0);
  const totalCalls = usageFiltered.reduce((t, u) => t + num(u.calls), 0);
  const partsPerCall = totalCalls ? totalQty / totalCalls : 0;

  // Out of guarantee is the one that is paid for, so it is worth its own tile.
  const ogpQty = byCover.find((c) => /ogp|out of/i.test(c.label))?.qty ?? 0;
  const warrantyQty = byCover.filter((c) => /warr|wgp/i.test(c.label)).reduce((t, c) => t + c.qty, 0);

  // ---- failure rate ---------------------------------------------------------
  const rateRows = useMemo<RateRow[]>(
    () => rates
      .filter((r) => r.product && (!product || r.product === product))
      .map((r) => ({ ...r, id: r.product }))
      .sort((a, b) => (num(b.per_100_machines) - num(a.per_100_machines)) || num(b.calls_12m) - num(a.calls_12m)),
    [rates, product],
  );
  const modeRows = useMemo<ModeRow[]>(
    () => modes
      .filter((m) => !product || m.product === product)
      .map((m, i) => ({ ...m, id: `${m.product}|${m.complaint}|${i}` }))
      .sort((a, b) => num(b.calls_12m) - num(a.calls_12m) || num(b.calls) - num(a.calls)),
    [modes, product],
  );
  const fleet = rates.reduce((t, r) => t + num(r.machines), 0);
  const calls12 = rateRows.reduce((t, r) => t + num(r.calls_12m), 0);
  const fleetRate = fleet ? (rates.reduce((t, r) => t + num(r.calls_12m), 0) * 100) / fleet : 0;

  const productChips = useMemo(() => {
    const by = new Map<string, number>();
    rates.forEach((r) => { if (r.product) by.set(r.product, num(r.calls_12m)); });
    return [...by].map(([key, count]) => ({ key, count }));
  }, [rates]);
  const regionChips = useMemo(() => {
    const by = new Map<string, number>();
    usage.forEach((u) => by.set(u.region, (by.get(u.region) ?? 0) + num(u.qty)));
    return [...by].map(([key, count]) => ({ key, count }));
  }, [usage]);

  return (
    <div>
      <PageHeader
        title="KPI & Failure Analysis"
        subtitle="How often each product fails per machine in the field, and what the parts are spent on."
        icon="📈"
        status={
          <>
            <span className={`conn-dot ${scope.all ? 'conn-on' : 'conn-off'}`}>{scopeLabel(scope)}</span>
            {!!lastSync && <span className="conn-dot conn-off">⟳ synced {timeAgo(lastSync)}</span>}
          </>
        }
        actions={<button className="btn btn-sm" disabled={busy} onClick={() => void load()}>{busy ? '…' : '↻ Refresh'}</button>}
      />

      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}

      <KpiGrid min={200}>
        <KpiCard label="Machines in the field" value={fmt(fleet)} tone="neutral" icon="🏭" sub="the Product Register" />
        <KpiCard label="Calls · 12 months" value={fmt(calls12)} tone="primary" icon="📞" sub={product || 'every product'} />
        <KpiCard label="Failure rate" value={fleetRate ? fleetRate.toFixed(1) : '—'} tone={fleetRate > 100 ? 'danger' : fleetRate > 50 ? 'warning' : 'success'} icon="📉" sub="calls per 100 machines / year" />
        <KpiCard label="Spares consumed" value={fmt(totalQty)} tone="info" icon="📦" sub={`${fmt(totalCalls)} calls`} />
        <KpiCard label="Parts per call" value={partsPerCall ? partsPerCall.toFixed(2) : '—'} tone="neutral" icon="🔩" />
        <KpiCard label="Out of guarantee" value={fmt(ogpQty)} tone="warning" icon="💰" sub="parts on OGP calls" />
        <KpiCard label="Under warranty" value={fmt(warrantyQty)} tone="neutral" icon="🛡️" sub="parts we carry" />
      </KpiGrid>

      {/* Both chips narrow EVERYTHING below them, the rate table included, so a
          question asked of one panel is answered by all of them at once. */}
      {/* `more={false}` deliberately: these are not a page of rows. The database
          computes the whole aggregate (0101's KPI views), so every count here is
          the complete figure and a "+" would be a lie in the other direction. */}
      <FacetChips options={productChips} value={product} onChange={setProduct} allLabel="All products" max={10} more={false} />
      <FacetChips options={regionChips} value={region} onChange={setRegion} allLabel="All regions" max={10} more={false} />

      <div className="dash-grid">
        <SectionCard title="Spare use by cover">
          {byCover.length
            ? <DonutChart data={byCover.map((c) => ({ label: c.label, value: c.qty }))} />
            : <div className="muted">No consumption recorded for this slice.</div>}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Parts consumed, counted against the cover on the call they were fitted to. What sits under
            <b> OGP</b> is billed; what sits under warranty, CMC and AMC is carried.
          </p>
        </SectionCard>

        <SectionCard title="Spare use by region">
          {byRegion.length
            ? <BarChart data={byRegion.map((r) => ({ label: r.label, value: r.qty }))} />
            : <div className="muted">No consumption recorded for this slice.</div>}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            The region is the engineer&rsquo;s, from the User Master. A call worked by somebody with no region
            recorded there counts under <b>No region</b> rather than being dropped.
          </p>
        </SectionCard>

        <SectionCard title="Spare use by product">
          {byProduct.length
            ? <BarChart data={byProduct.slice(0, 8).map((p) => ({ label: p.label, value: p.qty }))} />
            : <div className="muted">No consumption recorded for this slice.</div>}
        </SectionCard>

        <SectionCard title="Region × cover">
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 460 }}>
              <thead><tr><th>Region</th><th>Cover</th><th style={{ textAlign: 'right' }}>Parts</th><th style={{ textAlign: 'right' }}>Calls</th></tr></thead>
              <tbody>
                {(() => {
                  const by = new Map<string, { qty: number; calls: number }>();
                  usageFiltered.forEach((u) => {
                    const k = `${u.region}||${u.cover}`;
                    const had = by.get(k) ?? { qty: 0, calls: 0 };
                    had.qty += num(u.qty); had.calls += num(u.calls);
                    by.set(k, had);
                  });
                  const rows = [...by].map(([k, v]) => ({ region: k.split('||')[0], cover: k.split('||')[1], ...v }))
                    .sort((a, b) => b.qty - a.qty).slice(0, 25);
                  if (!rows.length) return <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>;
                  return rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.region}</td><td>{r.cover}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.qty)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.calls)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Failure rate by product">
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          Calls in the last twelve months per 100 machines of that product in the field.
          {!scope.all && (
            <> <b>You are seeing your own calls against the whole fleet</b>, so read these as your share
              rather than as the product&rsquo;s rate — the rates are comparable between products only for
              somebody who can see every call.</>
          )}
          {' '}A product with no machines in the Product Register shows <b>—</b>: there is nothing to divide by,
          and a rate invented from a missing denominator is worse than no rate.
        </p>
        <DataTable<RateRow>
          columns={RATE_COLUMNS}
          rows={rateRows}
          getRowId={(r) => r.id}
          storageKey="kpiFailureRate"
          rowsBeforeScroll={10}
          dense
          onRowClick={(r) => setProduct(product === r.product ? '' : r.product)}
          emptyText={busy ? 'Building…' : 'No calls and no machines to compare.'}
        />
      </SectionCard>

      <SectionCard title={product ? `How ${product} fails` : 'How products fail'}>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          By standard complaint — the field the desk chooses from a controlled list, so it is the one thing in
          a call that groups reliably across thousands of them. Click a row to open the calls behind it.
        </p>
        <DataTable<ModeRow>
          columns={MODE_COLUMNS}
          rows={modeRows.slice(0, 200)}
          getRowId={(r) => r.id}
          storageKey="kpiFailureModes"
          rowsBeforeScroll={10}
          dense
          onRowClick={(r) => navigate('/field-calls', { state: { search: { q: r.complaint } } })}
          emptyText={busy ? 'Building…' : 'No calls to analyse yet.'}
        />
      </SectionCard>
    </div>
  );
}
