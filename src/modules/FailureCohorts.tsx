// ===========================================================================
// FAILURE RATE FROM THE DCCR, BY COMMISSIONING MONTH (0393, 2026-10-06).
//
// The user's WRR workbook on the Objective page, as its own tab: for one
// product, one row per month of commissioning with its Parc (machines
// installed that month) and the failures before 3 / 6 / 12 / 24 / 36 / 60
// months with their rates. A failure is a Field call whose DCCR spare
// category is SPARE or whose Any Potential Effect is YES; every call counts,
// so a rate can pass 100% as it does in the sheet. A month younger than the
// window is blank. The Objective's figure for a month is the AVERAGE of the
// 3-month rates of the 12 commissioning months ending in it, blanks left out
// -- worked out in the database (objective_value) from this same table.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { formatDay, todayLocal } from '../lib/dates';
import { xlsxDownload } from '../lib/xlsx';
import { COMPLETE } from '../lib/exportscope';
import { logAudit } from '../lib/audit';
import {
  COHORT_WINDOWS, dccrFailureCalls, dccrFailureCohorts,
  type DccrCohortRow, type DccrFailureCall, type QualityObjective,
} from '../lib/supabase';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (iso: string) => { const [y, m] = iso.split('-'); return `${m}-${y}`; };
const pct = (v: number | null) => (v == null ? '' : `${Math.round(v * 100)}%`);
type Win = typeof COHORT_WINDOWS[number];
const f = (r: DccrCohortRow, w: Win) => r[`f${w}` as keyof DccrCohortRow] as number | null;
const rt = (r: DccrCohortRow, w: Win) => r[`r${w}` as keyof DccrCohortRow] as number | null;

/** The 12 commissioning months ending in `endMonth` (yyyy-mm-01) and their average 3-month rate. */
export function rollingAverage(rows: DccrCohortRow[], endMonth: string, months = 12): { avg: number | null; used: DccrCohortRow[]; from: string } {
  // Month arithmetic on the yyyy-mm text itself: no Date, so no time zone.
  const [y, m] = endMonth.split('-').map(Number);
  const k = y * 12 + (m - 1) - (months - 1);
  const from = `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`;
  const used = rows.filter((r) => r.month >= from && r.month <= endMonth && r.r3 != null);
  return { avg: used.length ? used.reduce((s, r) => s + Number(r.r3), 0) / used.length : null, used, from };
}

/** The workbook: the table, the failing calls, and how the month's figure is made. */
export async function downloadCohortWorkbook(o: QualityObjective, asof?: string, objectiveMonth?: number, year?: number) {
  const [rows, calls] = await Promise.all([dccrFailureCohorts(o.id, asof), dccrFailureCalls(o.id, asof)]);
  const tableCols = ['Month of commissioning', 'Parc', ...COHORT_WINDOWS.flatMap((w) => [`Number of failures before ${w} months`, `${w}-month failure rate`])];
  const table = rows.map((r) => ({
    'Month of commissioning': monthLabel(r.month), Parc: r.parc,
    ...Object.fromEntries(COHORT_WINDOWS.flatMap((w) => [
      [`Number of failures before ${w} months`, f(r, w) ?? ''], [`${w}-month failure rate`, rt(r, w) == null ? '' : Number(rt(r, w))]])),
  }));
  const callCols = ['UCN', 'Call Number', 'Registered', 'Product', 'Serial', 'Party', 'Installed (Warranty Start)', 'Month of commissioning', 'Days after installation', 'Spare / Consumable / Correction / Calibration', 'Any Potential Effect'];
  const callRows = calls.map((c: DccrFailureCall) => ({
    UCN: c.ucn, 'Call Number': c.call_number, Registered: c.reg_date, Product: c.product_name, Serial: c.serial, Party: c.party_name,
    'Installed (Warranty Start)': c.installed_on, 'Month of commissioning': monthLabel(c.commissioning_month),
    'Days after installation': c.days_to_failure, 'Spare / Consumable / Correction / Calibration': c.spare_category,
    'Any Potential Effect': c.any_potential_effect,
  }));
  const endMonth = (asof ?? todayLocal()).slice(0, 7) + '-01';
  const roll = rollingAverage(rows, endMonth);
  const calc: Record<string, unknown>[] = [
    { Item: 'Objective', Value: o.parameter },
    ...(objectiveMonth != null && year ? [{ Item: 'Month', Value: `${MON[objectiveMonth]} ${year}` }] : []),
    { Item: 'Measured as at', Value: asof ? formatDay(asof) : 'today' },
    { Item: 'Product filter', Value: String(o.calc_params?.product ?? '') },
    ...(o.calc_params?.serial ? [{ Item: 'Serial filter', Value: String(o.calc_params.serial) }] : []),
    { Item: 'A failure is', Value: 'a Field call whose DCCR Spare / Consumable / Correction / Calibration is SPARE, or whose Any Potential Effect is YES; cancelled calls and calls with no serial are out; every call counts' },
    { Item: 'Commissioning month', Value: 'the month of the machine’s Warranty Start in the Product Database (the latest on or before the call)' },
    { Item: 'Rolling months', Value: `${monthLabel(roll.from)} to ${monthLabel(endMonth)}` },
    ...roll.used.map((r) => ({ Item: `  ${monthLabel(r.month)}`, Value: `${r.f3} ÷ ${r.parc} = ${pct(r.r3)}` })),
    { Item: 'Average of the 3-month rates', Value: roll.avg == null ? '(no month to average)' : `${(roll.avg * 100).toFixed(2)}%` },
    { Item: 'Left out', Value: 'months still inside their first 3 months, and months with no machine installed' },
    { Item: 'Downloaded', Value: new Date().toISOString() },
  ];
  const safe = o.parameter.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  xlsxDownload(`failure-rate-${safe}${objectiveMonth != null && year ? `-${year}-${MON[objectiveMonth]}` : ''}.xlsx`, [
    { name: 'By commissioning month', columns: tableCols, rows: table },
    { name: 'Failing calls (DCCR)', columns: callCols, rows: callRows },
    { name: 'Calculation', columns: ['Item', 'Value'], rows: calc },
  ], COMPLETE);
  logAudit({ action: 'objective.failure_cohorts', target: o.parameter, meta: { rows: rows.length, calls: calls.length } });
  return { rows: rows.length, calls: calls.length, avg: roll.avg };
}

export function FailureCohorts({ objectives }: { objectives: QualityObjective[] }) {
  const choices = useMemo(() => objectives.filter((o) => o.calc_key === 'dccr_failure_cohort'), [objectives]);
  const [pick, setPick] = useState<string>('');
  const [rows, setRows] = useState<DccrCohortRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const chosen = choices.find((o) => String(o.id) === pick) ?? choices[0];

  useEffect(() => {
    if (!chosen) return;
    let live = true;
    setBusy(true); setMsg('');
    dccrFailureCohorts(chosen.id)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setMsg(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [chosen?.id]);

  if (!choices.length) return <p className="muted">No objective is worked out by the DCCR failure rate yet.</p>;
  const thisMonth = todayLocal().slice(0, 7) + '-01';
  const roll = rollingAverage(rows, thisMonth);
  // 3, 6, 12, 24, 36, 60 -- the shortest window first (the user, 2026-10-06).
  const wins = COHORT_WINDOWS;

  return (
    <div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="field" style={{ minWidth: 300 }}><label className="field-label">Objective</label>
          <SelectPicker value={String(chosen?.id ?? '')} onChange={(v) => setPick(v)}
            options={choices.map((o) => ({ value: String(o.id), label: `${o.parameter}${o.status && o.status !== 'Active' ? ` (${o.status})` : ''}` }))} /></div>
        <button className="btn" disabled={!chosen} onClick={() => chosen && void downloadCohortWorkbook(chosen).then((r) =>
          setMsg(`Downloaded: ${r.rows} months, ${r.calls} failing calls.`)).catch((e) => setMsg(e instanceof Error ? e.message : String(e)))}>
          ⭳ Download .xlsx</button>
        <span className="muted">
          12-month rolling average (3-month rate, {monthLabel(roll.from)} to {monthLabel(thisMonth)}):{' '}
          <b>{roll.avg == null ? '—' : `${(roll.avg * 100).toFixed(2)}%`}</b> over {roll.used.length} month{roll.used.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        A failure is a Field call whose DCCR <b>Spare / Consumable / Correction / Calibration</b> is <b>SPARE</b>, or whose <b>Any Potential Effect</b> is <b>YES</b>.
        Every call counts, so a rate can pass 100%. Parc is the machines installed (Warranty Start) that month. A month younger than the window is blank.
        The Objective takes the average of the 3-month rates of the 12 months ending in its month.
      </p>
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}
      {busy ? <p className="muted">Loading…</p> : (
        <div className="cohort-scroll">
          <table className="obj-table cohort-table">
            <thead>
              <tr><th rowSpan={2} className="cohort-freeze">Month of commissioning</th><th rowSpan={2} className="obj-num">Parc</th>
                {wins.map((w) => <th key={w} colSpan={2}>{w}-month failure rate</th>)}</tr>
              <tr>{wins.map((w) => [<th key={`f${w}`} className="obj-num">Number of failures before {w} months</th>,
                                    <th key={`r${w}`} className="obj-num">{w}-month failure rate</th>])}</tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map((r) => (
                <tr key={r.month}>
                  <td className="cohort-freeze">{monthLabel(r.month)}</td>
                  <td className="obj-num">{r.parc}</td>
                  {wins.map((w) => [<td key={`f${w}`} className="obj-num">{f(r, w) ?? ''}</td>,
                                    <td key={`r${w}`} className="obj-num">{pct(rt(r, w))}</td>])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
