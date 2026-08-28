import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../components/ui/ui';
import { getReport, saveReport, sheetsConfigured, tabAppend, tabMeta, uploadManualReport } from '../lib/sheets';
import { useMaster } from '../lib/masters';
import './fieldcalls.css';

// ===========================================================================
// CALL REPORTING — "Update Call" against a Field / Installation call.
// The report is written to the Call Register's Reporting-N tab (keyed by UCN),
// and the visible sections change with the chosen Call Status:
//   • Solved - Report Completed → full report + Manual report upload +
//     Spare Consumption (v2Consumption, added one by one) + Customer Feedback
//     (v2Feedback).
//   • Unsolved → only the pending reason is required; the rest is optional.
//   • Report Pending → pending reason is set to "Report Pending" automatically;
//     the rest is optional.
// ===========================================================================

const CONSUMPTION_TAB = 'v2Consumption';
const FEEDBACK_TAB = 'v2Feedback';

const READONLY = ['UC Number', 'Call Number', 'UID', 'Email-ID'];
const STATUS_OPTIONS = ['Solved - Report Completed', 'Unsolved', 'Report Pending'];
const LONG_MATCH = /job\s*done|observation|service\s*report|standard\s*complaint|pending\s*reason|remark|action\s*taken|description|comment/i;
const CORE_SOLVED = [/job\s*done/i, /service\s*report/i, /complaint\s*observation/i];

const PREFILL_FROM_CALL: Record<string, string> = {
  'UC Number': 'ucn', 'Call Number': 'callNumber', 'Call Type': 'callType',
  'Party Name': 'partyName', 'City': 'city', 'State': 'state',
  'Product Name': 'productName', 'Product Serial Number': 'serial',
  'Visiting Service Engineer': 'allocatedTo',
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const find = (headers: string[], re: RegExp) => headers.find((h) => re.test(h));
const ucnColOf = (headers: string[]) => find(headers, /uc\s*number|ucn/i) || find(headers, /call\s*number/i) || 'UC Number';

export interface CallLike { ucn?: unknown; [key: string]: unknown }

export function CallReportDrawer({
  call, open, onClose, onSaved,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (mode: string, ucn: string) => void;
}) {
  const ucn = String(call?.ucn ?? '');
  const pendingReasons = useMaster('pendingreason'); // Call Pending Reason master
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [existing, setExisting] = useState<Record<string, unknown>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  // ---- load the report schema + existing row on open ----
  useEffect(() => {
    if (!open || !ucn) return;
    if (!sheetsConfigured()) { setErr('Connect the Google Sheet in Settings to report calls.'); return; }
    let cancelled = false;
    setLoading(true); setErr(''); setHeaders([]); setExisting({}); setValues({});
    setSpares([]); setSpareDraft({}); setFeedback({}); setConsHeaders(null); setFbHeaders(null); setSubNote('');
    setManualLink(''); setManualFile(null);
    getReport(ucn)
      .then((r) => {
        if (cancelled) return;
        setHeaders(r.headers); setExisting(r.row);
        // seed values: existing value, else identifying prefill from the call
        const seed: Record<string, string> = {};
        r.headers.forEach((h) => {
          const cur = r.row[h];
          if (cur != null && String(cur) !== '') { seed[h] = String(cur); return; }
          const k = PREFILL_FROM_CALL[h];
          seed[h] = k && call ? String(call[k] ?? '') : '';
        });
        // default the visit date/time to now if empty
        const visitH = find(r.headers, /visit.*(date|time)/i);
        if (visitH && !seed[visitH]) seed[visitH] = new Date().toLocaleString();
        setValues(seed);
        const manualH = find(r.headers, /manual\s*report|report\s*(link|url|attachment|upload)/i);
        if (manualH && r.row[manualH]) setManualLink(String(r.row[manualH]));
      })
      .catch((e) => { if (!cancelled) setErr(`Couldn't load the report: ${e instanceof Error ? e.message : String(e)}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ucn]);

  const usable = useMemo(() => headers.filter((h) => h && !h.startsWith('_') && !/^Page.*Header$/i.test(h)), [headers]);
  const statusH = useMemo(() => find(usable, /call\s*status|^status$/i), [usable]);
  const pendingH = useMemo(() => find(usable, /pending\s*reason/i), [usable]);
  const manualH = useMemo(() => find(usable, /manual\s*report|report\s*(link|url|attachment|upload)/i), [usable]);

  const status = statusH ? values[statusH] ?? '' : '';
  const solved = /solved/i.test(status) && /complet/i.test(status);
  const pending = /report\s*pending/i.test(status) || norm(status) === 'report pending';
  const unsolved = /unsolved/i.test(status);

  const detailHeaders = useMemo(
    () => usable.filter((h) => h !== statusH && h !== pendingH && h !== manualH && !READONLY.includes(h)),
    [usable, statusH, pendingH, manualH],
  );

  const set = (h: string, v: string) => setValues((s) => ({ ...s, [h]: v }));

  // ---- Report Pending auto-fills the pending reason ----
  useEffect(() => {
    if (pending && pendingH && values[pendingH] !== 'Report Pending') set(pendingH, 'Report Pending');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pendingH]);

  // ---- Manual report upload ----
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualLink, setManualLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const doUpload = async () => {
    if (!manualFile || !ucn) return;
    setUploading(true); setErr('');
    const res = await uploadManualReport(ucn, manualH || 'Manual Report', manualFile);
    if (!res.ok) { setErr(`Upload failed: ${res.error}`); setUploading(false); return; }
    // Response is opaque; confirm by re-reading the report link.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const rr = await getReport(ucn);
      const link = manualH ? String(rr.row[manualH] ?? '') : '';
      setManualLink(link || 'uploaded');
      if (manualH) set(manualH, link);
    } catch { setManualLink('uploaded'); }
    setManualFile(null);
    setUploading(false);
  };

  // ---- Spare consumption (v2Consumption) — added one by one ----
  const [consHeaders, setConsHeaders] = useState<string[] | null>(null);
  const [spareDraft, setSpareDraft] = useState<Record<string, string>>({});
  const [spares, setSpares] = useState<Record<string, string>[]>([]);
  const [spareBusy, setSpareBusy] = useState(false);

  // ---- Customer feedback (v2Feedback) ----
  const [fbHeaders, setFbHeaders] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [subNote, setSubNote] = useState(''); // note if the v2 tabs aren't reachable

  // Lazily load the sub-form schemas the first time a call is marked solved.
  useEffect(() => {
    if (!solved || !open) return;
    let cancelled = false;
    if (consHeaders === null) {
      tabMeta(CONSUMPTION_TAB)
        .then((h) => { if (!cancelled) { setConsHeaders(h); setSpareDraft({ [ucnColOf(h)]: ucn }); } })
        .catch(() => { if (!cancelled) { setConsHeaders([]); setSubNote(`“${CONSUMPTION_TAB}” / “${FEEDBACK_TAB}” tabs not found in the Call Register — spare/feedback capture is disabled until they exist (or send me their sheet link).`); } });
    }
    if (fbHeaders === null) {
      tabMeta(FEEDBACK_TAB)
        .then((h) => { if (!cancelled) { setFbHeaders(h); setFeedback((f) => ({ ...f, [ucnColOf(h)]: ucn })); } })
        .catch(() => { if (!cancelled) setFbHeaders([]); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, open]);

  const addSpare = async () => {
    if (!consHeaders || consHeaders.length === 0) return;
    const meaningful = Object.entries(spareDraft).some(([k, v]) => !/uc\s*number|ucn|call\s*number/i.test(k) && String(v).trim() !== '');
    if (!meaningful) { setErr('Enter the spare details before adding.'); return; }
    setSpareBusy(true); setErr('');
    const payload = { ...spareDraft, [ucnColOf(consHeaders)]: ucn };
    const res = await tabAppend(CONSUMPTION_TAB, payload);
    if (res.ok) {
      setSpares((s) => [...s, payload]);
      setSpareDraft({ [ucnColOf(consHeaders)]: ucn }); // reset for the next spare
    } else setErr(`Couldn't save spare: ${res.error}`);
    setSpareBusy(false);
  };

  // ---- validation + save ----
  const validate = (): string => {
    if (!ucn) return 'This call has no UC Number to report against.';
    if (statusH && !status) return 'Choose a Call Status.';
    if (unsolved && pendingH && !String(values[pendingH] ?? '').trim()) return 'Enter the pending reason.';
    if (solved) {
      const missing = detailHeaders.filter((h) => CORE_SOLVED.some((re) => re.test(h)) && !String(values[h] ?? '').trim());
      if (missing.length) return `Fill the report details: ${missing.join(', ')}.`;
      if (manualH && !manualLink) return 'Upload the manual report.';
    }
    return '';
  };

  const save = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true); setErr('');
    try {
      // Report patch: changed, editable fields (UC Number kept for a first append).
      const patch: Record<string, unknown> = {};
      usable.forEach((h) => {
        if (READONLY.includes(h) && h !== 'UC Number') return;
        if (String(values[h] ?? '') !== String(existing[h] ?? '')) patch[h] = values[h] ?? '';
      });
      const res = await saveReport(ucn, patch);
      if (!res.ok) { setErr(res.error ?? 'Save failed.'); setBusy(false); return; }

      // Customer feedback (append once, if filled) → v2Feedback.
      if (solved && fbHeaders && fbHeaders.length) {
        const filled = Object.entries(feedback).some(([k, val]) => !/uc\s*number|ucn/i.test(k) && String(val).trim() !== '');
        if (filled) await tabAppend(FEEDBACK_TAB, { ...feedback, [ucnColOf(fbHeaders)]: ucn });
      }
      onSaved?.(res.mode ?? 'saved', ucn);
      onClose();
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Render one report field. A plain function (not a nested component) so the
  // inputs keep focus while typing — a nested component would remount per render.
  const renderField = (h: string, locked?: boolean) => {
    const long = LONG_MATCH.test(h);
    const ro = locked || READONLY.includes(h);
    return (
      <label className={`rep-field ${long ? 'rep-span2' : ''}`} key={h}>
        <span className="field-label">{h}</span>
        {long ? (
          <textarea className="input" rows={2} value={values[h] ?? ''} readOnly={ro} onChange={(e) => set(h, e.target.value)} />
        ) : (
          <input className="input" value={values[h] ?? ''} readOnly={ro} onChange={(e) => set(h, e.target.value)} />
        )}
      </label>
    );
  };

  const idHeaders = usable.filter((h) => READONLY.includes(h));

  return (
    <Drawer open={open} onClose={onClose} title={ucn ? `Update Call — ${ucn}` : 'Update Call'} width={820}>
      <div className="detail-hint">📝 Report is saved to the <b>Reporting-N</b> tab; spares to <b>{CONSUMPTION_TAB}</b>, feedback to <b>{FEEDBACK_TAB}</b>.</div>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      {loading ? (
        <div className="muted" style={{ padding: 16 }}>Loading report…</div>
      ) : usable.length === 0 ? (
        <div className="muted" style={{ padding: 16 }}>{err ? '' : 'No reporting columns found on the Reporting-N tab.'}</div>
      ) : (
        <div className="rep-form">
          {/* Identifying */}
          {idHeaders.length > 0 && (
            <section className="rep-sec">
              <div className="rep-grid">{idHeaders.map((h) => renderField(h, true))}</div>
            </section>
          )}

          {/* Status routing */}
          <section className="rep-sec">
            <div className="rep-sec-title">Call Status</div>
            <div className="rep-grid">
              <label className="rep-field">
                <span className="field-label">{statusH || 'Call Status'}</span>
                <select className="select" value={status} onChange={(e) => statusH && set(statusH, e.target.value)} disabled={!statusH}>
                  <option value="">— Select status —</option>
                  {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  {status && !STATUS_OPTIONS.includes(status) && <option value={status}>{status}</option>}
                </select>
              </label>
              {pendingH && (unsolved || pending) && (
                <label className="rep-field rep-span2">
                  <span className="field-label">{pendingH}{unsolved ? ' *' : ''}</span>
                  <input className="input" list="dl-pendingreason" value={values[pendingH] ?? ''} readOnly={pending} onChange={(e) => set(pendingH, e.target.value)} />
                  {!pending && pendingReasons.values.length > 0 && (
                    <datalist id="dl-pendingreason">
                      {pendingReasons.values.slice(0, 1000).map((v) => <option key={v} value={v} />)}
                    </datalist>
                  )}
                  {pending && <span className="muted rep-hint">Set automatically for a pending report.</span>}
                </label>
              )}
            </div>
            {!status && <div className="muted rep-hint">Choose a status to continue — the form adapts to it.</div>}
          </section>

          {/* Report details — required core fields when solved, optional otherwise */}
          {status && (
            <section className="rep-sec">
              <div className="rep-sec-title">Report details {solved ? '' : <span className="muted">(optional)</span>}</div>
              <div className="rep-grid">{detailHeaders.map((h) => renderField(h))}</div>
            </section>
          )}

          {/* Manual report (solved) */}
          {solved && (
            <section className="rep-sec">
              <div className="rep-sec-title">Manual report *</div>
              {manualLink ? (
                <div className="rep-manual-done">
                  ✓ Uploaded{manualLink !== 'uploaded' && <> — <a href={manualLink} target="_blank" rel="noreferrer">open</a></>}
                  <button className="btn btn-sm btn-ghost" onClick={() => { setManualLink(''); if (manualH) set(manualH, ''); }}>Replace</button>
                </div>
              ) : (
                <div className="rep-upload">
                  <input type="file" onChange={(e) => setManualFile(e.target.files?.[0] ?? null)} />
                  <button className="btn btn-sm btn-primary" disabled={!manualFile || uploading} onClick={() => void doUpload()}>{uploading ? 'Uploading…' : '⭱ Upload report'}</button>
                </div>
              )}
            </section>
          )}

          {/* Spare consumption (solved) — added one by one */}
          {solved && (
            <section className="rep-sec">
              <div className="rep-sec-title">Spare consumption <span className="muted">→ {CONSUMPTION_TAB}</span></div>
              {subNote && <div className="muted rep-hint">{subNote}</div>}
              {consHeaders && consHeaders.length > 0 && (
                <>
                  {spares.length > 0 && (
                    <ul className="rep-spare-list">
                      {spares.map((s, i) => (
                        <li key={i}>✓ {consHeaders.filter((h) => !/uc\s*number|ucn|call\s*number/i.test(h) && s[h]).map((h) => `${h}: ${s[h]}`).join(' · ') || 'spare added'}</li>
                      ))}
                    </ul>
                  )}
                  <div className="rep-grid">
                    {consHeaders.filter((h) => !/uc\s*number|ucn|call\s*number/i.test(h)).map((h) => (
                      <label className="rep-field" key={h}>
                        <span className="field-label">{h}</span>
                        <input className="input" value={spareDraft[h] ?? ''} onChange={(e) => setSpareDraft((s) => ({ ...s, [h]: e.target.value }))} />
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-sm" disabled={spareBusy} onClick={() => void addSpare()}>{spareBusy ? 'Adding…' : '＋ Add spare'}</button>
                </>
              )}
            </section>
          )}

          {/* Customer feedback (solved) */}
          {solved && fbHeaders && fbHeaders.length > 0 && (
            <section className="rep-sec">
              <div className="rep-sec-title">Customer feedback <span className="muted">→ {FEEDBACK_TAB}</span></div>
              <div className="rep-grid">
                {fbHeaders.filter((h) => !/uc\s*number|ucn/i.test(h)).map((h) => (
                  <label className="rep-field" key={h}>
                    <span className="field-label">{h}</span>
                    <input className="input" value={feedback[h] ?? ''} onChange={(e) => setFeedback((f) => ({ ...f, [h]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </section>
          )}

          <div className="rep-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !status}>{busy ? 'Saving…' : 'Save Report'}</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
