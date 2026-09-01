import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import { parseCSV, bulkInsert } from '../lib/dataImport';
import { shapePmRows, pmTemplateCsv, PM_TEMPLATE_HEADERS } from '../lib/pmImport';
import './fieldcalls.css';

// ===========================================================================
// PM BULK UPLOAD — Admin / Super-Admin only. The monthly Preventive-Maintenance
// batch is thousands of calls; upload the spreadsheet and every row is created
// as a PM call (call_type 'P M VISIT' → pm_calls), the server assigning the UCN
// and Call Number. Reuses the bulk-insert plumbing; forces the PM type.
// ===========================================================================

const s = (v: unknown) => String(v ?? '');

export function PmBulkUpload() {
  const { isAdmin } = useAuth();
  const onDb = supabaseConfigured();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  // Due month (YYYY-MM); defaults to the current month. Pick a past month to
  // backfill — every call in the batch is dated the 1st of this month.
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const rows = useMemo(() => shapePmRows(raw, month), [raw, month]);
  const rawCount = raw.length;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="PM Bulk Upload" subtitle="Upload the monthly Preventive Maintenance batch." icon="⬆️" />
        <div className="sheet-banner sheet-banner-info"><span>🔒 PM bulk upload is for Admin / Super-Admin only.</span></div>
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
      setRaw(parsed);
      const shaped = shapePmRows(parsed, month);
      setMsg(shaped.length
        ? { tone: 'info', text: `${shaped.length} PM call${shaped.length === 1 ? '' : 's'} ready from ${parsed.length} row${parsed.length === 1 ? '' : 's'}. Check the due month, review below, then Import.` }
        : { tone: 'error', text: 'No usable rows — the file needs at least a Party / Product / Serial column. Download the template for the expected columns.' });
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
    if (!rows.length) return;
    setBusy(true); setProgress({ done: 0, total: rows.length }); setMsg({ tone: 'info', text: 'Importing…' });
    const res = await bulkInsert('calls', rows, (p) => setProgress(p));
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: `Imported ${res.inserted} before an error: ${res.error}` }); return; }
    setMsg({ tone: 'ok', text: `Created ${res.inserted} PM call${res.inserted === 1 ? '' : 's'} — each got a UCN and Call Number. They’re in the Preventive (PM) register.` });
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
        <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
          Every row is created as a <b>PM call</b> dated the <b>1st of {month || 'the chosen month'}</b> (the due month — pick a past month to backfill).
          Today’s date is recorded as <b>Added On</b>, and each call gets a per-month serial (<b>PM-{month || 'YYYY-MM'}-####</b>) plus its UCN and Call Number, assigned automatically.
          Recognised columns: {PM_TEMPLATE_HEADERS.join(', ')} — anything else is kept on the call.
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <div className="pm-preview-head">
            <b>{rows.length}</b> PM calls to create{rawCount !== rows.length ? ` (${rawCount - rows.length} blank row${rawCount - rows.length === 1 ? '' : 's'} skipped)` : ''} — first {preview.length} shown:
          </div>
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 640 }}>
              <thead><tr><th>Party</th><th>Product</th><th>Serial</th><th>Engineer</th><th>Reg Date</th><th>Added On</th><th>Type</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{s(r.party_name)}</td><td>{s(r.product_name)}</td><td>{s(r.serial)}</td>
                    <td>{s(r.allocated_to)}</td><td>{s(r.reg_date)}</td><td>{s(r.added_on)}</td><td>{s(r.call_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pm-up-row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => void doImport()} disabled={busy || !onDb}>
              {busy ? 'Importing…' : `⬆️ Import ${rows.length} PM calls`}
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
    </div>
  );
}
