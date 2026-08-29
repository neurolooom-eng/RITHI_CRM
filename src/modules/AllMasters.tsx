import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SectionCard } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { useAuth } from '../lib/auth';
import { csvExport, fmtDate, timeAgo } from '../lib/format';
import { dataConfigured, listMaster } from '../lib/sheets';
import { countRows, listMasterItems, listMasterLists, supabaseConfigured, type MasterList } from '../lib/supabase';
import { clearMasterCache } from '../lib/masters';
import { fallbackRegistry, masterListPath, usedBy } from './masterLists';
import { MasterListTable } from './MasterListTable';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';

// ===========================================================================
// ALL MASTERS — every master the app reads, in one screen.
//   • Registers (Party / Product / Part / User) — counted here, opened on
//     their own screens.
//   • Value lists (the "200 All Masters" workbook: Call Type, Standard
//     Complaint, Pending Reason, Cancel Reason, Feedback, Spare Approval
//     Reason) — each gets its own table, added to and removed from here.
// The lists and the shape of each list's table come from `master_lists`
// (0014_master_lists.sql), so a new list needs a registry row, not a release.
// Editing needs `masters.edit`; a change clears the dropdown cache so the
// forms pick it up without a reload.
// ===========================================================================

// Versioned: the previous release cached rows in a different shape (no `key`),
// and those rows render but cannot be opened. A new key retires them.
const CACHE_KEY = 'allMasters.v2';

// Registers — their own screens; only counted here. `sheetKey` is the key the
// Apps Script `master` endpoint answers to (a master without one is
// database-only).
const REGISTERS: { key: string; label: string; table: string; icon: string; route: string; sheetKey?: string }[] = [
  { key: 'party', label: 'Party Master', table: 'parties', icon: '🏥', route: '/parties', sheetKey: 'party' },
  { key: 'product', label: 'Product Master', table: 'products', icon: '🩺', route: '/product-master', sheetKey: 'product' },
  { key: 'spare', label: 'Part Master (ITEM Master)', table: 'parts', icon: '🔩', route: '/parts', sheetKey: 'spare' },
  { key: 'user', label: 'User Master', table: 'user_directory', icon: '👤', route: '/user-master' },
];

// Lists the sheet-only fallback can still read (there is no registry there, so
// the labels are carried here).
interface SummaryRow extends Record<string, unknown> {
  id: string;
  key: string;
  label: string;
  kind: 'Register' | 'Value list';
  source: string;
  count: number;
  usedBy: string;
  status: string;
  route?: string;
}

export function AllMasters() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const live = supabaseConfigured();
  const editable = live && can('masters.edit');
  const cached = loadCache<SummaryRow>(CACHE_KEY);

  const [rows, setRows] = useState<SummaryRow[]>(cached?.rows ?? []);
  const [lists, setLists] = useState<MasterList[]>([]);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load the masters.' },
  );

  // The list opened below the summary (MasterListTable owns its rows).
  const [open, setOpen] = useState<MasterList | null>(null);
  const [openCount, setOpenCount] = useState(0);

  const refresh = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Reading every master…' });
    clearMasterCache(); // a force-sync must not read back this session's cached values
    try {
      const out: SummaryRow[] = [];

      for (const r of REGISTERS) {
        let count = 0; let status = 'Loaded';
        try {
          if (live) count = await countRows(r.table);
          else if (r.sheetKey) count = (await listMaster(r.sheetKey)).length;
          else status = 'Database only';
        } catch (err) { status = `Error: ${err instanceof Error ? err.message : String(err)}`; }
        if (status === 'Loaded' && !count) status = 'Empty';
        out.push({
          id: r.key, key: r.key, label: `${r.icon} ${r.label}`, kind: 'Register',
          source: live ? `Supabase · ${r.table}` : 'Google Sheet', count,
          usedBy: 'Its own register', status, route: r.route,
        });
      }

      let registry: MasterList[] = [];
      let registryMissing = false;
      if (live) {
        try {
          registry = await listMasterLists();
        } catch (err) {
          // No `master_lists` table — 0021_master_lists.sql has not been applied
          // to this project. Fall back to the known lists so the screen still
          // works, and say what to run.
          registryMissing = true;
          registry = fallbackRegistry();
          void err;
        }
      } else {
        registry = fallbackRegistry();
      }
      for (const l of registry) {
        let count = 0; let status = 'Loaded';
        try {
          count = live ? (await listMasterItems(l.key)).length : (await listMaster(l.key)).length;
        } catch (err) { status = `Error: ${err instanceof Error ? err.message : String(err)}`; }
        if (status === 'Loaded' && !count) status = 'Empty';
        out.push({
          id: `list:${l.key}`, key: l.key, label: l.label, kind: 'Value list',
          source: live ? 'Supabase · masters' : 'Google Sheet · master registry',
          count, usedBy: usedBy(l.key), status,
        });
      }

      setLists(registry);
      setRows(out);
      setLastSync(saveCache(CACHE_KEY, out));
      const gaps = out.filter((r) => r.status !== 'Loaded').length;
      setMsg(registryMissing
        ? { tone: 'info', text: 'The master lists registry is not in the database yet — showing the lists this app knows by name. Apply supabase/apply/masters.sql to get each list its own table, labels and extra columns.' }
        : { tone: gaps ? 'info' : 'ok', text: `${out.length} masters read${gaps ? ` — ${gaps} not populated yet.` : '.'}` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!dataConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else { setMsg({ tone: 'info', text: `Showing cached counts — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` }); void refresh(); }
    const id = window.setInterval(() => void refresh(), SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openList = (list: MasterList) => { setOpen(list); setOpenCount(0); };

  // Keep the summary's count honest while the open list is edited.
  const noteCount = (n: number) => {
    setOpenCount(n);
    if (open) setRows((rs) => rs.map((r) => (r.id === `list:${open.key}` ? { ...r, count: n, status: n ? 'Loaded' : 'Empty' } : r)));
  };

  // A summary row back to its registry entry. The id is the fallback so a row
  // from an older cache (which carried no `key`) still opens.
  const listFor = (r: SummaryRow): MasterList | undefined => {
    const key = r.key || String(r.id).replace(/^list:/, '');
    return lists.find((x) => x.key === key);
  };

  const registers = rows.filter((r) => r.kind === 'Register');
  const valueLists = rows.filter((r) => r.kind === 'Value list');
  const listValues = valueLists.reduce((n, r) => n + r.count, 0);

  const SUMMARY_COLUMNS: Column<SummaryRow>[] = [
    { key: 'label', header: 'Master', width: 220 },
    { key: 'kind', header: 'Kind', width: 100, wrap: false },
    { key: 'source', header: 'Source', width: 180 },
    { key: 'count', header: 'Entries', width: 90, align: 'right', wrap: false, render: (r) => r.count.toLocaleString() },
    { key: 'status', header: 'Status', width: 120 },
    { key: 'usedBy', header: 'Used by', width: 300 },
    {
      key: '_open', header: '', width: 120, sortable: false, wrap: false,
      render: (r) => (
        <button
          className="btn btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            if (r.route) { navigate(r.route); return; }
            const l = listFor(r);
            if (l) openList(l);
          }}
        >
          {r.route ? 'Open' : editable ? 'Edit list' : 'View list'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="All Masters"
        subtitle="Every master the app reads. Each value list is its own table — add and remove entries here."
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
          <KpiCard key={r.id} label={r.label} value={r.count.toLocaleString()}
            sub={r.status === 'Loaded' ? r.source : r.status}
            tone={r.status === 'Loaded' ? 'primary' : 'warning'} />
        ))}
        <KpiCard label="Value lists" value={String(valueLists.length)} sub={`${listValues.toLocaleString()} entries`} tone="info" />
      </KpiGrid>

      <DataTable<SummaryRow>
        columns={SUMMARY_COLUMNS}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="allMasters"
        rowsBeforeScroll={12}
        dense
        onRowClick={(r) => { if (!r.route) { const l = listFor(r); if (l) openList(l); } }}
        emptyText={busy ? 'Loading…' : 'No masters loaded yet — ↻ Refresh all.'}
        toolbar={
          <Toolbar>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('all-masters.csv',
                [{ key: 'label', header: 'Master' }, { key: 'kind', header: 'Kind' }, { key: 'source', header: 'Source' }, { key: 'count', header: 'Entries' }, { key: 'status', header: 'Status' }, { key: 'usedBy', header: 'Used by' }],
                rows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {open && (
        <SectionCard title={`${open.label}${openCount ? ` — ${openCount.toLocaleString()} ${openCount === 1 ? 'entry' : 'entries'}` : ''}`}>
          <Toolbar>
            <button className="btn btn-sm" onClick={() => navigate(masterListPath(open.key))}>↗ Open its own screen</button>
            <div className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>✕ Close</button>
          </Toolbar>
          <MasterListTable list={open} onCountChange={noteCount} />
        </SectionCard>
      )}
    </div>
  );
}
