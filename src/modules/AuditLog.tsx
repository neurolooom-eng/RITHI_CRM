import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, fmtLongDateTime, timeAgo } from '../lib/format';
import { queryAudit, supabaseConfigured, type AuditFilter } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';

// ===========================================================================
// AUDIT LOG — actions, logins, errors and durations. Admin-only; reads the
// Supabase audit_log with field filters + Load more + browser cache.
// ===========================================================================

const CACHE_KEY = 'auditLog';
const PAGE = 500;
type Row = Record<string, unknown> & { id: string };
const g = (r: Row, k: string) => String(r[k] ?? '');

const COLUMNS: Column<Row>[] = [
  { key: 'at', header: 'Time', width: 180, wrap: false, render: (r) => fmtLongDateTime(r.at) },
  { key: 'actor', header: 'User', width: 160 },
  { key: 'email', header: 'Email', width: 210 },
  { key: 'role', header: 'Role', width: 120, wrap: false },
  { key: 'action', header: 'Action', width: 150, wrap: false },
  { key: 'target', header: 'Target', width: 140, wrap: false },
  { key: 'status', header: 'Status', width: 90, wrap: false, render: (r) => <span className={`badge badge-${g(r, 'status') === 'error' ? 'danger' : 'success'}`}>{g(r, 'status')}</span> },
  { key: 'duration_ms', header: 'ms', width: 70, align: 'right', wrap: false },
  { key: 'error', header: 'Error', width: 320 },
];

const toRows = (data: Record<string, unknown>[], base: number): Row[] => data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

export function AuditLog() {
  const { can } = useAuth();
  const cached = loadCache<Row>(CACHE_KEY);
  const [filter, setFilter] = useState<AuditFilter>({ action: '', email: '', status: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const set = (k: keyof AuditFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const hasFilter = !!(filter.action || filter.email || filter.status);

  if (!can('audit.view')) return <div style={{ padding: 24 }} className="muted">You don’t have permission to view the audit log.</div>;

  const refresh = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const data = await queryAudit({}, 0, PAGE);
      const r = toRows(data, 0);
      setRows(r); setOffset(r.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, r));
      setMsg({ tone: 'ok', text: `Synced ${r.length}${r.length === PAGE ? '+' : ''} audit events.` });
    } catch (e) { setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  };

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!supabaseConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else setMsg({ tone: 'info', text: `Showing cached — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current || !supabaseConfigured()) return;
    if (!hasFilter) { const c = loadCache<Row>(CACHE_KEY); if (c) { setRows(c.rows); setOffset(c.rows.length); setMore(c.rows.length >= PAGE); } return; }
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = await queryAudit(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
      } catch (e) { setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` }); }
      finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.action, filter.email, filter.status]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryAudit(hasFilter ? filter : {}, offset, PAGE);
      const merged = [...rows, ...toRows(data, rows.length)];
      setRows(merged); setOffset(offset + data.length); setMore(data.length === PAGE);
      if (!hasFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  };

  const allFields = useMemo(() => COLUMNS.map((c) => ({ key: c.key, header: c.header })), []);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Actions, logins, errors and how long each took." icon="🧾" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={COLUMNS}
        allFields={allFields}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="auditLog"
        rowsBeforeScroll={18}
        dense
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading…' : 'No audit events.'}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Action (login, call.create…)" value={filter.action} onChange={(e) => set('action', e.target.value)} />
              <input className="input" placeholder="Email" value={filter.email} onChange={(e) => set('email', e.target.value)} />
              <select className="select" value={filter.status} onChange={(e) => set('status', e.target.value)}>
                <option value="">Any status</option><option value="ok">ok</option><option value="error">error</option>
              </select>
            </div>
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('audit-log.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}
