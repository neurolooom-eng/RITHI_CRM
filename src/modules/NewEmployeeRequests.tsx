// ===========================================================================
// NEW EMPLOYEE REQUESTS (0449; the user, 2026-10-21: "Add a Place Holder for
// Reporting Managers to add New Employees, It should go for Approval to the
// Admins, NSM, Technical Support. If any one of these approve then It should
// get added to the User Master. This is an additional Route for User Creation
// and the Existing route stays intact").
//
// Settled with the user the same day:
//   * the request carries every User Master field; the Reporting Manager is
//     the requester, stamped by the database; the role and tags are the
//     approver's;
//   * an approver corrects what they need to, then approves -- or rejects with
//     a reason the requester sees. The first approval wins;
//   * approving also creates the sign-in login, with a temporary password
//     shown here once. The database records that it was made, never the
//     password; the person's profile is built from their User Master row on
//     first sign-in, as for everyone else;
//   * the screen and its two keys are granted on Roles & Permissions by the
//     user ("No, I will grant it myself").
//
// The training request a request is also to raise waits for its format.
// ===========================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Drawer } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { TagInput } from '../components/ui/TagInput';
import { useAuth } from '../lib/auth';
import { rolesWith } from '../lib/rbac';
import { useMaster } from '../lib/masters';
import { formatDayTime } from '../lib/dates';
import { logAudit } from '../lib/audit';
import { generatePassword } from '../lib/password';
import { trainingRequestForEmployee, type TrainingRequest } from '../lib/training';
import { TRAINING_METHODOLOGY, TRAINING_RISKS, type TrainingRisk } from '../lib/trainingForm';
import {
  supabaseConfigured, listEmployeeRequests, raiseEmployeeRequest, approveEmployeeRequest, rejectEmployeeRequest,
  recordEmployeeRequestLogin, sbSignUpLogin, listDirectory,
  EMPLOYEE_REQUEST_FIELDS, type EmployeeRequest, type EmployeeRequestDraft, type DirectoryRow,
} from '../lib/supabase';
import './fieldcalls.css';

type StatusFilter = 'Pending' | 'Approved' | 'Rejected' | 'all';
const BLANK: EmployeeRequestDraft = Object.fromEntries(EMPLOYEE_REQUEST_FIELDS.map((k) => [k, ''])) as EmployeeRequestDraft;

// What the approver may set on top of the request, and the reporting manager,
// which the approver may correct though the requester could not type it.
interface ApproverDraft extends EmployeeRequestDraft { reporting_manager: string; role: string; tags: string[] }

const STATUS_TONE: Record<string, string> = { Pending: '#b45309', Approved: '#2e7d32', Rejected: '#b91c1c' };
const StatusChip = ({ s }: { s: string }) => (
  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, background: STATUS_TONE[s] ?? '#555', color: '#fff', fontWeight: 700, fontSize: 12 }}>{s}</span>
);

/** The login's address: the Air Liquide ID where there is one, else the Gmail. */
const loginEmailOf = (r: { email?: string; gmail?: string }) => (r.email || r.gmail || '').trim().toLowerCase();

export function NewEmployeeRequests() {
  const { user, can, rolePerms } = useAuth();
  const live = supabaseConfigured();
  const mayRequest = live && can('users.request');
  const mayApprove = live && can('users.request.approve');
  const mayAssignRole = live && can('users.manage.access');
  const [rows, setRows] = useState<EmployeeRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [status, setStatus] = useState<StatusFilter>('Pending');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<EmployeeRequestDraft | null>(null);
  const [open, setOpen] = useState<EmployeeRequest | null>(null);
  const [edit, setEdit] = useState<ApproverDraft | null>(null);
  const [reason, setReason] = useState('');
  // THE TRAINING REQUEST THIS REQUEST RAISED (0453), read when it is opened.
  const [training, setTraining] = useState<TrainingRequest | null | undefined>(undefined);
  useEffect(() => {
    if (!open) { setTraining(undefined); return; }
    let alive = true;
    void trainingRequestForEmployee(open.id).then((t) => { if (alive) setTraining(t); }).catch(() => { if (alive) setTraining(null); });
    return () => { alive = false; };
  }, [open]);
  // THE TEMPORARY PASSWORD, shown once to the approver who made the login.
  const [issued, setIssued] = useState<{ email: string; password: string; needsConfirm?: boolean } | null>(null);
  const [dir, setDir] = useState<DirectoryRow[]>([]);
  const departments = useMaster('department', [], live).values;
  const roleOptions = useMemo(() => rolesWith(Object.keys(rolePerms ?? {})).map((r) => ({ value: r.key, label: r.label })), [rolePerms]);

  const load = useCallback(async () => {
    if (!live) return;
    setErr('');
    try {
      const next = await listEmployeeRequests();
      setRows(next);
      // An open request shows what it now is, not what it was when opened.
      setOpen((cur) => (cur ? next.find((x) => x.id === cur.id) ?? cur : cur));
    }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [live]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (live) void listDirectory().then(setDir).catch(() => setDir([])); }, [live]);

  // Names and regions already on the User Master -- suggestions, as on the
  // User Master's own form: the reporting tree is built from those names.
  const names = useMemo(() => [...new Set(dir.map((d) => d.name.trim()).filter(Boolean))].sort(), [dir]);
  const regions = useMemo(() => [...new Set(dir.map((d) => d.region.trim()).filter(Boolean))].sort(), [dir]);

  const all = rows ?? [];
  const shown = status === 'all' ? all : all.filter((r) => r.status === status);
  const count = (s: StatusFilter) => (s === 'all' ? all.length : all.filter((r) => r.status === s).length);

  const openRow = (r: EmployeeRequest) => {
    setOpen(r); setReason(''); setIssued(null);
    setEdit(r.status === 'Pending' && mayApprove ? {
      ...(Object.fromEntries(EMPLOYEE_REQUEST_FIELDS.map((k) => [k, String(r[k] ?? '')])) as EmployeeRequestDraft),
      reporting_manager: r.reporting_manager, role: '', tags: [],
    } : null);
  };

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    const res = await raiseEmployeeRequest(draft);
    logAudit({ action: 'users.request', target: draft.name, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not send the request.' }); return; }
    setDraft(null);
    setMsg({ tone: 'ok', text: `${res.req?.req_no ?? 'The request'} for ${draft.name.trim()} has gone to Admin, NSM and Technical Support for approval.` });
    void load();
  };

  // THE LOGIN, after the approval (or retried on an approved request whose
  // login could not be made). Recorded either way, never with the password.
  const makeLogin = async (r: { id: number; name: string; email: string; gmail: string }) => {
    const email = loginEmailOf(r);
    const password = generatePassword();
    const res = await sbSignUpLogin({ email, fullName: r.name, password });
    logAudit({ action: 'users.request.login', target: email, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    await recordEmployeeRequestLogin(r.id, email, res.ok ? '' : (res.error ?? 'The login could not be made.'));
    if (res.ok) { setIssued({ email, password, needsConfirm: res.needsConfirm }); return ''; }
    return res.error ?? 'The login could not be made.';
  };

  const approve = async () => {
    if (!open || !edit) return;
    if (!confirm(`Add ${edit.name.trim()} to the User Master and create their login?`)) return;
    setBusy(true);
    const res = await approveEmployeeRequest(open.id, { ...edit, tags: edit.tags });
    logAudit({ action: 'users.request.approve', target: open.req_no, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { name: edit.name, role: edit.role } });
    if (!res.ok) { setBusy(false); setMsg({ tone: 'error', text: res.error ?? 'Could not approve.' }); return; }
    const loginErr = await makeLogin({ id: open.id, name: edit.name, email: edit.email, gmail: edit.gmail });
    setBusy(false);
    setEdit(null);
    setMsg(loginErr
      ? { tone: 'error', text: `${edit.name.trim()} is on the User Master, but the login was not made: ${loginErr} Open the request to try again.` }
      : { tone: 'ok', text: `${edit.name.trim()} is on the User Master and has a login. Give them the temporary password below.` });
    await load();
  };

  const retryLogin = async (r: EmployeeRequest) => {
    setBusy(true);
    const e = await makeLogin({ id: r.id, name: r.name, email: r.email, gmail: r.gmail });
    setBusy(false);
    setMsg(e ? { tone: 'error', text: `The login was not made: ${e}` } : { tone: 'ok', text: `Login made for ${loginEmailOf(r)}.` });
    await load();
  };

  const reject = async () => {
    if (!open) return;
    setBusy(true);
    const res = await rejectEmployeeRequest(open.id, reason);
    logAudit({ action: 'users.request.reject', target: open.req_no, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not reject.' }); return; }
    setOpen(null); setEdit(null);
    setMsg({ tone: 'ok', text: `${open.req_no} rejected; ${open.requested_by_name || 'the requester'} is told why.` });
    await load();
  };

  const columns: Column<EmployeeRequest>[] = [
    { key: 'req_no', header: 'Request', width: 100, wrap: false },
    { key: 'status', header: 'Status', width: 100, wrap: false, render: (r) => <StatusChip s={r.status} /> },
    { key: 'name', header: 'Name', width: 180 },
    { key: 'designation', header: 'Designation', width: 150 },
    { key: 'region', header: 'Region', width: 90 },
    { key: 'reporting_manager', header: 'Reporting Manager', width: 160 },
    { key: 'requested_by_name', header: 'Asked by', width: 150 },
    { key: 'created_at', header: 'Asked on', width: 170, wrap: false, render: (r) => formatDayTime(r.created_at) },
    { key: 'decided_by_name', header: 'Decided by', width: 150 },
    { key: 'decided_at', header: 'Decided on', width: 170, wrap: false, render: (r) => formatDayTime(r.decided_at) },
    { key: 'login_created_at', header: 'Login', width: 120, wrap: false,
      render: (r) => (r.status !== 'Approved' ? '' : r.login_created_at ? 'Made' : r.login_error ? 'Not made' : '—') },
  ];

  const issuedBanner = issued && (
    <div className="sheet-banner sheet-banner-info">
      <span>
        Login for <b>{issued.email}</b> — temporary password <b style={{ fontFamily: 'monospace', fontSize: 15 }}>{issued.password}</b>{' '}
        <button className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(issued.password)}>Copy</button>{' '}
        It is shown once and not kept. They sign in with it and can change it under My Profile.
        {issued.needsConfirm && <> “Confirm email” is ON in Supabase, so they must confirm the email first.</>}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => setIssued(null)}>✕</button>
    </div>
  );

  if (!live) return (<div><PageHeader title="New Employee Requests" icon="🧑‍💼" /><div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings.</span></div></div>);

  return (
    <div>
      <PageHeader title="New Employee Requests" icon="🧑‍💼" count={shown.length}
        subtitle="A Reporting or Regional Manager asks for a new employee; Admin, NSM or Technical Support approves them into the User Master and makes their login. The User Master's own Add user still works as before."
        actions={mayRequest ? <button className="btn btn-primary" onClick={() => setDraft({ ...BLANK })} disabled={busy}>＋ Request a new employee</button> : undefined}
        onRefresh={() => void load()} />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!open && issuedBanner}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not read the requests: {err}</span></div>}
      {!mayRequest && !mayApprove && (
        <p className="muted">You can see the requests you raised. Raising one needs “Request a new employee”, and approving one “Approve new-employee requests”, on Roles &amp; Permissions.</p>
      )}

      <div className="pm-up-row" style={{ margin: '10px 0', flexWrap: 'wrap', gap: 8 }}>
        {(['Pending', 'Approved', 'Rejected', 'all'] as StatusFilter[]).map((k) => (
          <button key={k} className={`btn btn-sm${status === k ? ' btn-primary' : ''}`} onClick={() => setStatus(k)}>
            {k === 'all' ? 'All' : k} ({count(k)})
          </button>
        ))}
      </div>

      {rows === null && !err ? <p className="muted">Reading the requests…</p> : (
        <DataTable<EmployeeRequest> columns={columns} rows={shown} getRowId={(r) => String(r.id)}
          onRowClick={openRow} storageKey="newEmployeeRequests"
          emptyText={status === 'Pending' ? 'No request is waiting.' : 'Nothing here.'} />
      )}

      {/* RAISE A REQUEST */}
      <Drawer open={!!draft} onClose={() => setDraft(null)} title="Request a new employee" storeKey="newEmployeeRequest">
        {draft && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Goes to Admin, NSM and Technical Support. The first of them to approve adds the person to the User Master
              and makes their login. You are recorded as their <b>Reporting Manager</b>, as the User Master names you.
            </p>
            <PersonFields value={draft} onChange={(v) => setDraft({ ...draft, ...v })} names={names} regions={regions} departments={departments}
              reportingManager={user?.fullName || user?.email || ''} />
            {/* THE TRAINING PLAN (Training Form R/HR/11, 0453; the user,
                2026-10-23: the requester fills it). The request raises the
                Training Request from it; Trainee, Designation and Manager come
                from the request itself, the approval from its decision. */}
            <div className="rep-sec-title" style={{ marginTop: 14 }}>Training plan — Training Form R/HR/11</div>
            <div className="rep-grid">
              <label className="rep-field rep-span2">
                <span className="field-label">Training Topic *</span>
                <input className="input" value={draft.training_topic} placeholder="e.g. Product training in Chennai"
                  onChange={(e) => setDraft({ ...draft, training_topic: e.target.value })} />
              </label>
              <label className="rep-field">
                <span className="field-label">Trainer name *</span>
                <input className="input" list="ner-names" value={draft.trainer_name} onChange={(e) => setDraft({ ...draft, trainer_name: e.target.value })} />
              </label>
              <label className="rep-field">
                <span className="field-label">Trainer Designation</span>
                <input className="input" value={draft.trainer_designation} placeholder="e.g. National Service Manager"
                  onChange={(e) => setDraft({ ...draft, trainer_designation: e.target.value })} />
              </label>
              <label className="rep-field">
                <span className="field-label">Training Impact on Product / Process (Risk) *</span>
                <SelectPicker value={draft.training_risk} onChange={(v) => setDraft({ ...draft, training_risk: v })} placeholder="— Low / Medium / High —"
                  options={TRAINING_RISKS.map((r) => ({ value: r, label: `${r.toUpperCase()} RISK — ${TRAINING_METHODOLOGY[r]}` }))} />
                {draft.training_risk && <span className="muted rep-hint">Training Methodology: {TRAINING_METHODOLOGY[draft.training_risk as TrainingRisk]}</span>}
              </label>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void submit()}
                disabled={busy || !draft.name.trim() || !(draft.email.trim() || draft.gmail.trim())
                  || !draft.training_topic.trim() || !draft.trainer_name.trim() || !draft.training_risk}>
                {busy ? 'Sending…' : 'Send for approval'}
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ONE REQUEST: read it, or approve / reject it */}
      <Drawer open={!!open} onClose={() => { setOpen(null); setEdit(null); }} title={open ? `${open.req_no} — ${open.name}` : ''} storeKey="newEmployeeRequestView">
        {open && (
          <div>
            <p style={{ marginTop: 0 }}>
              <StatusChip s={open.status} /> Asked by <b>{open.requested_by_name || open.requested_by_email || '—'}</b> on {formatDayTime(open.created_at)}
              {open.decided_at && <> · {open.status.toLowerCase()} by <b>{open.decided_by_name || '—'}</b> on {formatDayTime(open.decided_at)}</>}
            </p>
            {issuedBanner}
            {/* THE TRAINING REQUEST IT RAISED (0453), and its form. */}
            {training && (
              <div className="sheet-banner sheet-banner-info">
                <span>
                  Training Request{training.req_no ? <> <b>{training.req_no}</b></> : <> (no number yet)</>}: {training.topic} —
                  trainer {training.trainer_name}, {training.risk} risk ({TRAINING_METHODOLOGY[training.risk]}) · {training.approval}.
                </span>
                <a className="btn btn-sm" href={`#/training-form/${training.id}`} target="_blank" rel="noopener noreferrer">📄 Training Form</a>
              </div>
            )}
            {open.status === 'Rejected' && <div className="sheet-banner sheet-banner-error"><span>Rejected: {open.reject_reason}</span></div>}
            {open.status === 'Approved' && (
              <div className="sheet-banner sheet-banner-ok">
                <span>
                  On the User Master.{' '}
                  {open.login_created_at ? <>Login made for <b>{open.login_email}</b> on {formatDayTime(open.login_created_at)}.</>
                    : open.login_error ? <>The login was not made: {open.login_error}</> : <>No login recorded yet.</>}
                </span>
                {mayApprove && !open.login_created_at && (
                  <button className="btn btn-sm" onClick={() => void retryLogin(open)} disabled={busy}>Create login</button>
                )}
              </div>
            )}

            {edit ? (
              <>
                <p className="muted">Correct anything that needs it before approving.</p>
                <PersonFields value={edit} onChange={(v) => setEdit({ ...edit, ...v })} names={names} regions={regions} departments={departments} />
                <div className="rep-grid">
                  <label className="rep-field">
                    <span className="field-label">Reporting Manager (name)</span>
                    <input className="input" list="ner-names" value={edit.reporting_manager} onChange={(e) => setEdit({ ...edit, reporting_manager: e.target.value })} />
                  </label>
                  <label className="rep-field">
                    <span className="field-label">Role</span>
                    <SelectPicker value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })} placeholder="— no role (Engineer) —"
                      options={roleOptions} disabled={!mayAssignRole} />
                    {!mayAssignRole && <span className="muted rep-hint">Setting a role needs “Assign roles &amp; grant permissions”; without it the person signs in as an Engineer.</span>}
                  </label>
                  <label className="rep-field rep-span2">
                    <span className="field-label">Tags</span>
                    <TagInput value={edit.tags} suggestions={[]} onChange={(v) => setEdit({ ...edit, tags: v })} />
                  </label>
                </div>
                <p className="muted rep-hint">
                  Approving adds them to the User Master and makes their login for <b>{loginEmailOf(edit) || '—'}</b> with a temporary password, shown to you once.
                </p>
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label className="rep-field" style={{ flex: 1, minWidth: 220 }}>
                    <span className="field-label">Reason, to reject</span>
                    <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The requester sees this" />
                  </label>
                  <button className="btn" onClick={() => void reject()} disabled={busy || !reason.trim()}>Reject</button>
                  <button className="btn btn-primary" onClick={() => void approve()}
                    disabled={busy || !edit.name.trim() || !loginEmailOf(edit)}>
                    {busy ? 'Working…' : 'Approve & create login'}
                  </button>
                </div>
              </>
            ) : (
              <dl className="rep-grid">
                {([['Name', open.name], ['Air Liquide ID', open.email], ['Gmail ID', open.gmail], ['Designation', open.designation],
                   ['Department', open.department], ['Region', open.region], ['Reporting Manager', open.reporting_manager],
                   ['Regional Manager', open.regional_manager], ['Contact No', open.phone], ['Address', open.address],
                   ['City', open.city], ['State', open.state], ['Remarks', open.remarks]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rep-field"><dt className="field-label">{k}</dt><dd style={{ margin: 0 }}>{v || '—'}</dd></div>
                ))}
              </dl>
            )}
          </div>
        )}
      </Drawer>
      <datalist id="ner-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}

/** The User Master's fields, as its own form lays them out. */
function PersonFields({ value, onChange, names, regions, departments, reportingManager }: {
  value: EmployeeRequestDraft; onChange: (v: Partial<EmployeeRequestDraft>) => void;
  names: string[]; regions: string[]; departments: string[];
  /** Shown read-only when the requester fills the form: the database stamps it. */
  reportingManager?: string;
}) {
  const text = (label: string, k: keyof EmployeeRequestDraft, placeholder = '', type = 'text', list?: string) => (
    <label className="rep-field">
      <span className="field-label">{label}</span>
      <input className="input" type={type} placeholder={placeholder} list={list} value={value[k]} onChange={(e) => onChange({ [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="rep-grid">
      {text('User Name *', 'name', "As it will appear on a call's Allocated To")}
      {text('Designation', 'designation', 'e.g. Service Engineer')}
      <label className="rep-field">
        <span className="field-label">Department</span>
        <SelectPicker value={value.department} onChange={(v) => onChange({ department: v })}
          placeholder={departments.length ? '— department —' : '— no departments on the master yet —'}
          options={value.department && !departments.includes(value.department) ? [value.department, ...departments] : departments} />
      </label>
      {text('Air Liquide ID (email)', 'email', 'name@airliquide.com — this or the Gmail ID is needed', 'email')}
      {text('Gmail ID', 'gmail', 'name@gmail.com — if there is no Air Liquide ID', 'email')}
      {reportingManager !== undefined && (
        <label className="rep-field">
          <span className="field-label">Reporting Manager</span>
          <input className="input" value={reportingManager} disabled />
          <span className="muted rep-hint">You — recorded by the system.</span>
        </label>
      )}
      {text('Regional Manager (name)', 'regional_manager', 'RGM as named on the User Master', 'text', 'ner-names')}
      <label className="rep-field">
        <span className="field-label">Region</span>
        <input className="input" list="ner-regions" placeholder="e.g. South" value={value.region} onChange={(e) => onChange({ region: e.target.value })} />
        <datalist id="ner-regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>
      </label>
      {text('Contact No', 'phone', '', 'tel')}
      <label className="rep-field rep-span2">
        <span className="field-label">Address</span>
        <input className="input" value={value.address} onChange={(e) => onChange({ address: e.target.value })} />
      </label>
      {text('City', 'city')}
      {text('State', 'state')}
      <label className="rep-field rep-span2">
        <span className="field-label">Remarks</span>
        <input className="input" value={value.remarks} onChange={(e) => onChange({ remarks: e.target.value })} placeholder="Anything the approver should know" />
      </label>
      {names.length === 0 && <span className="muted rep-hint">The User Master's names will be suggested once it has loaded.</span>}
    </div>
  );
}
