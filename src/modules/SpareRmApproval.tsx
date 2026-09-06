import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Toolbar, SearchBox, EmptyState } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listPendingRmApproval, approveSpareLines, supabaseConfigured } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { partDescription } from '../lib/handstock';
import './fieldcalls.css';

// ===========================================================================
// RM APPROVAL — the manager's queue, shaped like Pending Dispatch.
//
// The user's ask (2026-09-06): a screen of its own that lists ONLY what is
// waiting for an RM. It exists for the same reason Pending Dispatch does — the
// full spare register answers "what is happening to everything", and a manager
// clearing a morning's approvals needs the opposite: one list, already filtered
// to their decision, ticked and done in one press.
//
// WHAT IS NOT MINE IS SHOWN, GREYED, rather than filtered away. `may_approve`
// comes back per row from `spare_rm_may_approve()` (0033): never your own
// request, and a manager only within their own reporting tree. Hiding those
// rows would leave "why is my spare not in the queue?" answerable only by
// somebody who knows the rule; showing them, with the reason, answers it on
// the screen. They cannot be ticked.
//
// THE COUNTS HERE ARE EXACT. The whole queue is read in one go (it is the
// pending set, not the register), so nothing carries a "+" — unlike the
// registers, where only a page is loaded.
// ===========================================================================

const MIGRATION_HINT = 'The RM approval queue needs migration 0116_spare_bulk_approval.sql — run it in the Supabase SQL editor (apply bundle: Spare_1.sql).';

interface RmLine {
  id: string;
  line_id: number;
  line_uid: string;
  or_no: string;
  row_no: number;
  part: string;
  part_code: string;
  qty: number;
  engineer: string;
  ucn: string;
  party_name: string;
  product_name: string;
  item_status: string;
  req_type: string;
  remarks: string;
  raised_at: string;
  may_approve: boolean;
  _desc: string;
  _waiting: number;
}

const days = (iso: string): number => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 0;
};

export function SpareRmApproval() {
  const { user, can } = useAuth();
  const onDb = supabaseConfigured();
  const mayApprove = can('spare.approve_rm');
  const [lines, setLines] = useState<RmLine[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    if (!onDb) return;
    setBusy(true);
    try {
      const raw = await listPendingRmApproval();
      setLines(raw.map((r) => {
        const part = String(r.part ?? '');
        return {
          id: String(r.line_id),
          line_id: Number(r.line_id),
          line_uid: String(r.line_uid ?? ''),
          or_no: String(r.or_no ?? ''),
          row_no: Number(r.row_no ?? 0),
          part,
          part_code: String(r.part_code ?? ''),
          qty: Number(r.qty ?? 0),
          engineer: String(r.engineer ?? ''),
          ucn: String(r.ucn ?? ''),
          party_name: String(r.party_name ?? ''),
          product_name: String(r.product_name ?? ''),
          item_status: String(r.item_status ?? ''),
          req_type: String(r.req_type ?? ''),
          remarks: String(r.remarks ?? ''),
          raised_at: String(r.raised_at ?? ''),
          may_approve: r.may_approve === true,
          _desc: partDescription(part),
          _waiting: days(String(r.raised_at ?? '')),
        };
      }));
      setLastSync(new Date().toISOString());
      setMsg(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ tone: 'error', text: /spare_pending_rm|does not exist|schema cache/i.test(m) ? MIGRATION_HINT : `Could not read the queue: ${m}` });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => [l.or_no, l.part, l._desc, l.engineer, l.ucn, l.party_name, l.product_name]
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [lines, search]);

  const mine = visible.filter((l) => l.may_approve);
  const oldest = mine.reduce((n, l) => Math.max(n, l._waiting), 0);

  const approve = async (ids: string[], clear: () => void) => {
    const lineIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!lineIds.length) return;
    setApproving(true);
    const t0 = performance.now();
    const res = await approveSpareLines(lineIds, user?.fullName || user?.email || '');
    logAudit({
      action: 'spare.approve', target: `RM queue: ${lineIds.length} spares`,
      status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error,
      duration_ms: Math.round(performance.now() - t0),
      meta: { scope: 'rm-queue', selected: lineIds.length, approved: res.approved ?? 0, skipped: res.skipped ?? 0 },
    });
    setApproving(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not approve.' }); return; }
    const skipped = res.skipped ?? 0;
    setMsg({
      tone: skipped ? 'info' : 'ok',
      text: `${res.approved ?? 0} spare${res.approved === 1 ? '' : 's'} approved`
        + (skipped ? ` — ${skipped} skipped (${res.reason || 'not yours to approve'}).` : '.'),
    });
    clear();
    void load();
  };

  const columns: Column<RmLine>[] = [
    { key: 'or_no', header: 'OR Number', width: 130, wrap: false },
    { key: 'engineer', header: 'Engineer', width: 150 },
    {
      key: 'part', header: 'Part', width: 210,
      render: (r) => <span title={r.part}>{r.part_code || r.part}</span>,
    },
    { key: '_desc', header: 'Description', width: 230 },
    { key: 'qty', header: 'Qty', width: 60, align: 'right' },
    { key: 'ucn', header: 'UCN', width: 120, wrap: false },
    { key: 'party_name', header: 'Customer', width: 200 },
    { key: 'product_name', header: 'Product', width: 130 },
    { key: 'item_status', header: 'Cover', width: 90 },
    {
      key: '_waiting', header: 'Waiting', width: 100, align: 'right',
      render: (r) => <span className={r._waiting >= 7 ? 'badge badge-danger' : r._waiting >= 3 ? 'badge badge-warning' : 'badge badge-neutral'}>{r._waiting}d</span>,
    },
    { key: 'raised_at', header: 'Raised', width: 130, render: (r) => fmtLongDate(r.raised_at) },
    {
      // The whole point of showing a row you cannot act on.
      key: 'may_approve', header: 'Yours?', width: 150, wrap: false,
      render: (r) => (r.may_approve
        ? <span className="badge badge-success">Yours to approve</span>
        : <span className="badge badge-neutral" title="0033: nobody approves their own request, and a manager approves only within their own reporting tree.">Not yours</span>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="RM Approval"
        subtitle="Every spare waiting for a Reporting Manager — tick and approve."
        icon="✅"
        count={visible.length}
        status={
          <>
            <span className={`conn-dot ${onDb ? 'conn-on' : 'conn-off'}`}>{onDb ? 'Database connected' : 'Not connected'}</span>
            {lastSync && <span className="conn-dot conn-off" title={new Date(lastSync).toLocaleString()}>⟳ synced {timeAgo(lastSync)}</span>}
          </>
        }
        actions={
          <>
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            {visible.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('rm-approval.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </>
        }
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid min={170}>
        <KpiCard label="Waiting for an RM" value={visible.length} tone="primary" icon="⏳" />
        <KpiCard label="Yours to approve" value={mine.length} tone={mine.length ? 'warning' : 'neutral'} icon="✅" />
        <KpiCard label="Longest waiting" value={oldest} sub="days" tone={oldest >= 7 ? 'danger' : oldest >= 3 ? 'warning' : 'neutral'} />
        <KpiCard label="Engineers" value={new Set(visible.map((l) => l.engineer)).size} tone="neutral" icon="👷" />
      </KpiGrid>

      {!busy && visible.length === 0 ? (
        <EmptyState title="✅ Nothing waiting for an RM" hint={onDb ? 'Every spare has had its first approval.' : 'Connect the database to load the queue.'} />
      ) : (
        <DataTable<RmLine>
          columns={columns}
          rows={visible}
          getRowId={(r) => r.id}
          storageKey="spare-rm-approval"
          // The order a manager works in, like Pending Dispatch: their own team
          // together, and inside that whichever request came first.
          groupable={[
            { key: 'engineer', label: 'Engineer' },
            { key: 'or_no', label: 'OR Number' },
            { key: 'item_status', label: 'Cover' },
          ]}
          defaultGroup={['engineer']}
          rowsBeforeScroll={14}
          dense
          // The whole queue is loaded in one read, so every count here is exact
          // — no "+", unlike the registers that page.
          moreAvailable={false}
          selectable={mayApprove}
          selected={picked}
          onSelectedChange={(next) => {
            // A row that is not this reader's cannot be ticked. Enforced here as
            // well as in the database, so the button never promises something
            // the batch will then skip.
            const allowed = new Set(mine.map((l) => l.id));
            setPicked(new Set([...next].filter((id) => allowed.has(id))));
          }}
          bulkBar={mayApprove ? (ids, clear) => (
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <b>{ids.length}</b>
              <span className="muted">selected</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-primary" disabled={approving} onClick={() => void approve(ids, clear)}>
                {approving ? 'Approving…' : `✔ Approve ${ids.length}`}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={clear} disabled={approving}>Clear</button>
            </div>
          ) : undefined}
          emptyText="Nothing waiting for an RM."
          toolbar={
            <Toolbar>
              <SearchBox value={search} onChange={setSearch} placeholder="OR, part, engineer, UCN, customer…" />
              <div className="spacer" />
              {mayApprove && mine.length > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={() => setPicked(new Set(mine.map((l) => l.id)))}
                  disabled={approving}
                >
                  Select all {mine.length} of mine
                </button>
              )}
            </Toolbar>
          }
        />
      )}
    </div>
  );
}
