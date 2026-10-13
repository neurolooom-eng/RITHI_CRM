// ===========================================================================
// QUOTATIONS (0427; the user, 2026-10-13: "Quote Generation for Both Product
// Contract + Spares").
//
// One register, two kinds of line. A quotation goes to a customer for a
// SERVICE CONTRACT on their machines (one line per machine: model, serial,
// AMC or CMC, a period and a rate), for SPARES (one line per Part Master part:
// HSN, quantity, unit price), or for both on the one document.
//
// THE PRICE IS TYPED, THE CONTEXT IS SHOWN BESIDE IT -- the renewal's rule
// (2026-09-16). A machine's line shows what it was charged on its last
// contract; a part's line shows what it was last quoted at and its Item
// Master purchase cost. Neither is written into the box: a price arrives on
// a quotation because somebody put it there.
//
// NEVER DELETED. A quotation is Cancelled, and once Accepted, Declined or
// Cancelled it is FROZEN (the database refuses a change). REVISE copies it
// into a new Draft naming the one it revises, so what was sent stays as sent.
//
// The arithmetic on screen is lib/quotes.ts, the client's copy of the
// database's generated columns; the figures shown after a save are READ BACK.
// ===========================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Drawer, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { LongDateInput } from '../components/ui/LongDate';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { useMaster } from '../lib/masters';
import { partCode, partName } from '../lib/parts';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { csvExport, statusBadge, type Tone } from '../lib/format';
import { COMPLETE } from '../lib/exportscope';
import { loadFailure } from '../lib/dberror';
import {
  listQuotations, getQuotation, saveQuotation, setQuotationStatus, reviseQuotation,
  lastContractRate, partQuoteContext, sbSearchParties, sbPartyInfo, sbListPartyItems,
  supabaseConfigured, type Quotation, type QuotationLine, type QuotationRow,
} from '../lib/supabase';
import {
  DEFAULT_GST_PCT, DEFAULT_TERMS, DEFAULT_VALIDITY_DAYS, QUOTE_COVER_TYPES, QUOTE_STATUSES,
  isFrozen, lineAmounts, money, nextStatuses, periodEndFor, quoteContents, quoteProblems, quoteTotals, startAfter,
} from '../lib/quotes';
import './fieldcalls.css';
import './quotations.css';

const STATUS_TONE: Record<string, Tone> = { Draft: 'neutral', Sent: 'info', Accepted: 'success', Declined: 'danger', Cancelled: 'warning' };

type Head = Partial<Quotation>;
const blankHead = (): Head => {
  const today = todayLocal();
  const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + DEFAULT_VALIDITY_DAYS - 1);
  const p = (x: number) => String(x).padStart(2, '0');
  return {
    quote_date: today, valid_until: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    party_name: '', party_address: '', party_city: '', party_state: '', party_pincode: '', party_gstin: '', party_pan: '',
    contact_name: '', contact_phone: '', contact_email: '', subject: '', customer_ref: '',
    terms: DEFAULT_TERMS, remarks: '', revision_of: '', status: 'Draft',
  };
};
const blankLine = (type: 'Contract' | 'Spare', rowNo: number): QuotationLine => ({
  row_no: rowNo, line_type: type, description: '', product_name: '', serial_number: '', cover_type: type === 'Contract' ? 'AMC' : '',
  period_months: type === 'Contract' ? 12 : null, period_start: type === 'Contract' ? todayLocal() : null,
  period_end: type === 'Contract' ? periodEndFor(todayLocal(), 12) : null,
  part_code: '', hsn_code: '', qty: 1, unit_price: 0, discount_pct: 0, gst_pct: DEFAULT_GST_PCT,
});

/** A machine of the party, as the Product Database lists it. */
interface Machine { serial: string; model: string; coverEnd: string; cover: string }
const machineLabel = (m: Machine) => `${m.serial} · ${m.model}`;

/** What is shown BESIDE a price box: never written into it. */
type Context = { text: string };

export function Quotations() {
  const live = supabaseConfigured();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const mayEdit = can('quote.edit');

  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  const load = async () => {
    setBusy(true); setErr('');
    try { setRows(await listQuotations()); setSyncedAt(Date.now()); }
    catch (e) {
      setErr(loadFailure(e, { tables: ['quotation_register', 'quotations'],
        hint: 'The quotations tables are not in this database yet — apply quotations.sql (migration 0427).' }));
    } finally { setBusy(false); }
  };
  useEffect(() => { if (live) void load(); }, [live]);

  // ---- the editor --------------------------------------------------------
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [head, setHead] = useState<Head>(blankHead());
  const [lines, setLines] = useState<QuotationLine[]>([]);
  const [formErr, setFormErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [context, setContext] = useState<Record<number, Context>>({});
  const partyLoaded = useRef('');
  const parts = useMaster('spare', [], live && open);

  const frozen = isFrozen(head.status);
  const ro = !mayEdit || frozen;
  const totals = useMemo(() => quoteTotals(lines), [lines]);
  const problems = useMemo(() => quoteProblems(head, lines), [head, lines]);

  const setH = (k: keyof Quotation, v: string) => setHead((h) => ({ ...h, [k]: v }));
  const setL = (i: number, patch: Partial<QuotationLine>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const startNew = () => {
    setEditId(null); setHead(blankHead()); setLines([]); setMachines([]); setContext({}); partyLoaded.current = '';
    setFormErr(''); setMsg(''); setOpen(true);
  };
  const startEdit = async (quoteNo: string) => {
    setFormErr(''); setMsg('');
    try {
      const got = await getQuotation(quoteNo);
      if (!got) { setErr(`Quotation ${quoteNo} was not found, or you cannot view it.`); return; }
      setEditId(got.head.id); setHead(got.head); setLines(got.lines); setContext({});
      partyLoaded.current = '';
      setOpen(true);
      void loadMachines(got.head.party_name);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // THE PARTY'S MACHINES, from the Product Database, for the contract lines.
  const loadMachines = async (party: string) => {
    const p = party.trim();
    if (!p || partyLoaded.current === p) return;
    partyLoaded.current = p;
    try {
      const items = await sbListPartyItems(p);
      const ms: Machine[] = items
        .map((r) => ({
          serial: String(r['Item Serial Number'] ?? '').trim(), model: String(r['Item Name'] ?? '').trim(),
          coverEnd: String(r['Contract End Date'] ?? r['Warranty End Date'] ?? '').slice(0, 10),
          cover: String(r['Contract Type'] ?? '').trim(),
        }))
        .filter((m) => m.serial && m.model);
      ms.sort((a, b) => a.model.localeCompare(b.model) || a.serial.localeCompare(b.serial));
      setMachines(ms);
    } catch { setMachines([]); }
  };
  const pickParty = async (name: string) => {
    setH('party_name', name);
    const info = await sbPartyInfo(name);
    if (info) {
      setHead((h) => ({ ...h, party_name: name, party_address: info.address, party_city: info.city, party_state: info.state,
        party_pincode: info.pincode, party_gstin: info.gstin, party_pan: info.pan,
        contact_phone: h.contact_phone || info.phone }));
    }
    partyLoaded.current = '';
    void loadMachines(name);
  };

  const addLine = (type: 'Contract' | 'Spare') => setLines((ls) => [...ls, blankLine(type, ls.length + 1)]);
  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, k) => k !== i).map((l, k) => ({ ...l, row_no: k + 1 })));
    setContext((c) => { const n: Record<number, Context> = {}; Object.entries(c).forEach(([k, v]) => { const kk = Number(k); if (kk < i) n[kk] = v; else if (kk > i) n[kk - 1] = v; }); return n; });
  };

  const pickMachine = async (i: number, label: string) => {
    const m = machines.find((x) => machineLabel(x) === label);
    if (!m) return;
    const start = m.coverEnd && m.coverEnd >= todayLocal() ? startAfter(m.coverEnd) : (lines[i]?.period_start || todayLocal());
    const months = lines[i]?.period_months ?? 12;
    setL(i, {
      serial_number: m.serial, product_name: m.model,
      description: `${m.model} — Sl. No. ${m.serial}`,
      cover_type: QUOTE_COVER_TYPES.includes(m.cover.toUpperCase()) ? m.cover.toUpperCase() : (lines[i]?.cover_type || 'AMC'),
      period_start: start, period_end: periodEndFor(start, months),
    });
    const last = await lastContractRate(m.serial, m.model);
    setContext((c) => ({ ...c, [i]: { text: last
      ? `Last contract: ₹${money(last.rate)} on ${last.mc_number}${last.contract_type ? ` (${last.contract_type})` : ''}${last.contract_end ? `, ended ${formatDay(last.contract_end)}` : ''}`
      : m.coverEnd ? `No contract rate on record; current cover ends ${formatDay(m.coverEnd)}` : 'No contract rate on record for this machine' } }));
  };
  const pickPart = async (i: number, value: string) => {
    const code = partCode(value), name = partName(value);
    setL(i, { part_code: code, description: name || code });
    const ctx = await partQuoteContext(code);
    setL(i, { hsn_code: ctx.hsn_code });
    const bits: string[] = [];
    if (ctx.last_price != null) bits.push(`Last quoted ₹${money(ctx.last_price)}${ctx.last_quote_no ? ` on ${ctx.last_quote_no}` : ''}`);
    if (ctx.purchase_cost != null) bits.push(`Item Master purchase cost ₹${money(ctx.purchase_cost)}`);
    setContext((c) => ({ ...c, [i]: { text: bits.join(' · ') || 'Not quoted before; no purchase cost on the Item Master' } }));
  };

  const save = async () => {
    if (problems.length) { setFormErr(`Not saved yet — still needed: ${problems.join('; ')}.`); return; }
    setSaving(true); setFormErr('');
    const r = await saveQuotation(editId, head, lines);
    setSaving(false);
    if (!r.ok || !r.data) { setFormErr(r.error ?? 'Could not save.'); return; }
    logAudit({ action: editId == null ? 'quote.create' : 'quote.update', target: r.data.quote_no, status: 'ok',
      meta: { id: r.data.id, lines: lines.length, total: totals.total } });
    setEditId(r.data.id); setHead(r.data);
    setMsg(`Saved ${r.data.quote_no}.`);
    void load();
    // The lines come back with the database's figures.
    try { const got = await getQuotation(r.data.quote_no); if (got) setLines(got.lines); } catch { /* the saved lines stand */ }
  };
  const moveStatus = async (to: string) => {
    if (editId == null) return;
    setSaving(true); setFormErr('');
    const r = await setQuotationStatus(editId, to);
    setSaving(false);
    if (!r.ok || !r.data) { setFormErr(r.error ?? 'Could not change the status.'); return; }
    logAudit({ action: 'quote.status', target: r.data.quote_no, status: 'ok', meta: { to } });
    setHead(r.data); setMsg(`${r.data.quote_no} is now ${to}.`);
    void load();
  };
  const revise = async () => {
    if (!head.quote_no) return;
    setSaving(true); setFormErr('');
    const r = await reviseQuotation(head.quote_no);
    setSaving(false);
    if (!r.ok || !r.data) { setFormErr(r.error ?? 'Could not revise.'); return; }
    logAudit({ action: 'quote.revise', target: r.data.quote_no, status: 'ok', meta: { revision_of: head.quote_no } });
    void load();
    void startEdit(r.data.quote_no);
    setMsg(`${r.data.quote_no} raised as a revision of ${head.quote_no}. It is a Draft — change what is needed and save.`);
  };

  // ---- the register ------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status)
      && (!q || `${r.quote_no} ${r.party_name} ${r.subject} ${r.customer_ref} ${r.revision_of}`.toLowerCase().includes(q)));
  }, [rows, search, status]);
  const facets = useMemo(() => QUOTE_STATUSES.map((s) => ({ key: s, count: rows.filter((r) => r.status === s).length })).filter((f) => f.count), [rows]);

  const cols: Column<QuotationRow>[] = useMemo(() => [
    { key: 'quote_no', header: 'Quotation No', width: 120, render: (r) => <span className="mono">{r.quote_no}</span> },
    { key: 'quote_date', header: 'Date', width: 110, render: (r) => formatDay(r.quote_date) },
    { key: 'party_name', header: 'Party', width: 220 },
    { key: 'party_city', header: 'City', width: 120 },
    { key: '_contents', header: 'Contents', width: 190, accessor: (r) => quoteContents(r.contract_lines, r.spare_lines),
      render: (r) => quoteContents(r.contract_lines, r.spare_lines) },
    { key: 'grand_total', header: 'Total (incl. GST)', width: 140, align: 'right', accessor: (r) => Number(r.grand_total),
      render: (r) => <span className="mono">₹{money(r.grand_total)}</span> },
    { key: 'status', header: 'Status', width: 110, render: (r) => statusBadge(r.status, STATUS_TONE) },
    { key: 'valid_until', header: 'Valid Until', width: 110, render: (r) => r.valid_until ? formatDay(r.valid_until) : '' },
    { key: 'subject', header: 'Subject', width: 200 },
    { key: 'revision_of', header: 'Revision Of', width: 110, render: (r) => <span className="mono">{r.revision_of}</span> },
    { key: 'prepared_by_name', header: 'Prepared By', width: 150 },
    { key: 'updated_at', header: 'Last Changed', width: 150, render: (r) => formatDayTime(r.updated_at) },
    { key: '_print', header: '', width: 90, render: (r) => (
      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/quotation/${encodeURIComponent(r.quote_no)}`); }}>🖨 Print</button>
    ) },
  ], [navigate]);

  if (!live) return <div style={{ padding: 32 }} className="muted">Quotations need the database connection.</div>;

  const title = editId == null ? 'New quotation' : `Quotation ${head.quote_no} · ${head.status}`;
  return (
    <div>
      <PageHeader
        title="Quotations" icon="🧾"
        subtitle="Quotations to customers — a service contract on their machines (AMC / CMC, per machine), spares from the Part Master, or both on one document. Numbered QT/YY/NNNN when saved; never deleted — Cancelled, or revised into a new one."
        count={filtered.length} countMore={false}
        onRefresh={() => void load()} refreshing={busy} syncedAt={syncedAt}
        actions={mayEdit ? <button className="btn btn-primary" onClick={startNew}>+ New quotation</button> : null}
      />
      {err && <div className="sheet-banner sheet-banner-error" style={{ marginBottom: 12 }}>{err}</div>}
      <DataTable<QuotationRow>
        columns={cols} rows={filtered} getRowId={(r) => String(r.id)} storageKey="quotations" dense
        onRowClick={(r) => void startEdit(r.quote_no)}
        emptyText={busy ? 'Loading…' : rows.length ? 'No quotation matches that.' : 'No quotations yet.'}
        toolbar={<Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Quotation no, party, subject, reference…" />
          <FacetChips title="Status" options={facets} value={status} onChange={setStatus} more={false} storeKey="quotations-status" />
          <button className="btn btn-sm" onClick={() => csvExport('quotations.csv',
            [{ key: 'quote_no', header: 'Quotation No' }, { key: 'quote_date', header: 'Date' }, { key: 'valid_until', header: 'Valid Until' },
             { key: 'party_name', header: 'Party' }, { key: 'party_city', header: 'City' }, { key: 'party_state', header: 'State' },
             { key: 'contact_name', header: 'Contact' }, { key: 'subject', header: 'Subject' }, { key: 'customer_ref', header: 'Customer Ref' },
             { key: 'contract_lines', header: 'Machines on Contract' }, { key: 'spare_lines', header: 'Spare Lines' },
             { key: 'taxable_total', header: 'Taxable' }, { key: 'tax_total', header: 'GST' }, { key: 'grand_total', header: 'Total' },
             { key: 'status', header: 'Status' }, { key: 'revision_of', header: 'Revision Of' }, { key: 'prepared_by_name', header: 'Prepared By' },
             { key: 'created_at', header: 'Created At' }, { key: 'updated_at', header: 'Updated At' }],
            filtered as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Export CSV</button>
        </Toolbar>}
      />

      <Drawer open={open} onClose={() => setOpen(false)} title={title} width={1040} storeKey="quotation-editor">
        {frozen && <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 10 }}>
          This quotation is <b>{head.status}</b> and cannot be changed. To change a price or a line, <b>Revise</b> it into a new Draft.
        </div>}
        {!mayEdit && !frozen && <div className="muted" style={{ marginBottom: 10 }}>Read only — your role may open quotations and not raise or change them.</div>}

        <div className="qt-grid">
          <div className="field qt-span2"><label className="field-label">Party Name *</label>
            <SelectPicker value={head.party_name ?? ''} onChange={(v) => void pickParty(v)} options={head.party_name ? [head.party_name] : []}
              onSearch={(term) => sbSearchParties(term, 50)} allowFreeText disabled={ro}
              placeholder="Type the customer's name — a Party Master entry fills in its details" />
          </div>
          <div className="field"><label className="field-label">Quotation Date *</label>
            <LongDateInput value={head.quote_date ?? ''} onChange={(v) => setH('quote_date', v)} disabled={ro} /></div>
          <div className="field"><label className="field-label">Valid Until</label>
            <LongDateInput value={head.valid_until ?? ''} onChange={(v) => setH('valid_until', v)} disabled={ro} /></div>
          <div className="field qt-span2"><label className="field-label">Subject</label>
            <input className="input" value={head.subject ?? ''} disabled={ro} onChange={(e) => setH('subject', e.target.value)}
              placeholder="e.g. Annual Maintenance Contract — ORION-G ventilators, 2026-27" /></div>
          <div className="field"><label className="field-label">Customer Ref / Enquiry</label>
            <input className="input" value={head.customer_ref ?? ''} disabled={ro} onChange={(e) => setH('customer_ref', e.target.value)} /></div>
          <div className="field"><label className="field-label">Contact Name</label>
            <input className="input" value={head.contact_name ?? ''} disabled={ro} onChange={(e) => setH('contact_name', e.target.value)} /></div>
          <div className="field"><label className="field-label">Contact Phone</label>
            <input className="input" value={head.contact_phone ?? ''} disabled={ro} onChange={(e) => setH('contact_phone', e.target.value)} /></div>
          <div className="field"><label className="field-label">Contact Email</label>
            <input className="input" value={head.contact_email ?? ''} disabled={ro} onChange={(e) => setH('contact_email', e.target.value)} /></div>
          <div className="field qt-span2"><label className="field-label">Address</label>
            <textarea className="textarea" rows={2} value={head.party_address ?? ''} disabled={ro} onChange={(e) => setH('party_address', e.target.value)} /></div>
          <div className="field"><label className="field-label">City</label>
            <input className="input" value={head.party_city ?? ''} disabled={ro} onChange={(e) => setH('party_city', e.target.value)} /></div>
          <div className="field"><label className="field-label">State</label>
            <input className="input" value={head.party_state ?? ''} disabled={ro} onChange={(e) => setH('party_state', e.target.value)} /></div>
          <div className="field"><label className="field-label">Pincode</label>
            <input className="input" value={head.party_pincode ?? ''} disabled={ro} onChange={(e) => setH('party_pincode', e.target.value)} /></div>
          <div className="field"><label className="field-label">GSTIN</label>
            <input className="input mono" value={head.party_gstin ?? ''} disabled={ro} onChange={(e) => setH('party_gstin', e.target.value)} /></div>
          <div className="field"><label className="field-label">PAN</label>
            <input className="input mono" value={head.party_pan ?? ''} disabled={ro} onChange={(e) => setH('party_pan', e.target.value)} /></div>
        </div>

        <div className="qt-lines-head">
          <h3>Lines</h3>
          {!ro && <div className="row">
            <button className="btn btn-sm" onClick={() => addLine('Contract')} disabled={!head.party_name?.trim()}
              title={head.party_name?.trim() ? '' : 'Pick the party first — its machines are offered on the line'}>+ Machine on contract</button>
            <button className="btn btn-sm" onClick={() => addLine('Spare')}>+ Spare</button>
          </div>}
        </div>
        {!lines.length && <div className="muted" style={{ margin: '6px 0 12px' }}>No lines yet. Add a machine on contract, a spare, or both.</div>}
        {lines.map((l, i) => {
          const a = lineAmounts(l);
          const machineValue = l.serial_number ? `${l.serial_number} · ${l.product_name}` : '';
          return (
            <div className={`qt-line qt-line-${l.line_type.toLowerCase()}`} key={i}>
              <div className="qt-line-top">
                <span className="qt-line-no">{i + 1}</span>
                <span className={`badge ${l.line_type === 'Contract' ? 'badge-primary' : 'badge-info'}`}>{l.line_type === 'Contract' ? 'Machine on contract' : 'Spare'}</span>
                {l.line_type === 'Contract' ? (
                  <div className="field qt-grow"><label className="field-label">Machine (from the Product Database) *</label>
                    <SelectPicker value={machineValue} onChange={(v) => void pickMachine(i, v)}
                      options={[...new Set([...(machineValue ? [machineValue] : []), ...machines.map(machineLabel)])]}
                      disabled={ro} placeholder={machines.length ? 'Pick the machine — serial · model' : 'This party has no machine on the Product Database; type the serial and model below'}
                      emptyHint="No machine of this party matches" />
                  </div>
                ) : (
                  <div className="field qt-grow"><label className="field-label">Part (from the Part Master) *</label>
                    <SelectPicker value={parts.values.find((p) => partCode(p) === l.part_code) ?? (l.part_code ? `${l.part_code}|${l.description}` : '')}
                      onChange={(v) => void pickPart(i, v)} options={parts.values} disabled={ro} loading={!parts.ready}
                      placeholder="Type a part code or name" emptyHint="Not on the Part Master — add it there first" />
                  </div>
                )}
                {!ro && <button className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} title="Remove this line">✕</button>}
              </div>
              <div className="qt-grid qt-grid-line">
                <div className="field qt-span2"><label className="field-label">Description (as printed) *</label>
                  <input className="input" value={l.description} disabled={ro} onChange={(e) => setL(i, { description: e.target.value })} /></div>
                {l.line_type === 'Contract' ? (<>
                  <div className="field"><label className="field-label">Model</label>
                    <input className="input" value={l.product_name} disabled={ro} onChange={(e) => setL(i, { product_name: e.target.value })} /></div>
                  <div className="field"><label className="field-label">Serial *</label>
                    <input className="input mono" value={l.serial_number} disabled={ro} onChange={(e) => setL(i, { serial_number: e.target.value })} /></div>
                  <div className="field"><label className="field-label">Cover *</label>
                    <SelectPicker value={l.cover_type} options={QUOTE_COVER_TYPES} disabled={ro} onChange={(v) => setL(i, { cover_type: v })} /></div>
                  <div className="field"><label className="field-label">Period (months) *</label>
                    <input className="input" type="number" min={1} value={l.period_months ?? ''} disabled={ro}
                      onChange={(e) => { const m = e.target.value === '' ? null : Number(e.target.value); setL(i, { period_months: m, period_end: periodEndFor(l.period_start ?? '', m) }); }} /></div>
                  <div className="field"><label className="field-label">Period Start</label>
                    <LongDateInput value={l.period_start ?? ''} disabled={ro}
                      onChange={(v) => setL(i, { period_start: v, period_end: periodEndFor(v, l.period_months) })} /></div>
                  <div className="field"><label className="field-label">Period End</label>
                    <LongDateInput value={l.period_end ?? ''} disabled={ro} onChange={(v) => setL(i, { period_end: v })} /></div>
                  <div className="field"><label className="field-label">Rate for the period (₹) *</label>
                    <input className="input mono" type="number" min={0} step="0.01" value={l.unit_price} disabled={ro}
                      onChange={(e) => setL(i, { unit_price: Number(e.target.value), qty: 1 })} /></div>
                </>) : (<>
                  <div className="field"><label className="field-label">Part Code</label>
                    <input className="input mono" value={l.part_code} disabled readOnly /></div>
                  <div className="field"><label className="field-label">HSN</label>
                    <input className="input mono" value={l.hsn_code} disabled={ro} onChange={(e) => setL(i, { hsn_code: e.target.value })} /></div>
                  <div className="field"><label className="field-label">Qty *</label>
                    <input className="input mono" type="number" min={0} step="1" value={l.qty} disabled={ro}
                      onChange={(e) => setL(i, { qty: Number(e.target.value) })} /></div>
                  <div className="field"><label className="field-label">Unit Price (₹) *</label>
                    <input className="input mono" type="number" min={0} step="0.01" value={l.unit_price} disabled={ro}
                      onChange={(e) => setL(i, { unit_price: Number(e.target.value) })} /></div>
                </>)}
                <div className="field"><label className="field-label">Discount %</label>
                  <input className="input mono" type="number" min={0} max={100} step="0.01" value={l.discount_pct} disabled={ro}
                    onChange={(e) => setL(i, { discount_pct: Number(e.target.value) })} /></div>
                <div className="field"><label className="field-label">GST %</label>
                  <input className="input mono" type="number" min={0} max={100} step="0.01" value={l.gst_pct} disabled={ro}
                    onChange={(e) => setL(i, { gst_pct: Number(e.target.value) })} /></div>
              </div>
              <div className="qt-line-foot">
                <span className="muted">{context[i]?.text ?? ''}</span>
                <span className="mono">Taxable ₹{money(a.taxable)} · GST ₹{money(a.tax)} · <b>Total ₹{money(a.total)}</b></span>
              </div>
            </div>
          );
        })}

        {lines.length > 0 && <div className="qt-totals mono">
          <div><span>Taxable</span><span>₹{money(totals.taxable)}</span></div>
          <div><span>GST</span><span>₹{money(totals.tax)}</span></div>
          <div className="qt-grand"><span>Grand total</span><span>₹{money(totals.total)}</span></div>
        </div>}

        <div className="qt-grid" style={{ marginTop: 12 }}>
          <div className="field qt-span2"><label className="field-label">Terms &amp; Conditions (printed)</label>
            <textarea className="textarea" rows={6} value={head.terms ?? ''} disabled={ro} onChange={(e) => setH('terms', e.target.value)} /></div>
          <div className="field qt-span2"><label className="field-label">Remarks (printed)</label>
            <textarea className="textarea" rows={3} value={head.remarks ?? ''} disabled={ro} onChange={(e) => setH('remarks', e.target.value)} /></div>
        </div>

        {editId != null && <div className="muted" style={{ marginTop: 6 }}>
          Prepared by {head.prepared_by_name || '—'} · created {formatDayTime(head.created_at)} · last changed {formatDayTime(head.updated_at)}
          {head.revision_of ? <> · revision of <span className="mono">{head.revision_of}</span></> : null}
          {head.status_at ? <> · {head.status} since {formatDayTime(head.status_at)}</> : null}
        </div>}
        {formErr && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 10 }}>{formErr}</div>}
        {msg && <div className="sheet-banner sheet-banner-ok" style={{ marginTop: 10 }}>{msg}</div>}

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          {!ro && <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : editId == null ? 'Save quotation' : 'Save changes'}</button>}
          {editId != null && head.quote_no && (
            <button className="btn" onClick={() => navigate(`/quotation/${encodeURIComponent(head.quote_no!)}`)}>🖨 Print / PDF</button>
          )}
          {editId != null && mayEdit && nextStatuses(head.status).map((s) => (
            <button key={s} className="btn btn-sm" disabled={saving} onClick={() => void moveStatus(s)}
              title={isFrozen(s) ? `Marks it ${s}; it can then only be revised` : ''}>Mark {s}</button>
          ))}
          {editId != null && mayEdit && <button className="btn btn-sm" disabled={saving} onClick={() => void revise()}>⎘ Revise into a new quotation</button>}
          <span className="muted" style={{ marginLeft: 'auto' }}>{user?.fullName ? `Signed in as ${user.fullName}` : ''}</span>
        </div>
      </Drawer>
    </div>
  );
}
