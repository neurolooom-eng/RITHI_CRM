import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, Drawer, FacetChips } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PickList } from '../components/ui/PickList';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { formatDay, todayLocal } from '../lib/dates';
import { csvExport } from '../lib/format';
import { COMPLETE } from '../lib/exportscope';
import { uploadToDrive, MAX_UPLOAD_BYTES } from '../lib/sheets';
import { loadFailure } from '../lib/dberror';
import { listDirectory, listDocuments, supabaseConfigured, type DirectoryRow, type DocRow } from '../lib/supabase';
import {
  listTrainingStatus, listSessions, listAttendance, saveSession, assignTraining, cancelTraining,
  type TrainingStatusRow, type SessionRow, type AttendeeInput,
} from '../lib/training';
import { audienceIds, audienceIsEmpty, EMPTY_AUDIENCE, type Audience } from '../lib/audience';
import { AudiencePicker } from '../components/people/AudiencePicker';
import { PersonProfile } from '../components/people/PersonProfile';

// ===========================================================================
// TRAINING (0257). The user, 2026-09-30: "Add a Training Module; it should
// Trigger Training if a New QMS document is Uploaded; Bulk Training. ... If a
// User is given Training on a Specific topic then it should list all Past
// Training details."
//
//   Assignments  -- who must be trained on what, and where each stands.
//                   Made on the QMS upload form (the audience is chosen there)
//                   or here with "Assign training".
//   Sessions     -- BULK training: one session, many attendees, each with
//                   attended / assessment (Pass/Fail, score) / remarks, and
//                   the attendance sheet or certificates attached.
// COMPLETE = attended a session on it, or acknowledged "read & understood" --
// and a Fail keeps it open until a session is attended without one. The
// trainee acknowledges on My Profile.
// ===========================================================================

const METHODS = ['Classroom', 'Online', 'Read & Understand', 'On the job'];
const STATUS_ORDER = ['Overdue', 'Failed - retrain', 'Pending', 'Completed', 'Cancelled'];
const docLabel = (d: DocRow) => `${d.doc_no}${d.revision ? ` Rev ${d.revision}` : ''} — ${d.title}`;

export function Training() {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const mayManage = live && can('training.manage');
  const departments = useMaster('department', [], live).values;

  const [tab, setTab] = useState<'assignments' | 'sessions'>('assignments');
  const [dir, setDir] = useState<DirectoryRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [status, setStatus] = useState<TrainingStatusRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState('');
  const [person, setPerson] = useState<DirectoryRow | null>(null);

  const load = async () => {
    if (!live) return;
    setBusy(true);
    try {
      const [d, dc, st, se] = await Promise.all([listDirectory(), listDocuments('qms', false), listTrainingStatus(), listSessions()]);
      setDir(d); setDocs(dc); setStatus(st); setSessions(se);
    } catch (e) {
      setMsg({ tone: 'error', text: loadFailure(e, {
        tables: ['training_status', 'training_sessions', 'training_assignments'],
        hint: 'Training is not on the project yet — run supabase/apply/training.sql.',
      }) });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const byId = useMemo(() => new Map(dir.map((d) => [d.id, d])), [dir]);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  // ---- assignments ---------------------------------------------------------
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    status.forEach((r) => m.set(r.status, (m.get(r.status) ?? 0) + 1));
    return STATUS_ORDER.filter((k) => m.has(k)).map((key) => ({ key, count: m.get(key)! }));
  }, [status]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return status.filter((r) => (!facet || r.status === facet)
      && (!s || `${r.person} ${r.topic} ${r.department} ${r.designation} ${r.region} ${r.doc_no ?? ''}`.toLowerCase().includes(s)));
  }, [status, q, facet]);

  const cancel = async (r: TrainingStatusRow) => {
    const reason = prompt(`Cancel "${r.topic}" for ${r.person}? Give the reason (kept on the record):`);
    if (!reason?.trim()) return;
    const res = await cancelTraining(r.id, reason);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not cancel.' }); return; }
    setMsg({ tone: 'ok', text: 'Cancelled.' }); await load();
  };

  const COLS: Column<TrainingStatusRow & Record<string, unknown>>[] = [
    { key: 'person', header: 'Person', width: 170,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const p = byId.get(r.dir_id); if (p) setPerson(p); }}>{r.person}</a> },
    { key: 'department', header: 'Department', width: 120 },
    { key: 'designation', header: 'Designation', width: 140 },
    { key: 'topic', header: 'Topic / document', width: 280 },
    { key: 'assigned_at', header: 'Assigned', width: 110, wrap: false, render: (r) => formatDay(r.assigned_at) },
    { key: 'due_date', header: 'Due', width: 110, wrap: false, render: (r) => (r.due_date ? formatDay(r.due_date) : '') },
    { key: 'status', header: 'Status', width: 140, wrap: false,
      render: (r) => <span className={`badge ${r.status === 'Completed' ? 'badge-success' : r.status === 'Pending' || r.status === 'Cancelled' ? 'badge-neutral' : 'badge-danger'}`}>{r.status}</span> },
    { key: 'completed_at', header: 'Completed', width: 110, wrap: false, render: (r) => (r.completed_at ? formatDay(r.completed_at) : '') },
    ...(mayManage ? [{ key: '_x', header: '', width: 90, sortable: false,
      render: (r: TrainingStatusRow) => (r.status !== 'Completed' && r.status !== 'Cancelled'
        ? <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); void cancel(r); }}>Cancel</button> : null) } as Column<TrainingStatusRow & Record<string, unknown>>] : []),
  ];

  // ---- assign ----------------------------------------------------------------
  const [assign, setAssign] = useState<{ docId: string; topic: string; due: string; audience: Audience } | null>(null);
  const doAssign = async () => {
    if (!assign) return;
    const doc = assign.docId ? docById.get(Number(assign.docId)) : undefined;
    const topic = doc ? docLabel(doc) : assign.topic.trim();
    if (!topic) { setMsg({ tone: 'error', text: 'Choose a QMS document or type the topic.' }); return; }
    const ids = audienceIds(dir, assign.audience);
    if (!ids.length) { setMsg({ tone: 'error', text: 'Choose who is to be trained.' }); return; }
    setBusy(true);
    const r = await assignTraining(ids, { document_id: doc?.id ?? null, topic, due_date: assign.due || null, assigned_by_name: user?.fullName || user?.email || '' });
    setBusy(false);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error ?? 'Could not assign.' }); return; }
    setAssign(null);
    setMsg({ tone: 'ok', text: `Assigned to ${r.created} ${r.created === 1 ? 'person' : 'people'}${ids.length > r.created ? ` (${ids.length - r.created} already had it)` : ''}.` });
    await load();
  };

  // ---- sessions ----------------------------------------------------------------
  type Att = AttendeeInput & { name: string };
  const [sess, setSess] = useState<(Omit<SessionRow, 'id'> & { id?: number; docId: string }) | null>(null);
  const [att, setAtt] = useState<Att[]>([]);
  const [addAud, setAddAud] = useState<Audience>(EMPTY_AUDIENCE);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const newSession = () => {
    setSess({ topic: '', document_id: null, docId: '', session_date: todayLocal(), trainer: user?.fullName ?? '', method: 'Classroom', duration_hours: null, notes: '', attachments: [] });
    setAtt([]); setAddAud(EMPTY_AUDIENCE);
  };
  const openSession = async (s: SessionRow) => {
    setSess({ ...s, docId: s.document_id ? String(s.document_id) : '' });
    setAddAud(EMPTY_AUDIENCE);
    try {
      const a = await listAttendance(s.id);
      setAtt(a.map((x) => ({ dir_id: x.dir_id, attended: x.attended, assessment: x.assessment, score: x.score, remarks: x.remarks, name: byId.get(x.dir_id)?.name ?? `#${x.dir_id}` })));
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
  };
  const addAttendees = () => {
    const have = new Set(att.map((a) => a.dir_id));
    const add = audienceIds(dir, addAud).filter((id) => !have.has(id))
      .map((id) => ({ dir_id: id, attended: true, assessment: '' as const, score: null, remarks: '', name: byId.get(id)?.name ?? '' }));
    setAtt((a) => [...a, ...add].sort((x, y) => x.name.localeCompare(y.name)));
    setAddAud(EMPTY_AUDIENCE);
  };
  const setA = (i: number, p: Partial<Att>) => setAtt((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const uploadEvidence = async (files: FileList | null) => {
    if (!files?.length || !sess) return;
    setUploading(true);
    const added: SessionRow['attachments'] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) { setMsg({ tone: 'error', text: `${f.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }); continue; }
      const r = await uploadToDrive(f, `Training - ${sess.topic || 'session'} - ${sess.session_date}`);
      if (r.ok && r.url) added.push({ name: f.name, url: r.url, at: new Date().toISOString(), by: user?.fullName || user?.email || '' });
      else setMsg({ tone: 'error', text: `${f.name}: ${r.error ?? 'upload failed'}` });
    }
    setUploading(false);
    setSess((s) => s && ({ ...s, attachments: [...s.attachments, ...added] }));
  };
  const doSaveSession = async () => {
    if (!sess) return;
    const doc = sess.docId ? docById.get(Number(sess.docId)) : undefined;
    const topic = sess.topic.trim() || (doc ? docLabel(doc) : '');
    if (!topic) { setMsg({ tone: 'error', text: 'Give the topic, or choose the QMS document.' }); return; }
    if (!sess.session_date) { setMsg({ tone: 'error', text: 'Give the session date.' }); return; }
    if (!att.length) { setMsg({ tone: 'error', text: 'Add the attendees.' }); return; }
    setBusy(true);
    const r = await saveSession({ ...sess, topic, document_id: doc?.id ?? null },
      att.map(({ name: _n, ...a }) => ({ ...a, score: a.score == null || Number.isNaN(Number(a.score)) ? null : Number(a.score) })));
    setBusy(false);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error ?? 'Could not save.' }); return; }
    setSess(null); setMsg({ tone: 'ok', text: `Session saved with ${att.length} attendee${att.length === 1 ? '' : 's'}.` });
    await load();
  };

  const SCOLS: Column<SessionRow & Record<string, unknown>>[] = [
    { key: 'session_date', header: 'Date', width: 110, wrap: false, render: (r) => formatDay(r.session_date) },
    { key: 'topic', header: 'Topic', width: 300 },
    { key: 'trainer', header: 'Trainer', width: 150 },
    { key: 'method', header: 'Method', width: 130 },
    { key: 'attachments', header: 'Evidence', width: 160, sortable: false,
      render: (r) => (r.attachments ?? []).map((a) => <div key={a.url}><a href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{a.name || 'file'}</a></div>) },
  ];

  const docOptions = docs.map((d) => ({ value: String(d.id), label: docLabel(d) }));
  const names = useMemo(() => dir.map((d) => d.name).filter(Boolean).sort(), [dir]);

  return (
    <div>
      <PageHeader title="Training" icon="🎓" onRefresh={() => void load()} refreshing={busy}
        subtitle="Who must be trained on what, sessions with bulk attendance and assessment, and every person's past training."
        count={tab === 'assignments' ? visible.length : sessions.length}
        actions={mayManage && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" onClick={() => setAssign({ docId: '', topic: '', due: '', audience: EMPTY_AUDIENCE })}>＋ Assign training</button>
            <button className="btn btn-primary" onClick={newSession}>＋ Record session</button>
          </div>
        )} />
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`}><span>{msg.text}</span><button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button></div>}

      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <button className={`btn btn-sm ${tab === 'assignments' ? 'btn-primary' : ''}`} onClick={() => setTab('assignments')}>Assignments ({status.length})</button>
        <button className={`btn btn-sm ${tab === 'sessions' ? 'btn-primary' : ''}`} onClick={() => setTab('sessions')}>Sessions ({sessions.length})</button>
      </div>

      {tab === 'assignments' ? (
        <DataTable<TrainingStatusRow & Record<string, unknown>>
          columns={COLS} rows={visible as (TrainingStatusRow & Record<string, unknown>)[]} getRowId={(r) => String(r.id)}
          storageKey="trainingAssignments" emptyText={busy ? 'Loading…' : 'No training assigned that you may see.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Person, topic, department, document…" />
              <FacetChips options={facets} value={facet} onChange={setFacet} more={false} />
              <div className="spacer" />
              {visible.length > 0 && <button className="btn btn-sm" onClick={() => csvExport('training-assignments.csv',
                COLS.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })),
                visible as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Export CSV</button>}
            </Toolbar>
          } />
      ) : (
        <DataTable<SessionRow & Record<string, unknown>>
          columns={SCOLS} rows={sessions as (SessionRow & Record<string, unknown>)[]} getRowId={(r) => String(r.id)}
          onRowClick={mayManage ? (r) => void openSession(r) : undefined}
          storageKey="trainingSessions" emptyText={busy ? 'Loading…' : 'No sessions recorded.'} />
      )}

      {assign && (
        <Drawer open onClose={() => setAssign(null)} title="Assign training" width={720}>
          <div className="rep-form">
            <label className="field"><span className="field-label">QMS document</span>
              <SelectPicker value={assign.docId} onChange={(v) => setAssign({ ...assign, docId: v })} placeholder="— choose, or type a topic below —" options={docOptions} /></label>
            {!assign.docId && (
              <label className="field"><span className="field-label">…or a topic</span>
                <input className="input" value={assign.topic} onChange={(e) => setAssign({ ...assign, topic: e.target.value })} placeholder="e.g. ESD handling" /></label>
            )}
            <label className="field"><span className="field-label">Due date (optional)</span>
              <input className="input" type="date" value={assign.due} onChange={(e) => setAssign({ ...assign, due: e.target.value })} /></label>
            <div className="field"><span className="field-label">Who is to be trained</span>
              <AudiencePicker dir={dir} departments={departments} value={assign.audience} onChange={(a) => setAssign({ ...assign, audience: a })} /></div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" disabled={busy || audienceIsEmpty(assign.audience)} onClick={() => void doAssign()}>Assign</button>
              <button className="btn" onClick={() => setAssign(null)}>Cancel</button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Someone who already has this training assigned is skipped, not assigned twice.</div>
          </div>
        </Drawer>
      )}

      {sess && (
        <Drawer open onClose={() => setSess(null)} title={sess.id ? 'Training session' : 'Record a training session'} width={860}>
          <div className="rep-form">
            <div className="rep-grid">
              <label className="rep-field"><span className="field-label">QMS document</span>
                <SelectPicker value={sess.docId} onChange={(v) => setSess({ ...sess, docId: v })} placeholder="— none —" options={docOptions} /></label>
              <label className="rep-field"><span className="field-label">Topic {sess.docId ? '(blank = the document)' : '*'}</span>
                <input className="input" value={sess.topic} onChange={(e) => setSess({ ...sess, topic: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Date *</span>
                <input className="input" type="date" value={sess.session_date} onChange={(e) => setSess({ ...sess, session_date: e.target.value })} /></label>
              <label className="rep-field"><span className="field-label">Trainer</span>
                <PickList value={sess.trainer} options={names} allowFreeText onPick={(v) => setSess({ ...sess, trainer: v })} placeholder="Trainer" /></label>
              <label className="rep-field"><span className="field-label">Method</span>
                <SelectPicker value={sess.method} onChange={(v) => setSess({ ...sess, method: v })} options={METHODS} /></label>
              <label className="rep-field"><span className="field-label">Duration (hours)</span>
                <input className="input" type="number" min={0} step={0.5} value={sess.duration_hours ?? ''}
                  onChange={(e) => setSess({ ...sess, duration_hours: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            </div>
            <input className="input" style={{ width: '100%', marginTop: 6 }} placeholder="Notes" value={sess.notes} onChange={(e) => setSess({ ...sess, notes: e.target.value })} />

            <section className="rep-sec">
              <div className="rep-sec-title">Attendance sheet / certificates</div>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => void uploadEvidence(e.target.files)} />
              <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '⭱ Attach files'}</button>
              {sess.attachments.map((a) => <div key={a.url}><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></div>)}
            </section>

            <section className="rep-sec">
              <div className="rep-sec-title">Attendees ({att.length})</div>
              <AudiencePicker dir={dir} departments={departments} value={addAud} onChange={setAddAud} />
              <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={audienceIsEmpty(addAud)} onClick={addAttendees}>＋ Add these people</button>
              {att.length > 0 && (
                <div className="assoc-scroll" style={{ marginTop: 8 }}>
                  <table className="assoc-table">
                    <thead><tr><th>Name</th><th>Attended</th><th>Assessment</th><th>Score</th><th>Remarks</th><th /></tr></thead>
                    <tbody>
                      {att.map((a, i) => (
                        <tr key={a.dir_id}>
                          <td>{a.name}</td>
                          <td><input type="checkbox" checked={a.attended} onChange={(e) => setA(i, { attended: e.target.checked })} /></td>
                          <td style={{ minWidth: 120 }}><SelectPicker value={a.assessment} placeholder="— not assessed —"
                            onChange={(v) => setA(i, { assessment: (v || '') as AttendeeInput['assessment'] })} options={['Pass', 'Fail']} /></td>
                          <td><input className="input" style={{ width: 70 }} type="number" value={a.score ?? ''}
                            onChange={(e) => setA(i, { score: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                          <td><input className="input" value={a.remarks} onChange={(e) => setA(i, { remarks: e.target.value })} /></td>
                          <td>{!sess.id && <button className="btn btn-ghost btn-sm" onClick={() => setAtt((x) => x.filter((_, j) => j !== i))}>✕</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={busy || uploading} onClick={() => void doSaveSession()}>Save session</button>
              <button className="btn" onClick={() => setSess(null)}>Cancel</button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Attending without a Fail completes that person&rsquo;s assignment on this document (or topic). A Fail keeps it open until they pass.
            </div>
          </div>
        </Drawer>
      )}

      {person && (
        <Drawer open onClose={() => setPerson(null)} title={person.name} width={760}>
          <PersonProfile person={person} />
        </Drawer>
      )}
    </div>
  );
}

export default Training;
