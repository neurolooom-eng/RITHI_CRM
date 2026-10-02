import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArrivingFilter } from '../lib/arriveWith';
import { SelectPicker } from '../components/ui/SelectPicker';
import { Drawer, FacetChips, Modal, PageHeader, SectionCard } from '../components/ui/ui';
import {
  supabaseConfigured, listIndoorJobs, saveIndoorJob, markIndoorCleaned,
  listIndoorAccessories, addIndoorAccessory, saveIndoorAccessory, deleteIndoorAccessory,
  listIndoorParts, addIndoorPart, deleteIndoorPart,
  listIndoorChecks, addIndoorCheck, saveIndoorCheck, deleteIndoorCheck,
  getIndoorPdt, saveIndoorPdt, signIndoorPdt, verifyIndoorJob, sbProductBySerial, callByUcn,
  listIndoorDcs, saveIndoorReport,
  INDOOR_KINDS, INDOOR_ACTIVITIES, INDOOR_STATUSES,
  type IndoorJob, type IndoorAccessory, type IndoorPart, type IndoorCheck, type IndoorPdt,
} from '../lib/supabase';
import { coverCode } from '../lib/fieldcall';
import { canExportData } from '../lib/format';
import { xlsxDownload, xlsxCell } from '../lib/xlsx';
import { COMPLETE } from '../lib/exportscope';
import {
  REGISTER_COLUMNS, REGISTER_DATE_COLUMNS, REGISTER_SHEETS, registerJobs, registerRow,
  PDT_CHECKS, PDT_FIO2, PDT_MODES, pdtGaps, pdtOwed, type RegisterSheet,
} from '../lib/indoorforms';
import { useAuth } from '../lib/auth';
import { IndoorDcDrawer, IndoorDcList } from './IndoorDcPanel';
import { consigneeKey, jobConsignee, jobStage, INDOOR_STAGES, indoorReportFileName, type StageState } from '../lib/indoorforms';
import { IndoorIntake } from './IndoorIntake';
import { CallReportDrawer, type VisitDraft } from './CallReporting';
import { SpareRequestDrawer } from './SpareRequests';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { logAudit } from '../lib/audit';
import './indoor.css';
import { formatDay, formatDayTime } from '../lib/dates';

/** R/SER/07's "Status" is the machine's COVER, in the one vocabulary (0208). */
const COVERS = ['WGP', 'OGP', 'CMC', 'AMC'];

// ===========================================================================
// INDOOR SERVICE REGISTER — the workshop, procedure §4.5. Phase 1.
//
// TWO AXES ON EVERY ROW, and the screen keeps them visibly apart because the
// data model does. `kind` says WHOSE PROPERTY the unit is — which is what turns
// the custody duties of §7.5.10 on or off — and `activity` says WHAT IS BEING
// DONE to it. A DEMO unit in for repair is still a DEMO unit; that is the whole
// reason there are two fields and not one.
//
// THE FIELDS SHOWN FOLLOW THE ACTIVITY. Six activities have six different
// obligations: a rework owes §8.3.4 an adverse-effect assessment and a
// re-verification, a salvage owes SR-017 a condemnation author and a disposal
// route, a pre-delivery inspection owes SR-006 expected-against-measured.
// Showing all of them on every job would bury the four that matter under the
// thirty that do not, and a form nobody can read is a form nobody fills in.
//
// WHAT THE SCREEN DOES NOT ENFORCE, the database does. indoor.qc,
// indoor.dispatch and indoor.condemn are checked by a trigger (0158), so the
// buttons below being hidden is a convenience and not the control. This project
// has twice shipped a right that only the browser tested (0126, 0127).
//
// ONE WARNING THAT IS NOT A BLOCK: QC signed by the person who did the work.
// The procedure does not say it must be somebody else (open question 2 in the
// plan), so both names are recorded and the screen says so out loud. Turning
// that into a refusal is one line in the trigger the day it is decided.
// ===========================================================================

const STATUS_TONE: Record<string, string> = {
  'Received': 'ind-received',
  'Cleaned': 'ind-cleaned',
  'Under repair': 'ind-working',
  'Awaiting spares': 'ind-waiting',
  'QC': 'ind-qc',
  'Ready': 'ind-ready',
  'Dispatched': 'ind-out',
  'Closed': 'ind-closed',
  'Condemned': 'ind-condemned',
};

/** Which extra field sets an activity owes. The register core is common to all
 *  six — this is only what each one adds. */
const SHOWS = {
  rework:  (a: string) => a === 'Rework',
  salvage: (a: string) => a === 'Salvage',
  pdi:     (a: string) => a === 'Pre-delivery inspection',
  demo:    (a: string) => a === 'Demo',
  other:   (a: string) => a === 'Other',
  /** Accessories belong to anything that came from a customer, and to a demo
   *  going out — the same list checked twice, or accessories quietly stop
   *  coming back. */
  accessories: (a: string) => a !== 'Salvage',
  /** Expected-against-measured serves a PDI now and a repair's QC once Phase 3
   *  gives it per-product reference values. */
  checks:  (a: string) => a === 'Pre-delivery inspection' || a === 'Repair' || a === 'Rework',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="ind-field">
      <span className="ind-label">{label}</span>
      {children}
      {hint ? <span className="ind-hint">{hint}</span> : null}
    </label>
  );
}

export function IndoorService() {
  const live = supabaseConfigured();
  const { can, user } = useAuth();
  const mayReceive  = can('indoor.receive');
  const mayWork     = can('indoor.work');
  const mayQc       = can('indoor.qc');
  const mayDispatch = can('indoor.dispatch');
  const mayCondemn  = can('indoor.condemn');
  const mayVerify   = can('indoor.verify');
  // THE SAME GATE AS EVERY OTHER DOWNLOAD (D-018): the Excel file and the
  // printed register are the register's rows leaving the system.
  const mayExport   = can('export.data');
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<IndoorJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [activity, setActivity] = useState('');
  const [kind, setKind] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const [accessories, setAccessories] = useState<IndoorAccessory[]>([]);
  const [parts, setParts] = useState<IndoorPart[]>([]);
  const [checks, setChecks] = useState<IndoorCheck[]>([]);
  const [pdt, setPdt] = useState<IndoorPdt | null>(null);
  // THE R/SER/07 VIEW: the register as the paper keeps it, one sheet at a time.
  // 'dcs' is the list of Indoor DCs (0321), each re-printable.
  // The R/SER/07 register is the DEFAULT view (the user, 2026-10-02).
  const [view, setView] = useState<'jobs' | 'register' | 'dcs'>('register');
  // ARRIVING FROM MY WORKLOAD's Indoor DC cards opens the DC list, once.
  useArrivingFilter<string>('indoorView', (v) => { if (v === 'dcs') setView('dcs'); });
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reportFor, setReportFor] = useState<number | null>(null);
  // Each IDC number's approval status, for the stage of a job carrying it.
  const [dcStatus, setDcStatus] = useState<Record<string, string>>({});
  // INDOOR_DC: the Ready units ticked for one challan.
  const [picked, setPicked] = useState<number[]>([]);
  const [dcOpen, setDcOpen] = useState(false);
  const [sheet, setSheet] = useState<RegisterSheet>('customer');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    if (!live) return;
    setBusy(true);
    listIndoorJobs()
      .then(setJobs)
      .catch((e) => setMsg(`Could not load the register: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
    listIndoorDcs()
      .then((d) => setDcStatus(Object.fromEntries(d.map((x) => [x.dc_no, x.approval_status]))))
      .catch(() => setDcStatus({}));
  }, [live]);
  useEffect(load, [load]);

  const job = jobs.find((j) => j.id === openId) ?? null;

  // A unit can go on an Indoor DC when it is Ready, its Indoor Service Report
  // is uploaded (0323) and it carries no DC No. yet; the database asks the
  // dispatch rules besides (create_indoor_dc).
  const dcEligible = (j: IndoorJob) => j.status === 'Ready' && !(j.dispatch_ref ?? '').trim()
    && !!(j.report_file_url ?? '').trim();
  const stageOf = (j: IndoorJob) => jobStage(j, dcStatus[(j.dispatch_ref ?? '').trim()]);
  const reportJob = jobs.find((j) => j.id === reportFor) ?? null;
  const [dcFor, setDcFor] = useState<IndoorJob[] | null>(null);
  const pickedJobs = useMemo(() => picked.map((id) => jobs.find((j) => j.id === id)).filter((j): j is IndoorJob => !!j),
    [picked, jobs]);
  const pickedConsignees = new Set(pickedJobs.map((j) => consigneeKey(jobConsignee(j))));
  const togglePick = (j: IndoorJob) => setPicked((p) => (p.includes(j.id) ? p.filter((x) => x !== j.id) : [...p, j.id]));

  const loadChildren = useCallback((id: number) => {
    listIndoorAccessories(id).then(setAccessories).catch(() => setAccessories([]));
    listIndoorParts(id).then(setParts).catch(() => setParts([]));
    listIndoorChecks(id).then(setChecks).catch(() => setChecks([]));
    getIndoorPdt(id).then(setPdt).catch(() => setPdt(null));
  }, []);
  useEffect(() => { if (openId) loadChildren(openId); }, [openId, loadChildren]);

  const shown = useMemo(() => jobs.filter((j) =>
    (showClosed || !j.is_closed)
    && (!status || j.status === status)
    && (!activity || j.activity === activity)
    && (!kind || j.kind === kind)), [jobs, showClosed, status, activity, kind]);

  const overdue = jobs.filter((j) => j.demo_overdue === true).length;

  const facet = (pick: (j: IndoorJob) => string) => {
    const m = new Map<string, number>();
    jobs.filter((j) => showClosed || !j.is_closed)
        .forEach((j) => m.set(pick(j), (m.get(pick(j)) ?? 0) + 1));
    return [...m.entries()].map(([key, count]) => ({ key, count }));
  };

  const patch = async (id: number, p: Partial<IndoorJob>) => {
    const r = await saveIndoorJob(id, p);
    if (!r.ok) { setMsg(r.error ?? 'Could not save'); return; }
    setMsg('');
    setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...p } as IndoorJob : j)));
    // What the database WORKS OUT from these -- whether the product is
    // imported, the verifier, the accessories -- comes back with a reload.
    if ('product_name' in p || 'serial' in p || 'kind' in p || 'status' in p) load();
  };

  // ---- R/SER/07 -----------------------------------------------------------
  const sheetRows = useMemo(() => registerJobs(jobs, sheet, from, to), [jobs, sheet, from, to]);

  const downloadRegister = () => {
    // REFUSED HERE AS csvExport REFUSES: xlsxDownload does not test the export
    // permission itself (D-018), so the screen must.
    if (!mayExport || !canExportData()) { setMsg('Exporting / downloading data is not permitted for your role.'); return; }
    const sheets = (['customer', 'demo'] as RegisterSheet[]).map((k) => ({
      name: REGISTER_SHEETS[k].xlsxName,
      columns: [...REGISTER_COLUMNS],
      rows: registerJobs(jobs, k, from, to).map((j, i) => {
        const r = registerRow(j, i + 1);
        // DATES AS DATES: a serial plus a format, through the one shaper.
        return Object.fromEntries(REGISTER_COLUMNS.map((c) => [c,
          REGISTER_DATE_COLUMNS.includes(c) || typeof r[c] === 'number' ? xlsxCell(r[c]) : String(r[c] ?? '')]));
      }),
    }));
    const range = from || to ? `${from || '…'}_to_${to || '…'}` : 'all';
    // EXACT: listIndoorJobs reads every job, a page at a time (D-040).
    xlsxDownload(`R-SER-07-indoor-register-${range}.xlsx`, [
      ...sheets,
      { name: 'About', columns: ['Item', 'Value'], rows: [
        { Item: 'Record', Value: 'R/SER/07 INDOOR SERVICE EQUIPMENT FAILURE REGISTER' },
        { Item: 'Sheets', Value: 'Customer – Devices (Customer property) and Demo (DEMO units)' },
        { Item: 'Incoming dates', Value: from || to ? `${from ? formatDay(from) : '…'} to ${to ? formatDay(to) : '…'}` : 'All' },
        { Item: 'Status', Value: 'The machine’s cover (WGP / OGP / CMC / AMC), not the workshop stage' },
        { Item: 'Rows', Value: String(sheets.reduce((n, x) => n + x.rows.length, 0)) },
        { Item: 'Taken', Value: formatDayTime(new Date().toISOString()) },
      ] },
    ], COMPLETE);
    logAudit({ action: 'indoor.register_download', status: 'ok',
      meta: { rows: sheets.map((x) => x.rows.length), from, to, format: 'xlsx' } });
  };
  const printRegister = () => {
    if (!mayExport || !canExportData()) { setMsg('Exporting / downloading data is not permitted for your role.'); return; }
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    navigate(`/indoor-register/${sheet}${q.toString() ? `?${q}` : ''}`);
  };

  // STAGE 1: the intake FORM (IndoorIntake), not a blank job.
  const receive = () => setIntakeOpen(true);

  if (!live) {
    return (
      <>
        <PageHeader title="Indoor Service Register" icon="🏭"
          subtitle="The workshop register — procedure §4.5" />
        <SectionCard title="Not connected">
          <p>This register reads live data. Connect Supabase in Settings to use it.</p>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Indoor Service Register"
        icon="🏭"
        subtitle="Equipment in the workshop — repair, rework, salvage, pre-delivery, demo (§4.5)"
        count={shown.length}
        // EXACT, and so it takes no "+": listIndoorJobs reads every job, a
        // page at a time (D-040), so every row is on screen.
        countMore={false}
        onRefresh={load}
        refreshing={busy}
        actions={<>
          <button className="btn" onClick={() => setView((v) => (v === 'jobs' ? 'register' : 'jobs'))}>
            {view === 'jobs' ? 'R/SER/07 register view' : 'Workshop view'}
          </button>
          <button className="btn" onClick={() => setView((v) => (v === 'dcs' ? 'jobs' : 'dcs'))}>
            {view === 'dcs' ? 'Workshop view' : 'Indoor DCs'}
          </button>
          {mayDispatch && view === 'jobs' ? (
            <button className="btn" disabled={pickedJobs.length === 0 || pickedConsignees.size > 1}
              title={pickedConsignees.size > 1 ? 'One Indoor DC goes to one consignee — tick units going to the same place.'
                : 'Tick Ready units in the list, then create one DC for them.'}
              onClick={() => setDcOpen(true)}>
              Create Indoor DC{pickedJobs.length ? ` (${pickedJobs.length})` : ''}
            </button>
          ) : null}
          {mayReceive ? <button className="btn btn-primary" onClick={receive}>Receive equipment</button> : null}
        </>}
      />

      {msg ? <div className="ind-msg">{msg}</div> : null}

      {overdue > 0 ? (
        // THE NUMBER THIS REGISTER EXISTS TO PRODUCE. Nothing else in the system
        // tracks a company asset sitting at a customer site past its due date,
        // so it is stated at the top rather than left to be noticed in a column.
        <div className="ind-overdue">
          <b>{overdue}</b> demo {overdue === 1 ? 'unit is' : 'units are'} out past the expected return date.
        </div>
      ) : null}

      <div className="ind-filters">
        {/* THREE ROWS STACKED, which is the congested case even though each is
            short. Each shuts on its own and remembers, so a workshop that only
            ever filters by status puts the other two away once. */}
        <FacetChips options={facet((j) => j.status)} value={status} onChange={setStatus}
          allLabel="Every status" title="Status" storeKey="indoor.status" more={false} />
        <FacetChips options={facet((j) => j.activity)} value={activity} onChange={setActivity}
          allLabel="Every activity" title="Activity" storeKey="indoor.activity" more={false} />
        <FacetChips options={facet((j) => j.kind)} value={kind} onChange={setKind}
          allLabel="Both kinds" title="Kind" storeKey="indoor.kind" more={false} />
        <label className="ind-toggle">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show dispatched, closed and condemned
        </label>
      </div>

      {view === 'register' ? (
        <SectionCard title="R/SER/07 — Indoor Service Equipment Failure Register">
          <div className="ind-filters ind-regbar">
            <label className="ind-toggle">
              <input type="radio" checked={sheet === 'customer'} onChange={() => setSheet('customer')} />
              Customer – Devices
            </label>
            <label className="ind-toggle">
              <input type="radio" checked={sheet === 'demo'} onChange={() => setSheet('demo')} />
              Demo
            </label>
            <label className="ind-toggle">Incoming from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="ind-toggle">to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {mayExport ? <>
              <button className="btn" onClick={downloadRegister}>⭳ Excel (both sheets)</button>
              <button className="btn" onClick={printRegister}>🖨 Print this sheet</button>
            </> : null}
          </div>
          <p className="ind-note">
            The paper register’s columns, in its order. S.No runs within the sheet in incoming-date order;
            <b> Status</b> is the machine’s cover, not the workshop stage.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th title="Where the unit is in the workflow — on screen only, the paper has no such column">Stage</th>
                {REGISTER_COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {sheetRows.map((j, i) => {
                  const r = registerRow(j, i + 1);
                  const st = stageOf(j);
                  return (
                    <tr key={j.id} className="row-click" onClick={() => setOpenId(j.id)}>
                      <td><span className={`ind-stagechip ${st.current < 5 && !st.offPath ? 'is-now' : ''}`}>{st.label}</span></td>
                      {REGISTER_COLUMNS.map((c) => (
                        <td key={c}>{c === 'Indoor Service Report No'
                          // STAGE 4 FROM THE REGISTER: a link once uploaded; an
                          // Upload button once the unit is cleaned.
                          ? ((j.report_file_url ?? '').trim()
                              ? <a href={j.report_file_url} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()} title={j.report_file_name}>{j.indoor_report_no || 'report'} ↗</a>
                              : j.cleaned_at && mayWork
                                ? <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setReportFor(j.id); }}>⭱ Upload</button>
                                : <span className="ind-hint">{j.indoor_report_no || (j.cleaned_at ? '' : 'after cleaning')}</span>)
                          : REGISTER_DATE_COLUMNS.includes(c) ? formatDay(r[c]) : String(r[c] ?? '')}</td>
                      ))}
                    </tr>
                  );
                })}
                {sheetRows.length === 0 ? (
                  <tr><td colSpan={REGISTER_COLUMNS.length + 1} className="ind-empty">Nothing on this sheet for these dates.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {view === 'dcs' ? (
        <SectionCard title="Indoor DCs — delivery challans out of the workshop">
          <IndoorDcList onChanged={load} />
        </SectionCard>
      ) : null}

      {view === 'jobs' && mayDispatch && pickedConsignees.size > 1 ? (
        <div className="ind-msg">One Indoor DC goes to one consignee — the ticked units go to {[...new Set(pickedJobs.map((j) => jobConsignee(j) || '(none)'))].join(' / ')}.</div>
      ) : null}

      {view === 'jobs' ? (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {mayDispatch ? <th title="Tick Ready units for one Indoor DC">DC</th> : null}
              <th>Job</th><th>Kind</th><th>Activity</th><th>Product</th>
              <th>Serial</th><th>Customer</th><th>Stage</th><th>Status</th><th>Tag</th><th>Received</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((j) => (
              <tr key={j.id} className="row-click" onClick={() => setOpenId(j.id)}>
                {mayDispatch ? (
                  <td onClick={(e) => e.stopPropagation()}>
                    {dcEligible(j)
                      ? <input type="checkbox" checked={picked.includes(j.id)} onChange={() => togglePick(j)}
                          aria-label={`Put ${j.job_no} on an Indoor DC`} />
                      : (j.dispatch_ref ?? '').trim() ? <span className="mono ind-hint">{j.dispatch_ref}</span> : null}
                  </td>
                ) : null}
                <td className="mono">{j.job_no}</td>
                <td>{j.kind === 'DEMO unit'
                  // A DEMO unit is marked because the custody duties do NOT
                  // apply to it — the distinction the procedure gives a
                  // different tag (4.5.5).
                  ? <span className="ind-demo">DEMO</span>
                  : <span className="ind-cust">Customer</span>}</td>
                <td>{j.activity}</td>
                <td>{j.product_name}</td>
                <td className="mono">{j.serial}</td>
                <td>{j.party_name ?? ''}</td>
                <td><span className={`ind-stagechip ${stageOf(j).current < 5 && !stageOf(j).offPath ? 'is-now' : ''}`}>{stageOf(j).label}</span></td>
                <td><span className={`ind-chip ${STATUS_TONE[j.status] ?? ''}`}>{j.status}</span>
                  {j.demo_overdue === true ? <span className="ind-late">overdue</span> : null}</td>
                <td className="mono">{j.tag_no}</td>
                <td>{formatDayTime(j.received_at)}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr><td colSpan={mayDispatch ? 11 : 10} className="ind-empty">
                Nothing in the workshop matching this filter.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      ) : null}

      <Drawer open={(dcOpen && pickedJobs.length > 0) || !!dcFor} onClose={() => { setDcOpen(false); setDcFor(null); }} storeKey="indoor-dc"
        title="Create Indoor DC">
        {dcFor || (dcOpen && pickedJobs.length > 0) ? (
          <IndoorDcDrawer jobs={dcFor ?? pickedJobs} onClose={() => { setDcOpen(false); setDcFor(null); }}
            onIssued={(no) => { setDcOpen(false); setDcFor(null); setPicked([]); setMsg(`Indoor DC ${no} created — pending approval.`); load(); }} />
        ) : null}
      </Drawer>

      <Drawer open={intakeOpen} onClose={() => setIntakeOpen(false)} storeKey="indoor-intake" title="Receive equipment — intake">
        {intakeOpen ? (
          <IndoorIntake onCancel={() => setIntakeOpen(false)}
            onFiled={(id, no) => { setIntakeOpen(false); setMsg(`Filed as ${no}`); load(); setOpenId(id); }} />
        ) : null}
      </Drawer>

      {reportJob ? (
        <ReportUpload job={reportJob} onClose={() => setReportFor(null)}
          onDone={() => { setReportFor(null); setMsg(`Indoor Service Report saved on ${reportJob.job_no}.`); load(); }} />
      ) : null}

      <Drawer open={!!job} onClose={() => setOpenId(null)} storeKey="indoor-job"
        title={job ? `${job.job_no} — ${job.product_name || 'equipment'}` : ''}>
        {job ? (
          <IndoorJobDrawer
            job={job}
            accessories={accessories} parts={parts} checks={checks} pdt={pdt}
            reloadChildren={() => loadChildren(job.id)}
            reload={load}
            patch={patch}
            uid={user?.id ?? ''}
            rights={{ mayReceive, mayWork, mayQc, mayDispatch, mayCondemn, mayVerify }}
            setMsg={setMsg}
            stage={stageOf(job)}
            dcStatus={dcStatus[(job.dispatch_ref ?? '').trim()]}
            onUpload={() => setReportFor(job.id)}
            onCreateDc={dcEligible(job) && mayDispatch ? () => setDcFor([job]) : undefined}
          />
        ) : null}
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// THE JOB DRAWER — the workflow as STAGES (0323, the user, 2026-10-02):
// Intake -> Cleaning -> Repair -> Report -> DC (pending approval) ->
// Dispatched / Approved, with a stepper at the top.
//
// ONLY THE CURRENT AND COMPLETED STAGES ARE SHOWN (the user's rule): at intake
// there are no DC fields at all; the repair opens once the unit is cleaned;
// the report can be uploaded once it is cleaned (the database refuses it
// earlier); the DC appears once the report is uploaded. The ORDER is enforced
// where it is a rule -- by the database -- and nothing is timed. This
// replaces the earlier "every step always visible" layout, which the user
// asked to change. The activity-specific sections (rework, salvage, PDI, demo,
// PDT, condemn, verify) sit in the stage they belong to.
// ---------------------------------------------------------------------------
function IndoorJobDrawer({
  job, accessories, parts, checks, pdt, reloadChildren, reload, patch, uid, rights, setMsg,
  stage, dcStatus, onUpload, onCreateDc,
}: {
  job: IndoorJob;
  accessories: IndoorAccessory[];
  parts: IndoorPart[];
  checks: IndoorCheck[];
  pdt: IndoorPdt | null;
  reloadChildren: () => void;
  reload: () => void;
  patch: (id: number, p: Partial<IndoorJob>) => Promise<void>;
  uid: string;
  rights: { mayReceive: boolean; mayWork: boolean; mayQc: boolean;
            mayDispatch: boolean; mayCondemn: boolean; mayVerify: boolean };
  setMsg: (s: string) => void;
  stage: StageState;
  dcStatus?: string;
  onUpload: () => void;
  onCreateDc?: () => void;
}) {
  const { mayWork, mayQc, mayDispatch, mayCondemn, mayVerify } = rights;
  const navigate = useNavigate();
  const cleaned = !!job.cleaned_at;
  const reported = !!(job.report_file_url ?? '').trim();
  // REQUEST SPARE: the SAME Spare Request drawer the call view raises, with
  // this job's call passed in; the requester is the signed-in engineer (the
  // drawer's own default). The call's status is NOT touched.
  const [spareCall, setSpareCall] = useState<Record<string, unknown> | null>(null);
  const requestSpare = async () => {
    const u = (job.ucn ?? '').trim();
    if (!u) return;
    const c = await callByUcn(u).catch(() => null);
    if (!c) { setMsg(`Call ${u} was not found, or you cannot view it — the spare request needs the call.`); return; }
    setSpareCall(c);
  };

  // THE COVER IS READ FROM THE MACHINE (the user's decision 1): the Product
  // Database by model + serial, normalised to WGP / OGP / CMC / AMC, whenever
  // the product or serial changes. Editable afterwards. An ambiguous or absent
  // machine fills NOTHING and says so -- a wrong cover is worse than none.
  const lookupCover = async (product: string, serial: string) => {
    if (!serial.trim()) return;
    const m = await sbProductBySerial(serial.trim(), product.trim()).catch(() => null);
    const cover = m ? coverCode(m['Item Status']) : '';
    if (cover) void patch(job.id, { cover });
    else setMsg(`No single machine in the Product Database matches ${product || '(no product)'} / ${serial} — Status (cover) left as it is; set it by hand.`);
  };
  // A CALL NAMES ITS ENGINEER AND PLACE: prefilled from the call when a UCN is
  // given, only into fields still blank, and editable.
  const fromCall = async (ucn: string) => {
    if (!ucn.trim()) return;
    const c = await callByUcn(ucn.trim()).catch(() => null);
    if (!c) { setMsg(`Call ${ucn} was not found, or you cannot view it.`); return; }
    const p: Partial<IndoorJob> = {};
    if (!job.engineer_name?.trim() && String(c.allocatedTo ?? '').trim()) p.engineer_name = String(c.allocatedTo).trim();
    if (!job.customer_place?.trim() && String(c.city ?? '').trim()) p.customer_place = String(c.city).trim();
    if (!(job.party_name ?? '').trim() && String(c.partyName ?? '').trim()) p.party_name = String(c.partyName).trim();
    if (Object.keys(p).length) void patch(job.id, p);
  };
  const verifiable = ['Dispatched', 'Closed', 'Condemned'].includes(job.status);
  const owed = pdtOwed(job);
  const gaps = pdtGaps(pdt);
  const pdtSet = async (p: Partial<IndoorPdt>) => {
    const r = await saveIndoorPdt(job.id, p);
    if (!r.ok) setMsg(r.error ?? 'Could not save the test'); else { setMsg(''); reloadChildren(); }
  };
  const numOrNull = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const a = job.activity;
  // A job turned into a DEMO unit with no engineer named gets the paper's own
  // entry: the Demo sheet of R/SER/07 reads "Indoor Service" in Engineer Name.
  const set = (p: Partial<IndoorJob>) => void patch(job.id,
    p.kind === 'DEMO unit' && !job.engineer_name?.trim() ? { ...p, engineer_name: 'Indoor Service' } : p);

  // THE SEGREGATION WARNING (4.5.6). Not a block — the procedure does not say
  // the check must be somebody else's, so the register records both names and
  // says plainly when they are the same. Somebody reading the record later can
  // then judge it; a system that silently allowed it could not be judged at all.
  const selfChecked = !!job.qc_result && job.qc_by === job.received_by;

  const child = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await fn();
    if (!r.ok) setMsg(r.error ?? 'Could not save'); else { setMsg(''); reloadChildren(); }
  };

  return (
    <div className="ind-drawer">
      {/* ---- THE STAGES (0323) ------------------------------------------- */}
      <div className="ind-stepper" aria-label="Stage">
        {INDOOR_STAGES.map((n, i) => (
          <div key={n} className={`ind-step ${stage.done[i] ? 'is-done' : ''} ${i === stage.current ? 'is-now' : ''}`}>
            <span className="ind-dot">{stage.done[i] ? '✓' : ''}</span>
            <span className="ind-step-name">{n === 'DC' ? (dcStatus === 'Pending approval' ? 'DC pending approval' : 'DC / Dispatched') : n}</span>
          </div>
        ))}
      </div>
      <p className="ind-note"><span className="ind-stage-now">{stage.label}</span></p>

      {/* ---- 1. RECEIVE (4.5.2) ------------------------------------------ */}
      <SectionCard title="1 · Intake — received (4.5.2)">
        <div className="ind-grid">
          <Field label="Whose property is it?"
            hint="Customer property carries the duty of care of §7.5.10; a DEMO unit is the company's own stock.">
            <SelectPicker value={job.kind} options={[...INDOOR_KINDS]}
              onChange={(v) => set({ kind: v })} disabled={!mayWork} />
          </Field>
          <Field label="What is being done to it?"
            hint="A different question from the one above, and it stays a different field.">
            <SelectPicker value={job.activity} options={[...INDOOR_ACTIVITIES]}
              onChange={(v) => set({ activity: v })} disabled={!mayWork} />
          </Field>
          <Field label="Product">
            <input defaultValue={job.product_name} disabled={!mayWork}
              onBlur={(e) => { if (e.target.value !== job.product_name) { set({ product_name: e.target.value }); void lookupCover(e.target.value, job.serial); } }} />
          </Field>
          <Field label="Serial number">
            <input defaultValue={job.serial} disabled={!mayWork} className="mono"
              onBlur={(e) => { if (e.target.value !== job.serial) { set({ serial: e.target.value }); void lookupCover(job.product_name, e.target.value); } }} />
          </Field>
          <Field label="Customer" hint="Left blank for a DEMO unit that has no customer.">
            <input defaultValue={job.party_name ?? ''} disabled={!mayWork}
              onBlur={(e) => set({ party_name: e.target.value })} />
          </Field>
          <Field label="Call (UCN)" hint="Optional — a DEMO unit has no call. Phase 2 links it both ways.">
            <input defaultValue={job.ucn ?? ''} disabled={!mayWork} className="mono"
              onBlur={(e) => { if (e.target.value !== (job.ucn ?? '')) { set({ ucn: e.target.value }); void fromCall(e.target.value); } }} />
          </Field>
          <Field label="Identification tag (4.5.4)">
            <input defaultValue={job.tag_no} disabled={!mayWork} className="mono"
              onBlur={(e) => set({ tag_no: e.target.value })} />
          </Field>
        </div>
        {/* THE REGISTER'S OWN COLUMNS (R/SER/07), in its words. */}
        <div className="ind-grid">
          <Field label="Field Service Report No">
            <input defaultValue={job.field_report_no} disabled={!mayWork} className="mono"
              onBlur={(e) => set({ field_report_no: e.target.value })} />
          </Field>
          <Field label="Engineer Name" hint="From the call’s allocated engineer when a UCN is given; “Indoor Service” for a DEMO unit.">
            <input key={`eng-${job.engineer_name}`} defaultValue={job.engineer_name} disabled={!mayWork}
              onBlur={(e) => set({ engineer_name: e.target.value })} />
          </Field>
          <Field label="Customer Place">
            <input key={`place-${job.customer_place}`} defaultValue={job.customer_place} disabled={!mayWork}
              onBlur={(e) => set({ customer_place: e.target.value })} />
          </Field>
          <Field label="Status (cover)" hint="Read from the machine in the Product Database when the product or serial changes. Not the workshop stage.">
            <SelectPicker value={job.cover} options={job.cover && !COVERS.includes(job.cover) ? [...COVERS, job.cover] : COVERS}
              onChange={(v) => set({ cover: v })} disabled={!mayWork} />
          </Field>
        </div>
        {(job.standard_complaint ?? '').trim() ? (
          <Field label="Standard Complaint" hint="As the call records it — read only.">
            <input value={job.standard_complaint} disabled /></Field>
        ) : null}
        <Field label="Problem Reported">
          <textarea defaultValue={job.problem_reported} disabled={!mayWork} rows={2}
            onBlur={(e) => set({ problem_reported: e.target.value })} />
        </Field>
        <Field label="Condition on arrival"
          hint="The baseline any later damage claim is judged against — so it is worth writing even when nothing is wrong.">
          <textarea defaultValue={job.condition_on_arrival} disabled={!mayWork} rows={2}
            onBlur={(e) => set({ condition_on_arrival: e.target.value })} />
        </Field>
        <p className="ind-note">
          Received by <b>{job.received_by_name || '—'}</b> on {formatDayTime(job.received_at)}.
        </p>
      </SectionCard>

      {/* ---- accessories (4.5.4) ------------------------------------------ */}
      {SHOWS.accessories(a) ? (
        <SectionCard title="Accessories received">
          <p className="ind-note">
            Tagged to the parent equipment (4.5.4). Returning the customer's accessories is
            part of returning their property, and a list is what makes that checkable at
            dispatch — {job.accessories_outstanding} of {job.accessory_count} still to go back.
          </p>
          <table className="table ind-child">
            <thead><tr><th>Item</th><th>Qty</th><th>Serial</th><th>Tag</th>{reported ? <th>Returned</th> : null}<th /></tr></thead>
            <tbody>
              {accessories.map((x) => (
                <tr key={x.id}>
                  <td><input defaultValue={x.name} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { name: e.target.value }))} /></td>
                  <td><input type="number" min={1} step="any" style={{ width: 64 }} defaultValue={x.qty ?? 1} disabled={!mayWork}
                    onBlur={(e) => { const q = Number(e.target.value); if (q > 0 && q !== Number(x.qty)) void child(() => saveIndoorAccessory(x.id, { qty: q })); }} /></td>
                  <td><input defaultValue={x.serial} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { serial: e.target.value }))} /></td>
                  <td><input defaultValue={x.tag_no} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { tag_no: e.target.value }))} /></td>
                  {reported ? <td><input type="checkbox" checked={x.returned} disabled={!mayWork}
                    onChange={(e) => child(() => saveIndoorAccessory(x.id, { returned: e.target.checked }))} /></td> : null}
                  <td>{mayWork ? <button className="btn-link"
                    onClick={() => child(() => deleteIndoorAccessory(x.id))}>remove</button> : null}</td>
                </tr>
              ))}
              {accessories.length === 0 ? <tr><td colSpan={6} className="ind-empty">Nothing listed.</td></tr> : null}
            </tbody>
          </table>
          {mayWork ? <button className="btn"
            onClick={() => child(() => addIndoorAccessory(job.id, { name: '', qty: 1 }))}>＋ Add an item</button> : null}
        </SectionCard>
      ) : null}

      {/* ---- 2. CLEAN (4.5.3) -------------------------------------------- */}
      <SectionCard title="2 · Cleaning — as per the work instruction (4.5.3)">
        <div className="ind-grid">
          <Field label="Work instruction"><input defaultValue={job.cleaning_wi} disabled={!mayWork}
            onBlur={(e) => set({ cleaning_wi: e.target.value })} /></Field>
          <Field label="Revision" hint="Which revision it was cleaned against — the WI changes, the record should say which one applied.">
            <input defaultValue={job.cleaning_wi_rev} disabled={!mayWork}
              onBlur={(e) => set({ cleaning_wi_rev: e.target.value })} /></Field>
        </div>
        {job.cleaned_at
          ? <p className="ind-note">Cleaned by <b>{job.cleaned_by_name || '—'}</b> on {formatDayTime(job.cleaned_at)}.</p>
          : mayWork
            ? <button className="btn" onClick={async () => {
                const r = await markIndoorCleaned(job.id, job.cleaning_wi || 'WI/SER/01', job.cleaning_wi_rev, uid);
                if (!r.ok) setMsg(r.error ?? 'Could not record the cleaning');
                else { setMsg(''); void patch(job.id, { status: 'Cleaned' }); }
              }}>Mark cleaning done</button>
            : <p className="ind-note">Not yet cleaned.</p>}
        {SHOWS.salvage(a) ? (
          <label className="ind-check">
            <input type="checkbox" checked={job.decontaminated} disabled={!mayWork}
              onChange={(e) => set({ decontaminated: e.target.checked })} />
            Decontaminated — <b>required before any part is harvested</b>. The database refuses the harvest until this is ticked.
          </label>
        ) : null}
      </SectionCard>

      {cleaned ? (<>
      {/* ---- 3. WORK (4.5.6) --------------------------------------------- */}
      <SectionCard title="3 · Repair — findings and work done (4.5.6)">
        <div className="ind-grid">
          <Field label="Status">
            {/* DISPATCHED AND CLOSED ARE THE DISPATCH RIGHT'S (finding 59, 0297):
                the picker offered them to indoor.work, and the database now
                refuses that, so the picker does not offer what it will refuse. */}
            <SelectPicker value={job.status}
              options={INDOOR_STATUSES.filter((st) => mayDispatch || !['Dispatched', 'Closed'].includes(st) || st === job.status)}
              onChange={(v) => set({ status: v })} disabled={!mayWork} />
          </Field>
          {/* Offered to whoever works the job; RAISING it is the Spare Request
              register's own right, which the database asks on submit -- the
              key belongs to that page's row on Roles & Permissions, not this one. */}
          {(job.ucn ?? '').trim() && mayWork ? (
            <Field label="Spares" hint="The Spare Request form, with this call filled in and you as the requester (it needs the Spare Request right). The call’s status is not changed.">
              <button className="btn" onClick={() => void requestSpare()}>Request spare</button>
            </Field>
          ) : null}
        </div>
        <Field label="Findings"><textarea defaultValue={job.findings} disabled={!mayWork} rows={3}
          onBlur={(e) => set({ findings: e.target.value })} /></Field>
        <Field label="Work done"><textarea defaultValue={job.work_done} disabled={!mayWork} rows={3}
          onBlur={(e) => set({ work_done: e.target.value })} /></Field>
        <Field label="Damage to the customer's property"
          hint="§7.5.10 — damage to somebody's machine is theirs to be told about, and this is where that is recorded rather than nowhere.">
          <textarea defaultValue={job.damage_note} disabled={!mayWork} rows={2}
            onBlur={(e) => set({ damage_note: e.target.value })} /></Field>
      </SectionCard>

      {/* ---- per-activity -------------------------------------------------- */}
      {SHOWS.rework(a) ? (
        <SectionCard title="Rework — §8.3.4">
          <div className="ind-grid">
            <Field label="Nonconformity reference"><input defaultValue={job.nc_reference} disabled={!mayWork}
              onBlur={(e) => set({ nc_reference: e.target.value })} /></Field>
            <Field label="Rework instruction" hint="Rework runs to a DOCUMENTED instruction, not from memory.">
              <input defaultValue={job.rework_instruction} disabled={!mayWork}
                onBlur={(e) => set({ rework_instruction: e.target.value })} /></Field>
            <Field label="Instruction revision"><input defaultValue={job.rework_instruction_rev} disabled={!mayWork}
              onBlur={(e) => set({ rework_instruction_rev: e.target.value })} /></Field>
            <Field label="Authorised by" hint="The same authority that approved the original process.">
              <input defaultValue={job.rework_authorised_by} disabled={!mayWork}
                onBlur={(e) => set({ rework_authorised_by: e.target.value })} /></Field>
            <Field label="Re-verified by"><input defaultValue={job.reverified_by} disabled={!mayWork}
              onBlur={(e) => set({ reverified_by: e.target.value })} /></Field>
            <Field label="Re-verification result" hint="Rework without re-verification proves nothing.">
              <SelectPicker value={job.reverification_result ?? ''} options={['Pass', 'Fail']}
                onChange={(v) => set({ reverification_result: v })} disabled={!mayWork} /></Field>
            <Field label="Disposition" hint="A failed rework has to end somewhere.">
              <SelectPicker value={job.disposition ?? ''} options={['Released', 'Scrapped']}
                onChange={(v) => set({ disposition: v })} disabled={!mayWork} /></Field>
          </div>
          <label className="ind-check">
            <input type="checkbox" checked={job.adverse_effect_assessed === true} disabled={!mayWork}
              onChange={(e) => set({ adverse_effect_assessed: e.target.checked })} />
            Adverse effect of the rework assessed — <b>§8.3.4 asks for this explicitly</b>, and it is the field most likely to be left out.
          </label>
          <Field label="What the assessment found">
            <textarea defaultValue={job.adverse_effect_note} disabled={!mayWork} rows={2}
              onBlur={(e) => set({ adverse_effect_note: e.target.value })} /></Field>
        </SectionCard>
      ) : null}

      {SHOWS.salvage(a) ? (
        <SectionCard title="Salvage — the unit is condemned, the parts are not">
          <div className="ind-grid">
            <Field label="Why it is being condemned">
              <input defaultValue={job.condemned_reason} disabled={!mayCondemn}
                onBlur={(e) => set({ condemned_reason: e.target.value })} /></Field>
            <Field label="Disposal method" hint="What was NOT harvested still has to go somewhere — e-waste, and biohazard where the unit was in patient contact.">
              <input defaultValue={job.disposal_method} disabled={!mayWork}
                onBlur={(e) => set({ disposal_method: e.target.value })} /></Field>
            <Field label="Disposal reference"><input defaultValue={job.disposal_ref} disabled={!mayWork}
              onBlur={(e) => set({ disposal_ref: e.target.value })} /></Field>
          </div>
          {!mayCondemn ? (
            <p className="ind-note">
              Condemning a unit needs the <b>Condemn</b> right, which is granted separately —
              scrapping a customer's machine is not a decision that arrives with the page.
            </p>
          ) : null}
          {job.kind === 'Customer property' ? (
            <label className="ind-check">
              <input type="checkbox" checked={job.customer_informed} disabled={!mayWork}
                onChange={(e) => set({ customer_informed: e.target.checked })} />
              The customer has been told — scrapping somebody's machine is theirs to know.
            </label>
          ) : null}
          {job.condemned_at ? (
            <p className="ind-note">Condemned by <b>{job.condemned_by_name || '—'}</b> on {formatDayTime(job.condemned_at)}.</p>
          ) : null}

          <h4 className="ind-sub">Parts harvested</h4>
          <p className="ind-note">
            Recorded here and <b>not credited to hand stock</b>: a harvested part entering
            stock under its normal code is indistinguishable from a new one, and the
            condition grade would be decoration. Where it went is written in words until
            that is settled.
          </p>
          <table className="table ind-child">
            <thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Grade</th><th>Destination</th><th /></tr></thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.part_code}</td><td>{p.description}</td>
                  <td>{p.qty}</td><td>{p.condition_grade}</td><td>{p.destination}</td>
                  <td>{mayWork ? <button className="btn-link"
                    onClick={() => child(() => deleteIndoorPart(p.id))}>remove</button> : null}</td>
                </tr>
              ))}
              {parts.length === 0 ? <tr><td colSpan={6} className="ind-empty">Nothing harvested yet.</td></tr> : null}
            </tbody>
          </table>
          {mayWork ? (
            <button className="btn" disabled={!job.decontaminated}
              title={job.decontaminated ? '' : 'The unit has to be decontaminated first (4.5.3)'}
              onClick={() => child(() => addIndoorPart(job.id, { part_code: '', qty: 1, condition_grade: 'Serviceable' }))}>
              Add a harvested part
            </button>
          ) : null}
        </SectionCard>
      ) : null}

      {SHOWS.pdi(a) ? (
        <SectionCard title="Pre-delivery inspection">
          <div className="ind-grid">
            <Field label="Arrived on" hint="The SA number, PO or stock receipt it came in against.">
              <input defaultValue={job.source_ref} disabled={!mayWork}
                onBlur={(e) => set({ source_ref: e.target.value })} /></Field>
            <Field label="Checklist"><input defaultValue={job.checklist_ref} disabled={!mayWork}
              onBlur={(e) => set({ checklist_ref: e.target.value })} /></Field>
            <Field label="Checklist revision"><input defaultValue={job.checklist_rev} disabled={!mayWork}
              onBlur={(e) => set({ checklist_rev: e.target.value })} /></Field>
            <Field label="Firmware version"><input defaultValue={job.firmware_version} disabled={!mayWork}
              onBlur={(e) => set({ firmware_version: e.target.value })} /></Field>
            <Field label="Result" hint="“Pass with observation” is what stops a real finding being rounded up to Pass. A Fail does not leave the workshop.">
              <SelectPicker value={job.pdi_result ?? ''} options={['Pass', 'Pass with observation', 'Fail']}
                onChange={(v) => set({ pdi_result: v })} disabled={!mayWork} /></Field>
            <Field label="Why it is being held"><input defaultValue={job.held_reason} disabled={!mayWork}
              onBlur={(e) => set({ held_reason: e.target.value })} /></Field>
          </div>
          <label className="ind-check">
            <input type="checkbox" checked={job.accessories_per_packing_list === true} disabled={!mayWork}
              onChange={(e) => set({ accessories_per_packing_list: e.target.checked })} />
            Accessories match the packing list.
          </label>
        </SectionCard>
      ) : null}

      {SHOWS.demo(a) ? (
        <SectionCard title="Demo — a company asset on loan">
          <div className="ind-grid">
            <Field label="Going to"><input defaultValue={job.demo_for_party} disabled={!mayWork}
              onBlur={(e) => set({ demo_for_party: e.target.value })} /></Field>
            <Field label="Requested by"><input defaultValue={job.requested_by} disabled={!mayWork}
              onBlur={(e) => set({ requested_by: e.target.value })} /></Field>
            <Field label="Expected out"><input type="date" defaultValue={job.expected_out ?? ''} disabled={!mayWork}
              onBlur={(e) => set({ expected_out: e.target.value })} /></Field>
            <Field label="Expected back" hint="A demo unit is an asset on loan and it needs a due date — this is what makes the overdue count possible.">
              <input type="date" defaultValue={job.expected_return ?? ''} disabled={!mayWork}
                onBlur={(e) => set({ expected_return: e.target.value })} /></Field>
            <Field label="Actually out"><input type="date" defaultValue={job.actual_out ?? ''} disabled={!mayWork}
              onBlur={(e) => set({ actual_out: e.target.value })} /></Field>
            <Field label="Actually back"><input type="date" defaultValue={job.actual_return ?? ''} disabled={!mayWork}
              onBlur={(e) => set({ actual_return: e.target.value })} /></Field>
            <Field label="Who has it now"><input defaultValue={job.custody_holder} disabled={!mayWork}
              onBlur={(e) => set({ custody_holder: e.target.value })} /></Field>
            <Field label="Outcome" hint="What the demo was FOR.">
              <SelectPicker value={job.demo_outcome ?? ''} options={['Converted', 'Returned', 'Damaged', 'Lost']}
                onChange={(v) => set({ demo_outcome: v })} disabled={!mayWork} /></Field>
            <Field label="Sale reference"><input defaultValue={job.sale_ref} disabled={!mayWork}
              onBlur={(e) => set({ sale_ref: e.target.value })} /></Field>
          </div>
          <div className="ind-grid">
            <Field label="Condition going out"><textarea defaultValue={job.condition_out} rows={2} disabled={!mayWork}
              onBlur={(e) => set({ condition_out: e.target.value })} /></Field>
            <Field label="Condition coming back"><textarea defaultValue={job.condition_back} rows={2} disabled={!mayWork}
              onBlur={(e) => set({ condition_back: e.target.value })} /></Field>
          </div>
          <Field label="Consumables used" hint="A demo burns stock, and that stock is real.">
            <input defaultValue={job.consumables_used} disabled={!mayWork}
              onBlur={(e) => set({ consumables_used: e.target.value })} /></Field>
        </SectionCard>
      ) : null}

      {SHOWS.other(a) ? (
        <SectionCard title="Other — what this job actually is">
          <Field label="Description (required)"
            hint="“Other” with no description is a hole in the record, so the database refuses it. If Other passes about one job in ten, the list is missing an activity — the fix is a new type, not a bigger box.">
            <textarea defaultValue={job.activity_note} rows={2} disabled={!mayWork}
              onBlur={(e) => set({ activity_note: e.target.value })} /></Field>
        </SectionCard>
      ) : null}

      {/* ---- the checks (SR-003 / SR-006 / SR-020) ------------------------ */}
      {SHOWS.checks(a) ? (
        <SectionCard title="Checks — expected against measured">
          <p className="ind-note">
            A reading on its own is not evidence: SR-006 asks for the expected value beside
            it, and SR-020 for the instrument that took it, with its calibration date.
            Phase 3 fills the expected column from per-product reference values; until then
            it is typed from the checklist.
          </p>
          <table className="table ind-child">
            <thead><tr><th>Parameter</th><th>Expected</th><th>Measured</th><th>Verdict</th>
              <th>Instrument</th><th>Cal. due</th><th /></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td><input defaultValue={c.parameter} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorCheck(c.id, { parameter: e.target.value }))} /></td>
                  <td><input defaultValue={c.expected} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorCheck(c.id, { expected: e.target.value }))} /></td>
                  <td><input defaultValue={c.measured} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorCheck(c.id, { measured: e.target.value }))} /></td>
                  <td><SelectPicker value={c.verdict} options={['Pass', 'Fail', 'N/A']} disabled={!mayWork}
                    onChange={(v) => child(() => saveIndoorCheck(c.id, { verdict: v }))} /></td>
                  <td><input defaultValue={c.instrument} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorCheck(c.id, { instrument: e.target.value }))} /></td>
                  <td><input type="date" defaultValue={c.calibration_due ?? ''} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorCheck(c.id, { calibration_due: e.target.value }))} /></td>
                  <td>{mayWork ? <button className="btn-link"
                    onClick={() => child(() => deleteIndoorCheck(c.id))}>remove</button> : null}</td>
                </tr>
              ))}
              {checks.length === 0 ? <tr><td colSpan={7} className="ind-empty">No checks recorded.</td></tr> : null}
            </tbody>
          </table>
          {mayWork ? <button className="btn"
            onClick={() => child(() => addIndoorCheck(job.id, { seq: checks.length + 1 }))}>Add a check</button> : null}
        </SectionCard>
      ) : null}

      {/* ---- R/SER/QC/007 (0320) ------------------------------------------
          OWED BY A DEMO UNIT OF AN IMPORTED PRODUCT, and only by one -- the
          user: "Pre-delivery check is done only for Imported products, not for
          in-house manufactured equipment." Unknown is said out loud, because
          it is a Product Master gap somebody can close. */}
      {job.kind === 'DEMO unit' && owed !== true ? (
        <SectionCard title="Pre-Delivery Testing (R/SER/QC/007)">
          {owed === null ? (
            <p className="ind-warn">
              Whether <b>{job.product_name || 'this product'}</b> is imported is <b>not known</b> — no product line in
              the Product Master matches it, or its <b>Imported</b> is blank. Pre-Delivery Testing is required
              for a DEMO unit of an imported product only, so it is <b>not</b> required to dispatch this unit
              until somebody sets Imported on the Product Master.
            </p>
          ) : (
            <p className="ind-note">
              {job.product_name || 'This product'} is made in-house (Product Master: Imported = No) — Pre-Delivery
              Testing is done for imported products only.
            </p>
          )}
        </SectionCard>
      ) : null}
      {owed === true ? (
        <SectionCard title="Pre-Delivery Testing (R/SER/QC/007)">
          <p className="ind-note">
            A DEMO unit of an imported product. It is <b>not dispatched or closed</b> until every field below is
            filled, the inspector has signed, and checks 1–5 all read <b>OK</b> — the database refuses it otherwise.
          </p>
          <div className="ind-grid">
            <Field label="Product Name"><input value={job.product_name} disabled /></Field>
            <Field label="SL. No"><input value={job.serial} disabled className="mono" /></Field>
            <Field label="Date"><input type="date" key={`d-${pdt?.test_date}`} defaultValue={pdt?.test_date ?? ''} disabled={!mayWork}
              onBlur={(e) => void pdtSet({ test_date: e.target.value || null })} /></Field>
            <Field label="Measuring Equipment ID No"><input key={`m-${pdt?.measuring_equipment_id}`} defaultValue={pdt?.measuring_equipment_id ?? ''} disabled={!mayWork}
              onBlur={(e) => void pdtSet({ measuring_equipment_id: e.target.value })} /></Field>
            <Field label="Software Version"><input key={`s-${pdt?.software_version}`} defaultValue={pdt?.software_version ?? ''} disabled={!mayWork}
              onBlur={(e) => void pdtSet({ software_version: e.target.value })} /></Field>
            <Field label="HV"><input key={`hv-${pdt?.hv}`} defaultValue={pdt?.hv ?? ''} disabled={!mayWork}
              onBlur={(e) => void pdtSet({ hv: e.target.value })} /></Field>
            <Field label="HT"><input key={`ht-${pdt?.ht}`} defaultValue={pdt?.ht ?? ''} disabled={!mayWork}
              onBlur={(e) => void pdtSet({ ht: e.target.value })} /></Field>
          </div>
          <table className="table ind-child">
            <thead><tr><th>S.No</th><th>Description</th><th>OK / NOT OK</th></tr></thead>
            <tbody>
              {PDT_CHECKS.map((c) => (
                <tr key={c.no}>
                  <td>{c.no}.</td>
                  <td>{c.text}</td>
                  <td>{c.key
                    ? <SelectPicker value={pdt?.[c.key] ?? ''} options={['OK', 'NOT OK']} disabled={!mayWork}
                        onChange={(v) => void pdtSet({ [c.key!]: v || null } as Partial<IndoorPdt>)} />
                    : <span className="ind-hint">instruction — not judged</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {PDT_MODES.map((m) => (
            <table className="table ind-child" key={m.no}>
              <thead>
                <tr><th colSpan={4}>{m.no}. {m.settings}</th></tr>
                <tr><th />{PDT_FIO2.map((f) => <th key={f}>At FiO2 {f}%</th>)}</tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.label}>
                    <td><b>{r.label}</b></td>
                    {r.keys.map((k) => (
                      <td key={k}><input type="number" step="any" key={`${k}-${pdt?.[k]}`} defaultValue={pdt?.[k] ?? ''} disabled={!mayWork}
                        onBlur={(e) => void pdtSet({ [k]: numOrNull(e.target.value) } as Partial<IndoorPdt>)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p className="ind-note">
            <b>Inspected by:</b>{' '}
            {pdt?.inspected_by
              ? <>{pdt.inspector_name || '—'}{pdt.inspector_designation ? `, ${pdt.inspector_designation}` : ''} on {formatDayTime(pdt.inspected_at)}</>
              : 'not signed yet'}
            {mayWork ? (
              <> {' '}
                <button className="btn btn-sm" onClick={async () => {
                  const r = await signIndoorPdt(job.id, uid, !pdt?.inspected_by);
                  if (!r.ok) setMsg(r.error ?? 'Could not sign'); else { setMsg(''); reloadChildren(); }
                }}>{pdt?.inspected_by ? 'Withdraw the signature' : 'Sign as the inspector'}</button>
              </>
            ) : null}
          </p>
          {gaps.notOk.length ? (
            <p className="ind-warn">Check {gaps.notOk.join(', ')} reads NOT OK — the unit cannot be dispatched.</p>
          ) : null}
          {gaps.blank.length ? (
            <p className="ind-warn">Still blank: {gaps.blank.join(', ')}. The unit cannot be dispatched until the test is complete.</p>
          ) : null}
          <button className="btn" onClick={() => navigate(`/indoor-pdt/${job.id}`)}>
            🖨 Print R/SER/QC/007{gaps.blank.length || gaps.notOk.length ? ' (not complete — the sheet says so)' : ''}
          </button>
        </SectionCard>
      ) : null}

      {/* ---- 4. QC (4.5.6) ------------------------------------------------ */}
      <SectionCard title="Quality check (4.5.6) — the last step of the repair">
        <div className="ind-grid">
          <Field label="Result" hint="A Fail sends it back to Under repair. A machine does not leave with a failed check.">
            <SelectPicker value={job.qc_result ?? ''} options={['Pass', 'Fail']} disabled={!mayQc}
              onChange={(v) => set(v === 'Fail'
                ? { qc_result: v, status: 'Under repair' }
                : { qc_result: v })} /></Field>
          <Field label="Notes"><input defaultValue={job.qc_notes} disabled={!mayQc}
            onBlur={(e) => set({ qc_notes: e.target.value })} /></Field>
        </div>
        {!mayQc ? (
          <p className="ind-note">
            Signing the check needs the <b>quality check</b> right, which is separate from the
            work on purpose — it is what lets the check be somebody other than the person who
            did the repair.
          </p>
        ) : null}
        {job.qc_at ? (
          <p className="ind-note">Checked by <b>{job.qc_by_name || '—'}</b> on {formatDayTime(job.qc_at)}.</p>
        ) : null}
        {selfChecked ? (
          <p className="ind-warn">
            The check was signed by the same person who received the unit. The procedure
            does not forbid it, and this is recorded rather than blocked — but where a
            second pair of hands is available, the check is worth more from them.
          </p>
        ) : null}
      </SectionCard>
      </>) : null}

      {/* ---- 4. SERVICE REPORT (0323) -------------------------------------
          Uploaded after cleaning (the database refuses it earlier). For a job
          with a UCN the same form drafts the Visit Entry; it is filed against
          the call when the Indoor DC is approved. */}
      {cleaned ? (
        <SectionCard title="4 · Indoor Service Report">
          {reported ? (
            <p className="ind-note">
              Report <b className="mono">{job.indoor_report_no}</b> —{' '}
              <a href={job.report_file_url} target="_blank" rel="noopener noreferrer">{job.report_file_name || 'open'} ↗</a>
              {job.report_uploaded_at ? <> · uploaded by <b>{job.report_uploaded_by_name || '—'}</b> on {formatDayTime(job.report_uploaded_at)}</> : null}
            </p>
          ) : <p className="ind-note">Not uploaded yet.</p>}
          {(job.ucn ?? '').trim() ? (
            job.visit_filed_at
              ? <p className="ind-note">Visit <b className="mono">{job.visit_uid}</b> filed against {job.ucn} on {formatDayTime(job.visit_filed_at)} (at the Indoor DC’s approval).</p>
              : job.visit_draft
                ? <p className="ind-note">The visit against <b>{job.ucn}</b> is <b>drafted</b>{job.visit_date ? <> (visit date {formatDay(job.visit_date)})</> : null} — Unsolved, pending Return to Field. It is filed when the Indoor DC is approved.</p>
                : <p className="ind-warn">The visit against {job.ucn} is not drafted yet — the upload form asks for it.</p>
          ) : <p className="ind-note">No call — a DEMO / new device files no visit.</p>}
          {mayWork && !(job.dispatch_ref ?? '').trim()
            ? <button className="btn" onClick={onUpload}>{reported ? 'Change the report / visit details' : '⭱ Upload the Indoor Service Report'}</button>
            : null}
        </SectionCard>
      ) : null}

      {reported ? (<>
      {/* ---- 5. DISPATCH (4.5.7) ------------------------------------------ */}
      <SectionCard title="5 · Indoor DC and dispatch (4.5.7)">
        {onCreateDc ? (
          <p className="ind-note"><button className="btn btn-primary" onClick={onCreateDc}>Create Indoor DC for this unit</button>
            {' '}or tick it with others going to the same place in the Workshop view.</p>
        ) : !(job.dispatch_ref ?? '').trim() && job.status !== 'Ready' ? (
          <p className="ind-note">A unit goes on an Indoor DC once it is <b>Ready</b>.</p>
        ) : null}
        {dcStatus === 'Pending approval' ? (
          <p className="ind-warn">Indoor DC <b>{job.dispatch_ref}</b> is <b>pending approval</b> — the unit is dispatched once it is approved.</p>
        ) : dcStatus === 'Approved' ? (
          <p className="ind-note">Indoor DC <b>{job.dispatch_ref}</b> is approved.</p>
        ) : null}
        <Field label="Dispatch reference (DC number)">
          <input defaultValue={job.dispatch_ref} disabled={!mayDispatch}
            onBlur={(e) => set({ dispatch_ref: e.target.value })} /></Field>
        {job.accessories_outstanding > 0 ? (
          <p className="ind-warn">
            {job.accessories_outstanding} accessor{job.accessories_outstanding === 1 ? 'y is' : 'ies are'} still
            not marked returned. Returning the customer's property means returning all of it.
          </p>
        ) : null}
        <Field label="DC Date" hint="Set by the Indoor DC: the date it was entered.">
          <input value={job.dc_date ? formatDay(job.dc_date) : ''} disabled /></Field>
        {job.dispatched_at ? (
          <p className="ind-note">Dispatched by <b>{job.dispatched_by_name || '—'}</b> on {formatDayTime(job.dispatched_at)}.</p>
        ) : null}
        {/^IDC-/.test(job.dispatch_ref ?? '') ? (
          // INDOOR_DC (0321): a reference the database issued, so its challan exists.
          <p className="ind-note">
            On Indoor DC <b>{job.dispatch_ref}</b>.{' '}
            <button className="btn btn-sm" onClick={() => navigate(`/indoor-dc/${encodeURIComponent(job.dispatch_ref)}`)}>🖨 Print the DC</button>
          </p>
        ) : null}
        {!mayDispatch ? <p className="ind-note">Dispatching needs the <b>dispatch</b> right.</p> : null}
        <Field label="Remarks">
          <textarea defaultValue={job.remarks} disabled={!mayWork} rows={2}
            onBlur={(e) => set({ remarks: e.target.value })} /></Field>
      </SectionCard>
      </>) : null}

      {/* ---- 6. VERIFIED BY (R/SER/07) ------------------------------------ */}
      {verifiable || job.verified_at ? (
      <SectionCard title="6 · Verified by">
        {job.verified_at ? (
          <p className="ind-note">Verified by <b>{job.verified_by_name || '—'}</b> on {formatDayTime(job.verified_at)}.</p>
        ) : verifiable ? (
          mayVerify
            ? <button className="btn" onClick={async () => {
                const r = await verifyIndoorJob(job.id, uid);
                if (!r.ok) setMsg(r.error ?? 'Could not verify');
                else { setMsg(''); reload(); }
              }}>Verify this register entry</button>
            : <p className="ind-note">Not verified yet. Verifying needs the <b>Verify an Indoor Service register entry</b> right.</p>
        ) : (
          <p className="ind-note">A register entry is verified once the unit is Dispatched, Closed or Condemned.</p>
        )}
      </SectionCard>
      ) : null}

      {spareCall ? (
        <SpareRequestDrawer call={spareCall} open={!!spareCall} onClose={() => setSpareCall(null)}
          onSaved={(u) => { setSpareCall(null); setMsg(`Spare request raised for ${u} — track it under Spares → Spare Requests.`); }} />
      ) : null}

      <p className="ind-foot">
        Last changed by {job.updated_by_name || '—'}. Phase 2 links this back to the call:
        the transfer of 4.5.1, a chip on the call itself, and the field engineer's
        completion report closing it (4.5.7).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STAGE 4 -- THE INDOOR SERVICE REPORT UPLOAD (0323).
//
// THE FILE goes to Drive through the bridge every other upload in this app
// uses (uploadToDrive, apps-script/CallReg.gs), NAMED "<Indoor Service Report
// No>_<original file name>" (indoorReportFileName) so it traces back to the
// register. No Drive folder is named: the bridge has none for Indoor Service
// yet, so it lands in the drive root, as the Document Library's do.
//
// A JOB WITH A UCN gets the Visit Entry form itself (CallReportDrawer in its
// Indoor mode): every field the visit asks, by the visit form's own rules,
// with Call Status / Pending Reason / Update Visit Work Details? fixed --
// saved as a DRAFT on the job and filed when the Indoor DC is approved. A
// DEMO / new device (no UCN) gets the report number and the file only.
// ---------------------------------------------------------------------------
async function uploadIndoorReportFile(file: File, reportNo: string): Promise<{ ok: boolean; url?: string; name?: string; error?: string }> {
  if (!reportNo.trim()) return { ok: false, error: 'Enter the Indoor Service Report No. first — the file is named after it.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  const named = new File([file], indoorReportFileName(reportNo, file.name), { type: file.type || 'application/octet-stream' });
  const r = await uploadToDrive(named);
  return r.ok && r.url ? { ok: true, url: r.url, name: named.name } : { ok: false, error: r.error ?? 'Upload failed.' };
}

function ReportUpload({ job, onClose, onDone }: { job: IndoorJob; onClose: () => void; onDone: () => void }) {
  const ucn = (job.ucn ?? '').trim();
  const [call, setCall] = useState<Record<string, unknown> | null | undefined>(ucn ? undefined : null);
  const [reportNo, setReportNo] = useState(job.indoor_report_no ?? '');
  const [link, setLink] = useState(job.report_file_url ?? '');
  const [name, setName] = useState(job.report_file_name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!ucn) return;
    let live = true;
    callByUcn(ucn).then((c) => { if (live) setCall(c); }).catch(() => { if (live) setCall(null); });
    return () => { live = false; };
  }, [ucn]);

  if (!job.cleaned_at) {
    return (
      <Modal open onClose={onClose} title="Indoor Service Report">
        <p className="ind-warn">The report is uploaded after the unit is cleaned (WI/SER/01). Mark cleaning done first.</p>
      </Modal>
    );
  }

  if (ucn) {
    if (call === undefined) return <Modal open onClose={onClose} title="Indoor Service Report"><p className="ind-note">Reading call {ucn}…</p></Modal>;
    if (call === null) {
      return (
        <Modal open onClose={onClose} title="Indoor Service Report">
          <p className="ind-warn">Call {ucn} was not found, or you cannot view it — the visit details cannot be drafted without the call.
            Ask an administrator for sight of the call (the Field / Installation / PM register’s view right).</p>
        </Modal>
      );
    }
    return (
      <CallReportDrawer call={call} open onClose={onClose}
        indoor={{
          initial: (job.visit_draft as unknown as VisitDraft | null) ?? null,
          reportNo: job.indoor_report_no ?? '',
          reportLink: job.report_file_url ?? '',
          upload: async (file, no) => {
            const r = await uploadIndoorReportFile(file, no);
            if (r.ok && r.name) setName(r.name);
            return r;
          },
          onSave: async (d, no, url) => {
            const r = await saveIndoorReport(job.id, {
              reportNo: no, url, fileName: url === job.report_file_url ? (job.report_file_name || name) : name,
              visitDraft: d as unknown as Record<string, unknown>, visitDate: d.visitDate,
            });
            if (r.ok) { logAudit({ action: 'indoor.report_upload', target: job.job_no, status: 'ok', meta: { ucn, report_no: no } }); onDone(); }
            return r;
          },
        }} />
    );
  }

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr('');
    const r = await uploadIndoorReportFile(file, reportNo);
    setBusy(false);
    if (!r.ok || !r.url) { setErr(r.error ?? 'Upload failed.'); return; }
    setLink(r.url); setName(r.name ?? '');
  };
  const save = async () => {
    if (!reportNo.trim()) { setErr('Enter the Indoor Service Report No.'); return; }
    if (!link) { setErr('Upload the report file.'); return; }
    setBusy(true);
    const r = await saveIndoorReport(job.id, { reportNo: reportNo.trim(), url: link, fileName: name });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    logAudit({ action: 'indoor.report_upload', target: job.job_no, status: 'ok', meta: { report_no: reportNo.trim() } });
    onDone();
  };
  return (
    <Modal open onClose={onClose} title={`Indoor Service Report — ${job.job_no}`}>
      {err ? <div className="ind-warn">{err}</div> : null}
      <p className="ind-note">No call — a DEMO / new device files no visit. The report number and the file are all this stage asks.</p>
      <Field label="Indoor Service Report No *">
        <input className="mono" value={reportNo} onChange={(e) => setReportNo(e.target.value)} /></Field>
      <Field label="The report" hint={`Saved in Drive as “${reportNo.trim() || '<report no>'}_<file name>”. PDF or photo, up to 10 MB.`}>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer">{name || 'uploaded'} ↗</a> : null}
        <input type="file" accept=".pdf,image/*" disabled={busy || !reportNo.trim()}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !link}>{busy ? 'Saving…' : 'Save the report'}</button>
      </div>
    </Modal>
  );
}
