import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { parseCSV } from '../lib/dataImport';
import { uploadRows, planUpload, applyUploadPlan, countTable, listMasterLists, supabaseConfigured, type MasterList } from '../lib/supabase';
import { UPLOADS, masterUpload, shapeUpload, uploadGroups, soldThroughNotDealers, prepWritesQuestion,
  type UploadDef, type ShapeResult, type UploadPlan } from '../lib/uploads';
import { dealerParties } from '../lib/cover';
import { recordAudit } from '../lib/audit';
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
      // The register's own column names, so the header row can be FOUND rather
      // than assumed to be the first: these sheets are printed for filing and
      // carry a letterhead above the headings.
      const raw = parseCSV(await f.text(), { aliases: def.cols.flatMap((c) => c.from) });
      if (!raw.length) { setMsg({ tone: 'error', text: 'That file has no rows.' }); return; }
      const shaped = shapeUpload(def, raw);
      setPending({ file: f.name, shaped });
      setOpen(true);
      if (!shaped.rows.length) {
        // Naming the register this file DOES belong to was tried and dropped:
        // scored on headers it missed the one register written for the file (a
        // derived column matches no header), and scored on shaped rows it named
        // whichever register claims the most columns — "Part Master" for the
        // WinMax export, "Field Calls" for a consumption report. A suggestion
        // that is wrong half the time is worse than none. The registers say
        // which file they take instead.
        setMsg({ tone: 'error', text: `Nothing loadable — every row is missing ${def.cols.filter((c) => c.required).map((c) => c.from[0]).join(' / ')}. Is this the right register for this file? Each register's note says which export it takes.` });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read that file: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // ONE AUDIT ENTRY PER LOAD (D-067, FRS-196.14) — every way `write` can end
  // once Upload is pressed, including the ones that wrote nothing, because "it
  // was attempted and stopped here" is the record somebody needs when a
  // register looks short. Awaited so a failure to record is SAID, beside the
  // load's own result, the way a Party Master that could not be read is (the ⚑
  // note below) — never by stopping a load that has already happened.
  const record = async (p: Pending, o: {
    outcome: 'completed' | 'stopped' | 'cancelled'; ready: number; toWrite: number;
    written: number; why?: string; wroteFirst?: string; started: number;
  }): Promise<string> => {
    const heldBack = p.shaped.skipped.length + Math.max(0, p.shaped.rows.length - o.ready);
    const err = await recordAudit({
      action: 'bulk.upload', target: def.table,
      status: o.outcome === 'completed' ? 'ok' : 'error',
      error: o.why ?? '',
      duration_ms: Math.round(performance.now() - o.started),
      meta: {
        register: def.label, register_key: def.key, table: def.table, file: p.file,
        rows_in_file: p.shaped.rows.length + p.shaped.skipped.length,
        rows_ready: o.ready, rows_held_back: heldBack,
        rows_to_write: o.toWrite, rows_written: o.written,
        rows_failed: o.outcome === 'stopped' ? Math.max(0, o.toWrite - o.written) : 0,
        written_first: o.wroteFirst ?? '',
        outcome: o.outcome, completed: o.outcome === 'completed',
        conflict: def.conflict ?? '',
      },
    });
    return err ? ` ⚑ This load could not be recorded in the audit log: ${err}` : '';
  };

  const write = async () => {
    if (!pending) return;
    const p = pending;
    const started = performance.now();
    // Some registers point at rows that have to be there first, or accept only
    // some of the names in the file (see `prepare`). PLANNED before the
    // confirmation -- reads only -- so the number you are asked to approve is
    // the number that will actually be written. It used to run after, which
    // meant agreeing to 257,130 rows and being told afterwards that 4,538 went in.
    // What the plan must WRITE first (stub spare requests, the visits a
    // consumption file describes) is only NAMED in the confirmation and written
    // after OK (D-075): it used to be written before it, so Cancel left those
    // rows behind -- and a visit moves its call's status.
    let plan: UploadPlan = { rows: pending.shaped.rows, writes: [], note: '' };
    if (def.prepare) {
      setBusy('Checking what these rows point at…');
      const pre = await planUpload(def.prepare, pending.shaped.rows);
      setBusy('');
      if (!pre.ok || !pre.plan) {
        const why = pre.error ?? 'Could not prepare the upload.';
        const unrecorded = await record(p, { outcome: 'stopped', ready: p.shaped.rows.length, toWrite: 0, written: 0, why, started });
        setMsg({ tone: 'error', text: why + unrecorded });
        return;
      }
      plan = pre.plan;
      if (!plan.rows.length) {
        const why = `Nothing left to load — nothing was written.${plan.note ? ` ${plan.note}` : ''}`;
        const unrecorded = await record(p, { outcome: 'stopped', ready: 0, toWrite: 0, written: 0, why, started });
        setMsg({ tone: 'error', text: why + unrecorded });
        return;
      }
    }
    const rows = plan.rows;
    const note = plan.note;
    const n = rows.length;
    // D-152: a Sold Through that is not a dealer on the Party Master is FLAGGED,
    // not refused (the user: "Just flag it for now, Lets Observe and then decide").
    let flag = '';
    if (rows.some((r) => String(r.sold_through ?? '').trim())) {
      try {
        const odd = soldThroughNotDealers(rows, await dealerParties());
        if (odd.length) {
          flag = `⚑ ${odd.length} Sold Through value${odd.length === 1 ? ' is' : 's are'} not a DEALER on the Party Master and will be loaded as they are: ${odd.slice(0, 20).join(', ')}${odd.length > 20 ? ` and ${odd.length - 20} more` : ''}.`;
        }
      } catch { flag = '⚑ Could not read the Party Master\'s dealers, so Sold Through was not checked.'; }
    }
    const warn = def.conflict
      ? `Rows are matched on ${def.conflict}, so running this again corrects them rather than duplicating.`
      : `⚠ This register has NO natural key — running it again will ADD ${n} more rows, not correct these.`;
    const first = prepWritesQuestion(plan.writes);
    if (!confirm(`Upload ${n} rows into ${def.label}?\n\n${first ? `${first}\n\n` : ''}${note ? `${note}\n\n` : ''}${flag ? `${flag}\n\n` : ''}${warn}`)) {
      const unrecorded = await record(p, { outcome: 'cancelled', ready: n, toWrite: n, written: 0, why: 'Cancelled at the confirmation — nothing was written.', started });
      if (unrecorded) setMsg({ tone: 'error', text: `Cancelled — nothing was written.${unrecorded}` });
      return;
    }
    // Only now, with OK pressed: what the rows point at, then the rows. A
    // failure here stops the upload, and says what was and was not written.
    let wroteFirst = '';
    if (plan.writes.length) {
      setBusy('Writing what these rows point at…');
      const pre = await applyUploadPlan(plan);
      setBusy('');
      const why = pre.error ?? 'Could not prepare the upload — the upload was not started.';
      if (!pre.ok) { setMsg({ tone: 'error', text: why + await record(p, { outcome: 'stopped', ready: n, toWrite: n, written: 0, why, wroteFirst: pre.done, started }) }); onDone(); return; }
      wroteFirst = pre.done;
    }
    setBusy(`Writing 0 / ${n}…`);
    const res = await uploadRows(def.table, rows, def.conflict, (d, t) => setBusy(`Writing ${d} / ${t}…`));
    setBusy('');
    const firstNote = wroteFirst ? ` Written first: ${wroteFirst}.` : '';
    if (!res.ok) {
      const unrecorded = await record(p, { outcome: 'stopped', ready: n, toWrite: n, written: res.written, why: res.error ?? 'The upload stopped.', wroteFirst, started });
      setMsg({ tone: 'error', text: `${res.error} (${res.written} written before it stopped.)${firstNote}${unrecorded}` }); onDone(); return;
    }
    const unrecorded = await record(p, { outcome: 'completed', ready: n, toWrite: n, written: res.written, wroteFirst, started });
    setMsg({ tone: 'ok', text: `${res.written} rows written to ${def.label}.${firstNote}${note ? ` ${note}` : ''}${flag ? ` ${flag}` : ''}${unrecorded}` });
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
          {/* A DATE CONVENTION IS NEVER APPLIED SILENTLY. Day-first is the rule;
              a column is read the other way only where its own values prove it,
              and when that happens the file has to SAY so — a date read the
              wrong way round is wrong by up to eleven months and looks
              perfectly ordinary on screen. */}
          {(s.splitShared ?? 0) > 0 && (
            <p style={{ margin: '4px 0' }}>
              <b>Shared UID, one visit per call ({(s.splitShared ?? 0).toLocaleString('en-IN')} rows):</b>{' '}
              these rows share a UID with other calls (a bulk call closure gives every call it
              closed the same one), so each is filed as its own visit, keyed <code>UID|UCN</code>.
              Without that, every call but the last would be dropped.
            </p>
          )}
          {s.monthFirst.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              <b>Read month-first ({s.monthFirst.length}):</b> {s.monthFirst.join(', ')}.{' '}
              This file writes those dates American-style — 3/28/2016 is 28 March — proved by
              values with a day above 12 in the month position. Every other column is read
              day-first as usual.
            </p>
          )}
          {/* DROPPED ON PURPOSE, and said so. A column the register has been told
              it does not want must not be reported as “kept” — a reader
              looking at the kept list is deciding what to name next, and a
              column nobody wants does not belong on that list. */}
          {s.ignored.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              <b>Not kept ({s.ignored.length}):</b> {s.ignored.join(', ')}.{' '}
              This register was told it does not want these, so they are dropped rather than
              carried on the row.
            </p>
          )}
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
            {(s.consumed ?? []).length > 0 && <> · {(s.consumed ?? []).join(' · ')}</>}
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
  // ITS OWN KEY, `bulk.upload` (the user, 2026-09-30). What each upload may
  // write is still decided row by row by that table's own policies, so the key
  // opens the screen and adds reach to nothing.
  const { can } = useAuth();
  const mayUpload = can('bulk.upload');
  const [lists, setLists] = useState<MasterList[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [counting, setCounting] = useState(false);

  const defs = useMemo(() => [...UPLOADS, ...lists.map((l) => masterUpload(l))], [lists]);
  const groups = useMemo(() => uploadGroups(defs), [defs]);

  // THE ROW COUNTS ARE ASKED FOR, NOT TAKEN ON EVERY OPEN. Each is an exact
  // count under the table's own read policy, so each is a scan of the whole
  // table -- and this screen used to run all 31 of them, one after another,
  // every time it was opened. On the live project's statement log
  // (2026-10-05) those counts were among the heaviest reads there were:
  // feedback at ~7 s, parties ~5 s, each spare history ~2.5-3.3 s -- about a
  // minute of database time to open a screen whose job is to write. Now a
  // load counts the one register it wrote to (so the number moves by what
  // landed), and "Count every register" counts them all on request. A count
  // not yet taken shows nothing rather than a stale number.
  const refresh = async (only?: string[]) => {
    const tables = only ?? [...new Set(defs.map((d) => d.table))];
    setCounting(true);
    try {
      const got = await Promise.all(tables.map(async (t) => [t, await countTable(t)] as const));
      setCounts((c) => ({ ...c, ...Object.fromEntries(got) }));
    } finally { setCounting(false); }
  };

  useEffect(() => {
    if (!supabaseConfigured()) return;
    listMasterLists().then(setLists).catch(() => setLists([]));
  }, []);

  if (!mayUpload) return <div style={{ padding: 24 }} className="muted">Bulk uploads need “Load registers in bulk” on Roles &amp; Permissions.</div>;
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
        <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" disabled={counting} onClick={() => void refresh()}>
            {counting ? 'Counting…' : '🔢 Count every register'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Exact counts, one scan per register — taken when you ask, and for the register you just loaded.
          </span>
        </div>
      </SectionCard>

      {groups.map((g) => (
        <SectionCard key={g.title} title={`${g.title} · ${g.items.length}`}>
          {g.items.map((d) => (
            <Register key={d.key} def={d} count={counts[d.table] ?? null} onDone={() => void refresh([d.table])} />
          ))}
        </SectionCard>
      ))}
    </div>
  );
}
