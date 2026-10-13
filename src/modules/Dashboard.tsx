import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart, LineChart } from '../components/charts/Charts';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { listFieldCalls, listPending, dataConfigured } from '../lib/sheets';
import { listSlaRules, callFamily, supabaseConfigured } from '../lib/supabase';
import { allowsAllottee, scopeLabel, useAccessScope } from '../lib/access';
import { evaluateCallSla, slaByRule, DEFAULT_SLA_RULES, slaTone, slaLabel, slaWhen, type SlaRule } from '../lib/sla';
import { fmtLongDate } from '../lib/format';
import { parseAnyDate, todayLocal } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { xlsxDownload } from '../lib/xlsx';
import { COMPLETE } from '../lib/exportscope';
import { logAudit } from '../lib/audit';
import {
  DASH_DIMS, DASH_PERIODS, applyDashPicks, dashTally, dashTrend, type DashDimKey, type DashPeriod, type DashPicked, type DashCount,
} from '../lib/dashinsights';
import './fieldcalls.css';
import './ffr.css';

// ===========================================================================
// SERVICE DASHBOARD — computed from the live Field + Installation call data
// (role-scoped: engineers see their own, RMs their team, admins all).
// ===========================================================================

type Rec = Record<string, unknown>;
const g = (r: Rec, k: string) => String(r[k] ?? '');

// Dates go through the project's one parser, day-first (finding 4): a private
// `new Date(s)` fallback read 09-10-2026 as 10 September and put the call in
// the wrong month on the chart, silently.
const parseSheetDate = (v: unknown): Date | null => parseAnyDate(v);

const periodName = (p: DashPeriod) => (p === 'year' ? 'Year' : p === 'quarter' ? 'Quarter' : 'Month');

// THE FIGURES BESIDE A CHART, the Failure Insights way: the same array the
// chart draws, so the two cannot disagree; a row click picks like the chart.
function CountTable({ head, data, active, onPick, limit = 12 }: {
  head: string; data: DashCount[]; active: string | null; onPick: (label: string) => void; limit?: number;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const shown = data.slice(0, limit);
  return (
    <table className="ffr-mini">
      <thead><tr><th>{head}</th><th className="num">Calls</th><th className="num">Share</th></tr></thead>
      <tbody>
        {shown.map((d) => (
          <tr key={d.label} className={active === d.label ? 'is-active' : ''} onClick={() => onPick(d.label)}
              title={`${d.value} of ${total} = ${(d.share * 100).toFixed(1)}%`}>
            <td>{d.label}</td><td className="num">{d.value}</td><td className="num">{(d.share * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td>Total{data.length > shown.length ? ` (top ${shown.length} of ${data.length} shown)` : ''}</td><td className="num">{total}</td><td className="num">100.0%</td></tr></tfoot>
    </table>
  );
}

// A block's foot: what the shares mean, and the download where the role may.
function BlockFoot({ note, onDownload }: { note: ReactNode; onDownload?: () => void }) {
  return (
    <div className="ffr-split-foot">
      <span className="muted">{note}</span>
      {onDownload && <button className="btn btn-sm" onClick={onDownload}>⬳ Download</button>}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const scope = useAccessScope();

  // A call named on the dashboard opens THAT call, in the register it lives in.
  // Reading a UCN off a tile and then going to find it by hand is the sort of
  // work a screen exists to save, and which of the three registers holds it is
  // decided by the same matcher the database uses.
  const openCall = (r: Rec) => {
    const ucn = g(r, 'ucn').trim();
    if (!ucn) return;
    const fam = callFamily(g(r, 'callType'));
    navigate(fam === 'install' ? '/installations' : fam === 'pm' ? '/pm-calls' : '/field-calls',
      { state: { editUcn: ucn } });
  };
  const [field, setField] = useState<Rec[]>([]);
  const [inst, setInst] = useState<Rec[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [slaRules, setSlaRules] = useState<SlaRule[]>(DEFAULT_SLA_RULES);
  // WHICH TARGETS THE SLA COUNTS USE, said on the screen (D-024). The built-in
  // targets stay as the fallback -- an SLA section with nothing in it is no
  // better -- but a breach count computed against targets nobody configured
  // must not read as one computed against the configured ones.
  const [slaSource, setSlaSource] = useState<'configured' | 'none-configured' | 'unreadable' | 'loading'>('loading');

  useEffect(() => {
    if (!supabaseConfigured()) { setSlaSource('unreadable'); return; }
    listSlaRules()
      .then((r) => { if (r.length) { setSlaRules(r as SlaRule[]); setSlaSource('configured'); } else setSlaSource('none-configured'); })
      .catch(() => setSlaSource('unreadable'));
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

  // ---- THE FAILURE INSIGHTS WAY (the user, 2026-10-13) ---------------------
  // Click a bar, slice or period to narrow EVERY figure below to it; click it
  // again, or its chip, to clear. Each chart counts the calls left by every
  // OTHER pick (lib/dashinsights.ts).
  const { can } = useAuth();
  const mayDownload = can('export.data');
  const [picked, setPicked] = useState<DashPicked>({});
  const [period, setPeriod] = useState<DashPeriod>('month');
  const [trendLabels, setTrendLabels] = useState(false);
  const pick = (k: DashDimKey) => (label: string) =>
    setPicked((p) => (p[k] === label ? { ...p, [k]: undefined } : { ...p, [k]: label }));
  const active = (Object.keys(picked) as DashDimKey[]).filter((k) => picked[k]);
  const rows = useMemo(() => applyDashPicks(all, picked, period), [all, picked, period]);
  const fieldSet = useMemo(() => new Set(fieldS), [fieldS]);
  const fieldN = useMemo(() => rows.filter((r) => fieldSet.has(r)).length, [rows, fieldSet]);
  const instN = rows.length - fieldN;

  const thisMonth = useMemo(() => {
    const now = new Date(); const key = `${now.getFullYear()}-${now.getMonth()}`;
    return rows.filter((r) => { const d = parseSheetDate(r['regDate']) ?? parseSheetDate(r['complaintDate']); return d && `${d.getFullYear()}-${d.getMonth()}` === key; }).length;
  }, [rows]);

  const phThreat = rows.filter((r) => /yes/i.test(g(r, 'publicHealthThreat'))).length;
  const serious = rows.filter((r) => /yes/i.test(g(r, 'seriousIncident'))).length;

  const trend = useMemo(() => dashTrend(applyDashPicks(all, picked, period, 'period'), period), [all, picked, period]);
  const itemStatusMix = useMemo(() => dashTally(applyDashPicks(all, picked, period, 'itemStatus'), 'itemStatus'), [all, picked, period]);
  const byProduct = useMemo(() => dashTally(applyDashPicks(all, picked, period, 'productName'), 'productName'), [all, picked, period]);
  const byEngineer = useMemo(() => dashTally(applyDashPicks(all, picked, period, 'allocatedTo'), 'allocatedTo'), [all, picked, period]);

  const recent = useMemo(() => {
    return [...rows].sort((a, b) => (parseSheetDate(b['regDate'])?.getTime() ?? 0) - (parseSheetDate(a['regDate'])?.getTime() ?? 0)).slice(0, 8);
  }, [rows]);

  const uniqueParties = new Set(rows.map((r) => g(r, 'partyName').trim()).filter(Boolean)).size;
  // COUNTED, NOT READ OFF THE CHART -- distinct allottees over the calls shown.
  const activeEngineers = new Set(rows.map((r) => g(r, 'allocatedTo').trim()).filter(Boolean)).size;

  // SLA — every open call judged against every rule that applies to it, then
  // SEPARATED BY RULE (the user, 2026-10-13: "Segregate the SLA Breach. Name
  // it ... Every SLA should display a List separately"). One tile and one list
  // per SLA, each under the name given on SLA Targets; a call late for two
  // rules is on both lists. Narrowed by the picks like everything else.
  const slaJudged = useMemo(() => rows.map((r) => ({
    item: r,
    sla: evaluateCallSla(slaRules, { regAt: g(r, 'regDate') || g(r, 'complaintDate'), openState: g(r, 'callState'), itemStatus: g(r, 'itemStatus') }),
  })), [rows, slaRules]);
  const slaLists = useMemo(() => slaByRule(slaRules, slaJudged), [slaRules, slaJudged]);
  // A tile for every rule the dashboard judges calls by -- 0 is an answer --
  // in the rules' order, under their names.
  const slaTiles = useMemo(() => {
    const judgedKeys = new Set(slaJudged.flatMap((x) => x.sla.parts.map((p) => p.key)));
    return [...slaRules].sort((a, b) => a.sort_order - b.sort_order)
      .filter((rule) => rule.active && judgedKeys.has(rule.key))
      .map((rule) => slaLists.find((l) => l.rule.key === rule.key) ?? { rule, items: [], breached: 0, due: 0 });
  }, [slaRules, slaJudged, slaLists]);

  // ---- DOWNLOADS, one per block, ONLY for a role holding "Export / download
  // CSV" (export.data) on Roles & Permissions (the user, 2026-10-13: "only if
  // the Download option is enabled ... for that User's Role"). The button is
  // not drawn otherwise, and the handler refuses as well, so a stale screen
  // cannot download after the right is withdrawn. Each file is what its block
  // shows -- the picks applied -- with a sheet saying how it was worked out.
  const narrowedTo = DASH_DIMS.filter((d) => picked[d.key]).map((d) => `${d.key === 'period' ? periodName(period) : d.label}: ${picked[d.key]}`).join(' · ') || 'every call you can see';
  const download = (block: string, slug: string, columns: string[], data: Record<string, unknown>[], notes: [string, string][] = []) => {
    if (!can('export.data')) return;
    const when = todayLocal();
    xlsxDownload(`dashboard-${slug}-${when}.xlsx`, [
      { name: block.slice(0, 31), columns, rows: data },
      { name: 'How this was worked out', columns: ['Item', 'Value'], rows: [
        { Item: 'Block', Value: block },
        { Item: 'Narrowed to', Value: narrowedTo },
        { Item: 'Calls behind it', Value: String(rows.length) },
        { Item: 'Rows in this sheet', Value: String(data.length) },
        ...notes.map(([Item, Value]) => ({ Item, Value })),
        { Item: 'Downloaded', Value: new Date().toISOString() },
      ] },
    ], COMPLETE);
    logAudit({ action: 'dashboard.download', target: `${slug} ${when}`, meta: { rows: data.length, narrowedTo } });
  };
  const countRows = (head: string, d: DashCount[]) =>
    d.map((x) => ({ [head]: x.label, Calls: x.value, Share: `${(x.share * 100).toFixed(1)}%` }));
  const callRows = (list: Rec[]) => list.map((r) => ({
    UCN: g(r, 'ucn'), 'Call No': g(r, 'callNumber'), Party: g(r, 'partyName'), Product: g(r, 'productName'),
    Serial: g(r, 'serial'), Status: g(r, 'callState'), Registered: g(r, 'regDate'), 'Allotted to': g(r, 'allocatedTo'),
  }));

  const dl = (fn: () => void) => (mayDownload ? fn : undefined);

  return (
    <div>
      <PageHeader title="Service Dashboard" subtitle="Live field-service operations at a glance" icon="📊"
        actions={<span className={`conn-dot ${scope.all ? 'conn-on' : 'conn-off'}`}>{scopeLabel(scope)}</span>} />

      {!dataConfigured() && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings to populate the dashboard.</span></div>}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not load dashboard data: {err}</span></div>}
      {loading && <div className="muted" style={{ padding: 16 }}>Loading live data…</div>}

      {/* WHAT THE PAGE IS COUNTING, in words, above the numbers: every figure
          moves when a mark is clicked. */}
      <div className="ffr-picks">
        {active.length === 0 ? (
          <span className="muted">Click any bar, slice, period or table row to narrow every figure on this page to it. Click it again to clear.</span>
        ) : (
          <>
            <b>{rows.length} of {all.length} calls</b>
            {active.map((k) => (
              <button key={k} type="button" className="ffr-chip" title="Remove this"
                      onClick={() => setPicked((p) => ({ ...p, [k]: undefined }))}>
                {k === 'period' ? periodName(period) : DASH_DIMS.find((d) => d.key === k)!.label}: {picked[k]} <span aria-hidden>×</span>
              </button>
            ))}
            <button type="button" className="ffr-chip ffr-chip-clear" onClick={() => setPicked({})}>Clear all</button>
          </>
        )}
      </div>

      <KpiGrid min={200}>
        {/* NOT "most recent 300". Both lists page the whole register, narrowed
            only by what the reader's role may see -- and by any pick above. */}
        <KpiCard label="Field Calls" value={fieldN} tone="primary" icon="📡" sub={active.length ? 'of the calls picked' : 'every call you can see'} />
        <KpiCard label="Installation Calls" value={instN} tone="info" icon="🔧" sub={active.length ? 'of the calls picked' : 'every call you can see'} />
        <KpiCard label="Pending Registrations" value={pending == null ? '—' : pending} tone="warning" icon="⏳" sub="awaiting UCN" />
        <KpiCard label="Calls This Month" value={thisMonth} tone="success" icon="📅" />
        <KpiCard label="Public Health Threats" value={phThreat} tone={phThreat ? 'danger' : 'neutral'} icon="⚠️" />
        <KpiCard label="Serious Incidents" value={serious} tone={serious ? 'danger' : 'neutral'} icon="🚨" />
        <KpiCard label="Parties Served" value={uniqueParties} tone="neutral" icon="🏥" />
        <KpiCard label="Engineers Active" value={activeEngineers} tone="neutral" icon="🧑‍🔧" />
      </KpiGrid>

      {/* ONE TILE PER SLA, named as on SLA Targets: breached, and due soon. */}
      {slaTiles.length > 0 && (
        <KpiGrid min={200}>
          {slaTiles.map((t) => (
            <KpiCard key={t.rule.key} label={`⏱️ ${t.rule.label}`} value={t.breached}
              tone={t.breached ? 'danger' : 'success'} icon="⏱️"
              sub={`breached${t.due ? ` · ${t.due} due soon` : ''}`} />
          ))}
        </KpiGrid>
      )}

      {(slaSource === 'none-configured' || slaSource === 'unreadable') && slaLists.length > 0 && (
        <div className="sheet-banner sheet-banner-warn" style={{ marginBottom: 8 }}>
          <span>
            {slaSource === 'unreadable'
              ? 'The configured SLA targets could not be read, so these are judged against the built-in default targets.'
              : 'No SLA targets are configured yet, so these are judged against the built-in default targets.'}
            {' '}Set them under SLA / Objective Configuration → SLA Targets.
          </span>
        </div>
      )}

      {/* ONE LIST PER SLA, titled with its name: breached first, then due. */}
      {slaLists.map((l) => (
        <SectionCard key={l.rule.key}
          title={`⏱️ ${l.rule.label} — ${l.breached} breached${l.due ? `, ${l.due} due soon` : ''}`}>
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 620 }}>
              <thead><tr><th>SLA</th><th>UCN</th><th>Call No</th><th>Party</th><th>Status</th><th>Registered</th><th>Allotted to</th><th>Over / due</th></tr></thead>
              <tbody>
                {l.items.slice(0, 20).map(({ item: r, part }, i) => (
                  <tr key={i} className="row-link" title={`Open ${g(r, 'ucn')}`} onClick={() => openCall(r)}>
                    <td><span className={`badge badge-${slaTone(part.status)}`}>{slaLabel(part.status)}</span></td>
                    <td>{g(r, 'ucn')}</td>
                    <td>{g(r, 'callNumber')}</td>
                    <td>{g(r, 'partyName')}</td>
                    <td>{g(r, 'callState')}</td>
                    <td>{fmtLongDate(g(r, 'regDate'))}</td>
                    <td>{g(r, 'allocatedTo')}</td>
                    <td className="muted">{slaWhen(part.hoursLeft)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <BlockFoot
            note={l.items.length > 20 ? `Showing 20 of ${l.items.length}; the download has them all.` : `${l.items.length} call${l.items.length === 1 ? '' : 's'}.`}
            onDownload={dl(() => download(l.rule.label, `sla-${l.rule.key}`,
              ['SLA', 'UCN', 'Call No', 'Party', 'Product', 'Serial', 'Status', 'Registered', 'Allotted to', 'Over / due'],
              l.items.map(({ item: r, part }) => ({ SLA: slaLabel(part.status), ...callRows([r])[0], 'Over / due': slaWhen(part.hoursLeft) })),
              [['Target', `${l.rule.target_hours} hours`], ['Order', 'breached first, then the nearest deadline']]))} />
        </SectionCard>
      ))}

      {/* THE TREND, read by year, quarter or month, with its numbers beside it. */}
      <SectionCard title={`Calls registered, ${period === 'year' ? 'year by year' : period === 'quarter' ? 'quarter by quarter' : 'month by month'}`}>
        <div className="ffr-chart-bar">
          <span className="muted">Read it</span>
          {DASH_PERIODS.map((p) => (
            <button key={p.key} type="button" className={`chip ${period === p.key ? 'chip-on' : ''}`} aria-pressed={period === p.key}
              // The chosen period is cleared with the scale: "2026-03" is not a quarter.
              onClick={() => { setPicked((q) => ({ ...q, period: undefined })); setPeriod(p.key); }}>
              {p.label}
            </button>
          ))}
          <div className="spacer" />
          <button type="button" className={`chip ${trendLabels ? 'chip-on' : ''}`} aria-pressed={trendLabels}
                  onClick={() => setTrendLabels((v) => !v)}>{trendLabels ? '✓ ' : ''}Data labels</button>
        </div>
        {trend.rows.length === 0 ? <div className="muted">No call data yet.</div> : (
          <div className="ffr-split">
            <div className="ffr-split-chart">
              <LineChart data={trend.rows.map((r) => ({ label: r.label, value: r.value }))} showLabels={trendLabels}
                         onPick={pick('period')} active={picked.period ?? null} />
            </div>
            <div className="ffr-split-table">
              <table className="ffr-mini">
                <thead><tr><th>{periodName(period)}</th><th className="num">Calls</th><th className="num">Change</th><th className="num">Share</th><th className="num">Running</th></tr></thead>
                <tbody>
                  {[...trend.rows].reverse().map((r) => (
                    <tr key={r.label} className={picked.period === r.label ? 'is-active' : ''} onClick={() => pick('period')(r.label)}
                        title={`${r.value} of ${trend.total} = ${(r.share * 100).toFixed(1)}%`}>
                      <td>{r.label}</td>
                      <td className="num">{r.value}</td>
                      <td className={`num ${r.change === null ? 'muted' : r.change > 0 ? 'ffr-up' : r.change < 0 ? 'ffr-down' : 'muted'}`}>
                        {r.change === null ? '—' : r.change > 0 ? `+${r.change}` : r.change}
                      </td>
                      <td className="num">{(r.share * 100).toFixed(1)}%</td>
                      <td className="num muted">{r.running}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Total</td><td className="num">{trend.total}</td><td /><td className="num">100.0%</td><td /></tr></tfoot>
              </table>
              <BlockFoot
                note={<>Newest first. Change is on the period before; share = calls ÷ {trend.total}.{trend.undated ? ` ${trend.undated} call${trend.undated === 1 ? ' has' : 's have'} no date and ${trend.undated === 1 ? 'is' : 'are'} in no period.` : ''}</>}
                onDownload={dl(() => download(`Calls by ${periodName(period).toLowerCase()}`, `trend-${period}`,
                  [periodName(period), 'Calls', 'Change on the one before', 'Share', 'Running total'],
                  trend.rows.map((r) => ({ [periodName(period)]: r.label, Calls: r.value,
                    'Change on the one before': r.change === null ? '—' : r.change > 0 ? `+${r.change}` : String(r.change),
                    Share: `${(r.share * 100).toFixed(1)}%`, 'Running total': r.running })),
                  [['Which date decides the period', 'the registration date, else the complaint date'],
                   ['Calls with no date', String(trend.undated)]]))} />
            </div>
          </div>
        )}
      </SectionCard>

      <div style={{ height: 12 }} />

      <div className="dash-grid">
        <SectionCard title="Item Status Mix">
          {itemStatusMix.length ? (
            <>
              <DonutChart data={itemStatusMix.slice(0, 8)} onPick={pick('itemStatus')} active={picked.itemStatus ?? null} />
              <CountTable head="Item status" data={itemStatusMix} active={picked.itemStatus ?? null} onPick={pick('itemStatus')} />
              <BlockFoot note="Share = calls ÷ the calls shown."
                onDownload={dl(() => download('Item status mix', 'item-status', ['Item status', 'Calls', 'Share'], countRows('Item status', itemStatusMix)))} />
            </>
          ) : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Top Products (call volume)">
          {byProduct.length ? (
            <>
              <BarChart data={byProduct.slice(0, 12)} onPick={pick('productName')} active={picked.productName ?? null} />
              <CountTable head="Product" data={byProduct} active={picked.productName ?? null} onPick={pick('productName')} />
              <BlockFoot note="Every product in the download, not only the top 12."
                onDownload={dl(() => download('Calls by product', 'products', ['Product', 'Calls', 'Share'], countRows('Product', byProduct)))} />
            </>
          ) : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Calls by Engineer">
          {byEngineer.length ? (
            <>
              <BarChart data={byEngineer.slice(0, 12)} onPick={pick('allocatedTo')} active={picked.allocatedTo ?? null} />
              <CountTable head="Engineer" data={byEngineer} active={picked.allocatedTo ?? null} onPick={pick('allocatedTo')} />
              <BlockFoot note="Every engineer in the download, not only the top 12."
                onDownload={dl(() => download('Calls by engineer', 'engineers', ['Engineer', 'Calls', 'Share'], countRows('Engineer', byEngineer)))} />
            </>
          ) : <div className="muted">No data yet.</div>}
        </SectionCard>
        <SectionCard title="Recent Calls">
          <div className="list-tight">
            {recent.length === 0 && <div className="muted">No calls yet.</div>}
            {recent.map((r, i) => (
              <div className="list-tight-row row-link" key={g(r, 'ucn') || i} title={`Open ${g(r, 'ucn')}`} onClick={() => openCall(r)}>
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
          <BlockFoot note="The 8 most recently registered."
            onDownload={dl(() => download('Recent calls', 'recent', ['UCN', 'Call No', 'Party', 'Product', 'Serial', 'Status', 'Registered', 'Allotted to'], callRows(recent)))} />
        </SectionCard>
      </div>
    </div>
  );
}
