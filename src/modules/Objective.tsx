import { useEffect, useState } from 'react';
import { PageHeader, SectionCard, Modal } from '../components/ui/ui';
import {
  countKpiFieldInst, listKpiFieldInst, listQualityObjectives, saveObjectiveCell,
  recalcObjectives, objectiveEvidence, saveObjectiveDef, addObjective, deleteObjective,
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
                        'party_name', 'call_type', 'status', 'allocated_to'];
  const downloadEvidence = async (o: QualityObjective, monthIndex: number) => {
    try {
      const rows = await objectiveEvidence(o.id, monthIndex + 1);
      if (!rows.length) { setOMsg('There is nothing behind that figure to download.'); return; }
      const role = (r: Record<string, unknown>) => String(r.role ?? '');
      const calls = rows.filter((r) => role(r) !== 'machine');
      const machines = rows.filter((r) => role(r) === 'machine');

      const isRate = o.calc_key === 'failure_rate_12m';
      const numerator = isRate ? calls.length : calls.filter((r) => role(r) === 'open').length;
      const denominator = isRate ? machines.length : calls.length;
      const computed = denominator ? numerator / denominator : null;
      const stored = o[MONTH_KEYS[monthIndex]];

      const calc: Record<string, unknown>[] = [
        { Item: 'Objective', Value: o.parameter },
        { Item: 'Year / month', Value: `${YEAR} ${MONTHS[monthIndex]}` },
        { Item: 'Yearly target', Value: o.yearly_target },
        { Item: 'Worked out by', Value: o.calc_key || 'not computed — this figure is typed' },
        { Item: 'Parameters', Value: JSON.stringify(o.calc_params ?? {}) },
        { Item: '', Value: '' },
        { Item: isRate ? 'Failures (Sheet 1)' : 'Still open at month end (Sheet 1)', Value: numerator },
        { Item: isRate ? 'Machines in the field (Sheet 2)' : 'Calls raised in the month (Sheet 1)', Value: denominator },
        { Item: 'Calculation', Value: `${numerator} ÷ ${denominator}` },
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
        { Item: 'Machines counted', Value: 'as the Product Register stands today — it keeps no history of past installs' },
        { Item: 'Downloaded', Value: new Date().toISOString() },
      ];

      const safe = o.parameter.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      xlsxDownload(`evidence-${safe}-${YEAR}-${MONTHS[monthIndex]}.xlsx`, [
        { name: 'List of Field Calls', columns: ['role', ...CALL_COLUMNS], rows: calls },
        {
          name: 'Installation Base',
          columns: machines.length ? ['product_name', 'serial', 'party_name', 'status'] : ['Note'],
          // An empty tab reads as a bug. This rate is calls over calls, and
          // saying so is the honest content of the sheet.
          rows: machines.length ? machines : [{ Note: 'This objective is calls over calls — it has no installed base. The denominator is on Sheet 1.' }],
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
                <option value="open_rate_monthly">open_rate_monthly — still open at the month's end ÷ that month's calls</option>
              </select>
            </div>
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
