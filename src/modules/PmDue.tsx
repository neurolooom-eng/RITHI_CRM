import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured, listPmDue, type PmDueRow } from '../lib/supabase';
import { createPmCalls } from '../lib/pmGenerate';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useCallStates } from '../lib/callstates';
import { StateBadge, Ucn } from '../lib/callstate';
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
// TWO RULES, EACH ALSO A FILTER (0403, the user: "Add 2 more logics - But add
// these as rules + Filters"): the machine's installation call reads Solved --
// or it has none at all (0404, "Allow machines with no installation call") --
// and its party is a CUSTOMER on the Party Master.
//
// AND THEN REGULAR FILTERS, NOT RULES (the user, 2026-10-09: "In PM Due, change
// the rules into regular filters. Add Product, Serial No, Party, Engineer
// filters"). Installation and Customer narrow the list like any other filter,
// start on Any, and no longer decide what may be created: every Missed PM shown
// can be ticked. The database still answers both questions per row (0403/0404);
// only `can_create` is no longer read here.
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
type InstFilter = 'ok' | 'solved' | 'none' | 'not' | 'all';
type PartyFilter = 'customer' | 'not' | 'all';
const ALL_PRODUCTS = '';
// A row with no engineer on the Product Database, as the Engineer filter offers it.
const NO_ENGINEER = '(no engineer)';
const engOf = (r: PmDueRow) => r.engineer || NO_ENGINEER;

// EMBEDDED IN A REGISTER (0407, the user, 2026-10-09: "Can I have the schedules
// listed in Warranty and contract pages as well"): the Warranty and Contract
// Registers each show this screen as their PM Schedule tab, narrowed to their
// own register's rows and without its page header.
export function PmDue({ source, embedded }: { source?: 'Warranty' | 'Contract'; embedded?: boolean } = {}) {
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
  const [inst, setInst] = useState<InstFilter>('all');
  const [ptype, setPtype] = useState<PartyFilter>('all');
  const [serial, setSerial] = useState('');
  const [partyName, setPartyName] = useState('');
  const [engineer, setEngineer] = useState('');

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
  // 'ok' is what rule 1 allows: a Solved installation call, or none at all.
  const byInst = (r: PmDueRow, f: InstFilter) => {
    const none = !r.installation_ucn;
    if (f === 'ok') return none || r.install_solved;
    if (f === 'solved') return r.install_solved;
    if (f === 'none') return none;
    if (f === 'not') return !none && !r.install_solved;
    return true;
  };
  const byParty = (r: PmDueRow, f: PartyFilter) => f === 'all' || (f === 'customer') === r.party_is_customer;
  const all = useMemo(() => (rows ?? []).filter((r) => !source || r.source === source), [rows, source]);
  type FilterKey = 'status' | 'kind' | 'product' | 'inst' | 'party' | 'serial' | 'partyName' | 'engineer' | '';
  // Every filter but the one named, so each button counts -- and each picker
  // offers -- what choosing it would show.
  const passes = (r: PmDueRow, skipOne: FilterKey) =>
    (skipOne === 'status' || byStatus(r, status)) && (skipOne === 'kind' || byKind(r, kind))
    && (skipOne === 'product' || byProduct(r, product)) && (skipOne === 'inst' || byInst(r, inst))
    && (skipOne === 'party' || byParty(r, ptype))
    && (skipOne === 'serial' || !serial || r.serial === serial)
    && (skipOne === 'partyName' || !partyName || (r.party_name ?? '') === partyName)
    && (skipOne === 'engineer' || !engineer || engOf(r) === engineer);
  const optionsFor = (key: FilterKey, pick: (r: PmDueRow) => string) =>
    [...new Set(all.filter((r) => passes(r, key)).map(pick).filter(Boolean))].sort();
  const products = useMemo(() => optionsFor('product', (r) => r.product_name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, status, kind, inst, ptype, serial, partyName, engineer]);
  const serials = useMemo(() => optionsFor('serial', (r) => r.serial),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, status, kind, product, inst, ptype, partyName, engineer]);
  const parties = useMemo(() => optionsFor('partyName', (r) => r.party_name ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, status, kind, product, inst, ptype, serial, engineer]);
  const engineers = useMemo(() => optionsFor('engineer', engOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, status, kind, product, inst, ptype, serial, partyName]);
  const shown = useMemo(() => all.filter((r) => passes(r, '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, status, kind, product, inst, ptype, serial, partyName, engineer]);
  const countStatus = (st: StatusFilter) => all.filter((r) => passes(r, 'status') && byStatus(r, st)).length;
  const countKind = (k: KindFilter) => all.filter((r) => passes(r, 'kind') && byKind(r, k)).length;
  const countInst = (f: InstFilter) => all.filter((r) => passes(r, 'inst') && byInst(r, f)).length;
  const countParty = (f: PartyFilter) => all.filter((r) => passes(r, 'party') && byParty(r, f)).length;
  // EVERY MISSED PM SHOWN MAY BE CREATED -- the filters decide what is shown.
  const creatable = useMemo(() => shown.filter((r) => !r.generated), [shown]);
  const chosen = useMemo(() => creatable.filter((r) => !skip.has(keyOf(r))), [creatable, skip]);
  const missedShown = creatable;
  // The generated call's own status, for the rows on screen (one request).
  const callStates = useCallStates(useMemo(() => shown.map((r) => r.generated_ucn ?? '').filter(Boolean), [shown]));
  const anyPicked = !!(product || serial || partyName || engineer);
  const clearPicks = () => { setProduct(ALL_PRODUCTS); setSerial(''); setPartyName(''); setEngineer(''); };
  const counts = useMemo(() => ({
    noEngineer: creatable.filter((r) => !r.engineer).length,
    notOnPd: creatable.filter((r) => !r.on_product_database).length,
  }), [creatable]);

  if (!mayList) {
    return (
      <div>
        {!embedded && <PageHeader title="PM Due" subtitle="The month's PM visits from the Warranty and Contract Registers." icon="🗓️" />}
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
  const allTicked = !!creatable.length && creatable.every((r) => !skip.has(keyOf(r)));
  const toggleAll = () => setSkip((cur) => {
    const next = new Set(cur);
    for (const r of creatable) { if (allTicked) next.add(keyOf(r)); else next.delete(keyOf(r)); }
    return next;
  });

  const create = async () => {
    if (!chosen.length) return;
    if (!window.confirm(`Create ${chosen.length} PM call${chosen.length === 1 ? '' : 's'} dated 1st ${month}?`)) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Reading the latest registration time in the month…' });
    try {
      setProgress({ done: 0, total: chosen.length }); setMsg({ tone: 'info', text: 'Creating…' });
      const res = await createPmCalls([{ month, visits: chosen }], (done, total) => setProgress({ done, total }));
      if (!res.ok) {
        setMsg({ tone: 'error', text: `Created ${res.written} before an error: ${res.error} The list below is re-read, so what was created is no longer in it.` });
      } else {
        setMsg({ tone: 'ok', text: `Created ${res.written} PM call${res.written === 1 ? '' : 's'}${res.firstAt ? `, the first registered at ${formatDayTime(new Date(res.firstAt).toISOString())}` : ''}${res.latestBefore ? ` (10 seconds after the month's latest, ${formatDayTime(res.latestBefore)})` : ' (the month had no PM calls yet)'}. They are in the Preventive (PM) register.` });
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
      {!embedded && <PageHeader title="PM Due" subtitle="The month's PM visits from the Warranty and Contract Registers — review, then create the PM calls." icon="🗓️" />}

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
          once, from the warranty. An <b>accessory</b> is a product whose Product Master category is ACCESSORY. The
          filters narrow what is shown — installation, customer (the party’s Party Master Type), product, serial, party and
          engineer — and every <b>Missed PM</b> shown can be ticked and created. Each call is dated the{' '}
          <b>1st of the month</b>, Added On is <b>today</b>, the first is registered <b>10 seconds after the month's latest
          PM call</b> (00:30 on the 1st, 5 seconds apart, if there is none), the engineer is the <b>Product Database's</b>,
          and it reads <b>SCHEDULED PM VISIT</b> / <b>SCHEDULED PM VISIT k / N</b>.
        </p>
      </div>

      {loading && <p className="muted">Working out the visits due in {month}…</p>}
      {loadError && <div className="sheet-banner sheet-banner-error"><span>Could not read the PM visits due: {loadError}</span></div>}

      {rows && !loading && (
        all.length === 0 ? (
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
              {([['ok', 'Installation solved or none'], ['solved', 'Solved'], ['none', 'No installation call'], ['not', 'Installation not solved'], ['all', 'Any installation']] as [InstFilter, string][]).map(([k, label]) => (
                <button key={k} className={`btn btn-sm${inst === k ? ' btn-primary' : ''}`} onClick={() => setInst(k)} disabled={busy}>
                  {label} ({countInst(k)})
                </button>
              ))}
              <span className="muted" aria-hidden="true">|</span>
              {([['customer', 'Customer'], ['not', 'Not a customer'], ['all', 'Any party']] as [PartyFilter, string][]).map(([k, label]) => (
                <button key={k} className={`btn btn-sm${ptype === k ? ' btn-primary' : ''}`} onClick={() => setPtype(k)} disabled={busy}>
                  {label} ({countParty(k)})
                </button>
              ))}
              <span className="muted" aria-hidden="true">|</span>
              <label className="pm-month" style={{ minWidth: 200 }}>Product
                <SelectPicker value={product} onChange={setProduct} options={products} placeholder="All products" disabled={busy} />
              </label>
              <label className="pm-month" style={{ minWidth: 180 }}>Serial No
                <SelectPicker value={serial} onChange={setSerial} options={serials} placeholder="All serials" disabled={busy} />
              </label>
              <label className="pm-month" style={{ minWidth: 220 }}>Party
                <SelectPicker value={partyName} onChange={setPartyName} options={parties} placeholder="All parties" disabled={busy} />
              </label>
              <label className="pm-month" style={{ minWidth: 200 }}>Engineer
                <SelectPicker value={engineer} onChange={setEngineer} options={engineers} placeholder="All engineers" disabled={busy} />
              </label>
              {anyPicked && <button className="btn btn-sm btn-ghost" onClick={clearPicks} disabled={busy}>✕ Clear</button>}
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
                    <th><input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={busy || !creatable.length} aria-label="Tick all Missed PM shown" /></th>
                    <th>Status</th><th>Register</th><th>SA / MC No</th><th>Product</th><th>Serial</th><th>Party</th><th>City</th>
                    <th>Party type</th><th>Installation call</th>
                    <th>Engineer</th><th>Cover</th><th>Visit</th><th>Due</th><th>PM call</th><th>Call status</th><th>Last PM call</th><th>Cover period</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={keyOf(r)}>
                      <td>{!r.generated
                        ? <input type="checkbox" checked={!skip.has(keyOf(r))} onChange={() => toggle(r)} disabled={busy} aria-label={`Create ${r.serial}`} />
                        : null}</td>
                      <td>{r.generated ? 'Generated' : <b>Missed PM</b>}</td>
                      <td>{r.source}</td><td>{r.ref_no}</td>
                      <td>{r.product_name}{r.is_accessory && <span className="muted"> (accessory)</span>}</td><td>{r.serial}</td>
                      <td>{s(r.party_name)}</td><td>{s(r.city)}</td>
                      <td>{r.party_type || <span className="muted">{r.party_type === null ? 'not in Party Master' : 'no type'}</span>}</td>
                      <td>{r.installation_ucn
                        ? <>{r.installation_ucn} <span className={r.install_solved ? 'muted' : ''}>{r.installation_state}</span></>
                        : <span className="muted">none</span>}</td>
                      <td>{r.engineer || <span className="muted">none</span>}</td>
                      <td>{r.cover_type || <span className="muted">—</span>}</td>
                      <td>{r.visit_no} / {r.pm_visits}</td>
                      <td>{formatDay(r.due_date)}</td>
                      <td>{r.generated_ucn ? <><Ucn ucn={r.generated_ucn} state={callStates[r.generated_ucn]} /> <span className="muted">{formatDay(r.generated_on)}</span></> : <span className="muted">—</span>}</td>
                      <td>{r.generated_ucn ? <StateBadge state={callStates[r.generated_ucn]} /> : <span className="muted">—</span>}</td>
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
