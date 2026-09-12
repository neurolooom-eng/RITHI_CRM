// ===========================================================================
// FIELD FAILURE REGISTER — THE REVIEW DESK.
//
// The user, 2026-09-12: "For the Register, Use the Review Desk -- Left side:
// List of FFRs, Center: Details of FFR, Right Side: Details of the Call's Visit
// Details + Spares Used [Spares Used in a Tabular Format]."
//
// THE SAME DESK THE CALL REVIEW USES, and deliberately so: the layout, the
// resizable splitters and the right-hand pane are shared (dccr.css,
// callreview.css, components/callcontext). Somebody who works one desk can work
// the other without learning it twice, and the pane that shows what happened on
// a call has ONE definition — two copies of a quality record's presentation
// would drift.
//
// WHY IT SUITS THIS REGISTER. An FFR is read against its call: the report says
// what was believed when it was raised, and the question a weekly review asks
// is whether the visits and the parts fitted still bear that out. In a flat
// table those are three screens apart. Here they are side by side, which is
// what the user asked for and the reason they asked.
//
// THE FLAT TABLE IS NOT GONE — it is the other view on this tab. It still does
// what a desk cannot: every column at once, sorted, filtered and exported.
// ===========================================================================
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBox } from '../components/ui/ui';
import { CallContext } from '../components/callcontext/CallContext';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';
import { reportHistory, consumptionForCall, ffrCallContext } from '../lib/supabase';
import { fmtLongDate } from '../lib/format';
import { FFR_COLUMNS, FFR_LIVE_COLUMNS, ffrEffectWithdrawn, ffrDueForReview } from '../lib/ffr';
import './dccr.css';
import './callreview.css';

type Row = Record<string, unknown> & { id: string };
const g = (r: Row, k: string) => String(r[k] ?? '');

const DATE_KEYS = new Set(['ffr_date', 'crn_date', 'installation_date', 'call_solved_at', 'reviewed_at']);

const WIDTHS_KEY = 'rithi.ffr.desk.widths';

export function FieldFailureDesk({ rows, busy, onEdit }: {
  rows: Row[];
  busy: boolean;
  /** Opening the report for editing stays the register's job — the desk shows
   *  and the drawer writes, so there is one save path rather than two. */
  onEdit: (r: Row) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'open' | 'due'>('all');
  const [sel, setSel] = useState('');
  const [visits, setVisits] = useState<Record<string, unknown>[]>([]);
  const [spares, setSpares] = useState<Record<string, unknown>[]>([]);
  const [ctxBusy, setCtxBusy] = useState(false);

  // The same remembered layout the Call Review desk has, under its own key —
  // the two desks hold different things and a width that suits one need not
  // suit the other.
  const [widths, setWidths] = useState<[number, number]>(() => {
    try {
      const raw = localStorage.getItem(WIDTHS_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (Array.isArray(v) && v.length === 2) return [Number(v[0]), Number(v[1])];
    } catch { /* a remembered layout is not worth an error */ }
    return [28, 36];
  });
  const saveWidths = (w: [number, number]) => {
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(w)); } catch { /* as above */ }
  };
  const drag = (which: 0 | 1) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const host = e.currentTarget.parentElement as HTMLElement | null;
    if (!host) return;
    const move = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const pct = ((ev.clientX - r.left) / Math.max(1, r.width)) * 100;
      if (which === 0) setWidths(([, b]) => [Math.min(Math.max(pct, 14), 60), b]);
      else setWidths(([a]) => [a, Math.min(Math.max(pct - a, 18), 70)]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setWidths((w) => { saveWidths(w); return w; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === 'open' && g(r, 'ffr_status') !== 'Open') return false;
      if (only === 'due' && !ffrDueForReview(r, weekAgo)) return false;
      if (!needle) return true;
      return ['ffr_no', 'ucn', 'customer_name', 'product_name', 'product_serial', 'problem_reported']
        .some((k) => g(r, k).toLowerCase().includes(needle));
    });
  }, [rows, q, only, weekAgo]);

  // A UCN carries its call's colour wherever it appears — the standing rule.
  useCallStates(filtered.map((r) => g(r, 'ucn')).filter(Boolean));

  const current = useMemo(() => rows.find((r) => g(r, 'ffr_no') === sel) ?? null, [rows, sel]);

  // THE CALL'S CONTEXT, cleared FIRST. Showing the previous report's visits
  // under this one's header, even for a moment, is how somebody reads the wrong
  // failure — the Call Review desk has the same note for the same reason.
  useEffect(() => {
    if (!current) { setVisits([]); setSpares([]); return; }
    const ucn = g(current, 'ucn');
    if (!ucn) { setVisits([]); setSpares([]); return; }
    let alive = true;
    setVisits([]); setSpares([]); setCtxBusy(true);
    // THE REGISTER'S OWN CONTEXT FIRST (0178), then the tables.
    //
    // `reports` and `spare_consumption` are scoped to CALL visibility, which
    // reading the register does not confer — so somebody granted `ffr.view`
    // saw an empty pane beside every report until this existed. The function
    // returns the visits and spares for a call that HAS a report, to somebody
    // who may read the register; NULL otherwise, and then the direct reads
    // apply the caller's own policies exactly as before. Nobody loses a visit
    // they could already see.
    //
    // BY UCN, not by call number: a report carries the UCN and nothing else
    // identifying the call, and `reports` is keyed on it.
    ffrCallContext(ucn)
      .then(async (ctx) => ctx ?? {
        visits: await reportHistory(ucn),
        spares: await consumptionForCall(ucn, ''),
      })
      .then(({ visits: v, spares: s }) => { if (alive) { setVisits(v); setSpares(s); } })
      .catch(() => { if (alive) { setVisits([]); setSpares([]); } })
      .finally(() => { if (alive) setCtxBusy(false); });
    return () => { alive = false; };
  }, [current]);

  const dueCount = useMemo(() => rows.filter((r) => ffrDueForReview(r, weekAgo)).length, [rows, weekAgo]);
  const openCount = useMemo(() => rows.filter((r) => g(r, 'ffr_status') === 'Open').length, [rows]);

  const show = (r: Row, k: string) => (DATE_KEYS.has(k) ? (fmtLongDate(r[k]) || '') : g(r, k));

  return (
    <>
      <div className="cr-bar">
        <SearchBox value={q} onChange={setQ} placeholder="FFR no, UCN, customer, product, serial, problem…" />
        <div className="cr-tabs">
          <button className={`chip ${only === 'all' ? 'chip-on' : ''}`} onClick={() => setOnly('all')}>
            All <b>{rows.length}</b>
          </button>
          <button className={`chip ${only === 'open' ? 'chip-on' : ''}`} onClick={() => setOnly('open')}>
            Open <b>{openCount}</b>
          </button>
          {/* The whole point of a weekly cycle is knowing which have not been
              looked at — and updated_at cannot answer it, because any edit
              moves that (0168). */}
          <button className={`chip ${only === 'due' ? 'chip-on' : ''}`} onClick={() => setOnly('due')}>
            Due a review <b>{dueCount}</b>
          </button>
        </div>
      </div>

      <div className="dccr-desk" style={{ gridTemplateColumns: `${widths[0]}% 6px ${widths[1]}% 6px 1fr` }}>
        {/* ---- 1. the reports ---------------------------------------------- */}
        <div className="dccr-pane dccr-pane-list">
          <div className="dccr-pane-head">
            Field Failure Reports <span className="muted">{filtered.length} listed</span>
          </div>
          {busy && !rows.length && <div className="cr-empty muted">Loading the register…</div>}
          {!busy && !filtered.length && <div className="cr-empty muted">Nothing here.</div>}
          <ul className="cr-list">
            {filtered.map((r) => {
              const no = g(r, 'ffr_no');
              return (
                <li key={r.id}>
                  <button className={`cr-item ${sel === no ? 'cr-item-on' : ''}`} onClick={() => setSel(no)}>
                    <div className="cr-item-top">
                      <b>{no}</b>
                      {g(r, 'ffr_status') === 'Open'
                        ? <span className="cr-flag">Open</span>
                        : <span className="cr-flag cr-flag-done">✓ {g(r, 'ffr_status')}</span>}
                    </div>
                    <div className="cr-item-party">{g(r, 'customer_name')}</div>
                    <div className="muted cr-item-sub">
                      {g(r, 'product_name')}{g(r, 'product_serial') ? ` · ${g(r, 'product_serial')}` : ''}
                      {' · '}{fmtLongDate(r.ffr_date)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="dccr-split" onPointerDown={drag(0)} role="separator" aria-orientation="vertical" title="Drag to resize" />

        {/* ---- 2. the report ----------------------------------------------- */}
        <div className="dccr-pane dccr-pane-review">
          {!current ? (
            <div className="cr-empty muted">Pick a report on the left.</div>
          ) : (
            <>
              <div className="cr-h">
                <b>{g(current, 'ffr_no')}</b>
                <Ucn ucn={current.ucn} state={callStateFor(current.ucn)} />
              </div>

              {ffrEffectWithdrawn(current) && (
                <div className="msg msg-info">
                  Raised on <b>Any Potential Effect = YES</b>; the review now reads
                  “{g(current, 'live_any_potential_effect')}”. The report stands — a quality
                  record is not removed because an opinion was revised.
                </div>
              )}

              {/* THE RECORD, then the call AS IT STANDS NOW — in that order and
                  under separate headings, because they answer different
                  questions and a reader has to be able to tell which is which. */}
              <div className="cr-h cr-h-gap"><b>The report</b></div>
              <dl className="cr-dl">
                {FFR_COLUMNS.filter((c) => c.key !== 'ffr_no' && show(current, c.key)).map((c) => (
                  <div className="cr-dl-row" key={c.key}><dt>{c.header}</dt><dd>{show(current, c.key)}</dd></div>
                ))}
              </dl>

              <div className="cr-h cr-h-gap"><b>The call, as it stands now</b></div>
              <dl className="cr-dl">
                {FFR_LIVE_COLUMNS.filter((c) => show(current, c.key)).map((c) => (
                  <div className="cr-dl-row" key={c.key}><dt>{c.header}</dt><dd>{show(current, c.key)}</dd></div>
                ))}
              </dl>

              <div className="cr-actions">
                <div className="cr-btns">
                  <button className="btn btn-primary btn-sm" onClick={() => onEdit(current as Row)}>
                    ✎ Edit / weekly review
                  </button>
                  <button className="btn btn-sm"
                          onClick={() => navigate(`/ffr/${encodeURIComponent(g(current, 'ffr_no'))}`)}>
                    🖨 Print
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dccr-split" onPointerDown={drag(1)} role="separator" aria-orientation="vertical" title="Drag to resize" />

        {/* ---- 3. what actually happened on the call ------------------------ */}
        <div className="dccr-pane dccr-pane-details">
          {!current ? (
            <div className="cr-empty muted">&nbsp;</div>
          ) : (
            <CallContext
              visits={visits}
              spares={spares}
              busy={ctxBusy}
              // NOT the Call Review's wording. That desk lists SOLVED calls, so
              // no visit is itself a finding; a Field Failure Report may be
              // raised on an open call, where it is simply not yet true.
              noVisitsNote="No visit on record for this call yet."
            />
          )}
        </div>
      </div>
    </>
  );
}
