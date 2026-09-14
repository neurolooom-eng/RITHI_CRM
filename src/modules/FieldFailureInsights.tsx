// ===========================================================================
// FIELD FAILURE — INSIGHTS.
//
// The user, 2026-09-12: "In Field Failure -- Add an Insights tab and Register."
//
// WHAT THIS ANSWERS THAT THE REGISTER DOES NOT. The register is a record: one
// row per failure, read one at a time. These are the questions asked ACROSS the
// record — which machine fails most, what it fails with, how many reports are
// open, and which have not been looked at this week. A register answers "what
// happened to this one"; this answers "what is happening".
//
// COMPUTED FROM THE ROWS ALREADY LOADED, not from a second set of queries. The
// register loads every report it may see (listFfrs pages to 5,000), so the
// aggregates here are over the WHOLE set rather than a page of it — which is
// why they carry no "+" (the count rule in CLAUDE.md: a number that looks exact
// and is not is worse than no number).
//
// THE COUNTS ARE OF REPORTS, NOT OF FAILURES. One report is one failure
// reported; a machine that failed twice has two. Said on the page rather than
// left to be assumed.
// ===========================================================================
import { useMemo, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart, LineChart, ParetoChart } from '../components/charts/Charts';
import { ffrDueForReview, ffrEffectWithdrawn } from '../lib/ffr';

type Row = Record<string, unknown>;

const s = (r: Row, k: string) => String(r[k] ?? '').trim();

/** Count by a key, biggest first, with blanks gathered rather than dropped —
 *  "not stated" is a finding about the register, and silently omitting it makes
 *  the chart add up to less than the total with nothing saying why. */
function tally(rows: Row[], key: string, blankLabel = '(not stated)'): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = s(r, key) || blankLabel;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// THE PERIOD THE TREND IS READ AT (the user's ask, 2026-09-14: "Allow me to
// adjust it [Monthly , Quarterly , Yearly]").
//
// ONE FUNCTION TURNS A DATE INTO A BUCKET, and it is the SAME one the
// cross-filter uses. That matters more than it looks: the trend's marks are
// clickable, so a bucket key is also a FILTER VALUE. If the chart grouped by
// quarter while `dimValue` still answered in months, clicking 2026-Q1 would
// filter on a value no row has and the page would silently empty.
// ---------------------------------------------------------------------------
export type Period = 'month' | 'quarter' | 'year';
export const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

/** The bucket a report falls in, from its FFR DATE. Empty for an unparseable
 *  date — counted nowhere rather than in the wrong period. */
export function periodKey(iso: string, p: Period): string {
  const d = iso.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(d)) return '';
  const [y, mo] = d.split('-');
  if (p === 'year') return y;
  if (p === 'quarter') return `${y}-Q${Math.floor((Number(mo) - 1) / 3) + 1}`;
  return d;
}

/** What the axis reads. A month is shown YY-MM so twelve fit across; a quarter
 *  and a year are short enough already, and shortening a YEAR to two digits
 *  would be actively worse — "25" beside "26" is a month to most readers. */
const periodLabel = (key: string, p: Period): string =>
  (p === 'month' ? key.slice(2) : key);

/** Reports per period of their FFR date, oldest first — a trend reads left to
 *  right in time, not in size. */
function byPeriod(rows: Row[], p: Period): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = periodKey(s(r, 'ffr_date'), p);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label: periodLabel(label, p), value }));
}

// ---------------------------------------------------------------------------
// THE DIMENSIONS YOU CAN INTERROGATE THE REGISTER BY.
//
// One list, used for the filtering, the chips and the charts alike, so a
// dimension cannot be filterable but unnamed, or named and not actually
// filtered — which is the way a cross-filter usually goes wrong.
// `month` reads the first seven characters of ffr_date rather than a column.
// ---------------------------------------------------------------------------
const DIMS = [
  { key: 'product_name', label: 'Machine' },
  { key: 'cover', label: 'Cover' },
  { key: 'ffr_status', label: 'Report status' },
  { key: 'capa_status', label: 'CAPA' },
  { key: 'live_root_cause_keyword', label: 'Root cause' },
  { key: 'live_complaint_grouping', label: 'Grouping' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'month', label: 'Month' },
] as const;
type DimKey = (typeof DIMS)[number]['key'];
type Picked = Partial<Record<DimKey, string>>;

const BLANK = '(not stated)';
/** The value a row has for a dimension, matching what `tally` put on the chart
 *  — including the blank label, so clicking "(not stated)" selects exactly the
 *  rows that bar counted.
 *
 *  THE PERIOD IS PASSED IN, not read from a module variable: the trend's marks
 *  are filter values, so this must bucket a date exactly as the chart did or a
 *  click selects nothing. It is also why the axis LABEL and the filter VALUE
 *  are kept apart — the chart shows `26-03`, the filter holds `2026-03`. */
const dimValue = (r: Row, k: DimKey, p: Period) =>
  (k === 'month'
    ? periodLabel(periodKey(s(r, 'ffr_date'), p), p) || '(no date)'
    : s(r, k)) || BLANK;

/** Rows matching every chosen dimension EXCEPT the ones named in `except`.
 *
 *  Excluding a chart's OWN dimension is what makes this a cross-filter rather
 *  than a search box: filter the Machine chart by the machine you just clicked
 *  and it collapses to the single bar you already knew about. Every OTHER chart
 *  narrows, which is the question being asked — "for this machine, what else is
 *  true?" */
function applyPicks(rows: Row[], picked: Picked, p: Period, except?: DimKey): Row[] {
  const keys = (Object.keys(picked) as DimKey[]).filter((k) => k !== except && picked[k]);
  if (!keys.length) return rows;
  return rows.filter((r) => keys.every((k) => dimValue(r, k, p) === picked[k]));
}

/** The dimensions a Pareto is worth drawing over. Not every one of them: a
 *  Pareto ranks CONTRIBUTORS to a total, so it says something about machines,
 *  causes and customers, and nothing at all about a period (which is a
 *  sequence) or a status (which is an outcome, not a contributor). */
const PARETO_DIMS = [
  { key: 'product_name', label: 'Machine' },
  { key: 'live_root_cause_keyword', label: 'Root cause' },
  { key: 'live_complaint_grouping', label: 'Grouping' },
  { key: 'customer_name', label: 'Customer' },
] as const;
type ParetoKey = (typeof PARETO_DIMS)[number]['key'];

export function FieldFailureInsights({ rows: allRows }: { rows: Row[] }) {
  const [picked, setPicked] = useState<Picked>({});
  const [period, setPeriod] = useState<Period>('month');
  // MACHINE, not root cause, and the choice is measured rather than assumed:
  // `product_name` is NOT NULL on every report, while the root cause comes from
  // the Daily Call Review and is blank on anything migrated from the sheet. A
  // Pareto whose tallest bar is "(not stated)" ranks nothing — it is a finding
  // about the register, and it belongs on a chart somebody chose to look at.
  const [paretoBy, setParetoBy] = useState<ParetoKey>('product_name');

  /** Clicking the chosen mark again clears it — the same gesture both ways, so
   *  nobody has to find a separate control to undo what a click did. */
  const pick = (k: DimKey) => (label: string) =>
    setPicked((p) => (p[k] === label ? { ...p, [k]: undefined } : { ...p, [k]: label }));

  const rows = useMemo(() => applyPicks(allRows, picked, period), [allRows, picked, period]);
  const active = (Object.keys(picked) as DimKey[]).filter((k) => picked[k]);

  const stats = useMemo(() => {
    // A WEEK AGO, for "not looked at since". The weekly cycle is the reason
    // reviewed_at exists (0168) — updated_at cannot answer it, because any edit
    // moves that.
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return {
      total: rows.length,
      open: rows.filter((r) => s(r, 'ffr_status') === 'Open').length,
      closed: rows.filter((r) => s(r, 'ffr_status') === 'Closed').length,
      cancelled: rows.filter((r) => s(r, 'ffr_status') === 'Cancelled').length,
      due: rows.filter((r) => ffrDueForReview(r, weekAgo)).length,
      withdrawn: rows.filter((r) => ffrEffectWithdrawn(r)).length,
      capaOpen: rows.filter((r) => /^(open|in-progress)$/i.test(s(r, 'capa_status'))).length,
      // MIGRATED vs RAISED HERE. Not decoration: a report typed into a
      // spreadsheet years ago and one this system raised from a review are both
      // quality records, but they are not the same kind of evidence — the
      // second carries its own history and the rule that raised it. URS-037
      // requires a figure drawn from both to report the split, and every
      // aggregate on this page is drawn from both.
      migrated: rows.filter((r) => s(r, 'imported_from') !== '').length,
      unsolved: rows.filter((r) => {
        const st = s(r, 'live_call_status') || s(r, 'current_call_status');
        return st !== '' && !/^solved/i.test(st);
      }).length,
    };
  }, [rows]);

  // Each chart counts the rows left by EVERY OTHER choice — see applyPicks.
  const forDim = (k: DimKey) => applyPicks(allRows, picked, period, k);
  const byProduct = useMemo(() => tally(forDim('product_name'), 'product_name'), [allRows, picked]);
  const byCover = useMemo(() => tally(forDim('cover'), 'cover'), [allRows, picked]);
  const byStatus = useMemo(() => tally(forDim('ffr_status'), 'ffr_status'), [allRows, picked]);
  const byCapa = useMemo(() => tally(forDim('capa_status'), 'capa_status'), [allRows, picked]);
  const byRootCause = useMemo(() => tally(forDim('live_root_cause_keyword'), 'live_root_cause_keyword'), [allRows, picked]);
  const byGrouping = useMemo(() => tally(forDim('live_complaint_grouping'), 'live_complaint_grouping'), [allRows, picked]);
  const byCustomer = useMemo(() => tally(forDim('customer_name'), 'customer_name'), [allRows, picked]);
  const trend = useMemo(() => byPeriod(forDim('month'), period), [allRows, picked, period]);
  // The Pareto is a cross-filtered tally like the rest, over whichever
  // dimension is chosen — so clicking a bar on it narrows every other chart.
  const pareto = useMemo(() => tally(forDim(paretoBy), paretoBy), [allRows, picked, period, paretoBy]);
  const paretoTotal = pareto.reduce((n, d) => n + d.value, 0);
  const paretoBlank = pareto.find((d) => d.label === BLANK)?.value ?? 0;

  if (!allRows.length) {
    return (
      <SectionCard title="Insights">
        <div className="muted">No Field Failure Reports on the register yet — there is nothing to analyse.</div>
      </SectionCard>
    );
  }

  return (
    <div>
      {/* WHAT THE PAGE IS ANSWERING FOR, in words, above the numbers. Every
          figure below moves when a mark is clicked, and a page that quietly
          changed what it was counting would be worse than one that could not be
          filtered at all. */}
      <div className="ffr-picks">
        {active.length === 0 ? (
          <span className="muted">
            Click any bar, column or slice to narrow every figure on this page to it. Click it again to clear.
          </span>
        ) : (
          <>
            <b>
              {rows.length} of {allRows.length} reports
            </b>
            {active.map((k) => (
              <button key={k} type="button" className="ffr-chip"
                      title="Remove this"
                      onClick={() => setPicked((p) => ({ ...p, [k]: undefined }))}>
                {/* The period dimension is named for what it currently HOLDS.
                    A chip reading "Month: 2026-Q1" would be plainly wrong, and
                    it is the one label on this page that moves. */}
                {k === 'month'
                  ? (period === 'year' ? 'Year' : period === 'quarter' ? 'Quarter' : 'Month')
                  : DIMS.find((d) => d.key === k)!.label}: {picked[k]} <span aria-hidden>×</span>
              </button>
            ))}
            <button type="button" className="ffr-chip ffr-chip-clear" onClick={() => setPicked({})}>
              Clear all
            </button>
          </>
        )}
      </div>
      {rows.length === 0 && (
        <SectionCard title="Nothing matches">
          <div className="muted">
            No report matches every choice above. Remove one of them to widen it again.
          </div>
        </SectionCard>
      )}
      <KpiGrid>
        <KpiCard label="Reports" value={stats.total} icon="🧪" tone="primary" sub="on the register" />
        <KpiCard label="Open" value={stats.open} icon="📂" tone={stats.open ? 'warning' : 'neutral'} sub="not yet closed" />
        <KpiCard label="Due a review" value={stats.due} icon="⏳" tone={stats.due ? 'danger' : 'success'}
                 sub="open, not looked at this week" />
        <KpiCard label="CAPA in hand" value={stats.capaOpen} icon="🛠" tone={stats.capaOpen ? 'warning' : 'neutral'}
                 sub="Open or In-Progress" />
        <KpiCard label="Call still open" value={stats.unsolved} icon="🔥" tone={stats.unsolved ? 'danger' : 'neutral'}
                 sub="report raised, call unsolved" />
        {/* An FFR raised on Any Potential Effect = YES whose review now reads NO.
            The record stands (0049) — this is how somebody SEES that happened,
            which is the whole reason the live columns are on the register. */}
        <KpiCard label="Effect withdrawn" value={stats.withdrawn} icon="↩" tone={stats.withdrawn ? 'warning' : 'neutral'}
                 sub="raised on YES, review now says otherwise" />
        <KpiCard label="Closed" value={stats.closed} icon="✅" tone="success" sub="" />
        <KpiCard label="Cancelled" value={stats.cancelled} icon="✕" tone="neutral" sub="marked, never deleted" />
        <KpiCard label="Migrated" value={stats.migrated} icon="⤵" tone="neutral"
                 sub="loaded from the register sheet, not raised here" />
      </KpiGrid>

      <SectionCard title="Which machines fail">
        <div className="muted" style={{ marginBottom: 10 }}>
          One report is one failure reported — a machine that failed twice appears twice.
        </div>
        <BarChart data={byProduct.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))}
                  onPick={pick('product_name')} active={picked.product_name ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Under what cover">
        <div className="muted" style={{ marginBottom: 10 }}>
          A failure under warranty (WGP) is the company’s cost and the one worth watching.
        </div>
        <DonutChart data={byCover} onPick={pick('cover')} active={picked.cover ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title={`Reports raised, ${period === 'year' ? 'year by year'
        : period === 'quarter' ? 'quarter by quarter' : 'month by month'}`}>
        <div className="ffr-chart-bar">
          <span className="muted">Read it</span>
          {PERIODS.map((p) => (
            <button key={p.key} type="button"
                    className={`chip ${period === p.key ? 'chip-on' : ''}`}
                    aria-pressed={period === p.key}
                    onClick={() => {
                      // THE CHOSEN PERIOD IS CLEARED WITH THE SCALE. "2026-03"
                      // is not a quarter, so keeping it would leave a chip
                      // filtering on a value no row can match — the page would
                      // empty and nothing on screen would say why.
                      setPicked((q) => ({ ...q, month: undefined }));
                      setPeriod(p.key);
                    }}>
              {p.label}
            </button>
          ))}
        </div>
        <LineChart data={trend} onPick={pick('month')} active={picked.month ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Pareto — the few that account for most">
        <div className="ffr-chart-bar">
          <span className="muted">By</span>
          {PARETO_DIMS.map((d) => (
            <button key={d.key} type="button"
                    className={`chip ${paretoBy === d.key ? 'chip-on' : ''}`}
                    aria-pressed={paretoBy === d.key}
                    onClick={() => setParetoBy(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Bars are the count, the line is the running share of all {paretoTotal} report
          {paretoTotal === 1 ? '' : 's'}, and the dashes mark 80%. Everything left of where
          the line crosses accounts for four-fifths of them — that is the shortlist, not a
          verdict.
          {paretoBlank > 0 && (
            <> <b>{paretoBlank}</b> of them are <b>{BLANK}</b>, and that is kept in rather
            than dropped: a gap this size in the record is itself the finding.</>
          )}
        </div>
        <ParetoChart data={pareto.slice(0, 14)} onPick={pick(paretoBy)}
                     active={picked[paretoBy] ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Root cause, from the Daily Call Review">
        <div className="muted" style={{ marginBottom: 10 }}>
          Taken from the review as it stands now, not as it stood when the report was raised —
          a cause corrected later should read corrected here.
        </div>
        <BarChart data={byRootCause.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))}
                  onPick={pick('live_root_cause_keyword')} active={picked.live_root_cause_keyword ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Complaint grouping">
        <BarChart data={byGrouping.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))}
                  onPick={pick('live_complaint_grouping')} active={picked.live_complaint_grouping ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Where they are raised">
        <BarChart data={byCustomer.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))}
                  onPick={pick('customer_name')} active={picked.customer_name ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Report status">
        <DonutChart data={byStatus} onPick={pick('ffr_status')} active={picked.ffr_status ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="CAPA status">
        <BarChart data={byCapa} onPick={pick('capa_status')} active={picked.capa_status ?? null} />
      </SectionCard>
    </div>
  );
}
