import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { parseCSV } from '../lib/dataImport';
import { uploadRows, prepareUpload, countTable, listMasterLists, supabaseConfigured, type MasterList } from '../lib/supabase';
import { UPLOADS, masterUpload, shapeUpload, uploadGroups, type UploadDef, type ShapeResult } from '../lib/uploads';
import './fieldcalls.css';

// ===========================================================================
// BULK UPLOADS — one uploader per register.
//
// Data Import guesses the target from a file's headers. For a cutover that is
// the wrong shape: a Call Type sheet and a Pending Reason sheet are BOTH
// `masters` and no header distinguishes them, so guessing puts every value in
// one list. Here you pick the register, and the register stamps what the file
// cannot say — the list name, the call type.
//
// Every upload previews first: how many rows, which were held back and why, and
// any header the register did not recognise. That last one is what catches a
// file loaded against the wrong register, BEFORE it is written.
// ===========================================================================

interface Pending { file: string; shaped: ShapeResult }

function Register({ def, count, onDone }: { def: UploadDef; count: number | null; onDone: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  const pick = async (f: File | null) => {
    setMsg(null); setPending(null);
    if (!f) return;
    try {
      const raw = parseCSV(await f.text());
      if (!raw.length) { setMsg({ tone: 'error', text: 'That file has no rows.' }); return; }
      const shaped = shapeUpload(def, raw);
      setPending({ file: f.name, shaped });
      setOpen(true);
      if (!shaped.rows.length) {
        setMsg({ tone: 'error', text: `Nothing loadable — every row is missing ${def.cols.filter((c) => c.required).map((c) => c.from[0]).join(' / ')}. Is this the right register for this file?` });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read that file: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const write = async () => {
    if (!pending) return;
    const n = pending.shaped.rows.length;
    const warn = def.conflict
      ? `Rows are matched on ${def.conflict}, so running this again corrects them rather than duplicating.`
      : `⚠ This register has NO natural key — running it again will ADD ${n} more rows, not correct these.`;
    if (!confirm(`Upload ${n} rows into ${def.label}?\n\n${warn}`)) return;
    // Some registers point at rows that have to be there first (see `prepare`).
    // Done before the write and in its own statements, so the rows being written
    // can see them — a database trigger cannot do this for us.
    let note = '';
    if (def.prepare) {
      setBusy('Checking what these rows point at…');
      const pre = await prepareUpload(def.prepare, pending.shaped.rows);
      if (!pre.ok) { setBusy(''); setMsg({ tone: 'error', text: pre.error ?? 'Could not prepare the upload.' }); return; }
      note = pre.note ?? '';
    }
    setBusy(`Writing 0 / ${n}…`);
    const res = await uploadRows(def.table, pending.shaped.rows, def.conflict, (d, t) => setBusy(`Writing ${d} / ${t}…`));
    setBusy('');
    if (!res.ok) { setMsg({ tone: 'error', text: `${res.error} (${res.written} written before it stopped.)` }); onDone(); return; }
    setMsg({ tone: 'ok', text: `${res.written} rows written to ${def.label}.${note ? ` ${note}.` : ''}` });
    setPending(null);
    onDone();
  };

  const s = pending?.shaped;

  return (
    <div className="rbac-page-row" style={{ display: 'block', padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ minWidth: 260 }}>{def.label}</b>
        <span className="muted" style={{ fontSize: 12, minWidth: 120 }}>
          {count === null ? '' : `${count.toLocaleString()} row${count === 1 ? '' : 's'} now`}
        </span>
        <input type="file" accept=".csv,text/csv" className="input" style={{ maxWidth: 260 }}
          disabled={!!busy} onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        {s && (
          <>
            <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
              {open ? '⌄' : '›'} {s.rows.length} ready
              {s.skipped.length ? ` · ${s.skipped.length} held back` : ''}
              {s.unmatched.length
                ? ` · ${s.unmatched.length} ${def.extraInto ? 'kept on the row' : 'ignored'}`
                : ''}
            </button>
            <button className="btn btn-primary btn-sm" disabled={!!busy || !s.rows.length} onClick={() => void write()}>
              ⤵ Upload {s.rows.length}
            </button>
          </>
        )}
        {busy && <span className="muted">{busy}</span>}
      </div>

      {def.note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{def.note}</div>}
      {def.requires && <div className="muted" style={{ fontSize: 12 }}>Load <b>{def.requires}</b> first — these rows point at it.</div>}
      {!def.conflict && (
        <div className="muted" style={{ fontSize: 12 }}>
          ⚠ No natural key: a second run adds rows rather than correcting them.
        </div>
      )}

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginTop: 6 }}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {open && s && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          {!!s.stamped?.length && (
            <p className="muted" style={{ margin: '4px 0' }}>
              <b>Set by this register, so the file's own value is ignored:</b> {s.stamped.join(', ')}.
            </p>
          )}
          {/* A column with no field of its own is NOT a problem when the
              register keeps it — the visit's own answers (Job Done, Hour Meter,
              Software Version) live exactly there, and that is where the app
              reads them from. Calling it "does not know" read like a failure on
              a load that was entirely correct. */}
          {s.unmatched.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              {def.extraInto ? (
                <>
                  <b>Kept on the row ({s.unmatched.length}):</b> {s.unmatched.join(', ')}.{' '}
                  These have no field of their own, so they are stored with the record exactly
                  as written — nothing is lost.
                </>
              ) : (
                <>
                  <b>Not loaded ({s.unmatched.length}):</b> {s.unmatched.join(', ')}.{' '}
                  This register has nowhere to put them. If you expected them to load, this may
                  be the wrong register for this file.
                </>
              )}
            </p>
          )}
          {s.skipped.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              <b>Held back:</b>{' '}
              {s.skipped.slice(0, 8).map((k) => `row ${k.row} (${k.why})`).join(', ')}
              {s.skipped.length > 8 ? ` … and ${s.skipped.length - 8} more` : ''}.
            </p>
          )}
          <p className="muted" style={{ margin: '4px 0' }}>
            <b>Recognised columns:</b> {def.cols.map((c) => c.to + (c.required ? ' *' : '')).join(' · ')}
          </p>
          {s.rows.length > 0 && (
            <pre style={{ margin: '4px 0', overflowX: 'auto', maxHeight: 140, background: 'var(--surface-2, #f6f6f6)', padding: 8 }}>
              {JSON.stringify(s.rows[0], null, 1)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function BulkUploads() {
  const { isAdmin } = useAuth();
  const [lists, setLists] = useState<MasterList[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  const defs = useMemo(() => [...UPLOADS, ...lists.map((l) => masterUpload(l))], [lists]);
  const groups = useMemo(() => uploadGroups(defs), [defs]);

  const refresh = async () => {
    const tables = [...new Set(defs.map((d) => d.table))];
    const out: Record<string, number | null> = {};
    for (const t of tables) out[t] = await countTable(t);
    setCounts(out);
  };

  useEffect(() => {
    if (!supabaseConfigured()) return;
    listMasterLists().then(setLists).catch(() => setLists([]));
  }, []);
  useEffect(() => { if (supabaseConfigured() && defs.length) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs.length]);

  if (!isAdmin) return <div style={{ padding: 24 }} className="muted">Bulk uploads are admin-only.</div>;
  if (!supabaseConfigured()) return <div style={{ padding: 24 }} className="muted">Connect the database in Settings first.</div>;

  return (
    <div>
      <PageHeader
        title="Bulk Uploads" icon="⤵"
        subtitle="One uploader per register. Pick the register, then its file — the register stamps what the file cannot say."
      />

      <SectionCard title="Before you start">
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          <li><b>Order matters.</b> A register that says “load X first” holds rows pointing at X — load the parent, then the children.</li>
          <li><b>Every file previews first</b> — how many rows are ready, which were held back and why, and any column the register did not recognise. That last one is what catches a file loaded against the wrong register.</li>
          <li><b>Dates are read day-first</b> (03/04/2026 = 3 April), which is how these exports are written.</li>
          <li>Registers <b>with</b> a natural key can be re-run safely; the ones marked ⚠ cannot.</li>
        </ul>
      </SectionCard>

      {groups.map((g) => (
        <SectionCard key={g.title} title={`${g.title} · ${g.items.length}`}>
          {g.items.map((d) => (
            <Register key={d.key} def={d} count={counts[d.table] ?? null} onDone={() => void refresh()} />
          ))}
        </SectionCard>
      ))}
    </div>
  );
}
