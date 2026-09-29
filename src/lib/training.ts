import { getSupabase } from './supabase';
import { allRows } from './paging';

// ===========================================================================
// A PERSON'S PROFILE, ROLES & RESPONSIBILITIES AND TRAINING (0264).
//
// Who sees what is decided by the DATABASE (may_see_person: the person, their
// managers, users.manage, training.manage), so every read here returns only
// what the reader may see -- an empty answer is "nothing you may see", not
// proof that nothing exists.
// ===========================================================================

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Database not connected.');
  return c;
};
const msg = (e: { message?: string } | null) => e?.message ?? 'Unknown error';
type Res = { ok: boolean; error?: string };

// ---- profile ---------------------------------------------------------------
export interface PersonProfile { dir_id: number; employee_code: string; joining_date: string | null }
export async function getProfile(dirId: number): Promise<PersonProfile | null> {
  const { data, error } = await db().from('user_profile').select('dir_id,employee_code,joining_date').eq('dir_id', dirId).maybeSingle();
  if (error) throw new Error(msg(error));
  return data ? { dir_id: Number(data.dir_id), employee_code: String(data.employee_code ?? ''), joining_date: (data.joining_date as string) ?? null } : null;
}
export async function saveProfile(dirId: number, p: { employee_code: string; joining_date: string | null }): Promise<Res> {
  const { error } = await db().from('user_profile')
    .upsert({ dir_id: dirId, employee_code: p.employee_code.trim(), joining_date: p.joining_date || null }, { onConflict: 'dir_id' });
  if (!error) return { ok: true };
  return { ok: false, error: /user_profile_employee_code_uniq/.test(msg(error)) ? 'That Employee Code is already on another person.' : msg(error) };
}

// ---- roles & responsibilities ---------------------------------------------
export interface RRRow {
  id: number; dir_id: number; title: string; url: string; file_name: string;
  effective_from: string; effective_to: string | null; notes: string; uploaded_by_name: string; created_at: string;
}
export async function listRR(dirId: number): Promise<RRRow[]> {
  const { data, error } = await db().from('user_rr').select('*').eq('dir_id', dirId)
    .order('effective_from', { ascending: false }).order('id', { ascending: false });
  if (error) throw new Error(msg(error));
  return (data ?? []) as RRRow[];
}
/** A NEW R&R CLOSES THE ONE BEFORE IT -- done by the database (0264), so the
 *  previous period ends the day before this one's From. */
export async function addRR(r: Omit<RRRow, 'id' | 'created_at'>): Promise<Res> {
  const { error } = await db().from('user_rr').insert({ ...r, effective_to: r.effective_to || null });
  return error ? { ok: false, error: msg(error) } : { ok: true };
}
export async function updateRRPeriod(id: number, from: string, to: string | null): Promise<Res> {
  const { error } = await db().from('user_rr').update({ effective_from: from, effective_to: to || null }).eq('id', id);
  if (!error) return { ok: true };
  return { ok: false, error: /user_rr_period/.test(msg(error)) ? 'The period ends before it starts.' : msg(error) };
}

// ---- training ----------------------------------------------------------------
export interface TrainingStatusRow {
  id: number; dir_id: number; person: string; designation: string; department: string; region: string;
  document_id: number | null; doc_no: string | null; revision: string | null; topic: string;
  due_date: string | null; assigned_at: string; assigned_by_name: string; acknowledged_at: string | null;
  cancelled: boolean; cancel_reason: string; attended_on: string | null; status: string; completed_at: string | null;
}
export async function listTrainingStatus(dirId?: number): Promise<TrainingStatusRow[]> {
  return allRows<TrainingStatusRow>((a, b) => {
    let q = db().from('training_status').select('*').order('assigned_at', { ascending: false }).order('id', { ascending: false }).range(a, b);
    if (dirId != null) q = q.eq('dir_id', dirId);
    return q as never;
  }, 50000);
}

export interface TrainingHistoryRow {
  dir_id: number; source: string; trained_on: string | null; topic: string; document_id: number | null;
  doc_no: string | null; revision: string | null; trainer: string; method: string; attended: boolean;
  assessment: string; score: number | null; remarks: string; session_id: number | null;
  attachments: { name: string; url: string }[];
}
export async function listTrainingHistory(dirId: number): Promise<TrainingHistoryRow[]> {
  const { data, error } = await db().from('training_history').select('*').eq('dir_id', dirId)
    .order('trained_on', { ascending: false, nullsFirst: false }).limit(1000);
  if (error) throw new Error(msg(error));
  return (data ?? []) as TrainingHistoryRow[];
}

/** Assign one topic (a QMS document, or a free topic) to many people. ONE open
 *  item per person per document: someone already assigned is skipped, not
 *  doubled (the unique key, 0264). */
export async function assignTraining(
  dirIds: number[], t: { document_id: number | null; topic: string; due_date: string | null; assigned_by_name: string },
): Promise<{ ok: boolean; created: number; error?: string }> {
  if (!dirIds.length) return { ok: true, created: 0 };
  const rows = dirIds.map((id) => ({ dir_id: id, document_id: t.document_id, topic: t.topic.trim(), due_date: t.due_date || null, assigned_by_name: t.assigned_by_name }));
  const { data, error } = await db().from('training_assignments')
    .upsert(rows, { onConflict: 'dir_id,topic_key', ignoreDuplicates: true }).select('id');
  return error ? { ok: false, created: 0, error: msg(error) } : { ok: true, created: (data ?? []).length };
}
export async function cancelTraining(id: number, reason: string): Promise<Res> {
  const { data, error } = await db().from('training_assignments').update({ cancelled: true, cancel_reason: reason.trim() }).eq('id', id).select('id');
  if (error) return { ok: false, error: msg(error) };
  return (data ?? []).length ? { ok: true } : { ok: false, error: 'Not saved — this needs the Manage training permission.' };
}
/** The trainee's own "I have read and understood". */
export async function acknowledgeTraining(id: number): Promise<Res> {
  const { error } = await db().rpc('acknowledge_training', { p_id: id });
  return error ? { ok: false, error: msg(error) } : { ok: true };
}

export interface SessionRow {
  id: number; topic: string; document_id: number | null; session_date: string; trainer: string; method: string;
  duration_hours: number | null; notes: string; attachments: { name: string; url: string; at?: string; by?: string }[];
}
export async function listSessions(): Promise<SessionRow[]> {
  return allRows<SessionRow>((a, b) => db().from('training_sessions').select('*')
    .order('session_date', { ascending: false }).order('id', { ascending: false }).range(a, b) as never, 20000);
}
export interface AttendeeInput { dir_id: number; attended: boolean; assessment: '' | 'Pass' | 'Fail'; score: number | null; remarks: string }
export interface AttendanceRow extends AttendeeInput { id: number; session_id: number }
export async function listAttendance(sessionId: number): Promise<AttendanceRow[]> {
  const { data, error } = await db().from('training_attendance').select('*').eq('session_id', sessionId).order('id');
  if (error) throw new Error(msg(error));
  return (data ?? []) as AttendanceRow[];
}
/** A session and its attendees in one go (BULK training). A person already on
 *  the session has their line UPDATED, so re-saving a session corrects it. */
export async function saveSession(
  s: Omit<SessionRow, 'id'> & { id?: number }, attendees: AttendeeInput[],
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const c = db();
  const body = {
    topic: s.topic.trim(), document_id: s.document_id, session_date: s.session_date, trainer: s.trainer.trim(),
    method: s.method, duration_hours: s.duration_hours, notes: s.notes.trim(), attachments: s.attachments,
  };
  const r = s.id
    ? await c.from('training_sessions').update(body).eq('id', s.id).select('id').single()
    : await c.from('training_sessions').insert(body).select('id').single();
  if (r.error || !r.data) return { ok: false, error: r.error ? msg(r.error) : 'Not saved — this needs the Manage training permission.' };
  const id = Number(r.data.id);
  if (attendees.length) {
    const { error } = await c.from('training_attendance')
      .upsert(attendees.map((a) => ({ ...a, session_id: id })), { onConflict: 'session_id,dir_id' });
    if (error) return { ok: false, id, error: `The session was saved, but the attendees were not: ${msg(error)}` };
  }
  return { ok: true, id };
}

