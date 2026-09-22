import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, SearchBox } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { allRows } from '../lib/paging';
import { getSupabase, supabaseConfigured, exportableTables, type ExportableTable } from '../lib/supabase';
import { toCsv } from '../lib/csv';
import { loadFailure } from '../lib/dberror';
import { zipStore, enc, download } from '../lib/zip';
import { xlsxText } from '../lib/xlsx';

// ===========================================================================
// DATA EXPORT — pick the tables, get CSVs.
//
// The user, 2026-09-22: "I need to Export CSV only. Maybe I can select the
// Tables."
//
// THIS SHAPE IS DELIBERATE AND THE EARLIER ONE WAS REFUSED. A scheduled job
// reading every table past row-level security and posting it to a URL held in
// a settings row is an exfiltration primitive: change the URL, take the
// company. A person choosing tables and downloading them is a different act —
// it runs AS THEM, through the same policies as every screen, and leaves the
// building only when somebody decides it should.
//
// SO THE ROWS COME THROUGH THE ORDINARY API, NOT A DEFINER FUNCTION. An export
// shows exactly what that person is entitled to see, which is the property
// that makes this safe to put on a menu at all. `exportable_tables()` supplies
// only the NAMES and ESTIMATED counts for the picker.
//
// ONE ZIP, NOT N DOWNLOADS. A browser asked for sixty files in a loop blocks
// most of them, and the ones it allows arrive in no order. The project already
// writes a ZIP without a dependency (zip.ts, for .xlsx and .docx), so the
// export is one file with one CSV inside it per table.
// ===========================================================================

// Dates go out through the one formatter, for the reason the Consumption
// Report exists: `2026-09-18T08:51:02.55+00:00` in a spreadsheet is a string
// nobody can sort, and the offset makes it the wrong day before 05:30 IST.
// Written as one expression, not with early returns: `check:ui` refuses a hook
// below a `return` in a module file, and it reads the FILE rather than the
// component -- which is the right call, because the fault it exists to catch
// (a hook that stops being reached) is invisible either way.
const cell = (v: unknown): string =>
  v === null || v === undefined ? ''
    : typeof v === 'object' ? JSON.stringify(v)   // jsonb columns, verbatim
    : xlsxText(v);

export default function DataExport() {
  const { can } = useAuth();
  const [tables, setTables] = useState<ExportableTable[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setMsg({ tone: 'error', text: 'Connect the database in Settings first.' }); return; }
    exportableTables()
      .then(setTables)
      // NAMES THE FILE TO RUN. The first person to open this screen got
      // "Load failed: Could not find the function public.exportable_tables"
      // and nothing to act on -- the screen was live and its migration was
      // not. A missing FUNCTION can be named safely (PostgREST says which one
      // it looked for), which a bare "does not exist" cannot; `isMissingFunction`
      // is the narrow test and `check:dberror` holds the two apart.
      .catch((e) => setMsg({ tone: 'error', text: loadFailure(e, {
        tables: ['export_schedules'],
        functions: ['exportable_tables', 'is_exportable_table'],
        hint: 'This screen needs its database side: run supabase/apply/data_export.sql in the Supabase SQL editor.',
      }) }));
  }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? tables.filter((t) => t.table_name.toLowerCase().includes(n)) : tables;
  }, [tables, q]);

  const toggle = (name: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const run = async () => {
    const want = [...picked];
    if (!want.length) { setMsg({ tone: 'error', text: 'Pick at least one table.' }); return; }
    const c = getSupabase();
    if (!c) { setMsg({ tone: 'error', text: 'Database not connected.' }); return; }

    setMsg(null);
    const parts: { path: string; data: Uint8Array }[] = [];
    const counts: string[] = [];
    try {
      for (let i = 0; i < want.length; i++) {
        const name = want[i];
        setBusy(`Reading ${name} (${i + 1} of ${want.length})…`);
        // PAGED. A register-sized table comes back capped at 1,000 rows
        // otherwise, silently — the fault this project has had thirteen times.
        const rows = await allRows<Record<string, unknown>>(
          (a, b) => c.from(name).select('*').range(a, b), 200000);
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const csv = toCsv(cols, rows.map((r) => cols.map((k) => cell(r[k]))));
        parts.push({ path: `${name}.csv`, data: enc(csv) });
        counts.push(`${name} ${rows.length}`);
      }
      setBusy('Building the file…');
      const day = new Date().toISOString().slice(0, 10);
      download(`rithi-export-${day}.zip`, zipStore(parts), 'application/zip');
      setBusy('');
      setMsg({ tone: 'ok', text: `${parts.length} table(s) exported — ${counts.join(' · ')}.` });
    } catch (e) {
      setBusy('');
      setMsg({ tone: 'error', text: `Stopped: ${e instanceof Error ? e.message : String(e)}. Nothing was downloaded.` });
    }
  };

  if (!can('mod:/data-export')) {
    return <div className="card"><p className="muted">You need admin access to export data.</p></div>;
  }

  const total = [...picked].reduce((n, name) =>
    n + (tables.find((t) => t.table_name === name)?.approx_rows ?? 0), 0);

  return (
    <div>
      <PageHeader icon="⬇️" title="Data Export"
        subtitle="Pick the tables you want and download them as CSV. The export runs as you — it holds exactly the rows you are entitled to see." />

      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`}><span>{msg.text}</span></div>}

      <SectionCard title="1 · The tables">
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Find a table…" />
          <button className="btn btn-sm" onClick={() => setPicked(new Set(shown.map((t) => t.table_name)))}>
            Select all {q ? 'shown' : ''}
          </button>
          <button className="btn btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {picked.size} selected · about {total.toLocaleString()} rows
            {/* AN ESTIMATE, AND IT SAYS SO. These come from the planner's
                statistics, not count(*) — a count over sixty tables to paint a
                picker would scan the database every time this screen opens. A
                number that looks exact and is not is worse than one that
                admits it. */}
            <span title="From the database's own statistics — close, not exact."> (approx.)</span>
          </span>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {shown.map((t) => (
            <label key={t.table_name} className="row"
              style={{ gap: 8, padding: '5px 10px', cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={picked.has(t.table_name)} onChange={() => toggle(t.table_name)} />
              <span style={{ flex: 1 }}>{t.table_name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{t.approx_rows.toLocaleString()}</span>
            </label>
          ))}
          {!shown.length && <div className="muted" style={{ padding: 10 }}>
            {tables.length ? 'Nothing matches that.' : 'No tables to offer — this needs admin access.'}
          </div>}
        </div>
      </SectionCard>

      <SectionCard title="2 · Download">
        <p className="muted" style={{ marginTop: 0 }}>
          One ZIP, with one CSV per table inside it. Dates are written <b>dd-MMM-yyyy HH:mm:ss</b> so a
          spreadsheet reads them as dates; a column holding structured data is written as it is stored.
        </p>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={!!busy || !picked.size} onClick={() => void run()}>
            ⬇️ Export {picked.size} table{picked.size === 1 ? '' : 's'}
          </button>
          {busy && <span className="muted">{busy}</span>}
        </div>
      </SectionCard>
    </div>
  );
}
