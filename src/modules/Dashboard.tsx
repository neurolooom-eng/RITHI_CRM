import { useEffect, useMemo, useState } from 'react';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart, ColumnChart } from '../components/charts/Charts';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { listFieldCalls, listPending, dataConfigured } from '../lib/sheets';
import { listSlaRules, supabaseConfigured } from '../lib/supabase';
import { allowsAllottee, scopeLabel, useAccessScope } from '../lib/access';
import { evaluateCallSla, DEFAULT_SLA_RULES, slaTone, slaLabel, slaWhen, type SlaRule } from '../lib/sla';
import { fmtLongDate } from '../lib/format';

// ===========================================================================
// SERVICE DASHBOARD — computed from the live Field + Installation call data
// (role-scoped: engineers see their own, RMs their team, admins all).
// ===========================================================================

type Rec = Record<string, unknown>;
const g = (r: Rec, k: string) => String(r[k] ?? '');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function parseSheetDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})/); // e.g. 24-October-2025
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()); if (mo >= 0) return new Date(+m[3], mo, +m[1]); }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const last6Months = () => {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${m.getMonth()}`, label: m.toLocaleString('en', { month: 'short' }) });
  }
  return out;
};

const topCounts = (rows: Rec[], key: string, n = 6) => {
  const c: Record<string, number> = {};
  rows.forEach((r) => { const v = g(r, key).trim(); if (v) c[v] = (c[v] ?? 0) + 1; });
  return Object.entries(c).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);
};

export function Dashboard() {
  const scope = useAccessScope();
  const [field, setField] = useState<Rec[]>([]);
  const [inst, setInst] = useState<Rec[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [slaRules, setSlaRules] = useState<SlaRule[]>(DEFAULT_SLA_RULES);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    listSlaRules().then((r) => { if (r.length) setSlaRules(r as SlaRule[]); }).catch(() => { /* keep defaults */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!dataConfigured()) { setLoading(false); return; }
    (async () => {
      try {
        const [f, i] = await Promise.all([listFieldCalls('', 0, 'FIELD'), listFieldCalls('', 0, 'INST')]);
        if (cancelled) return;
        setField(f); setInst(i);
        try { const p = await listPending(500); if (!cancelled) setPending(p.length); } catch { /* pending optional */ }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Role-scoped call sets.
  const inScope = (r: Rec) => scope.all || allowsAllottee(scope, r['allocatedTo']);
  const fieldS = useMemo(() => (scope.ready ? field.filter(inScope) : field), [field, scope]);
  const instS = useMemo(() => (scope.ready ? inst.filter(inScope) : inst), [inst, scope]);
  const all = useMemo(() => [...fieldS, ...instS], [fieldS, instS]);

  const thisMonth = useMemo(() => {
    const now = new Date(); const key = `${now.getFullYear()}-${now.getMonth()}`;
    return all.filter((r) => { const d = parseSheetDate(r['regDate']) ?? parseSheetDate(r['complaintDate']); return d && `${d.getFullYear()}-${d.getMonth()}` === key; }).length;
  }, [all]);

  const phThreat = all.filter((r) => /yes/i.test(g(r, 'publicHealthThreat'))).length;
  const serious = all.filter((r) => /yes/i.test(g(r, 'seriousIncident'))).length;

  const monthly = useMemo(() => last6Months().map((m) => ({
    label: m.label,
    value: all.filter((r) => { const d = parseSheetDate(r['regDate']) ?? parseSheetDate(r['complaintDate']); return d && `${d.getFullYear()}-${d.getMonth()}` === m.key; }).length,
  })), [all]);

  const itemStatusMix = useMemo(() => topCounts(all, 'itemStatus', 8), [all]);
  const topProducts = useMemo(() => topCounts(all, 'productName', 6), [all]);
  const topEngineers = useMemo(() => topCounts(all, 'allocatedTo', 6), [all]);

  const recent = useMemo(() => {
    return [...all].sort((a, b) => (parseSheetDate(b['regDate'])?.getTime() ?? 0) - (parseSheetDate(a['regDate'])?.getTime() ?? 0)).slice(0, 8);
  }, [all]);

  const uniqueParties = new Set(all.map((r) => g(r, 'partyName').trim()).filter(Boolean)).size;

  // SLA — evaluate each open call against the active rules, worst first.
  const slaCalls = useMemo(() => all
    .map((r) => ({ r, sla: evaluateCallSla(slaRules, { regAt: g(r, 'regDate') || g(r, 'complaintDate'), openState: g(r, 'callState'), itemStatus: g(r, 'itemStatus') }) }))
    .filter((x) => x.sla.worst === 'breach' || x.sla.worst === 'due')
    .sort((a, b) => (a.sla.worst === 'breach' ? 0 : 1) - (b.sla.worst === 'breach' ? 0 : 1)
      || Math.min(...a.sla.parts.map((p) => p.hoursLeft)) - Math.min(...b.sla.parts.map((p) => p.hoursLeft))),
  [all, slaRules]);
  const slaBreaches = slaCalls.filter((x) => x.sla.worst === 'breach').length;
  const slaDue = slaCalls.filter((x) => x.sla.worst === 'due').length;

  return (
    <div>
      <PageHeader title="Service Dashboard" subtitle="Live field-service operations at a glance" icon="📊"
        actions={<span className={`conn-dot ${scope.all ? 'conn-on' : 'conn-off'}`}>{scopeLabel(scope)}</span>} />

      {!dataConfigured() && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings to populate the dashboard.</span></div>}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not load dashboard data: {err}</span></div>}
      {loading && <div className="muted" style={{ padding: 16 }}>Loading live data…</div>}

      <KpiGrid min={200}>
        <KpiCard label="Field Calls" value={fieldS.length} tone="primary" icon="📡" sub="most recent 300" />
        <KpiCard label="Installation Calls" value={instS.length} tone="info" icon="🔧" sub="most recent 300" />
        <KpiCard label="Pending Registrations" value={pending == null ? '—' : pending} tone="warning" icon="⏳" sub="awaiting UCN" />
        <KpiCard label="Calls This Month" value={thisMonth} tone="success" icon="📅" />
        <KpiCard label="SLA Breached" value={slaBreaches} tone={slaBreaches ? 'danger' : 'success'} icon="⏱️" sub={slaDue ? `${slaDue} due soon` : 'your open calls'} />
        <KpiCard label="Public Health Threats" value={phThreat} tone={phThreat ? 'danger' : 'neutral'} icon="⚠️" />
        <KpiCard label="Serious Incidents" value={serious} tone={serious ? 'danger' : 'neutral'} icon="🚨" />
        <KpiCard label="Parties Served" value={uniqueParties} tone="neutral" icon="🏥" />
        <KpiCard label="Engineers Active" value={topEngineers.length} tone="neutral" icon="🧑‍🔧" />
      </KpiGrid>

      {slaCalls.length > 0 && (
        <SectionCard title={`⏱️ SLA — needs attention (${slaCalls.length})`}>
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 620 }}>
              <thead><tr><th>SLA</th><th>UCN</th><th>Call No</th><th>Party</th><th>Status</th><th>Registered</th><th>Which rule</th></tr></thead>
              <tbody>
                {slaCalls.slice(0, 20).map(({ r, sla }, i) => {
                  const worstPart = [...sla.parts].sort((a, b) => a.hoursLeft - b.hoursLeft)[0];
                  return (
                    <tr key={i}>
                      <td><span className={`badge badge-${slaTone(sla.worst)}`}>{slaLabel(sla.worst)}</span></td>
                      <td>{g(r, 'ucn')}</td>
                      <td>{g(r, 'callNumber')}</td>
                      <td>{g(r, 'partyName')}</td>
                      <td>{g(r, 'callState')}</td>
                      <td>{fmtLongDate(g(r, 'regDate'))}</td>
                      <td className="muted">{worstPart ? `${worstPart.label} · ${slaWhen(worstPart.hoursLeft)}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {slaCalls.length > 20 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>…and {slaCalls.length - 20} more.</div>}
        </SectionCard>
      )}

      <div className="dash-grid">
        <SectionCard title="Calls — last 6 months">
          {all.length ? <ColumnChart data={monthly} /> : <div className="muted">No call data yet.</div>}
        </SectionCard>
        <SectionCard title="Item Status Mix">
          {itemStatusMix.length ? <DonutChart data={itemStatusMix} /> : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Top Products (call volume)">
          {topProducts.length ? <BarChart data={topProducts} /> : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Calls by Engineer (Top 6)">
          {topEngineers.length ? <BarChart data={topEngineers} /> : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Recent Calls">
          <div className="list-tight">
            {recent.length === 0 && <div className="muted">No calls yet.</div>}
            {recent.map((r, i) => (
              <div className="list-tight-row" key={g(r, 'ucn') || i}>
                <div>
                  <b>{g(r, 'ucn')}</b> · {g(r, 'partyName')}
                  <div className="muted" style={{ fontSize: 12 }}>{(g(r, 'complaintReported') || g(r, 'productName')).slice(0, 60)}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <span className="badge badge-neutral">{g(r, 'itemStatus') || g(r, 'callType')}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{g(r, 'allocatedTo')}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
