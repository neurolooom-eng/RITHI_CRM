import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../components/ui/ui';
import { reportsByCall, saveReport, updateCall, addConsumptionRows, addFeedback, sbEngineerNames, sbDirectoryNames, sbListPartyItems, handstockForEngineer, supabaseConfigured } from '../lib/supabase';
import { num, stockOptionLabel, type HandstockBalance } from '../lib/handstock';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { useMaster } from '../lib/masters';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import { todayISO } from '../lib/format';
import './fieldcalls.css';

// ===========================================================================
// CALL REPORTING — "Update Call" against a Field / Installation / PM call.
// Saves to the Supabase `reports` table (one row per VISIT; the form fields
// live in the `data` jsonb). The shape follows the Call Reporting field spec:
//
//   • UID / Email-ID / UC Number / Call Number / Call Type / Visit Entry Date
//     are filled in by the app — the engineer never types them.
//   • Call Status drives the rest: pending reason (mandatory when Unsolved),
//     the Service Report section (always on for Solved - Report Completed),
//     the manual report (mandatory there), and the customer sign-off + feedback.
//   • Add Consumption? = Yes opens the spare picker (hand stock only).
//   • Warranty Start Date is asked on INSTALLATION calls only, and is
//     mandatory there.
// ===========================================================================

const STATUS_OPTIONS = ['Solved - Report Completed', 'Unsolved', 'Solved - Report Pending'];
const RATINGS_FALLBACK = ['Excellent', 'Good', 'Average', 'Poor'];
const WARRANTY_Q = 'Warranty Start Date?';
const YESNO = ['Yes', 'No'];

// The Service Report section, in spec order. `req` fields are mandatory
// whenever the section is shown (i.e. Update Visit Work Details? = Yes).
type FieldKind = 'long' | 'text' | 'yesno' | 'complaint' | 'accessory' | 'manual' | 'warranty';
interface WorkField { key: string; kind: FieldKind; req?: boolean; span?: boolean }
const WORK_FIELDS: WorkField[] = [
  { key: 'Standard Complaint', kind: 'complaint', span: true },
  { key: 'Complaint Observation', kind: 'long', req: true, span: true },
  { key: 'Job Done', kind: 'long', req: true, span: true },
  { key: 'Hour Meter Reading', kind: 'text', req: true },
  { key: 'Software Version', kind: 'text', req: true },
  { key: 'Manual Report', kind: 'manual', span: true },
  { key: 'Add Consumption?', kind: 'yesno', req: true },
  { key: WARRANTY_Q, kind: 'warranty', req: true },
  { key: 'Accessory Serial No (CPX/ASU)', kind: 'accessory', span: true },
  { key: 'Maintenance Done?', kind: 'yesno' },
  { key: 'Recomended Filter Changed?', kind: 'yesno', req: true },
];

// Who signed the report off at the customer's end — asked only once the call
// is Solved - Report Completed, and never mandatory.
const SIGNOFF_FIELDS = ['Name', 'Contact Number', 'Designation'];

// Every report field a report can carry, in spec order — so the Reports
// register can offer them ALL as columns (⚙), even the ones the currently
// loaded rows happen not to have filled.
export const REPORT_FIELD_KEYS: string[] = [...WORK_FIELDS.map((f) => f.key), ...SIGNOFF_FIELDS];

// Customer-feedback questions (feedback table), filtered by call type.
type FbRule = 'ALL' | 'INSTALLATION' | 'FIELD' | 'NOT_INSTALLATION';
type FbAnswer = 'rating' | 'yesno' | 'date' | 'text';
interface FbQuestion { col: string; rule: FbRule; answer: FbAnswer }
const FEEDBACK_QUESTIONS: FbQuestion[] = [
  { col: 'Advance PM Done?', rule: 'FIELD', answer: 'yesno' },
  { col: 'INSTALLATION-Startup, Training and Handing Over', rule: 'INSTALLATION', answer: 'rating' },
  { col: 'INSTALLATION-Packing and Forwarding', rule: 'INSTALLATION', answer: 'rating' },
  { col: 'INSTALLATION-Delivery adherence schedule', rule: 'INSTALLATION', answer: 'rating' },
  { col: 'INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment', rule: 'ALL', answer: 'rating' },
  { col: 'INSTALLATION/PM/FIELD-In general, support of our company for your requirements', rule: 'ALL', answer: 'rating' },
  { col: 'PM/FIELD-Ability of our Product to meet your requirement', rule: 'NOT_INSTALLATION', answer: 'rating' },
  { col: 'PM/FIELD-Reliability of Product', rule: 'NOT_INSTALLATION', answer: 'rating' },
  { col: 'PM/FIELD-Reliability of Service', rule: 'NOT_INSTALLATION', answer: 'rating' },
  { col: 'PM/FIELD-Promptness for Service Calls', rule: 'NOT_INSTALLATION', answer: 'rating' },
  { col: 'INSTALLATION/PM/FIELD-Remarks if any', rule: 'ALL', answer: 'text' },
];
function fbApplies(rule: FbRule, callType: string): boolean {
  const t = callType.toUpperCase();
  const isInstall = t.indexOf('INSTALL') >= 0;
  switch (rule) {
    case 'ALL': return true;
    case 'INSTALLATION': return isInstall;
    case 'FIELD': return t.indexOf('FIELD') >= 0 && !isInstall;
    case 'NOT_INSTALLATION': return !isInstall;
    default: return false;
  }
}

export interface CallLike { ucn?: unknown; [key: string]: unknown }

export function CallReportDrawer({
  call, open, onClose, onSaved,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (mode: string, ucn: string) => void;
}) {
  const { user, isAdmin } = useAuth();
  const scope = useAccessScope();
  const ucn = String(call?.ucn ?? '');
  const callNumber = String(call?.callNumber ?? call?.['call_number'] ?? '');
  const callType = String(call?.callType ?? call?.['call_type'] ?? '');
  const partyName = String(call?.partyName ?? call?.['party_name'] ?? '');
  const pendingReasons = useMaster('pendingreason');
  const complaints = useMaster('complaint');
  const ratings = useMaster('feedbackrating', RATINGS_FALLBACK);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // The visit row is written first. If the spares or the feedback then fail,
  // the drawer stays open so the engineer can retry — and this stops the retry
  // filing a second visit.
  const [visitSaved, setVisitSaved] = useState(false);
  const [sparesSaved, setSparesSaved] = useState(false);

  // Visit + status
  const [visitEntry] = useState(() => new Date().toLocaleString());
  const [visitDate, setVisitDate] = useState(todayISO());
  const [engineer, setEngineer] = useState('');
  const [updateWork, setUpdateWork] = useState('Yes');
  const [status, setStatus] = useState('');
  const [pendingReason, setPendingReason] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [work, setWork] = useState<Record<string, string>>({});
  const [signoff, setSignoff] = useState<Record<string, string>>({});
  const setField = (k: string, v: string) => setWork((w) => ({ ...w, [k]: v }));

  // Engineer: the person doing the update, by default. An admin or a manager
  // may repoint it (they report on behalf of their engineers).
  const selfName = user?.fullName ?? '';
  const [allEngineers, setAllEngineers] = useState<string[]>([]);
  useEffect(() => {
    if (!open || !isAdmin) return;
    // Prefer the User Master directory; fall back to names seen on calls.
    sbDirectoryNames().then((d) => { if (d.length) setAllEngineers(d); else sbEngineerNames().then(setAllEngineers).catch(() => {}); }).catch(() => sbEngineerNames().then(setAllEngineers).catch(() => {}));
  }, [open, isAdmin]);
  const engineerOptions = useMemo(() => {
    const base = isAdmin ? allEngineers : scope.isManager ? [selfName, ...scope.reports] : [selfName];
    const set = new Set(base.filter(Boolean));
    if (engineer) set.add(engineer);
    return [...set];
  }, [isAdmin, allEngineers, scope.isManager, scope.reports, selfName, engineer]);

  const solved = /solved/i.test(status) && /complet/i.test(status);
  const reportPending = /report\s*pending/i.test(status);
  const unsolved = /unsolved/i.test(status);
  const isInstall = /install/i.test(callType);
  const wantsConsumption = (work['Add Consumption?'] ?? '') === 'Yes';
  const fbQuestions = useMemo(() => FEEDBACK_QUESTIONS.filter((q) => fbApplies(q.rule, callType)), [callType]);
  // Work details are always captured on a completed call — the spec locks the
  // choice to Yes there; on the other statuses the engineer chooses.
  const workOpen = updateWork === 'Yes';

  // Spare consumption + feedback.
  // A spare can only be consumed out of the engineer's HAND STOCK — what
  // Stores issued them, less what they have already used or handed on (view
  // `handstock_balance`, migration 0020). The picker offers exactly that, with
  // the quantity in hand, so a report cannot consume a part nobody gave them.
  const [stock, setStock] = useState<HandstockBalance[]>([]);
  const [stockErr, setStockErr] = useState('');
  const [stockBusy, setStockBusy] = useState(false);
  const [spares, setSpares] = useState<{ part: string; qty: string }[]>([]);
  const [spareDraft, setSpareDraft] = useState({ part: '', qty: '1' });
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  // Reports are a HISTORY (one row per visit). Each Update Call starts a fresh
  // visit; prior visits are context (and the last manual report).
  const [priorVisits, setPriorVisits] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!open || !ucn) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to report calls.'); return; }
    let cancelled = false;
    setLoading(true); setErr('');
    // reset to a blank new visit
    setStatus(''); setPendingReason(''); setUpdateWork('Yes'); setManualLink(''); setUploading(false); setVisitSaved(false); setSparesSaved(false);
    setWork({}); setSignoff({});
    setVisitDate(todayISO()); setSpares([]); setSpareDraft({ part: '', qty: '1' }); setFeedback({});
    setEngineer(selfName || String(call?.allocatedTo ?? ''));
    reportsByCall(callNumber || ucn).then((rows) => {
      if (cancelled) return;
      setPriorVisits(rows);
    }).catch(() => { /* history is best-effort */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ucn]);

  // Report Pending → the pending reason is the status itself, and locked.
  useEffect(() => { if (reportPending) setPendingReason('Report Pending'); }, [reportPending]);
  // A completed report always carries the work details — the spec locks it.
  useEffect(() => { if (solved) setUpdateWork('Yes'); }, [solved]);
  // Warranty start is asked on installations only; default it to today.
  useEffect(() => {
    if (isInstall && workOpen && work[WARRANTY_Q] === undefined) setField(WARRANTY_Q, todayISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstall, workOpen]);

  // Accessory Serial No — the CPX / ASU units already on this party's account.
  const [accessories, setAccessories] = useState<{ serial: string; item: string }[]>([]);
  useEffect(() => {
    if (!open || !partyName || !supabaseConfigured()) { setAccessories([]); return; }
    let alive = true;
    sbListPartyItems(partyName).then((rows) => {
      if (!alive) return;
      setAccessories(rows
        .filter((r) => /cpx|asu/i.test(String(r['Item Name'] ?? '')))
        .map((r) => ({ serial: String(r['Item Serial Number'] ?? ''), item: String(r['Item Name'] ?? '') }))
        .filter((a) => a.serial));
    }).catch(() => { if (alive) setAccessories([]); });
    return () => { alive = false; };
  }, [open, partyName]);

  // Turning Add Consumption? back to No drops the lines with it, so a report
  // never carries spares the engineer has said they did not use.
  useEffect(() => {
    if (!wantsConsumption) { setSpares([]); setSpareDraft({ part: '', qty: '1' }); }
  }, [wantsConsumption]);

  // The stock belongs to whoever made the visit, so it reloads with the
  // engineer picker (an admin reporting for someone else sees THEIR stock).
  useEffect(() => {
    if (!open || !wantsConsumption || !engineer.trim() || !supabaseConfigured()) { setStock([]); return; }
    let alive = true;
    setStockBusy(true); setStockErr('');
    handstockForEngineer(engineer)
      .then((r) => { if (alive) setStock(r as unknown as HandstockBalance[]); })
      .catch((e) => {
        if (!alive) return;
        const t = e instanceof Error ? e.message : String(e);
        setStock([]);
        setStockErr(/handstock|does not exist|schema cache/i.test(t)
          ? 'Hand stock needs migration 0023_handstock.sql — until it is run there is no stock to pick from.'
          : t);
      })
      .finally(() => { if (alive) setStockBusy(false); });
    return () => { alive = false; };
  }, [open, wantsConsumption, engineer]);

  // What is left of a spare once the lines already added to this visit are
  // taken off it — adding the same part twice must not exceed the stock.
  // `ignore` skips one line, so editing a line does not count against itself.
  const remainingOf = (part: string, ignore = -1): number => {
    const held = num(stock.find((r) => r.part === part)?.on_hand);
    const taken = spares.reduce((n, s, i) => (i === ignore || s.part !== part ? n : n + (Number(s.qty) || 0)), 0);
    return held - taken;
  };

  const addSpare = () => {
    const part = spareDraft.part.trim();
    if (!part) { setErr('Pick a spare before adding.'); return; }
    const n = Math.floor(Number(spareDraft.qty) || 0);
    if (n < 1) { setErr('Quantity must be at least 1.'); return; }
    const left = remainingOf(part);
    if (left <= 0) { setErr(`${part} is not in ${engineer || 'the engineer'}'s hand stock.`); return; }
    if (n > left) { setErr(`Only ${left} of that spare left in hand stock.`); return; }
    setSpares((s) => [...s, { part, qty: String(n) }]);
    setSpareDraft({ part: '', qty: '1' });
    setErr('');
  };

  // Nothing is committed until the report is saved, so a line added by mistake
  // can be repointed at another spare, re-counted, or dropped.
  const editSpare = (i: number, patch: Partial<{ part: string; qty: string }>) => {
    setErr('');
    setSpares((rows) => rows.map((r, n) => {
      if (n !== i) return r;
      const next = { ...r, ...patch };
      const left = remainingOf(next.part, i);
      if (patch.part) return { part: next.part, qty: String(Math.min(Number(r.qty) || 1, Math.max(1, left))) };
      const want = Math.floor(Number(next.qty) || 0);
      if (next.qty === '') return { ...next };
      if (want > left) { setErr(`Only ${left} of ${next.part} left in hand stock.`); return { ...next, qty: String(Math.max(1, left)) }; }
      return { ...next, qty: String(Math.max(1, want)) };
    }));
  };
  const removeSpare = (i: number) => { setErr(''); setSpares((rows) => rows.filter((_, n) => n !== i)); };

  // The manual report filed on the most recent visit, so it is one click away.
  const lastManualReport = ((): string => {
    const v = priorVisits[0];
    const link = String(v?.manual_report ?? (v?.data as Record<string, unknown> | undefined)?.['Manual Report'] ?? '');
    return /^https?:\/\//i.test(link) ? link : '';
  })();

  // Manual report: paste a Drive link, or upload the signed report to the same
  // CallReg Drive folder the request-form documents go to — the returned link
  // fills the field, so both paths store the same thing.
  const uploadReport = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setErr(`${file.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`); return; }
    setUploading(true); setErr('');
    const res = await uploadToDrive(file, `${ucn || 'Report'} - Manual Report`);
    setUploading(false);
    if (!res.ok || !res.url) { setErr(res.error ?? 'Upload failed.'); return; }
    setManualLink(res.url);
  };

  // Which fields of the Service Report apply to this call, in spec order.
  const workFields = useMemo(
    () => WORK_FIELDS.filter((f) => (f.kind === 'warranty' ? isInstall : true)),
    [isInstall],
  );

  const validate = (): string => {
    if (!ucn) return 'This call has no UC Number to report against.';
    if (!status) return 'Choose a Call Status.';
    if (unsolved && !pendingReason.trim()) return 'Call Pending Reason is mandatory for an unsolved call.';
    if (workOpen) {
      const miss = workFields
        .filter((f) => f.req && f.kind !== 'manual' && !String(work[f.key] ?? '').trim())
        .map((f) => f.key);
      if (miss.length) return `Fill the Service Report: ${miss.join(', ')}.`;
    }
    if (solved) {
      if (!manualLink.trim()) return 'Manual Report is mandatory when the call is Solved - Report Completed — upload it or paste its link.';
      const missFb = fbQuestions.filter((q) => (q.answer === 'rating' || q.answer === 'yesno') && !String(feedback[q.col] ?? '').trim());
      if (missFb.length) return `Customer feedback is mandatory for a solved call. Answer: ${missFb.map((q) => q.col).join(', ')}.`;
    }
    return '';
  };

  const save = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true); setErr('');
    const t0 = performance.now();
    try {
      const data: Record<string, unknown> = {
        'Email-ID': user?.email ?? '',
        'Call Type': callType,
        'Visit Entry Date': visitEntry,
        'Visit Date & Time': visitDate,
        'Update Visit Work Details?': updateWork,
        ...work,
        ...(solved ? signoff : {}),
        'Manual Report': manualLink,
      };
      const patch = {
        call_number: String(call?.callNumber ?? ''),
        manual_report: manualLink,
        call_status: status,
        pending_reason: pendingReason,
        engineer,
        engineer_email: user?.email ?? '',
        visit_at: visitDate ? `${visitDate}T00:00:00Z` : null,
        data,
      };
      if (!visitSaved) {
        const res = await saveReport(ucn, patch);
        if (!res.ok) { setErr(res.error ?? 'Save failed.'); setBusy(false); return; }
        setVisitSaved(true);
        // Stamp the call's status so a Solved call becomes read-only in the register.
        try { await updateCall(ucn, { status: solved ? 'Solved - Report Completed' : status }); } catch { /* status stamp is best-effort */ }
      }

      // Spare consumption → spare_consumption, every part in ONE insert so the
      // report can never keep some of its spares and drop the rest. A failure
      // here is shown, not swallowed: the visit is already filed, so pressing
      // Save Report again retries just this.
      const cons = sparesSaved ? { ok: true as const } : await addConsumptionRows(spares.map((sp) => ({
        ucn, call_number: String(call?.callNumber ?? ''), part: sp.part, qty: Number(sp.qty) || 1,
        engineer, engineer_email: user?.email ?? '', data: {},
      })));
      if (cons.ok) setSparesSaved(true);
      if (!cons.ok) {
        logAudit({ action: 'call.report.consumption', target: ucn, status: 'error', error: cons.error, meta: { spares: spares.length } });
        setErr(`The visit was saved, but the ${spares.length} spare${spares.length === 1 ? '' : 's'} could not be recorded: ${cons.error} — fix it and press Save Report again to retry just the spares.`);
        setBusy(false);
        return;
      }
      // Customer feedback → feedback (structured answers). The warranty start
      // date is asked in the Service Report but belongs on the feedback row.
      if (solved && fbQuestions.length) {
        const answers: Record<string, unknown> = {};
        fbQuestions.forEach((q) => { const val = feedback[q.col]; if (val != null && String(val).trim() !== '') answers[q.col] = val; });
        if (isInstall && String(work[WARRANTY_Q] ?? '').trim()) answers[WARRANTY_Q] = work[WARRANTY_Q];
        const fb = await addFeedback({
          ucn, call_number: String(call?.callNumber ?? ''), call_type: callType, engineer, engineer_email: user?.email ?? '',
          party_name: partyName, state: String(call?.state ?? ''), product_name: String(call?.productName ?? ''),
          serial: String(call?.serial ?? ''), complaint: String(call?.complaintReported ?? ''),
          answers, visit_at: visitDate ? `${visitDate}T00:00:00Z` : null,
        });
        if (!fb.ok) {
          logAudit({ action: 'call.report.feedback', target: ucn, status: 'error', error: fb.error });
          setErr(`The visit and the spares were saved, but the customer feedback was not: ${fb.error}`);
          setBusy(false);
          return;
        }
      }
      logAudit({ action: 'call.report', target: ucn, status: 'ok', duration_ms: Math.round(performance.now() - t0), meta: { call_status: status, spares: spares.length } });
      onSaved?.('saved', ucn);
      onClose();
    } catch (e) {
      logAudit({ action: 'call.report', target: ucn, status: 'error', error: e instanceof Error ? e.message : String(e), duration_ms: Math.round(performance.now() - t0) });
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  // One Service Report field, rendered by kind.
  const renderWorkField = (f: WorkField) => {
    const val = work[f.key] ?? '';
    const label = <span className="field-label">{f.key}{f.req ? ' *' : ''}</span>;
    if (f.kind === 'manual') {
      return (
        <div className="rep-field rep-span2" key={f.key}>
          <span className="field-label">Manual Report{solved ? ' *' : ''}</span>
          <input className="input" placeholder="Paste the Drive link to the signed report" value={manualLink} onChange={(e) => setManualLink(e.target.value)} />
          <div className="rep-upload">
            <label className={`btn btn-sm ${uploading ? 'is-busy' : ''}`}>
              {uploading ? 'Uploading…' : '⭱ Upload file'}
              <input type="file" hidden accept=".pdf,image/*" disabled={uploading}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void uploadReport(file); }} />
            </label>
            {uploading ? (
              <span className="muted rep-hint">Sending to Drive — this takes a few seconds.</span>
            ) : manualLink ? (
              <a className="rep-upload-file" href={manualLink} target="_blank" rel="noopener noreferrer">Open the linked report ↗</a>
            ) : (
              <span className="muted rep-hint">
                Upload the signed report (PDF/photo, up to 10 MB) — it goes to the CallReg Drive folder and fills the link.
                {solved ? ' Required to complete the report.' : ''}
              </span>
            )}
          </div>
        </div>
      );
    }
    return (
      <label className={`rep-field ${f.span ? 'rep-span2' : ''}`} key={f.key}>
        {label}
        {f.kind === 'long' ? (
          <textarea className="input" rows={2} value={val} onChange={(e) => setField(f.key, e.target.value)} />
        ) : f.kind === 'yesno' ? (
          <select className="select" value={val} onChange={(e) => setField(f.key, e.target.value)}>
            <option value="">— select —</option>
            {YESNO.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.kind === 'warranty' ? (
          <input type="date" className="input" value={val} onChange={(e) => setField(f.key, e.target.value)} />
        ) : f.kind === 'complaint' ? (
          <>
            <input className="input" list="dl-standardcomplaint" value={val} onChange={(e) => setField(f.key, e.target.value)} />
            <datalist id="dl-standardcomplaint">
              {complaints.values.slice(0, 2000).map((c) => <option key={c} value={c} />)}
            </datalist>
          </>
        ) : f.kind === 'accessory' ? (
          <>
            <input className="input" list="dl-accessory" placeholder={accessories.length ? 'Pick a CPX / ASU serial on this party…' : 'No CPX / ASU product found for this party'}
              value={val} onChange={(e) => setField(f.key, e.target.value)} />
            <datalist id="dl-accessory">
              {accessories.map((a) => <option key={a.serial} value={a.serial}>{a.item}</option>)}
            </datalist>
          </>
        ) : (
          <input className="input" value={val} onChange={(e) => setField(f.key, e.target.value)} />
        )}
      </label>
    );
  };

  return (
    <Drawer open={open} onClose={onClose} title={ucn ? `Update Call — ${ucn}` : 'Update Call'} width={820}>
      <div className="detail-hint">📝 Each save is a new <b>visit</b> in the report history. Spares → <b>spare_consumption</b>, feedback → <b>feedback</b>.</div>
      {priorVisits.length > 0 && (
        <div className="detail-hint" style={{ background: 'var(--surface-2, #f4f6f8)' }}>
          🕓 {priorVisits.length} previous visit{priorVisits.length === 1 ? '' : 's'} — last: {String(priorVisits[0].call_status ?? '—')} by {String(priorVisits[0].engineer ?? '—')} on {String(priorVisits[0].visit_at ?? '').slice(0, 10) || '—'}
          {!!lastManualReport && <> · <a href={lastManualReport} target="_blank" rel="noopener noreferrer">📎 Manual report ↗</a></>}
        </div>
      )}
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      {loading ? (
        <div className="muted" style={{ padding: 16 }}>Loading report…</div>
      ) : (
        <div className="rep-form">
          {/* The call — all fetched from the call being updated. */}
          <section className="rep-sec">
            <div className="rep-sec-title">Call</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">UC Number</span>
                <input className="input" value={ucn} readOnly />
              </label>
              <label className="rep-field">
                <span className="field-label">Call Number</span>
                <input className="input" value={callNumber} readOnly />
              </label>
              <label className="rep-field">
                <span className="field-label">Call Type</span>
                <input className="input" value={callType} readOnly />
              </label>
              <label className="rep-field">
                <span className="field-label">Email-ID</span>
                <input className="input" value={user?.email ?? ''} readOnly />
              </label>
            </div>
          </section>

          {/* Visit */}
          <section className="rep-sec">
            <div className="rep-sec-title">Visit</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">Visit Entry Date</span>
                <input className="input" value={visitEntry} readOnly />
                <span className="muted rep-hint">Auto — when this report is entered.</span>
              </label>
              <label className="rep-field">
                <span className="field-label">Visit Date &amp; Time</span>
                <input type="date" className="input" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
              </label>
              <label className="rep-field">
                <span className="field-label">Visiting Service Engineer</span>
                <select className="select" value={engineer} onChange={(e) => setEngineer(e.target.value)}>
                  {!engineer && <option value="">— select —</option>}
                  {engineerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="muted rep-hint">
                  {isAdmin || scope.isManager ? 'Defaults to you; you can report for an engineer.' : 'You — the user filing this report.'}
                </span>
              </label>
            </div>
          </section>

          {/* Status — with the work-details switch it drives, side by side */}
          <section className="rep-sec">
            <div className="rep-sec-title">Call Status</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">Call Status *</span>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">— Select status —</option>
                  {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  {status && !STATUS_OPTIONS.includes(status) && <option value={status}>{status}</option>}
                </select>
              </label>
              <label className="rep-field">
                <span className="field-label">Update Visit Work Details? *</span>
                <select className="select" value={updateWork} disabled={solved} onChange={(e) => setUpdateWork(e.target.value)}>
                  {YESNO.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {solved && <span className="muted rep-hint">Always Yes on a completed report.</span>}
              </label>
              {(unsolved || reportPending) && (
                <label className="rep-field rep-span2">
                  <span className="field-label">Call Pending Reason{unsolved ? ' *' : ''}</span>
                  {reportPending ? (
                    <input className="input" value={pendingReason} readOnly />
                  ) : (
                    <select className="select" value={pendingReason} onChange={(e) => setPendingReason(e.target.value)}>
                      <option value="">— select a reason —</option>
                      {pendingReasons.values.slice(0, 1000).map((v) => <option key={v} value={v}>{v}</option>)}
                      {pendingReason && !pendingReasons.values.includes(pendingReason) && <option value={pendingReason}>{pendingReason}</option>}
                    </select>
                  )}
                  {reportPending && <span className="muted rep-hint">Set automatically for a pending report.</span>}
                </label>
              )}
            </div>
            {!status && <div className="muted rep-hint">Choose a status — the form adapts to it.</div>}
          </section>

          {/* Service Report */}
          {status && workOpen && (
            <section className="rep-sec">
              <div className="rep-sec-title">Service Report</div>
              <div className="rep-grid">
                {workFields.map(renderWorkField)}
              </div>
            </section>
          )}

          {/* Spare consumption — opened by Add Consumption? = Yes */}
          {status && workOpen && wantsConsumption && (
            <section className="rep-sec">
              <div className="rep-sec-title">Spare consumption <span className="muted">→ spare_consumption</span></div>
              {spares.length > 0 && (
                <ul className="rep-spare-list">
                  {spares.map((s, i) => (
                    <li key={i} className="rep-spare-row">
                      <select className="select spare-part" value={s.part} onChange={(e) => editSpare(i, { part: e.target.value })}>
                        {!stock.some((r) => r.part === s.part) && <option value={s.part}>{s.part}</option>}
                        {stock.map((r) => (
                          <option key={r.part_code} value={r.part} disabled={r.part !== s.part && remainingOf(r.part) <= 0}>{stockOptionLabel(r)}</option>
                        ))}
                      </select>
                      <input
                        className="input spare-qty" type="number" min={1} max={Math.max(1, remainingOf(s.part, i))}
                        value={s.qty} onChange={(e) => editSpare(i, { qty: e.target.value })}
                        onBlur={() => editSpare(i, { qty: s.qty || '1' })}
                      />
                      <button className="btn btn-ghost btn-sm" title="Remove this spare" onClick={() => removeSpare(i)}>🗑</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="spare-row">
                <select
                  className="select spare-part" value={spareDraft.part}
                  onChange={(e) => setSpareDraft({ part: e.target.value, qty: '1' })}
                  disabled={stockBusy || stock.length === 0}
                >
                  <option value="">
                    {stockBusy ? 'Loading hand stock…' : stock.length ? 'Pick a spare in hand…' : 'Nothing in hand stock'}
                  </option>
                  {stock.map((r) => (
                    <option key={r.part_code} value={r.part} disabled={remainingOf(r.part) <= 0}>{stockOptionLabel(r)}</option>
                  ))}
                </select>
                <input
                  className="input spare-qty" type="number" min={1}
                  max={spareDraft.part ? Math.max(1, remainingOf(spareDraft.part)) : 1}
                  value={spareDraft.qty} onChange={(e) => setSpareDraft((d) => ({ ...d, qty: e.target.value }))}
                  disabled={!spareDraft.part}
                />
                <button className="btn btn-sm" onClick={addSpare} disabled={!spareDraft.part}>＋ Add</button>
              </div>
              {stockErr
                ? <span className="muted rep-hint">{stockErr}</span>
                : <span className="muted rep-hint">
                    Only spares in {engineer || 'the engineer'}&rsquo;s hand stock can be consumed — issued by Stores on a DC,
                    less what has already been used or transferred. Raise a spare request for anything else.
                    Lines above stay editable until you save the report.
                  </span>}
            </section>
          )}

          {/* Customer sign-off (completed report) */}
          {solved && (
            <section className="rep-sec">
              <div className="rep-sec-title">Customer sign-off <span className="muted">(optional)</span></div>
              <div className="rep-grid">
                {SIGNOFF_FIELDS.map((k) => (
                  <label className="rep-field" key={k}>
                    <span className="field-label">{k}</span>
                    <input className="input" value={signoff[k] ?? ''} onChange={(e) => setSignoff((s) => ({ ...s, [k]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Customer feedback (solved) */}
          {solved && fbQuestions.length > 0 && (
            <section className="rep-sec">
              <div className="rep-sec-title">Customer feedback * <span className="muted">→ feedback · {callType || 'call'} · required</span></div>
              <div className="rep-grid">
                {fbQuestions.map((q) => {
                  const req = q.answer === 'rating' || q.answer === 'yesno';
                  const onCh = (v: string) => setFeedback((f) => ({ ...f, [q.col]: v }));
                  return (
                    <label className={`rep-field ${q.answer === 'text' ? 'rep-span2' : ''}`} key={q.col}>
                      <span className="field-label">{q.col}{req ? ' *' : ''}</span>
                      {q.answer === 'rating' ? (
                        <select className="select" value={feedback[q.col] ?? ''} onChange={(e) => onCh(e.target.value)}>
                          <option value="">— rate —</option>
                          {ratings.values.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : q.answer === 'yesno' ? (
                        <select className="select" value={feedback[q.col] ?? ''} onChange={(e) => onCh(e.target.value)}>
                          <option value="">— select —</option>
                          {YESNO.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : q.answer === 'date' ? (
                        <input type="date" className="input" value={feedback[q.col] ?? ''} onChange={(e) => onCh(e.target.value)} />
                      ) : (
                        <input className="input" value={feedback[q.col] ?? ''} onChange={(e) => onCh(e.target.value)} />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          <div className="rep-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || uploading || !status}>{busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save Report'}</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
