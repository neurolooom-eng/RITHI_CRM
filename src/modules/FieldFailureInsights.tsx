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
import { xlsxDownload } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { partial } from '../lib/exportscope';

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
  // THE EFFECTIVE PRODUCT, not the one the call named (0197). Where Review 2
  // decided an accessory failed, the report counts under the accessory and NOT
  // under the machine it was fitted to — which is both halves of the ask, and a
  // single value is what makes them consistent.
  { key: 'live_product_name', label: 'Machine' },
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

// ---------------------------------------------------------------------------
// THE PARETO DRILLS DOWN THREE LEVELS.
//
// The user, 2026-09-14: "I want for the Product at a Root Cause / Complaint
// Grouping Level as well. Not just at the Product Level -- I need 3 Levels of
// Drill Down , Product , Complaint Grouping , Root Cause Key Word".
//
// A CHAIN, NOT A CHOICE. The first version of this offered a "rank by" selector
// — four dimensions, pick one — and that answers a different question. "Which
// machines fail most" and "which root causes are behind them" are not two
// charts you switch between; the second is asked OF the first. So clicking a
// bar goes DOWN a level rather than swapping the chart.
//
// AND THE ORDER OF THE LAST TWO IS THE READER'S (the user, 2026-09-14: "The 2nd
// and the 3rd are interchangeable or can be skipped"). Machine first, because
// that is the thing being analysed; after that, whether you ask "which
// groupings, then which causes" or "which causes, then which groupings" is a
// question about the investigation, not about the data. Either can also be
// stepped over: with a grouping chosen you may go straight past causes, and
// with neither chosen you may start at causes. So the chart shows the levels
// still OPEN and lets one be chosen, rather than marching through three.
//
// THE LEVEL IS DERIVED FROM THE FILTERS, never held in its own state. Drilling
// sets the same `picked` the rest of the page reads, so the Pareto cannot show
// a level the page is not filtered to — and picking a machine on the bar chart
// above advances this chart too, which is the same question asked from the
// other end. Two sources of truth for "where am I" is how a drill-down starts
// showing one thing and claiming another.
// ---------------------------------------------------------------------------
const PARETO_LEVELS = [
  { key: 'live_product_name', label: 'Machine', of: 'machines' },
  { key: 'live_complaint_grouping', label: 'Complaint grouping', of: 'groupings' },
  { key: 'live_root_cause_keyword', label: 'Root cause', of: 'root causes' },
] as const;
type ParetoKey = (typeof PARETO_LEVELS)[number]['key'];

export function FieldFailureInsights({ rows: allRows, more = false }: { rows: Row[]; more?: boolean }) {
  const [picked, setPicked] = useState<Picked>({});
  const [period, setPeriod] = useState<Period>('month');
  const [trendLabels, setTrendLabels] = useState(false);
  // OFF BY DEFAULT, like the trend's. A Pareto carries two numbers per bar —
  // the count and the running percentage — so at fourteen categories the labels
  // are dense, and whether that is useful or noise depends on how many bars are
  // on screen. The reader's call.
  const [paretoLabels, setParetoLabels] = useState(false);

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
  const byProduct = useMemo(() => tally(forDim('live_product_name'), 'live_product_name'), [allRows, picked]);
  const byCover = useMemo(() => tally(forDim('cover'), 'cover'), [allRows, picked]);
  const byStatus = useMemo(() => tally(forDim('ffr_status'), 'ffr_status'), [allRows, picked]);
  const byCapa = useMemo(() => tally(forDim('capa_status'), 'capa_status'), [allRows, picked]);
  const byRootCause = useMemo(() => tally(forDim('live_root_cause_keyword'), 'live_root_cause_keyword'), [allRows, picked]);
  const byGrouping = useMemo(() => tally(forDim('live_complaint_grouping'), 'live_complaint_grouping'), [allRows, picked]);
  const byCustomer = useMemo(() => tally(forDim('customer_name'), 'customer_name'), [allRows, picked]);
  const trendSrc = useMemo(() => forDim('month'), [allRows, picked, period]);
  const trend = useMemo(() => byPeriod(trendSrc, period), [trendSrc, period]);

  // THE TREND'S NUMBERS, computed ONCE and drawn twice — the same rule the
  // Pareto table follows. `change` is against the period ABOVE it in the table,
  // which is the previous one because byPeriod() sorts ascending by key.
  const trendTotal = trend.reduce((n, d) => n + d.value, 0);
  const trendRows = useMemo(() => {
    let run = 0;
    return trend.map((d, i) => {
      run += d.value;
      const prev = i > 0 ? trend[i - 1].value : null;
      return {
        label: d.label, value: d.value,
        // NULL, not 0, for the first period: "no previous period" and "no
        // change" are different answers and a dash says so.
        change: prev === null ? null : d.value - prev,
        share: trendTotal ? d.value / trendTotal : 0,
        running: run,
      };
    });
  }, [trend, trendTotal]);

  const downloadTrend = () => {
    const when = new Date().toISOString().slice(0, 10);
    const scope = DIMS.filter((d) => picked[d.key]).map((d) => `${d.label}: ${picked[d.key]}`)
      .join(' · ') || 'the whole register';
    const per = PERIODS.find((x) => x.key === period)!.label;
    xlsxDownload(`ffr-trend-${period}-${when}.xlsx`, [
      {
        name: 'Reports by period',
        columns: [per, 'Reports', 'Change on the one before', 'Share', 'Share worked out',
                  'Running total'],
        rows: trendRows.map((r) => ({
          [per]: r.label,
          Reports: r.value,
          'Change on the one before': r.change === null ? '—'
            : r.change > 0 ? `+${r.change}` : String(r.change),
          Share: `${(r.share * 100).toFixed(1)}%`,
          'Share worked out': `${r.value} ÷ ${trendTotal}`,
          'Running total': r.running,
        })),
      },
      rawSheet(trendSrc, 'ffr_date', 'FFR date (the period comes from this)'),
      {
        name: 'How this was worked out',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Counted by', Value: per },
          { Item: 'Narrowed to', Value: scope },
          { Item: 'Reports counted', Value: trendTotal },
          { Item: 'Periods shown', Value: trendRows.length },
          { Item: '', Value: '' },
          { Item: 'Which date decides the period',
            Value: 'ffr_date — when the report was RAISED, not when the call came in and not '
              + 'when it was last edited.' },
          { Item: 'A period with no reports',
            Value: 'is not a row. The chart joins the periods that exist; a gap is a gap in the '
              + 'register, not a zero somebody recorded.' },
          { Item: 'Change on the one before',
            Value: 'this period’s reports minus the previous ROW’S — the previous row, which is '
              + 'the previous period only where the register has one. The first row has none.' },
          { Item: 'Share', Value: 'this period’s reports ÷ the reports counted' },
          { Item: '', Value: '' },
          { Item: 'What a report is',
            Value: 'ONE FIELD FAILURE REPORT. A machine that failed twice appears twice; '
              + 'a report covering several machines is still one report.' },
          { Item: '', Value: '' },
          { Item: 'Downloaded', Value: new Date().toISOString() },
        ],
      },
    ], partial(more));
    logAudit({ action: 'ffr.trend.download', target: `${period} ${when}`,
               meta: { rows: trendRows.length, total: trendTotal, scope } });
  };

  // WHAT IS STILL OPEN TO RANK: every level whose dimension has not been chosen.
  // With nothing chosen that is all three; choose a machine and it is grouping
  // and root cause, in either order or neither.
  const paretoOpen = PARETO_LEVELS.filter((l) => !picked[l.key]);
  // WHICH ONE IS ON SCREEN. The reader's pick if it is still open, else the
  // first open level — so drilling advances on its own, and a step back that
  // re-opens a level does not leave the chart pointing at a closed one.
  const [paretoWant, setParetoWant] = useState<ParetoKey | ''>('');
  const paretoBy: ParetoKey =
    (paretoWant && paretoOpen.some((l) => l.key === paretoWant) ? paretoWant : paretoOpen[0]?.key)
    ?? PARETO_LEVELS[PARETO_LEVELS.length - 1].key;
  const paretoAt = PARETO_LEVELS.find((l) => l.key === paretoBy)!;
  const paretoDone = PARETO_LEVELS.filter((l) => picked[l.key]);
  // A cross-filtered tally like the rest — so it ranks groupings WITHIN the
  // chosen machine without this file doing any filtering of its own.
  // NAMED ONCE AND USED TWICE — by the tally that draws the chart and by the
  // raw sheet in the download. Two calls to forDim() would be two arrays that
  // only have to disagree once for the file to stop reconciling.
  const paretoSrc = useMemo(() => forDim(paretoBy), [allRows, picked, period, paretoBy]);
  const pareto = useMemo(() => tally(paretoSrc, paretoBy), [paretoSrc, paretoBy]);
  const paretoTotal = pareto.reduce((n, d) => n + d.value, 0);
  const paretoBlank = pareto.find((d) => d.label === BLANK)?.value ?? 0;

  // THE TABLE AND THE CHART ARE ONE ARRAY. Every figure the reader sees — the
  // share, the running total, the cumulative percentage, which rows are inside
  // the 80% — is computed ONCE, here, and then drawn twice. A table built from
  // its own pass over the same rows is a second implementation of the same
  // arithmetic, and the two only have to disagree once to be worthless.
  const PARETO_SHOWN = 14;
  const paretoRows = useMemo(() => {
    let run = 0;
    return pareto.slice(0, PARETO_SHOWN).map((d) => {
      run += d.value;
      return {
        label: d.label, value: d.value,
        share: paretoTotal ? d.value / paretoTotal : 0,
        running: run,
        cum: paretoTotal ? run / paretoTotal : 0,
        // Filled below, once the crossing is known.
        vital: false,
      };
    });
  }, [pareto, paretoTotal]);
  const paretoCrossing = paretoRows.findIndex((r) => r.cum >= 0.8);
  paretoRows.forEach((r, i) => { r.vital = paretoCrossing >= 0 && i <= paretoCrossing; });

  /** THE REPORTS THEMSELVES — one line per Field Failure Report, so a reader
   *  can add them up and land on the chart's number.
   *
   *  The user's ask, 2026-09-14: "In the Download, i want the Raw data of how
   *  that Number was arrived at". The summary says a root cause has four
   *  reports; this says WHICH four. Without it the file is checkable only in
   *  the sense that its own arithmetic is consistent — it can still be counting
   *  the wrong rows, and nothing in the file would show that.
   *
   *  `bucket` is the value the row was COUNTED UNDER, put first, so sorting on
   *  it in the spreadsheet reproduces the chart exactly. It is the row's own
   *  value for the ranked dimension — not re-derived here, which would be a
   *  second implementation of the tally and could disagree with it.
   */
  const rawSheet = (src: Row[], bucketKey: string, bucketLabel: string) => ({
    name: 'The reports behind it',
    columns: [bucketLabel, 'FFR No', 'FFR date', 'UCN', 'Machine', 'Serial', 'Customer',
              'Cover', 'Complaint grouping', 'Root cause', 'Problem reported',
              'FFR status', 'Call status', 'CAPA status', 'Raised by', 'Origin'],
    rows: src.map((r) => ({
      [bucketLabel]: s(r, bucketKey) || BLANK,
      'FFR No': s(r, 'ffr_no'),
      'FFR date': s(r, 'ffr_date'),
      UCN: s(r, 'ucn'),
      Machine: s(r, 'live_product_name') || s(r, 'product_name'),
      // BOTH, where they differ: the raw sheet is the evidence, and a reader
      // adding up the rows has to be able to see why one sits under CPX CARE
      // while its report names ORION-G.
      'Machine the call named': s(r, 'product_name'),
      Serial: s(r, 'product_serial'),
      Customer: s(r, 'customer_name'),
      Cover: s(r, 'cover'),
      'Complaint grouping': s(r, 'live_complaint_grouping'),
      'Root cause': s(r, 'live_root_cause_keyword'),
      'Problem reported': s(r, 'problem_reported'),
      'FFR status': s(r, 'ffr_status'),
      'Call status': s(r, 'live_call_status') || s(r, 'current_call_status'),
      'CAPA status': s(r, 'capa_status'),
      'Raised by': s(r, 'raised_by_name'),
      // MIGRATED OR RAISED HERE — the same split URS-037 asks every figure on
      // this page to report. A blank means this system raised it.
      Origin: s(r, 'imported_from') || 'Raised here',
    })),
  });

  /** The split-up as a file, with the arithmetic beside it rather than behind
   *  it — the same standard the Objective evidence pack is held to: a number
   *  somebody may act on has to be checkable without this screen. */
  const downloadPareto = () => {
    const when = new Date().toISOString().slice(0, 10);
    const scope = PARETO_LEVELS.filter((l) => picked[l.key])
      .map((l) => `${l.label}: ${picked[l.key]}`).join(' · ') || 'the whole register';
    xlsxDownload(`ffr-pareto-${paretoBy}-${when}.xlsx`, [
      {
        name: 'Pareto',
        columns: ['#', paretoAt.label, 'Reports', 'Share', 'Share worked out',
                  'Running total', 'Cumulative %', 'Cumulative worked out', 'Inside 80%?'],
        rows: paretoRows.map((r, i) => ({
          '#': i + 1,
          [paretoAt.label]: r.label,
          Reports: r.value,
          Share: `${(r.share * 100).toFixed(1)}%`,
          'Share worked out': `${r.value} ÷ ${paretoTotal}`,
          'Running total': r.running,
          'Cumulative %': `${(r.cum * 100).toFixed(1)}%`,
          'Cumulative worked out': `${r.running} ÷ ${paretoTotal}`,
          'Inside 80%?': r.vital ? 'yes' : 'no',
        })),
      },
      // THE SAME ROWS THE CHART COUNTED, not a fresh query: `paretoSrc` IS the
      // array `tally()` was given, so the lines here add up to the totals above
      // by construction rather than by coincidence.
      rawSheet(paretoSrc, paretoBy, paretoAt.label),
      {
        name: 'How this was worked out',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Ranked by', Value: paretoAt.label },
          { Item: 'Narrowed to', Value: scope },
          { Item: 'Period shown', Value: PERIODS.find((x) => x.key === period)!.label },
          { Item: 'Reports counted', Value: paretoTotal },
          { Item: 'Rows on the chart', Value: paretoRows.length },
          { Item: '', Value: '' },
          { Item: 'Share', Value: 'this row’s reports ÷ the reports counted' },
          { Item: 'Running total', Value: 'this row’s reports plus every row above it' },
          { Item: 'Cumulative %', Value: 'the running total ÷ the reports counted' },
          { Item: 'Inside 80%?', Value: 'yes up to and including the first row whose Cumulative % reaches 80' },
          { Item: '', Value: '' },
          { Item: 'What a report is',
            Value: 'ONE FIELD FAILURE REPORT. A machine that failed twice appears twice; '
              + 'a report covering several machines is still one report.' },
          { Item: 'Where the figures come from',
            Value: 'The Field Failure Register as it stands now, including the live Root Cause '
              + 'and Grouping from the Daily Complaint Review Register — a cause corrected later reads corrected here.' },
          ...(paretoBlank > 0
            ? [{ Item: `"${BLANK}"`,
                 Value: `${paretoBlank} report(s) do not state this. They are KEPT in the ranking rather `
                   + 'than dropped: a gap this size is itself the finding, and removing it would make '
                   + 'every percentage below it wrong.' }]
            : []),
          ...(pareto.length > paretoRows.length
            ? [{ Item: 'Not shown',
                 Value: `${pareto.length - paretoRows.length} smaller ${paretoAt.of} beyond the first `
                   + `${paretoRows.length}. They are inside the total, so the percentages are over `
                   + 'everything and not only over what is drawn.' }]
            : []),
          { Item: '', Value: '' },
          { Item: 'Downloaded', Value: new Date().toISOString() },
        ],
      },
    ], partial(more));
    logAudit({ action: 'ffr.pareto.download', target: `${paretoBy} ${when}`,
               meta: { rows: paretoRows.length, total: paretoTotal, scope } });
  };
  /** Drop ONE level's choice. Not "and everything under it": with the order
   *  free there is no "under" — dropping the grouping while keeping the machine
   *  and the cause is a coherent question, and the chart simply re-opens that
   *  level to rank. */
  const paretoDrop = (k: ParetoKey) => { setPicked((q) => ({ ...q, [k]: undefined })); setParetoWant(k); };

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
        {/* NO LONGER TRUNCATED AT 46 CHARACTERS. That slice pre-dated the
            adjustable column and would have made widening it pointless —
            the reader would drag the column open and find the name had
            already been cut before it got here. */}
        <BarChart data={byProduct.slice(0, 12)} widthKey="ffr.product"
                  onPick={pick('live_product_name')} active={picked.live_product_name ?? null} />
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
          <div className="spacer" />
          {/* OFF BY DEFAULT. Over twenty-odd months the numbers collide and
              read as noise, and which it is depends on how many periods are on
              screen — so it is the reader's call, not a default. */}
          <button type="button" className={`chip ${trendLabels ? 'chip-on' : ''}`}
                  aria-pressed={trendLabels}
                  onClick={() => setTrendLabels((v) => !v)}>
            {trendLabels ? '✓ ' : ''}Data labels
          </button>
        </div>
        {/* THE NUMBERS BESIDE THE LINE, as they are beside the Pareto (the
            user's ask, 2026-09-14: "Same kinda Data table on the Side for
            'Reports raised, month by month'"). A trend is read for its SHAPE
            and acted on from its figures, and reading a value off a line by
            eye is how a rise of two gets reported as a rise of five. Same
            array the chart draws, so the two cannot disagree. */}
        <div className="ffr-split">
          <div className="ffr-split-chart">
            <LineChart data={trend} showLabels={trendLabels}
                       onPick={pick('month')} active={picked.month ?? null} />
          </div>
          <div className="ffr-split-table">
            <table className="ffr-mini">
              <thead>
                <tr>
                  <th>{PERIODS.find((x) => x.key === period)!.label}</th>
                  <th className="num">Reports</th><th className="num">Change</th>
                  <th className="num">Share</th><th className="num">Running</th>
                </tr>
              </thead>
              <tbody>
                {trendRows.map((r) => (
                  <tr key={r.label}
                      className={picked.month === r.label ? 'is-active' : ''}
                      onClick={() => pick('month')(r.label)}
                      title={`${r.value} of ${trendTotal} = ${(r.share * 100).toFixed(1)}%`}>
                    <td>{r.label}</td>
                    <td className="num">{r.value}</td>
                    {/* A DASH FOR THE FIRST ROW. There is no period before it,
                        which is not the same as no change. */}
                    <td className={`num ${r.change === null ? 'muted' : r.change > 0 ? 'ffr-up' : r.change < 0 ? 'ffr-down' : 'muted'}`}>
                      {r.change === null ? '—' : r.change > 0 ? `+${r.change}` : r.change}
                    </td>
                    <td className="num">{(r.share * 100).toFixed(1)}%</td>
                    <td className="num muted">{r.running}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{trendTotal}</td>
                  <td /><td className="num">100.0%</td><td />
                </tr>
              </tfoot>
            </table>
            <div className="ffr-split-foot">
              <span className="muted">
                Share = reports ÷ {trendTotal}. Change is on the period above.
              </span>
              <button className="btn btn-sm" onClick={downloadTrend}>⬳ Download</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title={`Pareto — ${paretoAt.of}`}>
        {/* WHERE YOU ARE AND WHAT IS LEFT. The chosen levels read as the path;
            the open ones are buttons, so the next question is picked rather
            than marched to. A drill-down with no path shown is a chart that has
            quietly changed what it is counting. */}
        <div className="ffr-chart-bar">
          {paretoDone.map((l) => (
            <span key={l.key} className="ffr-crumb-step">
              <button type="button" className="chip ffr-crumb-done"
                      title={`Drop this and rank ${l.of} again`}
                      onClick={() => paretoDrop(l.key)}>
                {l.label}: {picked[l.key]} <span aria-hidden>×</span>
              </button>
              <span className="ffr-crumb-sep" aria-hidden>›</span>
            </span>
          ))}
          {paretoOpen.length > 1 && <span className="muted">Rank</span>}
          {paretoOpen.map((l) => (
            <button key={l.key} type="button"
                    className={`chip ${l.key === paretoBy ? 'chip-on' : ''}`}
                    aria-pressed={l.key === paretoBy}
                    onClick={() => setParetoWant(l.key)}>
              {l.label}
            </button>
          ))}
          {/* VIEWING OPTIONS ON THE RIGHT, filters on the left (the user's
              standing arrangement, 2026-09-14). The level buttons above CHANGE
              WHAT IS COUNTED; this only changes how it is drawn. */}
          <div className="spacer" />
          <button type="button" className={`chip ${paretoLabels ? 'chip-on' : ''}`}
                  aria-pressed={paretoLabels}
                  onClick={() => setParetoLabels((v) => !v)}>
            {paretoLabels ? '✓ ' : ''}Data labels
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Bars are the count, the line is the running share of all {paretoTotal} report
          {paretoTotal === 1 ? '' : 's'}, and the dashes mark 80%. Everything left of where
          the line crosses accounts for four-fifths of them — that is the shortlist, not a
          verdict.
          {paretoOpen.length > 1
            ? <> Click a bar to fix that {paretoAt.label.toLowerCase()} and rank what is left within it.</>
            : <> Nothing is left to drill into; clicking a bar just narrows the page to it.</>}
          {paretoBlank > 0 && (
            <> <b>{paretoBlank}</b> of them are <b>{BLANK}</b>, and that is kept in rather
            than dropped: a gap this size in the record is itself the finding.</>
          )}
        </div>
        {/* THE CHART AND ITS NUMBERS SIDE BY SIDE (the user's ask, 2026-09-14:
            "Give me the Pareto Data right next to the Chart ... Provide Clean
            Split Up and how that data point / % was arrived at").
            A Pareto is READ off the line and ACTED on from the numbers, and
            hovering fourteen bars to collect them is not reading. The table is
            the same array the chart draws, so the two cannot disagree. */}
        <div className="ffr-split">
          <div className="ffr-split-chart">
            <ParetoChart data={paretoRows.map((r) => ({ label: r.label, value: r.value }))}
                         showLabels={paretoLabels}
                         onPick={pick(paretoBy)} active={picked[paretoBy] ?? null} />
          </div>
          <div className="ffr-split-table">
            <table className="ffr-mini">
              <thead>
                <tr>
                  <th>#</th><th>{paretoAt.label}</th>
                  <th className="num">Reports</th><th className="num">Share</th>
                  <th className="num">Running</th><th className="num">Cum. %</th>
                </tr>
              </thead>
              <tbody>
                {paretoRows.map((r, i) => (
                  <tr key={r.label}
                      className={`${r.vital ? 'is-vital' : ''}${picked[paretoBy] === r.label ? ' is-active' : ''}`}
                      onClick={() => pick(paretoBy)(r.label)}
                      title={`${r.value} of ${paretoTotal} = ${(r.share * 100).toFixed(1)}%  ·  `
                        + `running ${r.running} of ${paretoTotal} = ${(r.cum * 100).toFixed(1)}%`}>
                    <td className="num muted">{i + 1}</td>
                    <td>{r.label}</td>
                    <td className="num">{r.value}</td>
                    <td className="num">{(r.share * 100).toFixed(1)}%</td>
                    <td className="num muted">{r.running}</td>
                    <td className="num">{(r.cum * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td /><td>Total</td>
                  <td className="num">{paretoTotal}</td>
                  <td className="num">100.0%</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
            <div className="ffr-split-foot">
              <span className="muted">
                Share = reports ÷ {paretoTotal}. Cum. % = the running total ÷ {paretoTotal}.
                {paretoCrossing >= 0
                  ? <> The first {paretoCrossing + 1} reach 80%.</>
                  : <> Nothing reaches 80% on its own.</>}
              </span>
              <button className="btn btn-sm" onClick={downloadPareto}>⭳ Download</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Root cause, from the Daily Complaint Review Register">
        <div className="muted" style={{ marginBottom: 10 }}>
          Taken from the review as it stands now, not as it stood when the report was raised —
          a cause corrected later should read corrected here.
        </div>
        {/* NO LONGER TRUNCATED AT 46 CHARACTERS. That slice pre-dated the
            adjustable column and would have made widening it pointless —
            the reader would drag the column open and find the name had
            already been cut before it got here. */}
        <BarChart data={byRootCause.slice(0, 12)} widthKey="ffr.rootcause"
                  onPick={pick('live_root_cause_keyword')} active={picked.live_root_cause_keyword ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Complaint grouping">
        {/* NO LONGER TRUNCATED AT 46 CHARACTERS. That slice pre-dated the
            adjustable column and would have made widening it pointless —
            the reader would drag the column open and find the name had
            already been cut before it got here. */}
        <BarChart data={byGrouping.slice(0, 12)} widthKey="ffr.grouping"
                  onPick={pick('live_complaint_grouping')} active={picked.live_complaint_grouping ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Where they are raised">
        {/* NO LONGER TRUNCATED AT 46 CHARACTERS. That slice pre-dated the
            adjustable column and would have made widening it pointless —
            the reader would drag the column open and find the name had
            already been cut before it got here. */}
        <BarChart data={byCustomer.slice(0, 12)} widthKey="ffr.customer"
                  onPick={pick('customer_name')} active={picked.customer_name ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Report status">
        <DonutChart data={byStatus} onPick={pick('ffr_status')} active={picked.ffr_status ?? null} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="CAPA status">
        <BarChart data={byCapa} widthKey="ffr.capa"
                  onPick={pick('capa_status')} active={picked.capa_status ?? null} />
      </SectionCard>
    </div>
  );
}
