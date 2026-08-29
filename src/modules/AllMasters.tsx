import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SectionCard } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, timeAgo } from '../lib/format';
import { dataConfigured, listMaster } from '../lib/sheets';
import { countRows, listAllMasterValues, supabaseConfigured } from '../lib/supabase';
import { clearMasterCache } from '../lib/masters';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';

// ===========================================================================
// ALL MASTERS — one screen for every master the app reads: the entity masters
// (Party / Product / Part / User, each with its own register) and the generic
// value lists behind the form dropdowns (Standard Complaint, Call Type,
// Pending Reason, Cancel Reason, Feedback Rating, …).
// Each row shows where the master comes from, how many values it currently
// holds and when it was last synced; picking one lists its values.
// ===========================================================================

const CACHE_KEY = 'allMasters';

// Entity masters — big registers with their own screens; only counted here.
// `sheetKey` is the master key the Apps Script `master` endpoint answers to;
// a master without one is only countable on the database source.
const ENTITY_MASTERS: { key: string; label: string; table: string; icon: string; route?: string; sheetKey?: string }[] = [
  { key: 'party', label: 'Party Master', table: 'parties', icon: '🏥', route: '/parties', sheetKey: 'party' },
  { key: 'product', label: 'Product Master', table: 'products', icon: '🩺', route: '/product-master', sheetKey: 'product' },
  { key: 'spare', label: 'Part Master (ITEM Master)', table: 'parts', icon: '🔩', route: '/parts', sheetKey: 'spare' },
  { key: 'user', label: 'User Master', table: 'user_directory', icon: '👤', route: '/user-master' },
];

// Generic value lists (masters table / the `master` endpoint).
const VALUE_MASTERS: { key: string; label: string; usedBy: string }[] = [
  { key: 'complaint', label: 'Standard Complaint', usedBy: 'Call report — Standard Complaint' },
  { key: 'calltype', label: 'Call Type', usedBy: 'Request form — Call Type' },
  { key: 'pendingreason', label: 'Call Pending Reason', usedBy: 'Call report — Unsolved branch' },
  { key: 'cancelreason', label: 'Call Cancel Reason', usedBy: 'Call cancellation' },
  { key: 'feedbackrating', label: 'Feedback Rating', usedBy: 'Customer feedback — ratings' },
];

interface MasterRow extends Record<string, unknown> {
  id: string;
  master: string;
  label: string;
  kind: 'Register' | 'Value list';
  source: string;
  count: number;
  sample: string;
  status: string;
  route?: string;
  values: string[];
}

export function AllMasters() {
  const navigate = useNavigate();
  const cached = loadCache<MasterRow>(CACHE_KEY);
  const [rows, setRows] = useState<MasterRow[]>(cached?.rows ?? []);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<MasterRow | null>(null);
  const [valueSearch, setValueSearch] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load the masters.' },
  );

  const refresh = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Reading every master…' });
    clearMasterCache(); // a force-sync must not read back this session's cached values
    try {
      const live = supabaseConfigured();
      const out: MasterRow[] = [];

      // Entity masters: a count is enough — each has its own register screen.
      for (const e of ENTITY_MASTERS) {
        let count = 0; let status = 'Loaded'; let sample = '';
        try {
          if (live) count = await countRows(e.table);
          else if (e.sheetKey) { const v = await listMaster(e.sheetKey); count = v.length; sample = v.slice(0, 3).join(', '); }
          else status = 'Database only';
        } catch (err) { status = `Error: ${err instanceof Error ? err.message : String(err)}`; }
        if (status === 'Loaded' && !count) status = 'Empty';
        out.push({
          id: e.key, master: e.key, label: `${e.icon} ${e.label}`, kind: 'Register',
          source: live ? `Supabase · ${e.table}` : 'Google Sheet', count, sample,
          status, route: e.route, values: [],
        });
      }

      // Value lists: read every value so the screen can list them.
      const grouped = new Map<string, string[]>();
      if (live) {
        const all = await listAllMasterValues();
        all.forEach(({ name, value }) => {
          const k = name === 'standardComplaint' ? 'complaint' : name;
          const cur = grouped.get(k) ?? [];
          if (!cur.includes(value)) cur.push(value);
          grouped.set(k, cur);
        });
      }
      const keys = [...new Set([...VALUE_MASTERS.map((v) => v.key), ...grouped.keys()])];
      for (const key of keys) {
        const def = VALUE_MASTERS.find((v) => v.key === key);
        let values = grouped.get(key) ?? [];
        let status = 'Loaded';
        if (!live || !values.length) {
          try { values = await listMaster(key); }
          catch (err) { status = `Error: ${err instanceof Error ? err.message : String(err)}`; }
        }
        values = [...values].sort((a, b) => a.localeCompare(b));
        if (status === 'Loaded' && !values.length) status = 'Not configured';
        out.push({
          id: `list:${key}`, master: key, label: def?.label ?? key, kind: 'Value list',
          source: live ? 'Supabase · masters' : 'Google Sheet · master registry',
          count: values.length, sample: values.slice(0, 4).join(', '),
          status, values,
        });
      }

      setRows(out);
      setLastSync(saveCache(CACHE_KEY, out));
      const empty = out.filter((r) => r.status !== 'Loaded').length;
      setMsg({ tone: empty ? 'info' : 'ok', text: `${out.length} masters read${empty ? ` — ${empty} not populated yet.` : '.'}` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!dataConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => void refresh(), SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registers = rows.filter((r) => r.kind === 'Register');
  const lists = rows.filter((r) => r.kind === 'Value list');
  const listValues = lists.reduce((n, r) => n + r.count, 0);

  const COLUMNS: Column<MasterRow>[] = [
    { key: 'label', header: 'Master', width: 220 },
    { key: 'kind', header: 'Kind', width: 100, wrap: false },
    { key: 'source', header: 'Source', width: 180 },
    { key: 'count', header: 'Values', width: 90, align: 'right', wrap: false, render: (r) => r.count.toLocaleString() },
    { key: 'status', header: 'Status', width: 130 },
    { key: 'sample', header: 'Sample values', width: 320 },
    {
      key: '_open', header: '', width: 110, sortable: false, wrap: false,
      render: (r) => (
        <button
          className="btn btn-sm"
          onClick={(e) => { e.stopPropagation(); if (r.route) navigate(r.route); else { setOpen(r); setValueSearch(''); } }}
        >
          {r.route ? 'Open' : 'Values'}
        </button>
      ),
    },
  ];

  const openValues = useMemo(() => {
    if (!open) return [] as { id: string; value: string }[];
    const q = valueSearch.trim().toLowerCase();
    return open.values
      .filter((v) => !q || v.toLowerCase().includes(q))
      .map((v, i) => ({ id: `${open.master}-${i}`, value: v }));
  }, [open, valueSearch]);

  return (
    <div>
      <PageHeader
        title="All Masters"
        subtitle="Every master the app reads — registers and dropdown value lists — with its source, size and last sync."
        icon="🗂️"
        actions={<button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>{busy ? '…' : '↻ Refresh all'}</button>}
      />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        {registers.map((r) => (
          <KpiCard
            key={r.id}
            label={r.label}
            value={r.count.toLocaleString()}
            sub={r.status === 'Loaded' ? r.source : r.status}
            tone={r.status === 'Loaded' ? 'primary' : 'warning'}
          />
        ))}
        <KpiCard label="Value lists" value={String(lists.length)} sub={`${listValues.toLocaleString()} values`} tone="info" />
      </KpiGrid>

      <DataTable<MasterRow>
        columns={COLUMNS}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="allMasters"
        rowsBeforeScroll={14}
        dense
        onRowClick={(r) => { if (!r.route) { setOpen(r); setValueSearch(''); } }}
        emptyText={busy ? 'Loading…' : 'No masters loaded yet — ↻ Refresh all.'}
        toolbar={
          <Toolbar>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => csvExport('all-masters.csv',
                  [{ key: 'label', header: 'Master' }, { key: 'kind', header: 'Kind' }, { key: 'source', header: 'Source' }, { key: 'count', header: 'Values' }, { key: 'status', header: 'Status' }, { key: 'sample', header: 'Sample values' }],
                  rows as unknown as Record<string, unknown>[])}
              >⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {open && (
        <SectionCard title={`${open.label} — ${open.count.toLocaleString()} value${open.count === 1 ? '' : 's'}`}>
          <Toolbar>
            <input className="input" placeholder="Search values" value={valueSearch} onChange={(e) => setValueSearch(e.target.value)} />
            <div className="spacer" />
            {open.values.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => csvExport(`${open.master}-master.csv`, [{ key: 'value', header: open.label }], openValues as unknown as Record<string, unknown>[])}
              >⭳ Export CSV</button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>✕ Close</button>
          </Toolbar>
          <DataTable<{ id: string; value: string }>
            columns={[{ key: 'value', header: open.label, width: 420 }]}
            rows={openValues}
            getRowId={(r) => r.id}
            rowsBeforeScroll={12}
            dense
            emptyText="No values."
          />
        </SectionCard>
      )}
    </div>
  );
}
