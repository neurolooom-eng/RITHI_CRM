import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { listPartyRows, searchPartyRows, supabaseConfigured } from '../lib/supabase';

// ===========================================================================
// PARTY MASTER — live from the Supabase `parties` table. Default shows the
// first 1,000 (alphabetical); typing searches the whole table server-side.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
const g = (r: Row, k: string) => String(r[k] ?? '');

const COLUMNS: Column<Row>[] = [
  { key: 'party_name', header: 'Party Name', width: 300 },
  { key: 'city', header: 'City', width: 140 },
  { key: 'state', header: 'State', width: 140 },
  { key: 'party_type', header: 'Type', width: 140 },
  { key: 'address', header: 'Address', width: 320 },
];

export function PartyMaster() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Party Master.' },
  );

  // Debounced server-side load/search.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const term = search.trim();
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = term ? await searchPartyRows(term, 1000) : await listPartyRows(1000);
        setRows(data.map((p, i) => ({ ...p, id: String(p.id ?? i) })));
        setMsg({ tone: 'ok', text: term ? `${data.length} match${data.length === 1 ? '' : 'es'} for "${term}".` : `Showing ${data.length} parties (search to find any).` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, term ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [search]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  return (
    <div>
      <PageHeader title="Party Master" subtitle="Customers / parties — live from the database." icon="🏥" />
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
        storageKey="partyMaster"
        rowsBeforeScroll={16}
        dense
        emptyText={busy ? 'Loading…' : 'No parties.'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search party, city, state, type…" />
            {busy && <span className="muted">…</span>}
            <div className="spacer" />
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('party-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}
