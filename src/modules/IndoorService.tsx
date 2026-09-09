import { useCallback, useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { Drawer, FacetChips, PageHeader, SectionCard } from '../components/ui/ui';
import {
  supabaseConfigured, listIndoorJobs, addIndoorJob, saveIndoorJob, markIndoorCleaned,
  listIndoorAccessories, addIndoorAccessory, saveIndoorAccessory, deleteIndoorAccessory,
  listIndoorParts, addIndoorPart, deleteIndoorPart,
  listIndoorChecks, addIndoorCheck, saveIndoorCheck, deleteIndoorCheck,
  INDOOR_KINDS, INDOOR_ACTIVITIES, INDOOR_STATUSES,
  type IndoorJob, type IndoorAccessory, type IndoorPart, type IndoorCheck,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import './indoor.css';

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

  const load = useCallback(() => {
    if (!live) return;
    setBusy(true);
    listIndoorJobs()
      .then(setJobs)
      .catch((e) => setMsg(`Could not load the register: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  }, [live]);
  useEffect(load, [load]);

  const job = jobs.find((j) => j.id === openId) ?? null;

  const loadChildren = useCallback((id: number) => {
    listIndoorAccessories(id).then(setAccessories).catch(() => setAccessories([]));
    listIndoorParts(id).then(setParts).catch(() => setParts([]));
    listIndoorChecks(id).then(setChecks).catch(() => setChecks([]));
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
  };

  const receive = async () => {
    const r = await addIndoorJob({ kind: 'Customer property', activity: 'Repair', status: 'Received' });
    if (!r.ok) { setMsg(r.error ?? 'Could not file the intake'); return; }
    logAudit({ action: 'indoor.receive', target: r.job_no ?? '' });
    setMsg(`Filed as ${r.job_no}`);
    load();
    if (r.id) setOpenId(r.id);
  };

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
        // EXACT, and so it takes no "+": every row is on screen. listIndoorJobs
        // caps at 500 and the register is nowhere near that; when it is, this
        // becomes a lower bound and the flag has to change with it.
        countMore={false}
        onRefresh={load}
        refreshing={busy}
        actions={mayReceive
          ? <button className="btn btn-primary" onClick={receive}>Receive equipment</button>
          : null}
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
        <FacetChips options={facet((j) => j.status)} value={status} onChange={setStatus}
          allLabel="Every status" more={false} />
        <FacetChips options={facet((j) => j.activity)} value={activity} onChange={setActivity}
          allLabel="Every activity" more={false} />
        <FacetChips options={facet((j) => j.kind)} value={kind} onChange={setKind}
          allLabel="Both kinds" more={false} />
        <label className="ind-toggle">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show dispatched, closed and condemned
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job</th><th>Kind</th><th>Activity</th><th>Product</th>
              <th>Serial</th><th>Customer</th><th>Status</th><th>Tag</th><th>Received</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((j) => (
              <tr key={j.id} className="row-click" onClick={() => setOpenId(j.id)}>
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
                <td><span className={`ind-chip ${STATUS_TONE[j.status] ?? ''}`}>{j.status}</span>
                  {j.demo_overdue === true ? <span className="ind-late">overdue</span> : null}</td>
                <td className="mono">{j.tag_no}</td>
                <td>{(j.received_at ?? '').slice(0, 10)}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr><td colSpan={9} className="ind-empty">
                Nothing in the workshop matching this filter.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Drawer open={!!job} onClose={() => setOpenId(null)} storeKey="indoor-job"
        title={job ? `${job.job_no} — ${job.product_name || 'equipment'}` : ''}>
        {job ? (
          <IndoorJobDrawer
            job={job}
            accessories={accessories} parts={parts} checks={checks}
            reloadChildren={() => loadChildren(job.id)}
            patch={patch}
            uid={user?.id ?? ''}
            rights={{ mayReceive, mayWork, mayQc, mayDispatch, mayCondemn }}
            setMsg={setMsg}
          />
        ) : null}
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// THE JOB DRAWER — the seven steps of §4.5 as a sequence you move through, each
// one stamping who and when.
//
// The steps are always all visible rather than revealed one at a time: a
// workshop does not always work in order (a unit arrives already cleaned; a
// dispatch is arranged before QC is signed), and a form that hides step 4 until
// step 3 is ticked teaches people to tick step 3.
// ---------------------------------------------------------------------------
function IndoorJobDrawer({
  job, accessories, parts, checks, reloadChildren, patch, uid, rights, setMsg,
}: {
  job: IndoorJob;
  accessories: IndoorAccessory[];
  parts: IndoorPart[];
  checks: IndoorCheck[];
  reloadChildren: () => void;
  patch: (id: number, p: Partial<IndoorJob>) => Promise<void>;
  uid: string;
  rights: { mayReceive: boolean; mayWork: boolean; mayQc: boolean;
            mayDispatch: boolean; mayCondemn: boolean };
  setMsg: (s: string) => void;
}) {
  const { mayWork, mayQc, mayDispatch, mayCondemn } = rights;
  const a = job.activity;
  const set = (p: Partial<IndoorJob>) => void patch(job.id, p);

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
      {/* ---- 1. RECEIVE (4.5.2) ------------------------------------------ */}
      <SectionCard title="1 · Received">
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
              onBlur={(e) => set({ product_name: e.target.value })} />
          </Field>
          <Field label="Serial number">
            <input defaultValue={job.serial} disabled={!mayWork} className="mono"
              onBlur={(e) => set({ serial: e.target.value })} />
          </Field>
          <Field label="Customer" hint="Left blank for a DEMO unit that has no customer.">
            <input defaultValue={job.party_name ?? ''} disabled={!mayWork}
              onBlur={(e) => set({ party_name: e.target.value })} />
          </Field>
          <Field label="Call (UCN)" hint="Optional — a DEMO unit has no call. Phase 2 links it both ways.">
            <input defaultValue={job.ucn ?? ''} disabled={!mayWork} className="mono"
              onBlur={(e) => set({ ucn: e.target.value })} />
          </Field>
          <Field label="Identification tag (4.5.4)">
            <input defaultValue={job.tag_no} disabled={!mayWork} className="mono"
              onBlur={(e) => set({ tag_no: e.target.value })} />
          </Field>
          <Field label="Status">
            <SelectPicker value={job.status} options={[...INDOOR_STATUSES]}
              onChange={(v) => set({ status: v })} disabled={!mayWork} />
          </Field>
        </div>
        <Field label="Condition on arrival"
          hint="The baseline any later damage claim is judged against — so it is worth writing even when nothing is wrong.">
          <textarea defaultValue={job.condition_on_arrival} disabled={!mayWork} rows={2}
            onBlur={(e) => set({ condition_on_arrival: e.target.value })} />
        </Field>
        <p className="ind-note">
          Received by <b>{job.received_by_name || '—'}</b> on {(job.received_at ?? '').slice(0, 10)}.
        </p>
      </SectionCard>

      {/* ---- 2. CLEAN (4.5.3) -------------------------------------------- */}
      <SectionCard title="2 · Cleaned and disinfected">
        <div className="ind-grid">
          <Field label="Work instruction"><input defaultValue={job.cleaning_wi} disabled={!mayWork}
            onBlur={(e) => set({ cleaning_wi: e.target.value })} /></Field>
          <Field label="Revision" hint="Which revision it was cleaned against — the WI changes, the record should say which one applied.">
            <input defaultValue={job.cleaning_wi_rev} disabled={!mayWork}
              onBlur={(e) => set({ cleaning_wi_rev: e.target.value })} /></Field>
        </div>
        {job.cleaned_at
          ? <p className="ind-note">Cleaned by <b>{job.cleaned_by_name || '—'}</b> on {(job.cleaned_at ?? '').slice(0, 10)}.</p>
          : mayWork
            ? <button className="btn" onClick={async () => {
                const r = await markIndoorCleaned(job.id, job.cleaning_wi || 'WI/SER/01', job.cleaning_wi_rev, uid);
                if (!r.ok) setMsg(r.error ?? 'Could not record the cleaning');
                else { setMsg(''); void patch(job.id, { status: 'Cleaned' }); }
              }}>Record cleaning</button>
            : <p className="ind-note">Not yet cleaned.</p>}
        {SHOWS.salvage(a) ? (
          <label className="ind-check">
            <input type="checkbox" checked={job.decontaminated} disabled={!mayWork}
              onChange={(e) => set({ decontaminated: e.target.checked })} />
            Decontaminated — <b>required before any part is harvested</b>. The database refuses the harvest until this is ticked.
          </label>
        ) : null}
      </SectionCard>

      {/* ---- 3. WORK (4.5.6) --------------------------------------------- */}
      <SectionCard title="3 · Findings and work done">
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
            <p className="ind-note">Condemned by <b>{job.condemned_by_name || '—'}</b> on {(job.condemned_at ?? '').slice(0, 10)}.</p>
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

      {/* ---- accessories (4.5.4) ------------------------------------------ */}
      {SHOWS.accessories(a) ? (
        <SectionCard title="Accessories">
          <p className="ind-note">
            Tagged to the parent equipment (4.5.4). Returning the customer's accessories is
            part of returning their property, and a list is what makes that checkable at
            dispatch — {job.accessories_outstanding} of {job.accessory_count} still to go back.
          </p>
          <table className="table ind-child">
            <thead><tr><th>Item</th><th>Serial</th><th>Tag</th><th>Returned</th><th /></tr></thead>
            <tbody>
              {accessories.map((x) => (
                <tr key={x.id}>
                  <td><input defaultValue={x.name} disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { name: e.target.value }))} /></td>
                  <td><input defaultValue={x.serial} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { serial: e.target.value }))} /></td>
                  <td><input defaultValue={x.tag_no} className="mono" disabled={!mayWork}
                    onBlur={(e) => child(() => saveIndoorAccessory(x.id, { tag_no: e.target.value }))} /></td>
                  <td><input type="checkbox" checked={x.returned} disabled={!mayWork}
                    onChange={(e) => child(() => saveIndoorAccessory(x.id, { returned: e.target.checked }))} /></td>
                  <td>{mayWork ? <button className="btn-link"
                    onClick={() => child(() => deleteIndoorAccessory(x.id))}>remove</button> : null}</td>
                </tr>
              ))}
              {accessories.length === 0 ? <tr><td colSpan={5} className="ind-empty">Nothing listed.</td></tr> : null}
            </tbody>
          </table>
          {mayWork ? <button className="btn"
            onClick={() => child(() => addIndoorAccessory(job.id, { name: '' }))}>Add an accessory</button> : null}
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

      {/* ---- 4. QC (4.5.6) ------------------------------------------------ */}
      <SectionCard title="4 · Quality check">
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
          <p className="ind-note">Checked by <b>{job.qc_by_name || '—'}</b> on {(job.qc_at ?? '').slice(0, 10)}.</p>
        ) : null}
        {selfChecked ? (
          <p className="ind-warn">
            The check was signed by the same person who received the unit. The procedure
            does not forbid it, and this is recorded rather than blocked — but where a
            second pair of hands is available, the check is worth more from them.
          </p>
        ) : null}
      </SectionCard>

      {/* ---- 5. DISPATCH (4.5.7) ------------------------------------------ */}
      <SectionCard title="5 · Dispatch">
        <Field label="Dispatch reference (DC number)">
          <input defaultValue={job.dispatch_ref} disabled={!mayDispatch}
            onBlur={(e) => set({ dispatch_ref: e.target.value })} /></Field>
        {job.accessories_outstanding > 0 ? (
          <p className="ind-warn">
            {job.accessories_outstanding} accessor{job.accessories_outstanding === 1 ? 'y is' : 'ies are'} still
            not marked returned. Returning the customer's property means returning all of it.
          </p>
        ) : null}
        {job.dispatched_at ? (
          <p className="ind-note">Dispatched by <b>{job.dispatched_by_name || '—'}</b> on {(job.dispatched_at ?? '').slice(0, 10)}.</p>
        ) : null}
        {!mayDispatch ? <p className="ind-note">Dispatching needs the <b>dispatch</b> right.</p> : null}
      </SectionCard>

      <p className="ind-foot">
        Last changed by {job.updated_by_name || '—'}. Phase 2 links this back to the call:
        the transfer of 4.5.1, a chip on the call itself, and the field engineer's
        completion report closing it (4.5.7).
      </p>
    </div>
  );
}
