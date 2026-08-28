import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { listPending, searchProducts, sheetsConfigured } from '../lib/sheets';
import { productToCallPrefill } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PENDING CALL REGISTRATIONS — Data-2026 rows without a UC Number.
// The Hotline Engineer registers a call from a row: it prefills from the
// request, maps warranty/contract from Product Master (by serial), assigns a
// UCN in the call register, and back-fills the UCN into Data-2026.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'Timestamp', header: 'Requested', width: 140, wrap: false },
  { key: 'ENGINEER', header: 'Engineer', width: 150 },
  { key: 'CALL TYPE', header: 'Type', width: 100, wrap: false },
  { key: 'PARTY NAME', header: 'Party', width: 210 },
  { key: 'City', header: 'City', width: 100 },
  { key: 'PRODUCT', header: 'Product', width: 120 },
  { key: 'SERIAL NO', header: 'Serial', width: 90, wrap: false },
  { key: 'Reported Problem', header: 'Reported Problem', width: 220 },
  { key: 'PLAN DATE (Visit Planned Date)', header: 'Plan Date', width: 110, wrap: false },
];

export function PendingRegistrations() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to load pending registrations.' },
  );

  const load = async () => {
    if (!sheetsConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending registrations…' });
    try {
      const r = await listPending(300);
      setRows(r.map((p, i) => ({ ...p, id: String((p as { _row?: number })._row ?? i) })));
      setMsg({ tone: r.length ? 'ok' : 'ok', text: `${r.length} pending call registration${r.length === 1 ? '' : 's'} (no UCN yet).` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const register = async (row: Row) => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Fetching product warranty / contract…' });
    try {
      const serial = String(row['SERIAL NO'] ?? '').trim();
      let prod: Record<string, unknown> = {};
      if (serial) {
        const found = await searchProducts({ serial }, 1);
        if (found[0]) prod = productToCallPrefill(found[0]);
      }
      const base: Record<string, unknown> = {
        partyName: row['PARTY NAME'],
        state: row['State'],
        city: row['City'],
        productName: row['PRODUCT'],
        serial,
        standardComplaint: row['Standard Complaint'],
        complaintReported: row['Reported Problem'],
        allocatedTo: row['ENGINEER'],
        customerName: row['CUSTOMER CONTACT DETAILS'],
        customerNumber: row['CUSTOMER CONTACT Number'],
        emailAddress: row['E-Mail ID'],
        personCalling: 'DIRECT ENGINEER',
        complaintDate: row['Complaint Date'],
      };
      // Product Master is authoritative for party/product/warranty/contract.
      const prefill = { ...base, ...prod };
      const ct = String(row['CALL TYPE'] ?? '');
      const path = /install/i.test(ct) ? '/installations' : '/field-calls';
      navigate(path, { state: { prefill, pendingRow: Number(row.id) } });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not prepare registration: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const actionsColumn: Column<Row> = {
    key: '_actions', header: 'Register', width: 110, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-primary" onClick={() => void register(row)} disabled={busy}>Register</button>
      </div>
    ),
  };

  const visible = search.trim()
    ? rows.filter((r) => ['PARTY NAME', 'PRODUCT', 'SERIAL NO', 'ENGINEER', 'Reported Problem', 'City'].some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div>
      <PageHeader title="Pending Call Registrations" subtitle="Engineer requests awaiting a UCN — register from here." icon="⏳" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={can('edit') ? [...COLUMNS, actionsColumn] : COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="pendingRegistrations"
        rowsBeforeScroll={16}
        dense
        emptyText="No pending registrations."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Party, product, serial, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
          </Toolbar>
        }
      />
    </div>
  );
}
