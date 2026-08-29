import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../components/ui/ui';
import { reportsByCall, saveReport, updateCall, addConsumption, addFeedback, sbEngineerNames, sbDirectoryNames, supabaseConfigured } from '../lib/supabase';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { useMaster } from '../lib/masters';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import { todayISO } from '../lib/format';
import './fieldcalls.css';

// ===========================================================================
// CALL REPORTING — "Update Call" against a Field / Installation / PM call.
// Saves to the Supabase `reports` table (one row per UCN; all fields live in
// the `data` jsonb). Sections adapt to the chosen Call Status:
//   • Solved  → full work details + manual report + spare consumption
//               (spare_consumption) + customer feedback (feedback).
//   • Unsolved → pending reason required; the rest optional.
//   • Report Pending → pending reason auto-set to "Report Pending".
// ===========================================================================

const STATUS_OPTIONS = ['Solved - Report Completed', 'Unsolved', 'Report Pending'];
const RATINGS_FALLBACK = ['Excellent', 'Good', 'Average', 'Poor'];
const WARRANTY_Q = 'Warranty Start Date?';

// Work-detail fields (kept in reports.data). label + whether it's a long textarea.
const WORK_FIELDS: { key: string; long?: boolean }[] = [
  { key: 'Service Report', long: true },
  { key: 'Complaint Observation', long: true },
  { key: 'Job Done', long: true },
  { key: 'Hour Meter Reading' },
  { key: 'Software Version' },
  { key: 'Accessory Serial No (CPX/ASU)' },
  { key: 'Maintenance Done?' },
  { key: 'Recomended Filter Changed?' },
];

// Customer-feedback questions (feedback table), filtered by call type.
type FbRule = 'ALL' | 'INSTALLATION' | 'FIELD' | 'NOT_INSTALLATION';
type FbAnswer = 'rating' | 'yesno' | 'date' | 'text';
interface FbQuestion { col: string; rule: FbRule; answer: FbAnswer }
const FEEDBACK_QUESTIONS: FbQuestion[] = [
  { col: 'Warranty Start Date?', rule: 'INSTALLATION', answer: 'date' },
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
  const pendingReasons = useMaster('pendingreason');
  const ratings = useMaster('feedbackrating', RATINGS_FALLBACK);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  // Engineer dropdown: admin → everyone; manager → their reports; else self.
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
  const pending = /report\s*pending/i.test(status);
  const unsolved = /unsolved/i.test(status);
  const fbQuestions = useMemo(() => FEEDBACK_QUESTIONS.filter((q) => fbApplies(q.rule, callType)), [callType]);

  // Spare consumption + feedback
  const spareMaster = useMaster('spare');
  const [spares, setSpares] = useState<{ part: string; qty: string }[]>([]);
  const [spareDraft, setSpareDraft] = useState({ part: '', qty: '1' });
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  // Reports are a HISTORY (one row per visit). Each Update Call starts a fresh
  // visit; we only load prior visits for context and to default the engineer.
  const [priorVisits, setPriorVisits] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!open || !ucn) return;
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to report calls.'); return; }
    let cancelled = false;
    setLoading(true); setErr('');
    // reset to a blank new visit
    setStatus(''); setPendingReason(''); setUpdateWork('Yes'); setManualLink(''); setUploading(false); setWork({});
    setVisitDate(todayISO()); setSpares([]); setSpareDraft({ part: '', qty: '1' }); setFeedback({});
    setEngineer(String(call?.allocatedTo ?? selfName ?? ''));
    reportsByCall(callNumber || ucn).then((rows) => {
      if (cancelled) return;
      setPriorVisits(rows);
      if (rows[0]?.engineer) setEngineer(String(rows[0].engineer)); // default to who visited last
    }).catch(() => { /* history is best-effort */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ucn]);

  // Report Pending → auto pending reason. Warranty date defaults to today.
  useEffect(() => { if (pending) setPendingReason('Report Pending'); }, [pending]);
  useEffect(() => {
    if (solved && fbQuestions.some((q) => q.col === WARRANTY_Q) && feedback[WARRANTY_Q] === undefined) {
      setFeedback((f) => ({ ...f, [WARRANTY_Q]: todayISO() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, fbQuestions]);

  const addSpare = () => {
    if (!spareDraft.part.trim()) { setErr('Pick a spare before adding.'); return; }
    setSpares((s) => [...s, { ...spareDraft }]);
    setSpareDraft({ part: '', qty: '1' });
  };

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

  const validate = (): string => {
    if (!ucn) return 'This call has no UC Number to report against.';
    if (!status) return 'Choose a Call Status.';
    if ((unsolved || pending) && !pendingReason.trim()) return 'Enter the pending reason.';
    if (solved) {
      if (!String(work['Job Done'] ?? '').trim() && !String(work['Service Report'] ?? '').trim())
        return 'Fill the work details (Job Done / Service Report).';
      const miss = fbQuestions.filter((q) => (q.answer === 'rating' || q.answer === 'yesno') && !String(feedback[q.col] ?? '').trim());
      if (miss.length) return `Customer feedback is mandatory for a solved call. Answer: ${miss.map((q) => q.col).join(', ')}.`;
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
        'Visit Entry Date': visitEntry,
        'Visit Date & Time': visitDate,
        'Update Visit Work Details?': updateWork,
        'Manual Report': manualLink,
        ...work,
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
      const res = await saveReport(ucn, patch);
      if (!res.ok) { setErr(res.error ?? 'Save failed.'); setBusy(false); return; }
      // Stamp the call's status so a Solved call becomes read-only in the register.
      try { await updateCall(ucn, { status: solved ? 'Solved - Report Completed' : status }); } catch { /* status stamp is best-effort */ }

      // Spare consumption → spare_consumption (one row per part).
      for (const s of spares) {
        await addConsumption({ ucn, call_number: String(call?.callNumber ?? ''), part: s.part, qty: Number(s.qty) || 1, engineer, data: {} });
      }
      // Customer feedback → feedback (structured answers).
      if (solved && fbQuestions.length) {
        const answers: Record<string, unknown> = {};
        fbQuestions.forEach((q) => { const val = feedback[q.col]; if (val != null && String(val).trim() !== '') answers[q.col] = val; });
        await addFeedback({
          ucn, call_number: String(call?.callNumber ?? ''), call_type: callType, engineer, engineer_email: user?.email ?? '',
          party_name: String(call?.partyName ?? ''), state: String(call?.state ?? ''), product_name: String(call?.productName ?? ''),
          serial: String(call?.serial ?? ''), complaint: String(call?.complaintReported ?? ''),
          answers, visit_at: visitDate ? `${visitDate}T00:00:00Z` : null,
        });
      }
      logAudit({ action: 'call.report', target: ucn, status: 'ok', duration_ms: Math.round(performance.now() - t0), meta: { call_status: status, spares: spares.length } });
      onSaved?.('saved', ucn);
      onClose();
    } catch (e) {
      logAudit({ action: 'call.report', target: ucn, status: 'error', error: e instanceof Error ? e.message : String(e), duration_ms: Math.round(performance.now() - t0) });
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
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
                <span className="field-label">Visit Date</span>
                <input type="date" className="input" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
              </label>
              <label className="rep-field">
                <span className="field-label">Visiting Service Engineer</span>
                <select className="select" value={engineer} onChange={(e) => setEngineer(e.target.value)}>
                  {!engineer && <option value="">— select —</option>}
                  {engineerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {(isAdmin || scope.isManager) && <span className="muted rep-hint">You can assign a reporting engineer.</span>}
              </label>
              <label className="rep-field">
                <span className="field-label">Update Visit Work Details?</span>
                <select className="select" value={updateWork} onChange={(e) => setUpdateWork(e.target.value)}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
            </div>
          </section>

          {/* Status */}
          <section className="rep-sec">
            <div className="rep-sec-title">Call Status</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">Call Status</span>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">— Select status —</option>
                  {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  {status && !STATUS_OPTIONS.includes(status) && <option value={status}>{status}</option>}
                </select>
              </label>
              {(unsolved || pending) && (
                <label className="rep-field rep-span2">
                  <span className="field-label">Call Pending Reason{unsolved ? ' *' : ''}</span>
                  <input className="input" list="dl-pendingreason" value={pendingReason} readOnly={pending} onChange={(e) => setPendingReason(e.target.value)} />
                  {!pending && (
                    <datalist id="dl-pendingreason">
                      {pendingReasons.values.slice(0, 1000).map((v) => <option key={v} value={v} />)}
                    </datalist>
                  )}
                  {pending && <span className="muted rep-hint">Set automatically for a pending report.</span>}
                </label>
              )}
            </div>
            {!status && <div className="muted rep-hint">Choose a status — the form adapts to it.</div>}
          </section>

          {/* Work details */}
          {status && updateWork === 'Yes' && (
            <section className="rep-sec">
              <div className="rep-sec-title">Work details {solved ? '' : <span className="muted">(optional)</span>}</div>
              <div className="rep-grid">
                {WORK_FIELDS.map((f) => (
                  <label className={`rep-field ${f.long ? 'rep-span2' : ''}`} key={f.key}>
                    <span className="field-label">{f.key}</span>
                    {f.long
                      ? <textarea className="input" rows={2} value={work[f.key] ?? ''} onChange={(e) => setWork((w) => ({ ...w, [f.key]: e.target.value }))} />
                      : <input className="input" value={work[f.key] ?? ''} onChange={(e) => setWork((w) => ({ ...w, [f.key]: e.target.value }))} />}
                  </label>
                ))}
                <div className="rep-field rep-span2">
                  <span className="field-label">Manual Report (Drive link)</span>
                  <input className="input" placeholder="Paste the Drive link to the signed report" value={manualLink} onChange={(e) => setManualLink(e.target.value)} />
                  <div className="rep-upload">
                    <label className={`btn btn-sm ${uploading ? 'is-busy' : ''}`}>
                      {uploading ? 'Uploading…' : '⭱ Upload file'}
                      <input type="file" hidden accept=".pdf,image/*" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void uploadReport(f); }} />
                    </label>
                    {uploading ? (
                      <span className="muted rep-hint">Sending to Drive — this takes a few seconds.</span>
                    ) : manualLink ? (
                      <a className="rep-upload-file" href={manualLink} target="_blank" rel="noopener noreferrer">Open the linked report ↗</a>
                    ) : (
                      <span className="muted rep-hint">…or upload the signed report (PDF/photo, up to 10 MB) — it goes to the CallReg Drive folder and fills the link.</span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Spare consumption (solved) */}
          {solved && (
            <section className="rep-sec">
              <div className="rep-sec-title">Spare consumption <span className="muted">→ spare_consumption</span></div>
              {spares.length > 0 && (
                <ul className="rep-spare-list">
                  {spares.map((s, i) => <li key={i}>✓ {s.part} × {s.qty}</li>)}
                </ul>
              )}
              <div className="spare-row">
                <input className="input spare-part" list="dl-spares" placeholder="Search part…" value={spareDraft.part} onChange={(e) => setSpareDraft((d) => ({ ...d, part: e.target.value }))} />
                <input className="input spare-qty" type="number" min={1} value={spareDraft.qty} onChange={(e) => setSpareDraft((d) => ({ ...d, qty: e.target.value }))} />
                <button className="btn btn-sm" onClick={addSpare}>＋ Add</button>
              </div>
              <datalist id="dl-spares">{spareMaster.values.slice(0, 2000).map((v) => <option key={v} value={v} />)}</datalist>
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
                          <option value="">— select —</option><option value="Yes">Yes</option><option value="No">No</option>
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
