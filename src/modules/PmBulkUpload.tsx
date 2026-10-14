import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured, pmLatestRegAt, uploadRows, listMaster, sbActiveUserNames, listPmCallsInMonth } from '../lib/supabase';
import { parseCSV } from '../lib/csv';
import { preparePmUpload, pmHeldSummary, pmStartDefaults, pmTemplateCsv, PM_TEMPLATE_HEADERS,
  type PmUploadContext } from '../lib/pmImport';
import './fieldcalls.css';
import { formatDayTime } from '../lib/dates';

// ===========================================================================
// PM BULK UPLOAD — Admin / Super-Admin only. The monthly Preventive-Maintenance
// batch is thousands of calls; upload the spreadsheet and every row is created
// as a PM call (call_type 'P M VISIT' → pm_calls), the server assigning the UCN
// and Call Number. Reuses the bulk-insert plumbing; forces the PM type.
//
// WHAT IT WILL NOT CREATE (D-038; FRS-142.4, .5, .11): a row with no serial, a
// row whose Standard Complaint is not on the product's complaint master or
// whose engineer is not active on the User Master, a machine repeated in the
// file, and a machine that already has a PM call in the due month (skipped
// with that call's UCN, which is left as it is). Each is HELD BACK BY NAME --
// preparePmUpload in pmImport.ts decides, this screen shows and writes only
// what it kept. The three lists it checks against are read BEFORE anything can
// be imported: a check that could not run does not pass.
// ===========================================================================

const s = (v: unknown) => String(v ?? '');
// A reg_at timestamp in the project's one format, dd-MMM-yyyy HH:mm:ss in the
// reader's own time (R3). It printed the browser's locale without the YEAR.
const fmtAt = (iso: unknown) => formatDayTime(s(iso));

export function PmBulkUpload() {
  const { can } = useAuth();
  // Its own key, `pm.bulk_upload`; each call it creates still passes pm_calls' own insert policy.
  const mayUpload = can('pm.bulk_upload');
  const onDb = supabaseConfigured();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  // Due month (YYYY-MM); defaults to the current month. Pick a past month to
  // backfill — every call in the batch is dated the 1st of this month.
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // Registration date-and-time for the batch: the first call's timestamp and
  // the gap between calls. Pre-filled per month (00:30 + 5s for a fresh month,
  // or 10s after the latest existing call), then editable.
  const [startLocal, setStartLocal] = useState(() => `${new Date().toISOString().slice(0, 7)}-01T00:30:00`);
  const [stepSec, setStepSec] = useState(5);
  const hasFile = raw.length > 0;

  // THE THREE LISTS A ROW IS CHECKED AGAINST, read once a file is loaded: the
  // complaint master with its products and the active User Master (read again
  // for every file, kept while only the month changes), and the month's PM
  // calls (read again for every month and every file, since an import or PM
  // Due adds to them).
  const masters = useRef<Pick<PmUploadContext, 'complaints' | 'activeEngineers'> | null>(null);
  const [ctx, setCtx] = useState<PmUploadContext | null>(null);
  const [ctxError, setCtxError] = useState('');
  const [ctxNonce, setCtxNonce] = useState(0);
  useEffect(() => {
    setCtx(null); setCtxError('');
    if (!onDb || !hasFile) return;
    let live = true;
    (async () => {
      try {
        if (!masters.current) {
          const [complaints, activeEngineers] = await Promise.all([listMaster('complaintProducts'), sbActiveUserNames()]);
          masters.current = { complaints, activeEngineers };
        }
        const existing = await listPmCallsInMonth(month);
        if (live) setCtx({ ...masters.current, existing });
      } catch (err) {
        if (live) setCtxError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { live = false; };
  }, [month, onDb, hasFile, ctxNonce]);

  const prepared = useMemo(() => (ctx ? preparePmUpload(raw, month, startLocal, stepSec, ctx) : null),
    [ctx, raw, month, startLocal, stepSec]);
  const rows = prepared?.kept ?? [];
  const held = prepared?.held ?? [];
  const blank = prepared?.blank ?? 0;
  const heldNote = pmHeldSummary(held);

  // When the due month changes, re-derive the default start time and gap from
  // whatever the chosen month already holds. Falls back to the fresh-month
  // default if the lookup fails (e.g. the DB script isn't applied yet).
  useEffect(() => {
    if (!onDb) { setStartLocal(`${month}-01T00:30:00`); setStepSec(5); return; }
    let live = true;
    (async () => {
      let latest: string | null = null;
      try { latest = await pmLatestRegAt(month); } catch { latest = null; }
      if (!live) return;
      const d = pmStartDefaults(month, latest);
      setStartLocal(d.startLocal); setStepSec(d.stepSec);
    })();
    return () => { live = false; };
  }, [month, onDb]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  if (!mayUpload) {
    return (
      <div>
        <PageHeader title="PM Bulk Upload" subtitle="Upload the monthly Preventive Maintenance batch." icon="⬆️" />
        <div className="sheet-banner sheet-banner-info"><span>🔒 PM bulk upload needs “Upload PM calls in bulk” on Roles &amp; Permissions.</span></div>
      </div>
    );
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFileName(f.name); setMsg(null); setProgress(null);
    try {
      const text = await f.text();
      const parsed = parseCSV(text);
      masters.current = null;   // a new file is checked against the lists as they are now
      setCtxNonce((n) => n + 1);
      setRaw(parsed);
      // What is created and what is held back is worked out once the master
      // lists and the month's calls are read, and shown below the controls.
      if (!parsed.length) setMsg({ tone: 'error', text: 'No usable rows — the file needs at least a Party / Product / Serial column. Download the template for the expected columns.' });
    } catch (err) {
      setMsg({ tone: 'error', text: `Could not read the file: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([pmTemplateCsv()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pm-bulk-upload-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    if (!rows.length || !prepared) return;
    // THE CONFIRMATION SAYS WHAT IS LEFT OUT, as the preview does.
    if (held.length && !window.confirm(`Create ${rows.length} PM call${rows.length === 1 ? '' : 's'} dated 1st ${month}?\n\n${heldNote} They are not created.`)) return;
    const heldAtImport = heldNote;
    setBusy(true); setProgress({ done: 0, total: rows.length }); setMsg({ tone: 'info', text: 'Importing…' });
    // The same writer every upload uses. Through the `calls` view, insert-only:
    // the batch is NEW calls, the database assigns each its UCN and Call Number
    // on the way in. A machine that already has a PM call this month never
    // reaches here -- preparePmUpload skipped it by name (FRS-142.11).
    const res = await uploadRows('calls', rows, undefined, (done, total) => setProgress({ done, total }));
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: `Imported ${res.written} before an error: ${res.error}${heldAtImport ? ` (${heldAtImport})` : ''}` });
      setCtxNonce((n) => n + 1);   // the month now holds what was written
      return;
    }
    setMsg({ tone: 'ok', text: `Created ${res.written} PM call${res.written === 1 ? '' : 's'} — each got a UCN and Call Number. They’re in the Preventive (PM) register.${heldAtImport ? ` ${heldAtImport} Nothing was created for them.` : ''}` });
    setRaw([]); setFileName('');
  };

  const preview = rows.slice(0, 8);

  return (
    <div>
      <PageHeader title="PM Bulk Upload" subtitle="Create the monthly Preventive Maintenance batch from a spreadsheet." icon="⬆️" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {!onDb && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings to import.</span></div>}

      <div className="pm-up">
        <div className="pm-up-row">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy || !onDb}>📄 Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <button className="btn" onClick={downloadTemplate}>⭳ Download template</button>
          <label className="pm-month">Due month
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {fileName && <span className="muted">{fileName}</span>}
        </div>
        <div className="pm-up-row">
          <label className="pm-month">First registered at
            <input className="input" type="datetime-local" step={1} value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
          </label>
          <label className="pm-month">Gap between calls
            <input className="input" style={{ width: 90 }} type="number" min={0} step={1} value={stepSec}
              onChange={(e) => setStepSec(Math.max(0, Number(e.target.value) || 0))} /> sec
          </label>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
          Every row is created as a <b>PM call</b> dated the <b>1st of {month || 'the chosen month'}</b> (the due month — pick a past month to backfill).
          Today’s date is recorded as <b>Added On</b>. Calls are ordered by their <b>registration date &amp; time</b>: the first at the time above, each next one <b>{stepSec}s</b> later — pre-filled per month (00:30 + 5s for a fresh month, or 10s after the latest existing call) and editable here.
          Include a <b>Call Number</b> column to set your own; leave it blank and one is assigned automatically. (The UCN is always assigned by the system.)
          Recognised columns: {PM_TEMPLATE_HEADERS.join(', ')} — anything else is kept on the call.
        </p>
        <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
          <b>Held back, by row:</b> a row with no serial; a Standard Complaint not on the product’s complaint master; an engineer who is not active on the User Master;
          the same machine (product + serial) twice in the file — the first is kept; and a machine that <b>already has a PM call in this month</b> — skipped with that call’s UCN, which is not changed.
          A blank complaint or engineer is not held back.
        </p>
      </div>

      {hasFile && onDb && !prepared && (
        ctxError
          ? <div className="sheet-banner sheet-banner-error"><span>Could not read the lists every row is checked against (complaint master, User Master, this month’s PM calls): {ctxError}. Nothing can be imported until they are read.</span>
              <button className="btn btn-sm" onClick={() => setCtxNonce((n) => n + 1)}>Try again</button></div>
          : <div className="sheet-banner sheet-banner-info"><span>Checking the rows against the complaint master, the User Master and this month’s PM calls…</span></div>
      )}

      {prepared && (rows.length > 0 || held.length > 0) && (
        <>
          <div className="pm-preview-head">
            <b>{rows.length}</b> PM call{rows.length === 1 ? '' : 's'} to create
            {blank ? ` (${blank} blank row${blank === 1 ? '' : 's'} skipped)` : ''}
            {rows.length ? ` — first ${preview.length} shown:` : ''}
          </div>
          {rows.length > 0 && (
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 640 }}>
              <thead><tr><th>Call No</th><th>Party</th><th>Product</th><th>Serial</th><th>Engineer</th><th>Registered at</th><th>Added On</th><th>Type</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{s(r.call_number) || <span className="muted">auto</span>}</td>
                    <td>{s(r.party_name)}</td><td>{s(r.product_name)}</td><td>{s(r.serial)}</td>
                    <td>{s(r.allocated_to)}</td><td>{fmtAt(r.reg_at)}</td><td>{s(r.added_on)}</td><td>{s(r.call_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {held.length > 0 && (
            <>
              {/* HELD BACK BY NAME (D-038): what is not created, and why --
                  every one, so the file can be corrected rather than guessed at. */}
              <div className="sheet-banner sheet-banner-error" style={{ marginTop: 12 }}><span>{heldNote} They will not be created.</span></div>
              <div className="assoc-scroll" style={{ maxHeight: 320 }}>
                <table className="assoc-table" style={{ minWidth: 640 }}>
                  <thead><tr><th title="The line in the file, the headings being line 1">Row</th><th>Party</th><th>Product</th><th>Serial</th><th>Why it is held back</th></tr></thead>
                  <tbody>
                    {held.map((h) => (
                      <tr key={h.row}>
                        <td>{h.row}</td><td>{h.party}</td><td>{h.product}</td><td>{h.serial || <span className="muted">(none)</span>}</td>
                        <td>{h.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="pm-up-row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => void doImport()} disabled={busy || !onDb || !rows.length}>
              {busy ? 'Importing…' : `⬆️ Import ${rows.length} PM call${rows.length === 1 ? '' : 's'}`}
            </button>
            <button className="btn" onClick={() => { setRaw([]); setFileName(''); setMsg(null); }} disabled={busy}>Clear</button>
            {progress && (
              <span className="muted">{progress.done} / {progress.total}</span>
            )}
          </div>
          {progress && busy && (
            <div className="pm-bar"><div className="pm-bar-fill" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
          )}
        </>
      )}
      {prepared && rows.length === 0 && held.length === 0 && (
        <div className="sheet-banner sheet-banner-error"><span>No usable rows — the file needs at least a Party / Product / Serial column. Download the template for the expected columns.</span></div>
      )}
    </div>
  );
}
