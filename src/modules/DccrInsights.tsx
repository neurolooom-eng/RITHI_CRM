// ===========================================================================
// DAILY CALL REVIEW — INSIGHTS.
//
// The user, 2026-09-15: "Add one more analytics page to analyse all the data
// that is part of the daily call review — similar to how FFR Insights are
// built. Use all those chart.. analyse and suggest more analytics there."
//
// WHAT THIS ANSWERS THAT THE REGISTER DOES NOT. The Daily Call Review is a
// worklist: one call at a time, answered and moved on from. These are the
// questions asked ACROSS it — what is actually failing, why, under whose cover,
// how long a review waits before somebody looks at it, and how much of the
// review is being answered by the 9:15 rule rather than by a person.
//
// IT COUNTS UNDER THE CORRECTED PRODUCT (`live_product_name`, 0203). Review 2
// can move a failure to the accessory it really belongs to, and a page that
// grouped by the CALL's product would count it under EXTEND-XT after somebody
// had said it was the CPX CARE's — undoing the correction on the one screen
// built to see it.
//
// EVERY COUNT IS OVER WHAT LOADED, and the register pages. So the figures carry
// `+` while more is waiting, which is the rule everywhere else in this project
// and the easiest one to drop on a screen made of counts.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { SectionCard, PageHeader } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart, LineChart, ParetoChart } from '../components/charts/Charts';
// ONE DEFINITION of the period buckets, shared with FFR Insights: the trend's
// marks are clickable, so a bucket key is also a filter value — two functions
// that drifted would make a click filter on a value no row has, and the page
// would silently empty.
import { PERIODS, periodKey, type Period } from './FieldFailureInsights';

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => String(r[k] ?? '').trim();
const yes = (v: string) => /^(yes|y|true|1)$/i.test(v.trim());

/** Count by a key, biggest first, with blanks GATHERED rather than dropped:
 *  "not stated" is a finding about the review, and silently omitting it makes
 *  the chart add up to less than the total with nothing saying why. */
function tally(rows: Row[], key: string, blankLabel = '(not answered)'): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = s(r, key) || blankLabel;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Days between two ISO dates, or null when either is missing or unreadable —
 *  counted nowhere rather than as zero, which would read as "same day". */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from), b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** The bands a turnaround is reported in. Bands rather than an average,
 *  because an average hides the tail and the tail is the finding: twenty
 *  reviews answered same-day and one left ninety days average to four. */
const TURNAROUND_BANDS: { label: string; max: number }[] = [
  { label: 'Same day', max: 0 },
  { label: '1–2 days', max: 2 },
  { label: '3–7 days', max: 7 },
  { label: '8–30 days', max: 30 },
  { label: 'Over 30 days', max: Infinity },
];
const bandFor = (d: number) => TURNAROUND_BANDS.find((b) => d <= b.max)!.label;

export function DccrInsights({ rows: allRows, more = false }: { rows: Row[]; more?: boolean }) {
  const [period, setPeriod] = useState<Period>('month');
  const [trendLabels, setTrendLabels] = useState(false);
  // CROSS-FILTER. Clicking a bar narrows every other chart, so a question like
  // "what is the root cause on ORION-G, under contract?" is two clicks rather
  // than a query nobody can write.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pick = (dim: string) => (label: string) =>
    setPicked((cur) => (cur[dim] === label ? (({ [dim]: _drop, ...rest }) => rest)(cur) : { ...cur, [dim]: label }));

  const dimValue = (r: Row, dim: string): string => {
    if (dim === 'period') return periodKey(s(r, 'review2_at') || s(r, 'reg_date'), period);
    if (dim === 'turnaround') {
      const d = daysBetween(s(r, 'reg_date'), s(r, 'review2_at'));
      return d === null ? '' : bandFor(d);
    }
    return s(r, dim);
  };

  const rows = useMemo(() => {
    const dims = Object.entries(picked);
    if (!dims.length) return allRows;
    return allRows.filter((r) => dims.every(([dim, label]) => {
      const v = dimValue(r, dim);
      // A blank matches the gathered "(not answered)" bucket, so clicking it
      // narrows to the rows the chart actually counted there.
      return (v || '(not answered)') === label;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, picked, period]);

  const n = rows.length;
  const plus = more ? '+' : '';
  const countIf = (fn: (r: Row) => boolean) => rows.filter(fn).length;

  const byStatus = useMemo(() => tally(rows, 'review_status'), [rows]);
  const byRootCause = useMemo(() => tally(rows, 'root_cause_keyword'), [rows]);
  const byGrouping = useMemo(() => tally(rows, 'complaint_grouping'), [rows]);
  const byProduct = useMemo(() => tally(rows, 'live_product_name'), [rows]);
  const byCover = useMemo(() => tally(rows, 'item_status', '(no cover recorded)'), [rows]);
  const bySpareCat = useMemo(() => tally(rows, 'spare_category'), [rows]);
  const byState = useMemo(() => tally(rows, 'state', '(no state)'), [rows]);
  const byParty = useMemo(() => tally(rows, 'party_name', '(no customer)'), [rows]);
  const byReviewer = useMemo(() => tally(rows, 'review2_by', '(nobody recorded)'), [rows]);
  const bySw = useMemo(() => tally(rows, 'sw_version', '(not captured)'), [rows]);
  const byAge = useMemo(() => tally(rows, 'age_group', '(age unknown)'), [rows]);
  const byPending = useMemo(() => tally(rows, 'pending_reason', '(none given)'), [rows]);
  const byComplaint = useMemo(() => tally(rows, 'standard_complaint'), [rows]);

  // TURNAROUND: registration to Review 2 answered. A review nobody has answered
  // has no turnaround yet and is counted nowhere here — not as zero, which
  // would read as "answered same day" and flatter the figure.
  const byTurnaround = useMemo(() => {
    const m = new Map<string, number>();
    TURNAROUND_BANDS.forEach((b) => m.set(b.label, 0));
    rows.forEach((r) => {
      const d = daysBetween(s(r, 'reg_date'), s(r, 'review2_at'));
      if (d === null) return;
      m.set(bandFor(d), (m.get(bandFor(d)) ?? 0) + 1);
    });
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }, [rows]);
  const answered = byTurnaround.reduce((t, b) => t + b.value, 0);

  const trend = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = periodKey(s(r, 'review2_at') || s(r, 'reg_date'), period);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
  }, [rows, period]);
  const trendTotal = trend.reduce((t, x) => t + x.value, 0);

  const effects = countIf((r) => yes(s(r, 'any_potential_effect')));
  const risk = countIf((r) => yes(s(r, 'risk_to_patient')));
  const warrantyFail = countIf((r) => yes(s(r, 'warranty_failure')));
  const frequent = countIf((r) => yes(s(r, 'frequent_failure')));
  const moved = countIf((r) => s(r, 'live_product_changed') === 'true' || r.live_product_changed === true);
  const auto = countIf((r) => /^auto/i.test(s(r, 'review2_by')));

  return (
    <div>
      {Object.keys(picked).length > 0 && (
        <SectionCard title="Narrowed to">
          <div className="stage-chips">
            {Object.entries(picked).map(([dim, label]) => (
              <button key={dim} className="chip chip-on" onClick={() => pick(dim)(label)}
                title="Drop this and count everything again">
                {dim}: {label} ✕
              </button>
            ))}
            <button className="chip" onClick={() => setPicked({})}>Clear all</button>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            {n.toLocaleString()}{plus} of {allRows.length.toLocaleString()}{plus} reviews.
          </div>
        </SectionCard>
      )}

      <KpiGrid min={190}>
        <KpiCard label="Calls reviewed" value={`${n.toLocaleString()}${plus}`} tone="primary" icon="📋"
          sub="on the register" />
        <KpiCard label="Any potential effect" value={`${effects.toLocaleString()}${plus}`} icon="⚠️"
          tone={effects ? 'danger' : 'neutral'} sub="an FFR is raised from each" />
        <KpiCard label="Risk to patient" value={`${risk.toLocaleString()}${plus}`} icon="🚨"
          tone={risk ? 'danger' : 'neutral'} sub="answered Yes at Review 2" />
        <KpiCard label="Failed in warranty" value={`${warrantyFail.toLocaleString()}${plus}`} icon="🛡️"
          tone={warrantyFail ? 'warning' : 'neutral'} sub="inside the cover period" />
        <KpiCard label="Frequent failure" value={`${frequent.toLocaleString()}${plus}`} icon="🔁"
          tone={frequent ? 'warning' : 'neutral'} sub="flagged by either rule" />
        <KpiCard label="Product corrected" value={`${moved.toLocaleString()}${plus}`} icon="🔀"
          tone="info" sub="moved to the accessory that failed" />
        <KpiCard label="Answered by the 9:15 rule" value={`${auto.toLocaleString()}${plus}`} icon="🕘"
          tone={auto ? 'warning' : 'neutral'} sub="Review 2, not by a person" />
      </KpiGrid>

      <SectionCard title="Where the reviews stand">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          A call is at Review 1 until the three vigilance questions are answered, then Review 2
          for the failure questions, then Review 3.
        </p>
        <DonutChart data={byStatus} onPick={pick('review_status')} active={picked.review_status ?? null} />
      </SectionCard>

      <SectionCard title="Root cause — where the few causes are">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Ranked, with the running share beside it: the point of a Pareto is to show how few causes
          account for most of the failures.
        </p>
        <ParetoChart data={byRootCause.slice(0, 15)} onPick={pick('root_cause_keyword')}
          active={picked.root_cause_keyword ?? null} showLabels />
      </SectionCard>

      <SectionCard title="Complaint grouping">
        <BarChart data={byGrouping.slice(0, 12)} widthKey="dccr.grouping"
          onPick={pick('complaint_grouping')} active={picked.complaint_grouping ?? null} />
      </SectionCard>

      <SectionCard title="Which products fail">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Counted under the product Review 2 says actually failed, so a fault moved to an accessory
          is counted there and not against the machine it was logged on.
        </p>
        <BarChart data={byProduct.slice(0, 12)} widthKey="dccr.product"
          onPick={pick('live_product_name')} active={picked.live_product_name ?? null} />
      </SectionCard>

      <SectionCard title="What they were reported as">
        <BarChart data={byComplaint.slice(0, 12)} widthKey="dccr.complaint"
          onPick={pick('standard_complaint')} active={picked.standard_complaint ?? null} />
      </SectionCard>

      <SectionCard title="Under what cover">
        <DonutChart data={byCover} onPick={pick('item_status')} active={picked.item_status ?? null} />
      </SectionCard>

      <SectionCard title="How long until Review 2 was answered">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Registration to the day Review 2 was completed, in bands rather than an average — an
          average hides the tail, and the tail is the finding. {answered.toLocaleString()}{plus} of{' '}
          {n.toLocaleString()}{plus} have been answered; the rest are still pending and are counted
          nowhere here rather than as nought days.
        </p>
        <BarChart data={byTurnaround} widthKey="dccr.turnaround"
          onPick={pick('turnaround')} active={picked.turnaround ?? null} />
      </SectionCard>

      <SectionCard title={`Reviews completed, ${period === 'year' ? 'year by year'
        : period === 'quarter' ? 'quarter by quarter' : 'month by month'}`}>
        <div className="stage-chips">
          {PERIODS.map((p) => (
            <button key={p.key} className={`chip ${period === p.key ? 'chip-on' : ''}`}
              onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
          <button className={`chip ${trendLabels ? 'chip-on' : ''}`} onClick={() => setTrendLabels((v) => !v)}>
            {trendLabels ? '✓ ' : ''}Data labels
          </button>
        </div>
        <LineChart data={trend} showLabels={trendLabels}
          onPick={pick('period')} active={picked.period ?? null} />
        {/* THE NUMBERS BESIDE THE PICTURE (the user's ask on FFR Insights,
            2026-09-14). A chart is read; a table is checked. */}
        <div className="assoc-scroll" style={{ marginTop: 10 }}>
          <table className="assoc-table">
            <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>Reviews</th>
              <th style={{ textAlign: 'right' }}>Share</th></tr></thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td style={{ textAlign: 'right' }}>{t.value.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {trendTotal ? ((t.value / trendTotal) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Who answered Review 2">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          <b>“Auto (9:15 am)”</b> is the rule answering for a call nobody looked at the next morning.
          Its share is the honest measure of how much of this review is being done, and by whom.
        </p>
        <BarChart data={byReviewer.slice(0, 12)} widthKey="dccr.reviewer"
          onPick={pick('review2_by')} active={picked.review2_by ?? null} />
      </SectionCard>

      <SectionCard title="Which spares were implicated">
        <BarChart data={bySpareCat.slice(0, 12)} widthKey="dccr.sparecat"
          onPick={pick('spare_category')} active={picked.spare_category ?? null} />
      </SectionCard>

      <SectionCard title="How old the machine was when it failed">
        <BarChart data={byAge} widthKey="dccr.age"
          onPick={pick('age_group')} active={picked.age_group ?? null} />
      </SectionCard>

      <SectionCard title="Software version on the machine">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          From the latest visit report. A fault clustering on one version is the kind of finding
          that reaches manufacturing.
        </p>
        <BarChart data={bySw.slice(0, 12)} widthKey="dccr.sw"
          onPick={pick('sw_version')} active={picked.sw_version ?? null} />
      </SectionCard>

      <SectionCard title="Why a call is still open">
        <BarChart data={byPending.slice(0, 12)} widthKey="dccr.pending"
          onPick={pick('pending_reason')} active={picked.pending_reason ?? null} />
      </SectionCard>

      <SectionCard title="Where they happen">
        <BarChart data={byState.slice(0, 12)} widthKey="dccr.state"
          onPick={pick('state')} active={picked.state ?? null} />
      </SectionCard>

      <SectionCard title="Which customers">
        <BarChart data={byParty.slice(0, 12)} widthKey="dccr.party"
          onPick={pick('party_name')} active={picked.party_name ?? null} />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE PAGE.
//
// Its own screen under Overview rather than a tab on the register (the user's
// ask). The register is a WORKLIST — you open it to answer a review — and this
// is read to ask what the reviews are saying; somebody looking at the second
// question is not part-way through the first.
//
// IT READS IN PAGES, like every register here, and says so. PostgREST caps a
// response at a thousand rows however large the limit says, so a single big
// request would quietly analyse the first thousand reviews and present it as
// all of them — on a page whose entire purpose is aggregate numbers, that is
// the worst possible place for a silent truncation.
// ---------------------------------------------------------------------------
import { listCallReviews, supabaseConfigured } from '../lib/supabase';

const SCAN_PAGES = 8;          // 8,000 reviews before it admits a lower bound
const PAGE_SIZE = 1000;

export function DccrInsightsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [at, setAt] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr('');
    try {
      const out: Record<string, unknown>[] = [];
      let hitCap = false;
      for (let p = 0; p < SCAN_PAGES; p += 1) {
        const page = await listCallReviews({}, p * PAGE_SIZE, PAGE_SIZE);
        out.push(...page);
        // A SHORT PAGE IS THE LAST PAGE. Asking again costs a request to be
        // told the same thing.
        if (page.length < PAGE_SIZE) { hitCap = false; break; }
        if (p === SCAN_PAGES - 1) hitCap = true;
      }
      setRows(out); setMore(hitCap); setAt(new Date().toISOString());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div>
      <PageHeader
        title="Daily Call Review — Insights" icon="📈"
        subtitle="What the reviews are saying, across the whole register. Click any bar to narrow every chart below it."
        onRefresh={() => void load()} refreshing={busy} syncedAt={at}
        count={rows.length} countMore={more}
      />
      {!supabaseConfigured() && (
        <div className="sheet-banner sheet-banner-info">
          <span>Connect the database in Settings to analyse the reviews.</span>
        </div>
      )}
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      {busy && !rows.length && <div className="muted" style={{ padding: 16 }}>Reading the reviews…</div>}
      {rows.length > 0 && <DccrInsights rows={rows} more={more} />}
    </div>
  );
}
