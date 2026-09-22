import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, SearchBox } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { allRows } from '../lib/paging';
import {
  getSupabase, supabaseConfigured, exportableTables, exportSchedules, saveExportSchedule,
  deleteExportSchedule, exportRuns,
  type ExportableTable, type ExportSchedule, type ExportRun,
} from '../lib/supabase';
import { toCsv } from '../lib/csv';
import { loadFailure } from '../lib/dberror';
import { formatDayTime } from '../lib/dates';
import { SelectPicker } from '../components/ui/SelectPicker';
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

// ---------------------------------------------------------------------------
// THE SCHEDULE'S VOCABULARY. Times are IST and say so on screen: the job runs
// in UTC and the database computes due-ness in Asia/Kolkata, so a bare "23:00"
// would be the one number on this page whose zone the reader has to guess.
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmm = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;

const whenText = (s: Pick<ExportSchedule, 'frequency' | 'day_of_week' | 'hour_ist' | 'minute_ist'>) =>
  s.frequency === 'weekly'
    ? `Every ${WEEKDAYS[s.day_of_week ?? 0]} at ${hhmm(s.hour_ist, s.minute_ist)} IST`
    : `Every day at ${hhmm(s.hour_ist, s.minute_ist)} IST`;

interface Draft {
  id?: number;
  label: string;
  frequency: 'daily' | 'weekly';
  day_of_week: number;
  time: string;              // "HH:mm", the one thing an <input type="time"> carries
  enabled: boolean;
}
const NEW_DRAFT: Draft = { label: '', frequency: 'daily', day_of_week: 2, time: '23:00', enabled: true };

export default function DataExport() {
  const { can } = useAuth();
  const [tables, setTables] = useState<ExportableTable[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [schedules, setSchedules] = useState<ExportSchedule[]>([]);
  const [runs, setRuns] = useState<ExportRun[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scheduleErr, setScheduleErr] = useState('');

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

  // THE SCHEDULES LOAD SEPARATELY AND FAIL SEPARATELY. A project that has run
  // 0227 and not 0228 has a working picker and no schedule table, and one
  // banner covering both would make the download look broken when it is not.
  const loadSchedules = () => {
    if (!supabaseConfigured()) return;
    exportSchedules().then(setSchedules).catch((e) => setScheduleErr(loadFailure(e, {
      tables: ['export_schedules', 'export_schedule_state'],
      functions: ['export_run_due_at'],
      hint: 'Scheduling needs its database side: run supabase/apply/data_export.sql.',
    })));
    exportRuns().then(setRuns).catch(() => { /* the schedules banner already says it */ });
  };
  useEffect(loadSchedules, []);

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

  const edit = (s: ExportSchedule) => {
    setScheduleErr('');
    setDraft({
      id: s.id, label: s.label, frequency: s.frequency,
      day_of_week: s.day_of_week ?? 2, time: hhmm(s.hour_ist, s.minute_ist), enabled: s.enabled,
    });
    // The schedule's tables become the ticked ones, so there is ONE table
    // picker on this page rather than two that can disagree about what is
    // selected. Editing a schedule and pressing Export downloads exactly what
    // that schedule mails, which is the useful accident of doing it this way.
    setPicked(new Set(s.tables));
  };

  const saveDraft = async () => {
    if (!draft) return;
    const [h, m] = draft.time.split(':');
    setScheduleErr('');
    try {
      await saveExportSchedule({
        id: draft.id, label: draft.label, tables: [...picked],
        frequency: draft.frequency,
        day_of_week: draft.frequency === 'weekly' ? draft.day_of_week : null,
        hour_ist: Number(h), minute_ist: Number(m), enabled: draft.enabled,
      });
      setDraft(null);
      loadSchedules();
      setMsg({ tone: 'ok', text: `Schedule "${draft.label}" saved.` });
    } catch (e) {
      // THE DATABASE'S OWN WORDS. The guard refuses an audit trail, an unknown
      // table and a blank name in sentences written to be read; replacing them
      // with "Could not save" would throw away the only thing that says which.
      setScheduleErr(e instanceof Error ? e.message : String(e));
    }
  };

  const removeSchedule = async (s: ExportSchedule) => {
    if (!window.confirm(`Delete the schedule "${s.label}"? Nothing already sent is affected.`)) return;
    try {
      await deleteExportSchedule(s.id);
      if (draft?.id === s.id) setDraft(null);
      loadSchedules();
    } catch (e) { setScheduleErr(e instanceof Error ? e.message : String(e)); }
  };

  const toggleEnabled = async (s: ExportSchedule) => {
    try {
      await saveExportSchedule({ ...s, tables: s.tables, enabled: !s.enabled });
      loadSchedules();
    } catch (e) { setScheduleErr(e instanceof Error ? e.message : String(e)); }
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

      <SectionCard title="3 · Scheduled exports">
        {/* WHAT AND WHEN ARE YOURS. WHERE IS NOT, AND THAT IS SAID PLAINLY
            RATHER THAN LEFT AS A MISSING FIELD — somebody who cannot find the
            recipient box should learn why, not conclude it is broken. */}
        <p className="muted" style={{ marginTop: 0 }}>
          A schedule mails the ticked tables as one ZIP of CSV files, on the day and at the time you choose.
          <b> You choose which tables and when; you cannot choose where it goes.</b> The recipients are set
          once on the server, by whoever holds the project keys — a nightly copy of the whole customer base
          with an address that could be edited here is the one thing this must never be.
        </p>

        {scheduleErr && <div className="sheet-banner sheet-banner-error"><span>{scheduleErr}</span></div>}

        {schedules.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', minWidth: 720 }}>
              <thead><tr>
                <th>Name</th><th>Tables</th><th>When</th><th>Next</th><th>Last run</th><th></th>
              </tr></thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.55 }}>
                    <td>{s.label}</td>
                    <td title={s.tables.join(', ')}>
                      {s.tables.length} · <span className="muted" style={{ fontSize: 12 }}>
                        {s.tables.slice(0, 3).join(', ')}{s.tables.length > 3 ? ` +${s.tables.length - 3}` : ''}
                      </span>
                    </td>
                    <td>{whenText(s)}</td>
                    {/* A DISABLED SCHEDULE HAS NO NEXT RUN, and printing one
                        would say it is going to happen. */}
                    <td>{s.enabled ? formatDayTime(s.next_run_at) : <span className="muted">paused</span>}</td>
                    <td>
                      {s.last_run_at
                        ? <span title={s.last_detail ?? ''}>
                            {formatDayTime(s.last_run_at)} · {s.last_status ?? '—'}
                          </span>
                        : <span className="muted">never</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => edit(s)}>Edit</button>{' '}
                      <button className="btn btn-sm" onClick={() => void toggleEnabled(s)}>
                        {s.enabled ? 'Pause' : 'Resume'}
                      </button>{' '}
                      <button className="btn btn-sm" onClick={() => void removeSchedule(s)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!draft && (
          <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button className="btn" disabled={!picked.size}
              onClick={() => { setScheduleErr(''); setDraft({ ...NEW_DRAFT }); }}>
              ＋ Schedule the {picked.size} ticked table{picked.size === 1 ? '' : 's'}
            </button>
            {!picked.size && <span className="muted">Tick some tables above first.</span>}
            {!schedules.length && !!picked.size && <span className="muted">No schedules yet.</span>}
          </div>
        )}

        {draft && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Name</span>
                <input className="input" value={draft.label} style={{ minWidth: 220 }}
                  placeholder="Nightly registers"
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </label>

              <label style={{ display: 'grid', gap: 4, minWidth: 140 }}>
                <span className="muted" style={{ fontSize: 12 }}>How often</span>
                {/* SelectPicker, not a native select: typing filters, it never
                    selects. Under eight options it shows the list with no
                    search box. */}
                <SelectPicker value={draft.frequency}
                  options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Once a week' }]}
                  onChange={(v) => setDraft({ ...draft, frequency: v === 'weekly' ? 'weekly' : 'daily' })} />
              </label>

              {draft.frequency === 'weekly' && (
                <label style={{ display: 'grid', gap: 4, minWidth: 150 }}>
                  <span className="muted" style={{ fontSize: 12 }}>On</span>
                  <SelectPicker value={WEEKDAYS[draft.day_of_week]} options={WEEKDAYS}
                    onChange={(v) => setDraft({ ...draft, day_of_week: Math.max(0, WEEKDAYS.indexOf(v)) })} />
                </label>
              )}

              <label style={{ display: 'grid', gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>At (IST)</span>
                <input className="input" type="time" value={draft.time} style={{ width: 130 }}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value || '23:00' })} />
              </label>

              <label className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                <span>Active</span>
              </label>
            </div>

            <p className="muted" style={{ marginBottom: 6 }}>
              It will send <b>{picked.size}</b> table{picked.size === 1 ? '' : 's'} — the ones ticked above.
              Change the ticks to change what it sends.
            </p>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={!draft.label.trim() || !picked.size}
                onClick={() => void saveDraft()}>
                {draft.id ? 'Save changes' : 'Create schedule'}
              </button>
              <button className="btn" onClick={() => { setDraft(null); setScheduleErr(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* THE RECORD OF WHAT ACTUALLY LEFT. Read-only by construction: the
            database grants an administrator select on export_runs and nothing
            else, so what was sent cannot be tidied from a screen. */}
        {runs.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer' }}>What has been sent ({runs.length})</summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="table" style={{ width: '100%', minWidth: 640 }}>
                <thead><tr>
                  <th>Started</th><th>Schedule</th><th>Tables</th><th>Rows</th><th>Outcome</th>
                </tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDayTime(r.started_at)}</td>
                      <td>{r.label ?? '—'}</td>
                      <td title={(r.tables ?? []).join(', ')}>{(r.tables ?? []).length}</td>
                      <td style={{ textAlign: 'right' }}>{(r.row_count ?? 0).toLocaleString()}</td>
                      <td>{r.status ?? '—'}{r.detail ? ` — ${r.detail}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Nothing is sent until the mail side is deployed once —
          <code> supabase/functions/scheduled-export/README.md</code> has the steps. Schedules saved before
          that are kept and start sending when it is live.
        </p>
      </SectionCard>
    </div>
  );
}
