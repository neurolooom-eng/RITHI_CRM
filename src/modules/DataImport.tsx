import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { Link } from 'react-router-dom';
import { applyDirectory, bulkInsert, detectTable, directoryColumns, existingKeys, parseCSV, previewNormalise, readDirectory, shapeRows, tableCount, type ImportTable } from '../lib/dataImport';
import { countImportedStockLines, reloadImportedStockLines } from '../lib/supabase';
import { legacyConfirmText, normaliseQuestion, planDirectory, splitByKey, type DirectoryPlan, type FilePlanLine } from '../lib/legacyImportPlan';
import { finishCoverImport } from '../lib/cover';
import { supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { recordAudit } from '../lib/audit';

// Only what Bulk Uploads does not do. See ImportTable.
const TABLES: ImportTable[] = ['user_directory', 'material_returns',
  'sale_entries', 'sale_items', 'contract_entries', 'contract_items'];

// The sale / contract exports. After loading them the copied-down header values
// are folded back into inheritance and the machine master's cover is refreshed
// -- see finishCoverImport().
const COVER_TABLES: ImportTable[] = ['sale_entries', 'sale_items', 'contract_entries', 'contract_items'];

interface FileState {
  name: string;
  table: ImportTable | null;
  total: number;
  done: number;
  status: 'ready' | 'running' | 'done' | 'error';
  error?: string;
  rows?: Record<string, unknown>[];
  /** Rows the file carried before shaping, so the record can say how many
   *  were held back rather than only how many were written. */
  inFile?: number;
  /** The file's headings -- a User Master row overwrites only the columns the
   *  file carries (D-071). */
  headers?: string[];
}

// ONE AUDIT ENTRY PER FILE LOADED AND PER NORMALISE RUN (D-067, FRS-201.8) —
// the same shape as Bulk Uploads' `bulk.upload`, so the two importers read
// alike in the Audit Log. A failure to record is SAID beside the result,
// never allowed to stop a load that has already happened.
const unrecordedNote = (err: string | null) => err ? ` ⚑ Not recorded in the audit log: ${err}` : '';

async function recordImport(f: FileState, o: { outcome: 'completed' | 'stopped' | 'not loaded' | 'cancelled'; written: number; why?: string; started: number }) {
  const inFile = f.inFile ?? f.total;
  return recordAudit({
    action: 'import.legacy', target: f.table ?? '',
    status: o.outcome === 'completed' || o.outcome === 'cancelled' ? 'ok' : 'error',
    error: o.why ?? '',
    duration_ms: Math.round(performance.now() - o.started),
    meta: {
      register: f.table ?? '(unrecognised)', table: f.table ?? '', file: f.name,
      rows_in_file: inFile, rows_ready: f.total, rows_held_back: Math.max(0, inFile - f.total),
      rows_to_write: o.outcome === 'not loaded' || o.outcome === 'cancelled' ? 0 : f.total, rows_written: o.written,
      rows_failed: o.outcome === 'stopped' ? Math.max(0, f.total - o.written) : 0,
      outcome: o.outcome, completed: o.outcome === 'completed',
    },
  });
}

/** Normalise cover, recorded. `trigger` says whether it followed an import or
 *  was pressed on its own. Returns the line to show. */
async function normaliseRecorded(trigger: 'after import' | 'on demand', ok: (r: { unpinned: number; machines: number }) => string, failed: (m: string) => string): Promise<string> {
  const started = performance.now();
  try {
    // URS-072 / FRS-201.7 (D-071): SAY what it hands back, and run it only on
    // confirmation -- after an import as much as on demand.
    const counts = await previewNormalise();
    if (!confirm(normaliseQuestion(counts))) {
      const err = await recordAudit({
        action: 'cover.normalise', target: 'sale_items, contract_items', status: 'ok',
        duration_ms: Math.round(performance.now() - started),
        meta: { trigger, item_values_to_hand_back: counts.reduce((a, c) => a + c.n, 0), outcome: 'cancelled', completed: false },
      });
      return 'Normalise cover was not run — nothing was changed.' + unrecordedNote(err);
    }
    const r = await finishCoverImport();
    const err = await recordAudit({
      action: 'cover.normalise', target: 'sale_items, contract_items', status: 'ok',
      duration_ms: Math.round(performance.now() - started),
      meta: { trigger, item_values_to_hand_back: counts.reduce((a, c) => a + c.n, 0), item_rows_unpinned: r.unpinned, machines_refreshed: r.machines, outcome: 'completed', completed: true },
    });
    return ok(r) + unrecordedNote(err);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const err = await recordAudit({
      action: 'cover.normalise', target: 'sale_items, contract_items', status: 'error', error: m,
      duration_ms: Math.round(performance.now() - started),
      meta: { trigger, outcome: 'stopped', completed: false },
    });
    return failed(m) + unrecordedNote(err);
  }
}

// Admin-only: one-time bulk load of the clean migration CSVs into Supabase,
// running through the signed-in admin session (works from the browser even when
// a server-side load is blocked by network policy).
export function DataImport() {
  // Its own key, `import.panel`; every row it loads still passes that table's policies.
  const { can } = useAuth();
  const mayImport = can('import.panel');
  const [counts, setCounts] = useState<Partial<Record<ImportTable, number | null>>>({});
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState('');

  const [countErr, setCountErr] = useState('');
  const refreshCounts = async () => {
    const out: Partial<Record<ImportTable, number | null>> = {};
    let firstErr = '';
    for (const t of TABLES) { const r = await tableCount(t); out[t] = r.count; if (r.error && !firstErr) firstErr = `${t}: ${r.error}`; }
    setCounts(out);
    setCountErr(firstErr);
  };
  useEffect(() => { if (supabaseConfigured()) void refreshCounts(); }, []);

  if (!mayImport) return null;

  const onPick = async (list: FileList | null) => {
    if (!list) return;
    const next: FileState[] = [];
    for (const f of Array.from(list)) {
      try {
        const text = await f.text();
        const raw = parseCSV(text);
        const table = detectTable(Object.keys(raw[0] ?? {}));
        const rows = table ? shapeRows(table, raw) : [];
        // A recognised file with nothing to insert is worth saying out loud —
        // the MRN export's form-data tab is all submission headers and no
        // returned items, so only its register tab carries rows.
        const empty = !!table && rows.length === 0;
        const why = !table ? 'Unrecognised columns'
          : empty && table === 'material_returns'
            ? 'No returned items in this file — this is the MRN form-data tab (one row per submission). Import the MRN register tab instead.'
            : empty ? 'Recognised as ' + table + ', but no usable rows.'
            : undefined;
        next.push({ name: f.name, table, total: rows.length, done: 0, status: table && !empty ? 'ready' : 'error', error: why, rows, inFile: raw.length, headers: Object.keys(raw[0] ?? {}) });
      } catch (e) {
        next.push({ name: f.name, table: null, total: 0, done: 0, status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setFiles(next);
  };

  const runAll = async () => {
    setBusy(true);
    // D-071, FRS-201.4: READ what is already there, SAY what each file will
    // write and overwrite, and write nothing until the operator confirms.
    const plans: (DirectoryPlan | null)[] = files.map(() => null);
    const lines: FilePlanLine[] = [];
    try {
      const people = files.some((f) => f.table === 'user_directory' && f.status !== 'done') ? await readDirectory() : [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.status === 'done' || !f.table || !f.rows || !f.rows.length) continue;
        const held = Math.max(0, (f.inFile ?? f.total) - f.total);
        if (f.table === 'user_directory') {
          const plan = planDirectory(f.rows, directoryColumns(f.headers ?? []), people);
          plans[i] = plan;
          lines.push({ file: f.name, table: f.table, inFile: f.inFile ?? f.total, fresh: plan.inserts.length, overwrite: plan.updates.length,
            held: held + plan.held.length, why: [...plan.held.map((h) => `${h.name}: ${h.why}`), ...plan.notes] });
        } else if (f.table === 'material_returns') {
          // D-177 (the user's decision, 2026-10-14): an SI Number is loaded
          // WHOLE -- what is already under it is replaced, as on Bulk Uploads.
          const replaces = await countImportedStockLines('mrn', f.rows.map((r) => String(r.uid ?? '')));
          lines.push({ file: f.name, table: f.table, inFile: f.inFile ?? f.total, fresh: f.rows.length, overwrite: 0, held, replaces,
            why: held ? ['a row with no Item Code or no SI Number, or the same part twice on one SI Number'] : [] });
        } else {
          const { keys, key } = await existingKeys(f.table, f.rows);
          const sp = splitByKey(f.rows, key, keys);
          lines.push({ file: f.name, table: f.table, inFile: f.inFile ?? f.total, fresh: sp.fresh, overwrite: sp.overwrite, held });
        }
      }
    } catch (e) {
      setAfter(`Could not read what is already loaded, so nothing was written: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      return;
    }
    const coverFollows = files.some((f) => f.table && COVER_TABLES.includes(f.table) && f.status !== 'done');
    if (lines.length && !confirm(legacyConfirmText(lines, coverFollows))) {
      const started = performance.now();
      for (const f of files) {
        if (f.status === 'done' || !f.table || !f.rows || !f.rows.length) continue;
        await recordImport(f, { outcome: 'cancelled', written: 0, why: 'Cancelled at the confirmation — nothing was written.', started });
      }
      setAfter('Cancelled — nothing was written.');
      setBusy(false);
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const fs = files[i];
      if (fs.status === 'done') continue;
      const started = performance.now();
      if (!fs.table || !fs.rows || !fs.rows.length) {
        // Picked, but not loadable: still part of this import, and recorded
        // with the reason it was not loaded.
        const err = await recordImport(fs, { outcome: 'not loaded', written: 0, why: fs.error ?? 'Not loadable.', started });
        if (err) setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, error: `${x.error ?? ''}${unrecordedNote(err)}` } : x)));
        continue;
      }
      setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, status: 'running', done: 0 } : x)));
      const progress = (p: { done: number }) => {
        setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, done: p.done } : x)));
      };
      const dir = plans[i];
      const res = dir
        ? await applyDirectory(dir, progress).then((r) => ({ ok: r.ok, inserted: r.inserted + r.updated, error: r.error }))
        : fs.table === 'material_returns'
          ? await reloadImportedStockLines('mrn', 'uid', fs.rows, (d) => progress({ done: d })).then((r) => ({ ok: r.ok, inserted: r.written, error: r.error }))
          : await bulkInsert(fs.table, fs.rows, progress);
      const err = await recordImport(fs, { outcome: res.ok ? 'completed' : 'stopped', written: res.inserted, why: res.error, started });
      const shown = [res.error, err ? unrecordedNote(err).trim() : ''].filter(Boolean).join(' ');
      setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, status: res.ok ? 'done' : 'error', error: shown || undefined, done: res.inserted } : x)));
    }
    // The four AppSheet sale / contract exports land as exported; this then
    // hands every value that merely repeats its header back to inheritance,
    // and brings the machine master's cover up to date.
    if (coverFollows) {
      setAfter('Tidying up the imported cover…');
      setAfter(await normaliseRecorded('after import',
        (r) => `Normalised ${r.unpinned} item rows (values repeating their entry now follow it) and refreshed cover on ${r.machines} machines.`,
        (m) => `Import loaded, but the tidy-up step failed: ${m}. Re-run it with the button below.`));
    }
    setBusy(false);
    void refreshCounts();
  };

  return (
    <SectionCard title="Cover normalisation (legacy importer)">
      {/* This panel guesses the target table from a file's HEADERS, which is
          only ever right by luck: it matches `party_name` and not `Party Name`,
          so a real AppSheet export reads as "0 rows · Unrecognised columns" and
          says nothing about why. Bulk Uploads asks which register the file is
          for instead. What is kept here is the one thing Bulk Uploads does not
          do: normalising the four AppSheet sale / contract exports into
          inheritance afterwards. */}
      <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 12 }}>
        <span>
          <b>Loading a register? Use <Link to="/bulk-uploads">Bulk Uploads</Link> instead.</b>{' '}
          It has an uploader per register — you pick the register rather than hoping this one
          guesses right from the column names, and it shows you what will be written first.
          This panel stays for the four AppSheet sale / contract exports and the{' '}
          <b>Normalise cover</b> step that follows them.
        </span>
      </div>
      <div className="muted" style={{ marginBottom: 12 }}>
        One-time load of the clean migration CSVs. Select the files (the table is
        auto-detected from the columns) and Import. Before anything is written it
        says, per file, how many rows are new and how many are already there, and
        asks. A row already there is matched on its key — the sale / contract
        number, the MRN line (SI Number, part and line), the person's name on the
        User Master — and OVERWRITTEN with the file's values, so loading the same
        file again corrects rather than adds. A User Master row changes only the
        columns the file carries.
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABLES.map((t) => (
          <span key={t} className="badge badge-neutral">{t}: {counts[t] == null ? '—' : counts[t]}</span>
        ))}
        <button className="btn btn-sm" onClick={() => void refreshCounts()} disabled={busy}>↻ Counts</button>
      </div>
      {countErr && <div className="sheet-banner sheet-banner-error" style={{ marginBottom: 12 }}><span>Count check failed — {countErr} (a “—” means the query errored, not that the table is empty). If the project is paused, open it in Supabase to resume; if you’re signed out, sign in again.</span></div>}

      <input type="file" accept=".csv" multiple onChange={(e) => void onPick(e.target.files)} disabled={busy} />

      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        The four AppSheet exports (Sale Entry, Warranty Sale Details, Contract Entry,
        Contract Details) are recognised as they come — every column is loaded, into
        the table's own column where there is one and into <code>extra</code> otherwise.
        Any order works: a machine whose entry has not been loaded yet gets a stub
        entry, which the entry file then fills in.
      </div>
      {after && <div className="sheet-banner sheet-banner-info" style={{ marginTop: 10 }}><span>{after}</span></div>}

      {files.length > 0 && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {files.map((f, i) => (
            <div key={i} className="row" style={{ gap: 10, alignItems: 'center' }}>
              <span style={{ minWidth: 90 }} className={`badge badge-${f.status === 'done' ? 'success' : f.status === 'error' ? 'danger' : f.status === 'running' ? 'primary' : 'neutral'}`}>
                {f.table ?? '??'}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>
                {f.name} — {f.total} rows{f.status === 'running' || f.status === 'done' ? ` · ${f.done}/${f.total}` : ''}
                {f.error && <span className="danger"> · {f.error}</span>}
              </span>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void runAll()} disabled={busy || !files.some((f) => f.table && f.status !== 'done')}>
              {busy ? 'Importing…' : `Import ${files.filter((f) => f.table && f.status !== 'done').length} file(s)`}
            </button>
            <button className="btn" disabled={busy} title="Fold repeated header values back into inheritance and refresh machine cover"
              onClick={() => { setAfter('Working…'); void normaliseRecorded('on demand',
                (r) => `Normalised ${r.unpinned} item rows and refreshed cover on ${r.machines} machines.`,
                (m) => `Failed: ${m}`).then(setAfter); }}>
              Normalise cover
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
