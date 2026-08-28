import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { searchProducts, sheetsConfigured } from '../lib/sheets';
import { productToCallPrefill } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PRODUCT MASTER view — browse/search the ProdMaster sheet (via CallReg) and
// register a Field or Installation call directly from a product row (the call
// form opens pre-filled from that item).
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'Item Name', header: 'Product', width: 150 },
  { key: 'Item Serial Number', header: 'Serial', width: 110, wrap: false },
  { key: 'Item Code', header: 'Item Code', width: 110, wrap: false },
  { key: 'Party Name', header: 'Party', width: 230 },
  { key: 'City', header: 'City', width: 110 },
  { key: 'State', header: 'State', width: 110 },
  { key: 'Item Status', header: 'Status', width: 70, wrap: false },
  { key: 'Warranty End Date', header: 'Warranty End', width: 120 },
  { key: 'Contract Type', header: 'Contract', width: 90, wrap: false },
  { key: 'Contract End Date', header: 'Contract End', width: 120 },
  { key: 'Service Engineer', header: 'Engineer', width: 150 },
];

export function ProductMaster() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to search the Product Master.' },
  );

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Searching Product Master…' });
    try {
      const r = await searchProducts(q.trim(), 200);
      setRows(r.map((p, i) => ({ ...p, id: `${String(p['Item Serial Number'] ?? '')}-${i}` })));
      setMsg({ tone: r.length ? 'ok' : 'info', text: r.length ? `${r.length} products matched${r.length >= 200 ? ' (showing first 200 — refine your search)' : ''}.` : 'No products matched.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const register = (row: Row, path: string) =>
    navigate(path, { state: { prefill: productToCallPrefill(row) } });

  const actionsColumn: Column<Row> = {
    key: '_actions', header: 'Register Call', width: 170, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-primary" title="Register a field call for this item" onClick={() => register(row, '/field-calls')}>+ Field</button>
        <button className="btn btn-sm" title="Register an installation call for this item" onClick={() => register(row, '/installations')}>+ Install</button>
      </div>
    ),
  };

  return (
    <div>
      <PageHeader
        title="Product Master"
        subtitle="Search the install base and register a call straight from a product."
        icon="🩺"
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={can('edit') ? [...COLUMNS, actionsColumn] : COLUMNS}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="productMaster"
        rowsBeforeScroll={14}
        emptyText="Search by serial, item code, product or party to list products."
        toolbar={
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Serial, item code, product or party…" />
            <button className="btn btn-sm btn-primary" onClick={() => void run()} disabled={busy || !q.trim()}>
              {busy ? '…' : 'Search'}
            </button>
            <div className="spacer" />
            {rows.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => csvExport('product-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}
              >
                ⭳ Export CSV
              </button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}
