// ===========================================================================
// SPARE RECYCLING — a parallel track under Indoor Service (0350).
//
// The user, 2026-10-04: registration, spare request, job done details,
// consumption and hand stock for recycling a defective spare — "a Parallel
// Track and should not collide with Regular Calls or Spare or Handstock. Even
// the Stock should be maintained Separately. This is Non Auditable Requirement
// and when i enable the Audit mode, it should not show."
//
//   Register a defective spare (RCY/YY/NNNN), an optional call reference kept
//   as text → raise an MRS (RMRS/YY/NNNN), NO approval → Stores books it out
//   WITH A UNIT COST into the requester's RECYCLING hand stock → on closing,
//   consume from it, record the job done and any other costs → close Returned
//   (to the Service Store as R<PartNo>) or Not recyclable.
//
// HIDDEN IN AUDIT MODE: the menu leaves it out and this page refuses to draw,
// and the database returns nothing and refuses every write while it is on —
// the page hiding is a courtesy, the database is the rule.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Modal, Toolbar, SectionCard } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { LongDateInput } from '../components/ui/LongDate';
import { useAuth } from '../lib/auth';
import { useAuditMode } from '../lib/auditMode';
import { useSpareParts } from '../lib/useSpareParts';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { csvExport } from '../lib/format';
import { COMPLETE } from '../lib/exportscope';
import {
  supabaseConfigured,
  listRecycleRequests, addRecycleRequest, updateRecycleRequest,
  listRecycleMrs, raiseRecycleMrs, issueRecycleLine, listRecycleHandStock,
  listRecycleConsumption, addRecycleConsumption, deleteRecycleConsumption,
  listRecycleCosts, addRecycleCost, deleteRecycleCost,
  type RecycleRequest, type RecycleMrsLine, type RecycleHandStock, type RecycleConsumption, type RecycleCost,
} from '../lib/supabase';
import './fieldcalls.css';

type Tab = 'requests' | 'mrs' | 'stock' | 'cost';
const COST_TYPES = ['Labour', 'Courier', 'Vendor', 'Other'];

// A Part Master picker value is "CODE|Description"; the code is what is kept.
const splitPart = (v: string): { code: string; description: string } => {
  const i = v.indexOf('|');
  return i < 0 ? { code: v.trim(), description: '' } : { code: v.slice(0, i).trim(), description: v.slice(i + 1).trim() };
};
const money = (n: number | null | undefined) =>
  n == null ? '' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number | null | undefined) => (n == null ? '' : String(Number(n)));

export function SpareRecycling() {
  const live = supabaseConfigured();
  const audit = useAuditMode();
  const { can } = useAuth();
  const mayRegister = can('recycle.register');
  const mayRequest = can('recycle.request');
  const mayIssue = can('recycle.issue');
  const mayClose = can('recycle.close');
  const parts = useSpareParts(live && !audit.on);

  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<RecycleRequest[]>([]);
  const [mrs, setMrs] = useState<RecycleMrsLine[]>([]);
  const [stock, setStock] = useState<RecycleHandStock[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    if (!live || audit.on) return;
    setBusy(true); setErr('');
    try {
      const [r, m, s] = await Promise.all([listRecycleRequests(), listRecycleMrs(), listRecycleHandStock()]);
      setRequests(r); setMrs(m); setStock(s);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (audit.known) void load(); }, [audit.known, audit.on]);

  // ---- register / edit a request ------------------------------------------
  const blank = { part: '', serial: '', qty: '1', received_on: todayLocal(), received_from: '', call_ref: '', remarks: '' };
  const [regOpen, setRegOpen] = useState(false);
  const [reg, setReg] = useState(blank);
  const saveReg = async () => {
    const p = splitPart(reg.part);
    const qty = Number(reg.qty);
    if (!p.code) { setErr('Pick the defective part.'); return; }
    if (!(qty > 0)) { setErr('Quantity must be more than 0.'); return; }
    const res = await addRecycleRequest({
      part_code: p.code, part_description: p.description, serial: reg.serial.trim(), qty,
      received_on: reg.received_on, received_from: reg.received_from.trim(), call_ref: reg.call_ref.trim(), remarks: reg.remarks.trim(),
    });
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setRegOpen(false); setReg(blank); setErr('');
    setMsg(`Registered ${res.data?.rcy_no ?? ''}.`);
    void load();
  };

  // ---- the request window: job done, consumption, costs, close -------------
  const [open, setOpen] = useState<RecycleRequest | null>(null);
  const [jobDone, setJobDone] = useState('');
  const [cons, setCons] = useState<RecycleConsumption[]>([]);
  const [costs, setCosts] = useState<RecycleCost[]>([]);
  const [consPart, setConsPart] = useState('');
  const [consQty, setConsQty] = useState('1');
  const [costType, setCostType] = useState('Labour');
  const [costDesc, setCostDesc] = useState('');
  const [costAmt, setCostAmt] = useState('');
  const [closeAs, setCloseAs] = useState<'' | 'Returned' | 'Not recyclable'>('');
  const [reason, setReason] = useState('');
  const [retQty, setRetQty] = useState('');
  const loadOpen = async (r: RecycleRequest) => {
    try {
      const [c, o] = await Promise.all([listRecycleConsumption(r.id), listRecycleCosts(r.id)]);
      setCons(c); setCosts(o);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const openRequest = (r: RecycleRequest) => {
    setOpen(r); setJobDone(r.job_done); setCloseAs(''); setReason(''); setRetQty(qtyText(r.qty));
    setConsPart(''); setConsQty('1'); setCostDesc(''); setCostAmt(''); setErr('');
    void loadOpen(r);
  };
  const refreshOpen = async (id: number) => {
    await load();
    const all = await listRecycleRequests().catch(() => [] as RecycleRequest[]);
    const r = all.find((x) => x.id === id) ?? null;
    setOpen(r);
    if (r) void loadOpen(r);
  };
  // The consumer's own recycling hand stock, part by part — what can be consumed.
  const myStock = useMemo(() => stock.filter((s) => Number(s.balance) > 0), [stock]);
  const isOpen = open?.status === 'Open';

  const saveJobDone = async () => {
    if (!open) return;
    const res = await updateRecycleRequest(open.id, { job_done: jobDone });
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setMsg('Job done saved.'); void refreshOpen(open.id);
  };
  const consume = async () => {
    if (!open) return;
    const qty = Number(consQty);
    if (!consPart || !(qty > 0)) { setErr('Pick a part from your recycling hand stock and a quantity.'); return; }
    const res = await addRecycleConsumption(open.id, consPart, qty);
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setConsPart(''); setConsQty('1'); setErr(''); void refreshOpen(open.id);
  };
  const addCost = async () => {
    if (!open) return;
    const amt = Number(costAmt);
    if (!(amt >= 0) || costAmt.trim() === '') { setErr('Enter the amount.'); return; }
    const res = await addRecycleCost(open.id, costType, costDesc.trim(), amt);
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setCostDesc(''); setCostAmt(''); setErr(''); void refreshOpen(open.id);
  };
  const closeRequest = async () => {
    if (!open || !closeAs) return;
    const patch: Partial<RecycleRequest> = { job_done: jobDone, status: closeAs };
    if (closeAs === 'Returned') patch.returned_qty = Number(retQty) || open.qty;
    else patch.not_recyclable_reason = reason.trim();
    const res = await updateRecycleRequest(open.id, patch);
    if (!res.ok) { setErr(res.error ?? 'Not closed.'); return; }
    setMsg(closeAs === 'Returned'
      ? `${open.rcy_no} closed — returned to the Service Store as R${open.part_code}.`
      : `${open.rcy_no} closed — not recyclable.`);
    void refreshOpen(open.id);
  };

  // ---- MRS: raise (no approval) and stock out with cost ---------------------
  const [mrsOpen, setMrsOpen] = useState(false);
  const [mrsFor, setMrsFor] = useState('');
  const [mrsRemarks, setMrsRemarks] = useState('');
  const [mrsLines, setMrsLines] = useState<{ part: string; qty: string }[]>([{ part: '', qty: '1' }]);
  const saveMrs = async () => {
    const lines = mrsLines.map((l) => ({ ...splitPart(l.part), qty: Number(l.qty) })).filter((l) => l.code);
    if (!lines.length) { setErr('Add at least one part.'); return; }
    if (lines.some((l) => !(l.qty > 0))) { setErr('Every quantity must be more than 0.'); return; }
    const req = requests.find((r) => r.rcy_no === mrsFor);
    const res = await raiseRecycleMrs(req ? req.id : null, mrsRemarks.trim(),
      lines.map((l) => ({ part_code: l.code, part_description: l.description, qty: l.qty })));
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setMrsOpen(false); setMrsFor(''); setMrsRemarks(''); setMrsLines([{ part: '', qty: '1' }]); setErr('');
    setMsg(`Raised ${res.data}. Stores can now book it out.`);
    void load();
  };
  const [issueLine, setIssueLine] = useState<RecycleMrsLine | null>(null);
  const [issueQty, setIssueQty] = useState('');
  const [issueCost, setIssueCost] = useState('');
  const saveIssue = async () => {
    if (!issueLine) return;
    const qty = Number(issueQty); const cost = Number(issueCost);
    if (!(qty > 0)) { setErr('Quantity must be more than 0.'); return; }
    if (issueCost.trim() === '' || !(cost >= 0)) { setErr('Enter the unit cost.'); return; }
    const res = await issueRecycleLine(issueLine.line_id, qty, cost);
    if (!res.ok) { setErr(res.error ?? 'Not saved.'); return; }
    setMsg(`Booked out ${qty} × ${issueLine.part_code} at ${money(cost)} each to ${issueLine.requested_for_name}'s recycling hand stock.`);
    setIssueLine(null); setErr(''); void load();
  };

  // ---- columns --------------------------------------------------------------
  const reqCols: Column<RecycleRequest>[] = [
    { key: '_open', header: '', width: 70, render: (r) => <button className="btn btn-sm" onClick={() => openRequest(r)}>Open</button> },
    { key: 'rcy_no', header: 'Recycling No.', width: 120 },
    { key: 'received_on', header: 'Received', width: 110, render: (r) => formatDay(r.received_on), accessor: (r) => r.received_on },
    { key: 'part_code', header: 'Part Code', width: 120 },
    { key: 'part_description', header: 'Description', width: 200 },
    { key: 'serial', header: 'Serial', width: 100 },
    { key: 'qty', header: 'Qty', width: 60, align: 'right' },
    { key: 'call_ref', header: 'Call Ref', width: 110 },
    { key: 'received_from', header: 'Received From', width: 130 },
    { key: 'status', header: 'Status', width: 120,
      render: (r) => <span className={`badge badge-${r.status === 'Open' ? 'warning' : r.status === 'Returned' ? 'success' : 'neutral'}`}>{r.status}</span> },
    { key: 'returned_part_code', header: 'Returned As', width: 120 },
    { key: 'parts_cost', header: 'Parts Cost', width: 110, align: 'right', render: (r) => money(r.parts_cost), accessor: (r) => Number(r.parts_cost) },
    { key: 'other_cost', header: 'Other Cost', width: 110, align: 'right', render: (r) => money(r.other_cost), accessor: (r) => Number(r.other_cost) },
    { key: 'total_cost', header: 'Total Cost', width: 110, align: 'right', render: (r) => <b>{money(r.total_cost)}</b>, accessor: (r) => Number(r.total_cost) },
    { key: 'created_by_name', header: 'Registered By', width: 130 },
  ];
  const mrsCols: Column<RecycleMrsLine>[] = [
    { key: '_issue', header: '', width: 100, render: (l) => (mayIssue && l.qty_pending > 0
      ? <button className="btn btn-sm btn-primary" onClick={() => { setIssueLine(l); setIssueQty(qtyText(l.qty_pending)); setIssueCost(''); }}>Stock Out</button>
      : null) },
    { key: 'mrs_no', header: 'MRS No.', width: 120 },
    { key: 'created_at', header: 'Raised', width: 150, render: (l) => formatDayTime(l.created_at), accessor: (l) => l.created_at },
    { key: 'rcy_no', header: 'For Request', width: 120 },
    { key: 'requested_for_name', header: 'Hand Stock Of', width: 140 },
    { key: 'part_code', header: 'Part Code', width: 120 },
    { key: 'part_description', header: 'Description', width: 200 },
    { key: 'qty_requested', header: 'Asked', width: 70, align: 'right' },
    { key: 'qty_issued', header: 'Issued', width: 70, align: 'right' },
    { key: 'qty_pending', header: 'Pending', width: 70, align: 'right' },
    { key: 'cost_issued', header: 'Issued Cost', width: 110, align: 'right', render: (l) => money(l.cost_issued), accessor: (l) => Number(l.cost_issued) },
    { key: 'status', header: 'Status', width: 110 },
  ];
  const stockCols: Column<RecycleHandStock>[] = [
    { key: 'holder_name', header: 'Hand Stock Of', width: 150 },
    { key: 'part_code', header: 'Part Code', width: 120 },
    { key: 'part_description', header: 'Description', width: 220 },
    { key: 'issued', header: 'Issued', width: 80, align: 'right' },
    { key: 'consumed', header: 'Consumed', width: 90, align: 'right' },
    { key: 'balance', header: 'Balance', width: 80, align: 'right', render: (s) => <b>{qtyText(s.balance)}</b>, accessor: (s) => Number(s.balance) },
    { key: 'avg_unit_cost', header: 'Avg Unit Cost', width: 110, align: 'right', render: (s) => money(s.avg_unit_cost), accessor: (s) => Number(s.avg_unit_cost ?? 0) },
  ];

  const totals = useMemo(() => requests.reduce((a, r) => ({
    parts: a.parts + Number(r.parts_cost || 0), other: a.other + Number(r.other_cost || 0),
    issued: a.issued + Number(r.issued_cost || 0),
  }), { parts: 0, other: 0, issued: 0 }), [requests]);

  // ---- the page -------------------------------------------------------------
  if (!audit.known) return <div style={{ padding: 32 }} className="muted">Loading…</div>;
  if (audit.on) {
    return (
      <div style={{ padding: 32 }} className="muted">
        Spare Recycling is not available while Audit Mode is on.
      </div>
    );
  }
  if (!live) return <div style={{ padding: 32 }} className="muted">Spare Recycling needs the database connection.</div>;

  const partOptions = parts.all;
  const openReqNos = requests.filter((r) => r.status === 'Open').map((r) => r.rcy_no);

  return (
    <div>
      <PageHeader
        title="Spare Recycling" icon="♻️"
        subtitle="Defective spares recycled on a separate track — its own MRS, stock out with cost, recycling hand stock and consumption. Nothing here touches calls, the spare module or the regular hand stock."
        count={tab === 'requests' ? requests.length : tab === 'mrs' ? mrs.length : tab === 'stock' ? stock.length : requests.length}
        onRefresh={() => void load()} refreshing={busy}
        actions={
          <div className="row" style={{ gap: 8 }}>
            {mayRegister && <button className="btn btn-primary" onClick={() => { setReg(blank); setRegOpen(true); }}>+ Register defective spare</button>}
            {mayRequest && <button className="btn" onClick={() => setMrsOpen(true)}>+ Raise MRS</button>}
          </div>
        }
      />
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      {msg && !err && <div className="sheet-banner"><span>{msg}</span></div>}

      <div className="row" style={{ gap: 6, margin: '8px 0' }}>
        {([['requests', 'Recycling Requests'], ['mrs', 'MRS & Stock Out'], ['stock', 'Recycling Hand Stock'], ['cost', 'Cost']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={`btn btn-sm${tab === k ? ' btn-primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'requests' && (
        <DataTable<RecycleRequest>
          columns={reqCols} rows={requests} getRowId={(r) => String(r.id)} storageKey="recycle-requests" dense
          emptyText={busy ? 'Loading…' : 'No recycling requests yet.'}
          toolbar={<Toolbar>
            <button className="btn btn-sm" onClick={() => csvExport('recycling-requests.csv',
              reqCols.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })),
              requests as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Export CSV</button>
          </Toolbar>}
        />
      )}
      {tab === 'mrs' && (
        <DataTable<RecycleMrsLine>
          columns={mrsCols} rows={mrs} getRowId={(l) => String(l.line_id)} storageKey="recycle-mrs" dense
          emptyText={busy ? 'Loading…' : 'No MRS raised yet.'}
          toolbar={<Toolbar>
            <button className="btn btn-sm" onClick={() => csvExport('recycling-mrs.csv',
              mrsCols.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })),
              mrs as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Export CSV</button>
          </Toolbar>}
        />
      )}
      {tab === 'stock' && (
        <DataTable<RecycleHandStock>
          columns={stockCols} rows={stock} getRowId={(s) => `${s.holder}|${s.part_code}`} storageKey="recycle-stock" dense
          emptyText={busy ? 'Loading…' : 'Nothing has been booked out to a recycling hand stock yet.'}
        />
      )}
      {tab === 'cost' && (
        <SectionCard title="What recycling has cost">
          <table className="obj-table" style={{ maxWidth: 520 }}>
            <tbody>
              <tr><td>Parts consumed (valued at their stock-out cost)</td><td className="obj-num">{money(totals.parts)}</td></tr>
              <tr><td>Other costs (labour, courier, vendor, other)</td><td className="obj-num">{money(totals.other)}</td></tr>
              <tr><td><b>Total spent on recycling</b></td><td className="obj-num"><b>{money(totals.parts + totals.other)}</b></td></tr>
              <tr><td className="muted">Stock booked out on MRSs raised for a request</td><td className="obj-num muted">{money(totals.issued)}</td></tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5 }}>
            Each request's own figures are on the Recycling Requests tab (Parts Cost, Other Cost, Total Cost).
            A part is valued at the average cost it was booked out at to that hand stock.
          </p>
        </SectionCard>
      )}

      {/* ---- register ---- */}
      <Modal open={regOpen} onClose={() => setRegOpen(false)} title="Register a defective spare for recycling" width={560}>
        <div className="field"><label className="field-label">Defective part *</label>
          <SelectPicker value={reg.part} onChange={(v) => setReg((d) => ({ ...d, part: v }))} options={partOptions} placeholder="Pick from Part Master" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}><label className="field-label">Serial</label>
            <input className="input" value={reg.serial} onChange={(e) => setReg((d) => ({ ...d, serial: e.target.value }))} /></div>
          <div className="field" style={{ width: 90 }}><label className="field-label">Qty *</label>
            <input className="input" type="number" min="1" value={reg.qty} onChange={(e) => setReg((d) => ({ ...d, qty: e.target.value }))} /></div>
          <div className="field" style={{ width: 170 }}><label className="field-label">Received on *</label>
            <LongDateInput value={reg.received_on} onChange={(v) => setReg((d) => ({ ...d, received_on: v }))} /></div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}><label className="field-label">Received from</label>
            <input className="input" value={reg.received_from} onChange={(e) => setReg((d) => ({ ...d, received_from: e.target.value }))} /></div>
          <div className="field" style={{ flex: 1 }}><label className="field-label">Call reference (optional)</label>
            <input className="input" placeholder="UCN or call number" value={reg.call_ref} onChange={(e) => setReg((d) => ({ ...d, call_ref: e.target.value }))} /></div>
        </div>
        <div className="field"><label className="field-label">Remarks</label>
          <textarea className="input" rows={2} value={reg.remarks} onChange={(e) => setReg((d) => ({ ...d, remarks: e.target.value }))} /></div>
        <p className="muted" style={{ fontSize: 12 }}>The call reference is kept as text only — nothing on the call changes.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setRegOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void saveReg()}>Register</button>
        </div>
      </Modal>

      {/* ---- raise MRS ---- */}
      <Modal open={mrsOpen} onClose={() => setMrsOpen(false)} title="Raise an MRS (Material Request Slip)" width={600}>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          No approval. Stores books it out with the cost, into <b>your</b> recycling hand stock.
        </p>
        <div className="field"><label className="field-label">For recycling request (optional)</label>
          <SelectPicker value={mrsFor} onChange={setMrsFor} options={['', ...openReqNos]} placeholder="— none —" /></div>
        {mrsLines.map((l, i) => (
          <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}><label className="field-label">Part {i + 1}</label>
              <SelectPicker value={l.part} onChange={(v) => setMrsLines((ls) => ls.map((x, j) => (j === i ? { ...x, part: v } : x)))} options={partOptions} placeholder="Pick from Part Master" /></div>
            <div className="field" style={{ width: 80 }}><label className="field-label">Qty</label>
              <input className="input" type="number" min="1" value={l.qty} onChange={(e) => setMrsLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></div>
            {mrsLines.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setMrsLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setMrsLines((ls) => [...ls, { part: '', qty: '1' }])}>+ Add part</button>
        <div className="field" style={{ marginTop: 8 }}><label className="field-label">Remarks</label>
          <input className="input" value={mrsRemarks} onChange={(e) => setMrsRemarks(e.target.value)} /></div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setMrsOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void saveMrs()}>Raise MRS</button>
        </div>
      </Modal>

      {/* ---- stock out with cost ---- */}
      <Modal open={!!issueLine} onClose={() => setIssueLine(null)} title={`Stock out — ${issueLine?.mrs_no ?? ''}`} width={460}>
        {issueLine && (<>
          <p style={{ marginTop: 0 }}><b>{issueLine.part_code}</b> {issueLine.part_description}<br />
            <span className="muted">Asked {qtyText(issueLine.qty_requested)}, issued {qtyText(issueLine.qty_issued)}, pending {qtyText(issueLine.qty_pending)} · to {issueLine.requested_for_name}&rsquo;s recycling hand stock</span></p>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ width: 110 }}><label className="field-label">Qty *</label>
              <input className="input" type="number" min="0" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label className="field-label">Unit cost (₹) *</label>
              <input className="input" type="number" min="0" step="0.01" value={issueCost} onChange={(e) => setIssueCost(e.target.value)} /></div>
          </div>
          {Number(issueQty) > 0 && issueCost !== '' && <p className="muted">Line cost: {money(Number(issueQty) * Number(issueCost))}</p>}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setIssueLine(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void saveIssue()}>Book stock out</button>
          </div>
        </>)}
      </Modal>

      {/* ---- the request ---- */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.rcy_no} — ${open.part_code}` : ''} width={760}>
        {open && (<>
          <p style={{ marginTop: 0 }}>
            <b>{open.part_code}</b> {open.part_description}{open.serial && <> · Serial {open.serial}</>} · Qty {qtyText(open.qty)}
            <br /><span className="muted">Received {formatDay(open.received_on)}{open.received_from && <> from {open.received_from}</>}
              {open.call_ref && <> · Call ref {open.call_ref}</>} · Registered by {open.created_by_name}</span>
            {open.remarks && <><br /><span className="muted">{open.remarks}</span></>}
          </p>
          <p><span className={`badge badge-${open.status === 'Open' ? 'warning' : open.status === 'Returned' ? 'success' : 'neutral'}`}>{open.status}</span>
            {open.status === 'Returned' && <> Returned to the Service Store as <b>{open.returned_part_code}</b> × {qtyText(open.returned_qty)} on {formatDay(open.returned_on)}</>}
            {open.status === 'Not recyclable' && <> {open.not_recyclable_reason}</>}
            {open.closed_at && <span className="muted"> · closed {formatDayTime(open.closed_at)} by {open.closed_by_name}</span>}
          </p>

          <div className="field"><label className="field-label">Job done</label>
            <textarea className="input" rows={3} value={jobDone} disabled={!isOpen || !(mayRegister || mayClose)} onChange={(e) => setJobDone(e.target.value)} /></div>
          {isOpen && (mayRegister || mayClose) && jobDone !== open.job_done && (
            <button className="btn btn-sm" onClick={() => void saveJobDone()}>Save job done</button>)}

          <h4 style={{ marginBottom: 4 }}>Spares consumed (from the recycling hand stock)</h4>
          <table className="obj-table"><thead><tr><th>Part</th><th className="obj-num">Qty</th><th className="obj-num">Unit cost</th><th className="obj-num">Value</th><th>By</th><th /></tr></thead>
            <tbody>
              {cons.map((c) => (<tr key={c.id}><td>{c.part_code}</td><td className="obj-num">{qtyText(c.qty)}</td>
                <td className="obj-num">{money(c.avg_unit_cost)}</td><td className="obj-num">{money(c.value)}</td>
                <td>{c.holder_name} · {formatDayTime(c.consumed_at)}</td>
                <td>{isOpen && mayClose && <button className="btn btn-ghost btn-sm" onClick={() => void deleteRecycleConsumption(c.id).then((r) => { if (!r.ok) setErr(r.error ?? ''); void refreshOpen(open.id); })}>✕</button>}</td></tr>))}
              {!cons.length && <tr><td colSpan={6} className="muted">Nothing consumed yet.</td></tr>}
            </tbody></table>
          {isOpen && mayClose && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
              <div className="field" style={{ flex: 1 }}><label className="field-label">From your recycling hand stock</label>
                <SelectPicker value={consPart} onChange={setConsPart}
                  options={myStock.map((s) => ({ value: s.part_code, label: `${s.part_code} — ${s.part_description} (balance ${qtyText(s.balance)}, ${s.holder_name})` }))}
                  placeholder={myStock.length ? 'Pick a part' : 'Nothing in a recycling hand stock'} /></div>
              <div className="field" style={{ width: 80 }}><label className="field-label">Qty</label>
                <input className="input" type="number" min="0" value={consQty} onChange={(e) => setConsQty(e.target.value)} /></div>
              <button className="btn btn-sm" onClick={() => void consume()}>Consume</button>
            </div>)}

          <h4 style={{ marginBottom: 4 }}>Other costs</h4>
          <table className="obj-table"><thead><tr><th>Type</th><th>Description</th><th className="obj-num">Amount</th><th>By</th><th /></tr></thead>
            <tbody>
              {costs.map((o) => (<tr key={o.id}><td>{o.cost_type}</td><td>{o.description}</td><td className="obj-num">{money(o.amount)}</td>
                <td>{o.created_by_name} · {formatDayTime(o.created_at)}</td>
                <td>{isOpen && mayClose && <button className="btn btn-ghost btn-sm" onClick={() => void deleteRecycleCost(o.id).then((r) => { if (!r.ok) setErr(r.error ?? ''); void refreshOpen(open.id); })}>✕</button>}</td></tr>))}
              {!costs.length && <tr><td colSpan={5} className="muted">No other costs.</td></tr>}
            </tbody></table>
          {isOpen && mayClose && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
              <div className="field" style={{ width: 130 }}><label className="field-label">Type</label>
                <SelectPicker value={costType} onChange={setCostType} options={COST_TYPES} /></div>
              <div className="field" style={{ flex: 1 }}><label className="field-label">Description</label>
                <input className="input" value={costDesc} onChange={(e) => setCostDesc(e.target.value)} /></div>
              <div className="field" style={{ width: 120 }}><label className="field-label">Amount (₹)</label>
                <input className="input" type="number" min="0" step="0.01" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} /></div>
              <button className="btn btn-sm" onClick={() => void addCost()}>Add cost</button>
            </div>)}

          <p style={{ marginTop: 12 }}>
            Parts {money(open.parts_cost)} + other {money(open.other_cost)} = <b>{money(open.total_cost)}</b>
            <span className="muted"> · stock booked out on MRSs for this request {money(open.issued_cost)}</span>
          </p>

          {isOpen && mayClose && (
            <div className="obj-ovr-box">
              <div className="field-label">Close this request</div>
              <label className="obj-ovr-choice"><input type="radio" name="close" checked={closeAs === 'Returned'} onChange={() => setCloseAs('Returned')} />
                {' '}<b>Returned to Service Store</b> as <b>R{open.part_code}</b></label>
              {closeAs === 'Returned' && (
                <div className="field" style={{ width: 120, marginLeft: 22 }}><label className="field-label">Qty returned</label>
                  <input className="input" type="number" min="0" value={retQty} onChange={(e) => setRetQty(e.target.value)} /></div>)}
              <label className="obj-ovr-choice"><input type="radio" name="close" checked={closeAs === 'Not recyclable'} onChange={() => setCloseAs('Not recyclable')} />
                {' '}<b>Not recyclable</b> (scrapped)</label>
              {closeAs === 'Not recyclable' && (
                <div className="field" style={{ marginLeft: 22 }}><label className="field-label">Reason *</label>
                  <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>)}
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" disabled={!closeAs || !jobDone.trim()} onClick={() => void closeRequest()}>Close request</button>
              </div>
              {!jobDone.trim() && <div className="field-help">Record the job done first.</div>}
            </div>)}
        </>)}
      </Modal>
    </div>
  );
}
