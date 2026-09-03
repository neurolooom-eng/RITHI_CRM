import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { listPendingCalls, reallocateCalls, callFamily, supabaseConfigured, type CallState, type CallFamily } from '../lib/supabase';
import { StateBadge } from '../lib/callstate';
import { allowsAllottee, useAccessScope, useTeamEngineers } from '../lib/access';
import { csvExport, fmtLongDate, fmtLongSmart, timeAgo } from '../lib/format';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PENDING CALLS — every call that nobody has closed, across Field, Installation
// and PM. A call is pending until its latest visit comes back Solved:
//   Unattended     no visit reported yet
//   Unsolved       visited, still broken
//   Report pending visited, report not completed
// Reads the `pending_calls` view (migration 0012); role scoping is the same as
// the registers — engineers see their own calls, RMs their sub-tree.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

// Matched by FAMILY, not by spelling. `call_type` reads "P M VISIT" on one
// import and "PM VISIT" on another, and the strict comparison that used to be
// here meant the Installation and PM chips found nothing while those very calls
// were listed under All.
const TYPES: { key: CallFamily | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'field', label: 'Field' },
  { key: 'install', label: 'Installation' },
  { key: 'pm', label: 'PM' },
];
const PAGE = 2000;
const STATES: (CallState | '')[] = ['', 'Unattended', 'Unsolved', 'Report pending', 'Reopened'];

const COLUMNS: Column<Row>[] = [
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  {
    key: 'state', header: 'Call Status', width: 170, wrap: false,
    render: (r) => (
      <StateBadge
        state={String(r.state ?? '')}
        label={String(r.state) === 'Reopened' ? 'Reopened' : String(r.lastStatus || r.state || '')}
        title={Number(r.reopenCount ?? 0) > 0 ? `Re-opened ${r.reopenCount}×` : undefined}
      />
    ),
  },
  { key: 'callType', header: 'Type', width: 120, wrap: false },
  { key: 'regDate', header: 'Registered', width: 150, render: (r) => fmtLongSmart(r.regDate) },
  { key: 'complaintDate', header: 'Complaint Date', width: 140, render: (r) => fmtLongDate(r.complaintDate) },
  { key: 'partyName', header: 'Party Name', width: 220 },
  { key: 'city', header: 'City', width: 110 },
  { key: 'productName', header: 'Product', width: 130 },
  { key: 'serial', header: 'Serial', width: 90, wrap: false },
  { key: 'complaintReported', header: 'Complaint Reported', width: 220 },
  { key: 'allocatedTo', header: 'Allocated To', width: 150 },
  { key: 'lastStatus', header: 'Last Visit Status', width: 170 },
];

export function PendingCalls() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const scope = useAccessScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState<CallFamily | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const [lastSync, setLastSync] = useState<number>(0);
  // Re-allotment, the same one field as on the registers: a pending call is
  // exactly the call somebody most often needs to hand to another engineer,
  // and until now that meant leaving this screen to find it again on its own
  // register — twice over, since the register depends on the call's type.
  const allotTeam = useTeamEngineers();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allotTo, setAllotTo] = useState('');
  const [allotBusy, setAllotBusy] = useState(false);
  const mayAllot = can('calls.edit') && allotTeam.names.length > 0;
  const [state, setState] = useState<CallState | ''>('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load pending calls.' },
  );

  const load = async (want = limit) => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending calls…' });
    try {
      const r = await listPendingCalls('', want);
      setRows(r.map((c, i) => ({ ...c, id: String(c._id ?? c.ucn ?? i) })) as Row[]);
      setLastSync(Date.now());
      setMsg({ tone: 'ok', text: `${r.length} pending call${r.length === 1 ? '' : 's'} — nothing here has been closed yet.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        tone: 'error',
        text: /pending_calls|does not exist|schema cache/i.test(text)
          ? 'Pending calls need migration 0012_call_state.sql — run it in the Supabase SQL editor.'
          : `Load failed: ${text}`,
      });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(PAGE); /* eslint-disable-next-line */ }, []);
  const moreAvailable = rows.length >= limit;
  const loadMore = () => { const n = limit + PAGE; setLimit(n); void load(n); };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (scope.all || allowsAllottee(scope, r.allocatedTo)) &&
      (!type || callFamily(r.callType) === type) &&
      (!state || String(r.state ?? '') === state) &&
      (!needle || ['ucn', 'partyName', 'city', 'productName', 'serial', 'complaintReported', 'allocatedTo'].some(
        (k) => String(r[k] ?? '').toLowerCase().includes(needle),
      )),
    );
  }, [rows, type, state, q, scope]);

  const saveAllotment = async () => {
    const ucns = visible.filter((r) => picked.has(String(r.id)))
      .map((r) => String(r.ucn ?? '').trim()).filter(Boolean);
    if (!ucns.length || !allotTo) return;
    setAllotBusy(true);
    const res = await reallocateCalls(ucns, allotTo);
    setAllotBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not re-allot.' }); return; }
    setMsg({ tone: 'ok', text: `${res.updated} call${res.updated === 1 ? '' : 's'} allotted to ${allotTo}.` });
    setPicked(new Set()); setAllotTo('');
    void load();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    visible.forEach((r) => { const s = String(r.state ?? ''); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [visible]);

  return (
    <div>
      <PageHeader
        title="Pending Calls"
        subtitle="Every open call across Field, Installation and PM — unattended, unsolved or awaiting a report."
        icon="🔥"
        count={visible.length}
        countMore={moreAvailable}
        onLoadMore={loadMore}
        loadingMore={busy}
        status={
          <>
            <span
              className={`conn-dot ${scope.all ? 'conn-on' : 'conn-off'}`}
              title={scope.all ? 'You can see every pending call' : scope.isManager ? `Your team: ${scope.reports.join(', ')}` : 'You see only calls allotted to you'}
            >
              {scope.all ? '🌐 All calls' : scope.isManager ? `👥 Your team${user?.fullName ? ` · ${user.fullName}` : ''}` : `🙋 Your calls${user?.fullName ? ` · ${user.fullName}` : ''}`}
            </span>
            <span className={`conn-dot ${supabaseConfigured() ? 'conn-on' : 'conn-off'}`} title={supabaseConfigured() ? 'Reading from the Supabase database' : 'Not connected'}>
              {supabaseConfigured() ? '● Database connected' : '○ Not connected'}
            </span>
            {!!lastSync && <span className="conn-dot conn-off" title="When this screen last read the database">⟳ synced {timeAgo(lastSync)}</span>}
          </>
        }
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="pc-summary">
        {(['Unattended', 'Unsolved', 'Report pending', 'Reopened'] as CallState[]).map((s) => (
          <button
            key={s}
            className={`pc-tile ${state === s ? 'pc-tile-on' : ''}`}
            onClick={() => setState(state === s ? '' : s)}
            title={`Show only ${s.toLowerCase()} calls`}
          >
            <span className="pc-tile-n">{counts[s] ?? 0}</span>
            <StateBadge state={s} />
          </button>
        ))}
      </div>

      <DataTable<Row>
        columns={COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="pendingCalls"
        rowsBeforeScroll={16}
        dense
        selectable={mayAllot}
        selected={picked}
        onSelectedChange={setPicked}
        bulkBar={(ids, clear) => (
          <>
            <b>{ids.length} selected</b>
            <span className="muted">Allot to</span>
            <select className="select" value={allotTo} onChange={(e) => setAllotTo(e.target.value)} disabled={allotBusy}>
              <option value="">— choose an engineer —</option>
              {allotTeam.names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!allotTo || allotBusy} onClick={() => void saveAllotment()}>
              {allotBusy ? 'Saving…' : `Save ${ids.length}`}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={allotBusy} onClick={clear}>Clear</button>
          </>
        )}
        // Region, engineer, call status — the same three the registers group by.
        groupable={[
          { key: 'callType', label: 'Type' },
          { key: 'allocatedTo', label: 'Engineer' },
          { key: 'state', label: 'Call Status' },
        ]}
        onRowClick={(r) => {
          const fam = callFamily(r.callType);
          navigate(fam === 'install' ? '/installations' : fam === 'pm' ? '/pm-calls' : '/field-calls',
            { state: { editUcn: String(r.ucn ?? '') } });
        }}
        emptyText={busy ? 'Loading…' : 'No pending calls — everything is closed.'}
        toolbar={
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="UCN, party, product, serial, engineer…" />
            <div className="row">
              {TYPES.map((t) => (
                <button key={t.key || 'all'} className={`chip ${type === t.key ? 'chip-on' : ''}`} onClick={() => setType(t.key)}>{t.label}</button>
              ))}
            </div>
            <select className="select" value={state} onChange={(e) => setState(e.target.value as CallState | '')}>
              {STATES.map((s) => <option key={s || 'any'} value={s}>{s || 'Any status'}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <button
              className="btn btn-sm"
              onClick={() => csvExport('pending-calls.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}
            >
              ⭳ Export CSV
            </button>
          </Toolbar>
        }
      />
    </div>
  );
}
