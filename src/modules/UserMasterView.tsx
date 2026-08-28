import { useEffect, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, statusBadge } from '../lib/format';
import { listUsers, sheetsConfigured } from '../lib/sheets';
import './fieldcalls.css';

// ===========================================================================
// USER MASTER — compact directory of all users from the User Master sheet
// (irrespective of Validity). Read-only browse + search.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const VALIDITY_TONES = { TRUE: 'success', FALSE: 'neutral' } as const;

const COLUMNS: Column<Row>[] = [
  { key: 'User Name', header: 'Name', width: 170 },
  { key: 'Designation', header: 'Designation', width: 150 },
  { key: 'Email ID', header: 'Air Liquide ID', width: 200, wrap: false },
  { key: 'GMAIL ID', header: 'Gmail', width: 180, wrap: false },
  { key: 'REGION', header: 'Region', width: 80, wrap: false },
  { key: 'Validity', header: 'Active', width: 70, wrap: false, render: (r) => statusBadge(r['Validity'], VALIDITY_TONES) },
  { key: 'RM', header: 'Reporting Mgr', width: 150 },
  { key: 'Contact  No', header: 'Contact', width: 130, wrap: false },
  { key: 'CITY', header: 'City', width: 110 },
  { key: 'STATE', header: 'State', width: 110 },
];

export function UserMasterView() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to load the User Master.' },
  );

  const run = async (query = q) => {
    if (!sheetsConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading users…' });
    try {
      const r = await listUsers(query.trim(), 300);
      setRows(r.map((u, i) => ({ ...u, id: `${String(u['Email ID'] || u['GMAIL ID'] || u['User Name'] || i)}-${i}` })));
      setMsg({ tone: r.length ? 'ok' : 'info', text: r.length ? `${r.length} users${r.length >= 300 ? ' (first 300 — refine search)' : ''}.` : 'No users matched.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title="User Master" subtitle="All users from the User Master sheet — regardless of activation." icon="👤" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={COLUMNS}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="userMaster"
        rowsBeforeScroll={16}
        dense
        emptyText="No users — adjust your search."
        toolbar={
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Name, email, region, designation…" />
            <button className="btn btn-sm btn-primary" onClick={() => void run()} disabled={busy}>{busy ? '…' : 'Search'}</button>
            <div className="spacer" />
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('user-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}>
                ⭳ Export CSV
              </button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}
