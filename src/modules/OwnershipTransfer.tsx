import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, Drawer, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { useAuth } from '../lib/auth';
import { fmtLongDate, todayISO } from '../lib/format';
import {
  listOwnershipTransfers, addOwnershipTransfer, listAdditionalEntries, saveAdditionalEntry,
  supabaseConfigured, type OwnershipTransfer as OT, type AdditionalEntry as AE,
} from '../lib/supabase';

// ===========================================================================
// OWNERSHIP TRANSFER — where a machine has been, and who has it now.
//
// Product Master carries ONE party per serial: the current owner. A machine
// that changes hands used to simply overwrite it, which left "who owned this
// when that call was raised" unanswerable — a traceability gap on a medical
// device, not an inconvenience.
//
// So the MOVEMENT is the record and the machine follows it: the database fills
// in who holds it now as the "from", moves it to the new party, and lets a
// back-dated row be loaded afterwards without undoing a later one.
//
// ADDITIONAL ENTRY DETAILS sits alongside it: warranty for a machine whose Sale
// Entry was lost. It is consulted only where the Sale / Contract registers are
// silent, so loading the real paperwork later corrects it automatically.
// ===========================================================================

type Tab = 'transfers' | 'entries';

export function OwnershipTransfer() {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const mayMove = live && can('ownership.transfer');
  const mayCover = live && can('cover.edit');

  const [tab, setTab] = useState<Tab>('transfers');
  const [transfers, setTransfers] = useState<OT[]>([]);
  const [entries, setEntries] = useState<AE[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [moveForm, setMoveForm] = useState<Partial<OT> | null>(null);
  const [entryForm, setEntryForm] = useState<Partial<AE> | null>(null);

  const load = async () => {
    if (!live) { setMsg({ tone: 'info', text: 'Connect the database in Settings.' }); return; }
    setBusy(true);
    try {
      const [t, e] = await Promise.all([listOwnershipTransfers(), listAdditionalEntries()]);
      setTransfers(t); setEntries(e);
    } catch (err) {
      setMsg({
        tone: 'error',
        text: /ownership_transfers|product_additional_entries|schema cache/i.test(String(err))
          ? 'These registers need supabase/apply/sales_contracts.sql (0072 + 0073) — run it in the SQL editor.'
          : `Could not load: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const saveMove = async () => {
    if (!moveForm?.serial_number?.trim()) { setMsg({ tone: 'error', text: 'Give the machine serial number.' }); return; }
    if (!moveForm.to_party?.trim()) { setMsg({ tone: 'error', text: 'Give the party the machine is going to.' }); return; }
    setBusy(true);
    const res = await addOwnershipTransfer({ ...moveForm, recorded_by_name: user?.fullName || user?.email || '' });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not record the transfer.' }); return; }
    setMoveForm(null);
    setMsg({ tone: 'ok', text: `${moveForm.serial_number} moved to ${moveForm.to_party}. Product Master now shows the new owner.` });
    await load();
  };

  const saveEntry = async () => {
    if (!entryForm?.serial_number?.trim()) { setMsg({ tone: 'error', text: 'Give the machine serial number.' }); return; }
    setBusy(true);
    const res = await saveAdditionalEntry({ ...entryForm, recorded_by_name: user?.fullName || user?.email || '' });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save the entry.' }); return; }
    setEntryForm(null);
    setMsg({ tone: 'ok', text: `Recorded for ${entryForm.serial_number}. It shows in Product Master unless a real Sale Entry exists for that machine.` });
    await load();
  };

  const q = search.trim().toLowerCase();
  const visT = useMemo(() => transfers.filter((r) => !q || [r.serial_number, r.item_name, r.from_party, r.to_party, r.reference_no].some((v) => String(v ?? '').toLowerCase().includes(q))), [transfers, q]);
  const visE = useMemo(() => entries.filter((r) => !q || [r.serial_number, r.item_name, r.party_name, r.warranty_number, r.source_note].some((v) => String(v ?? '').toLowerCase().includes(q))), [entries, q]);

  const tCols: Column<OT & Record<string, unknown>>[] = [
    { key: 'serial_number', header: 'Serial', width: 130, wrap: false },
    { key: 'item_name', header: 'Machine', width: 150 },
    { key: 'from_party', header: 'From', width: 190 },
    { key: 'to_party', header: 'To', width: 190 },
    { key: 'transfer_date', header: 'Transferred', width: 120, wrap: false, render: (r) => fmtLongDate(r.transfer_date) },
    { key: 'reference_no', header: 'Reference', width: 130 },
    { key: 'reason', header: 'Reason', width: 160 },
    { key: 'document_url', header: 'Document', width: 110, render: (r) => (r.document_url ? <a href={r.document_url} target="_blank" rel="noreferrer">open</a> : <span className="muted">—</span>) },
    { key: 'recorded_by_name', header: 'Recorded By', width: 150 },
  ];

  const eCols: Column<AE & Record<string, unknown>>[] = [
    { key: 'serial_number', header: 'Serial', width: 130, wrap: false },
    { key: 'item_name', header: 'Machine', width: 150 },
    { key: 'warranty_number', header: 'Warranty / Invoice', width: 160 },
    { key: 'warranty_start', header: 'From', width: 110, wrap: false, render: (r) => fmtLongDate(r.warranty_start) },
    { key: 'warranty_end', header: 'To', width: 110, wrap: false, render: (r) => fmtLongDate(r.warranty_end) },
    { key: 'contract_number', header: 'Contract', width: 130 },
    { key: 'contract_type', header: 'Type', width: 90 },
    { key: 'source_note', header: 'Where it came from', width: 240 },
    { key: 'recorded_by_name', header: 'Recorded By', width: 150 },
  ];

  const F = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </label>
  );

  return (
    <div>
      <PageHeader
        title="Ownership Transfer" icon="🔁"
        subtitle="Where each machine has been, and the warranty details recovered for machines whose paperwork was lost."
        count={tab === 'transfers' ? visT.length : visE.length}
        actions={
          tab === 'transfers'
            ? mayMove && <button className="btn btn-primary" onClick={() => setMoveForm({ transfer_date: todayISO() })}>＋ Record a transfer</button>
            : mayCover && <button className="btn btn-primary" onClick={() => setEntryForm({})}>＋ Add entry details</button>
        }
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <button className={`btn btn-sm ${tab === 'transfers' ? 'btn-primary' : ''}`} onClick={() => setTab('transfers')}>🔁 Transfers ({transfers.length})</button>
        <button className={`btn btn-sm ${tab === 'entries' ? 'btn-primary' : ''}`} onClick={() => setTab('entries')}>📄 Additional Entry Details ({entries.length})</button>
      </div>

      <SectionCard title={tab === 'transfers' ? 'Ownership movements' : 'Recovered warranty / contract details'}>
        <p className="muted" style={{ marginTop: 0 }}>
          {tab === 'transfers'
            ? 'Leave “From” blank and it is filled in from whoever holds the machine now — which is what makes a historical list loadable in date order. Product Master follows the LATEST transfer, so a back-dated row loaded afterwards does not undo a later one. Calls already raised keep the party they were raised under: they happened under the old owner.'
            : 'For a machine whose Sale Entry was lost. These details are used only where the Sale and Contract registers are silent — load the real paperwork later and it wins automatically, while this stays on record. Say where the detail came from: a recovered date with no provenance is an assertion, not evidence.'}
        </p>

        {tab === 'transfers' ? (
          <DataTable<OT & Record<string, unknown>>
            columns={tCols} rows={visT as (OT & Record<string, unknown>)[]} getRowId={(r) => String(r.id)}
            storageKey="ownership-transfers" rowsBeforeScroll={14} dense
            emptyText={busy ? 'Loading…' : 'No transfers recorded.'}
            toolbar={<Toolbar>
              <input className="input" placeholder="Search serial, party, reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            </Toolbar>}
          />
        ) : (
          <DataTable<AE & Record<string, unknown>>
            columns={eCols} rows={visE as (AE & Record<string, unknown>)[]} getRowId={(r) => String(r.id)}
            storageKey="additional-entries" rowsBeforeScroll={14} dense
            emptyText={busy ? 'Loading…' : 'Nothing recorded.'}
            toolbar={<Toolbar>
              <input className="input" placeholder="Search serial, warranty, source…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            </Toolbar>}
          />
        )}
      </SectionCard>

      <Drawer open={!!moveForm} onClose={() => setMoveForm(null)} title="Record an ownership transfer">
        {moveForm && (
          <div className="rep-form">
            <F label="Machine serial number *"><input className="input" value={moveForm.serial_number ?? ''} onChange={(e) => setMoveForm({ ...moveForm, serial_number: e.target.value })} /></F>
            <F label="From party" hint="Leave blank — it is filled in from whoever holds the machine now.">
              <input className="input" value={moveForm.from_party ?? ''} onChange={(e) => setMoveForm({ ...moveForm, from_party: e.target.value })} />
            </F>
            <F label="To party *"><input className="input" value={moveForm.to_party ?? ''} onChange={(e) => setMoveForm({ ...moveForm, to_party: e.target.value })} /></F>
            <F label="Transfer date"><input className="input" type="date" value={moveForm.transfer_date ?? ''} onChange={(e) => setMoveForm({ ...moveForm, transfer_date: e.target.value })} /></F>
            <F label="Reference no" hint="The customer's own paperwork for the hand-over.">
              <input className="input" value={moveForm.reference_no ?? ''} onChange={(e) => setMoveForm({ ...moveForm, reference_no: e.target.value })} />
            </F>
            <F label="Reason"><input className="input" value={moveForm.reason ?? ''} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} /></F>
            <F label="Document link"><input className="input" value={moveForm.document_url ?? ''} onChange={(e) => setMoveForm({ ...moveForm, document_url: e.target.value })} /></F>
            <F label="Remarks"><textarea className="input" rows={2} value={moveForm.remarks ?? ''} onChange={(e) => setMoveForm({ ...moveForm, remarks: e.target.value })} /></F>
            <div className="rep-actions">
              <button className="btn" onClick={() => setMoveForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveMove()}>{busy ? 'Saving…' : 'Record the transfer'}</button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer open={!!entryForm} onClose={() => setEntryForm(null)} title="Additional entry details">
        {entryForm && (
          <div className="rep-form">
            <F label="Machine serial number *" hint="One entry per machine — saving again corrects the existing one.">
              <input className="input" value={entryForm.serial_number ?? ''} onChange={(e) => setEntryForm({ ...entryForm, serial_number: e.target.value })} />
            </F>
            <F label="Warranty / invoice number"><input className="input" value={entryForm.warranty_number ?? ''} onChange={(e) => setEntryForm({ ...entryForm, warranty_number: e.target.value })} /></F>
            <F label="Warranty start"><input className="input" type="date" value={entryForm.warranty_start ?? ''} onChange={(e) => setEntryForm({ ...entryForm, warranty_start: e.target.value })} /></F>
            <F label="Warranty end"><input className="input" type="date" value={entryForm.warranty_end ?? ''} onChange={(e) => setEntryForm({ ...entryForm, warranty_end: e.target.value })} /></F>
            <F label="Contract number"><input className="input" value={entryForm.contract_number ?? ''} onChange={(e) => setEntryForm({ ...entryForm, contract_number: e.target.value })} /></F>
            <F label="Contract type"><input className="input" value={entryForm.contract_type ?? ''} onChange={(e) => setEntryForm({ ...entryForm, contract_type: e.target.value })} /></F>
            <F label="Contract start"><input className="input" type="date" value={entryForm.contract_start ?? ''} onChange={(e) => setEntryForm({ ...entryForm, contract_start: e.target.value })} /></F>
            <F label="Contract end"><input className="input" type="date" value={entryForm.contract_end ?? ''} onChange={(e) => setEntryForm({ ...entryForm, contract_end: e.target.value })} /></F>
            <F label="Where this came from" hint="The customer's invoice copy, an old sale register, an engineer's file…">
              <input className="input" value={entryForm.source_note ?? ''} onChange={(e) => setEntryForm({ ...entryForm, source_note: e.target.value })} />
            </F>
            <F label="Document link"><input className="input" value={entryForm.document_url ?? ''} onChange={(e) => setEntryForm({ ...entryForm, document_url: e.target.value })} /></F>
            <div className="rep-actions">
              <button className="btn" onClick={() => setEntryForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveEntry()}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
