import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured, listPmDue, pmDueLatestRegAt, uploadRows, type PmDueRow } from '../lib/supabase';
import { shapePmDueRows, pmStartDefaults } from '../lib/pmImport';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import './fieldcalls.css';

// ===========================================================================
// PM DUE (0401, the user, 2026-10-08: "Can we do PM generation from Contract
// and warranty register?").
//
// The month's PM visits, from the two registers: visit k of a cover falls on
// start + k x months x 30 / visits days (the user's example: 10 January, 3
// visits in 12 months, the first on the 120th day), and only a visit the PM
// calls already raised have not covered is listed. The coordinator reads the
// list, unticks what should not go, and creates the calls.
//
// The calls are shaped by shapePmDueRows -> shapePmRows, the monthly upload's
// own shaping, so a generated call and an uploaded one carry the same fields.
// PM Bulk Upload stays as it is ("don't replace the monthly upload for now").
//
// THE REGISTRATION TIME IS ASKED AT THE MOMENT OF CREATING, not when the list
// was loaded: the user's rule is "the largest registration date and time for
// the month, then add 10 secs", and an upload in between would make a time
// read at load the wrong one.
// ===========================================================================

const s = (v: unknown) => (v == null ? '' : String(v));
const thisMonth = () => todayLocal().slice(0, 7);

export function PmDue() {
  const { can } = useAuth();
  const mayList = can('pm.generate');
  // Creating is the PM register's own insert right, exactly as on PM Bulk Upload.
  const mayCreate = mayList && can('pm.create');
  const onDb = supabaseConfigured();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<PmDueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  // UNTICKED machines, keyed product|serial -- so a fresh list starts all ticked.
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const keyOf = (r: PmDueRow) => `${r.product_name}|${r.serial}`;

  const load = useCallback(async (m: string) => {
    if (!onDb || !mayList || !m) return;
    setLoading(true); setLoadError(''); setRows(null); setSkip(new Set());
    try { setRows(await listPmDue(m)); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [onDb, mayList]);

  useEffect(() => { void load(month); }, [month, load]);

  const chosen = useMemo(() => (rows ?? []).filter((r) => !skip.has(keyOf(r))), [rows, skip]);
  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      warranty: all.filter((r) => r.source === 'Warranty').length,
      contract: all.filter((r) => r.source === 'Contract').length,
      noEngineer: all.filter((r) => !r.engineer).length,
      notOnPd: all.filter((r) => !r.on_product_database).length,
    };
  }, [rows]);

  if (!mayList) {
    return (
      <div>
        <PageHeader title="PM Due" subtitle="The month's PM visits from the Warranty and Contract Registers." icon="🗓️" />
        <div className="sheet-banner sheet-banner-info"><span>🔒 PM Due needs “Generate PM calls from the registers” on Roles &amp; Permissions.</span></div>
      </div>
    );
  }

  const toggle = (r: PmDueRow) => setSkip((cur) => {
    const next = new Set(cur);
    const k = keyOf(r);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const allTicked = !!rows?.length && skip.size === 0;
  const toggleAll = () => setSkip(allTicked ? new Set((rows ?? []).map(keyOf)) : new Set());

  const create = async () => {
    if (!chosen.length) return;
    if (!window.confirm(`Create ${chosen.length} PM call${chosen.length === 1 ? '' : 's'} dated 1st ${month}?`)) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Reading the latest registration time in the month…' });
    try {
      const latest = await pmDueLatestRegAt(month);
      const { startLocal, stepSec } = pmStartDefaults(month, latest);
      const shaped = shapePmDueRows(chosen, month, startLocal, stepSec);
      setProgress({ done: 0, total: shaped.length }); setMsg({ tone: 'info', text: 'Creating…' });
      // The same writer PM Bulk Upload uses: through the `calls` view, where
      // the database gives each call its UCN and Call Number.
      const res = await uploadRows('calls', shaped, undefined, (done, total) => setProgress({ done, total }));
      if (!res.ok) {
        setMsg({ tone: 'error', text: `Created ${res.written} before an error: ${res.error} The list below is re-read, so what was created is no longer in it.` });
      } else {
        setMsg({ tone: 'ok', text: `Created ${res.written} PM call${res.written === 1 ? '' : 's'}, the first registered at ${formatDayTime(new Date(startLocal).toISOString())}${latest ? ` (10 seconds after the month's latest, ${formatDayTime(latest)})` : ' (the month had no PM calls yet)'}. They are in the Preventive (PM) register.` });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      void load(month);
    }
  };

  return (
    <div>
      <PageHeader title="PM Due" subtitle="The month's PM visits from the Warranty and Contract Registers — review, then create the PM calls." icon="🗓️" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!onDb && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings.</span></div>}

      <div className="pm-up">
        <div className="pm-up-row">
          <label className="pm-month">Due month
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy} />
          </label>
          <button className="btn" onClick={() => void load(month)} disabled={busy || loading || !onDb}>↻ Refresh</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
          Visit <b>k</b> of a warranty or contract is due on its <b>start date + k × (months × 30 ÷ PM visits) days</b>, and
          belongs to the month that date falls in — never after the cover ends. A machine is listed when the visits due so
          far are more than the PM calls already raised for it (product and serial, not cancelled) in that period; a machine
          with both a warranty and a contract visit is listed once, from the warranty. Each call is dated the{' '}
          <b>1st of the month</b>, Added On is <b>today</b>, the first is registered <b>10 seconds after the month's latest
          PM call</b> (00:30 on the 1st, 5 seconds apart, if there is none), the engineer is the <b>Product Database's</b>,
          and it reads <b>SCHEDULED PM VISIT</b> / <b>SCHEDULED PM VISIT k / N</b>.
        </p>
      </div>

      {loading && <p className="muted">Working out the visits due in {month}…</p>}
      {loadError && <div className="sheet-banner sheet-banner-error"><span>Could not read the PM visits due: {loadError}</span></div>}

      {rows && !loading && (
        rows.length === 0 ? (
          <p className="muted">No PM visit is due in {month} that has not already been raised.</p>
        ) : (
          <>
            <div className="pm-preview-head">
              <b>{rows.length}</b> machine{rows.length === 1 ? '' : 's'} due in {month} — {counts.warranty} from the Warranty Register,{' '}
              {counts.contract} from the Contract Register.
              {counts.noEngineer > 0 && <> <b>{counts.noEngineer}</b> have no engineer on the Product Database and would be created unallocated.</>}
              {counts.notOnPd > 0 && <> {counts.notOnPd} are not on the Product Database (party from the register).</>}
            </div>
            <div className="pm-up-row" style={{ margin: '10px 0' }}>
              {mayCreate ? (
                <button className="btn btn-primary" onClick={() => void create()} disabled={busy || !chosen.length || !onDb}>
                  {busy ? 'Creating…' : `🗓️ Create ${chosen.length} PM call${chosen.length === 1 ? '' : 's'}`}
                </button>
              ) : (
                <span className="muted">Creating the calls also needs “Create PM calls” (pm.create) on Roles &amp; Permissions.</span>
              )}
              {progress && <span className="muted">{progress.done} / {progress.total}</span>}
            </div>
            {progress && busy && (
              <div className="pm-bar"><div className="pm-bar-fill" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
            )}
            <div className="assoc-scroll">
              <table className="assoc-table" style={{ minWidth: 960 }}>
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={busy} aria-label="Tick all" /></th>
                    <th>Register</th><th>SA / MC No</th><th>Product</th><th>Serial</th><th>Party</th><th>City</th>
                    <th>Engineer</th><th>Cover</th><th>Visit</th><th>Due</th><th>Raised so far</th><th>Cover period</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={keyOf(r)}>
                      <td><input type="checkbox" checked={!skip.has(keyOf(r))} onChange={() => toggle(r)} disabled={busy} aria-label={`Create ${r.serial}`} /></td>
                      <td>{r.source}</td><td>{r.ref_no}</td><td>{r.product_name}</td><td>{r.serial}</td>
                      <td>{s(r.party_name)}</td><td>{s(r.city)}</td>
                      <td>{r.engineer || <span className="muted">none</span>}</td>
                      <td>{r.cover_type || <span className="muted">—</span>}</td>
                      <td>{r.visit_no} / {r.pm_visits}</td>
                      <td>{formatDay(r.due_date)}</td>
                      <td>{r.raised}</td>
                      <td>{formatDay(r.cover_start)} – {formatDay(r.cover_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}
