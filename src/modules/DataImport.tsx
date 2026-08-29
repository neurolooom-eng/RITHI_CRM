import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { bulkInsert, detectTable, parseCSV, shapeRows, tableCount, type ImportTable } from '../lib/dataImport';
import { supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const TABLES: ImportTable[] = ['masters', 'parties', 'products', 'parts', 'calls', 'reports', 'user_directory'];

interface FileState {
  name: string;
  table: ImportTable | null;
  total: number;
  done: number;
  status: 'ready' | 'running' | 'done' | 'error';
  error?: string;
  rows?: Record<string, unknown>[];
}

// Admin-only: one-time bulk load of the clean migration CSVs into Supabase,
// running through the signed-in admin session (works from the browser even when
// a server-side load is blocked by network policy).
export function DataImport() {
  const { isAdmin } = useAuth();
  const [counts, setCounts] = useState<Partial<Record<ImportTable, number | null>>>({});
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshCounts = async () => {
    const out: Partial<Record<ImportTable, number | null>> = {};
    for (const t of TABLES) out[t] = await tableCount(t);
    setCounts(out);
  };
  useEffect(() => { if (supabaseConfigured()) void refreshCounts(); }, []);

  if (!isAdmin) return null;

  const onPick = async (list: FileList | null) => {
    if (!list) return;
    const next: FileState[] = [];
    for (const f of Array.from(list)) {
      try {
        const text = await f.text();
        const raw = parseCSV(text);
        const table = detectTable(Object.keys(raw[0] ?? {}));
        const rows = table ? shapeRows(table, raw) : [];
        next.push({ name: f.name, table, total: rows.length, done: 0, status: table ? 'ready' : 'error', error: table ? undefined : 'Unrecognised columns', rows });
      } catch (e) {
        next.push({ name: f.name, table: null, total: 0, done: 0, status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setFiles(next);
  };

  const runAll = async () => {
    setBusy(true);
    for (let i = 0; i < files.length; i++) {
      const fs = files[i];
      if (!fs.table || !fs.rows || fs.status === 'done') continue;
      setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, status: 'running', done: 0 } : x)));
      const res = await bulkInsert(fs.table, fs.rows, (p) => {
        setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, done: p.done } : x)));
      });
      setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, status: res.ok ? 'done' : 'error', error: res.error, done: res.inserted } : x)));
    }
    setBusy(false);
    void refreshCounts();
  };

  return (
    <SectionCard title="Bulk Data Import (CSV → Supabase)">
      <div className="muted" style={{ marginBottom: 12 }}>
        One-time load of the clean migration CSVs. Select the files (the table is
        auto-detected from the columns) and Import. Runs through your admin login.
        Import into an empty table — re-importing duplicates rows.
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABLES.map((t) => (
          <span key={t} className="badge badge-neutral">{t}: {counts[t] == null ? '—' : counts[t]}</span>
        ))}
        <button className="btn btn-sm" onClick={() => void refreshCounts()} disabled={busy}>↻ Counts</button>
      </div>

      <input type="file" accept=".csv" multiple onChange={(e) => void onPick(e.target.files)} disabled={busy} />

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
          <div className="row">
            <button className="btn btn-primary" onClick={() => void runAll()} disabled={busy || !files.some((f) => f.table && f.status !== 'done')}>
              {busy ? 'Importing…' : `Import ${files.filter((f) => f.table && f.status !== 'done').length} file(s)`}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
