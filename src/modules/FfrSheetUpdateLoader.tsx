import { useState } from 'react';
import { Modal } from '../components/ui/ui';
import { parseCSV } from '../lib/csv';
import { findHeaderFor } from '../lib/headers';
import { toIsoTimestamp, formatDayTime } from '../lib/dates';
import { csvExport } from '../lib/format';
import { COMPLETE } from '../lib/exportscope';
import { logAudit } from '../lib/audit';
import { loadFfrSheetUpdates, type FfrSheetRow, type FfrSheetResult } from '../lib/supabase';

// ===========================================================================
// THE OLD FFR UPDATE LOG, LOADED (0409, the user, 2026-10-10: "Add a provision
// to update the old Logs for FFR"). The "Field Failure Register - Update"
// sheet as exported to CSV: every row becomes a dated entry in its report's
// Update log, signed "FFR Update sheet (import)", and the report then carries
// its latest values. Matched on FFR No + UCN (the user's rule); a row that does
// not match is listed back -- with the register's UCN beside it -- and can be
// downloaded, corrected and loaded again. Re-loading adds nothing twice.
//
// The rows go in batches, and ONE FFR's rows are never split across two: the
// log entry says what changed since the update before it, and the database
// reads that from the rows already loaded.
// ===========================================================================

const COLS: { to: keyof FfrSheetRow; from: string[] }[] = [
  { to: 'at', from: ['timestamp'] },
  { to: 'ucn', from: ['ucn number', 'ucn', 'crn no (ucn)'] },
  { to: 'ffr_no', from: ['ffr no: (no/yr)', 'ffr no', 'ffr number'] },
  { to: 'problem_status', from: ['problem status'] },
  { to: 'service_observation', from: ['service dept observation', 'service observation'] },
  { to: 'capa_responsibility', from: ['capa(if reqd) responsibility', 'capa (if reqd) responsibility', 'capa responsibility'] },
  { to: 'capa_no', from: ['capa no: f<no>/yr', 'capa no'] },
  { to: 'capa_status', from: ['capa status (closed=ü )', 'capa status'] },
  { to: 'ffr_status', from: ['ffr status'] },
  { to: 'attachment_url', from: ['attachment(if any)', 'attachment'] },
  { to: 'additional_problem', from: ['additional problem description'] },
  { to: 'word_copy', from: ['generate ffr word copy?'] },
];
const BATCH = 250;
const key = (ffr: string) => ffr.toUpperCase().replace(/\s/g, '');

export function FfrSheetUpdateLoader({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FfrSheetRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<FfrSheetResult | null>(null);

  const reset = () => { setRows(null); setFileName(''); setErr(''); setProgress(''); setResult(null); };

  const read = async (f: File) => {
    reset();
    setFileName(f.name);
    const raw = parseCSV(await f.text(), { aliases: COLS.flatMap((c) => c.from) });
    if (!raw.length) { setErr('The file has no rows.'); return; }
    const headers = Object.keys(raw[0]);
    const at = Object.fromEntries(COLS.map((c) => [c.to, findHeaderFor(headers, c.from)]));
    const missing = (['at', 'ucn', 'ffr_no'] as const).filter((k) => !at[k]);
    if (missing.length) {
      setErr(`The file has no ${missing.map((m) => COLS.find((c) => c.to === m)!.from[0]).join(', ')} column. Export the update sheet's tab as CSV, headings in the first row.`);
      return;
    }
    const out: FfrSheetRow[] = [];
    raw.forEach((r, i) => {
      const v = (k: keyof FfrSheetRow) => (at[k] ? String(r[at[k]!] ?? '').trim() : '');
      // A wholly blank line is not a row of the sheet.
      if (COLS.every((c) => !v(c.to))) return;
      out.push({
        row: i + 2, ffr_no: v('ffr_no'), ucn: v('ucn'),
        // Day-first, read in this browser's time (IST for IST) -- the rule every importer uses.
        at: toIsoTimestamp(v('at'), 'local'),
        problem_status: v('problem_status'), service_observation: v('service_observation'),
        capa_responsibility: v('capa_responsibility'), capa_no: v('capa_no'), capa_status: v('capa_status'),
        ffr_status: v('ffr_status'), attachment_url: v('attachment_url'),
        additional_problem: v('additional_problem'), word_copy: v('word_copy'),
      });
    });
    setRows(out);
  };

  const load = async () => {
    if (!rows?.length) return;
    // One FFR's rows together, oldest first, never split across batches.
    const groups = new Map<string, FfrSheetRow[]>();
    for (const r of rows) {
      const k = key(r.ffr_no);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const batches: FfrSheetRow[][] = [];
    let cur: FfrSheetRow[] = [];
    for (const g of groups.values()) {
      g.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')) || a.row - b.row);
      if (cur.length && cur.length + g.length > BATCH) { batches.push(cur); cur = []; }
      cur.push(...g);
    }
    if (cur.length) batches.push(cur);

    setBusy(true); setErr('');
    const total: FfrSheetResult = { loaded: 0, unchanged: 0, already: 0, reports: 0, fields_applied: 0, kept_newer: 0, rejected: [] };
    try {
      for (let i = 0; i < batches.length; i += 1) {
        setProgress(`Loading batch ${i + 1} of ${batches.length}…`);
        const r = await loadFfrSheetUpdates(batches[i]);
        total.loaded += r.loaded; total.unchanged += r.unchanged; total.already += r.already;
        total.reports += r.reports; total.fields_applied += r.fields_applied; total.kept_newer += r.kept_newer;
        total.rejected.push(...(r.rejected ?? []));
      }
      total.rejected.sort((a, b) => a.row - b.row);
      setResult(total);
      logAudit({ action: 'ffr.sheet_updates.load', target: fileName, status: 'ok',
        meta: { rows: rows.length, loaded: total.loaded, rejected: total.rejected.length, already: total.already } });
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(`Stopped: ${m}${total.loaded ? ` (${total.loaded} rows were loaded before it stopped; loading the file again adds only the rest).` : ''}`);
      logAudit({ action: 'ffr.sheet_updates.load', target: fileName, status: 'error', error: m });
    } finally { setBusy(false); setProgress(''); }
  };

  const ffrs = rows ? new Set(rows.map((r) => key(r.ffr_no)).filter(Boolean)).size : 0;
  const dated = rows?.filter((r) => r.at).map((r) => r.at!).sort() ?? [];

  return (
    <>
      <button className="btn btn-sm" onClick={() => { reset(); setOpen(true); }}
        title="Load the old Field Failure Register - Update sheet into each report's Update log">⭱ Load old update log</button>
      <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="Load the old FFR update log" width={820}>
        <div className="rep-form">
          <p className="muted" style={{ marginTop: 0 }}>
            The <b>Field Failure Register – Update</b> sheet, as CSV. Each row goes to the report with the same
            <b> FFR No and UCN</b>, and becomes a dated entry in its Update log (at the sheet’s Timestamp, signed
            “FFR Update sheet (import)”). The report then shows its latest Problem Status, Observation, CAPA
            Responsibility, CAPA No, CAPA Status, FFR Status, Attachment and Additional Problem. A blank cell never
            erases anything, and a change made in RITHI after the sheet’s update is kept. A row whose FFR No + UCN
            is not on the register is listed back and not loaded. Loading the same file again adds nothing twice.
          </p>
          {!result && (
            <input type="file" accept=".csv,text/csv" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
          )}
          {err && <div className="field-err" style={{ marginTop: 8 }}>{err}</div>}
          {rows && !result && (
            <div style={{ marginTop: 10 }}>
              <div><b>{rows.length.toLocaleString()}</b> update row{rows.length === 1 ? '' : 's'} for <b>{ffrs.toLocaleString()}</b> FFR number{ffrs === 1 ? '' : 's'}
                {dated.length > 0 && <>, {formatDayTime(dated[0])} to {formatDayTime(dated[dated.length - 1])}</>}.
                {rows.length - dated.length > 0 && <> <b>{rows.length - dated.length}</b> have no readable Timestamp and will be listed back.</>}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => void load()}>
                  {busy ? progress || 'Loading…' : `Load ${rows.length.toLocaleString()} rows`}
                </button>
                <button className="btn" disabled={busy} onClick={reset}>Choose another file</button>
              </div>
            </div>
          )}
          {result && (
            <div style={{ marginTop: 6 }}>
              <div className="sheet-banner sheet-banner-ok">
                <span>
                  <b>{result.loaded.toLocaleString()}</b> row{result.loaded === 1 ? '' : 's'} loaded into the Update log
                  {result.unchanged > 0 && <> ({result.unchanged.toLocaleString()} repeated the update before them and add no entry)</>};
                  {' '}<b>{result.reports.toLocaleString()}</b> report{result.reports === 1 ? '' : 's'} updated
                  ({result.fields_applied.toLocaleString()} field{result.fields_applied === 1 ? '' : 's'}).
                  {result.kept_newer > 0 && <> {result.kept_newer.toLocaleString()} field{result.kept_newer === 1 ? ' was' : 's were'} kept because RITHI holds a newer change.</>}
                  {result.already > 0 && <> {result.already.toLocaleString()} {result.already === 1 ? 'was' : 'were'} already loaded.</>}
                  {' '}<b>{result.rejected.length.toLocaleString()}</b> not loaded.
                </span>
              </div>
              {result.rejected.length > 0 && (
                <>
                  <div className="row" style={{ gap: 8, alignItems: 'center', margin: '8px 0' }}>
                    <b>Not loaded</b>
                    <span className="muted">— correct the FFR No or UCN in the sheet and load it again.</span>
                    <div className="spacer" />
                    <button className="btn btn-sm" onClick={() => csvExport('ffr-update-log-not-loaded.csv',
                      [{ key: 'row', header: 'Sheet row' }, { key: 'ffr_no', header: 'FFR NO' }, { key: 'ucn', header: 'UCN in the sheet' },
                       { key: 'register_ucn', header: 'UCN on the register' }, { key: 'reason', header: 'Why' }],
                      result.rejected as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Download</button>
                  </div>
                  <div className="assoc-scroll" style={{ maxHeight: 340 }}>
                    <table className="assoc-table">
                      <thead><tr><th>Row</th><th>FFR NO</th><th>UCN in the sheet</th><th>UCN on the register</th><th>Why</th></tr></thead>
                      <tbody>
                        {result.rejected.map((r) => (
                          <tr key={`${r.row}-${r.ffr_no}`}>
                            <td>{r.row}</td><td style={{ whiteSpace: 'nowrap' }}>{r.ffr_no || '—'}</td>
                            <td>{r.ucn || '—'}</td><td>{r.register_ucn || '—'}</td><td>{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
