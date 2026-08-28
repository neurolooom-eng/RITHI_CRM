import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import './fieldcalls.css';

// ===========================================================================
// SPARE CONSUMPTION — monitor the spares consumed against every call report.
// Reads the standalone v2Consumption book (schema-agnostic). Rows carry the
// call's UC Number (written at report time), so consumption is traceable to the
// report/call. Role-scoped by the engineer column when present.
// ===========================================================================

const BOOK = 'consumption';
const UCN_KEYS = ['UC Number', 'UCN', 'UC No'];
const ENGINEER_KEYS = ['Visiting Service Engineer', 'ENGINEER NAME', 'Engineer', 'Service Engineer', 'Allocated To', 'Call Allocated To'];
const EMAIL_KEYS = ['Engineer Email', 'Email address', 'Email-ID', 'Email ID'];
const PREFERRED = [
  'UC Number', 'Call Number', 'Party Name', 'Product Name', 'Product Serial Number',
  'Spare', 'Part Number', 'Part Description', 'Qty', 'Quantity', 'Consumption Date', 'Date', 'Timestamp',
  'Visiting Service Engineer', 'ENGINEER NAME',
];

type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');
const pick = (r: Record<string, unknown>, keys: string[]) => { for (const k of keys) if (g(r, k)) return g(r, k); return ''; };

export function SpareConsumption() {
  const { user } = useAuth();
  const scope = useAccessScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to load spare consumption.' },
  );

  const load = async () => {
    if (!sheetsConfigured()) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading spare consumption…' });
    try {
      const r = await listTabRows('', 600, '', BOOK);
      setRows(r.map((x, i) => ({ ...x, id: `${pick(x, UCN_KEYS)}-${i}` })));
      setLastSync(new Date().toISOString());
      setMsg({ tone: 'ok', text: `Loaded ${r.length} consumption lines.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const headerKeys = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 60).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id' && !/^Page.*Header$/i.test(k)) ks.add(k); }));
    return [...ks];
  }, [rows]);

  const engineerKey = useMemo(() => ENGINEER_KEYS.find((k) => headerKeys.includes(k)), [headerKeys]);
  const emailKey = useMemo(() => EMAIL_KEYS.find((k) => headerKeys.includes(k)), [headerKeys]);
  const email = String(user?.email ?? '').trim().toLowerCase();

  // Role scope: engineers/RMs see their own consumption when an engineer column
  // exists; otherwise (no such column) the view is unfiltered.
  const scoped = useMemo(() => {
    if (scope.all || (!engineerKey && !emailKey)) return rows;
    return rows.filter((r) =>
      (engineerKey && scope.names.has(g(r, engineerKey).trim().toLowerCase())) ||
      (emailKey && g(r, emailKey).toLowerCase() === email),
    );
  }, [rows, scope, engineerKey, emailKey, email]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((r) => headerKeys.some((k) => g(r, k).toLowerCase().includes(q)));
  }, [scoped, search, headerKeys]);

  const baseCols = PREFERRED.filter((k) => headerKeys.includes(k)).concat(headerKeys.filter((k) => !PREFERRED.includes(k))).slice(0, 9);
  const columns: Column<Row>[] = baseCols.map((k) => ({ key: k, header: k, width: UCN_KEYS.includes(k) ? 110 : 150, wrap: !UCN_KEYS.includes(k) }));
  const allFields = headerKeys.map((k) => ({ key: k, header: k }));

  return (
    <div>
      <PageHeader title="Spare Consumption" subtitle="Spares consumed against every call report (v2Consumption), traceable by UCN." icon="🧾" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={columns}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="spareConsumption"
        rowsBeforeScroll={14}
        dense
        emptyText="No consumption yet — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="UCN, part, party, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off">⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('spare-consumption.csv', headerKeys.map((k) => ({ key: k, header: k })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}
