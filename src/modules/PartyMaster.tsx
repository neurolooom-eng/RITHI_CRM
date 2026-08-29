import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { queryParties, supabaseConfigured, type PartyFilter } from '../lib/supabase';

// ===========================================================================
// PARTY MASTER — live from Supabase `parties`. Field-specific server-side
// filters (Party / City / State / Type) with a Load more pager.
// ===========================================================================

const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'party_name', header: 'Party Name', width: 300 },
  { key: 'city', header: 'City', width: 150 },
  { key: 'state', header: 'State', width: 150 },
  { key: 'party_type', header: 'Type', width: 150 },
  { key: 'address', header: 'Address', width: 340 },
];

export function PartyMaster() {
  const [filter, setFilter] = useState<PartyFilter>({ name: '', city: '', state: '', type: '' });
  const [rows, setRows] = useState<Row[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);   // a full page came back → maybe more
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Party Master.' },
  );
  const set = (k: keyof PartyFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const toRows = (data: Record<string, unknown>[], base: number) => data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

  // Debounced first page whenever a filter changes.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = await queryParties(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
        const any = filter.name || filter.city || filter.state || filter.type;
        setMsg({ tone: 'ok', text: `${data.length}${data.length === PAGE ? '+' : ''} parties${any ? ' matched' : ''}.` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.name, filter.city, filter.state, filter.type]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryParties(filter, offset, PAGE);
      setRows((cur) => [...cur, ...toRows(data, cur.length)]);
      setOffset((o) => o + data.length); setMore(data.length === PAGE);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

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
        emptyText={busy ? 'Loading…' : 'No parties match.'}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Party name" value={filter.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" placeholder="State" value={filter.state} onChange={(e) => set('state', e.target.value)} />
              <input className="input" placeholder="City" value={filter.city} onChange={(e) => set('city', e.target.value)} />
              <input className="input" placeholder="Type" value={filter.type} onChange={(e) => set('type', e.target.value)} />
            </div>
            {busy && <span className="muted">…</span>}
            {more && !busy && <button className="btn btn-sm" onClick={() => void loadMore()}>↓ Load more</button>}
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
