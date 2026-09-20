import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { formatDay } from '../lib/dates';
import { listProductDatabaseV2, supabaseConfigured } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { useAuth } from '../lib/auth';
import { seesEveryRecord } from '../lib/rbac';

// ===========================================================================
// PRODUCT DATABASE 2.0 — the machine as the five registers together describe it.
//
//   The user, 2026-09-20: "All unique product+serial no should be listed
//   [Warranty Sale Details, Contract Details, Additional Entries], then arrange
//   these sources + Ownership Transfer to come to a conclusion on the Party,
//   Warranty period, contract period, then derive the item status."
//
// THE OLD PRODUCT DATABASE IS UNTOUCHED and still at `/product-database` — the
// ask was explicit. This screen reads `product_database_v2` (0218), which is a
// view beside `products`, not a replacement for it, so the two can be compared
// on live data before anything moves.
//
// IT SHOWS ITS EVIDENCE. Party, warranty, contract and the status each carry a
// "from" column naming the register that decided them: a value assembled out of
// five sources that cannot say which one it came from is one nobody can check,
// and every row here is an opinion about somebody's machine.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const day = (v: unknown) => (v ? formatDay(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'product_name', header: 'Product', width: 140 },
  { key: 'serial_number', header: 'Serial', width: 110, wrap: false },
  { key: 'party_name', header: 'Party', width: 220 },
  { key: 'item_status', header: 'Status', width: 110, wrap: false },
  { key: 'warranty_start', header: 'Warranty from', width: 115, render: (r) => day(r.warranty_start) },
  { key: 'warranty_end', header: 'Warranty to', width: 115, render: (r) => day(r.warranty_end) },
  { key: 'contract_type', header: 'Contract', width: 90, wrap: false },
  { key: 'contract_end', header: 'Contract to', width: 115, render: (r) => day(r.contract_end) },
  // WHY IT SAYS WHAT IT SAYS — on the screen, not only in the export.
  { key: 'item_status_reason', header: 'Because', width: 260 },
  { key: 'party_from', header: 'Party from', width: 180 },
];

// Everything the view publishes, for the ⚙ Columns picker and the export.
const ALL_COLUMNS: string[] = [
  'product_name', 'serial_number', 'product_code', 'party_name', 'party_from',
  'item_status', 'item_status_reason',
  'warranty_start', 'warranty_end', 'warranty_months', 'warranty_from', 'warranty_state',
  'contract_number', 'contract_type', 'contract_type_as_recorded', 'contract_start',
  'contract_end', 'contract_months', 'contract_from', 'contract_state',
  'sa_number', 'state', 'city', 'engineer',
  'from_party', 'to_party', 'transfer_date', 'reference_no',
  'in_warranty_register', 'in_contract_register', 'in_additional_entries',
  'installation_ucn', 'machine_key',
];

export function ProductDatabase2() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listProductDatabaseV2();
      setRows(r.map((x, i) => ({ ...x, id: String(x.machine_key ?? i) } as Row)));
    } catch (e) {
      // The three answers, and the error VERBATIM — the real fault is usually
      // readable in the message and a hint written over it costs the round trip.
      setErr(loadFailure(e, {
        tables: ['product_database_v2'],
        hint: 'Product Database 2.0 is not on this project yet — run product_database_2.sql.',
      }));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && String(r.item_status ?? '') !== status) return false;
      if (!s) return true;
      return `${r.product_name} ${r.serial_number} ${r.party_name} ${r.contract_number} ${r.sa_number}`
        .toLowerCase().includes(s);
    });
  }, [rows, q, status]);

  // EXACT, so no `+`. The read pages until the view is exhausted, which is why
  // this is a count and not a lower bound.
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = String(r.item_status ?? '');
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Product Database 2.0" icon="🧬"
        subtitle="One row per machine — model and serial — assembled from the warranty sale, the contract, the additional entries, the ownership transfer and the installation call."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && !busy && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-info">
          <span>
            {seesEveryRecord(user, can)
              ? 'No machine appears in the warranty sale register, the contract register or the additional entries yet.'
              : 'Nothing here that you may see — this shows the machines your role is allowed to read, which may not be all of them.'}
          </span>
        </div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Product, serial, party, contract or SA number" />
      </Toolbar>

      {/* A count over PARTLY loaded data is a lower bound; this one is not —
          the read pages until the view is exhausted, so `more` is false. */}
      <FacetChips options={facets} value={status} onChange={setStatus} more={false} />

      <DataTable<Row>
        columns={COLUMNS} rows={visible} getRowId={(r) => r.id}
        toolbar={(
          <button className="btn btn-ghost btn-sm" onClick={() => csvExport(
            `product-database-2-${new Date().toISOString().slice(0, 10)}.csv`,
            ALL_COLUMNS.map((k) => ({ key: k, header: k })), visible)}>
            ⭳ Export CSV
          </button>
        )} />
    </div>
  );
}
