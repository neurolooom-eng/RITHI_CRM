import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { listPendingCalls, supabaseConfigured, type CallState } from '../lib/supabase';
import { StateBadge } from '../lib/callstate';
import { allowsAllottee, useAccessScope } from '../lib/access';
import { csvExport, fmtLongDate, fmtLongSmart } from '../lib/format';
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

const TYPES: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'FIELD', label: 'Field' },
  { key: 'INSTALLATION CALL', label: 'Installation' },
  { key: 'P M VISIT', label: 'PM' },
];
const STATES: (CallState | '')[] = ['', 'Unattended', 'Unsolved', 'Report pending'];

const COLUMNS: Column<Row>[] = [
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'state', header: 'Call Status', width: 130, wrap: false, render: (r) => <StateBadge state={String(r.state ?? '')} /> },
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
  const { user } = useAuth();
  const scope = useAccessScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState('');
  const [state, setState] = useState<CallState | ''>('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load pending calls.' },
  );

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending calls…' });
    try {
      const r = await listPendingCalls('');
      setRows(r.map((c, i) => ({ ...c, id: String(c._id ?? c.ucn ?? i) })) as Row[]);
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
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (scope.all || allowsAllottee(scope, r.allocatedTo)) &&
      (!type || String(r.callType ?? '') === type) &&
      (!state || String(r.state ?? '') === state) &&
      (!needle || ['ucn', 'partyName', 'city', 'productName', 'serial', 'complaintReported', 'allocatedTo'].some(
        (k) => String(r[k] ?? '').toLowerCase().includes(needle),
      )),
    );
  }, [rows, type, state, q, scope]);

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
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="pc-summary">
        {(['Unattended', 'Unsolved', 'Report pending'] as CallState[]).map((s) => (
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
        onRowClick={(r) => navigate(/install/i.test(String(r.callType ?? '')) ? '/installations' : /p\s*m/i.test(String(r.callType ?? '')) ? '/pm-calls' : '/field-calls', { state: { editUcn: String(r.ucn ?? '') } })}
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
            {!scope.all && <span className="muted">Your calls{user?.fullName ? ` · ${user.fullName}` : ''}</span>}
          </Toolbar>
        }
      />
    </div>
  );
}
