import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader } from '../components/ui/ui';
import { searchProducts, dataConfigured } from '../lib/sheets';
import { queryParties, sbListPartyItems, supabaseConfigured } from '../lib/supabase';
import { productToCallPrefill } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PRODUCT & PARTY SEARCH — the same question from either end.
//
//   "A serial number is on the phone: whose is it, and what else do they have?"
//   "Which machines does this hospital have?"
//
// Both land on ONE answer: a party, its details, and every machine at it. The
// registers can already filter a column; this is for the desk that has half a
// serial number and a customer waiting.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
type Party = Record<string, unknown>;

const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();

const MACHINE_COLUMNS: Column<Row>[] = [
  { key: 'Item Name', header: 'Product', width: 160 },
  { key: 'Item Serial Number', header: 'Serial', width: 120, wrap: false },
  { key: 'Item Status', header: 'Status', width: 80, wrap: false },
  { key: 'Warranty End Date', header: 'Warranty ends', width: 120, wrap: false },
  { key: 'Contract Type', header: 'Contract', width: 100, wrap: false },
  { key: 'Contract End Date', header: 'Contract ends', width: 120, wrap: false },
  { key: 'Service Engineer', header: 'Engineer', width: 150 },
];

const FOUND_COLUMNS: Column<Row>[] = [
  { key: 'Item Name', header: 'Product', width: 160 },
  { key: 'Item Serial Number', header: 'Serial', width: 120, wrap: false },
  { key: 'Party Name', header: 'Party', width: 260 },
  { key: 'City', header: 'City', width: 120 },
  { key: 'Item Status', header: 'Status', width: 80, wrap: false },
];

export function Lookup() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [mode, setMode] = useState<'machine' | 'party'>('machine');
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [found, setFound] = useState<Row[] | null>(null);
  const [partyHits, setPartyHits] = useState<Party[] | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const onDb = supabaseConfigured();

  // A party is the ANSWER in both directions, so opening one is one function.
  const openParty = async (name: string) => {
    if (!name) return;
    setBusy('Loading the party…'); setMsg('');
    try {
      const [rows, machines] = await Promise.all([
        onDb ? queryParties({ name }, 0, 5) : Promise.resolve([] as Party[]),
        onDb ? sbListPartyItems(name) : searchProducts({ party: name }, 500),
      ]);
      // ilike is a CONTAINS match, so prefer the row whose name is exactly the
      // one asked for — "APOLLO" must not open "APOLLO SPECIALITY".
      const exact = rows.find((r) => g(r, 'party_name').toLowerCase() === name.toLowerCase());
      setParty(exact ?? rows[0] ?? { party_name: name });
      setItems((machines as Record<string, unknown>[]).map((m, i) => ({ ...m, id: String(i) })) as Row[]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  };

  const searchMachines = async () => {
    if (!product.trim() && !serial.trim()) { setMsg('Give a product or a serial number to search for.'); return; }
    setBusy('Searching…'); setMsg(''); setParty(null); setPartyHits(null);
    try {
      const rows = await searchProducts({ product: product.trim(), serial: serial.trim() }, 200);
      const list = rows.map((r, i) => ({ ...r, id: String(i) })) as Row[];
      setFound(list);
      // One machine, one party: go straight to the answer.
      if (list.length === 1) await openParty(g(list[0], 'Party Name'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  };

  const searchParties = async () => {
    if (!partyQ.trim()) { setMsg('Give a party name to search for.'); return; }
    setBusy('Searching…'); setMsg(''); setParty(null); setFound(null);
    try {
      const rows = onDb ? await queryParties({ name: partyQ.trim() }, 0, 50) : [];
      setPartyHits(rows);
      if (rows.length === 1) await openParty(g(rows[0], 'party_name'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  };

  // Everything the party sheet carried that has no field of its own — the
  // telephone, the contact person, the GST — lives in `extra`.
  const extra = (party?.extra as Record<string, unknown>) ?? {};
  const detail = (label: string, value: unknown) => {
    const v = String(value ?? '').trim();
    return v ? <div className="lk-detail"><span className="muted">{label}</span><b>{v}</b></div> : null;
  };

  return (
    <div>
      <PageHeader
        title="Product & Party Search"
        subtitle="A serial number to its customer, or a customer to everything they have."
        icon="🔎"
        count={party ? items.length : undefined}
      />

      {!dataConfigured() && <div className="sheet-banner sheet-banner-info">Connect the database in Settings to search.</div>}
      {msg && <div className="sheet-banner sheet-banner-error"><span>{msg}</span><button className="btn btn-ghost btn-sm" onClick={() => setMsg('')}>✕</button></div>}

      <div className="stage-chips">
        <button className={`chip ${mode === 'machine' ? 'chip-on' : ''}`} onClick={() => setMode('machine')}>By product / serial</button>
        <button className={`chip ${mode === 'party' ? 'chip-on' : ''}`} onClick={() => setMode('party')}>By party</button>
      </div>

      <div className="lk-search">
        {mode === 'machine' ? (
          <>
            <input className="input" placeholder="Product (e.g. EXTEND-XT)" value={product}
              onChange={(e) => setProduct(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchMachines(); }} />
            <input className="input" placeholder="Serial number" value={serial}
              onChange={(e) => setSerial(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchMachines(); }} />
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void searchMachines()}>Search</button>
          </>
        ) : (
          <>
            <input className="input lk-wide" placeholder="Party name (any part of it)" value={partyQ}
              onChange={(e) => setPartyQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchParties(); }} />
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void searchParties()}>Search</button>
          </>
        )}
        {busy && <span className="muted">{busy}</span>}
      </div>

      {/* Machines that matched — click one to open its party. */}
      {found && !party && (
        found.length ? (
          <DataTable<Row>
            columns={FOUND_COLUMNS}
            rows={found}
            getRowId={(r) => r.id}
            storageKey="lookupFound"
            dense
            rowsBeforeScroll={10}
            onRowClick={(r) => void openParty(g(r, 'Party Name'))}
            emptyText="No machine matched."
          />
        ) : <div className="sheet-banner sheet-banner-info">No machine matched that product or serial.</div>
      )}

      {/* Parties that matched — click one to open it. */}
      {partyHits && !party && (
        partyHits.length ? (
          <div className="lk-hits">
            {partyHits.map((p) => (
              <button key={g(p, 'party_name')} className="lk-hit" onClick={() => void openParty(g(p, 'party_name'))}>
                <b>{g(p, 'party_name')}</b>
                <span className="muted">{[g(p, 'city'), g(p, 'state')].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        ) : <div className="sheet-banner sheet-banner-info">No party matched that name.</div>
      )}

      {/* The answer: who they are, and every machine they have. */}
      {party && (
        <>
          <div className="lk-card">
            <div className="lk-card-head">
              <h3>{g(party, 'party_name')}</h3>
              {g(party, 'party_key') && <span className="chip">{g(party, 'party_key')}</span>}
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => { setParty(null); setItems([]); }}>← Back to results</button>
            </div>
            <div className="lk-details">
              {detail('Type', g(party, 'party_type') || extra['Type'])}
              {detail('City', g(party, 'city'))}
              {detail('State', g(party, 'state'))}
              {detail('Address', g(party, 'address') || extra['Address'] || extra['Billing Address'])}
              {detail('Contact', extra['Contact Person Name'])}
              {detail('Designation', extra['Contact Person Designation'])}
              {detail('Telephone', extra['Tel 1'] || extra['Tel 2'] || extra['Tel 3'])}
              {detail('Email', extra['Email ID'] || extra['Email ID 2'])}
              {detail('Service Engineer', extra['Service Engineer'])}
              {detail('GST', extra['GST'])}
            </div>
          </div>

          <h4 className="lk-sub">{items.length} machine{items.length === 1 ? '' : 's'} at this party</h4>
          <DataTable<Row>
            columns={can('calls.create') ? [{
              key: '_register', header: 'Register call', width: 130, sortable: false, wrap: false,
              render: (r: Row) => (
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/field-calls', { state: { prefill: productToCallPrefill(r) } });
                  }}
                >
                  ＋ Field call
                </button>
              ),
            }, ...MACHINE_COLUMNS] : MACHINE_COLUMNS}
            rows={items}
            getRowId={(r) => r.id}
            storageKey="lookupItems"
            rowsBeforeScroll={12}
            emptyText="No machine is recorded against this party."
          />
        </>
      )}
    </div>
  );
}
