import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { formatDayTime } from '../lib/dates';
import { timeAgo } from '../lib/format';
import { sbDeviceCacheReport, supabaseConfigured, type DeviceCacheRow } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';

// ===========================================================================
// DEVICE CACHE STATUS -- which phones and laptops hold the offline registers.
//
//   The user, 2026-09-29: "Build the cache status report for my desk." and
//   "Where can I [as admin] see the cache status of all users?"
//
// Since v0.9.383 every device keeps the machine register and the Party Master
// so it can search with no signal. That copy lives on the device; each device
// now REPORTS what it holds (0249), and this screen reads every report.
//
// EVERYBODY IS LISTED, INCLUDING WHOEVER HAS NEVER REPORTED -- the person most
// worth chasing is the engineer with no copy anywhere, and a list of reports
// alone cannot show an absence. device_cache_report() joins the profiles for
// exactly that.
//
// WHAT A REPORT IS: what the device SAID, as of when it said it. A phone that
// has been off for two days still shows its last report, which is why the
// "Last reported" column is on every row; the state chip reads the DOWNLOAD
// time, which is what decides whether the engineer's searches are current.
// ===========================================================================

type Row = DeviceCacheRow & { id: string; state: string };

const HOUR = 60 * 60 * 1000;
// THE SAME WINDOW THE DEVICES REFRESH ON (machinestore.ts): under six hours is
// what a device considers fresh, so that is what "Current" means here.
function stateOf(r: DeviceCacheRow, now: number): string {
  if (!r.device_id) return 'Never reported';
  if (!r.machines || !r.machines_at) return 'No copy on the device';
  const oldest = Math.min(
    Date.parse(r.machines_at),
    r.customers_at ? Date.parse(r.customers_at) : Date.parse(r.machines_at),
  );
  const age = now - oldest;
  if (age <= 6 * HOUR) return 'Current (under 6 hours)';
  if (age <= 24 * HOUR) return 'Due a refresh (6-24 hours)';
  return 'Older than a day';
}

const when = (v: string | null) => (v ? `${formatDayTime(v)} · ${timeAgo(v)}` : '');
const count = (v: number | null) => (v == null ? '' : v.toLocaleString());

const COLUMNS: Column<Row>[] = [
  { key: 'full_name', header: 'Person', width: 190,
    render: (r) => (
      <div>
        <div>{r.full_name || r.email}</div>
        <div className="muted" style={{ fontSize: 11 }}>{r.email}{r.active === false ? ' · inactive' : ''}</div>
      </div>
    ) },
  { key: 'role', header: 'Role', width: 120, wrap: false },
  { key: 'state', header: 'State', width: 190, wrap: false },
  { key: 'device_label', header: 'Device', width: 170, wrap: false,
    render: (r) => (r.device_id ? <span title={r.user_agent ?? ''}>{r.device_label || 'Unknown device'}</span> : '') },
  { key: 'app_version', header: 'App version', width: 100, wrap: false,
    render: (r) => (r.app_version ? `v${r.app_version}` : '') },
  { key: 'machines', header: 'Machines', width: 90, wrap: false, render: (r) => count(r.machines) },
  { key: 'machines_at', header: 'Machines downloaded', width: 230, render: (r) => when(r.machines_at) },
  { key: 'customers', header: 'Customers', width: 90, wrap: false, render: (r) => count(r.customers) },
  { key: 'customers_at', header: 'Customers downloaded', width: 230, render: (r) => when(r.customers_at) },
  // THE STANDARD COMPLAINTS the call forms filter by product (0253). Blank on a
  // device running a build older than 0.9.396, which does not report them.
  { key: 'complaints', header: 'Complaints', width: 100, wrap: false, render: (r) => (r.complaints_at ? count(r.complaints ?? null) : '') },
  { key: 'complaints_at', header: 'Complaints stored', width: 230, render: (r) => when(r.complaints_at ?? null) },
  { key: 'problem', header: 'Problem', width: 300, sortable: false,
    render: (r) => [
      r.storage_ok === false ? 'This browser will not keep a copy (private window, or site data blocked)' : '',
      r.machines_error ? `Machines: ${r.machines_error}` : '',
      r.customers_error ? `Customers: ${r.customers_error}` : '',
    ].filter(Boolean).join(' · ') },
  { key: 'reported_at', header: 'Last reported', width: 230, render: (r) => when(r.reported_at) },
];

export function DeviceCacheStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [loadedAt, setLoadedAt] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const now = Date.now();
      const r = await sbDeviceCacheReport();
      setRows(r.map((x, i) => ({ ...x, state: stateOf(x, now), id: `${x.user_id}-${x.device_id ?? 'none'}-${i}` })));
      setLoadedAt(new Date(now).toISOString());
    } catch (e) {
      setErr(loadFailure(e, {
        tables: ['device_cache_status'],
        hint: 'This report is not on the project yet — run supabase/apply/device_cache.sql.',
      }));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // THE WHOLE LIST COMES BACK IN ONE CALL (one row per person per device), so
  // these counts are EXACT and take no "+".
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.state, (m.get(r.state) ?? 0) + 1));
    const order = ['Current (under 6 hours)', 'Due a refresh (6-24 hours)', 'Older than a day', 'No copy on the device', 'Never reported'];
    return order.filter((k) => m.has(k)).map((key) => ({ key, count: m.get(key)! }));
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!state || r.state === state)
      && (!s || `${r.full_name} ${r.email} ${r.role} ${r.device_label ?? ''}`.toLowerCase().includes(s)));
  }, [rows, q, state]);

  const people = new Set(rows.map((r) => r.user_id)).size;
  const devices = rows.filter((r) => r.device_id).length;

  return (
    <div>
      <PageHeader
        title="Device Cache Status" icon="📶"
        subtitle="Which phones and laptops hold the machine register and Party Master for offline search, and how old each copy is."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} syncedAt={loadedAt} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && rows.length > 0 && (
        <div className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {people.toLocaleString()} people, {devices.toLocaleString()} devices reported. Each device reports after every
          download and on sign-out, so a device that has been switched off shows its last report — see Last reported.
        </div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Person, email, role or device" />
      </Toolbar>

      <FacetChips options={facets} value={state} onChange={setState} more={false} />

      <DataTable<Row> columns={COLUMNS} rows={visible} getRowId={(r) => r.id} />
    </div>
  );
}

export default DeviceCacheStatus;
