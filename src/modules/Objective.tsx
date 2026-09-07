import { useEffect, useState } from 'react';
import { PageHeader, SectionCard, Modal } from '../components/ui/ui';
import {
  countKpiFieldInst, listKpiFieldInst, listQualityObjectives, saveObjectiveCell,
  recalcObjectives, objectiveEvidence, objectiveNotes, objectivePeriod,
  saveObjectiveDef, addObjective, deleteObjective,
  supabaseConfigured, type QualityObjective,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { KPI_FIELD_INST_COLUMNS, kpiExportColumns, toKpiExportRow } from '../lib/kpi';
import { csvExport } from '../lib/format';
import { xlsxDownload } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { useAccessScope, scopeLabel } from '../lib/access';
import './dccr.css';
import './fieldcalls.css';

// ===========================================================================
// OBJECTIVE — the service objectives, measured from the register.
//
// PHASE 1 (the user's scoping, 2026-09-07) is the KPI workbook's Field_INST
// tab: columns A to AB, the same fields in the same order under the same
// headings, so the file drops straight in. It lived on KPI & Failure Analysis
// while it was the only thing of its kind; it has its own page now because the
// objectives are their own subject, not a panel on the analytics screen.
//
// PHASE 2 is AC to AG — Attended in Days, Solved in Days, TTA, TTS and Failure
// Month — which are formulas in the workbook today. They are the objectives
// themselves rather than the record they are computed from, so this is where
// they will go.
//
// Everything it shows is scoped like every other screen: an engineer exports
// their own calls, a manager their team's. `kpi_field_inst` is
// security_invoker, so that is the database's doing and not this page's.
// ===========================================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_KEYS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12'] as const;

// A target reads "<5%", ">75%" or "To Monitor". The first two say which side of
// the line is good; the third says nobody has drawn one. Parsing further would
// be inventing precision the register does not have — see 0130.
function meets(target: string, value: number | null): 'good' | 'bad' | '' {
  if (value == null) return '';
  const m = /^([<>])\s*=?\s*([0-9.]+)\s*%?$/.exec(String(target).trim());
  if (!m) return '';
  const limit = Number(m[2]) / (String(target).includes('%') ? 100 : 1);
  if (!Number.isFinite(limit)) return '';
  return (m[1] === '<' ? value < limit : value > limit) ? 'good' : 'bad';
}

// A rate is stored as a fraction (0.05 = 5%) and a count as itself. The target
// is what says which: only a % target makes the figure a percentage.
const showValue = (target: string, v: number | null): string => {
  if (v == null) return '';
  return String(target).includes('%')
    ? `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`
    : String(Number(v.toFixed(3)));
};

export function Objective() {
  const live = supabaseConfigured();
  const scope = useAccessScope();
  const { can } = useAuth();
  const mayEdit = can('config.manage');
  const YEAR = new Date().getFullYear();
  const [objectives, setObjectives] = useState<QualityObjective[]>([]);
  const [oMsg, setOMsg] = useState('');
  const [editing, setEditing] = useState<{ id: number; field: string } | null>(null);
  const [draft, setDraft] = useState('');

  const loadObjectives = () => {
    if (!live) return;
    void listQualityObjectives(YEAR)
      .then(setObjectives)
      .catch((e) => setOMsg(`Could not read the objectives: ${e instanceof Error ? e.message : String(e)}`));
  };
  useEffect(loadObjectives, [live, YEAR]);

  // A figure at a time. A blank is NULL — "not measured this month" — and not
  // zero, which on a rate would drag the year's average down and is a different
  // claim entirely.
  const commit = async () => {
    if (!editing) return;
    const raw = draft.trim();
    const row = objectives.find((o) => o.id === editing.id);
    const pct = row ? String(row.yearly_target).includes('%') : false;
    let value: number | null = null;
    if (raw !== '') {
      const n = Number(raw.replace('%', ''));
      if (!Number.isFinite(n)) { setOMsg(`"${raw}" is not a number.`); setEditing(null); return; }
      value = pct && raw.includes('%') ? n / 100 : n;
    }
    const res = await saveObjectiveCell(editing.id, editing.field, value);
    setEditing(null);
    if (!res.ok) { setOMsg(`Could not save: ${res.error}`); return; }
    setOMsg('');
    loadObjectives();
  };

  // The two frequencies, named. `objective_is_quarterly` in the database is the
  // authority; this is its mirror for the page, and the same rule: anything not
  // recognisably quarterly is monthly.
  const isQuarterly = (f: string) => /quarter|3\s*month/i.test(f || '');
  const monthlyNames = objectives.filter((o) => !isQuarterly(o.frequency)).map((o) => o.parameter);
  const quarterlyNames = objectives.filter((o) => isQuarterly(o.frequency)).map((o) => o.parameter);

  // RE-CALC — explicit, at the moment of submission. Never on a page load: a
  // figure that moves because somebody opened a screen is not one anybody can
  // stand behind at an audit.
  const [recalcing, setRecalcing] = useState(false);
  const [confirmRecalc, setConfirmRecalc] = useState(false);
  const doRecalc = async () => {
    setRecalcing(true);
    const res = await recalcObjectives(YEAR);
    setRecalcing(false);
    setConfirmRecalc(false);
    if (!res.ok) { setOMsg(`Could not re-calculate: ${res.error}`); return; }
    const n = (res.written ?? []).length;
    const months = (res.written ?? []).reduce((a, w) => a + Number(w.months_written ?? 0), 0);
    setOMsg(n === 0
      ? 'Nothing is set to compute yet — every objective is still typed.'
      : `Re-calculated ${n} objective${n === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'} in all. Typed figures were left alone.`);
    loadObjectives();
  };

  // THE ROWS BEHIND A FIGURE, AS A WORKBOOK — the calls, the machines they were
  // counted against, and the arithmetic, on three tabs (the user's shape).
  //
  // Sheet 3 is COUNTED FROM SHEETS 1 AND 2, not read from the objective: the
  // file has to add up to itself. The stored figure is put beside it so a
  // disagreement — a Re-Calc that has not been run since the calls changed —
  // is visible in the evidence rather than hidden by it.
  const CALL_COLUMNS = ['ucn', 'call_number', 'reg_date', 'product_name', 'serial',
                        'party_name', 'call_type', 'status', 'allocated_to',
                        'warranty_number', 'warranty_start', 'warranty_end',
                        'contract_number', 'contract_start', 'contract_end', 'contract_type',
                        // The user's ask, 2026-09-07: the ACTUAL closure date, and an
                        // explicit callout when the cut-off excluded it. Both closure
                        // dates are carried because they disagree — a visit late in the
                        // period written up after it — and the disagreement is the part
                        // worth seeing.
                        'closure_date', 'closure_recorded_on', 'after_cutoff'];

  // SHEET 2 IS A PRODUCT MASTER LISTING, and is laid out to be read beside that
  // screen — same fields, same order — so a reader can reconcile it line by
  // line rather than take the denominator on trust. Its first row is the FILTER
  // the database applied, in the database's own words: the file states which
  // machines are in and why, instead of leaving that to be inferred from the
  // rows that happen to be there.
  const BASE_COLUMNS: [string, string][] = [
    ['Product', 'product_name'], ['Serial', 'serial'], ['Customer', 'party_name'],
    ['Status', 'status'],
    ['Warranty no.', 'warranty_number'], ['Warranty from', 'warranty_start'],
    ['Warranty to', 'warranty_end'],
    ['Contract no.', 'contract_number'], ['Contract from', 'contract_start'],
    ['Contract to', 'contract_end'], ['Contract type', 'contract_type'],
  ];
  const baseRow = (r: Record<string, unknown>) =>
    Object.fromEntries(BASE_COLUMNS.map(([head, key]) => [head, r[key]]));
  const downloadEvidence = async (o: QualityObjective, monthIndex: number) => {
    try {
      const [rows, notes, period] = await Promise.all([
        objectiveEvidence(o.id, monthIndex + 1),
        objectiveNotes(o.id, monthIndex + 1),
        objectivePeriod(o.id, monthIndex + 1),
      ]);
      // A quarterly objective carries no figure in ten of the twelve months,
      // and that is not an error — say which month DOES hold it rather than
      // "nothing to download", which reads as a fault in the export.
      if (period && !period.applies) {
        setOMsg(period.label || 'That month has not been reached yet.');
        return;
      }
      if (!rows.length && !notes.length) {
        setOMsg('There is nothing behind that figure to download.'); return;
      }
      const role = (r: Record<string, unknown>) => String(r.role ?? '');
      const calls = rows.filter((r) => role(r) !== 'machine' && role(r) !== 'filter');
      const machines = rows.filter((r) => role(r) === 'machine');
      // The filter row is not a machine and must not be counted as one — it is
      // the caption of sheet 2, carried in the same columns.
      const filterRow = rows.find((r) => role(r) === 'filter');

      const isRate = o.calc_key === 'failure_rate_12m';
      const isAttended = o.calc_key === 'attended_within_days';
      const numerator = isRate ? calls.length
        : calls.filter((r) => role(r) === (isAttended ? 'attended' : 'open')).length;
      const denominator = isRate ? machines.length : calls.length;
      // The period, not "the month" — on a quarterly objective these rows are
      // a whole quarter and a sheet that said "month" would be wrong.
      const over = period?.label || `${YEAR} ${MONTHS[monthIndex]}`;
      // Counted here rather than asserted by the database, on the same footing
      // as the rest of sheet 3: the file adds up to itself.
      const lateSolves = calls.filter((r) => String(r.after_cutoff ?? '') !== '').length;
      // The user's shape is "List of Field Calls (Sheet1)", and that is what a
      // field objective gets. A PM or Installation objective reads a different
      // register, and calling its rows field calls would be plainly wrong.
      const fam = String((o.calc_params as Record<string, unknown> | null)?.family ?? '').toLowerCase();
      const sheet1Name = fam === 'pm' ? 'List of PM Calls'
        : fam.startsWith('install') ? 'List of Installation Calls'
        : 'List of Field Calls';
      const numeratorLabel = isRate ? 'Failures (Sheet 1)'
        : isAttended ? `Attended inside the limit (Sheet 1)`
        : `Still open at the end of ${over} (Sheet 1)`;
      const denominatorLabel = isRate ? 'Machines in the field (Sheet 2)'
        : `Calls registered in ${over} (Sheet 1)`;
      const computed = denominator ? numerator / denominator : null;
      const stored = o[MONTH_KEYS[monthIndex]];

      const calc: Record<string, unknown>[] = [
        { Item: 'Objective', Value: o.parameter },
        { Item: 'Reported in', Value: `${YEAR} ${MONTHS[monthIndex]}` },
        { Item: 'Measured over', Value: period?.label || `${YEAR} ${MONTHS[monthIndex]}` },
        { Item: 'Calls registered', Value: period ? `${period.period_start} to ${period.period_end}` : '' },
        { Item: 'Solved by (cut-off)', Value: period?.cutoff_note || '' },
        { Item: 'Monitoring frequency', Value: o.frequency },
        { Item: 'Yearly target', Value: o.yearly_target },
        { Item: 'Worked out by', Value: o.calc_key || 'not computed — this figure is typed' },
        { Item: 'Parameters', Value: JSON.stringify(o.calc_params ?? {}) },
        { Item: '', Value: '' },
        { Item: numeratorLabel, Value: numerator },
        { Item: denominatorLabel, Value: denominator },
        { Item: 'Calculation', Value: `${numerator} ÷ ${denominator}` },
        ...(lateSolves > 0
          ? [{ Item: 'of which SOLVED AFTER THE CUT-OFF',
               Value: `${lateSolves} — counted as open. Sheet 1 marks each one; `
                 + 'they were solved, just not in time for this figure.' }]
          : []),
        { Item: 'Result', Value: computed == null ? '' : computed },
        { Item: 'Result (%)', Value: computed == null ? '' : `${(computed * 100).toFixed(2)}%` },
        { Item: '', Value: '' },
        { Item: 'Figure on the Objective page', Value: stored == null ? '(blank)' : Number(stored) },
        { Item: 'Agrees with this file?',
          Value: stored == null || computed == null
            ? 'no figure recorded'
            : (Math.abs(Number(stored) - computed) < 1e-6
                ? 'yes' : 'NO — re-calculate; the calls have changed since the figure was written') },
        { Item: '', Value: '' },
        { Item: 'Measured as at', Value: 'the end of that month, never later than today' },
      ];
      if (filterRow) calc.push(
        { Item: 'Installation base from', Value: 'Product Master (Product Register)' },
        { Item: 'Product filter', Value: filterRow.product_name },
        { Item: 'Serial filter', Value: filterRow.serial },
      );
      calc.push({ Item: 'Downloaded', Value: new Date().toISOString() });

      // THE ASSUMPTIONS AND THE HARD STOPS, in the database's own words (the
      // user's ask, 2026-09-07). They come from the objective's definition, so
      // a figure re-pointed at another register cannot be described here by
      // the old one. Assumptions first — those are the ones a reader may want
      // changed; the hard stops are what the number MEANS.
      for (const kind of ['ASSUMPTION', 'HARD STOP'] as const) {
        const mine = notes.filter((n) => n.kind === kind);
        if (!mine.length) continue;
        calc.push({ Item: '', Value: '' },
                  { Item: kind === 'ASSUMPTION' ? 'ASSUMPTIONS' : 'HARD STOPS',
                    Value: kind === 'ASSUMPTION'
                      ? 'choices that could have gone another way — an administrator can change these on the Objective page'
                      : 'rules this figure will not bend — changing one would make it a different number' });
        mine.forEach((n, i) => calc.push({ Item: `${i + 1}.`, Value: n.note }));
      }

      const safe = o.parameter.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      xlsxDownload(`evidence-${safe}-${YEAR}-${MONTHS[monthIndex]}.xlsx`, [
        { name: sheet1Name, columns: ['role', ...CALL_COLUMNS], rows: calls },
        {
          name: 'Installation Base',
          columns: filterRow ? BASE_COLUMNS.map(([head]) => head) : ['Note'],
          // An empty tab reads as a bug. Where there is no installed base at
          // all the sheet says why; where there is one, the filter leads it —
          // even if it selected nothing, which is itself worth seeing.
          rows: filterRow
            ? [baseRow(filterRow), ...machines.map(baseRow)]
            : [{ Note: 'This objective is calls over calls — it has no installed base. The denominator is on Sheet 1.' }],
        },
        { name: 'Calculation', columns: ['Item', 'Value'], rows: calc },
      ]);
      setOMsg(`Downloaded the evidence for ${o.parameter} — ${MONTHS[monthIndex]}: `
        + `${calls.length} call${calls.length === 1 ? '' : 's'}`
        + (machines.length ? ` and ${machines.length} machines` : '') + '.');
      logAudit({ action: 'objective.evidence', target: `${o.parameter} ${YEAR}-${monthIndex + 1}`,
                 meta: { calls: calls.length, machines: machines.length } });
    } catch (e) {
      setOMsg(`Could not read the evidence: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // The definition — everything except the twelve figures. None of it is baked
  // into a migration any more.
  const [defOpen, setDefOpen] = useState<QualityObjective | null>(null);
  const [defDraft, setDefDraft] = useState<Partial<QualityObjective>>({});

  // THE CUT-OFF, as two controls over the SAME calc_params the JSON box edits —
  // never a second copy of the setting. Whichever is typed clears the other,
  // because a grace and a fixed date are two answers to one question and
  // holding both would leave the screen unable to say which is in force.
  const paramsObj = (): Record<string, unknown> => {
    const raw = defDraft.calc_params;
    if (typeof raw === 'string') { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
    return (raw as Record<string, unknown>) ?? {};
  };
  const cutoffDays = String(paramsObj().cutoff_days ?? '');
  const cutoffDate = String(paramsObj().cutoff_date ?? '');
  const setParam = (key: string, value: string, clears: string) => {
    const next = { ...paramsObj() };
    if (value.trim()) next[key] = key === 'cutoff_days' ? Number(value) : value;
    else delete next[key];
    delete next[clears];
    setDefDraft((d) => ({ ...d, calc_params: JSON.stringify(next) as never }));
  };
  const saveDef = async () => {
    if (!defOpen) return;
    const patch = { ...defDraft };
    if (typeof patch.calc_params === 'string') {
      try { patch.calc_params = JSON.parse(patch.calc_params as unknown as string); }
      catch { setOMsg('The parameters must be valid JSON, e.g. {"product":"%T75%"}'); return; }
    }
    const res = await saveObjectiveDef(defOpen.id, patch);
    if (!res.ok) { setOMsg(`Could not save: ${res.error}`); return; }
    setDefOpen(null); setOMsg(''); loadObjectives();
  };
  const [xFrom, setXFrom] = useState('');
  const [xTo, setXTo] = useState('');
  const [xCount, setXCount] = useState<number | null>(null);
  const [xErr, setXErr] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [xMsg, setXMsg] = useState('');

  // The count is the whole range, not a page — so the button can say what it is
  // about to export, and a failed count says so rather than showing a stale
  // number from the last range (the "99 of 76" lesson).
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setXErr(false);
    void countKpiFieldInst({ from: xFrom || undefined, to: xTo || undefined })
      .then((n) => { if (!cancelled) setXCount(n); })
      .catch(() => { if (!cancelled) { setXCount(null); setXErr(true); } });
    return () => { cancelled = true; };
  }, [live, xFrom, xTo]);

  const exportFieldInst = async () => {
    if (exporting) return;
    setExporting(true);
    setXMsg('Reading the calls…');
    try {
      const PAGE = 1000;
      const range = { from: xFrom || undefined, to: xTo || undefined };
      const all: Record<string, unknown>[] = [];
      for (let off = 0; ; off += PAGE) {
        const page = await listKpiFieldInst(range, off, PAGE);
        all.push(...page);
        if (page.length < PAGE) break;
        setXMsg(`Read ${all.length.toLocaleString()}…`);
      }
      const span = xFrom || xTo ? `${xFrom || 'start'}_${xTo || 'today'}` : new Date().toISOString().slice(0, 10);
      csvExport(`kpi-field-inst-${span}.csv`, kpiExportColumns(), all.map(toKpiExportRow));
      setXMsg(`Exported ${all.length.toLocaleString()} call${all.length === 1 ? '' : 's'}.`);
      logAudit({ action: 'kpi.export', target: `${all.length} calls`, meta: { rows: all.length, from: xFrom, to: xTo } });
    } catch (e) {
      setXMsg(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setExporting(false); }
  };

  return (
    <div>
      <PageHeader
        title="Objective"
        subtitle="The service objectives, measured from the register rather than kept by hand."
        icon="🎯"
        status={<span className={`conn-dot ${scope.all ? 'conn-on' : 'conn-off'}`}>{scopeLabel(scope)}</span>}
      />

      {!live && (
        <div className="sheet-banner sheet-banner-info">
          <span>Connect the database in Settings to read the objectives.</span>
        </div>
      )}
      {oMsg && <div className="sheet-banner sheet-banner-error"><span>{oMsg}</span></div>}

      <SectionCard title={`ALMS-INDIA Quality & Business Objectives — ${YEAR}`}>
        <p className="muted" style={{ marginTop: 0 }}>
          Every objective, its yearly target, how often it is measured and who is responsible.
          {mayEdit
            ? ' Click a month to type the figure — a blank month means NOT MEASURED, which is not the same as zero.'
            : ' The figures are maintained by whoever owns the numbers.'}
        </p>
        {/* WHICH ARE MONTHLY AND WHICH ARE QUARTERLY, said outright (the user's
            ask). It is in the Freq. column too, but reading it out of twelve
            rows is work, and the two behave differently enough — a quarterly
            objective carries ONE cumulative figure in the last month of its
            quarter and NA in the other two — that the difference deserves
            saying rather than looking up. */}
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Monthly ({monthlyNames.length})</strong>: {monthlyNames.join(', ') || '—'}.
          {' '}<strong>Quarterly ({quarterlyNames.length})</strong>: {quarterlyNames.join(', ') || '—'} —
          {' '}measured CUMULATIVELY over the three months and reported in the last month of the
          quarter (Mar, Jun, Sep, Dec); the other months are NA, which is not zero.
          {' '}A row marked <b>ƒ</b> is worked out from the register; the rest are typed.
        </p>
        {mayEdit && (
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={recalcing} onClick={() => setConfirmRecalc(true)}>
              {recalcing ? 'Re-calculating…' : '↻ Re-calculate'}
            </button>
            <button className="btn" onClick={() => void addObjective(YEAR, (objectives.length ? objectives[objectives.length - 1].sort_order : 0) + 1).then(loadObjectives)}>
              + Add an objective
            </button>
            <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
              Re-calculate writes only the <b>ƒ</b> rows, and only up to this month. It never touches a
              figure somebody typed.
            </span>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="obj-table">
            <thead>
              <tr>
                <th>#</th><th>Process</th><th>Monitoring Parameter</th>
                <th>Yearly Target</th><th>Freq.</th>
                {MONTHS.map((m) => <th key={m} className="obj-num">{m}</th>)}
                <th className="obj-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((o) => (
                <tr key={o.id}>
                  <td>{o.sort_order}</td>
                  <td>{o.process}</td>
                  <td title={`Responsible: ${o.responsible}${o.calc_key ? ` · computed by ${o.calc_key} ${JSON.stringify(o.calc_params)}` : ' · typed'}`}>
                    {o.calc_key ? <b className="obj-calc" title={`Computed: ${o.calc_key}`}>ƒ</b> : null}
                    {o.parameter}
                    {mayEdit && (
                      <button
                        className="btn btn-ghost btn-sm obj-defbtn"
                        title="Edit this objective"
                        onClick={() => { setDefOpen(o); setDefDraft({ ...o, calc_params: JSON.stringify(o.calc_params ?? {}) as never }); }}
                      >✏️</button>
                    )}
                  </td>
                  <td><b>{o.yearly_target}</b></td>
                  <td>{o.frequency}</td>
                  {MONTH_KEYS.map((k) => {
                    const v = o[k];
                    const verdict = meets(o.yearly_target, v);
                    const isEditing = editing?.id === o.id && editing.field === k;
                    return (
                      <td
                        key={k}
                        className={`obj-num obj-${verdict || 'none'}${mayEdit ? ' obj-edit' : ''}`}
                        onClick={() => { if (mayEdit && !isEditing) { setEditing({ id: o.id, field: k }); setDraft(v == null ? '' : showValue(o.yearly_target, v)); } }}
                      >
                        {isEditing
                          ? (
                            <input
                              className="input obj-input" autoFocus value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => void commit()}
                              onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') setEditing(null); }}
                            />
                          )
                          : (
                            <>
                              {showValue(o.yearly_target, v)}
                              {/* The rows behind the figure, for whoever asks how
                                  it was arrived at. Only where we computed it —
                                  a typed number has no evidence to give. */}
                              {o.calc_key && v != null && (
                                <button
                                  className="btn btn-ghost btn-sm obj-eyebtn"
                                  title={`Download the evidence for ${MONTHS[MONTH_KEYS.indexOf(k)]} — the calls, the machines and the arithmetic, on three tabs`}
                                  onClick={(e) => { e.stopPropagation(); void downloadEvidence(o, MONTH_KEYS.indexOf(k)); }}
                                >⭳</button>
                              )}
                            </>
                          )}
                      </td>
                    );
                  })}
                  <td className="obj-num"><b>{showValue(o.yearly_target, o.total)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {objectives.length === 0 && live && (
          <p className="muted">No objectives for {YEAR} yet — run supabase/apply/objective.sql.</p>
        )}
        {/* Said on the screen because it is the difference between a figure you
            can rely on and one somebody typed. */}
        <p className="muted" style={{ fontSize: 12.5 }}>
          Every figure here is <b>typed</b> today, the Total included — in the workbook that column is
          a sum on the count rows and an average on the rate rows, and which it is cannot be told
          from the row. As each objective is automated it will be read from the register instead,
          and this line will say which.
        </p>
      </SectionCard>

      <SectionCard title="Export — KPI workbook (Field_INST)">
        <p className="muted" style={{ marginTop: 0 }}>
          The workbook's own tab, computed from the register: <b>columns A to AG</b>, the same
          fields in the same order under the same headings, so the file drops straight in — plus
          <b>Pending Days</b>, which the workbook does not have. Field and Installation calls only
          — PM keeps its own tab — and <b>cancelled calls are not included at all</b>.
        </p>
        <ul className="muted" style={{ marginTop: 0, fontSize: 12.5, lineHeight: 1.7 }}>
          <li><b>Call Attended On</b> — the earlier of the first visit and the first spare request.
            A spare raised before anyone visits is still somebody attending to the call.</li>
          <li><b>Call Solved Date &amp; Time</b> — the visit date of the entry that moved the call to
            <b> Solved - Report Completed</b>. Not the last visit, and not the day it was typed in.</li>
          <li><b>Open/Close</b> — Close only when the call is Solved - Report Completed. Anything
            else is Open, <b>including Solved - Report Pending</b>.</li>
        </ul>
        <div className="row" style={{ gap: 10, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="field-label">Registered from</label>
            <input type="date" className="input" value={xFrom} onChange={(e) => setXFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label">to</label>
            <input type="date" className="input" value={xTo} onChange={(e) => setXTo(e.target.value)} />
          </div>
          {(xFrom || xTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setXFrom(''); setXTo(''); }}>
              Whole register
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!live || exporting || xCount === 0}
            onClick={() => void exportFieldInst()}
          >
            {exporting ? 'Exporting…'
              : xErr ? '⭳ Export'
              : `⭳ Export ${xCount == null ? '' : xCount.toLocaleString()} ${xCount === 1 ? 'call' : 'calls'}`}
          </button>
        </div>
        {/* A count nobody can tell is stale is worse than an admission. */}
        {xErr && <div className="sheet-banner sheet-banner-error"><span>Could not count the calls for that range — the export will still read them.</span></div>}
        {xMsg && <div className="sheet-banner sheet-banner-info"><span>{xMsg}</span></div>}
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
          <b>Phase 2:</b> Attended in Days, Solved in Days, TTA, TTS and Failure Month (AC–AG) are
          formulas in the workbook and are not exported yet.
        </p>
        <details>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 12.5 }}>
            Columns ({KPI_FIELD_INST_COLUMNS.length})
          </summary>
          <ol className="dccr-export-cols">
            {KPI_FIELD_INST_COLUMNS.map((c) => <li key={c}>{c}</li>)}
          </ol>
        </details>
      </SectionCard>

      {confirmRecalc && (
        <Modal
          open
          title={`Re-calculate the ${YEAR} objectives?`}
          onClose={() => { if (!recalcing) setConfirmRecalc(false); }}
        >
          <p>
            This reads the register and writes the months of the <b>{objectives.filter((o) => o.calc_key).length}</b>{' '}
            objective{objectives.filter((o) => o.calc_key).length === 1 ? '' : 's'} marked <b>ƒ</b>, up to this month.
          </p>
          <ul className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <li><b>A typed figure is never touched.</b> The {objectives.filter((o) => !o.calc_key).length} objectives
              nobody computes keep exactly what was entered.</li>
            <li>Each month is measured <b>as at the end of that month</b>, so a call closed since does not move an
              earlier figure.</li>
            <li>A month with nothing to measure stays <b>blank</b>, not zero.</li>
            <li>It replaces whatever those months currently hold, including a figure typed over a computed one.</li>
          </ul>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" disabled={recalcing} onClick={() => setConfirmRecalc(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={recalcing} onClick={() => void doRecalc()}>
              {recalcing ? 'Re-calculating…' : 'Re-calculate'}
            </button>
          </div>
        </Modal>
      )}

      {defOpen && (
        <Modal
          open
          title={`Objective — ${defOpen.parameter}`}
          onClose={() => setDefOpen(null)}
        >
          <div className="sf-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              ['parameter', 'Monitoring Parameter'],
              ['process', 'Process (SERVICE / BUSINESS)'],
              ['yearly_target', 'Yearly Target — the sheet\'s own words, e.g. <5%'],
              ['current_target', 'Current Target'],
              ['frequency', 'Monitoring Frequency'],
              ['responsible', 'Responsible'],
            ] as [keyof QualityObjective, string][]).map(([k, label]) => (
              <div key={String(k)}>
                <label className="field-label">{label}</label>
                <input
                  className="input"
                  value={String(defDraft[k] ?? '')}
                  onChange={(e) => setDefDraft((d) => ({ ...d, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="field-label">Computed by</label>
              <select
                className="select"
                value={String(defDraft.calc_key ?? '')}
                onChange={(e) => setDefDraft((d) => ({ ...d, calc_key: e.target.value }))}
              >
                <option value="">— typed, not computed —</option>
                <option value="failure_rate_12m">failure_rate_12m — failures in 12 months ÷ machines</option>
                <option value="open_rate_monthly">open_rate_monthly — still open at the cut-off ÷ that period's calls</option>
                <option value="attended_within_days">attended_within_days — attended inside the limit ÷ that period's calls</option>
              </select>
            </div>
            {String(defDraft.calc_key ?? '') === 'open_rate_monthly' && (
              <>
                <div>
                  <label className="field-label">Cut-off — days after the period ends</label>
                  <input
                    className="input" type="number" min={0} placeholder="0"
                    value={cutoffDays}
                    onChange={(e) => setParam('cutoff_days', e.target.value, 'cutoff_date')}
                  />
                  <div className="field-help">
                    A grace for reports written up late. <b>0 or blank</b> means the period&rsquo;s own
                    end. This is the one that works for all twelve months at once.
                  </div>
                </div>
                <div>
                  <label className="field-label">…or a fixed cut-off date</label>
                  <input
                    className="input" type="date"
                    value={cutoffDate}
                    onChange={(e) => setParam('cutoff_date', e.target.value, 'cutoff_days')}
                  />
                  <div className="field-help">
                    For reporting a period <b>as at</b> one stated day. It wins over the grace, and is
                    never read later than TODAY — a cut-off in the future would count a period the
                    record cannot yet know about, and can only ever move a call to closed.
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="field-label">Parameters (JSON)</label>
              <input
                className="input"
                value={String(defDraft.calc_params ?? '{}')}
                placeholder={'{"product":"%T75%"}'}
                onChange={(e) => setDefDraft((d) => ({ ...d, calc_params: e.target.value as never }))}
              />
              <div className="field-help">
                <code>{'{"product":"%T75%"}'}</code> for a rate, <code>{'{"call_type":"FIELD"}'}</code> for an open
                rate. A rate can also narrow on the SERIAL, which is how the Indian Extend is told from
                the rest: <code>{'{"product":"%EXTEND%","serial":"INXT%"}'}</code>. The serial narrows the
                failures AND the machines they are counted against — narrowing only the failures would
                read lower than the truth. Re-calculate, then download the evidence to see what the
                pattern actually matched.
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'space-between', marginTop: 14 }}>
            <button className="btn btn-danger" onClick={() => {
              if (confirm(`Delete "${defOpen.parameter}" and its twelve figures?`)) {
                void deleteObjective(defOpen.id).then(() => { setDefOpen(null); loadObjectives(); });
              }
            }}>Delete</button>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => setDefOpen(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void saveDef()}>Save</button>
            </span>
          </div>
        </Modal>
      )}

      <SectionCard title="How the computed columns are worked out">
        <ul className="muted" style={{ marginTop: 0, fontSize: 12.5, lineHeight: 1.75 }}>
          <li><b>Attended in Days</b> / <b>Solved in Days</b> — counted from the <b>later</b> of the
            Complaint Date and the Registration Date, never negative. That is the workbook's own
            formula: a call complained about on the 30th, registered on the 3rd and attended on the
            30th is <b>0 days</b>, not −4.</li>
          <li><b>TTA</b> / <b>TTS</b> — the band the day count falls in, using the <b>finer</b> of
            the two tables in LOOKUPVALUES: the same up to 60 days, then 61-90D, 91-180D, &gt;180D,
            &gt;1 yr, and so on to &gt;5 yrs. A machine open eleven months no longer reads the same
            as one open sixty-one days.</li>
          <li><b>Failure Month</b> — from the <b>Registration</b> date, as the formula has it.</li>
          <li><b>Pending Days</b> — how long an OPEN call has been waiting, today. It is not in the
            workbook. The sheet computes 0 days for a call nobody has been to, so every unattended
            call reads <b>attended and solved the same day</b> and is counted in the bands; here
            those two are left blank and this column carries the real answer.</li>
          <li><b>Open / Close</b> — Close for any <b>Solved…</b> status, report-pending included,
            as the workbook's own lookup has it. A report-pending call therefore has no solved
            date and so no Solved in Days.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
