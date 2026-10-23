// ===========================================================================
// TRAINING REQUESTS -- Training Form R/HR/11, kept in RITHI (0453; the user,
// 2026-10-23, with the template "102_2026 Service").
//
// Raised by a New Employee Request: its PLAN is the requester's, its approval
// that request's decision. Here whoever may manage training gives the Request
// No. ("It is Raised Elsewhere, So i will give the Number myself"), and fills
// the RECORD -- the training dates and each employee's content and status --
// and the EVALUATION. The approval cannot be edited here; the database keeps
// it. Printed as R/HR/11 from 📄 Training Form.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useAuth } from '../lib/auth';
import { formatDay } from '../lib/dates';
import { logAudit } from '../lib/audit';
import {
  listTrainingRequests, saveTrainingRequest,
  type TrainingRequest, type TrainingRecordLine, type TrainingEvalLine,
} from '../lib/training';
import { TRAINING_METHODOLOGY, TRAINING_RATINGS, TRAINING_RISKS } from '../lib/trainingForm';

const APPROVAL_TONE: Record<string, string> = { Pending: '#b45309', Approved: '#2e7d32', 'Not approved': '#b91c1c' };
const BLANK_LINE: TrainingRecordLine = { name: '', content: '', status: '' };
const BLANK_EVAL: TrainingEvalLine = { plan: '', evaluator: '', planned_date: '', actual: '', rating: '' };

export function TrainingRequests() {
  const { can } = useAuth();
  const mayEdit = can('training.manage');
  const [rows, setRows] = useState<TrainingRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<TrainingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setErr('');
    try { setRows(await listTrainingRequests()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || `${r.req_no} ${r.trainee_name} ${r.designation} ${r.manager_name} ${r.topic} ${r.trainer_name}`.toLowerCase().includes(s));
  }, [rows, q]);

  const columns: Column<TrainingRequest>[] = [
    { key: 'req_no', header: 'Request No.', width: 110, wrap: false, render: (r) => r.req_no || <span className="muted">—</span> },
    { key: 'req_date', header: 'Date', width: 110, wrap: false, render: (r) => formatDay(r.req_date) },
    { key: 'trainee_name', header: 'Trainee Name', width: 170 },
    { key: 'designation', header: 'Designation', width: 150 },
    { key: 'manager_name', header: 'Manager Name', width: 150 },
    { key: 'topic', header: 'Training Topic', width: 200 },
    { key: 'trainer_name', header: 'Trainer', width: 150 },
    { key: 'risk', header: 'Risk', width: 80, wrap: false },
    { key: 'approval', header: 'Approval', width: 120, wrap: false,
      render: (r) => <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, background: APPROVAL_TONE[r.approval] ?? '#555', color: '#fff', fontWeight: 700, fontSize: 12 }}>{r.approval}</span> },
    { key: 'from_date', header: 'From', width: 110, wrap: false, render: (r) => formatDay(r.from_date) },
    { key: 'to_date', header: 'To', width: 110, wrap: false, render: (r) => formatDay(r.to_date) },
  ];

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const res = await saveTrainingRequest(edit);
    logAudit({ action: 'training.request.save', target: edit.req_no || `#${edit.id}`, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save.' }); return; }
    setMsg({ tone: 'ok', text: `Training request${edit.req_no ? ` ${edit.req_no}` : ''} for ${edit.trainee_name} saved.` });
    setEdit(null);
    void load();
  };

  const set = (patch: Partial<TrainingRequest>) => edit && setEdit({ ...edit, ...patch });
  const setLine = (i: number, p: Partial<TrainingRecordLine>) => edit && set({ record_lines: edit.record_lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const setEval = (i: number, p: Partial<TrainingEvalLine>) => edit && set({ evaluation_plan: edit.evaluation_plan.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const ro = !mayEdit;

  return (
    <div>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not read the training requests: {err}</span></div>}
      <DataTable<TrainingRequest> columns={columns} rows={shown} getRowId={(r) => String(r.id)} storageKey="trainingRequests"
        onRowClick={(r) => setEdit({ ...r, record_lines: [...(r.record_lines ?? [])], evaluation_plan: [...(r.evaluation_plan ?? [])] })}
        emptyText={rows === null && !err ? 'Loading…' : 'No training request yet — one is raised with each New Employee Request.'}
        toolbar={<Toolbar><SearchBox value={q} onChange={setQ} placeholder="Request No., trainee, topic, trainer…" /></Toolbar>} />

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit ? `Training Request${edit.req_no ? ` ${edit.req_no}` : ''} — ${edit.trainee_name}` : ''} storeKey="trainingRequestEdit" width={820}>
        {edit && (
          <div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
              <a className="btn btn-sm" href={`#/training-form/${edit.id}`} target="_blank" rel="noopener noreferrer">📄 Training Form</a>
            </div>

            <div className="rep-sec-title">PLAN</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training Request No.</span>
                <input className="input" value={edit.req_no} disabled={ro} placeholder="e.g. 102/2026 — raised elsewhere" onChange={(e) => set({ req_no: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Date</span>
                <input className="input" type="date" value={edit.req_date ?? ''} disabled={ro} onChange={(e) => set({ req_date: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainee Name</span>
                <input className="input" value={edit.trainee_name} disabled={ro} onChange={(e) => set({ trainee_name: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Designation</span>
                <input className="input" value={edit.designation} disabled={ro} onChange={(e) => set({ designation: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Manager Name</span>
                <input className="input" value={edit.manager_name} disabled={ro} onChange={(e) => set({ manager_name: e.target.value })} /></label>
              <label className="rep-field rep-span2"><span className="field-label">Training Topic</span>
                <input className="input" value={edit.topic} disabled={ro} onChange={(e) => set({ topic: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainer name</span>
                <input className="input" value={edit.trainer_name} disabled={ro} onChange={(e) => set({ trainer_name: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainer Designation</span>
                <input className="input" value={edit.trainer_designation} disabled={ro} onChange={(e) => set({ trainer_designation: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Risk</span>
                <SelectPicker value={edit.risk} disabled={ro} onChange={(v) => set({ risk: (v || 'Low') as TrainingRequest['risk'] })}
                  options={TRAINING_RISKS.map((r) => ({ value: r, label: `${r.toUpperCase()} RISK — ${TRAINING_METHODOLOGY[r]}` }))} /></label>
              <div className="rep-field"><span className="field-label">Training Approved by</span>
                <div>{edit.approval === 'Pending' ? <span className="muted">Pending — the New Employee Request's approver</span>
                  : <><b>{edit.approved_by_name || '—'}</b> ({edit.approval}{edit.approved_at ? `, ${formatDay(edit.approved_at)}` : ''})</>}</div>
                {edit.approval === 'Not approved' && <div><span className="field-label">If No Reason: </span>{edit.not_approved_reason}</div>}
              </div>
            </div>

            <div className="rep-sec-title" style={{ marginTop: 14 }}>RECORD</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training From (Date)</span>
                <input className="input" type="date" value={edit.from_date ?? ''} disabled={ro} onChange={(e) => set({ from_date: e.target.value || null })} /></label>
              <label className="rep-field"><span className="field-label">To (Date)</span>
                <input className="input" type="date" value={edit.to_date ?? ''} disabled={ro} onChange={(e) => set({ to_date: e.target.value || null })} /></label>
            </div>
            <table className="table" style={{ width: '100%', marginTop: 6 }}>
              <thead><tr><th style={{ width: 40 }}>S. No</th><th>Name of the Employee</th><th>Content of the training</th><th style={{ width: 150 }}>Status</th>{!ro && <th style={{ width: 40 }} />}</tr></thead>
              <tbody>
                {edit.record_lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input className="input" value={l.name} disabled={ro} onChange={(e) => setLine(i, { name: e.target.value })} /></td>
                    <td><input className="input" value={l.content} disabled={ro} onChange={(e) => setLine(i, { content: e.target.value })} /></td>
                    <td><input className="input" value={l.status} disabled={ro} placeholder="e.g. Completed" onChange={(e) => setLine(i, { status: e.target.value })} /></td>
                    {!ro && <td><button className="btn btn-ghost btn-sm" title="Remove this line" onClick={() => set({ record_lines: edit.record_lines.filter((_, j) => j !== i) })}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!ro && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => set({ record_lines: [...edit.record_lines, { ...BLANK_LINE }] })}>＋ Add an employee</button>}

            <div className="rep-sec-title" style={{ marginTop: 14 }}>EVALUATION</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training Evaluation Required</span>
                <SelectPicker value={edit.evaluation_required == null ? '' : edit.evaluation_required ? 'YES' : 'NO'} disabled={ro}
                  onChange={(v) => set({ evaluation_required: v === '' ? null : v === 'YES' })} placeholder="— choose —"
                  options={[{ value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }]} /></label>
              {edit.evaluation_required === false && (
                <label className="rep-field rep-span2"><span className="field-label">If ‘No’, Justification</span>
                  <input className="input" value={edit.evaluation_justification} disabled={ro} placeholder="e.g. Being refresh training"
                    onChange={(e) => set({ evaluation_justification: e.target.value })} /></label>
              )}
              <label className="rep-field rep-span2"><span className="field-label">Evaluation Method</span>
                <input className="input" value={edit.evaluation_method} disabled={ro} onChange={(e) => set({ evaluation_method: e.target.value })} /></label>
            </div>
            <table className="table" style={{ width: '100%', marginTop: 6 }}>
              <thead><tr><th style={{ width: 40 }}>Sl. No</th><th>Training Evaluation Plan</th><th>Evaluator</th><th style={{ width: 140 }}>Planned Date</th><th>Status / Actual Date</th><th style={{ width: 190 }}>Rating</th>{!ro && <th style={{ width: 40 }} />}</tr></thead>
              <tbody>
                {edit.evaluation_plan.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input className="input" value={l.plan} disabled={ro} onChange={(e) => setEval(i, { plan: e.target.value })} /></td>
                    <td><input className="input" value={l.evaluator} disabled={ro} onChange={(e) => setEval(i, { evaluator: e.target.value })} /></td>
                    <td><input className="input" type="date" value={l.planned_date} disabled={ro} onChange={(e) => setEval(i, { planned_date: e.target.value })} /></td>
                    <td><input className="input" value={l.actual} disabled={ro} onChange={(e) => setEval(i, { actual: e.target.value })} /></td>
                    <td><SelectPicker value={l.rating} disabled={ro} onChange={(v) => setEval(i, { rating: v })} placeholder="— rating —"
                      options={TRAINING_RATINGS.map((r) => r.label)} /></td>
                    {!ro && <td><button className="btn btn-ghost btn-sm" title="Remove this line" onClick={() => set({ evaluation_plan: edit.evaluation_plan.filter((_, j) => j !== i) })}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!ro && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => set({ evaluation_plan: [...edit.evaluation_plan, { ...BLANK_EVAL }] })}>＋ Add an evaluation line</button>}
            <div className="rep-grid" style={{ marginTop: 8 }}>
              <label className="rep-field"><span className="field-label">Performance Re-assessment (if required)?</span>
                <SelectPicker value={edit.reassessment} disabled={ro} onChange={(v) => set({ reassessment: (v || '') as TrainingRequest['reassessment'] })}
                  placeholder="— choose —" options={[{ value: 'Yes', label: 'YES' }, { value: 'No', label: 'NO' }]} /></label>
              <label className="rep-field rep-span2"><span className="field-label">Remarks</span>
                <input className="input" value={edit.remarks} disabled={ro} onChange={(e) => set({ remarks: e.target.value })} /></label>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              {ro && <span className="muted" style={{ alignSelf: 'center' }}>Filling this in needs “Manage training”.</span>}
              <button className="btn" onClick={() => setEdit(null)} disabled={busy}>Close</button>
              {!ro && <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
