import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured, listPmDue, pmDueLatestRegAt, uploadRows, type PmDueRow } from '../lib/supabase';
import { shapePmDueRows, pmStartDefaults } from '../lib/pmImport';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { SelectPicker } from '../components/ui/SelectPicker';
import './fieldcalls.css';

// ===========================================================================
// PM DUE (0401, the user, 2026-10-08: "Can we do PM generation from Contract
// and warranty register?").
//
// The month's PM visits, from the two registers: visit k of a cover falls on
// start + k x months x 30 / visits days (the user's example: 10 January, 3
// visits in 12 months, the first on the 120th day). Every machine with a visit
// in the month is listed (0402), GENERATED when its "k / N" PM call exists and
// is not cancelled, MISSED PM otherwise -- the user's rule, which replaced
// 0401's count, because RITHI holds no PM call from before 2026 and the count
// read those years as missed. Three filters at the top (the user, 2026-10-08):
// Missed PM / Generated / All, Products / Accessories, and one product. Only a
// Missed PM row can be ticked and created.
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
type StatusFilter = 'missed' | 'generated' | 'all';
type KindFilter = 'all' | 'products' | 'accessories';
const ALL_PRODUCTS = '';

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
  const [status, setStatus] = useState<StatusFilter>('missed');
  const [kind, setKind] = useState<KindFilter>('all');
  const [product, setProduct] = useState(ALL_PRODUCTS);

  const keyOf = (r: PmDueRow) => `${r.product_name}|${r.serial}`;

  const load = useCallback(async (m: string) => {
    if (!onDb || !mayList || !m) return;
    setLoading(true); setLoadError(''); setRows(null); setSkip(new Set());
    try { setRows(await listPmDue(m)); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [onDb, mayList]);

  useEffect(() => { void load(month); }, [month, load]);

  // THE FILTERS NARROW EACH OTHER: the product list offers the products of the
  // chosen type, and each count is over the other two filters, so the numbers
  // on the buttons are what pressing them shows.
  const byKind = (r: PmDueRow, k: KindFilter) => k === 'all' || (k === 'accessories') === r.is_accessory;
  const byStatus = (r: PmDueRow, st: StatusFilter) => st === 'all' || (st === 'generated') === r.generated;
  const byProduct = (r: PmDueRow, p: string) => !p || r.product_name === p;
  const all = useMemo(() => rows ?? [], [rows]);
  const products = useMemo(
    () => [...new Set(all.filter((r) => byKind(r, kind)).map((r) => r.product_name))].sort(),
    [all, kind]);
  const shown = useMemo(
    () => all.filter((r) => byStatus(r, status) && byKind(r, kind) && byProduct(r, product)),
    [all, status, kind, product]);
  const countStatus = (st: StatusFilter) => all.filter((r) => byStatus(r, st) && byKind(r, kind) && byProduct(r, product)).length;
  const countKind = (k: KindFilter) => all.filter((r) => byStatus(r, status) && byKind(r, k) && byProduct(r, product)).length;
  // ONLY A MISSED PM CAN BE CREATED: a generated visit already has its call.
  const chosen = useMemo(() => shown.filter((r) => !r.generated && !skip.has(keyOf(r))), [shown, skip]);
  const missedShown = useMemo(() => shown.filter((r) => !r.generated), [shown]);
  const counts = useMemo(() => ({
    noEngineer: missedShown.filter((r) => !r.engineer).length,
    notOnPd: missedShown.filter((r) => !r.on_product_database).length,
  }), [missedShown]);

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
  const allTicked = !!missedShown.length && missedShown.every((r) => !skip.has(keyOf(r)));
  const toggleAll = () => setSkip((cur) => {
    const next = new Set(cur);
    for (const r of missedShown) { if (allTicked) next.add(keyOf(r)); else next.delete(keyOf(r)); }
    return next;
  });

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
          belongs to the month that date falls in — never after the cover ends. A visit is <b>Generated</b> when a PM call
          for that product and serial reads <b>k / N</b> for it, within that cover’s period and not cancelled, whatever month
          it was raised in; otherwise it is a <b>Missed PM</b>. A machine with both a warranty and a contract visit is listed
          once, from the warranty. An <b>accessory</b> is a product whose Product Master category is ACCESSORY. Only a Missed
          PM can be created: each call is dated the{' '}
          <b>1st of the month</b>, Added On is <b>today</b>, the first is registered <b>10 seconds after the month's latest
          PM call</b> (00:30 on the 1st, 5 seconds apart, if there is none), the engineer is the <b>Product Database's</b>,
          and it reads <b>SCHEDULED PM VISIT</b> / <b>SCHEDULED PM VISIT k / N</b>.
        </p>
      </div>

      {loading && <p className="muted">Working out the visits due in {month}…</p>}
      {loadError && <div className="sheet-banner sheet-banner-error"><span>Could not read the PM visits due: {loadError}</span></div>}

      {rows && !loading && (
        rows.length === 0 ? (
          <p className="muted">No PM visit falls in {month}.</p>
        ) : (
          <>
            <div className="pm-up-row" style={{ margin: '10px 0', flexWrap: 'wrap', gap: 8 }}>
              {([['missed', 'Missed PM'], ['generated', 'Generated'], ['all', 'All']] as [StatusFilter, string][]).map(([k, label]) => (
                <button key={k} className={`btn btn-sm${status === k ? ' btn-primary' : ''}`} onClick={() => setStatus(k)} disabled={busy}>
                  {label} ({countStatus(k)})
                </button>
              ))}
              <span className="muted" aria-hidden="true">|</span>
              {([['all', 'All types'], ['products', 'Products'], ['accessories', 'Accessories']] as [KindFilter, string][]).map(([k, label]) => (
                <button key={k} className={`btn btn-sm${kind === k ? ' btn-primary' : ''}`}
                        onClick={() => { setKind(k); setProduct(ALL_PRODUCTS); }} disabled={busy}>
                  {label} ({countKind(k)})
                </button>
              ))}
              <span className="muted" aria-hidden="true">|</span>
              <label className="pm-month" style={{ minWidth: 220 }}>Product
                <SelectPicker value={product} onChange={setProduct} options={products}
                  placeholder="All products" disabled={busy} />
              </label>
            </div>
            <div className="pm-preview-head">
              <b>{shown.length}</b> machine{shown.length === 1 ? '' : 's'} shown for {month}
              {status !== 'generated' && <> — <b>{missedShown.length}</b> Missed PM</>}.
              {counts.noEngineer > 0 && <> <b>{counts.noEngineer}</b> of those have no engineer on the Product Database and would be created unallocated.</>}
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
                    <th><input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={busy || !missedShown.length} aria-label="Tick all Missed PM shown" /></th>
                    <th>Status</th><th>Register</th><th>SA / MC No</th><th>Product</th><th>Serial</th><th>Party</th><th>City</th>
                    <th>Engineer</th><th>Cover</th><th>Visit</th><th>Due</th><th>PM call</th><th>Last PM call</th><th>Cover period</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={keyOf(r)}>
                      <td>{r.generated ? null
                        : <input type="checkbox" checked={!skip.has(keyOf(r))} onChange={() => toggle(r)} disabled={busy} aria-label={`Create ${r.serial}`} />}</td>
                      <td>{r.generated ? 'Generated' : <b>Missed PM</b>}</td>
                      <td>{r.source}</td><td>{r.ref_no}</td>
                      <td>{r.product_name}{r.is_accessory && <span className="muted"> (accessory)</span>}</td><td>{r.serial}</td>
                      <td>{s(r.party_name)}</td><td>{s(r.city)}</td>
                      <td>{r.engineer || <span className="muted">none</span>}</td>
                      <td>{r.cover_type || <span className="muted">—</span>}</td>
                      <td>{r.visit_no} / {r.pm_visits}</td>
                      <td>{formatDay(r.due_date)}</td>
                      <td>{r.generated_ucn ? <>{r.generated_ucn} <span className="muted">{formatDay(r.generated_on)}</span></> : <span className="muted">—</span>}</td>
                      <td>{r.last_pm_on ? formatDay(r.last_pm_on) : <span className="muted">none</span>}</td>
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
