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
  listTrainingRequests, saveTrainingRequest, addTrainingRequest, signTrainingRequest, myPersonNames, approvalFromDoc,
  listTrainingContent, saveTrainingContent, linesToAdd,
  type TrainingRequest, type TrainingRecordLine, type TrainingEvalLine, type TrainingSigned, type TrainingContentRow,
} from '../lib/training';
import { listDirectory, type DirectoryRow } from '../lib/supabase';
import { useMaster } from '../lib/masters';
import { readDocxDocumentXml } from '../lib/docxRead';
import { parseTrainingDoc } from '../lib/trainingDoc';
import { uploadToDrive } from '../lib/sheets';
import { formatDayTime } from '../lib/dates';
import { TRAINING_METHODOLOGY, TRAINING_RATINGS, TRAINING_RISKS } from '../lib/trainingForm';
import { safeUrl } from '../lib/safeUrl';

const APPROVAL_TONE: Record<string, string> = { Pending: '#b45309', Approved: '#2e7d32', 'Not approved': '#b91c1c' };
const BLANK_LINE: TrainingRecordLine = { name: '', content: '', status: '' };
const BLANK_EVAL: TrainingEvalLine = { plan: '', evaluator: '', planned_date: '', actual: '', rating: '' };
// A NEW form, before the HR document fills it (id 0 until it is saved).
const BLANK_REQUEST: TrainingRequest = {
  id: 0, employee_request_id: null, req_no: '', req_date: '', trainee_name: '', designation: '', manager_name: '',
  topic: '', trainer_name: '', trainer_designation: '', risk: 'Low', approval: 'Pending', approved_by_name: '',
  approved_at: null, not_approved_reason: '', from_date: null, to_date: null, record_lines: [], evaluation_required: null,
  evaluation_justification: '', evaluation_method: '', evaluation_plan: [], reassessment: '', remarks: '', created_at: '',
  source_doc_url: '', source_doc_name: '', evaluator_name: '', trainer_signed: null, evaluator_signed: null,
};
/** "Signed by ARUN K, 27-Oct-2026 10:12:03" -- or nothing. */
const signedText = (s?: Partial<TrainingSigned> | null) => (s?.signature ? `✓ Signed${s.signed_name ? ` by ${s.signed_name}` : ''}${s.signed_at ? `, ${formatDayTime(s.signed_at)}` : ''}` : '');

export function TrainingRequests() {
  const { can } = useAuth();
  const mayEdit = can('training.manage');
  const [rows, setRows] = useState<TrainingRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<TrainingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // THE HR DOCUMENT a new form was read from (0454), uploaded to Drive on Save.
  const [docFile, setDocFile] = useState<File | null>(null);
  // Who the signed-in person is on a form, for the Sign buttons.
  const [myNames, setMyNames] = useState<string[]>([]);
  useEffect(() => { void myPersonNames().then(setMyNames); }, []);
  // FOR FILLING THE RECORD (0458): the User Master's active people, the
  // departments, and the content of training each designation gets.
  const [dir, setDir] = useState<DirectoryRow[]>([]);
  const [content, setContent] = useState<TrainingContentRow[]>([]);
  const [dept, setDept] = useState('');
  const departments = useMaster('department', [], mayEdit).values;
  const loadContent = async () => { try { setContent(await listTrainingContent()); } catch { setContent([]); } };
  useEffect(() => {
    if (!mayEdit) return;
    void listDirectory().then(setDir).catch(() => setDir([]));
    void loadContent();
  }, [mayEdit]);
  const active = useMemo(() => dir.filter((d) => d.validity), [dir]);
  const isMe = (n: string) => myNames.includes(String(n ?? '').trim().toLowerCase());

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

  // ADD FROM THE HR DOCUMENT (the user, 2026-10-27): read it, fill the form,
  // and let the person check it before it is saved.
  const readDoc = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const d = parseTrainingDoc(await readDocxDocumentXml(f));
      setDocFile(f);
      setEdit({ ...BLANK_REQUEST, ...d, req_date: d.req_date ?? '', risk: d.risk || 'Low',
        approval: approvalFromDoc(d.approved_by_name, d.not_approved_reason), source_doc_name: f.name });
      setMsg({ tone: 'ok', text: `Read “${f.name}”${d.req_no ? ` — Training Request ${d.req_no}` : ''}. Check the form, then Save; the document is kept with it.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read “${f.name}”: ${e instanceof Error ? e.message : String(e)} It must be the HR Training Form as a Word (.docx) file.` });
    }
  };

  const sign = async (part: 'line' | 'trainer' | 'evaluator', index?: number) => {
    if (!edit) return;
    setBusy(true);
    const res = await signTrainingRequest(edit.id, part, index);
    logAudit({ action: 'training.request.sign', target: edit.req_no || `#${edit.id}`, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { part, index } });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not sign.' }); return; }
    setMsg({ tone: 'ok', text: 'Signed.' });
    const fresh = (await listTrainingRequests()).find((r) => r.id === edit.id);
    if (fresh) setEdit({ ...fresh, record_lines: [...(fresh.record_lines ?? [])], evaluation_plan: [...(fresh.evaluation_plan ?? [])] });
    void load();
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    if (edit.id === 0) {
      // THE DOCUMENT FIRST: a form whose HR document did not reach Drive is not
      // saved, so no form is left without the paper it was read from.
      let url = '';
      if (docFile) {
        const up = await uploadToDrive(docFile, `Training Request ${edit.req_no || edit.trainee_name || ''}`.trim());
        if (!up.ok || !up.url) { setBusy(false); setMsg({ tone: 'error', text: `The HR document could not be uploaded: ${up.error ?? 'no link came back'}. Nothing was saved.` }); return; }
        url = up.url;
      }
      const added = await addTrainingRequest({ ...edit, source_doc_url: url, source_doc_name: docFile?.name ?? edit.source_doc_name });
      logAudit({ action: 'training.request.add', target: edit.req_no || edit.trainee_name, status: added.ok ? 'ok' : 'error', error: added.ok ? undefined : added.error });
      setBusy(false);
      if (!added.ok) { setMsg({ tone: 'error', text: added.error ?? 'Could not save.' }); return; }
      setMsg({ tone: 'ok', text: `Training request${edit.req_no ? ` ${edit.req_no}` : ''} added from the HR document.` });
      setEdit(null); setDocFile(null);
      void load();
      return;
    }
    const res = await saveTrainingRequest(edit.employee_request_id ? edit : { ...edit, approval: approvalFromDoc(edit.approved_by_name, edit.not_approved_reason) });
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
  // A FORM FROM THE HR DOCUMENT, once saved (0458): only the RECORD is filled
  // in here; the plan and the evaluation are the document's and the database
  // keeps them as saved. Before the first save they can still be checked.
  const planRo = ro || (!!edit && edit.id !== 0 && !edit.employee_request_id);
  const addPeople = (people: DirectoryRow[], what: string) => {
    if (!edit) return;
    const add = linesToAdd(people.map((d) => ({ name: d.name, designation: d.designation })), edit.record_lines, content);
    set({ record_lines: [...edit.record_lines, ...add] });
    setMsg({ tone: 'ok', text: add.length ? `Added ${add.length} ${what}${people.length - add.length ? ` (${people.length - add.length} already on the form)` : ''}. Content of training is filled from each person's designation where a list is kept.` : `Everyone ${what} is already on the form.` });
  };

  return (
    <div>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not read the training requests: {err}</span></div>}
      {mayEdit && <TrainingContentCard rows={content} designations={active.map((d) => d.designation)} onSaved={() => void loadContent()} />}
      <DataTable<TrainingRequest> columns={columns} rows={shown} getRowId={(r) => String(r.id)} storageKey="trainingRequests"
        onRowClick={(r) => setEdit({ ...r, record_lines: [...(r.record_lines ?? [])], evaluation_plan: [...(r.evaluation_plan ?? [])] })}
        emptyText={rows === null && !err ? 'Loading…' : 'No training request yet — one is raised with each New Employee Request.'}
        toolbar={<Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Request No., trainee, topic, trainer…" />
          <div className="spacer" />
          {mayEdit && (
            <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }} title="Upload the Training Form HR generated (.docx); RITHI fills this form from it">
              ＋ Add from HR document
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }}
                onChange={(e) => { void readDoc(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
        </Toolbar>} />

      <Drawer open={!!edit} onClose={() => { setEdit(null); setDocFile(null); }} title={edit ? `${edit.id === 0 ? 'New training request — ' : 'Training Request'}${edit.req_no ? ` ${edit.req_no}` : ''}${edit.trainee_name ? ` — ${edit.trainee_name}` : ''}` : ''} storeKey="trainingRequestEdit" width={820}>
        {edit && (
          <div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}>
              {edit.source_doc_url && <a className="btn btn-sm" href={safeUrl(edit.source_doc_url)} target="_blank" rel="noopener noreferrer">📎 HR document{edit.source_doc_name ? ` (${edit.source_doc_name})` : ''}</a>}
              {edit.id === 0 && docFile && <span className="muted" style={{ alignSelf: 'center' }}>📎 {docFile.name} — uploaded on Save</span>}
              {edit.id !== 0 && <a className="btn btn-sm" href={`#/training-form/${edit.id}`} target="_blank" rel="noopener noreferrer">📄 Training Form</a>}
              {edit.id !== 0 && <a className="btn btn-sm" href={`#/training-form/${edit.id}?part=record`} target="_blank" rel="noopener noreferrer" title="The Record alone, on A4 pages numbered from 3, to go with HR's two pages">📄 Record sheet</a>}
            </div>

            {planRo && !ro && <div className="sheet-banner sheet-banner-info"><span>From HR's document: only the <b>RECORD</b> is filled in here — training dates, names, content and status. The plan and the evaluation are as the document gave them.</span></div>}
            <div className="rep-sec-title">PLAN</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training Request No.</span>
                <input className="input" value={edit.req_no} disabled={planRo} placeholder="e.g. 102/2026 — raised elsewhere" onChange={(e) => set({ req_no: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Date</span>
                <input className="input" type="date" value={edit.req_date ?? ''} disabled={planRo} onChange={(e) => set({ req_date: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainee Name</span>
                <input className="input" value={edit.trainee_name} disabled={planRo} onChange={(e) => set({ trainee_name: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Designation</span>
                <input className="input" value={edit.designation} disabled={planRo} onChange={(e) => set({ designation: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Manager Name</span>
                <input className="input" value={edit.manager_name} disabled={planRo} onChange={(e) => set({ manager_name: e.target.value })} /></label>
              <label className="rep-field rep-span2"><span className="field-label">Training Topic</span>
                <input className="input" value={edit.topic} disabled={planRo} onChange={(e) => set({ topic: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainer name</span>
                <input className="input" value={edit.trainer_name} disabled={planRo} onChange={(e) => set({ trainer_name: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainer Designation</span>
                <input className="input" value={edit.trainer_designation} disabled={planRo} onChange={(e) => set({ trainer_designation: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Risk</span>
                <SelectPicker value={edit.risk} disabled={planRo} onChange={(v) => set({ risk: (v || 'Low') as TrainingRequest['risk'] })}
                  options={TRAINING_RISKS.map((r) => ({ value: r, label: `${r.toUpperCase()} RISK — ${TRAINING_METHODOLOGY[r]}` }))} /></label>
              {edit.employee_request_id ? (
                <div className="rep-field"><span className="field-label">Training Approved by</span>
                  <div>{edit.approval === 'Pending' ? <span className="muted">Pending — the New Employee Request's approver</span>
                    : <><b>{edit.approved_by_name || '—'}</b> ({edit.approval}{edit.approved_at ? `, ${formatDay(edit.approved_at)}` : ''})</>}</div>
                  {edit.approval === 'Not approved' && <div><span className="field-label">If No Reason: </span>{edit.not_approved_reason}</div>}
                </div>
              ) : (
                // FROM THE HR DOCUMENT: no approval step in RITHI -- what the document says.
                <>
                  <label className="rep-field"><span className="field-label">Training Approved by</span>
                    <input className="input" value={edit.approved_by_name} disabled={planRo} onChange={(e) => set({ approved_by_name: e.target.value })} /></label>
                  <label className="rep-field"><span className="field-label">If No Reason</span>
                    <input className="input" value={edit.not_approved_reason} disabled={planRo} onChange={(e) => set({ not_approved_reason: e.target.value })} /></label>
                </>
              )}
            </div>

            <div className="rep-sec-title" style={{ marginTop: 14 }}>RECORD</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training From (Date)</span>
                <input className="input" type="date" value={edit.from_date ?? ''} disabled={ro} onChange={(e) => set({ from_date: e.target.value || null })} /></label>
              <label className="rep-field"><span className="field-label">To (Date)</span>
                <input className="input" type="date" value={edit.to_date ?? ''} disabled={ro} onChange={(e) => set({ to_date: e.target.value || null })} /></label>
              <div className="rep-field"><span className="field-label">Trainer Signature</span>
                <div>{signedText(edit.trainer_signed) || <span className="muted">Not signed — {edit.trainer_name || 'the trainer'} signs it</span>}
                  {edit.id !== 0 && !edit.trainer_signed && isMe(edit.trainer_name) && <button className="btn btn-sm btn-primary" style={{ marginLeft: 6 }} disabled={busy} onClick={() => void sign('trainer')}>✍️ Sign</button>}</div>
              </div>
            </div>
            <table className="table" style={{ width: '100%', marginTop: 6 }}>
              <thead><tr><th style={{ width: 40 }}>S. No</th><th>Name of the Employee</th><th>Content of the training</th><th style={{ width: 130 }}>Status</th><th style={{ width: 170 }}>Signature</th>{!ro && <th style={{ width: 40 }} />}</tr></thead>
              <tbody>
                {edit.record_lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input className="input" value={l.name} disabled={ro} onChange={(e) => setLine(i, { name: e.target.value })} /></td>
                    <td><input className="input" value={l.content} disabled={ro} onChange={(e) => setLine(i, { content: e.target.value })} /></td>
                    <td><input className="input" value={l.status} disabled={ro} placeholder="e.g. Completed" onChange={(e) => setLine(i, { status: e.target.value })} /></td>
                    {/* EACH TRAINEE SIGNS THEIR OWN LINE (0454): the Sign button is offered only to the person the line names. */}
                    <td style={{ fontSize: 12 }}>{signedText(l) || (edit.id !== 0 && isMe(l.name)
                      ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void sign('line', i)}>✍️ Sign</button>
                      : <span className="muted">Not signed</span>)}</td>
                    {!ro && <td><button className="btn btn-ghost btn-sm" title="Remove this line" onClick={() => set({ record_lines: edit.record_lines.filter((_, j) => j !== i) })}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!ro && (
              <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-sm" onClick={() => set({ record_lines: [...edit.record_lines, { ...BLANK_LINE }] })}>＋ Add an employee</button>
                {/* EVERYONE AT ONCE (the user, 2026-10-27): all active users, or a department's. */}
                <button className="btn btn-sm" disabled={!active.length} onClick={() => addPeople(active, 'active users')}>＋ All active users ({active.length.toLocaleString()})</button>
                <div style={{ minWidth: 190 }}>
                  <SelectPicker value={dept} onChange={setDept} placeholder="— department —"
                    options={[...new Set([...departments, ...active.map((d) => d.department).filter(Boolean)])].sort()} />
                </div>
                <button className="btn btn-sm" disabled={!dept}
                  onClick={() => addPeople(active.filter((d) => d.department.trim().toLowerCase() === dept.trim().toLowerCase()), `from ${dept}`)}>
                  ＋ Add everyone in it ({active.filter((d) => d.department.trim().toLowerCase() === dept.trim().toLowerCase()).length})
                </button>
              </div>
            )}

            <div className="rep-sec-title" style={{ marginTop: 14 }}>EVALUATION</div>
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">Training Evaluation Required</span>
                <SelectPicker value={edit.evaluation_required == null ? '' : edit.evaluation_required ? 'YES' : 'NO'} disabled={planRo}
                  onChange={(v) => set({ evaluation_required: v === '' ? null : v === 'YES' })} placeholder="— choose —"
                  options={[{ value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }]} /></label>
              {edit.evaluation_required === false && (
                <label className="rep-field rep-span2"><span className="field-label">If ‘No’, Justification</span>
                  <input className="input" value={edit.evaluation_justification} disabled={planRo} placeholder="e.g. Being refresh training"
                    onChange={(e) => set({ evaluation_justification: e.target.value })} /></label>
              )}
              <label className="rep-field rep-span2"><span className="field-label">Evaluation Method</span>
                <input className="input" value={edit.evaluation_method} disabled={planRo} onChange={(e) => set({ evaluation_method: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Evaluator (signs the form)</span>
                <input className="input" value={edit.evaluator_name} disabled={planRo} placeholder="Name as on the User Master" onChange={(e) => set({ evaluator_name: e.target.value })} /></label>
              <div className="rep-field"><span className="field-label">Signature of Evaluator</span>
                <div>{signedText(edit.evaluator_signed) || <span className="muted">Not signed</span>}
                  {edit.id !== 0 && !edit.evaluator_signed && isMe(edit.evaluator_name) && <button className="btn btn-sm btn-primary" style={{ marginLeft: 6 }} disabled={busy} onClick={() => void sign('evaluator')}>✍️ Sign</button>}</div>
              </div>
            </div>
            <table className="table" style={{ width: '100%', marginTop: 6 }}>
              <thead><tr><th style={{ width: 40 }}>Sl. No</th><th>Training Evaluation Plan</th><th>Evaluator</th><th style={{ width: 140 }}>Planned Date</th><th>Status / Actual Date</th><th style={{ width: 190 }}>Rating</th>{!planRo && <th style={{ width: 40 }} />}</tr></thead>
              <tbody>
                {edit.evaluation_plan.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input className="input" value={l.plan} disabled={planRo} onChange={(e) => setEval(i, { plan: e.target.value })} /></td>
                    <td><input className="input" value={l.evaluator} disabled={planRo} onChange={(e) => setEval(i, { evaluator: e.target.value })} /></td>
                    <td><input className="input" type="date" value={l.planned_date} disabled={planRo} onChange={(e) => setEval(i, { planned_date: e.target.value })} /></td>
                    <td><input className="input" value={l.actual} disabled={planRo} onChange={(e) => setEval(i, { actual: e.target.value })} /></td>
                    <td><SelectPicker value={l.rating} disabled={planRo} onChange={(v) => setEval(i, { rating: v })} placeholder="— rating —"
                      options={TRAINING_RATINGS.map((r) => r.label)} /></td>
                    {!planRo && <td><button className="btn btn-ghost btn-sm" title="Remove this line" onClick={() => set({ evaluation_plan: edit.evaluation_plan.filter((_, j) => j !== i) })}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!planRo && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => set({ evaluation_plan: [...edit.evaluation_plan, { ...BLANK_EVAL }] })}>＋ Add an evaluation line</button>}
            <div className="rep-grid" style={{ marginTop: 8 }}>
              <label className="rep-field"><span className="field-label">Performance Re-assessment (if required)?</span>
                <SelectPicker value={edit.reassessment} disabled={planRo} onChange={(v) => set({ reassessment: (v || '') as TrainingRequest['reassessment'] })}
                  placeholder="— choose —" options={[{ value: 'Yes', label: 'YES' }, { value: 'No', label: 'NO' }]} /></label>
              <label className="rep-field rep-span2"><span className="field-label">Remarks</span>
                <input className="input" value={edit.remarks} disabled={planRo} onChange={(e) => set({ remarks: e.target.value })} /></label>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              {ro && <span className="muted" style={{ alignSelf: 'center' }}>Filling this in needs “Manage training”.</span>}
              <button className="btn" onClick={() => setEdit(null)} disabled={busy}>Close</button>
              {!ro && <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : edit.id === 0 ? 'Save training request' : 'Save'}</button>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ===========================================================================
// CONTENT OF TRAINING BY DESIGNATION (0458; the user, 2026-10-27: "it has to
// be Mapped per Role. Like Reporting Manager gets few additional things,
// Engineer get few things, Hotline engineer gets few things"; asked: per User
// Master designation, "a list I fill on screen"). Every designation an active
// person holds is listed, with what has been typed for it; nothing is filled
// in for one that has no list.
// ===========================================================================
function TrainingContentCard({ rows, designations, onSaved }: { rows: TrainingContentRow[]; designations: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const list = useMemo(() => {
    const m = new Map<string, { designation: string; row?: TrainingContentRow }>();
    rows.forEach((r) => m.set(r.designation.trim().toLowerCase(), { designation: r.designation, row: r }));
    designations.map((d) => d.trim()).filter(Boolean).forEach((d) => { if (!m.has(d.toLowerCase())) m.set(d.toLowerCase(), { designation: d }); });
    return [...m.values()].sort((a, b) => a.designation.localeCompare(b.designation));
  }, [rows, designations]);
  const kept = rows.filter((r) => r.content.trim()).length;
  const save = async (d: { designation: string; row?: TrainingContentRow }) => {
    const k = d.designation.toLowerCase();
    setBusy(k); setNote('');
    const res = await saveTrainingContent(d.designation, draft[k] ?? d.row?.content ?? '', d.row?.id);
    logAudit({ action: 'training.content.save', target: d.designation, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy('');
    if (!res.ok) { setNote(res.error ?? 'Could not save.'); return; }
    setDraft((x) => { const y = { ...x }; delete y[k]; return y; });
    onSaved();
  };
  return (
    <div className="sheet-banner sheet-banner-info" style={{ display: 'block' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>📋 <b>Content of training by designation</b> — {kept} of {list.length} designations have a list. Added people get theirs.</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show / edit'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8, maxHeight: 360, overflow: 'auto' }}>
          {note && <div className="muted" style={{ color: 'var(--danger)' }}>{note}</div>}
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th style={{ width: 220 }}>Designation</th><th>Content of the training</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>
              {list.map((d) => {
                const k = d.designation.toLowerCase();
                const v = draft[k] ?? d.row?.content ?? '';
                return (
                  <tr key={k}>
                    <td>{d.designation}</td>
                    <td><textarea className="input" rows={2} value={v} placeholder="Type what this designation is trained on"
                      onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} /></td>
                    <td><button className="btn btn-sm btn-primary" disabled={busy === k || draft[k] === undefined} onClick={() => void save(d)}>{busy === k ? 'Saving…' : 'Save'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
