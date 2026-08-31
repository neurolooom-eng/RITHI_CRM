import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Modal, Toolbar, SearchBox, EmptyState, Drawer } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo, todayISO } from '../lib/format';
import {
  listPendingDispatch, dispatchSpareLines, dropSpareLines, listSpareDispatches, listDispatchLines, supabaseConfigured,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import {
  toPendingLine, groupByEngineer, daysWaiting, ageTone, selectionProblem, selectedFrom, summarise,
  type PendingLine, type EngineerQueue,
} from '../lib/sparedispatch';
import { partDescription } from '../lib/handstock';
import './fieldcalls.css';

// ===========================================================================
// PENDING DISPATCH — the Stores queue.
//
// Approvals are decided per spare, but dispatch is a BATCH: the Stores
// incharge works one engineer at a time, ticks everything that is going to
// them, and books it all out under a single stock out. So this screen is the
// Stores view of the register, not another copy of it:
//
//   • grouped by ENGINEER, longest-waiting first — the order Stores works in;
//   • multi-select within a group, with select-all per engineer;
//   • one "Dispatch" that creates the stock out, generates the SO and DC
//     numbers and stamps every spare in the batch (dispatch_spare_lines(),
//     migration 0027_spare_dispatch.sql) — atomically, so a batch never lands
//     half done.
//
// A batch may not span two engineers: a DC is one delivery to one person. The
// button says so before the database has to.
//
// What happens next needs no further step: the stock out is what hand stock
// counts (0023), with no acknowledgement needed, so the spares appear in the
// engineer's hand stock and in the call report's consumption picker the moment
// they are booked out. The engineer's acknowledgement stays a confirmation on
// the spare request, not a condition for holding the part.
// ===========================================================================

const CACHE_KEY = 'spareDispatch';
const MIGRATION_HINT = 'Pending dispatch needs migration 0027_spare_dispatch.sql — run it in the Supabase SQL editor (apply bundle: Spare_1.sql).';

type Tab = 'queue' | 'sent';

export function SpareDispatch() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const onDb = supabaseConfigured();
  const mayDispatch = can('spare.dispatch');
  const cached = onDb ? loadCache<PendingLine & { id: string }>(CACHE_KEY) : null;
  const [tab, setTab] = useState<Tab>('queue');
  const [lines, setLines] = useState<PendingLine[]>(cached?.rows ?? []);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  // The register links here with ?engineer=…, so "Dispatch…" on a spare lands
  // on that engineer's queue instead of the whole list.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('engineer') ?? '');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load the dispatch queue.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true);
    try {
      const mapped = (await listPendingDispatch()).map(toPendingLine);
      setLines(mapped);
      setPicked((cur) => new Set([...cur].filter((id) => mapped.some((l) => l.line_id === id))));
      setLastSync(saveCache(CACHE_KEY, mapped.map((l) => ({ ...l, id: String(l.line_id) }))));
      setMsg(mapped.length
        ? { tone: 'ok', text: `${mapped.length} spare${mapped.length === 1 ? '' : 's'} waiting to go out.` }
        : { tone: 'ok', text: 'Nothing waiting — every approved spare has been booked out.' });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        tone: 'error',
        text: /spare_pending_dispatch|does not exist|schema cache/i.test(text) ? MIGRATION_HINT : `Load failed: ${text}`,
      });
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (onDb && lines.length && !isStale(lastSync)) setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    else void load();
    const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
    return () => { if (id) window.clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => [l.engineer, l.or_no, l.line_uid, l.part, l.ucn, l.call_number, l.party_name]
      .some((v) => v.toLowerCase().includes(q)));
  }, [lines, search]);

  const queues = useMemo(() => groupByEngineer(visible), [visible]);
  const totals = useMemo(() => summarise(lines), [lines]);
  const selected = useMemo(() => selectedFrom(lines, picked), [lines, picked]);
  const problem = selectionProblem(selected);

  // The engineer a batch would go to — the only one in the selection.
  const target = selected[0]?.engineer ?? '';

  const toggle = (id: number) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Ticking a whole engineer replaces the selection rather than adding to it:
  // a batch is one engineer's, so carrying another's forward could only ever
  // produce a selection the dispatch would refuse.
  const toggleGroup = (g: EngineerQueue) => setPicked((cur) => {
    const ids = g.lines.map((l) => l.line_id);
    const allOn = ids.every((id) => cur.has(id));
    if (allOn) return new Set([...cur].filter((id) => !ids.includes(id)));
    const otherEngineer = [...cur].some((id) => !ids.includes(id));
    return new Set(otherEngineer ? ids : [...cur, ...ids]);
  });

  const runDispatch = async (courier: string, remarks: string, dcDate: string) => {
    setBusy(true);
    const actor = String(user?.name ?? user?.email ?? '');
    const ids = selected.map((l) => l.line_id);
    const res = await dispatchSpareLines(ids, courier, remarks, dcDate, actor);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Dispatch failed.' }); return; }
    const so = String(res.dispatch?.uid ?? '');
    const dc = String(res.dispatch?.dc_number ?? '');
    logAudit({
      action: 'spare.dispatch', target: so, status: 'ok',
      meta: { engineer: target, spares: ids.length, stock_out: so, dc, courier },
    });
    setConfirming(false);
    setPicked(new Set());
    setMsg({
      tone: 'ok',
      text: `Stock out ${so} — ${ids.length} spare${ids.length === 1 ? '' : 's'} booked out to ${target}. It is in their hand stock now.`,
    });
    await load();
    // Straight to the challan: the delivery does not leave Stores without it.
    navigate(`/dc/${encodeURIComponent(so)}`);
  };

  // Stores drops the selected lines instead of sending them (no DC generated).
  const runDrop = async () => {
    const reason = prompt(`Reason for dropping ${selected.length} spare${selected.length === 1 ? '' : 's'}? (short supply, no longer needed, superseded…)`);
    if (reason == null) return;
    setBusy(true);
    const actor = String(user?.name ?? user?.email ?? '');
    const ids = selected.map((l) => l.line_id);
    const res = await dropSpareLines(ids, reason.trim(), actor);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not drop the spares.' }); return; }
    logAudit({ action: 'spare.drop', target: String(ids.length), status: 'ok', meta: { spares: ids.length, reason: reason.trim() } });
    setPicked(new Set());
    setMsg({ tone: 'ok', text: `Dropped ${ids.length} spare${ids.length === 1 ? '' : 's'} — recorded as not sent.` });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Pending Dispatch"
        subtitle="Approved spares waiting at Stores, grouped by engineer. Tick and book them out in one stock out."
        icon="🚚"
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard label="Spares waiting" value={totals.spares} icon="📦" tone="primary" sub="cleared every approval" />
        <KpiCard label="Units" value={totals.qty} icon="🔩" tone="info" sub="to be booked out" />
        <KpiCard label="Engineers" value={totals.engineers} icon="👤" tone="info" sub="waiting for a delivery" />
        <KpiCard label="Orders" value={totals.orders} icon="📄" tone="neutral" sub="ORs represented" />
        <KpiCard label="Ageing" value={totals.ageing} icon="⏳" tone={totals.ageing ? 'danger' : 'neutral'} sub="waiting a week or more" />
      </KpiGrid>

      <div className="stage-chips hs-tabs">
        <button className={`chip ${tab === 'queue' ? 'chip-on' : ''}`} onClick={() => setTab('queue')}>🚚 Queue <b>{lines.length}</b></button>
        <button className={`chip ${tab === 'sent' ? 'chip-on' : ''}`} onClick={() => setTab('sent')}>📄 Stock outs</button>
      </div>

      {tab === 'sent' ? <StockOuts onMigrationError={() => setMsg({ tone: 'error', text: MIGRATION_HINT })} onPrint={(so) => navigate(`/dc/${encodeURIComponent(so)}`)}
          onDeclare={(so) => navigate(`/declaration/${encodeURIComponent(so)}`)} /> : (
        <>
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Engineer, OR, spare ID, part, party…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <button className="btn btn-sm" onClick={() => setOpen(new Set(queues.map((q) => q.engineer_key)))}>⌄ Expand all</button>
            <button className="btn btn-sm" onClick={() => setOpen(new Set())}>⌃ Collapse all</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {lines.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => csvExport('pending-dispatch.csv', [
                  { key: 'engineer', header: 'Engineer' }, { key: 'or_no', header: 'OR' },
                  { key: 'line_uid', header: 'Spare ID' }, { key: 'part', header: 'Part' },
                  { key: 'qty', header: 'Qty' }, { key: 'req_type', header: 'Type' },
                  { key: 'call_number', header: 'Call' }, { key: 'party_name', header: 'Party' },
                  { key: 'waiting_since', header: 'Waiting since' },
                ], visible as unknown as Record<string, unknown>[])}
              >⭳ Export CSV</button>
            )}
          </Toolbar>

          {!queues.length ? (
            <EmptyState
              title={lines.length ? 'No spares match this search.' : 'Nothing waiting for dispatch'}
              hint={lines.length ? undefined : 'A spare appears here once it has cleared every approval it needs.'}
            />
          ) : queues.map((q) => (
            <QueueCard
              key={q.engineer_key}
              queue={q}
              picked={picked}
              expanded={open.has(q.engineer_key) || queues.length <= 3}
              onExpand={() => setOpen((cur) => {
                const next = new Set(cur);
                if (next.has(q.engineer_key)) next.delete(q.engineer_key); else next.add(q.engineer_key);
                return next;
              })}
              onToggle={toggle}
              onToggleAll={() => toggleGroup(q)}
            />
          ))}

          {/* The action bar only appears once something is ticked, and says
              what would go out — a DC is a document, not an undo. */}
          {!!selected.length && (
            <div className="dispatch-bar card card-pad">
              <div>
                <b>{selected.length}</b> spare{selected.length === 1 ? '' : 's'}
                {' · '}<b>{selected.reduce((t, l) => t + l.qty, 0)}</b> unit{selected.reduce((t, l) => t + l.qty, 0) === 1 ? '' : 's'}
                {!problem && <> → <b>{target}</b></>}
                {problem && <span className="badge badge-warning" style={{ marginLeft: 8 }}>{problem}</span>}
              </div>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
              <button
                className="btn btn-sm btn-danger"
                disabled={!mayDispatch || busy || !selected.length}
                title={mayDispatch ? 'Drop these spares — record as not sent (no DC)' : 'Needs the spare.dispatch permission'}
                onClick={() => void runDrop()}
              >⊘ Drop {selected.length}</button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!!problem || !mayDispatch || busy}
                title={mayDispatch ? undefined : 'Dispatch needs the spare.dispatch permission'}
                onClick={() => setConfirming(true)}
              >🚚 Dispatch {selected.length}</button>
            </div>
          )}
        </>
      )}

      <DispatchModal
        open={confirming}
        engineer={target}
        lines={selected}
        busy={busy}
        onClose={() => setConfirming(false)}
        onConfirm={runDispatch}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One engineer's queue: a header that can be ticked whole, and the spares.
// ---------------------------------------------------------------------------
function QueueCard({ queue, picked, expanded, onExpand, onToggle, onToggleAll }: {
  queue: EngineerQueue;
  picked: Set<number>;
  expanded: boolean;
  onExpand: () => void;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}) {
  const ids = queue.lines.map((l) => l.line_id);
  const on = ids.filter((id) => picked.has(id)).length;
  const days = daysWaiting(queue.oldest);
  return (
    <div className="card queue-card">
      <div className="queue-head">
        <input
          type="checkbox"
          checked={on === ids.length && ids.length > 0}
          ref={(el) => { if (el) el.indeterminate = on > 0 && on < ids.length; }}
          onChange={onToggleAll}
          aria-label={`Select every spare for ${queue.engineer}`}
        />
        <button className="btn btn-ghost btn-sm queue-name" onClick={onExpand}>
          {expanded ? '⌄' : '›'} <b>{queue.engineer}</b>
        </button>
        <span className="muted">{queue.spares} spare{queue.spares === 1 ? '' : 's'} · {queue.qty} unit{queue.qty === 1 ? '' : 's'} · {queue.orders} OR{queue.orders === 1 ? '' : 's'}</span>
        <div className="spacer" />
        {!!queue.oldest && (
          <span className={`badge badge-${ageTone(days)}`} title={`Oldest waiting since ${fmtLongDate(queue.oldest)}`}>
            waiting {days} day{days === 1 ? '' : 's'}
          </span>
        )}
        {on > 0 && <span className="badge badge-info">{on} ticked</span>}
      </div>

      {expanded && (
        <div className="queue-lines">
          {queue.lines.map((l) => {
            const days = daysWaiting(l.waiting_since ?? '');
            return (
              <label key={l.line_id} className={`queue-line ${picked.has(l.line_id) ? 'queue-line-on' : ''}`}>
                <input type="checkbox" checked={picked.has(l.line_id)} onChange={() => onToggle(l.line_id)} />
                <span className="ql-id" title="Spare ID">{l.line_uid || `${l.or_no}-${l.row_no}`}</span>
                <span className="ql-part">
                  <b>{l.part_code}</b>{partDescription(l.part) && <> — {partDescription(l.part)}</>}
                </span>
                <span className="ql-qty">×{l.qty}</span>
                <span className="ql-meta muted">
                  {l.req_type}
                  {l.call_number && ` · call ${l.call_number}`}
                  {l.party_name && ` · ${l.party_name}`}
                </span>
                <span className={`badge badge-${ageTone(days)}`}>{days}d</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The batch. The numbers are NOT entered: Postgres generates the stock out and
// the DC when the batch lands, so two dispatchers cannot mint the same one.
// ---------------------------------------------------------------------------
function DispatchModal({ open, engineer, lines, busy, onClose, onConfirm }: {
  open: boolean;
  engineer: string;
  lines: PendingLine[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (courier: string, remarks: string, dcDate: string) => void | Promise<void>;
}) {
  const [courier, setCourier] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dcDate, setDcDate] = useState(todayISO());
  useEffect(() => { if (open) { setCourier(''); setRemarks(''); setDcDate(todayISO()); } }, [open]);
  const qty = lines.reduce((t, l) => t + l.qty, 0);

  return (
    <Modal open={open} onClose={onClose} title={`Dispatch ${lines.length} spare${lines.length === 1 ? '' : 's'} to ${engineer}`} width={560}>
      <p className="muted" style={{ marginTop: 0 }}>
        {qty} unit{qty === 1 ? '' : 's'} across {new Set(lines.map((l) => l.request_uid)).size} OR
        {new Set(lines.map((l) => l.request_uid)).size === 1 ? '' : 's'}. The stock-out and DC numbers are generated when
        this is booked out. The spares count as {engineer}&rsquo;s hand stock from that moment — the acknowledgement is a
        confirmation, not a condition.
      </p>

      <div className="queue-lines queue-lines-compact">
        {lines.map((l) => (
          <div key={l.line_id} className="queue-line">
            <span className="ql-id">{l.line_uid}</span>
            <span className="ql-part"><b>{l.part_code}</b>{partDescription(l.part) && <> — {partDescription(l.part)}</>}</span>
            <span className="ql-qty">×{l.qty}</span>
          </div>
        ))}
      </div>

      <label className="field">
        <span className="field-label">DC date</span>
        <input className="input" type="date" value={dcDate} onChange={(e) => setDcDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Courier / carried by</span>
        <input className="input" value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Blue Dart, hand delivery…" />
      </label>
      <label className="field">
        <span className="field-label">Dispatch remarks</span>
        <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !lines.length} onClick={() => void onConfirm(courier, remarks, dcDate)}>
          {busy ? 'Booking out…' : '🚚 Book out'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Stock outs already booked — the record behind every DC.
// ---------------------------------------------------------------------------
function StockOuts({ onMigrationError, onPrint, onDeclare }: {
  onMigrationError: () => void; onPrint: (stockOut: string) => void; onDeclare: (stockOut: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLines, setDetailLines] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    listSpareDispatches()
      .then(setRows)
      .catch((e) => { if (/spare_dispatches|does not exist|schema cache/i.test(String(e))) onMigrationError(); })
      .finally(() => setBusy(false));
    // eslint-disable-next-line
  }, []);

  const openOne = (r: Record<string, unknown>) => {
    setDetail(r); setDetailLines([]);
    void listDispatchLines(String(r.uid)).then(setDetailLines).catch(() => setDetailLines([]));
  };

  if (busy && !rows.length) return <EmptyState title="Loading stock outs…" />;
  if (!rows.length) return <EmptyState title="No stock outs yet" hint="Book a batch out from the Queue tab and it appears here." />;

  return (
    <>
      {rows.map((r) => (
        <div key={String(r.uid)} className="card queue-card queue-card-click" onClick={() => openOne(r)}>
          <div className="queue-head">
            <span className="ql-id"><b>{String(r.uid)}</b></span>
            <span><b>{String(r.engineer)}</b></span>
            <span className="muted">{String(r.line_count)} spare{Number(r.line_count) === 1 ? '' : 's'} · {String(r.total_qty)} units</span>
            <div className="spacer" />
            {!!String(r.courier ?? '') && <span className="muted">{String(r.courier)}</span>}
            <span className="muted">{fmtLongDate(r.dc_date)}</span>
            <button
              className="btn btn-sm"
              onClick={(e) => { e.stopPropagation(); onPrint(String(r.uid)); }}
            >🖨 Challan</button>
            <button
              className="btn btn-sm"
              title="The declaration that travels with the parcel"
              onClick={(e) => { e.stopPropagation(); onDeclare(String(r.uid)); }}
            >📜 Declaration</button>
          </div>
        </div>
      ))}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `Stock out ${String(detail.uid)}` : ''} width={720}>
        {detail && (
          <div className="card-pad">
            <p className="muted" style={{ marginTop: 0 }}>
              To <b>{String(detail.engineer)}</b> on {fmtLongDate(detail.dc_date)}
              {String(detail.courier ?? '') && <> · {String(detail.courier)}</>}
              {String(detail.dispatched_by ?? '') && <> · booked out by {String(detail.dispatched_by)}</>}
            </p>
            {!!String(detail.remarks ?? '') && <p className="muted">{String(detail.remarks)}</p>}
            <button className="btn btn-sm btn-primary" onClick={() => onPrint(String(detail.uid))}>🖨 Print challan</button>
            {' '}
            <button className="btn btn-sm" onClick={() => onDeclare(String(detail.uid))}>📜 Declaration</button>
            <div className="queue-lines queue-lines-compact">
              {detailLines.map((l) => (
                <div key={String(l.id)} className="queue-line">
                  <span className="ql-id">{String(l.line_uid ?? '')}</span>
                  <span className="ql-part">{String(l.part ?? '')}</span>
                  <span className="ql-qty">×{String(l.qty ?? '')}</span>
                  <span className="ql-meta muted">{String(l.received_at ?? '') ? 'acknowledged' : 'not yet acknowledged'}</span>
                </div>
              ))}
              {!detailLines.length && <p className="muted">Loading spares…</p>}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
