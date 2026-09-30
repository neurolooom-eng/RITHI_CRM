import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DirectoryRow } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDay, formatDayTime, todayLocal } from '../../lib/dates';
import { uploadToDrive, MAX_UPLOAD_BYTES } from '../../lib/sheets';
import {
  getProfile, saveProfile, listRR, addRR, updateRRPeriod, listTrainingStatus, listTrainingHistory, acknowledgeTraining,
  type PersonProfile as Profile, type RRRow, type TrainingStatusRow, type TrainingHistoryRow,
} from '../../lib/training';
import { loadFailure } from '../../lib/dberror';

// ===========================================================================
// ONE PERSON: profile details, Roles & Responsibilities, training.
//
//   The user, 2026-09-30: "Give me a Provision to See the User's Details --
//   Profile Details. Joining Date, Reporting Manager, Employee Code, Mail ID,
//   Roles & Responsibilities" and "If a User is given Training on a Specific
//   topic then it should list all Past Training details."
//
// Shown on User Master (a row's detail), on My Profile (yourself and your
// team) and on the Training screen. WHO SEES IT is the database's decision
// (0264 may_see_person): the person, their managers, users.manage and
// training.manage. Editing: profile by users.manage; R&R by users.manage or
// training.manage; a trainee acknowledges their own training here.
// ===========================================================================

const today = todayLocal;

export function PersonProfile({ person }: { person: DirectoryRow }) {
  const { user, can } = useAuth();
  const mayEditProfile = can('users.manage.details');
  const mayEditRR = can('users.manage.details') || can('training.manage');
  const isMe = !!user?.email && [person.email, person.gmail].some((e) => e && e.toLowerCase() === user.email.toLowerCase());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rr, setRR] = useState<RRRow[]>([]);
  const [assigned, setAssigned] = useState<TrainingStatusRow[]>([]);
  const [history, setHistory] = useState<TrainingHistoryRow[]>([]);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    setErr('');
    try {
      const [p, r, a, h] = await Promise.all([getProfile(person.id), listRR(person.id), listTrainingStatus(person.id), listTrainingHistory(person.id)]);
      setProfile(p); setRR(r); setAssigned(a); setHistory(h);
    } catch (e) {
      setErr(loadFailure(e, {
        tables: ['user_profile', 'user_rr', 'training_status', 'training_history'],
        hint: 'Profiles and training are not on the project yet — run supabase/apply/training.sql.',
      }));
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [person.id]);

  // ---- profile edit --------------------------------------------------------
  const [pEdit, setPEdit] = useState<{ employee_code: string; joining_date: string } | null>(null);
  const saveP = async () => {
    if (!pEdit) return;
    const r = await saveProfile(person.id, { employee_code: pEdit.employee_code, joining_date: pEdit.joining_date || null });
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    setPEdit(null); setNote('Profile saved.'); await load();
  };

  // ---- new R&R -------------------------------------------------------------
  const [rrNew, setRRNew] = useState<{ title: string; url: string; file_name: string; from: string; to: string; notes: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFile = async (f: File | null) => {
    if (!f || !rrNew) return;
    if (f.size > MAX_UPLOAD_BYTES) { setErr(`${f.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`); return; }
    setUploading(true); setNote(`Uploading ${f.name} to Drive…`);
    const res = await uploadToDrive(f, `R&R - ${person.name}`);
    setUploading(false);
    if (!res.ok || !res.url) { setErr(res.error ?? 'Upload failed.'); setNote(''); return; }
    setRRNew((d) => d && ({ ...d, url: res.url!, file_name: f.name }));
    setNote(`${f.name} stored in Drive.`);
  };
  const openRR = rr.find((r) => !r.effective_to);
  const saveRR = async () => {
    if (!rrNew) return;
    if (!rrNew.url.trim()) { setErr('Upload the Roles & Responsibilities document, or paste its link.'); return; }
    if (!rrNew.from) { setErr('Give the date it takes effect (From).'); return; }
    if (rrNew.to && rrNew.to < rrNew.from) { setErr('To is before From.'); return; }
    const r = await addRR({
      dir_id: person.id, title: rrNew.title.trim() || 'Roles & Responsibilities', url: rrNew.url.trim(),
      file_name: rrNew.file_name, effective_from: rrNew.from, effective_to: rrNew.to || null, notes: rrNew.notes.trim(),
      uploaded_by_name: user?.fullName || user?.email || '',
    });
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    setRRNew(null); setNote('Roles & Responsibilities added.'); await load();
  };
  const [period, setPeriod] = useState<{ id: number; from: string; to: string } | null>(null);
  const savePeriod = async () => {
    if (!period) return;
    const r = await updateRRPeriod(period.id, period.from, period.to || null);
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    setPeriod(null); setNote('Period updated.'); await load();
  };

  const ack = async (a: TrainingStatusRow) => {
    if (!confirm(`Confirm you have read and understood “${a.topic}”?`)) return;
    const r = await acknowledgeTraining(a.id);
    if (!r.ok) { setErr(r.error ?? 'Could not record it.'); return; }
    setNote('Recorded: read and understood.'); await load();
  };

  // PAST TRAINING, GROUPED BY TOPIC -- "list all Past Training details" of a topic.
  const byTopic = useMemo(() => {
    const m = new Map<string, TrainingHistoryRow[]>();
    history.forEach((h) => {
      const k = h.doc_no ? `${h.doc_no}${h.revision ? ` Rev ${h.revision}` : ''}` : h.topic;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    });
    return [...m.entries()];
  }, [history]);

  const open = assigned.filter((a) => a.status !== 'Completed' && a.status !== 'Cancelled');
  const rows: [string, string][] = [
    ['Name', person.name || '—'],
    ['Employee Code', profile?.employee_code || '—'],
    ['Joining Date', profile?.joining_date ? formatDay(profile.joining_date) : '—'],
    ['Department', person.department || '—'],
    ['Designation', person.designation || '—'],
    ['Reporting Manager', person.reporting_manager || '—'],
    ['Regional Manager', person.regional_manager || '—'],
    ['Mail ID', [person.email, person.gmail].filter(Boolean).join(' · ') || '—'],
    ['Region', person.region || '—'],
    ['Current R&R', openRR ? `${openRR.title} — from ${formatDay(openRR.effective_from)}` : '—'],
  ];

  return (
    <div className="rep-form">
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}
      {note && !err && <div className="sheet-banner sheet-banner-ok"><span>{note}</span><button className="btn btn-ghost btn-sm" onClick={() => setNote('')}>✕</button></div>}

      <section className="rep-sec">
        <div className="rep-sec-title">
          Profile details
          {mayEditProfile && !pEdit && (
            <button className="btn btn-sm" style={{ marginLeft: 8 }}
              onClick={() => setPEdit({ employee_code: profile?.employee_code ?? '', joining_date: profile?.joining_date ?? '' })}>✎ Edit</button>
          )}
        </div>
        {pEdit && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
            <label className="field"><span className="field-label">Employee Code</span>
              <input className="input" value={pEdit.employee_code} onChange={(e) => setPEdit({ ...pEdit, employee_code: e.target.value })} /></label>
            <label className="field"><span className="field-label">Joining Date</span>
              <input className="input" type="date" value={pEdit.joining_date} onChange={(e) => setPEdit({ ...pEdit, joining_date: e.target.value })} /></label>
            <button className="btn btn-primary btn-sm" onClick={() => void saveP()}>Save</button>
            <button className="btn btn-sm" onClick={() => setPEdit(null)}>Cancel</button>
            <span className="muted" style={{ fontSize: 12 }}>Department, designation and managers are edited on the User Master row.</span>
          </div>
        )}
        <div className="assoc-scroll">
          <table className="assoc-table" style={{ minWidth: 320 }}>
            <tbody>{rows.map(([k, v]) => <tr key={k}><td style={{ width: 160, color: 'var(--muted)' }}>{k}</td><td>{v}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">
          Roles &amp; Responsibilities <span className="muted">({rr.length})</span>
          {mayEditRR && !rrNew && (
            <button className="btn btn-sm" style={{ marginLeft: 8 }}
              onClick={() => setRRNew({ title: 'Roles & Responsibilities', url: '', file_name: '', from: today(), to: '', notes: '' })}>＋ Add new R&amp;R</button>
          )}
        </div>
        {rrNew && (
          <div className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="field" style={{ minWidth: 220 }}><span className="field-label">Title</span>
                <input className="input" value={rrNew.title} onChange={(e) => setRRNew({ ...rrNew, title: e.target.value })} /></label>
              <label className="field"><span className="field-label">Effective From *</span>
                <input className="input" type="date" value={rrNew.from} onChange={(e) => setRRNew({ ...rrNew, from: e.target.value })} /></label>
              <label className="field"><span className="field-label">To (blank = current)</span>
                <input className="input" type="date" value={rrNew.to} onChange={(e) => setRRNew({ ...rrNew, to: e.target.value })} /></label>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
              <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '⭱ Upload document'}</button>
              <span className="muted">or paste the Drive link</span>
              <input className="input" style={{ minWidth: 260, flex: 1 }} placeholder="https://drive.google.com/…" value={rrNew.url}
                onChange={(e) => setRRNew({ ...rrNew, url: e.target.value })} />
            </div>
            <input className="input" style={{ marginTop: 8, width: '100%' }} placeholder="Notes (optional)" value={rrNew.notes}
              onChange={(e) => setRRNew({ ...rrNew, notes: e.target.value })} />
            <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
              {openRR
                ? <>Saving this ends the current one (from {formatDay(openRR.effective_from)}) on the day before the new From. You can change either period afterwards.</>
                : 'This becomes the current Roles & Responsibilities.'}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => void saveRR()}>Save R&amp;R</button>
              <button className="btn btn-sm" onClick={() => setRRNew(null)}>Cancel</button>
            </div>
          </div>
        )}
        {rr.length === 0 ? <div className="muted">None recorded.</div> : (
          <div className="assoc-scroll">
            <table className="assoc-table">
              <thead><tr><th>Document</th><th>From</th><th>To</th><th>Added by</th>{mayEditRR && <th />}</tr></thead>
              <tbody>
                {rr.map((r) => (
                  <tr key={r.id}>
                    <td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{!r.effective_to && <span className="badge badge-success" style={{ marginLeft: 6 }}>Current</span>}
                      {r.notes && <div className="muted" style={{ fontSize: 12 }}>{r.notes}</div>}</td>
                    {period?.id === r.id ? (
                      <>
                        <td><input className="input" type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></td>
                        <td><input className="input" type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></td>
                        <td />
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => void savePeriod()}>Save</button>{' '}
                          <button className="btn btn-sm" onClick={() => setPeriod(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{formatDay(r.effective_from)}</td>
                        <td>{r.effective_to ? formatDay(r.effective_to) : <span className="muted">current</span>}</td>
                        <td>{r.uploaded_by_name || '—'}<div className="muted" style={{ fontSize: 11 }}>{formatDayTime(r.created_at)}</div></td>
                        {mayEditRR && <td><button className="btn btn-sm" title="Change the period"
                          onClick={() => setPeriod({ id: r.id, from: r.effective_from, to: r.effective_to ?? '' })}>✎ Period</button></td>}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Training to do <span className="muted">({open.length})</span></div>
        {open.length === 0 ? <div className="muted">Nothing open.</div> : (
          <div className="assoc-scroll">
            <table className="assoc-table">
              <thead><tr><th>Topic</th><th>Assigned</th><th>Due</th><th>Status</th>{isMe && <th />}</tr></thead>
              <tbody>
                {open.map((a) => (
                  <tr key={a.id}>
                    <td>{a.topic}</td>
                    <td>{formatDay(a.assigned_at)}</td>
                    <td>{a.due_date ? formatDay(a.due_date) : '—'}</td>
                    <td><span className={`badge ${a.status === 'Pending' ? 'badge-neutral' : 'badge-danger'}`}>{a.status}</span></td>
                    {isMe && <td><button className="btn btn-sm btn-primary" onClick={() => void ack(a)}>✓ Read &amp; understood</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Past training <span className="muted">({history.length})</span></div>
        {byTopic.length === 0 ? <div className="muted">None recorded.</div> : (
          <div className="assoc-scroll">
            <table className="assoc-table">
              <thead><tr><th>Date</th><th>How</th><th>Trainer</th><th>Assessment</th><th>Evidence</th></tr></thead>
              <tbody>
                {byTopic.map(([topic, list]) => (
                  <Fragment key={topic}>
                    <tr><td colSpan={5} style={{ fontWeight: 650, background: 'var(--surface-2, transparent)' }}>{topic} <span className="muted">({list.length})</span></td></tr>
                    {list.map((h, i) => (
                      <tr key={`${topic}-${i}`}>
                        <td>{h.trained_on ? formatDay(h.trained_on) : '—'}</td>
                        <td>{h.source === 'Session' ? (h.method || 'Session') : 'Read & understood'}{h.source === 'Session' && !h.attended ? ' (absent)' : ''}</td>
                        <td>{h.trainer || '—'}</td>
                        <td>{h.assessment ? `${h.assessment}${h.score != null ? ` (${h.score})` : ''}` : '—'}</td>
                        <td>{(h.attachments ?? []).map((a) => <div key={a.url}><a href={a.url} target="_blank" rel="noreferrer">{a.name || 'file'}</a></div>)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
