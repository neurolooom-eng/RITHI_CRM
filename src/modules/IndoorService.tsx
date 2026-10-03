import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArrivingFilter } from '../lib/arriveWith';
import { SelectPicker } from '../components/ui/SelectPicker';
import { Drawer, FacetChips, Modal, PageHeader, SectionCard } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import {
  supabaseConfigured, listIndoorJobs, saveIndoorJob, markIndoorCleaned,
  listIndoorAccessories, addIndoorAccessory, saveIndoorAccessory, deleteIndoorAccessory,
  listIndoorParts, addIndoorPart, deleteIndoorPart,
  listIndoorChecks, addIndoorCheck, saveIndoorCheck, deleteIndoorCheck,
  getIndoorPdt, saveIndoorPdt, signIndoorPdt, verifyIndoorJob, sbProductBySerial, callByUcn,
  listIndoorDcs, saveIndoorReport, deleteIndoorJob,
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
import { IndoorDcForm, IndoorDcList } from './IndoorDcPanel';
import { consigneeKey, jobConsignee, jobStage, INDOOR_STAGES, STAGES_DONE, indoorReportFileName, type StageState } from '../lib/indoorforms';
import { IndoorIntake } from './IndoorIntake';
import { CallReportDrawer, type IndoorDraftMode, type VisitDraft } from './CallReporting';
import { SpareRequestDrawer } from './SpareRequests';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { logAudit } from '../lib/audit';
import './indoor.css';
import { formatDay, formatDayTime } from '../lib/dates';

/** R/SER/07's "Status" is the machine's COVER, in the one vocabulary (0208). */
const COVERS = ['WGP', 'OGP', 'CMC', 'AMC'];

/** One register row: the R/SER/07 values under their headings, the stage, the job. */
type RegisterRow = Record<string, unknown> & { Stage: string; _job: IndoorJob };
/** Starting widths for the register's columns -- the reader resizes them and
 *  the table remembers. Text-heavy columns start wider. */
const REGISTER_WIDTH: Record<string, number> = {
  'S.No': 60, 'Product Name': 150, 'Customer Name': 190, 'Customer Place': 130, 'Problem Reported': 220,
  'Accessories Received': 190, 'Engineer Name': 140, 'Remarks': 180, 'Status': 80, 'Verified By': 130,
};

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

/** A field: the label above, the control, and a hint only where it prevents a
 *  mistake. `tip` is the longer explanation, on hover. `wide` spans the grid. */
function Field({ label, hint, tip, wide, children }: {
  label: string; hint?: string; tip?: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <label className={`ind-field${wide ? ' is-wide' : ''}`} title={tip}>
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
  // DELETING A JOB (0324): its own key, granted to no role by migration; the
  // database asks it again and refuses a job a DC or a filed visit names.
  const mayDelete   = can('indoor.delete');
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
  // Which page the job drawer opens on: undefined = the job's current stage;
  // the register's Upload opens it on the Report page.
  const [openPage, setOpenPage] = useState<number | undefined>(undefined);
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
  // CREATE DC FROM THE JOB opens the DC form BESIDE the job, in the same
  // window (the user, 2026-10-03) -- it used to open a drawer behind it.
  const [dcPane, setDcPane] = useState(false);
  useEffect(() => { setDcPane(false); }, [openId]);
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

  // THE REGISTER IN THE APP'S OWN TABLE (the user, 2026-10-03): widths,
  // order, wrap and the column picker as on every register. One flat row per
  // job -- the R/SER/07 values under their own headings, so the table's sort
  // and filters read them -- with the job itself carried under `_job`.
  // Every job is already on screen (listIndoorJobs reads them all, a page at a
  // time), so there is no Load more and the count is exact.
  const registerRows = useMemo<RegisterRow[]>(() => sheetRows.map((j, i) => ({
    ...registerRow(j, i + 1), Stage: stageOf(j).label, _job: j,
  })), [sheetRows, dcStatus]);  // eslint-disable-line react-hooks/exhaustive-deps
  const registerColumns = useMemo<Column<RegisterRow>[]>(() => [
    { key: 'Stage', header: 'Stage', width: 150,
      render: (r) => {
        const st = stageOf(r._job);
        return <span className={`ind-stagechip ${st.current < STAGES_DONE && !st.offPath ? 'is-now' : ''}`}
          title="Where the unit is in the workflow — on screen only, the paper has no such column">{st.label}</span>;
      } },
    ...REGISTER_COLUMNS.map((c): Column<RegisterRow> => ({
      key: c,
      header: c,
      width: REGISTER_WIDTH[c] ?? 130,
      accessor: (r) => {
        const v = r[c];
        return typeof v === 'number' ? v : String(v ?? '');
      },
      render: c === 'Indoor Service Report No'
        // STAGE 4 FROM THE REGISTER: a link once uploaded; an Upload button
        // (the job on its Repair page) once the unit is cleaned.
        ? (r) => {
            const j = r._job;
            if ((j.report_file_url ?? '').trim()) {
              return <a href={j.report_file_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()} title={j.report_file_name}>{j.indoor_report_no || 'report'} ↗</a>;
            }
            if (j.cleaned_at && mayWork) {
              return <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setOpenPage(2); setOpenId(j.id); }}>⭱ Upload</button>;
            }
            return <span className="ind-hint">{j.indoor_report_no || (j.cleaned_at ? '' : 'after cleaning')}</span>;
          }
        : REGISTER_DATE_COLUMNS.includes(c)
          ? (r) => formatDay(r[c] as string)
          : undefined,
    })),
  ], [mayWork, dcStatus]);  // eslint-disable-line react-hooks/exhaustive-deps

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
        count={view === 'register' ? sheetRows.length : shown.length}
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
          <p className="ind-note ind-regnote">
            The paper register’s columns, in its order — drag a heading to move it, its edge to size it, ⚙ to show or hide.
            S.No runs within the sheet in incoming-date order; <b>Status</b> is the machine’s cover, not the workshop stage.
          </p>
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
          <DataTable<RegisterRow>
            columns={registerColumns}
            rows={registerRows}
            getRowId={(r) => String(r._job.id)}
            storageKey="indoorRegister.rser07"
            rowsBeforeScroll={14}
            dense
            onRowClick={(r) => { setOpenPage(undefined); setOpenId(r._job.id); }}
            emptyText="Nothing on this sheet for these dates."
          />
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
              <tr key={j.id} className="row-click" onClick={() => { setOpenPage(undefined); setOpenId(j.id); }}>
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
                <td><span className={`ind-stagechip ${stageOf(j).current < STAGES_DONE && !stageOf(j).offPath ? 'is-now' : ''}`}>{stageOf(j).label}</span></td>
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

      {/* THE TICKED UNITS' DC (Workshop view) -- no job is open, so nothing
          sits in front of it. From a job, the DC opens beside the job instead. */}
      <Drawer open={dcOpen && pickedJobs.length > 0} onClose={() => setDcOpen(false)} storeKey="indoor-dc"
        title="Create Indoor DC">
        {dcOpen && pickedJobs.length > 0 ? (
          <IndoorDcForm jobs={pickedJobs} onClose={() => setDcOpen(false)}
            onIssued={(no) => { setDcOpen(false); setPicked([]); setMsg(`Indoor DC ${no} created — pending approval.`); load(); }} />
        ) : null}
      </Drawer>

      <Drawer open={intakeOpen} onClose={() => setIntakeOpen(false)} storeKey="indoor-intake" title="Receive equipment — intake">
        {intakeOpen ? (
          <IndoorIntake onCancel={() => setIntakeOpen(false)}
            onFiled={(id, no) => { setIntakeOpen(false); setMsg(`Filed as ${no}`); load(); setOpenPage(undefined); setOpenId(id); }} />
        ) : null}
      </Drawer>


      {job ? (
        <IndoorJobWindow
          title={`${job.job_no} — ${job.product_name || 'equipment'}`}
          subtitle={[job.serial ? `Sl.No ${job.serial}` : '', jobConsignee(job), job.ucn ?? ''].filter(Boolean).join(' · ')}
          onClose={() => setOpenId(null)}
          actions={mayDelete ? <DeleteJobAction job={job} onDeleted={(no) => { setOpenId(null); setMsg(`${no} deleted permanently.`); load(); }} /> : null}
          side={dcPane && dcEligible(job) && mayDispatch ? (
            <IndoorDcForm jobs={[job]} inPane onClose={() => setDcPane(false)}
              onIssued={(no) => { setDcPane(false); setMsg(`Indoor DC ${no} created — pending approval.`); load(); }} />
          ) : null}
          sideTitle="Create Indoor DC"
          onCloseSide={() => setDcPane(false)}
        >
          <IndoorJobDrawer
            key={job.id}
            job={job}
            msg={msg}
            accessories={accessories} parts={parts} checks={checks} pdt={pdt}
            reloadChildren={() => loadChildren(job.id)}
            reload={load}
            patch={patch}
            uid={user?.id ?? ''}
            rights={{ mayReceive, mayWork, mayQc, mayDispatch, mayCondemn, mayVerify }}
            setMsg={setMsg}
            stage={stageOf(job)}
            dcStatus={dcStatus[(job.dispatch_ref ?? '').trim()]}
            startAt={openPage}
            onReportSaved={() => { setMsg(`Indoor Service Report saved on ${job.job_no}.`); load(); }}
            onCreateDc={dcEligible(job) && mayDispatch ? () => setDcPane(true) : undefined}
            dcOpen={dcPane}
          />
        </IndoorJobWindow>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// THE JOB DRAWER — the workflow as PAGES, one stage at a time (0323; the user,
// 2026-10-03: "Can the stages not be changed into pages [Next Page] instead of
// 1 looooong page?", and "Section 3 of the current form is covered as part of
// the uploaded service report").
//
// Intake -> Cleaning -> Repair (the service report) -> DC. The stepper at the
// top is the page navigator; Back / Next sit at the bottom. The drawer opens
// on the job's CURRENT stage (jobStage), or on Repair from the register's
// Upload, and remembers nothing across jobs (it is keyed by the job). A page
// opens when its stage is done or by the gates the long page used: Repair once
// the unit is cleaned (the database refuses a report earlier), DC once the
// report is uploaded -- plus, for a condemned unit, DC, where Verified By lives.
// Where Next cannot go further it is replaced by the page's own action (Mark
// cleaning done, Create Indoor DC, Verify) or one line saying what is needed.
//
// Where each section lives:
//   Intake   -- property / activity / product / serial / tag / cover, customer
//               and call, Field Service Report No, engineer, place, the call's
//               Standard Complaint (read only), problem, condition on arrival,
//               received-by, and the accessories received.
//   Cleaning -- work instruction + revision, cleaned-by, and (Salvage) the
//               decontamination tick that gates a harvest.
//   Repair   -- THE SERVICE REPORT, inline (no second drawer): report number,
//               file, and for a job with a call the visit's work details by the
//               Visit Entry's own fields and rules, consumption included, with
//               Request spare beside it. Findings / Work done are no longer
//               asked separately: the visit's Complaint Observation / Job Done
//               are those answers, mirrored onto the job on upload. Then what
//               the visit does not carry (status, damage note), the activity
//               blocks, the checks, the PDT, and the QC last.
//   DC       -- the Indoor DC and its approval, dispatch reference, DC date,
//               print, accessories still out, remarks, and Verified By.
// ---------------------------------------------------------------------------
const PAGE_TITLE = ['Intake', 'Cleaning', 'Repair — the service report', 'Indoor DC & dispatch'];
const PAGE_CLAUSE = ['4.5.2', '4.5.3', '4.5.6', '4.5.7'];
const LAST_PAGE = INDOOR_STAGES.length - 1;

/** A read-only value: plain text, not a disabled input. */
function Value({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`ind-field${wide ? ' is-wide' : ''}`}>
      <span className="ind-label">{label}</span>
      <span className="ind-value">{children}</span>
    </div>
  );
}

/** One group of a page: a small uppercase eyebrow, a hairline above. */
function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ind-group">
      <div className="ind-group-head">
        <h4 className="ind-eyebrow">{title}</h4>
        {aside ? <div className="ind-group-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// THE JOB AS A WINDOW (the user, 2026-10-03): centred, large, scrolling inside,
// Esc or × to close -- and when "Create DC" is pressed it becomes TWO PANES,
// the job on the left and the DC form on the right, with a divider the reader
// drags. The split is remembered per device, as the Pending Registrations
// panes are. Closing the DC pane returns to the single pane. Esc closes the
// DC pane first, then the window; it is left alone while a picker, drawer or
// confirmation inside the window is open (they take Esc themselves).
//
// Not the shared Modal: that one has no Esc, no second pane and no divider,
// and widening it for one screen would change every modal in the app.
// ---------------------------------------------------------------------------
const SPLIT_KEY = 'rithi.indoor.split';
const readSplit = () => {
  try {
    const n = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(n) && n >= 30 && n <= 75) return n;
  } catch { /* a private window */ }
  return 58;
};

function IndoorJobWindow({ title, subtitle, onClose, actions, side, sideTitle, onCloseSide, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: React.ReactNode;
  side?: React.ReactNode;
  sideTitle?: string;
  onCloseSide?: () => void;
  children: React.ReactNode;
}) {
  const [split, setSplit] = useState(readSplit);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);
  const two = !!side;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Something inside the window is on top -- it handles its own Esc.
      if (document.querySelector('.drawer-overlay, .modal-overlay')) return;
      if (two && onCloseSide) onCloseSide(); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [two, onClose, onCloseSide]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setSplit(Math.max(30, Math.min(75, d.start + ((e.clientX - d.x) / d.width) * 100)));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove('drawer-resizing');
      setSplit((v) => { try { localStorage.setItem(SPLIT_KEY, String(Math.round(v))); } catch { /* ignore */ } return v; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { x: e.clientX, start: split, width: boxRef.current?.getBoundingClientRect().width ?? 1200 };
    document.body.classList.add('drawer-resizing');
  };
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    e.preventDefault();
    setSplit((v) => {
      const n = Math.max(30, Math.min(75, v + step));
      try { localStorage.setItem(SPLIT_KEY, String(Math.round(n))); } catch { /* ignore */ }
      return n;
    });
  };

  return (
    <div className="ind-win-overlay" onMouseDown={onClose}>
      <div ref={boxRef} className={`ind-win${two ? ' is-two' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        style={two ? { gridTemplateColumns: `minmax(0, ${split}fr) 10px minmax(0, ${100 - split}fr)` } : undefined}>
        <section className="ind-win-pane">
          <header className="ind-win-head">
            <div className="ind-win-titles">
              <h2 className="ind-win-title">{title}</h2>
              {subtitle ? <div className="ind-win-sub">{subtitle}</div> : null}
            </div>
            <div className="ind-win-actions">
              {actions}
              <button type="button" className="ind-win-x" onClick={onClose} aria-label="Close" title="Close (Esc)">×</button>
            </div>
          </header>
          <div className="ind-win-body">{children}</div>
        </section>
        {two ? (<>
          <div className="ind-win-grip" role="separator" aria-orientation="vertical" aria-label="Resize the two panes"
            aria-valuenow={Math.round(split)} aria-valuemin={30} aria-valuemax={75} tabIndex={0}
            onPointerDown={startDrag} onKeyDown={nudge} title="Drag to resize" />
          <section className="ind-win-pane is-side">
            <header className="ind-win-head">
              <div className="ind-win-titles">
                <div className="ind-eyebrow">Indoor DC</div>
                <h2 className="ind-win-title">{sideTitle}</h2>
              </div>
              <div className="ind-win-actions">
                <button type="button" className="ind-win-x" onClick={onCloseSide} aria-label="Close the DC form" title="Close the DC form">×</button>
              </div>
            </header>
            <div className="ind-win-body">{side}</div>
          </section>
        </>) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DELETE JOB (0324) -- quiet, in the window's header, only to a holder of
// indoor.delete. It asks why and makes the reader type the job number, because
// the deletion is PERMANENT (the user's choice over keep-and-hide). The
// database refuses a job a DC or a filed visit names, in its own words, and
// writes the audit row; this screen only says what happened.
// ---------------------------------------------------------------------------
function DeleteJobAction({ job, onDeleted }: { job: IndoorJob; onDeleted: (jobNo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const blocked = (job.dispatch_ref ?? '').trim()
    ? `It carries DC No. ${job.dispatch_ref} — a job that went on a delivery challan is kept.`
    : job.visit_uid
      ? `Its visit ${job.visit_uid} is filed against ${job.ucn} — the call’s history names it, so it is kept.`
      : '';
  const close = () => { setOpen(false); setReason(''); setTyped(''); setErr(''); };
  const go = async () => {
    setBusy(true); setErr('');
    const r = await deleteIndoorJob(job.id, reason.trim());
    setBusy(false);
    logAudit({ action: 'indoor.job_delete', target: job.job_no, status: r.ok ? 'ok' : 'error', error: r.ok ? undefined : r.error,
               meta: { via: 'screen', product: job.product_name, serial: job.serial, ucn: job.ucn ?? '' } });
    if (!r.ok) { setErr(r.error ?? 'Not deleted.'); return; }
    close();
    onDeleted(r.jobNo || job.job_no);
  };
  return (<>
    <button type="button" className="ind-danger-link" onClick={() => setOpen(true)}
      title="Delete this job permanently — only before it has gone on a DC or had its visit filed">Delete job</button>
    <Modal open={open} onClose={close} title={`Delete ${job.job_no}?`} width={480}>
      <div className="ind-form ind-confirm">
        {blocked ? (
          <p className="ind-warn">{blocked}</p>
        ) : (<>
          <p className="ind-confirm-lead">
            <b>{job.job_no}</b> — {job.product_name || 'equipment'}{job.serial ? <> · Sl.No <span className="mono">{job.serial}</span></> : null}
            {job.ucn ? <> · call <span className="mono">{job.ucn}</span></> : null}
          </p>
          <p className="ind-hint">The job, its accessories, harvested parts, checks and Pre-Delivery Testing are removed for good. The number is not issued again. The deletion is recorded with your name and the reason.</p>
          <Field label="Why is it being deleted? *" wide>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate intake — the unit is IND26-0012" />
          </Field>
          <Field label={`Type ${job.job_no} to confirm`} wide>
            <input className="mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          {err ? <p className="ind-warn">{err}</p> : null}
        </>)}
        <div className="ind-confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>{blocked ? 'Close' : 'Cancel'}</button>
          {blocked ? null : (
            <button type="button" className="btn btn-danger" onClick={() => void go()}
              disabled={busy || !reason.trim() || typed.trim().toUpperCase() !== job.job_no.toUpperCase()}>
              {busy ? 'Deleting…' : 'Delete permanently'}</button>
          )}
        </div>
      </div>
    </Modal>
  </>);
}

function IndoorJobDrawer({
  job, accessories, parts, checks, pdt, reloadChildren, reload, patch, uid, rights, msg, setMsg,
  stage, dcStatus, startAt, onReportSaved, onCreateDc, dcOpen,
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
  msg: string;
  setMsg: (s: string) => void;
  stage: StageState;
  dcStatus?: string;
  /** The page to open on; the job's current stage when absent. */
  startAt?: number;
  onReportSaved: () => void;
  onCreateDc?: () => void;
  /** The DC form is open beside the job. */
  dcOpen?: boolean;
}) {
  const { mayWork, mayQc, mayDispatch, mayCondemn, mayVerify } = rights;
  const navigate = useNavigate();
  const cleaned = !!job.cleaned_at;
  const reported = !!(job.report_file_url ?? '').trim();
  const verifiable = ['Dispatched', 'Closed', 'Condemned'].includes(job.status);

  // WHICH PAGES OPEN: a done stage, or the gate the long page used -- Repair
  // (the service report) once cleaned, which is when the database first takes
  // a report; DC once the report is uploaded, or for a condemned unit (Verified
  // By lives there).
  const reach = [
    true,
    true,
    cleaned || stage.done[2],
    reported || stage.done[3] || stage.offPath,
  ];
  const [view, setView] = useState(() => {
    let v = Math.min(startAt ?? stage.current, LAST_PAGE);
    while (v > 0 && !reach[v]) v -= 1;
    return v;
  });
  const go = (i: number) => { if (i >= 0 && i <= LAST_PAGE && reach[i]) setView(i); };

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
  // says plainly when they are the same.
  const selfChecked = !!job.qc_result && job.qc_by === job.received_by;

  const child = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await fn();
    if (!r.ok) setMsg(r.error ?? 'Could not save'); else { setMsg(''); reloadChildren(); }
  };

  const markCleaned = async () => {
    const r = await markIndoorCleaned(job.id, job.cleaning_wi || 'WI/SER/01', job.cleaning_wi_rev, uid);
    if (!r.ok) setMsg(r.error ?? 'Could not record the cleaning');
    else { setMsg(''); void patch(job.id, { status: 'Cleaned' }); }
  };
  const verify = async () => {
    const r = await verifyIndoorJob(job.id, uid);
    if (!r.ok) setMsg(r.error ?? 'Could not verify');
    else { setMsg(''); reload(); }
  };
  const mayVerifyNow = verifiable && !job.verified_at && mayVerify;
  // The report and its visit are written on the Report page itself while the
  // unit is not yet on a DC (the same gate the Upload button had).
  const reportEditable = mayWork && cleaned && !(job.dispatch_ref ?? '').trim();
  const dcName = dcStatus === 'Pending approval' ? 'DC pending approval' : 'DC / Dispatched';

  // ---- THE PAGER'S RIGHT-HAND SIDE: Next, else the page's action, else why.
  const nextSlot = (() => {
    if (view < LAST_PAGE && reach[view + 1]) {
      // The Repair page's form carries its own solid button; Next stays quiet there.
      return <button type="button" className={`btn ${view === 2 && reportEditable ? '' : 'btn-primary'}`} onClick={() => go(view + 1)}>
        Next · {INDOOR_STAGES[view + 1]} →</button>;
    }
    if (view === 1) {
      return mayWork
        ? <button type="button" className="btn btn-primary" onClick={() => void markCleaned()}>Mark cleaning done</button>
        : <span className="ind-pager-note">Repair opens once the unit is cleaned.</span>;
    }
    if (view === 2) return <span className="ind-pager-note">The DC opens once the service report is uploaded.</span>;
    if (view === LAST_PAGE) {
      if (onCreateDc && dcOpen) return <span className="ind-pager-note">The DC form is open on the right →</span>;
      if (onCreateDc) return <button type="button" className="btn btn-primary" onClick={onCreateDc}>Create Indoor DC</button>;
      if (mayVerifyNow) return <button type="button" className="btn btn-primary" onClick={() => void verify()}>Verify this register entry</button>;
    }
    return null;
  })();

  return (
    <div className="ind-form">
      {/* ---- THE STAGES, as the page navigator ---------------------------- */}
      <nav className="ind-stepper" aria-label="Stages">
        <ol>
          {INDOOR_STAGES.map((n, i) => {
            const tone = stage.done[i] ? 'is-done' : i === stage.current ? 'is-now' : 'is-future';
            return (
              <li key={n} className={`ind-step ${tone}${i === view ? ' is-view' : ''}`}>
                <button type="button" disabled={!reach[i]} aria-current={i === view ? 'step' : undefined}
                  onClick={() => go(i)} title={reach[i] ? `Open ${n}` : `${n} — not reached yet`}>
                  <span className="ind-dot" aria-hidden="true" />
                  <span className="ind-step-name">{n === 'DC' ? dcName : n}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <header className="ind-pagehead">
        <div>
          <div className="ind-eyebrow">Stage {view + 1} of {INDOOR_STAGES.length} · {PAGE_CLAUSE[view]}</div>
          <h3 className="ind-title">{PAGE_TITLE[view]}</h3>
        </div>
        <span className="ind-stage-now" title="Where the job is now">{stage.label}</span>
      </header>

      {msg ? <div className="ind-warn" role="status">{msg}</div> : null}

      {/* ================= 1. INTAKE (4.5.2) ================= */}
      {view === 0 ? (<>
        <Group title="Equipment">
          <div className="ind-grid">
            <Field label="Whose property is it?" tip="Customer property carries the duty of care of §7.5.10; a DEMO unit is the company's own stock.">
              <SelectPicker value={job.kind} options={[...INDOOR_KINDS]}
                onChange={(v) => set({ kind: v })} disabled={!mayWork} />
            </Field>
            <Field label="What is being done to it?" tip="A different question from whose property it is, and it stays a different field.">
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
            <Field label="Status (cover)" tip="Read from the machine in the Product Database when the product or serial changes. Not the workshop stage.">
              <SelectPicker value={job.cover} options={job.cover && !COVERS.includes(job.cover) ? [...COVERS, job.cover] : COVERS}
                onChange={(v) => set({ cover: v })} disabled={!mayWork} />
            </Field>
            <Field label="Identification tag (4.5.4)">
              <input defaultValue={job.tag_no} disabled={!mayWork} className="mono"
                onBlur={(e) => set({ tag_no: e.target.value })} />
            </Field>
          </div>
        </Group>

        <Group title="Customer & call">
          <div className="ind-grid">
            <Field label="Customer" tip="Left blank for a DEMO unit that has no customer.">
              <input defaultValue={job.party_name ?? ''} disabled={!mayWork}
                onBlur={(e) => set({ party_name: e.target.value })} />
            </Field>
            <Field label="Customer Place">
              <input key={`place-${job.customer_place}`} defaultValue={job.customer_place} disabled={!mayWork}
                onBlur={(e) => set({ customer_place: e.target.value })} />
            </Field>
            <Field label="Call (UCN)" tip="Optional — a DEMO unit has no call. Fills engineer, place and customer where blank.">
              <input defaultValue={job.ucn ?? ''} disabled={!mayWork} className="mono"
                onBlur={(e) => { if (e.target.value !== (job.ucn ?? '')) { set({ ucn: e.target.value }); void fromCall(e.target.value); } }} />
            </Field>
            <Field label="Engineer Name" tip="From the call’s allocated engineer when a UCN is given; “Indoor Service” for a DEMO unit.">
              <input key={`eng-${job.engineer_name}`} defaultValue={job.engineer_name} disabled={!mayWork}
                onBlur={(e) => set({ engineer_name: e.target.value })} />
            </Field>
            <Field label="Field Service Report No">
              <input defaultValue={job.field_report_no} disabled={!mayWork} className="mono"
                onBlur={(e) => set({ field_report_no: e.target.value })} />
            </Field>
            {(job.standard_complaint ?? '').trim()
              ? <Value label="Standard Complaint">{job.standard_complaint}</Value>
              : null}
          </div>
        </Group>

        <Group title="On arrival">
          <div className="ind-grid">
            <Field label="Problem Reported" wide>
              <textarea defaultValue={job.problem_reported} disabled={!mayWork} rows={2}
                onBlur={(e) => set({ problem_reported: e.target.value })} />
            </Field>
            <Field label="Condition on arrival" wide hint="The baseline any later damage claim is judged against.">
              <textarea defaultValue={job.condition_on_arrival} disabled={!mayWork} rows={2}
                onBlur={(e) => set({ condition_on_arrival: e.target.value })} />
            </Field>
          </div>
          <p className="ind-meta">Received by <b>{job.received_by_name || '—'}</b> · {formatDayTime(job.received_at)}</p>
        </Group>

        {SHOWS.accessories(a) ? (
          <Group title="Accessories received"
            aside={<span className="ind-meta">{job.accessories_outstanding} of {job.accessory_count} still to go back</span>}>
            <div className={`ind-rows${reported ? ' has-returned' : ''}`} role="table" aria-label="Accessories received">
              <div className="ind-rows-head" role="row">
                <span role="columnheader">Item</span><span role="columnheader">Qty</span>
                <span role="columnheader">Serial</span><span role="columnheader">Tag</span>
                {reported ? <span role="columnheader">Back</span> : null}<span />
              </div>
              {accessories.map((x) => (
                <div className="ind-rows-row" role="row" key={x.id}>
                  <input aria-label="Item" defaultValue={x.name} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { name: e.target.value }))} />
                  <input aria-label="Quantity" type="number" min={1} step="any" defaultValue={x.qty ?? 1} disabled={!mayWork}
                    onBlur={(e) => { const q = Number(e.target.value); if (q > 0 && q !== Number(x.qty)) void child(() => saveIndoorAccessory(x.id, { qty: q })); }} />
                  <input aria-label="Serial" defaultValue={x.serial} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { serial: e.target.value }))} />
                  <input aria-label="Tag" defaultValue={x.tag_no} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { tag_no: e.target.value }))} />
                  {reported ? <input type="checkbox" aria-label="Returned" checked={x.returned} disabled={!mayWork}
                    onChange={(e) => child(() => saveIndoorAccessory(x.id, { returned: e.target.checked }))} /> : null}
                  {mayWork ? <button type="button" className="ind-x" aria-label={`Remove ${x.name || 'item'}`} title="Remove"
                    onClick={() => child(() => deleteIndoorAccessory(x.id))}>×</button> : <span />}
                </div>
              ))}
              {accessories.length === 0 ? <div className="ind-rows-empty">Nothing listed.</div> : null}
            </div>
            {mayWork ? <button type="button" className="ind-add"
              onClick={() => child(() => addIndoorAccessory(job.id, { name: '', qty: 1 }))}>+ Add item</button> : null}
          </Group>
        ) : null}
      </>) : null}

      {/* ================= 2. CLEANING (4.5.3) ================= */}
      {view === 1 ? (
        <Group title="Work instruction">
          <div className="ind-grid">
            <Field label="Work instruction"><input defaultValue={job.cleaning_wi} disabled={!mayWork}
              onBlur={(e) => set({ cleaning_wi: e.target.value })} /></Field>
            <Field label="Revision" tip="Which revision it was cleaned against — the WI changes, the record should say which one applied.">
              <input defaultValue={job.cleaning_wi_rev} disabled={!mayWork}
                onBlur={(e) => set({ cleaning_wi_rev: e.target.value })} /></Field>
          </div>
          {job.cleaned_at
            ? <p className="ind-meta">Cleaned by <b>{job.cleaned_by_name || '—'}</b> · {formatDayTime(job.cleaned_at)}</p>
            : <p className="ind-meta">Not yet cleaned.</p>}
          {SHOWS.salvage(a) ? (
            <label className="ind-check">
              <input type="checkbox" checked={job.decontaminated} disabled={!mayWork}
                onChange={(e) => set({ decontaminated: e.target.checked })} />
              <span>Decontaminated — <b>required before any part is harvested</b>.</span>
            </label>
          ) : null}
        </Group>
      ) : null}

      {/* ================= 3. REPAIR (4.5.6) ================= */}
      {view === 2 ? (<>
        {reported || (job.ucn ?? '').trim() ? (
          <p className="ind-meta ind-reportstate">
            {reported
              ? <>Report <b className="mono">{job.indoor_report_no}</b> uploaded{job.report_uploaded_at ? <> by <b>{job.report_uploaded_by_name || '—'}</b> · {formatDayTime(job.report_uploaded_at)}</> : null}. </>
              : null}
            {(job.ucn ?? '').trim()
              ? job.visit_filed_at
                ? <>Visit <b className="mono">{job.visit_uid}</b> filed against {job.ucn} · {formatDayTime(job.visit_filed_at)}.</>
                : job.visit_draft
                  ? <>Visit against <b>{job.ucn}</b> drafted{job.visit_date ? <> (visit date {formatDay(job.visit_date)})</> : null} — filed when the Indoor DC is approved.</>
                  : <>The visit against <b>{job.ucn}</b> is not drafted yet.</>
              : null}
          </p>
        ) : null}

        {/* THE SERVICE REPORT IS THE REPAIR (the user, 2026-10-03): the report
            number, the file and the visit's work details -- complaint
            observation, job done, consumption -- inline, asked once. */}
        <section className="ind-group">
          <div className="ind-group-head">
            <h4 className="ind-eyebrow">{(job.ucn ?? '').trim() ? 'Service report & visit details' : 'Service report'}</h4>
            {(job.ucn ?? '').trim() && mayWork ? (
              <div className="ind-group-aside">
                {/* RAISING it is the Spare Request register's own right, which
                    the database asks on submit. The call's status is not changed. */}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void requestSpare()}
                  title="The Spare Request form, with this call filled in and you as the requester (it needs the Spare Request right). The call’s status is not changed.">
                  Request spare</button>
              </div>
            ) : null}
          </div>
          {reportEditable ? (
            <IndoorReportForm job={job} patch={patch} onDone={onReportSaved} />
          ) : (
            <div className="ind-grid">
              <Value label="Indoor Service Report No">
                {reported ? <span className="mono">{job.indoor_report_no || '—'}</span> : <span className="ind-muted">Not uploaded yet</span>}
              </Value>
              <Value label="File">
                {reported
                  ? <a href={job.report_file_url} target="_blank" rel="noopener noreferrer">{job.report_file_name || 'open'} ↗</a>
                  : <span className="ind-muted">—</span>}
              </Value>
              {(job.findings ?? '').trim() ? <Value label="Complaint observation" wide>{job.findings}</Value> : null}
              {(job.work_done ?? '').trim() ? <Value label="Job done" wide>{job.work_done}</Value> : null}
            </div>
          )}
        </section>

        {/* What the visit does not carry and the job still records. */}
        <Group title="Workshop record">
          <div className="ind-grid">
            <Field label="Status" tip="A unit goes on an Indoor DC once it is Ready.">
              {/* DISPATCHED AND CLOSED ARE THE DISPATCH RIGHT'S (finding 59, 0297). */}
              <SelectPicker value={job.status}
                options={INDOOR_STATUSES.filter((st) => mayDispatch || !['Dispatched', 'Closed'].includes(st) || st === job.status)}
                onChange={(v) => set({ status: v })} disabled={!mayWork} />
            </Field>
            <span />
            <Field label="Damage to the customer's property" wide
              tip="§7.5.10 — damage to somebody's machine is theirs to be told about, and this is where that is recorded.">
              <textarea defaultValue={job.damage_note} disabled={!mayWork} rows={2}
                onBlur={(e) => set({ damage_note: e.target.value })} /></Field>
          </div>
        </Group>

        {SHOWS.rework(a) ? (
          <Group title="Rework · §8.3.4">
            <div className="ind-grid">
              <Field label="Nonconformity reference"><input defaultValue={job.nc_reference} disabled={!mayWork}
                onBlur={(e) => set({ nc_reference: e.target.value })} /></Field>
              <Field label="Rework instruction" tip="Rework runs to a DOCUMENTED instruction, not from memory.">
                <input defaultValue={job.rework_instruction} disabled={!mayWork}
                  onBlur={(e) => set({ rework_instruction: e.target.value })} /></Field>
              <Field label="Instruction revision"><input defaultValue={job.rework_instruction_rev} disabled={!mayWork}
                onBlur={(e) => set({ rework_instruction_rev: e.target.value })} /></Field>
              <Field label="Authorised by" tip="The same authority that approved the original process.">
                <input defaultValue={job.rework_authorised_by} disabled={!mayWork}
                  onBlur={(e) => set({ rework_authorised_by: e.target.value })} /></Field>
              <Field label="Re-verified by"><input defaultValue={job.reverified_by} disabled={!mayWork}
                onBlur={(e) => set({ reverified_by: e.target.value })} /></Field>
              <Field label="Re-verification result" tip="Rework without re-verification proves nothing.">
                <SelectPicker value={job.reverification_result ?? ''} options={['Pass', 'Fail']}
                  onChange={(v) => set({ reverification_result: v })} disabled={!mayWork} /></Field>
              <Field label="Disposition" tip="A failed rework has to end somewhere.">
                <SelectPicker value={job.disposition ?? ''} options={['Released', 'Scrapped']}
                  onChange={(v) => set({ disposition: v })} disabled={!mayWork} /></Field>
            </div>
            <label className="ind-check">
              <input type="checkbox" checked={job.adverse_effect_assessed === true} disabled={!mayWork}
                onChange={(e) => set({ adverse_effect_assessed: e.target.checked })} />
              <span>Adverse effect of the rework assessed — <b>§8.3.4 asks for this explicitly</b>.</span>
            </label>
            <Field label="What the assessment found">
              <textarea defaultValue={job.adverse_effect_note} disabled={!mayWork} rows={2}
                onBlur={(e) => set({ adverse_effect_note: e.target.value })} /></Field>
          </Group>
        ) : null}

        {SHOWS.salvage(a) ? (
          <Group title="Salvage · condemn the unit, keep the parts">
            <div className="ind-grid">
              <Field label="Why it is being condemned" hint={!mayCondemn ? 'Needs the Condemn right, granted separately.' : undefined}>
                <input defaultValue={job.condemned_reason} disabled={!mayCondemn}
                  onBlur={(e) => set({ condemned_reason: e.target.value })} /></Field>
              <Field label="Disposal method" tip="What was NOT harvested still has to go somewhere — e-waste, and biohazard where the unit was in patient contact.">
                <input defaultValue={job.disposal_method} disabled={!mayWork}
                  onBlur={(e) => set({ disposal_method: e.target.value })} /></Field>
              <Field label="Disposal reference"><input defaultValue={job.disposal_ref} disabled={!mayWork}
                onBlur={(e) => set({ disposal_ref: e.target.value })} /></Field>
            </div>
            {job.kind === 'Customer property' ? (
              <label className="ind-check">
                <input type="checkbox" checked={job.customer_informed} disabled={!mayWork}
                  onChange={(e) => set({ customer_informed: e.target.checked })} />
                <span>The customer has been told.</span>
              </label>
            ) : null}
            {job.condemned_at ? (
              <p className="ind-meta">Condemned by <b>{job.condemned_by_name || '—'}</b> · {formatDayTime(job.condemned_at)}</p>
            ) : null}

            <h5 className="ind-subhead">Parts harvested</h5>
            <p className="ind-hint" title="A harvested part entering stock under its normal code is indistinguishable from a new one, and the condition grade would be decoration.">
              Recorded here and <b>not credited to hand stock</b>.</p>
            <div className="ind-lines-wrap">
              <table className="ind-lines">
                <thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Grade</th><th>Destination</th><th /></tr></thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.part_code}</td><td>{p.description}</td>
                      <td>{p.qty}</td><td>{p.condition_grade}</td><td>{p.destination}</td>
                      <td>{mayWork ? <button type="button" className="ind-x" aria-label="Remove part" title="Remove"
                        onClick={() => child(() => deleteIndoorPart(p.id))}>×</button> : null}</td>
                    </tr>
                  ))}
                  {parts.length === 0 ? <tr><td colSpan={6} className="ind-rows-empty">Nothing harvested yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {mayWork ? (
              <button type="button" className="ind-add" disabled={!job.decontaminated}
                title={job.decontaminated ? '' : 'The unit has to be decontaminated first (4.5.3)'}
                onClick={() => child(() => addIndoorPart(job.id, { part_code: '', qty: 1, condition_grade: 'Serviceable' }))}>
                + Add a harvested part
              </button>
            ) : null}
          </Group>
        ) : null}

        {SHOWS.pdi(a) ? (
          <Group title="Pre-delivery inspection">
            <div className="ind-grid">
              <Field label="Arrived on" tip="The SA number, PO or stock receipt it came in against.">
                <input defaultValue={job.source_ref} disabled={!mayWork}
                  onBlur={(e) => set({ source_ref: e.target.value })} /></Field>
              <Field label="Checklist"><input defaultValue={job.checklist_ref} disabled={!mayWork}
                onBlur={(e) => set({ checklist_ref: e.target.value })} /></Field>
              <Field label="Checklist revision"><input defaultValue={job.checklist_rev} disabled={!mayWork}
                onBlur={(e) => set({ checklist_rev: e.target.value })} /></Field>
              <Field label="Firmware version"><input defaultValue={job.firmware_version} disabled={!mayWork}
                onBlur={(e) => set({ firmware_version: e.target.value })} /></Field>
              <Field label="Result" tip="“Pass with observation” is what stops a real finding being rounded up to Pass. A Fail does not leave the workshop.">
                <SelectPicker value={job.pdi_result ?? ''} options={['Pass', 'Pass with observation', 'Fail']}
                  onChange={(v) => set({ pdi_result: v })} disabled={!mayWork} /></Field>
              <Field label="Why it is being held"><input defaultValue={job.held_reason} disabled={!mayWork}
                onBlur={(e) => set({ held_reason: e.target.value })} /></Field>
            </div>
            <label className="ind-check">
              <input type="checkbox" checked={job.accessories_per_packing_list === true} disabled={!mayWork}
                onChange={(e) => set({ accessories_per_packing_list: e.target.checked })} />
              <span>Accessories match the packing list.</span>
            </label>
          </Group>
        ) : null}

        {SHOWS.demo(a) ? (
          <Group title="Demo · a company asset on loan">
            <div className="ind-grid">
              <Field label="Going to"><input defaultValue={job.demo_for_party} disabled={!mayWork}
                onBlur={(e) => set({ demo_for_party: e.target.value })} /></Field>
              <Field label="Requested by"><input defaultValue={job.requested_by} disabled={!mayWork}
                onBlur={(e) => set({ requested_by: e.target.value })} /></Field>
              <Field label="Expected out"><input type="date" defaultValue={job.expected_out ?? ''} disabled={!mayWork}
                onBlur={(e) => set({ expected_out: e.target.value })} /></Field>
              <Field label="Expected back" tip="A demo unit is an asset on loan and it needs a due date — this is what makes the overdue count possible.">
                <input type="date" defaultValue={job.expected_return ?? ''} disabled={!mayWork}
                  onBlur={(e) => set({ expected_return: e.target.value })} /></Field>
              <Field label="Actually out"><input type="date" defaultValue={job.actual_out ?? ''} disabled={!mayWork}
                onBlur={(e) => set({ actual_out: e.target.value })} /></Field>
              <Field label="Actually back"><input type="date" defaultValue={job.actual_return ?? ''} disabled={!mayWork}
                onBlur={(e) => set({ actual_return: e.target.value })} /></Field>
              <Field label="Who has it now"><input defaultValue={job.custody_holder} disabled={!mayWork}
                onBlur={(e) => set({ custody_holder: e.target.value })} /></Field>
              <Field label="Outcome" tip="What the demo was FOR.">
                <SelectPicker value={job.demo_outcome ?? ''} options={['Converted', 'Returned', 'Damaged', 'Lost']}
                  onChange={(v) => set({ demo_outcome: v })} disabled={!mayWork} /></Field>
              <Field label="Sale reference"><input defaultValue={job.sale_ref} disabled={!mayWork}
                onBlur={(e) => set({ sale_ref: e.target.value })} /></Field>
              <Field label="Consumables used" tip="A demo burns stock, and that stock is real.">
                <input defaultValue={job.consumables_used} disabled={!mayWork}
                  onBlur={(e) => set({ consumables_used: e.target.value })} /></Field>
              <Field label="Condition going out"><textarea defaultValue={job.condition_out} rows={2} disabled={!mayWork}
                onBlur={(e) => set({ condition_out: e.target.value })} /></Field>
              <Field label="Condition coming back"><textarea defaultValue={job.condition_back} rows={2} disabled={!mayWork}
                onBlur={(e) => set({ condition_back: e.target.value })} /></Field>
            </div>
          </Group>
        ) : null}

        {SHOWS.other(a) ? (
          <Group title="Other · what this job actually is">
            <Field label="Description (required)"
              hint="“Other” with no description is refused."
              tip="If Other passes about one job in ten, the list is missing an activity — the fix is a new type, not a bigger box.">
              <textarea defaultValue={job.activity_note} rows={2} disabled={!mayWork}
                onBlur={(e) => set({ activity_note: e.target.value })} /></Field>
          </Group>
        ) : null}

        {/* ---- the checks (SR-003 / SR-006 / SR-020) ---------------------- */}
        {SHOWS.checks(a) ? (
          <Group title="Checks · expected against measured">
            <p className="ind-hint" title="SR-006 asks for the expected value beside each reading, and SR-020 for the instrument that took it, with its calibration date. Phase 3 fills the expected column from per-product reference values.">
              Each reading beside its expected value and the instrument that took it.</p>
            <div className="ind-lines-wrap">
              <table className="ind-lines is-edit">
                <thead><tr><th>Parameter</th><th>Expected</th><th>Measured</th><th>Verdict</th>
                  <th>Instrument</th><th>Cal. due</th><th /></tr></thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.id}>
                      <td><input aria-label="Parameter" defaultValue={c.parameter} disabled={!mayWork}
                        onBlur={(e) => child(() => saveIndoorCheck(c.id, { parameter: e.target.value }))} /></td>
                      <td><input aria-label="Expected" defaultValue={c.expected} disabled={!mayWork}
                        onBlur={(e) => child(() => saveIndoorCheck(c.id, { expected: e.target.value }))} /></td>
                      <td><input aria-label="Measured" defaultValue={c.measured} disabled={!mayWork}
                        onBlur={(e) => child(() => saveIndoorCheck(c.id, { measured: e.target.value }))} /></td>
                      <td><SelectPicker value={c.verdict} options={['Pass', 'Fail', 'N/A']} disabled={!mayWork}
                        onChange={(v) => child(() => saveIndoorCheck(c.id, { verdict: v }))} /></td>
                      <td><input aria-label="Instrument" defaultValue={c.instrument} disabled={!mayWork}
                        onBlur={(e) => child(() => saveIndoorCheck(c.id, { instrument: e.target.value }))} /></td>
                      <td><input aria-label="Calibration due" type="date" defaultValue={c.calibration_due ?? ''} disabled={!mayWork}
                        onBlur={(e) => child(() => saveIndoorCheck(c.id, { calibration_due: e.target.value }))} /></td>
                      <td>{mayWork ? <button type="button" className="ind-x" aria-label="Remove check" title="Remove"
                        onClick={() => child(() => deleteIndoorCheck(c.id))}>×</button> : null}</td>
                    </tr>
                  ))}
                  {checks.length === 0 ? <tr><td colSpan={7} className="ind-rows-empty">No checks recorded.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {mayWork ? <button type="button" className="ind-add"
              onClick={() => child(() => addIndoorCheck(job.id, { seq: checks.length + 1 }))}>+ Add a check</button> : null}
          </Group>
        ) : null}

        {/* ---- R/SER/QC/007 (0320): owed by a DEMO unit of an IMPORTED
            product, and only by one. Unknown is said out loud. */}
        {job.kind === 'DEMO unit' && owed !== true ? (
          <Group title="Pre-Delivery Testing · R/SER/QC/007">
            {owed === null ? (
              <p className="ind-warn"
                title="Pre-Delivery Testing is required for a DEMO unit of an imported product only, so it is not required to dispatch this unit until somebody sets Imported on the Product Master.">
                Whether <b>{job.product_name || 'this product'}</b> is imported is <b>not known</b> (Product Master: Imported blank) — the test is not required until it is set.
              </p>
            ) : (
              <p className="ind-hint">{job.product_name || 'This product'} is made in-house — Pre-Delivery Testing is for imported products only.</p>
            )}
          </Group>
        ) : null}
        {owed === true ? (
          <Group title="Pre-Delivery Testing · R/SER/QC/007"
            aside={<button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/indoor-pdt/${job.id}`)}>
              🖨 Print{gaps.blank.length || gaps.notOk.length ? ' (not complete)' : ''}</button>}>
            <p className="ind-hint">Not dispatched until every field is filled, the inspector has signed and checks 1–5 read <b>OK</b>.</p>
            <div className="ind-grid">
              <Value label="Product Name">{job.product_name || '—'}</Value>
              <Value label="SL. No"><span className="mono">{job.serial || '—'}</span></Value>
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
            <div className="ind-lines-wrap">
              <table className="ind-lines">
                <thead><tr><th>S.No</th><th>Description</th><th>OK / NOT OK</th></tr></thead>
                <tbody>
                  {PDT_CHECKS.map((c) => (
                    <tr key={c.no}>
                      <td>{c.no}.</td>
                      <td>{c.text}</td>
                      <td className="ind-lines-pick">{c.key
                        ? <SelectPicker value={pdt?.[c.key] ?? ''} options={['OK', 'NOT OK']} disabled={!mayWork}
                            onChange={(v) => void pdtSet({ [c.key!]: v || null } as Partial<IndoorPdt>)} />
                        : <span className="ind-hint">instruction — not judged</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {PDT_MODES.map((m) => (
              <div className="ind-lines-wrap" key={m.no}>
                <table className="ind-lines is-edit">
                  <thead>
                    <tr><th colSpan={4} className="ind-lines-cap">{m.no}. {m.settings}</th></tr>
                    <tr><th />{PDT_FIO2.map((f) => <th key={f}>At FiO2 {f}%</th>)}</tr>
                  </thead>
                  <tbody>
                    {m.rows.map((r) => (
                      <tr key={r.label}>
                        <td><b>{r.label}</b></td>
                        {r.keys.map((k) => (
                          <td key={k}><input aria-label={`${r.label} ${k}`} type="number" step="any" key={`${k}-${pdt?.[k]}`} defaultValue={pdt?.[k] ?? ''} disabled={!mayWork}
                            onBlur={(e) => void pdtSet({ [k]: numOrNull(e.target.value) } as Partial<IndoorPdt>)} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="ind-signrow">
              <span className="ind-meta"><b>Inspected by</b>{' '}
                {pdt?.inspected_by
                  ? <>{pdt.inspector_name || '—'}{pdt.inspector_designation ? `, ${pdt.inspector_designation}` : ''} · {formatDayTime(pdt.inspected_at)}</>
                  : 'not signed yet'}</span>
              {mayWork ? (
                <button type="button" className="btn btn-sm" onClick={async () => {
                  const r = await signIndoorPdt(job.id, uid, !pdt?.inspected_by);
                  if (!r.ok) setMsg(r.error ?? 'Could not sign'); else { setMsg(''); reloadChildren(); }
                }}>{pdt?.inspected_by ? 'Withdraw the signature' : 'Sign as the inspector'}</button>
              ) : null}
            </div>
            {gaps.notOk.length ? (
              <p className="ind-warn">Check {gaps.notOk.join(', ')} reads NOT OK — the unit cannot be dispatched.</p>
            ) : null}
            {gaps.blank.length ? (
              <p className="ind-warn">Still blank: {gaps.blank.join(', ')}. Not dispatched until the test is complete.</p>
            ) : null}
          </Group>
        ) : null}

        {/* ---- QC (4.5.6) — the last step of the repair ------------------- */}
        <Group title="Quality check · 4.5.6">
          <div className="ind-grid">
            <Field label="Result" tip="A Fail sends it back to Under repair. A machine does not leave with a failed check."
              hint={!mayQc ? 'Signing needs the quality check right.' : undefined}>
              <SelectPicker value={job.qc_result ?? ''} options={['Pass', 'Fail']} disabled={!mayQc}
                onChange={(v) => set(v === 'Fail'
                  ? { qc_result: v, status: 'Under repair' }
                  : { qc_result: v })} /></Field>
            <Field label="Notes"><input defaultValue={job.qc_notes} disabled={!mayQc}
              onBlur={(e) => set({ qc_notes: e.target.value })} /></Field>
          </div>
          {job.qc_at ? (
            <p className="ind-meta">Checked by <b>{job.qc_by_name || '—'}</b> · {formatDayTime(job.qc_at)}</p>
          ) : null}
          {selfChecked ? (
            <p className="ind-warn" title="The procedure does not forbid it, and this is recorded rather than blocked — but where a second pair of hands is available, the check is worth more from them.">
              Checked by the same person who received the unit — recorded, not blocked.
            </p>
          ) : null}
        </Group>
      </>) : null}

      {/* ================= 4. DC & DISPATCH (4.5.7) ================= */}
      {view === LAST_PAGE ? (<>
        {reported ? (
          <Group title="Indoor DC">
            {onCreateDc ? (
              <p className="ind-hint">Or tick it with others going to the same place in the Workshop view.</p>
            ) : !(job.dispatch_ref ?? '').trim() && job.status !== 'Ready' ? (
              <p className="ind-hint">A unit goes on an Indoor DC once it is <b>Ready</b>.</p>
            ) : null}
            {dcStatus === 'Pending approval' ? (
              <p className="ind-warn">Indoor DC <b>{job.dispatch_ref}</b> is <b>pending approval</b> — the unit is dispatched once it is approved.</p>
            ) : dcStatus === 'Approved' ? (
              <p className="ind-meta">Indoor DC <b>{job.dispatch_ref}</b> is approved.</p>
            ) : null}
            <div className="ind-grid">
              <Field label="Dispatch reference (DC number)" hint={!mayDispatch ? 'Dispatching needs the dispatch right.' : undefined}>
                <input defaultValue={job.dispatch_ref} disabled={!mayDispatch}
                  onBlur={(e) => set({ dispatch_ref: e.target.value })} /></Field>
              <Value label="DC Date">{job.dc_date ? formatDay(job.dc_date) : <span className="ind-muted">Set by the Indoor DC</span>}</Value>
            </div>
            {job.accessories_outstanding > 0 ? (
              <p className="ind-warn">
                {job.accessories_outstanding} accessor{job.accessories_outstanding === 1 ? 'y is' : 'ies are'} not
                marked returned yet (Intake page).
              </p>
            ) : null}
            {job.dispatched_at ? (
              <p className="ind-meta">Dispatched by <b>{job.dispatched_by_name || '—'}</b> · {formatDayTime(job.dispatched_at)}</p>
            ) : null}
            {/^IDC-/.test(job.dispatch_ref ?? '') ? (
              // INDOOR_DC (0321): a reference the database issued, so its challan exists.
              <div className="ind-signrow">
                <span className="ind-meta">On Indoor DC <b>{job.dispatch_ref}</b></span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/indoor-dc/${encodeURIComponent(job.dispatch_ref)}`)}>🖨 Print the DC</button>
              </div>
            ) : null}
            <Field label="Remarks">
              <textarea defaultValue={job.remarks} disabled={!mayWork} rows={2}
                onBlur={(e) => set({ remarks: e.target.value })} /></Field>
          </Group>
        ) : null}

        <Group title="Verified by · R/SER/07">
          {job.verified_at ? (
            <p className="ind-meta">Verified by <b>{job.verified_by_name || '—'}</b> · {formatDayTime(job.verified_at)}</p>
          ) : verifiable ? (
            mayVerify
              ? (onCreateDc
                  ? <button type="button" className="btn" onClick={() => void verify()}>Verify this register entry</button>
                  : <p className="ind-meta">Not verified yet.</p>)
              : <p className="ind-meta">Not verified yet — needs the <b>Verify an Indoor Service register entry</b> right.</p>
          ) : (
            <p className="ind-meta">Verified once the unit is Dispatched, Closed or Condemned.</p>
          )}
        </Group>
      </>) : null}

      {/* ---- Back / Next ---------------------------------------------------- */}
      <nav className="ind-pager" aria-label="Pages">
        {view > 0
          ? <button type="button" className="btn btn-ghost" onClick={() => go(view - 1)}>← Back</button>
          : <span />}
        <div className="ind-pager-end">{nextSlot}</div>
      </nav>

      {spareCall ? (
        <SpareRequestDrawer call={spareCall} open={!!spareCall} onClose={() => setSpareCall(null)}
          onSaved={(u) => { setSpareCall(null); setMsg(`Spare request raised for ${u} — track it under Spares → Spare Requests.`); }} />
      ) : null}

      <p className="ind-foot">Last changed by {job.updated_by_name || '—'}.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STAGE 3 -- THE INDOOR SERVICE REPORT, ON THE REPAIR PAGE (0323).
//
// THE FILE goes to Drive through the bridge every other upload in this app
// uses (uploadToDrive, apps-script/CallReg.gs), NAMED "<Indoor Service Report
// No>_<original file name>" (indoorReportFileName) so it traces back to the
// register. No Drive folder is named: the bridge has none for Indoor Service
// yet, so it lands in the drive root, as the Document Library's do.
//
// A JOB WITH A UCN gets the Visit Entry form itself (CallReportDrawer in its
// INLINE Indoor mode, rendered on the page): every field the visit asks, by
// the visit form's own rules, with Call Status / Pending Reason / Update Visit
// Work Details? fixed -- saved as a DRAFT on the job and filed when the Indoor
// DC is approved. A DEMO / new device (no UCN) gets the report number and the
// file only.
// ---------------------------------------------------------------------------
async function uploadIndoorReportFile(file: File, reportNo: string): Promise<{ ok: boolean; url?: string; name?: string; error?: string }> {
  if (!reportNo.trim()) return { ok: false, error: 'Enter the Indoor Service Report No. first — the file is named after it.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  const named = new File([file], indoorReportFileName(reportNo, file.name), { type: file.type || 'application/octet-stream' });
  const r = await uploadToDrive(named);
  return r.ok && r.url ? { ok: true, url: r.url, name: named.name } : { ok: false, error: r.error ?? 'Upload failed.' };
}

/** The Service Report fields the Indoor job already holds, so the visit never
 *  asks them a second time (the user, 2026-10-03: "ask each thing once"). The
 *  job's value is the visit's value; the Report page shows it read-only with a
 *  link back to the page where it is entered. */
function linkedVisitFields(job: IndoorJob): IndoorDraftMode['linked'] {
  const l: NonNullable<IndoorDraftMode['linked']> = {};
  // The job's Standard Complaint is the call's, read-only on the job too; a job
  // whose call carries none still has it asked on the visit.
  if ((job.standard_complaint ?? '').trim()) l['Standard Complaint'] = { value: job.standard_complaint, from: 'Intake' };
  return l;
}

/** The visit draft to open the form on: the saved draft, with the job's own
 *  Findings / Work done (entered before the report carried them) seeding the
 *  Complaint Observation / Job Done it does not have yet -- nothing typed is lost. */
function seededDraft(job: IndoorJob): VisitDraft | null {
  const d = (job.visit_draft as unknown as VisitDraft | null) ?? null;
  const seed: Record<string, string> = {};
  if ((job.findings ?? '').trim()) seed['Complaint Observation'] = job.findings;
  if ((job.work_done ?? '').trim()) seed['Job Done'] = job.work_done;
  if (d) return { ...d, work: { ...seed, ...(d.work ?? {}) } };
  if (!Object.keys(seed).length) return null;
  return { visitDate: '', engineer: '', engineerEmail: '', status: '', pendingReason: '', updateWork: '',
           work: seed, signoff: {}, spares: [], feedback: {}, manualLink: '' };
}

/** THE REPAIR PAGE'S FORM — the service report inline, no second drawer. */
function IndoorReportForm({ job, patch, onDone }: {
  job: IndoorJob; patch: (id: number, p: Partial<IndoorJob>) => Promise<void>; onDone: () => void;
}) {
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
    return <p className="ind-warn">The report is uploaded after the unit is cleaned (WI/SER/01). Mark cleaning done first.</p>;
  }

  if (ucn) {
    if (call === undefined) return <p className="ind-meta">Reading call {ucn}…</p>;
    if (call === null) {
      return (
        <p className="ind-warn">Call {ucn} was not found, or you cannot view it — the visit details cannot be drafted without the call.
          Ask an administrator for sight of the call (the Field / Installation / PM register’s view right).</p>
      );
    }
    return (
      <CallReportDrawer call={call} open onClose={() => { /* inline: stays on the page */ }}
        indoor={{
          inline: true,
          linked: linkedVisitFields(job),
          initial: seededDraft(job),
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
            if (r.ok) {
              logAudit({ action: 'indoor.report_upload', target: job.job_no, status: 'ok', meta: { ucn, report_no: no } });
              // The job's own Findings / Work done are the visit's answers now
              // (asked once, on the report); kept in step on the job record.
              const obs = String(d.work['Complaint Observation'] ?? '');
              const done = String(d.work['Job Done'] ?? '');
              if (obs !== (job.findings ?? '') || done !== (job.work_done ?? '')) await patch(job.id, { findings: obs, work_done: done });
              onDone();
            }
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
    <>
      {err ? <div className="ind-warn">{err}</div> : null}
      <p className="ind-hint">No call — a DEMO / new device files no visit. The report number and the file are all this stage asks.</p>
      <div className="ind-grid">
        <Field label="Indoor Service Report No *">
          <input className="mono" value={reportNo} onChange={(e) => setReportNo(e.target.value)} /></Field>
        <div className="ind-field">
          <span className="ind-label">The report *</span>
          <span className="ind-filepick">
            {link ? <a href={link} target="_blank" rel="noopener noreferrer">{name || 'uploaded'} ↗</a> : null}
            <label className={`btn btn-sm${busy || !reportNo.trim() ? ' is-off' : ''}`}>
              {busy ? 'Uploading…' : link ? 'Replace' : '⭱ Choose the file'}
              <input type="file" hidden accept=".pdf,image/*" disabled={busy || !reportNo.trim()}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
            </label>
          </span>
          <span className="ind-hint">Saved in Drive as “{reportNo.trim() || '<report no>'}_&lt;file name&gt;”. PDF or photo, up to 10 MB.</span>
        </div>
      </div>
      <div className="ind-formactions">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !link}>{busy ? 'Saving…' : 'Upload service report'}</button>
      </div>
    </>
  );
}
