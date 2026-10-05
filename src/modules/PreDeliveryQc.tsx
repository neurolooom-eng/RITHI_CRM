// ===========================================================================
// PRE-DELIVERY QUALITY CHECK (0377, 2026-10-05) -- under Indoor Service.
//
// The user: "Imported Machines are received in Godown. It is done before
// Billing. It is done as per the Record. There are certain Checks. Use the
// Image for Fields, Ensure all the Fields are Mandatory." Their answers: its
// OWN register (no Indoor job), ANY product, RECORD ONLY (billing is not
// blocked), and the SAME checks and tables as R/SER/QC/007 -- so the form is
// built from PDT_CHECKS / PDT_MODES and prints through the same PdtSheet.
//
// EVERY FIELD IS MANDATORY: Save stays refused until each one is filled, and
// the database refuses a blank one on any path. Whoever saves is the
// inspector -- the database stamps the name and designation from the session.
// A quality record: there is no delete.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Modal, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SelectPicker } from '../components/ui/SelectPicker';
import { LongDateInput } from '../components/ui/LongDate';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { csvExport } from '../lib/format';
import { COMPLETE } from '../lib/exportscope';
import { PDT_CHECKS, PDT_FIO2, PDT_MODES } from '../lib/indoorforms';
import {
  listPdqcRecords, listProductMasterNames, savePdqcRecord, supabaseConfigured,
  type PdqcRecord,
} from '../lib/supabase';
import './fieldcalls.css';
import './dccr.css';

type Draft = Record<string, string>;

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'measuring_equipment_id', label: 'Measuring Equipment ID No' },
  { key: 'software_version', label: 'Software Version' },
  { key: 'hv', label: 'HV' },
  { key: 'ht', label: 'HT' },
];
const CHECK_KEYS = PDT_CHECKS.filter((c) => c.key).map((c) => c.key!) as string[];
const NUM_KEYS = PDT_MODES.flatMap((m) => m.rows.flatMap((r) => r.keys)) as string[];

const blankDraft = (): Draft => ({ product_name: '', serial: '', test_date: todayLocal() });
const toDraft = (r: PdqcRecord): Draft => {
  const d: Draft = {};
  for (const [k, v] of Object.entries(r)) d[k] = v == null ? '' : String(v);
  return d;
};

/** Every field the form owes, named the way the form names it, when blank. */
function missing(d: Draft): string[] {
  const out: string[] = [];
  if (!d.product_name?.trim()) out.push('Product Name');
  if (!d.serial?.trim()) out.push('SL. No');
  if (!d.test_date) out.push('Date');
  TEXT_FIELDS.forEach((f) => { if (!d[f.key]?.trim()) out.push(f.label); });
  const unchecked = PDT_CHECKS.filter((c) => c.key && !d[c.key]).map((c) => c.no);
  if (unchecked.length) out.push(`check ${unchecked.join(', ')}`);
  PDT_MODES.forEach((m) => m.rows.forEach((r) => r.keys.forEach((k, i) => {
    const v = d[k];
    if (v == null || v.trim() === '' || Number.isNaN(Number(v))) out.push(`${m.no}. ${r.label} at FiO2 ${PDT_FIO2[i]}%`);
  })));
  return out;
}
const notOkOf = (r: Record<string, unknown>) => PDT_CHECKS.filter((c) => c.key && r[c.key] === 'NOT OK').map((c) => c.no);

export function PreDeliveryQc() {
  const live = supabaseConfigured();
  const navigate = useNavigate();
  const { can } = useAuth();
  const mayRecord = can('pdqc.record');
  const [rows, setRows] = useState<PdqcRecord[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setBusy(true); setErr('');
    try { setRows(await listPdqcRecords()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!live) return;
    void load();
    listProductMasterNames().then(setProducts).catch(() => setProducts([]));
  }, [live]);

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const gaps = missing(draft);
  const draftNotOk = notOkOf(draft);

  const startNew = () => { setEditId(null); setDraft(blankDraft()); setFormErr(''); setOpen(true); };
  const startEdit = (r: PdqcRecord) => { setEditId(r.id); setDraft(toDraft(r)); setFormErr(''); setOpen(true); };

  const save = async () => {
    if (gaps.length) { setFormErr(`Every field is mandatory. Still blank: ${gaps.join(', ')}.`); return; }
    const row: Record<string, unknown> = {
      product_name: draft.product_name.trim(), serial: draft.serial.trim(), test_date: draft.test_date,
    };
    TEXT_FIELDS.forEach((f) => { row[f.key] = draft[f.key].trim(); });
    CHECK_KEYS.forEach((k) => { row[k] = draft[k]; });
    NUM_KEYS.forEach((k) => { row[k] = Number(draft[k]); });
    setSaving(true);
    const r = await savePdqcRecord(editId, row as Partial<PdqcRecord>);
    setSaving(false);
    if (!r.ok || !r.data) { setFormErr(r.error ?? 'Could not save.'); return; }
    logAudit({ action: editId == null ? 'pdqc.create' : 'pdqc.update', target: `${r.data.product_name} ${r.data.serial}`, status: 'ok',
      meta: { id: r.data.id, notOk: notOkOf(r.data as unknown as Record<string, unknown>) } });
    setOpen(false);
    void load();
  };

  const cols: Column<PdqcRecord>[] = useMemo(() => [
    { key: 'test_date', header: 'Date', width: 110, render: (r) => formatDay(r.test_date) },
    { key: 'product_name', header: 'Product Name', width: 180 },
    { key: 'serial', header: 'SL. No', width: 130, render: (r) => <span className="mono">{r.serial}</span> },
    { key: '_result', header: 'Checks 1–5', width: 150, render: (r) => {
      const n = notOkOf(r as unknown as Record<string, unknown>);
      return n.length
        ? <span className="badge badge-danger">Check {n.join(', ')} NOT OK</span>
        : <span className="badge badge-success">All OK</span>;
    } },
    { key: 'measuring_equipment_id', header: 'Measuring Equipment ID', width: 150 },
    { key: 'software_version', header: 'Software Version', width: 120 },
    { key: 'inspector_name', header: 'Inspected By', width: 150,
      render: (r) => <>{r.inspector_name}{r.inspector_designation ? <span className="muted">, {r.inspector_designation}</span> : null}</> },
    { key: 'inspected_at', header: 'Saved', width: 150, render: (r) => formatDayTime(r.inspected_at) },
    { key: '_print', header: '', width: 90, render: (r) => (
      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/indoor-pdqc/${r.id}`); }}>🖨 Print</button>
    ) },
  ], [navigate]);

  if (!live) return <div style={{ padding: 32 }} className="muted">Pre-Delivery Quality Check needs the database connection.</div>;

  const ro = !mayRecord;
  return (
    <div>
      <PageHeader
        title="Pre-Delivery Quality Check" icon="✅"
        subtitle="Imported machines in the godown, checked before billing as per R/SER/QC/007. Every field is mandatory. A record only — billing is not blocked."
        count={rows.length}
        onRefresh={() => void load()} refreshing={busy}
        actions={mayRecord ? <button className="btn btn-primary" onClick={startNew}>+ New check</button> : null}
      />
      {err && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{err}</div>}
      <DataTable<PdqcRecord>
        columns={cols} rows={rows} getRowId={(r) => String(r.id)} storageKey="pdqc-records" dense
        onRowClick={(r) => startEdit(r)}
        emptyText={busy ? 'Loading…' : 'No Pre-Delivery Quality Checks recorded yet.'}
        toolbar={<Toolbar>
          <button className="btn btn-sm" onClick={() => csvExport('pre-delivery-quality-checks.csv',
            [{ key: 'test_date', header: 'Date' }, { key: 'product_name', header: 'Product Name' }, { key: 'serial', header: 'SL. No' },
             ...TEXT_FIELDS.map((f) => ({ key: f.key, header: f.label })),
             ...PDT_CHECKS.filter((c) => c.key).map((c) => ({ key: c.key!, header: `Check ${c.no}` })),
             ...PDT_MODES.flatMap((m) => m.rows.flatMap((r) => r.keys.map((k, i) => ({ key: k, header: `${m.no === 7 ? 'CMV' : 'PCMV'} ${r.label} FiO2 ${PDT_FIO2[i]}%` })))),
             { key: 'inspector_name', header: 'Inspected By' }, { key: 'inspector_designation', header: 'Designation' },
             { key: 'inspected_at', header: 'Saved' }],
            rows as unknown as Record<string, unknown>[], COMPLETE)}>⭳ Export CSV</button>
        </Toolbar>}
      />

      <Modal open={open} onClose={() => setOpen(false)} width={900}
        title={editId == null ? 'New Pre-Delivery Quality Check · R/SER/QC/007' : `Pre-Delivery Quality Check · ${draft.product_name} ${draft.serial}`}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 2, minWidth: 220 }}><label className="field-label">Product Name *</label>
            <SelectPicker value={draft.product_name} onChange={(v) => set('product_name', v)} options={products}
              placeholder="Pick from Product Master" disabled={ro} /></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label className="field-label">SL. No *</label>
            <input className="input" value={draft.serial} disabled={ro} onChange={(e) => set('serial', e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label className="field-label">Date *</label>
            <LongDateInput value={draft.test_date} disabled={ro} onChange={(v) => set('test_date', v)} /></div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {TEXT_FIELDS.map((f) => (
            <div className="field" key={f.key} style={{ flex: 1, minWidth: 160 }}><label className="field-label">{f.label} *</label>
              <input className="input" value={draft[f.key] ?? ''} disabled={ro} onChange={(e) => set(f.key, e.target.value)} /></div>
          ))}
        </div>

        <table className="table" style={{ marginTop: 8 }}>
          <thead><tr><th style={{ width: 50 }}>S.No</th><th>Description</th><th style={{ width: 160 }}>OK / NOT OK *</th></tr></thead>
          <tbody>
            {PDT_CHECKS.map((c) => (
              <tr key={c.no}>
                <td>{c.no}.</td><td>{c.text}</td>
                <td>{c.key
                  ? <SelectPicker value={draft[c.key] ?? ''} options={['OK', 'NOT OK']} disabled={ro} onChange={(v) => set(c.key!, v)} />
                  : <span className="muted">instruction — not judged</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {PDT_MODES.map((m) => (
          <table className="table" key={m.no} style={{ marginTop: 8 }}>
            <thead>
              <tr><th colSpan={4}>{m.no}. {m.settings}</th></tr>
              <tr><th />{PDT_FIO2.map((f) => <th key={f}>At FiO2 {f}% *</th>)}</tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.label}>
                  <td><b>{r.label}</b></td>
                  {r.keys.map((k, i) => (
                    <td key={k}><input className="input" type="number" step="any" aria-label={`${r.label} at FiO2 ${PDT_FIO2[i]}%`}
                      value={draft[k] ?? ''} disabled={ro} onChange={(e) => set(k, e.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        <p className="muted" style={{ marginTop: 8 }}>
          <b>Inspected by:</b>{' '}
          {editId != null && draft.inspector_name
            ? <>{draft.inspector_name}{draft.inspector_designation ? `, ${draft.inspector_designation}` : ''} · {formatDayTime(draft.inspected_at)}. </>
            : null}
          {mayRecord ? 'Saving signs the record as you, with your designation from the User Master.' : ''}
        </p>
        {draftNotOk.length > 0 && (
          <div className="alert alert-warning">Check {draftNotOk.join(', ')} reads NOT OK. It is recorded as it is — billing is not blocked.</div>
        )}
        {formErr && <div className="alert alert-danger">{formErr}</div>}
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {editId != null && <button className="btn" onClick={() => navigate(`/indoor-pdqc/${editId}`)}>🖨 Print</button>}
          <button className="btn" onClick={() => setOpen(false)}>{ro ? 'Close' : 'Cancel'}</button>
          {mayRecord && (
            <button className="btn btn-primary" disabled={saving || gaps.length > 0}
              title={gaps.length ? `Still blank: ${gaps.join(', ')}` : ''} onClick={() => void save()}>
              {saving ? 'Saving…' : editId == null ? 'Save and sign' : 'Save changes and sign'}
            </button>
          )}
        </div>
        {mayRecord && gaps.length > 0 && <p className="muted" style={{ textAlign: 'right' }}>{gaps.length} field{gaps.length === 1 ? '' : 's'} still blank.</p>}
      </Modal>
    </div>
  );
}
