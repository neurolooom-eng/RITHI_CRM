import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PageHeader, SearchBox } from '../components/ui/ui';
import { PickList } from '../components/ui/PickList';
import { StateBadge } from '../lib/callstate';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import {
  listSolvedCalls, reportsByCall, consumptionForCall, listCallReportReviews,
  markCallReportReviewed, reopenCall, addReconciliationConsumption,
  handstockForEngineer, supabaseConfigured,
} from '../lib/supabase';
import { num, stockOptionLabel, type HandstockBalance } from '../lib/handstock';
import { parseAnyDate } from '../lib/dates';
import { isReviewable, REVIEW_DONE } from '../lib/callreview';
import './dccr.css';
import './callreview.css';

// ===========================================================================
// CALL REVIEW — the SECOND review, and not the Daily Call Review.
//
// The DCCR asks what the failure WAS (complaint grouping, root cause, frequent
// failure). This asks whether the REPORT the engineer filed is fit to stand.
// So it lists SOLVED calls only, and gives the reviewer the three things they
// can do about one:
//
//   * Reco   — book a spare the engineer did not, as a Reconciliation line.
//              This is the screen's reason for existing: consumption is what
//              hand stock is derived from, so a part fitted and not booked is
//              wrong twice over.
//   * Re-open — the report does not close the call.
//   * Report Reviewed — it does, and somebody has said so.
//
// THE LAYOUT IS THE USER'S (2026-09-11): calls left, the call in the middle,
// what actually happened on it — visit work and spares — on the right.
// ===========================================================================


const PAGE_SIZE = 500;

type Call = Record<string, unknown>;
const g = (r: Call, k: string) => String(r[k] ?? '');

export function CallReview() {
  const { user, can } = useAuth();
  const mayMark = can('callreview.mark');

  const [rows, setRows] = useState<Call[]>([]);
  const [reviews, setReviews] = useState<Record<string, { status: string; remarks: string; by: string; at: string }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'pending' | 'done'>('pending');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [sel, setSel] = useState('');
  // True when the read hit its cap: every count on this screen is then a LOWER
  // BOUND and must carry the "+", or somebody works to a number that is wrong.
  const [capped, setCapped] = useState(false);

  // The selected call's context, loaded on demand: a register of thousands
  // cannot carry every visit and every spare line with it.
  const [visits, setVisits] = useState<Record<string, unknown>[]>([]);
  const [spares, setSpares] = useState<Record<string, unknown>[]>([]);
  const [ctxBusy, setCtxBusy] = useState(false);

  // Reco (a Reconciliation consumption line) and Re-open, each asked for
  // explicitly rather than sitting as a bare button next to the other.
  const [recoOpen, setRecoOpen] = useState(false);
  const [stock, setStock] = useState<HandstockBalance[]>([]);
  const [recoPart, setRecoPart] = useState('');
  const [recoQty, setRecoQty] = useState('1');
  const [recoGrir, setRecoGrir] = useState('');
  const [recoWhy, setRecoWhy] = useState('');
  const [reopenWhy, setReopenWhy] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [remarks, setRemarks] = useState('');

  const [widths, setWidths] = useState<[number, number]>(() => {
    try {
      const raw = localStorage.getItem('rithi.callreview.desk.widths');
      const v = raw ? JSON.parse(raw) : null;
      if (Array.isArray(v) && v.length === 2) return [Number(v[0]), Number(v[1])];
    } catch { /* a remembered layout is not worth an error */ }
    return [30, 34];
  });
  const saveWidths = (w: [number, number]) => {
    try { localStorage.setItem('rithi.callreview.desk.widths', JSON.stringify(w)); } catch { /* as above */ }
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

  const load = async () => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to review calls.'); return; }
    setBusy(true); setErr('');
    try {
      const [calls, revs] = await Promise.all([listSolvedCalls(), listCallReportReviews()]);
      setRows(calls.rows.filter((r) => isReviewable(g(r, 'callState'), g(r, 'status'))));
      setCapped(calls.more);
      setReviews(revs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const ucn = g(r, 'ucn');
      const done = !!reviews[ucn];
      if (only === 'pending' && done) return false;
      if (only === 'done' && !done) return false;
      if (!needle) return true;
      return ['ucn', 'callNumber', 'partyName', 'productName', 'serial', 'allocatedTo', 'complaintReported']
        .some((k) => g(r, k).toLowerCase().includes(needle));
    });
  }, [rows, reviews, q, only]);

  const pendingCount = useMemo(
    () => rows.reduce((n, r) => (reviews[g(r, 'ucn')] ? n : n + 1), 0), [rows, reviews]);

  const current = useMemo(() => rows.find((r) => g(r, 'ucn') === sel) ?? null, [rows, sel]);
  const currentReview = sel ? reviews[sel] : undefined;

  // The call's context. Loaded when the selection changes, and CLEARED first:
  // showing the previous call's visits under this call's header for a moment is
  // how a reviewer signs off the wrong report.
  useEffect(() => {
    if (!sel || !current) { setVisits([]); setSpares([]); return; }
    let alive = true;
    setVisits([]); setSpares([]); setCtxBusy(true);
    setRecoOpen(false); setReopenOpen(false); setRecoPart(''); setRecoQty('1'); setRecoGrir('');
    setRecoWhy(''); setReopenWhy(''); setRemarks(currentReview?.remarks ?? '');
    const callNo = g(current, 'callNumber');
    Promise.all([reportsByCall(callNo || sel), consumptionForCall(sel, callNo)])
      .then(([v, s]) => { if (alive) { setVisits(v); setSpares(s); } })
      .catch(() => { if (alive) { setVisits([]); setSpares([]); } })
      .finally(() => { if (alive) setCtxBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // The engineer's hand stock, for a Reco line. It is the engineer who attended
  // whose stock the part comes off, not the reviewer's.
  const callEngineer = current ? (g(current, 'allocatedTo') || String(visits[0]?.['Visiting Service Engineer'] ?? '')) : '';
  useEffect(() => {
    if (!recoOpen || !callEngineer.trim()) { setStock([]); return; }
    let alive = true;
    handstockForEngineer(callEngineer)
      .then((r) => { if (alive) setStock(r as unknown as HandstockBalance[]); })
      .catch(() => { if (alive) setStock([]); });
    return () => { alive = false; };
  }, [recoOpen, callEngineer]);

  const refreshOne = async () => { await load(); };

  const doMark = async () => {
    if (!sel) return;
    setBusy(true); setErr(''); setNote('');
    const res = await markCallReportReviewed(sel, REVIEW_DONE, remarks, user?.email ?? '');
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Could not mark the review.'); return; }
    logAudit({ action: 'callreview.mark', target: sel, status: 'ok' });
    setReviews((m) => ({ ...m, [sel]: { status: REVIEW_DONE, remarks, by: user?.email ?? '', at: new Date().toISOString() } }));
    setNote(`${sel} marked ${REVIEW_DONE}.`);
  };

  const doReopen = async () => {
    if (!sel) return;
    if (!reopenWhy.trim()) { setErr('Say why the call is being re-opened — it goes on the call.'); return; }
    setBusy(true); setErr(''); setNote('');
    const res = await reopenCall(sel, reopenWhy.trim());
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Could not re-open the call.'); return; }
    logAudit({ action: 'callreview.reopen', target: sel, status: 'ok' });
    setNote(`${sel} re-opened. It leaves this list — it is an open call again.`);
    setReopenOpen(false); setSel('');
    await refreshOne();
  };

  const doReco = async () => {
    if (!sel || !current) return;
    const qty = Math.floor(Number(recoQty) || 0);
    if (!recoPart.trim()) { setErr('Pick the part that was fitted.'); return; }
    if (qty < 1) { setErr('Quantity must be at least 1.'); return; }
    if (!recoWhy.trim()) { setErr('A reconciliation needs a reason — why it is being booked by hand.'); return; }
    setBusy(true); setErr(''); setNote('');
    const res = await addReconciliationConsumption({
      ucn: sel, call_number: g(current, 'callNumber'), engineer: callEngineer,
      lines: [{ part: recoPart, qty, grir: recoGrir }],
      remarks: recoWhy, recorded_by: user?.email ?? '',
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Could not book the reconciliation.'); return; }
    logAudit({ action: 'callreview.reco', target: sel, status: 'ok', meta: { part: recoPart, qty } });
    setNote(`Booked ${qty} × ${recoPart} against ${sel}, off ${callEngineer}'s hand stock.`);
    setRecoOpen(false); setRecoPart(''); setRecoQty('1'); setRecoGrir(''); setRecoWhy('');
    const s = await consumptionForCall(sel, g(current, 'callNumber'));
    setSpares(s);
  };

  const visible = filtered.slice(0, shown);
  const fmt = (v: unknown) => { const d = parseAnyDate(String(v ?? '')); return d ? d.toLocaleDateString('en-GB') : String(v ?? ''); };

  return (
    <div className="page">
      <PageHeader
        title="Call Review"
        count={filtered.length}
        countMore={capped}
        subtitle="Solved calls only — check the report, book a spare the engineer missed, re-open the call, or mark it reviewed."
        actions={<button className="btn btn-sm" onClick={() => void load()} disabled={busy}>↻ Refresh</button>}
      />

      <div className="cr-bar">
        <SearchBox value={q} onChange={setQ} placeholder="UCN, call number, party, product, serial, engineer…" />
        <div className="cr-tabs">
          {([['pending', `Awaiting review (${pendingCount}${capped ? '+' : ''})`], ['done', 'Reviewed'], ['all', 'All solved']] as const).map(([k, lbl]) => (
            <button key={k} className={`btn btn-sm ${only === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setOnly(k); setShown(PAGE_SIZE); }}>{lbl}</button>
          ))}
        </div>
      </div>

      {err && <div className="msg msg-error">{err}</div>}
      {note && <div className="msg msg-ok">{note}</div>}
      {!mayMark && (
        <div className="msg msg-info">
          You can read this review but not record one — <b>Mark a report reviewed</b> is not on your role.
        </div>
      )}

      <div className="dccr-desk" style={{ gridTemplateColumns: `${widths[0]}% 6px ${widths[1]}% 6px 1fr` }}>
        {/* ---- 1. the calls ------------------------------------------------ */}
        <div className="dccr-pane dccr-pane-list">
          <div className="dccr-pane-head">
            Calls <span className="muted">{filtered.length}{capped ? '+' : ''} listed</span>
          </div>
          {busy && !rows.length && <div className="cr-empty muted">Loading solved calls…</div>}
          {!busy && !filtered.length && <div className="cr-empty muted">Nothing here. {only === 'pending' ? 'Every solved call has been reviewed.' : 'No solved calls match.'}</div>}
          <ul className="cr-list">
            {visible.map((r) => {
              const ucn = g(r, 'ucn');
              const rev = reviews[ucn];
              return (
                <li key={ucn}>
                  <button className={`cr-item ${sel === ucn ? 'cr-item-on' : ''}`} onClick={() => setSel(ucn)}>
                    <div className="cr-item-top">
                      <b>{ucn}</b>
                      {rev ? <span className="cr-flag cr-flag-done">✓ Reviewed</span> : <span className="cr-flag">Awaiting review</span>}
                    </div>
                    <div className="cr-item-party">{g(r, 'partyName')}</div>
                    <div className="muted cr-item-sub">
                      {[g(r, 'productName'), g(r, 'serial'), g(r, 'allocatedTo')].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length > visible.length && (
            <div className="cr-more">
              <button className="btn btn-sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Load more ({filtered.length - visible.length} to go)
              </button>
            </div>
          )}
        </div>

        <div className="dccr-split" onPointerDown={drag(0)} role="separator" aria-orientation="vertical" title="Drag to resize" />

        {/* ---- 2. the call ------------------------------------------------- */}
        <div className="dccr-pane dccr-pane-review">
          {!current ? (
            <div className="cr-empty muted">Pick a call on the left.</div>
          ) : (
            <>
              <div className="cr-h">
                <b>{g(current, 'ucn')}</b>
                <StateBadge state={g(current, 'callState')} />
              </div>
              <dl className="cr-dl">
                {([
                  ['Call Number', g(current, 'callNumber')],
                  ['Call Type', g(current, 'callType')],
                  ['Party', g(current, 'partyName')],
                  ['Where', [g(current, 'city'), g(current, 'state')].filter(Boolean).join(', ')],
                  ['Product', g(current, 'productName')],
                  ['Serial', g(current, 'serial')],
                  ['Cover', g(current, 'itemStatus')],
                  ['Engineer', g(current, 'allocatedTo')],
                  ['Registered', fmt(g(current, 'regDate'))],
                  ['Complaint', g(current, 'standardComplaint')],
                  ['Reported', g(current, 'complaintReported')],
                ] as const).filter(([, v]) => String(v).trim()).map(([k, v]) => (
                  <div className="cr-dl-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>

              <div className="cr-actions">
                <div className="cr-review-state">
                  {currentReview
                    ? <span className="cr-flag cr-flag-done">✓ {currentReview.status}{currentReview.by ? ` — ${currentReview.by}` : ''}{currentReview.at ? ` · ${fmt(currentReview.at)}` : ''}</span>
                    : <span className="cr-flag">Awaiting review</span>}
                </div>

                {mayMark && (
                  <>
                    <label className="field">
                      <span className="field-label">Review remarks <span className="muted">(optional)</span></span>
                      <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    </label>
                    <div className="cr-btns">
                      <button className="btn btn-primary btn-sm" onClick={() => void doMark()} disabled={busy}>
                        {currentReview ? 'Update review' : '✓ Report Reviewed'}
                      </button>
                      <button className="btn btn-sm" onClick={() => { setRecoOpen((v) => !v); setReopenOpen(false); }} disabled={busy}>
                        ＋ Reco
                      </button>
                      <button className="btn btn-sm" onClick={() => { setReopenOpen((v) => !v); setRecoOpen(false); }} disabled={busy}>
                        ↺ Re-open call
                      </button>
                    </div>
                  </>
                )}

                {recoOpen && (
                  <div className="cr-box">
                    <div className="cr-box-h">Reconciliation — book a spare the engineer did not</div>
                    <p className="muted cr-note">
                      It comes off <b>{callEngineer || 'the attending engineer'}</b>&rsquo;s hand stock, not yours, and is
                      capped at what they hold. The line is recorded as a Reconciliation with your name on it.
                    </p>
                    <PickList
                      value={recoPart}
                      options={stock.map((r) => r.part)}
                      onPick={setRecoPart}
                      placeholder="Type any part of the code…"
                      labelFor={(v) => { const r = stock.find((x) => x.part === v); return r ? stockOptionLabel(r) : v; }}
                      isDisabled={(v) => num(stock.find((x) => x.part === v)?.on_hand) <= 0}
                      emptyLabel={stock.length ? '— pick a part —' : '— nothing in that engineer’s hand stock —'}
                    />
                    <div className="cr-reco-row">
                      <input className="input" type="number" min={1} value={recoQty} onChange={(e) => setRecoQty(e.target.value)} placeholder="Qty" />
                      <input className="input" value={recoGrir} onChange={(e) => setRecoGrir(e.target.value)} placeholder="GRIR / traceability" />
                    </div>
                    <textarea className="input" rows={2} value={recoWhy} onChange={(e) => setRecoWhy(e.target.value)} placeholder="Why is this being booked by hand? (required)" />
                    <div className="cr-btns">
                      <button className="btn btn-primary btn-sm" onClick={() => void doReco()} disabled={busy}>Book it</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setRecoOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {reopenOpen && (
                  <div className="cr-box">
                    <div className="cr-box-h">Re-open this call</div>
                    <p className="muted cr-note">
                      The call becomes open again and leaves this list. No visit is invented; the reason goes on the call.
                    </p>
                    <textarea className="input" rows={2} value={reopenWhy} onChange={(e) => setReopenWhy(e.target.value)} placeholder="Why is it being re-opened? (required)" />
                    <div className="cr-btns">
                      <button className="btn btn-primary btn-sm" onClick={() => void doReopen()} disabled={busy}>Re-open</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setReopenOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="dccr-split" onPointerDown={drag(1)} role="separator" aria-orientation="vertical" title="Drag to resize" />

        {/* ---- 3. what actually happened ----------------------------------- */}
        <div className="dccr-pane dccr-pane-details">
          {!current ? (
            <div className="cr-empty muted">&nbsp;</div>
          ) : (
            <>
              <div className="cr-h"><b>Visit work details</b> <span className="muted">{visits.length} visit{visits.length === 1 ? '' : 's'}</span></div>
              {ctxBusy && <div className="muted cr-note">Loading…</div>}
              {!ctxBusy && !visits.length && <div className="muted cr-note">No visit on record — which on a solved call is itself the finding.</div>}
              {visits.map((v, i) => {
                const d = (v.data && typeof v.data === 'object' ? v.data : {}) as Record<string, unknown>;
                return (
                  <div className="cr-visit" key={i}>
                    <div className="cr-visit-h">
                      <b>{fmt(v.visit_at) || fmt(v.updated_at)}</b>
                      <span className="muted">{String(v.engineer ?? '')}</span>
                    </div>
                    <dl className="cr-dl">
                      {Object.entries(d)
                        .filter(([k, val]) => String(val ?? '').trim() && !/^email-id$/i.test(k))
                        .map(([k, val]) => (
                          <div className="cr-dl-row" key={k}><dt>{k}</dt><dd>{String(val)}</dd></div>
                        ))}
                    </dl>
                  </div>
                );
              })}

              <div className="cr-h cr-h-gap"><b>Spares consumed</b> <span className="muted">{spares.length} line{spares.length === 1 ? '' : 's'}</span></div>
              {!ctxBusy && !spares.length && <div className="muted cr-note">Nothing booked against this call.</div>}
              {spares.length > 0 && (
                <table className="cr-spares">
                  <thead><tr><th>Part</th><th>Qty</th><th>GRIR</th><th>Source</th></tr></thead>
                  <tbody>
                    {spares.map((s, i) => (
                      <tr key={i} className={Number(s.qty ?? 0) === 0 ? 'cr-void' : ''}>
                        <td>{String(s.part ?? '')}</td>
                        <td>{String(s.qty ?? '')}{Number(s.qty ?? 0) === 0 ? ' (voided)' : ''}</td>
                        <td>{String(s.grir ?? '')}</td>
                        <td>{String(s.source ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
