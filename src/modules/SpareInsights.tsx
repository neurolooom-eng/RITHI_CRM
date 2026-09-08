import { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, ColumnChart, DonutChart } from '../components/charts/Charts';
import { spareInsights, supabaseConfigured, type SpareInsight } from '../lib/supabase';
import './dccr.css';

// ===========================================================================
// SPARE INSIGHTS — what is being consumed, against what cover, into which
// products, and how much of it is consumable rather than spare.
//
// The user, 2026-09-08: "Give me an Insight on the Spares Consumed - Default
// the Consumption date to 1Jan2026 to Today - Selectable. Spares Consumed -
// Highest Consumption ; Same against Product Item Status ; Then by Products
// (Count of Spares Consumed) -- Also Categorize them as Consumable and Spare".
//
// EVERY FIGURE IS COMPUTED IN THE DATABASE, in one call (0148). Five separate
// queries would be five chances for a total to disagree with the rows beneath
// it, and a browser-side aggregate would report on the first page of a register
// that pages — which is how a dashboard ends up confidently wrong.
//
// THE UNCLASSIFIED COUNT IS ON THE SCREEN, not hidden. 86% of the Item Master
// has no Spare/Consumable value, so a clean-looking split would be a fiction
// built from the 14% that does. The banner states how much of the window is
// unclassified, because the honest reading of this chart depends on it, and
// because it turns an invisible gap into a job somebody can finish.
// ===========================================================================

// 1 Jan 2026 to today, per the ask — and selectable.
const DEFAULT_FROM = '2026-01-01';
const todayISO = () => new Date().toISOString().slice(0, 10);

const n = (v: number) => v.toLocaleString();

export function SpareInsights() {
  const live = supabaseConfigured();
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<SpareInsight | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!live) return;
    setBusy(true); setErr('');
    spareInsights(from, to)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [live, from, to]);
  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const t = data?.total;
  // The share of this window nobody has classified. Rounded, but never rounded
  // to zero while any of it is unclassified — "0%" and "none" are different.
  const unclassPct = t && t.qty > 0 ? Math.max(1, Math.round((t.unclassified_qty / t.qty) * 100)) : 0;

  return (
    <div>
      <PageHeader
        title="Spare Insights" icon="🔎"
        subtitle="What is being consumed, under which cover, into which products — and how much of it is consumable rather than spare."
        onRefresh={load} refreshing={busy}
      />

      {!live && (
        <div className="sheet-banner sheet-banner-error"><span>Not connected to the database.</span></div>
      )}
      {err && (
        <div className="sheet-banner sheet-banner-error">
          <span>{err.includes('spare_insights') ? `${err} — run supabase/apply/performance.sql.` : err}</span>
        </div>
      )}

      <SectionCard title="Consumption window">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>From
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>To
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-sm" onClick={() => { setFrom(DEFAULT_FROM); setTo(todayISO()); }}>
            This year
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Dated by when the consumption was <b>booked</b>. A voided line counts as nothing, because it is.
          </span>
        </div>
      </SectionCard>

      <div style={{ height: 14 }} />

      <KpiGrid>
        <KpiCard label="Spares consumed" value={t ? n(t.qty) : '—'} icon="🔩" tone="primary"
                 sub={t ? `${n(t.lines)} lines` : ''} />
        <KpiCard label="Distinct parts" value={t ? n(t.parts) : '—'} icon="🧩" tone="info" />
        <KpiCard label="Calls involved" value={t ? n(t.calls) : '—'} icon="📞" tone="success" />
        <KpiCard label="Unclassified" value={t ? `${unclassPct}%` : '—'} icon="❓"
                 tone={unclassPct > 20 ? 'warning' : 'neutral'}
                 sub={t ? `${n(t.unclassified_qty)} of ${n(t.qty)}` : ''} />
      </KpiGrid>

      {t && t.unclassified_qty > 0 && (
        <div className="sheet-banner sheet-banner-info" style={{ marginTop: 12 }}>
          <span>
            <b>{n(t.unclassified_qty)}</b> of {n(t.qty)} consumed ({unclassPct}%) is on parts nobody has
            marked <b>Consumable</b> or <b>Spare</b>. The split below is honest about that rather than
            dividing it up — set the category on <b>Part Master</b>, or load it from the Item Master file,
            and this number falls.
          </span>
        </div>
      )}

      <div style={{ height: 14 }} />

      <div className="dccr-grid2">
        <SectionCard title="Consumable or spare">
          {data?.by_category?.length ? (
            <>
              <DonutChart data={data.by_category.map((c) => ({ label: c.category, value: c.qty }))} />
              <table className="assoc-table" style={{ marginTop: 10 }}>
                <thead><tr><th>Category</th><th>Qty</th><th>Lines</th><th>Parts</th></tr></thead>
                <tbody>
                  {data.by_category.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td><td>{n(c.qty)}</td><td>{n(c.lines)}</td><td>{n(c.parts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <p className="muted" style={{ fontSize: 13 }}>{busy ? 'Reading…' : 'Nothing consumed in this window.'}</p>}
        </SectionCard>

        <SectionCard title="Against the cover it was fitted under">
          {data?.by_cover?.length ? (
            <>
              <BarChart data={data.by_cover.map((c) => ({ label: c.cover, value: c.qty }))} />
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                The cover is the CALL's item status — what the machine was under when the part went in, which
                is what decides whether it was billed.
              </p>
            </>
          ) : <p className="muted" style={{ fontSize: 13 }}>{busy ? 'Reading…' : 'Nothing to show.'}</p>}
        </SectionCard>
      </div>

      <div style={{ height: 14 }} />

      <SectionCard title="Highest consumption — the parts">
        {data?.by_part?.length ? (
          <>
            <BarChart data={data.by_part.slice(0, 12).map((p) => ({ label: `${p.part_code} · ${p.part_name}`.slice(0, 46), value: p.qty }))} />
            <div className="assoc-scroll" style={{ marginTop: 10 }}>
              <table className="assoc-table">
                <thead><tr><th>#</th><th>Part Code</th><th>Part name</th><th>Category</th><th>Qty</th><th>Calls</th></tr></thead>
                <tbody>
                  {data.by_part.map((p, i) => (
                    <tr key={p.part_code}>
                      <td>{i + 1}</td>
                      <td>{p.part_code}</td>
                      <td>{p.part_name}</td>
                      <td>{p.category}</td>
                      <td>{n(p.qty)}</td>
                      <td>{n(p.calls)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>The twenty-five biggest consumers in this window.</p>
          </>
        ) : <p className="muted" style={{ fontSize: 13 }}>{busy ? 'Reading…' : 'Nothing consumed in this window.'}</p>}
      </SectionCard>

      <div style={{ height: 14 }} />

      <SectionCard title="By product">
        {data?.by_product?.length ? (
          <>
            <BarChart data={data.by_product.slice(0, 12).map((p) => ({ label: p.product, value: p.qty }))} />
            <div className="assoc-scroll" style={{ marginTop: 10 }}>
              <table className="assoc-table">
                <thead><tr><th>Product</th><th>Qty consumed</th><th>Lines</th><th>Distinct parts</th><th>Calls</th></tr></thead>
                <tbody>
                  {data.by_product.map((p) => (
                    <tr key={p.product}>
                      <td>{p.product}</td><td>{n(p.qty)}</td><td>{n(p.lines)}</td>
                      <td>{n(p.parts)}</td><td>{n(p.calls)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="muted" style={{ fontSize: 13 }}>{busy ? 'Reading…' : 'Nothing to show.'}</p>}
      </SectionCard>

      {data?.by_month && data.by_month.length > 1 && (
        <>
          <div style={{ height: 14 }} />
          <SectionCard title="Across the window">
            <ColumnChart data={data.by_month.map((m) => ({ label: m.month, value: m.qty }))} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
