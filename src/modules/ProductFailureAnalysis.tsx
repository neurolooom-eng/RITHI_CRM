// ===========================================================================
// PRODUCT FAILURE ANALYSIS.
//
// Asked for as an analytics page over the Daily Call Review (2026-09-15), then
// narrowed — "focus on the product failure analysis in this new page" — and
// then NAMED for what it had become. The title is the honest one: this answers
// what fails and why, not what the review process is doing.
//
// THE REVIEW IS STILL WHERE THE DATA COMES FROM. Every number here is one
// REVIEWED CALL, so a failure nobody has reviewed is not on this page at all —
// which is worth knowing before reading any of it as "all our failures".
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
import { BarChart, LineChart, ParetoChart } from '../components/charts/Charts';
import { xlsxDownload } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import './productfailure.css';
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

// ---------------------------------------------------------------------------
// ONE BLOCK, USED FOR EVERY DIMENSION.
//
// The user, 2026-09-15: "focus on the product failure analysis ... stick to
// Pareto, failures per cover.. give data table, download option, data label
// toggle." So every analysis on this page carries the same four things, and
// carries them because they were asked for TOGETHER: a chart is read, a table
// is CHECKED, labels are what make a chart quotable, and a download is what
// makes it arguable with somebody who was not at the screen.
//
// RANKED OR NOT, and the flag is not cosmetic. A Pareto ranks by count so the
// running share means something — "four causes are 80% of the failures". An
// ORDINAL dimension must not be re-ordered: sorting the age bands by how many
// failures each holds destroys the one thing the chart is for, which is whether
// failures cluster EARLY or LATE in a machine's life. Those keep their own
// order and show no cumulative line, because a running total across an
// arbitrary order says nothing.
// ---------------------------------------------------------------------------
interface Cut { label: string; value: number }

function ParetoBlock({
  title, note, rows, total, dim, picked, onPick, rank = true, raw, rawDateKey, rawDateLabel,
}: {
  title: string;
  note?: string;
  rows: Cut[];
  total: number;
  dim: string;
  picked: Record<string, string>;
  onPick: (dim: string) => (label: string) => void;
  rank?: boolean;
  /** The reviews behind these numbers, so the download can carry them. */
  raw: Row[];
  rawDateKey: string;
  rawDateLabel: string;
}) {
  const [labels, setLabels] = useState(false);
  const shown = rank ? rows.slice(0, 15) : rows;
  let run = 0;
  const table = shown.map((r, i) => {
    run += r.value;
    return {
      rank: i + 1,
      label: r.label,
      value: r.value,
      share: total ? r.value / total : 0,
      running: run,
      cumulative: total ? run / total : 0,
    };
  });

  const download = () => {
    const when = new Date().toISOString().slice(0, 10);
    const scope = Object.entries(picked).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'the whole register';
    const name = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    xlsxDownload(`product-failure-${name}-${when}.xlsx`, [
      {
        name: 'Ranked',
        columns: rank
          ? ['Rank', title, 'Failures', 'Share', 'Share worked out', 'Running total', 'Cumulative share']
          : [title, 'Failures', 'Share', 'Share worked out'],
        rows: table.map((r) => (rank ? {
          Rank: r.rank,
          [title]: r.label,
          Failures: r.value,
          Share: `${(r.share * 100).toFixed(1)}%`,
          'Share worked out': `${r.value} ÷ ${total}`,
          'Running total': r.running,
          'Cumulative share': `${(r.cumulative * 100).toFixed(1)}%`,
        } : {
          [title]: r.label,
          Failures: r.value,
          Share: `${(r.share * 100).toFixed(1)}%`,
          'Share worked out': `${r.value} ÷ ${total}`,
        })),
      },
      // THE RAW DATA BEHIND THE NUMBER (the user's ask on FFR Insights,
      // 2026-09-14: "In the Download, i want the Raw data of how that Number was
      // arrived at"). A ranked list is an assertion; the rows are the evidence.
      {
        name: 'The reviews counted',
        columns: ['UCN', 'Call number', rawDateLabel, 'Product (as called)', 'Product (as reviewed)',
                  'Cover', 'Customer', 'Standard complaint', 'Complaint grouping', 'Root cause',
                  'Spare category', 'Software version', 'Age at failure', 'Risk to patient',
                  'Warranty failure', 'Frequent failure', 'Any potential effect', 'Review status'],
        rows: raw.map((r) => ({
          UCN: s(r, 'ucn'),
          'Call number': s(r, 'call_number'),
          [rawDateLabel]: s(r, rawDateKey),
          'Product (as called)': s(r, 'product_name'),
          'Product (as reviewed)': s(r, 'live_product_name'),
          Cover: s(r, 'item_status'),
          Customer: s(r, 'party_name'),
          'Standard complaint': s(r, 'standard_complaint'),
          'Complaint grouping': s(r, 'complaint_grouping'),
          'Root cause': s(r, 'root_cause_keyword'),
          'Spare category': s(r, 'spare_category'),
          'Software version': s(r, 'sw_version'),
          'Age at failure': s(r, 'age_group'),
          'Risk to patient': s(r, 'risk_to_patient'),
          'Warranty failure': s(r, 'warranty_failure'),
          'Frequent failure': s(r, 'frequent_failure'),
          'Any potential effect': s(r, 'any_potential_effect'),
          'Review status': s(r, 'review_status'),
        })),
      },
      {
        name: 'How this was worked out',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Counted by', Value: title },
          { Item: 'Narrowed to', Value: scope },
          { Item: 'Failures counted', Value: total },
          { Item: 'Rows shown on the chart', Value: shown.length },
          { Item: '', Value: '' },
          { Item: 'What one failure is',
            Value: 'ONE REVIEWED CALL. A machine that failed twice is two calls and counts twice.' },
          { Item: 'Which product it counts under',
            Value: 'the product REVIEW 2 says actually failed, where somebody changed it — so a '
              + 'fault moved to an accessory counts against the accessory and not against the '
              + 'machine it was logged on. Both are in the raw sheet, side by side.' },
          { Item: 'A blank answer',
            Value: 'is gathered as "(not answered)" and counted, never dropped. Dropping it would '
              + 'make the chart add up to less than the total with nothing saying why.' },
          ...(rank ? [{
            Item: 'Why it is ranked',
            Value: 'a Pareto ranks by count so the running share means something — how few causes '
              + 'account for most of the failures.',
          }] : [{
            Item: 'Why it is NOT ranked',
            Value: 'this is an ordinal scale and its own order is the finding — whether failures '
              + 'cluster EARLY or LATE. Sorting it by count would destroy that, so there is no '
              + 'cumulative share either: a running total across an arbitrary order says nothing.',
          }]),
          { Item: '', Value: '' },
          { Item: 'Downloaded', Value: new Date().toISOString() },
        ],
      },
    ]);
    logAudit({ action: 'productfailure.download', target: title, meta: { rows: shown.length, total, scope } });
  };

  if (!rows.length) {
    return (
      <SectionCard title={title}>
        <div className="muted">Nothing to count here yet.</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title}>
      {note && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{note}</p>}
      <div className="stage-chips">
        <button className={`chip ${labels ? 'chip-on' : ''}`} onClick={() => setLabels((v) => !v)}>
          {labels ? '✓ ' : ''}Data labels
        </button>
        <button className="chip" onClick={download}>⭳ Download</button>
      </div>
      {rank
        ? <ParetoChart data={shown} onPick={onPick(dim)} active={picked[dim] ?? null} showLabels={labels} />
        : <BarChart data={shown} widthKey={`pfa.${dim}`} onPick={onPick(dim)} active={picked[dim] ?? null} />}
      {/* THE NUMBERS BESIDE THE PICTURE. A chart is read; a table is checked. */}
      <div className="assoc-scroll" style={{ marginTop: 10 }}>
        <table className="assoc-table">
          <thead>
            <tr>
              {rank && <th style={{ width: 48 }}>#</th>}
              <th>{title}</th>
              <th style={{ textAlign: 'right' }}>Failures</th>
              <th style={{ textAlign: 'right' }}>Share</th>
              {rank && <th style={{ textAlign: 'right' }}>Cumulative</th>}
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.label} className={picked[dim] === r.label ? 'row-on' : undefined}>
                {rank && <td>{r.rank}</td>}
                <td>
                  <button className="linkish" onClick={() => onPick(dim)(r.label)}
                    title={picked[dim] === r.label ? 'Drop this filter' : 'Narrow every chart to this'}>
                    {r.label}
                  </button>
                </td>
                <td style={{ textAlign: 'right' }}>{r.value.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{(r.share * 100).toFixed(1)}%</td>
                {rank && <td style={{ textAlign: 'right' }}>{(r.cumulative * 100).toFixed(1)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function ProductFailureCharts({ rows: allRows, more = false }: { rows: Row[]; more?: boolean }) {
  const [period, setPeriod] = useState<Period>('month');
  const [trendLabels, setTrendLabels] = useState(false);
  // CROSS-FILTER. Clicking a bar, or a row of any table, narrows every other
  // chart — so "what is the root cause on ORION-G, under contract?" is two
  // clicks rather than a query nobody can write.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pick = (dim: string) => (label: string) =>
    setPicked((cur) => (cur[dim] === label ? (({ [dim]: _drop, ...rest }) => rest)(cur) : { ...cur, [dim]: label }));

  const dimValue = (r: Row, dim: string): string =>
    (dim === 'period' ? periodKey(s(r, 'review2_at') || s(r, 'reg_date'), period) : s(r, dim));

  const rows = useMemo(() => {
    const dims = Object.entries(picked);
    if (!dims.length) return allRows;
    return allRows.filter((r) => dims.every(([dim, label]) =>
      (dimValue(r, dim) || '(not answered)') === label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, picked, period]);

  const n = rows.length;
  const plus = more ? '+' : '';
  const countIf = (fn: (r: Row) => boolean) => rows.filter(fn).length;

  const byProduct = useMemo(() => tally(rows, 'live_product_name', '(no product)'), [rows]);
  const byCover = useMemo(() => tally(rows, 'item_status', '(no cover recorded)'), [rows]);
  const byRootCause = useMemo(() => tally(rows, 'root_cause_keyword'), [rows]);
  const byGrouping = useMemo(() => tally(rows, 'complaint_grouping'), [rows]);
  const byComplaint = useMemo(() => tally(rows, 'standard_complaint'), [rows]);
  const bySpareCat = useMemo(() => tally(rows, 'spare_category'), [rows]);
  const bySw = useMemo(() => tally(rows, 'sw_version', '(not captured)'), [rows]);

  // AGE KEEPS ITS OWN ORDER (see ParetoBlock): whether failures cluster early
  // or late in a machine's life is the finding, and ranking by count erases it.
  const byAge = useMemo(() => {
    const t = tally(rows, 'age_group', '(age unknown)');
    const order = new Map<string, number>();
    allRows.forEach((r) => {
      const g = s(r, 'age_group') || '(age unknown)';
      const d = Number(r.age_days);
      if (!order.has(g) || (Number.isFinite(d) && d < (order.get(g) ?? Infinity))) {
        order.set(g, Number.isFinite(d) ? d : Infinity);
      }
    });
    return [...t].sort((a, b) => (order.get(a.label) ?? Infinity) - (order.get(b.label) ?? Infinity));
  }, [rows, allRows]);

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

  const downloadTrend = () => {
    const when = new Date().toISOString().slice(0, 10);
    const per = PERIODS.find((x) => x.key === period)!.label;
    let run = 0;
    xlsxDownload(`product-failure-trend-${period}-${when}.xlsx`, [
      {
        name: 'Failures by period',
        columns: [per, 'Failures', 'Share', 'Running total'],
        rows: trend.map((t) => {
          run += t.value;
          return {
            [per]: t.label,
            Failures: t.value,
            Share: `${trendTotal ? ((t.value / trendTotal) * 100).toFixed(1) : '0.0'}%`,
            'Running total': run,
          };
        }),
      },
      {
        name: 'How this was worked out',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Counted by', Value: per },
          { Item: 'Which date decides the period',
            Value: 'the date Review 2 was answered, falling back to the call’s registration '
              + 'date where it has not been answered yet.' },
          { Item: 'A period with no failures',
            Value: 'is not a row. A gap is a gap in the register, not a zero somebody recorded.' },
          { Item: 'Failures counted', Value: trendTotal },
          { Item: 'Downloaded', Value: new Date().toISOString() },
        ],
      },
    ]);
    logAudit({ action: 'productfailure.trend.download', target: period, meta: { total: trendTotal } });
  };

  const effects = countIf((r) => yes(s(r, 'any_potential_effect')));
  const risk = countIf((r) => yes(s(r, 'risk_to_patient')));
  const warrantyFail = countIf((r) => yes(s(r, 'warranty_failure')));
  const frequent = countIf((r) => yes(s(r, 'frequent_failure')));
  const moved = countIf((r) => s(r, 'live_product_changed') === 'true' || r.live_product_changed === true);

  const RAW_DATE = 'review2_at';
  const RAW_DATE_LABEL = 'Review 2 answered on';

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
            {n.toLocaleString()}{plus} of {allRows.length.toLocaleString()}{plus} reviewed calls.
          </div>
        </SectionCard>
      )}

      <KpiGrid min={190}>
        <KpiCard label="Failures reviewed" value={`${n.toLocaleString()}${plus}`} tone="primary" icon="📋"
          sub="one per reviewed call" />
        <KpiCard label="Any potential effect" value={`${effects.toLocaleString()}${plus}`} icon="⚠️"
          tone={effects ? 'danger' : 'neutral'} sub="an FFR is raised from each" />
        <KpiCard label="Risk to patient" value={`${risk.toLocaleString()}${plus}`} icon="🚨"
          tone={risk ? 'danger' : 'neutral'} sub="answered Yes at Review 2" />
        <KpiCard label="Failed in warranty" value={`${warrantyFail.toLocaleString()}${plus}`} icon="🛡️"
          tone={warrantyFail ? 'warning' : 'neutral'} sub="inside the cover period" />
        <KpiCard label="Frequent failure" value={`${frequent.toLocaleString()}${plus}`} icon="🔁"
          tone={frequent ? 'warning' : 'neutral'} sub="flagged by either rule" />
        <KpiCard label="Product corrected" value={`${moved.toLocaleString()}${plus}`} icon="🔀"
          tone="info" sub="counted under the accessory that failed" />
      </KpiGrid>

      <ParetoBlock
        title="Which products fail"
        note="Counted under the product Review 2 says actually failed, so a fault moved to an
              accessory counts there and not against the machine it was logged on."
        rows={byProduct} total={n} dim="live_product_name" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Failures per cover"
        note="Warranty, contract or out of cover. A product failing mostly INSIDE warranty is a
              manufacturing question; one failing mostly outside it is a wear question."
        rows={byCover} total={n} dim="item_status" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Root cause"
        note="The few causes behind most of the failures — which is what the running share is for."
        rows={byRootCause} total={n} dim="root_cause_keyword" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Complaint grouping"
        rows={byGrouping} total={n} dim="complaint_grouping" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="What it was reported as"
        note="The complaint the customer gave, before anybody looked. Where this and the root cause
              disagree is where the fault is hard to describe from the outside."
        rows={byComplaint} total={n} dim="standard_complaint" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Which spares were implicated"
        rows={bySpareCat} total={n} dim="spare_category" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Software version"
        note="From the latest visit report. A fault clustering on one version is the kind of finding
              that reaches manufacturing."
        rows={bySw} total={n} dim="sw_version" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <ParetoBlock
        title="Age at failure"
        note="In its own order, NOT ranked by count: whether failures cluster early or late in a
              machine's life is the finding, and sorting by count would erase it."
        rank={false}
        rows={byAge} total={n} dim="age_group" picked={picked} onPick={pick}
        raw={rows} rawDateKey={RAW_DATE} rawDateLabel={RAW_DATE_LABEL} />

      <SectionCard title={`Failures, ${period === 'year' ? 'year by year'
        : period === 'quarter' ? 'quarter by quarter' : 'month by month'}`}>
        <div className="stage-chips">
          {PERIODS.map((p) => (
            <button key={p.key} className={`chip ${period === p.key ? 'chip-on' : ''}`}
              onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
          <button className={`chip ${trendLabels ? 'chip-on' : ''}`} onClick={() => setTrendLabels((v) => !v)}>
            {trendLabels ? '✓ ' : ''}Data labels
          </button>
          <button className="chip" onClick={downloadTrend}>⭳ Download</button>
        </div>
        <LineChart data={trend} showLabels={trendLabels}
          onPick={pick('period')} active={picked.period ?? null} />
        <div className="assoc-scroll" style={{ marginTop: 10 }}>
          <table className="assoc-table">
            <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>Failures</th>
              <th style={{ textAlign: 'right' }}>Share</th></tr></thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.label} className={picked.period === t.label ? 'row-on' : undefined}>
                  <td>
                    <button className="linkish" onClick={() => pick('period')(t.label)}>{t.label}</button>
                  </td>
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

export function ProductFailureAnalysis() {
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
        title="Product Failure Analysis" icon="📈"
        subtitle="What fails and why, from every reviewed call. Click any bar — or any row — to narrow every chart below it."
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
      {rows.length > 0 && <ProductFailureCharts rows={rows} more={more} />}
    </div>
  );
}
