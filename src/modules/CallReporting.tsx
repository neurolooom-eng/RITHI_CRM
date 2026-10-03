import { useComplaints } from '../lib/useComplaints';
import { isMissingTable } from '../lib/dberror';
import { useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { Drawer } from '../components/ui/ui';
import { reportsByCall, saveReport, updateCall, addConsumptionRows, addFeedback, sbListPartyItems, handstockForEngineer, supabaseConfigured } from '../lib/supabase';
import { num, stockOptionLabel, type HandstockBalance } from '../lib/handstock';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { driveFolderForCall } from '../lib/drivefolders';
import { useMaster } from '../lib/masters';
import { useSpareParts } from '../lib/useSpareParts';
import { logAudit } from '../lib/audit';
import { consumptionProblem, CONSUMPTION_YES, CONSUMPTION_NONE } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import { useAccessScope, useTeamEngineers } from '../lib/access';
import { todayISO, fmtLongDateTime, fmtLongDate } from '../lib/format';
import { visitDateProblem } from '../lib/visitdate';
import { manualReportLink } from '../lib/reports';
import { DocPreview } from '../components/doc/DocPreview';
import { localIsoDate, toIsoDate } from '../lib/dates';
import './fieldcalls.css';

// ===========================================================================
// CALL REPORTING — "Visit Entry" against a Field / Installation / PM call.
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

// THE VISIT AN INDOOR DC FILES (0323, the user, 2026-10-02): "ALWAYS set the
// call to Unsolved, pending reason = Return to Field, Update visit work
// details = Yes". Taken from THIS form's own list, not retyped -- and the
// database refuses to record a visit for an Indoor job that reads otherwise.
// 'Return to Field' is on the Call Pending Reason master (0323 adds it).
export const INDOOR_VISIT_FIXED = {
  status: STATUS_OPTIONS[1],            // 'Unsolved'
  pendingReason: 'Return to Field',
  updateWork: 'Yes',
} as const;
const RATINGS_FALLBACK = ['Excellent', 'Good', 'Average', 'Poor'];
const WARRANTY_Q = 'Warranty Start Date?';
const YESNO = ['Yes', 'No'];

// The Service Report section, in spec order. `req` fields are mandatory
// whenever the section is shown (i.e. Update Visit Work Details? = Yes).
type FieldKind = 'long' | 'text' | 'yesno' | 'complaint' | 'accessory' | 'manual' | 'warranty';
interface WorkField { key: string; kind: FieldKind; req?: boolean; span?: boolean; opts?: string[] }
// Add Consumption? is NOT a yes/no question, and calling it one cost a line of
// consumption on every report that left it alone. "None Consumed" is a stated
// answer -- the engineer says no part went in -- where "No" reads as "not
// filling this in now". Yes then MAKES the spare list mandatory (the user's
// rule, 2026-09-11), so the two answers are the only two outcomes and neither
// is a skip.
const CONSUMPTION_OPTS = [CONSUMPTION_YES, CONSUMPTION_NONE];
const WORK_FIELDS: WorkField[] = [
  { key: 'Standard Complaint', kind: 'complaint', span: true },
  { key: 'Complaint Observation', kind: 'long', req: true, span: true },
  { key: 'Job Done', kind: 'long', req: true, span: true },
  { key: 'Hour Meter Reading', kind: 'text', req: true },
  { key: 'Software Version', kind: 'text', req: true },
  { key: 'Manual Report', kind: 'manual', span: true },
  { key: 'Add Consumption?', kind: 'yesno', req: true, opts: CONSUMPTION_OPTS },
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

// ---------------------------------------------------------------------------
// A VISIT AS DATA, AND THE ONE PATH THAT FILES IT.
//
// The Visit Entry below saves through fileVisit(); so does the Indoor DC's
// approval (IndoorDcPanel.tsx), which files the visit the Indoor engineer
// DRAFTED with the service report. One writer, so every rule the database
// keeps on a visit -- the visit guards, the call status sync, the hand-stock
// cap on consumption, the visit-before-spares rule (0214), feedback on a
// solved call -- applies to both exactly alike.
// ---------------------------------------------------------------------------
export interface VisitSpare { part: string; qty: string; grir: string }
export interface VisitDraft {
  visitDate: string;                 // yyyy-mm-dd, "Visit Date & Time"
  engineer: string;                  // Visiting Service Engineer
  engineerEmail: string;
  status: string;
  pendingReason: string;
  updateWork: string;
  work: Record<string, string>;
  signoff: Record<string, string>;
  spares: VisitSpare[];
  feedback: Record<string, string>;
  manualLink: string;
}
/** How far a filing got, so a retry files only what is left. */
export interface VisitProgress { uid?: string; sparesSaved?: boolean }

const isSolvedStatus = (s: string) => /solved/i.test(s) && /complet/i.test(s);

export async function fileVisit(
  call: CallLike, d: VisitDraft,
  opts: { filerEmail: string; visitEntry?: string; extraData?: Record<string, unknown>; progress?: VisitProgress;
          onProgress?: (p: VisitProgress) => void },
): Promise<{ ok: true; uid: string } | { ok: false; error: string; progress: VisitProgress }> {
  const ucn = String(call.ucn ?? '');
  const callType = String(call.callType ?? call['call_type'] ?? '');
  const callNumber = String(call.callNumber ?? '');
  const solved = isSolvedStatus(d.status);
  const isInstall = /install/i.test(callType);
  const progress: VisitProgress = { ...(opts.progress ?? {}) };
  const step = (p: Partial<VisitProgress>) => { Object.assign(progress, p); opts.onProgress?.({ ...progress }); };
  const t0 = performance.now();
  try {
    if (!progress.uid) {
      const data: Record<string, unknown> = {
        'Email-ID': opts.filerEmail,
        'Call Type': callType,
        // Stamped in the app's long format (dd-mmm-yyyy hh:mm:ss): when the
        // Visit Entry form was opened, or -- for a drafted visit -- when it is
        // filed, which is when it is entered against the call.
        'Visit Entry Date': opts.visitEntry || fmtLongDateTime(new Date()),
        'Visit Date & Time': d.visitDate,
        'Update Visit Work Details?': d.updateWork,
        ...d.work,
        ...(solved ? d.signoff : {}),
        'Manual Report': d.manualLink,
        ...(opts.extraData ?? {}),
      };
      const patch = {
        call_number: callNumber,
        manual_report: d.manualLink,
        call_status: d.status,
        pending_reason: d.pendingReason,
        engineer: d.engineer,
        engineer_email: d.engineerEmail,
        visit_at: d.visitDate ? `${d.visitDate}T00:00:00Z` : null,
        data,
      };
      const res = await saveReport(ucn, patch);
      if (!res.ok || !res.uid) return { ok: false, error: res.error ?? 'Save failed.', progress };
      step({ uid: res.uid });
      // Stamp the call's status so a Solved call becomes read-only in the register.
      try { await updateCall(ucn, { status: solved ? 'Solved - Report Completed' : d.status }); } catch { /* status stamp is best-effort */ }
    }

    // Spare consumption → spare_consumption, every part in ONE insert so the
    // report can never keep some of its spares and drop the rest. A failure
    // here is shown, not swallowed: the visit is already filed, so a retry
    // files just this.
    const cons = progress.sparesSaved ? { ok: true as const } : await addConsumptionRows(d.spares.map((sp) => ({
      ucn, call_number: callNumber, part: sp.part, qty: Number(sp.qty) || 1,
      grir: sp.grir ?? '',
      engineer: d.engineer, engineer_email: d.engineerEmail, data: {},
    })));
    if (cons.ok) step({ sparesSaved: true });
    if (!cons.ok) {
      logAudit({ action: 'call.report.consumption', target: ucn, status: 'error', error: cons.error, meta: { spares: d.spares.length } });
      return { ok: false, progress, error: `The visit was saved, but the ${d.spares.length} spare${d.spares.length === 1 ? '' : 's'} could not be recorded: ${cons.error} — fix it and press Save Report again to retry just the spares.` };
    }
    // Customer feedback → feedback (structured answers), on a SOLVED call only.
    // The warranty start date is asked in the Service Report but belongs on
    // the feedback row.
    const fbQuestions = FEEDBACK_QUESTIONS.filter((q) => fbApplies(q.rule, callType));
    if (solved && fbQuestions.length) {
      const answers: Record<string, unknown> = {};
      fbQuestions.forEach((q) => { const val = d.feedback[q.col]; if (val != null && String(val).trim() !== '') answers[q.col] = val; });
      if (isInstall && String(d.work[WARRANTY_Q] ?? '').trim()) answers[WARRANTY_Q] = d.work[WARRANTY_Q];
      const fb = await addFeedback({
        ucn, call_number: callNumber, call_type: callType, engineer: d.engineer, engineer_email: d.engineerEmail,
        party_name: String(call.partyName ?? call['party_name'] ?? ''), state: String(call.state ?? ''), product_name: String(call.productName ?? ''),
        serial: String(call.serial ?? ''), complaint: String(call.complaintReported ?? ''),
        answers, visit_at: d.visitDate ? `${d.visitDate}T00:00:00Z` : null,
      });
      if (!fb.ok) {
        logAudit({ action: 'call.report.feedback', target: ucn, status: 'error', error: fb.error });
        return { ok: false, progress, error: `The visit and the spares were saved, but the customer feedback was not: ${fb.error}` };
      }
    }
    logAudit({ action: 'call.report', target: ucn, status: 'ok', duration_ms: Math.round(performance.now() - t0), meta: { call_status: d.status, spares: d.spares.length } });
    return { ok: true, uid: progress.uid! };
  } catch (e) {
    logAudit({ action: 'call.report', target: ucn, status: 'error', error: e instanceof Error ? e.message : String(e), duration_ms: Math.round(performance.now() - t0) });
    return { ok: false, progress, error: `Save failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** THE INDOOR SERVICE REPORT STAGE (0323): the same form, filled as a DRAFT on
 *  an Indoor job. Call Status, Pending Reason and Update Visit Work Details?
 *  are fixed (INDOOR_VISIT_FIXED); the engineer is the signed-in Indoor
 *  engineer; the Manual Report field becomes the Indoor Service Report No. and
 *  its upload. Nothing is written to the call -- the draft is filed when the
 *  Indoor DC is approved. */
export interface IndoorDraftMode {
  initial: VisitDraft | null;
  reportNo: string;
  reportLink: string;
  upload: (file: File, reportNo: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onSave: (d: VisitDraft, reportNo: string, link: string) => Promise<{ ok: boolean; error?: string }>;
  /** INLINE (the user, 2026-10-03: no second drawer): the form renders as part
   *  of the Indoor job's Report page instead of in a Drawer of its own. The
   *  call, the visit entry date and the fixed status are not repeated there. */
  inline?: boolean;
  /** ASK EACH THING ONCE: Service Report fields the Indoor job already holds
   *  (e.g. Job Done <- the job's Work done). Shown read-only with where they
   *  come from; their value goes into the draft on save. */
  linked?: Record<string, { value: string; from: string; edit?: () => void }>;
}

export function CallReportDrawer({
  call, open, onClose, onSaved, indoor,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (mode: string, ucn: string) => void;
  /** Present = the Indoor Service Report stage: a draft, not a visit. */
  indoor?: IndoorDraftMode;
}) {
  const { user, isAdmin, can } = useAuth();
  const scope = useAccessScope();
  const ucn = String(call?.ucn ?? '');
  const callNumber = String(call?.callNumber ?? call?.['call_number'] ?? '');
  const callType = String(call?.callType ?? call?.['call_type'] ?? '');
  const partyName = String(call?.partyName ?? call?.['party_name'] ?? '');
  const pendingReasons = useMaster('pendingreason');
  // The call's product's complaints plus the all-products ones (useComplaints).
  const complaintList = useComplaints();
  const ratings = useMaster('feedbackrating', RATINGS_FALLBACK);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // The visit row is written first. If the spares or the feedback then fail,
  // the drawer stays open so the engineer can retry — and this stops the retry
  // filing a second visit.
  const [progress, setProgress] = useState<VisitProgress>({});
  const [reportNo, setReportNo] = useState('');

  // Visit + status
  // Stamped in the app's long format (dd-mmm-yyyy hh:mm:ss), not the browser
  // locale — it is stored as text on the visit and read back everywhere.
  const [visitEntry] = useState(() => fmtLongDateTime(new Date()));
  const [visitDate, setVisitDate] = useState(todayISO());
  // WHAT THE VISIT DATE IS MEASURED AGAINST: the call's Complaint Date, and
  // NOTHING ELSE. Read through the date helpers because a call loaded from the
  // database carries an ISO string and one loaded from a sheet carries a
  // day-first one, and the two must not be told apart here.
  //
  // IT USED TO FALL BACK TO THE REGISTRATION DATE and that was wrong three
  // ways. A PM batch dates every call to the FIRST OF ITS DUE MONTH, so an
  // October PM carried reg_date 2026-10-01 and a visit entered on 28 September
  // — attending it early, which happens — was refused. The message then named
  // a "complaint" date the call does not have. And the DATABASE only ever
  // tested complaint_date (0115), so the form was stricter than the rule it
  // claims to enforce.
  //
  // No complaint date means no lower bound. That is the user's rule as stated,
  // and refusing the visit invents a requirement the call never carried.
  const complaintISO = localIsoDate(call?.complaintDate ?? call?.['complaint_date'])
    ?? toIsoDate(call?.complaintDate ?? call?.['complaint_date'])
    ?? '';
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
  // may repoint it (they report on behalf of their engineers) — the same list
  // the spare request and the call request offer, from `useTeamEngineers`.
  const selfName = user?.fullName ?? '';
  const engineerOptions = useTeamEngineers(engineer).names;

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
  // GRIR / traceability rides with each line: which part was actually fitted,
  // not just which kind — the answer to "which sensor went into this machine".
  const [spares, setSpares] = useState<{ part: string; qty: string; grir: string }[]>([]);
  const [spareDraft, setSpareDraft] = useState({ part: '', qty: '1', grir: '' });
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  // THE CALL'S PRODUCT + ITS ACCESSORIES + THE COMMON PARTS, out of what the
  // engineer holds (partfit.ts, the user, 2026-09-30); "Show all parts" lists
  // the whole hand stock. A part the Part Master does not list is kept.
  const spareParts = useSpareParts(open);
  const [showAllStock, setShowAllStock] = useState(false);

  // Reports are a HISTORY (one row per visit). Each Visit Entry starts a fresh
  // visit; prior visits are context (and the last manual report).
  const [priorVisits, setPriorVisits] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!open || !ucn) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to report calls.'); return; }
    let cancelled = false;
    setLoading(true); setErr('');
    // reset to a blank new visit
    setStatus(''); setPendingReason(''); setUpdateWork('Yes'); setManualLink(''); setUploading(false); setProgress({});
    setWork({}); setSignoff({});
    setVisitDate(todayISO()); setShowAllStock(false); setSpares([]); setSpareDraft({ part: '', qty: '1', grir: '' }); setFeedback({});
    setEngineer(selfName || String(call?.allocatedTo ?? ''));
    if (indoor) {
      // THE INDOOR DRAFT: the fixed three, the signed-in engineer, and what
      // was drafted before (a re-opened draft starts where it was left).
      const d = indoor.initial;
      setStatus(INDOOR_VISIT_FIXED.status); setPendingReason(INDOOR_VISIT_FIXED.pendingReason);
      setUpdateWork(INDOOR_VISIT_FIXED.updateWork); setEngineer(selfName);
      setReportNo(indoor.reportNo); setManualLink(indoor.reportLink);
      if (d) {
        setVisitDate(d.visitDate || todayISO()); setWork(d.work ?? {}); setSignoff(d.signoff ?? {});
        setSpares(d.spares ?? []); setFeedback(d.feedback ?? {});
      }
    }
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
  const fixedIndoor = !!indoor;
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
    if (!wantsConsumption) { setSpares([]); setSpareDraft({ part: '', qty: '1', grir: '' }); }
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
        setStockErr(isMissingTable(t, 'handstock_balance', 'handstock_movements', 'handstock_opening')
          ? 'Hand stock needs migration 0023_handstock.sql — until it is run there is no stock to pick from.'
          : t);
      })
      .finally(() => { if (alive) setStockBusy(false); });
    return () => { alive = false; };
  }, [open, wantsConsumption, engineer]);

  const callProduct = String(call?.productName ?? call?.['product_name'] ?? '').trim();
  const fitsCall = spareParts.fits(callProduct);
  const stockNarrowed = !!callProduct && !showAllStock;
  const stockShown = stockNarrowed ? stock.filter((r) => fitsCall(r.part, r.part_code)) : stock;
  const stockAccessories = callProduct ? spareParts.accessories(callProduct) : [];

  // What is left of a spare once the lines already added to this visit are
  // taken off it — adding the same part twice must not exceed the stock.
  // `ignore` skips one line, so editing a line does not count against itself.
  const remainingOf = (part: string, ignore = -1): number => {
    const held = num(stock.find((r) => r.part === part)?.on_hand);
    const taken = spares.reduce((n, s, i) => (i === ignore || s.part !== part ? n : n + (Number(s.qty) || 0)), 0);
    return held - taken;
  };

  // ONE set of rules for the draft line, used by the Add button AND by Save.
  // They have to be the same rules: the line the engineer is looking at is
  // consumption whether or not they thought to press Add, and a line that Save
  // accepts on terms Add would refuse is a quality record nobody checked.
  const draftLine = (): { line: { part: string; qty: string; grir: string } } | { error: string } | null => {
    const part = spareDraft.part.trim();
    if (!part) return null;
    const n = Math.floor(Number(spareDraft.qty) || 0);
    if (n < 1) return { error: 'Quantity must be at least 1.' };
    const left = remainingOf(part);
    if (left <= 0) return { error: `${part} is not in ${engineer || 'the engineer'}'s hand stock.` };
    if (n > left) return { error: `Only ${left} of that spare left in hand stock.` };
    return { line: { part, qty: String(n), grir: spareDraft.grir.trim() } };
  };

  const addSpare = () => {
    if (!spareDraft.part.trim()) { setErr('Pick a spare before adding.'); return; }
    const d = draftLine();
    if (d && 'error' in d) { setErr(d.error); return; }
    if (!d) return;
    setSpares((s) => [...s, d.line]);
    setSpareDraft({ part: '', qty: '1', grir: '' });
    setErr('');
  };

  // Nothing is committed until the report is saved, so a line added by mistake
  // can be repointed at another spare, re-counted, or dropped.
  const editSpare = (i: number, patch: Partial<{ part: string; qty: string; grir: string }>) => {
    setErr('');
    setSpares((rows) => rows.map((r, n) => {
      if (n !== i) return r;
      const next = { ...r, ...patch };
      const left = remainingOf(next.part, i);
      // Repointing at another spare re-counts against THAT spare's stock, but
      // the traceability belongs to the line and travels with it.
      if (patch.part) return { ...next, qty: String(Math.min(Number(r.qty) || 1, Math.max(1, left))) };
      const want = Math.floor(Number(next.qty) || 0);
      if (next.qty === '') return { ...next };
      if (want > left) { setErr(`Only ${left} of ${next.part} left in hand stock.`); return { ...next, qty: String(Math.max(1, left)) }; }
      return { ...next, qty: String(Math.max(1, want)) };
    }));
  };
  const removeSpare = (i: number) => { setErr(''); setSpares((rows) => rows.filter((_, n) => n !== i)); };

  // The manual report filed on the most recent visit, so it is one click away.
  const lastManualReport = manualReportLink(priorVisits[0]);
  // Two things can be shown: the report being uploaded on THIS visit, and the
  // one filed on the previous visit. Separate flags, because they are different
  // documents and an engineer comparing them will open one after the other.
  const [showReport, setShowReport] = useState(false);
  const [showPrior, setShowPrior] = useState(false);

  // Manual report: paste a Drive link, or upload the signed report to the same
  // CallReg Drive folder the request-form documents go to — the returned link
  // fills the field, so both paths store the same thing.
  const uploadReport = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setErr(`${file.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`); return; }
    if (indoor && !reportNo.trim()) { setErr('Enter the Indoor Service Report No. first — the file is named after it.'); return; }
    setUploading(true); setErr('');
    // The call's type picks the folder — Field / Installation / PM each have
    // their own in the shared drive, so a report is filed by what it is rather
    // than heaped in with every other document the app has ever stored.
    // An Indoor report goes through the Indoor module's own upload (its name
    // carries the report number).
    const res = indoor
      ? await indoor.upload(file, reportNo.trim())
      : await uploadToDrive(file, `${ucn || 'Report'} - Manual Report`, driveFolderForCall(callType));
    setUploading(false);
    if (!res.ok || !res.url) { setErr(res.error ?? 'Upload failed.'); return; }
    setManualLink(res.url);
  };

  // Which fields of the Service Report apply to this call, in spec order.
  const workFields = useMemo(
    () => WORK_FIELDS.filter((f) => (f.kind === 'warranty' ? isInstall : true)),
    [isInstall],
  );

  // The linked fields' values come from the Indoor job, never from this form.
  const workWithLinked = (): Record<string, string> => {
    const l = indoor?.linked;
    if (!l) return work;
    const out = { ...work };
    for (const [k, v] of Object.entries(l)) out[k] = v.value;
    return out;
  };

  const validate = (): string => {
    if (!ucn) return 'This call has no UC Number to report against.';
    // Checked here as well as on the input: `min`/`max` stop the PICKER, not a
    // typed or pasted value, and this is a quality record.
    const whenProblem = visitDateProblem(visitDate, complaintISO, todayISO());
    if (whenProblem) return whenProblem;
    // MANDATORY (the user, 2026-09-09). A visit with no engineer on it is a
    // service record that cannot say WHO performed the service — §7.5.4 asks
    // for the person, and every per-engineer figure in the system (hand stock,
    // consumption, the objectives) reads this field.
    if (!engineer.trim()) return 'Visiting Service Engineer is required — say who attended.';
    if (!status) return 'Choose a Call Status.';
    if (unsolved && !pendingReason.trim()) return 'Call Pending Reason is mandatory for an unsolved call.';
    if (workOpen) {
      const all = workWithLinked();
      const miss = workFields
        .filter((f) => f.req && f.kind !== 'manual' && !String(all[f.key] ?? '').trim())
        .map((f) => (indoor?.linked?.[f.key] ? `${f.key} (${indoor.linked[f.key].from})` : f.key));
      if (miss.length) return `Fill the Service Report: ${miss.join(', ')}.`;
      const consProblem = consumptionProblem(String(work['Add Consumption?'] ?? ''), spares.length, spareDraft.part);
      if (consProblem) return consProblem;
      // SPARES ON A VISIT ARE THEIR OWN TICK (finding 67, 0289). Said BEFORE
      // anything is written: the visit is saved first, so a refusal arriving
      // with the spares would leave a visit whose parts were never booked.
      if (wantsConsumption && !can('visit.spares'))
        return 'Booking spares on a visit needs “Book spares used on a visit” — answer None Consumed, or ask an administrator for it.';
    }
    if (indoor) {
      if (!reportNo.trim()) return 'Enter the Indoor Service Report No.';
      if (!manualLink.trim()) return 'Upload the Indoor Service Report.';
    }
    if (solved) {
      if (!manualLink.trim()) return 'Manual Report is mandatory when the call is Solved - Report Completed — upload the signed report.';
      const missFb = fbQuestions.filter((q) => (q.answer === 'rating' || q.answer === 'yesno') && !String(feedback[q.col] ?? '').trim());
      if (missFb.length) return `Customer feedback is mandatory for a solved call. Answer: ${missFb.map((q) => q.col).join(', ')}.`;
      if (fbQuestions.length && !can('visit.feedback'))
        return 'A solved call records the customer’s feedback, which needs “Record customer feedback on a visit” — ask an administrator for it.';
    }
    return '';
  };

  const save = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    // THE SPARE STILL IN THE PICKER IS CONSUMPTION TOO. It sits on screen fully
    // filled in, and before this it was thrown away unless the engineer
    // remembered to press Add — one line short, silently, on a quality record
    // that also drives the hand-stock balance. Pressing Save IS the intent to
    // record it, so it is carried; only a line the Add button would itself
    // refuse stops the save, and then it says why rather than dropping it.
    const d = draftLine();
    if (d && 'error' in d) { setErr(d.error); return; }
    const allSpares = d ? [...spares, d.line] : spares;
    if (d) { setSpares(allSpares); setSpareDraft({ part: '', qty: '1', grir: '' }); }
    const draft: VisitDraft = {
      visitDate, engineer, engineerEmail: user?.email ?? '', status, pendingReason, updateWork,
      work: workWithLinked(), signoff: solved ? signoff : {}, spares: allSpares, feedback, manualLink,
    };
    setBusy(true); setErr('');
    if (indoor) {
      // A DRAFT: kept on the Indoor job, filed when its Indoor DC is approved.
      const r = await indoor.onSave(draft, reportNo.trim(), manualLink);
      setBusy(false);
      if (!r.ok) { setErr(r.error ?? 'Could not save the draft.'); return; }
      onSaved?.('drafted', ucn);
      onClose();
      return;
    }
    const r = await fileVisit(call ?? {}, draft, { filerEmail: user?.email ?? '', visitEntry, progress, onProgress: setProgress });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved?.('saved', ucn);
    onClose();
  };

  // One Service Report field, rendered by kind.
  const renderWorkField = (f: WorkField) => {
    const val = work[f.key] ?? '';
    const link = indoor?.linked?.[f.key];
    if (link) {
      return (
        <div className={`rep-field rep-linked ${f.span ? 'rep-span2' : ''}`} key={f.key}>
          <span className="field-label">{f.key}{f.req ? ' *' : ''}
            <span className="rep-linked-from"> · from {link.from}</span>
            {link.edit ? <button type="button" className="rep-linked-edit" onClick={link.edit}>edit</button> : null}
          </span>
          <span className={`rep-linked-value${link.value.trim() ? '' : ' is-blank'}`}>{link.value.trim() || `Not filled in yet — fill it on the ${link.from} page.`}</span>
        </div>
      );
    }
    const label = <span className="field-label">{f.key}{f.req ? ' *' : ''}</span>;
    if (f.kind === 'manual') {
      // UPLOADED, NEVER PASTED (the user, 2026-09-08: "pasting link shouldnt be
      // an option"). The box that took a link is gone, and this is not tidying:
      // an upload goes through CallReg.gs, which sets the file to
      // ANYONE_WITH_LINK so the report can be SHOWN in the app. A link somebody
      // pasted points at a file in their own Drive that nobody else can open --
      // and the frame cannot tell us it failed, so the report would silently
      // become Google's "you need access" page. Removing the box is what makes
      // the preview trustworthy, not a restriction for its own sake.
      //
      // The same shape the registration documents already use (DriveFileField):
      // pick a file, see the file, remove it.
      return (
        <div className="rep-field rep-span2" key={f.key}>
          {indoor ? (
            <label className="rep-field" style={{ marginBottom: 6 }}>
              <span className="field-label">Indoor Service Report No *</span>
              <input className="input" value={reportNo} onChange={(e) => setReportNo(e.target.value)} />
              <span className="muted rep-hint" title="It traces the file back to this number, and is the visit’s Manual Report when the visit is filed.">The file is saved as “{reportNo.trim() || '<report no>'}_&lt;file name&gt;”.</span>
            </label>
          ) : null}
          <span className="field-label">{indoor ? 'Indoor Service Report *' : `Manual Report${solved ? ' *' : ''}`}</span>
          <div className="rep-upload">
            {manualLink ? (
              <>
                <button type="button" className="svc-report-link" onClick={() => setShowReport(true)}
                        title="Show the report you uploaded">📄 Show the report</button>
                <a className="rep-upload-file" href={manualLink} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>
                <label className={`btn btn-sm ${uploading ? 'is-busy' : ''}`}>
                  {uploading ? 'Uploading…' : 'Replace'}
                  <input type="file" hidden accept=".pdf,image/*" disabled={uploading}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void uploadReport(file); }} />
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManualLink('')}>Remove</button>
              </>
            ) : (
              <>
                <label className={`btn btn-sm ${uploading ? 'is-busy' : ''}`}>
                  {uploading ? 'Uploading…' : '⭱ Upload the signed report'}
                  <input type="file" hidden accept=".pdf,image/*" disabled={uploading}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void uploadReport(file); }} />
                </label>
                <span className="muted rep-hint">
                  {uploading
                    ? 'Sending to Drive — this takes a few seconds.'
                    : `PDF or photo, up to 10 MB. It goes to the CallReg Drive folder${solved ? ' — required to complete the report' : ''}.`}
                </span>
              </>
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
          <SelectPicker value={val} onChange={(v) => setField(f.key, v)} options={[...(f.opts ?? YESNO)]} />
        ) : f.kind === 'warranty' ? (
          <input type="date" className="input" value={val} onChange={(e) => setField(f.key, e.target.value)} />
        ) : f.kind === 'complaint' ? (
          // TYPE, SEARCH, SELECT — and NO free text (the user, 2026-09-09).
          // This was a datalist, which only SUGGESTS: it accepted anything
          // typed, and it was capped at 2,000 entries so a master past that had
          // values nobody could pick. Every count, filter and frequent-failure
          // match downstream is done on this value, so a hand-typed one is a
          // complaint that matches nothing.
          <SelectPicker
            value={val}
            onChange={(v) => setField(f.key, v)}
            options={(() => {
              const offered = complaintList.forProduct(String(call?.productName ?? ''));
              return val && !offered.includes(val) ? [val, ...offered] : offered;
            })()}
            placeholder={complaintList.all.length ? '— pick the standard complaint —'
              : complaintList.ready ? '— the Standard Complaint master is empty —'
              : '— loading the complaints… —'}
            disabled={!complaintList.all.length && !val}
            emptyHint="If it is not here, it needs adding under Masters."
          />
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

  const inline = !!indoor?.inline;
  const body = (
    <>
      {inline ? (
        <div className="rep-inline-note">Drafted now, filed against <b>{ucn}</b> as you when the Indoor DC is approved — nothing is written to the call yet.</div>
      ) : indoor ? (
        <div className="detail-hint">📝 The Visit Entry for <b>{ucn}</b>, drafted with the Indoor Service Report. <b>Nothing is written to the call now</b> — the visit is filed against the call, as you, when the Indoor DC is approved.</div>
      ) : (
        <div className="detail-hint">📝 Each save is a new <b>visit</b> in the report history. Spares → <b>spare_consumption</b>, feedback → <b>feedback</b>.</div>
      )}
      {!inline && priorVisits.length > 0 && (
        <div className="detail-hint" style={{ background: 'var(--surface-2, #f4f6f8)' }}>
          🕓 {priorVisits.length} previous visit{priorVisits.length === 1 ? '' : 's'} — last: {String(priorVisits[0].call_status ?? '—')} by {String(priorVisits[0].engineer ?? '—')} on {fmtLongDate(priorVisits[0].visit_at) || '—'}
          {!!lastManualReport && (
            <> · <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }}
                         onClick={() => setShowPrior(true)}>📎 Manual report</button></>
          )}
        </div>
      )}
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      {loading ? (
        <div className="muted" style={{ padding: 16 }}>Loading report…</div>
      ) : (
        <div className="rep-form">
          {/* The call — all fetched from the call being updated. */}
          {!inline && <section className="rep-sec">
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
          </section>}

          {/* Inline (Indoor): the report number and its file come first -- they
              are what this stage is named after. */}
          {inline && (
            <section className="rep-sec">
              <div className="rep-sec-title">Indoor Service Report</div>
              <div className="rep-grid">
                {workFields.filter((f) => f.kind === 'manual').map(renderWorkField)}
              </div>
            </section>
          )}

          {/* Visit */}
          <section className="rep-sec">
            <div className="rep-sec-title">Visit</div>
            <div className="rep-grid">
              {!inline && <label className="rep-field">
                <span className="field-label">Visit Entry Date</span>
                <input className="input" value={indoor ? 'When the visit is filed' : visitEntry} readOnly />
                <span className="muted rep-hint">{indoor ? 'Auto — stamped when the Indoor DC is approved and the visit is filed.' : 'Auto — when this report is entered.'}</span>
              </label>}
              <label className="rep-field">
                <span className="field-label">Visit Date &amp; Time</span>
                <input
                  type="date" className="input" value={visitDate}
                  max={todayISO()}
                  min={complaintISO || undefined}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
                <span className="muted rep-hint">
                  {complaintISO
                    ? <>Not in the future, and not before the complaint ({fmtLongDate(complaintISO)}).</>
                    : <>Not in the future.</>}
                </span>
              </label>
              {inline ? (
                <div className="rep-field">
                  <span className="field-label">Visiting Service Engineer</span>
                  <span className="rep-linked-value">{selfName || '—'}</span>
                </div>
              ) : <label className="rep-field">
                <span className="field-label">Visiting Service Engineer *</span>
                <SelectPicker value={engineer} onChange={setEngineer} options={fixedIndoor ? [selfName] : engineerOptions} disabled={fixedIndoor}
                              emptyHint="Only engineers on your team are listed." />
                <span className="muted rep-hint">
                  {isAdmin || scope.isManager ? 'Defaults to you; you can report for an engineer.' : 'You — the user filing this report.'}
                </span>
              </label>}
            </div>
          </section>

          {/* Status — with the work-details switch it drives, side by side.
              Inline (Indoor) it is fixed, so it is one line, not three boxes. */}
          {inline ? (
            <div className="rep-inline-fixed">
              Call status <b>{INDOOR_VISIT_FIXED.status}</b> · pending <b>{INDOOR_VISIT_FIXED.pendingReason}</b> · work details updated — fixed for a unit going back to the field.
            </div>
          ) : <section className="rep-sec">
            <div className="rep-sec-title">Call Status</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">Call Status *</span>
                <SelectPicker value={status} onChange={setStatus} placeholder="— Select status —" disabled={fixedIndoor}
                              options={status && !STATUS_OPTIONS.includes(status)
                                ? [status, ...STATUS_OPTIONS] : [...STATUS_OPTIONS]} />
              </label>
              <label className="rep-field">
                <span className="field-label">Update Visit Work Details? *</span>
                <SelectPicker value={updateWork} onChange={setUpdateWork} disabled={solved || fixedIndoor} options={[...YESNO]} />
                {solved && <span className="muted rep-hint">Always Yes on a completed report.</span>}
              </label>
              {(unsolved || reportPending) && (
                <label className="rep-field rep-span2">
                  <span className="field-label">Call Pending Reason{unsolved ? ' *' : ''}</span>
                  {reportPending || fixedIndoor ? (
                    <input className="input" value={pendingReason} readOnly />
                  ) : (
                    <SelectPicker value={pendingReason} onChange={setPendingReason}
                                  placeholder="— select a reason —"
                                  emptyHint="If it is not here, add it under Masters."
                                  options={pendingReason && !pendingReasons.values.includes(pendingReason)
                                    ? [pendingReason, ...pendingReasons.values.slice(0, 1000)]
                                    : pendingReasons.values.slice(0, 1000)} />
                  )}
                  {reportPending && <span className="muted rep-hint">Set automatically for a pending report.</span>}
                </label>
              )}
            </div>
            {!status && <div className="muted rep-hint">Choose a status — the form adapts to it.</div>}
            {fixedIndoor && (
              <div className="muted rep-hint">
                Fixed for a visit filed from Indoor Service: the unit goes back to the field, so the call is
                <b> {INDOOR_VISIT_FIXED.status}</b>, pending <b>{INDOOR_VISIT_FIXED.pendingReason}</b>, with the work details updated.
              </div>
            )}
          </section>}

          {/* Service Report */}
          {status && workOpen && (
            <section className="rep-sec">
              <div className="rep-sec-title">Service Report</div>
              <div className="rep-grid">
                {(inline ? workFields.filter((f) => f.kind !== 'manual') : workFields).map(renderWorkField)}
              </div>
            </section>
          )}

          {/* Spare consumption — opened by Add Consumption? = Yes */}
          {status && workOpen && wantsConsumption && (
            <section className="rep-sec">
              <div className="rep-sec-title">Spare consumption <span className="muted">→ spare_consumption</span></div>
              {callProduct && stock.length > 0 && (
                <div className="muted" style={{ fontSize: 12.5, margin: '0 0 6px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>
                    {showAllStock
                      ? 'Showing everything in hand stock.'
                      : <>Hand stock for <b>{callProduct}</b>{stockAccessories.length ? <> and its accessories ({stockAccessories.join(', ')})</> : ''}, plus the common parts — {stockShown.length} of {stock.length}.</>}
                  </span>
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={showAllStock} onChange={(e) => setShowAllStock(e.target.checked)} />
                    Show all parts
                  </label>
                </div>
              )}
              {spares.length > 0 && (
                <ul className="rep-spare-list">
                  {spares.map((s, i) => (
                    <li key={i} className="rep-spare-row">
                      <SelectPicker
                        className="spare-part" value={s.part}
                        onChange={(v) => editSpare(i, { part: v })}
                        emptyHint="Only what this engineer holds can be consumed."
                        options={[
                          ...(!stock.some((r) => r.part === s.part) ? [{ value: s.part, label: s.part }] : []),
                          ...stock.map((r) => ({
                            value: r.part, label: stockOptionLabel(r),
                            // Its own row stays pickable even at zero: it is
                            // already booked here, and disabling it would make
                            // the line unchangeable.
                            disabled: r.part !== s.part && remainingOf(r.part) <= 0,
                          })),
                        ]} />
                      <input
                        className="input spare-qty" type="number" min={1} max={Math.max(1, remainingOf(s.part, i))}
                        value={s.qty} onChange={(e) => editSpare(i, { qty: e.target.value })}
                        onBlur={() => editSpare(i, { qty: s.qty || '1' })}
                      />
                      <input className="input spare-grir" placeholder="GRIR / traceability"
                        title="Which part was actually fitted — batch, goods-receipt or serial number"
                        value={s.grir} onChange={(e) => editSpare(i, { grir: e.target.value })} />
                      <button className="btn btn-ghost btn-sm" title="Remove this spare" onClick={() => removeSpare(i)}>🗑</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="spare-row">
                <SelectPicker
                  className="spare-part" value={spareDraft.part}
                  onChange={(v) => setSpareDraft((d) => ({ ...d, part: v, qty: '1' }))}
                  disabled={stockBusy || stockShown.length === 0}
                  placeholder={stockBusy ? 'Loading hand stock…' : stockShown.length ? 'Pick a spare in hand…'
                    : stock.length ? `Nothing in hand for ${callProduct} — tick Show all parts` : 'Nothing in hand stock'}
                  emptyHint="Only what this engineer holds can be consumed."
                  options={stockShown.map((r) => ({
                    value: r.part, label: stockOptionLabel(r), disabled: remainingOf(r.part) <= 0,
                  }))} />
                <input
                  className="input spare-qty" type="number" min={1}
                  max={spareDraft.part ? Math.max(1, remainingOf(spareDraft.part)) : 1}
                  value={spareDraft.qty} onChange={(e) => setSpareDraft((d) => ({ ...d, qty: e.target.value }))}
                  disabled={!spareDraft.part}
                />
                <input className="input spare-grir" placeholder="GRIR / traceability"
                  title="Which part was actually fitted — batch, goods-receipt or serial number"
                  value={spareDraft.grir}
                  onChange={(e) => setSpareDraft((d) => ({ ...d, grir: e.target.value }))}
                  disabled={!spareDraft.part} />
                <button className="btn btn-sm" onClick={addSpare} disabled={!spareDraft.part}>＋ Add</button>
              </div>
              {stockErr
                ? <span className="muted rep-hint">{stockErr}</span>
                : <span className="muted rep-hint">
                    Only spares in {engineer || 'the engineer'}&rsquo;s hand stock can be consumed — issued by Stores on a DC,
                    less what has already been used or transferred. Raise a spare request for anything else.
                    Lines above stay editable until you save the report, and the spare in the
                    picker is saved with them &mdash; &#65291; Add is only needed to start another line.
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
                        <SelectPicker value={String(feedback[q.col] ?? '')} onChange={onCh}
                                      placeholder="— rate —" options={ratings.values} />
                      ) : q.answer === 'yesno' ? (
                        <SelectPicker value={String(feedback[q.col] ?? '')} onChange={onCh} options={[...YESNO]} />
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
            {!inline && <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>}
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || uploading || !status}>{busy ? 'Saving…' : uploading ? 'Uploading…' : inline ? 'Upload service report' : indoor ? 'Save the report and the visit draft' : 'Save Report'}</button>
          </div>
        </div>
      )}

      {/* Rendered inside the drawer's tree but positioned over the whole page,
          so the document is read at document size and not at drawer width. */}
      {showReport && manualLink && (
        <DocPreview url={manualLink} title={`Service Report — ${ucn}`}
                    subtitle="Uploaded on this visit" onClose={() => setShowReport(false)} />
      )}
      {showPrior && lastManualReport && (
        <DocPreview url={lastManualReport} title={`Service Report — ${ucn}`}
                    subtitle={`Previous visit${priorVisits[0]?.visit_at ? ` · ${fmtLongDate(priorVisits[0].visit_at)}` : ''}`}
                    onClose={() => setShowPrior(false)} />
      )}
    </>
  );
  if (inline) return <div className="rep-inline">{body}</div>;
  return (
    <Drawer open={open} onClose={onClose} title={indoor ? `Indoor Service Report — ${ucn}` : ucn ? `Visit Entry — ${ucn}` : 'Visit Entry'} width={820}>
      {body}
    </Drawer>
  );
}
