import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, Toolbar, SearchBox, Modal } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { DataTable, type Column } from '../components/table/DataTable';
import { getSupabase, supabaseConfigured, deleteMasterRecord } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { csvExport, fmtLongDate } from '../lib/format';
import './fieldcalls.css';
import './knowledgebase.css';
import { COMPLETE } from '../lib/exportscope';
import { todayLocal } from '../lib/dates';

// ===========================================================================
// PRODUCT MASTER — the catalogue of product LINES.
//
// The user, 2026-09-14: "Add a Separate Product Master - Which is the Actual
// List of Product Lines along with all Details -- With Active and Inactive
// [All Inactive Products can never have a new Sale Entry, But can still have
// Contract or Calls or Basically everything other than New Sale Entry]".
//
// NOT THE PRODUCT DATABASE, and the two are easy to confuse now that the names
// have swapped:
//
//   Product Database  /product-database   one row per MACHINE — model, serial,
//                                         customer, cover. 20,000-odd rows.
//   Product Master    here                one row per PRODUCT LINE — code,
//                                         type, category, still sold or not.
//                                         53 rows.
//
// WHAT `Active` MEANS, said on the page because it is the whole point of the
// register and it is narrow: an inactive line takes NO NEW SALE ENTRY. It
// still takes contracts, calls, visits, spares and feedback, because the
// machines already out there are still supported. A line stops being sold long
// before it stops being serviced.
// ===========================================================================

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => String(r[k] ?? '').trim();

export function ProductLines() {
  const live = supabaseConfigured();
  const { can, user } = useAuth();
  // IMPORTED (0319) is the one field this screen EDITS, and ＋ Add entry adds a
  // whole line: whoever may write a product line (pm_write asks
  // masters.edit.records, 0290) may do both.
  // ADD, EDIT AND DELETE ARE SEPARATE KEYS (0325, 2026-10-03); "Add / edit
  // master records" still grants the first two.
  const mayAdd = can('masters.product_master.add');
  const mayEdit = can('masters.product_master.edit');
  const mayDelete = can('masters.product_master.delete');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'active' | 'inactive'>('');

  const load = async () => {
    const c = getSupabase();
    if (!c) return;
    setBusy(true); setMsg('');
    const { data, error } = await c.from('product_master').select('*').order('product_name').order('product_code');
    if (error) setMsg(`Could not read the Product Master: ${error.message}`);
    else setRows(data ?? []);
    setBusy(false);
  };
  useEffect(() => { if (live) void load(); }, [live]);

  // Rows COUNTED: row-level security refuses an update by matching nothing,
  // and no error is not "saved" (finding 48).
  const setImported = async (code: string, v: string) => {
    const c = getSupabase();
    if (!c) return;
    const value = v === 'Yes' ? true : v === 'No' ? false : null;
    const { data, error } = await c.from('product_master').update({ imported: value })
      .eq('product_code', code).select('product_code');
    if (error) { setMsg(`Could not save Imported for ${code}: ${error.message}`); return; }
    if (!data || data.length === 0) { setMsg(`Nothing was saved for ${code} — your role may not edit product lines.`); return; }
    setMsg('');
    setRows((all) => all.map((r) => (r.product_code === code ? { ...r, imported: value } : r)));
  };
  // ---- Add entry: the same pop-up form as Part and Party Master -----------
  // PRODUCT CODE AND PRODUCT NAME ARE REQUIRED -- the two this register's own
  // upload requires. The code is the key: one already here is refused by code,
  // not overwritten (the upload is the place to correct a line). Type and
  // Category offer the values the catalogue already uses, so a new line is
  // grouped with its siblings rather than under a new spelling of the same word.
  type Draft = { product_code: string; product_name: string; item_detail: string; item_type: string;
    item_category: string; short_form: string; active: string; imported: string };
  const blankDraft: Draft = { product_code: '', product_name: '', item_detail: '', item_type: '',
    item_category: '', short_form: '', active: 'Active', imported: '' };
  const [adding, setAdding] = useState<Draft | null>(null);
  // EDITING reuses the Add form: the code it was opened on, or null when adding.
  // The code itself is not editable -- it is the line's key, and a machine,
  // sale or contract that names it would be left naming nothing.
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const openEdit = (r: Row) => {
    setEditingCode(s(r, 'product_code'));
    setAdding({
      product_code: s(r, 'product_code'), product_name: s(r, 'product_name'), item_detail: s(r, 'item_detail'),
      item_type: s(r, 'item_type'), item_category: s(r, 'item_category'), short_form: s(r, 'short_form'),
      active: r.active === false ? 'Inactive' : 'Active', imported: importedLabel(r),
    });
    setAddTried(false); setAddErr('');
  };
  const removeLine = async (r: Row) => {
    const code = s(r, 'product_code');
    if (!window.confirm(`Delete ${code} — ${s(r, 'product_name')} from the Product Master?\n\nThis cannot be undone. It is refused while any machine, sale or contract names this code; mark it Inactive instead to stop new sales.`)) return;
    const res = await deleteMasterRecord('product_master', 'product_code', code);
    if (!res.ok) { setMsg(res.error ?? 'Could not delete it.'); return; }
    setMsg('');
    setRows((all) => all.filter((x) => s(x, 'product_code') !== code));
    setNote(`${code} deleted from the Product Master.`);
  };
  const [addTried, setAddTried] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [saving, setSaving] = useState(false);
  const addMissing = (d: Draft) => ([['product_code', 'Product Code'], ['product_name', 'Product Name']] as const)
    .filter(([k]) => !d[k].trim()).map(([, l]) => l);
  const setDraft = (k: keyof Draft, v: string) => setAdding((d) => d && ({ ...d, [k]: v }));
  const used = (k: string) => [...new Set(rows.map((r) => s(r, k)).filter(Boolean))].sort();
  const saveAdd = async () => {
    const c = getSupabase();
    if (!adding || !c) return;
    setAddTried(true);
    const missing = addMissing(adding);
    if (missing.length) { setAddErr(`Fill ${missing.join(', ')}.`); return; }
    const code = adding.product_code.trim();
    if (editingCode) {
      setSaving(true); setAddErr('');
      const { data, error } = await c.from('product_master').update({
        product_name: adding.product_name.trim(),
        item_detail: adding.item_detail.trim(),
        item_type: adding.item_type.trim(),
        item_category: adding.item_category.trim(),
        short_form: adding.short_form.trim(),
        active: adding.active !== 'Inactive',
        imported: adding.imported === 'Yes' ? true : adding.imported === 'No' ? false : null,
      }).eq('product_code', editingCode).select('*');
      setSaving(false);
      if (error) { setAddErr(error.message); return; }
      // Rows COUNTED: row-level security refuses an update by matching nothing.
      if (!data || data.length === 0) { setAddErr('Nothing was saved — your role may not edit product lines.'); return; }
      setRows((all) => all.map((r) => (s(r, 'product_code') === editingCode ? data[0] : r)));
      setAdding(null); setEditingCode(null);
      setNote(`${editingCode} saved.`);
      return;
    }
    if (rows.some((r) => s(r, 'product_code').toLowerCase() === code.toLowerCase())) {
      setAddErr(`${code} is already on the Product Master.`); return;
    }
    setSaving(true); setAddErr('');
    const { data, error } = await c.from('product_master').insert({
      product_code: code,
      product_name: adding.product_name.trim(),
      item_detail: adding.item_detail.trim(),
      item_type: adding.item_type.trim(),
      item_category: adding.item_category.trim(),
      short_form: adding.short_form.trim(),
      active: adding.active !== 'Inactive',
      imported: adding.imported === 'Yes' ? true : adding.imported === 'No' ? false : null,
      // The register's own Added / Added by columns -- the upload carries the
      // superseded system's; a line added here was added today, by this person.
      added_on: todayLocal(),
      added_by: String(user?.fullName ?? user?.email ?? ''),
    }).select('*');
    setSaving(false);
    if (error) {
      setAddErr(error.code === '23505' ? `${code} is already on the Product Master.`
        : error.code === '42501' || /row-level security/i.test(error.message)
          ? 'Your role does not have permission to add a product line.' : error.message);
      return;
    }
    if (!data || data.length === 0) { setAddErr('Nothing was saved — your role may not add product lines.'); return; }
    setRows((all) => [...all, ...data].sort((a, b) => s(a, 'product_name').localeCompare(s(b, 'product_name'))));
    setAdding(null);
    setNote(`${code} — ${adding.product_name.trim()} added to the Product Master.`);
  };
  const [note, setNote] = useState('');

  const importedLabel = (r: Row) => (r.imported === true ? 'Yes' : r.imported === false ? 'No' : '');

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.active === true).length,
    inactive: rows.filter((r) => r.active === false).length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === 'active' && r.active !== true) return false;
      if (only === 'inactive' && r.active !== false) return false;
      if (!needle) return true;
      return ['product_code', 'product_name', 'item_type', 'item_category', 'short_form']
        .some((k) => s(r, k).toLowerCase().includes(needle));
    });
  }, [rows, q, only]);

  const columns: Column<Row>[] = [
    { key: 'product_code', header: 'Product Code', width: 170, wrap: false },
    { key: 'product_name', header: 'Product Name', width: 220 },
    { key: 'item_type', header: 'Type', width: 150 },
    { key: 'item_category', header: 'Category', width: 190 },
    { key: 'short_form', header: 'Short Form', width: 110 },
    // ACTIVE IS A STATE, so it reads as one — inverted against the page when
    // the line is retired, which is the project's rule for a highlight, rather
    // than a pale tint that does not read in either theme.
    { key: 'active', header: 'Still sold?', width: 130, wrap: false,
      render: (r) => (r.active === false
        ? <span className="pl-retired">Inactive</span>
        : <span className="muted">Active</span>) },
    // IMPORTED (0319): decides whether a DEMO unit of the line owes
    // Pre-Delivery Testing R/SER/QC/007 in the workshop. Blank = not known.
    { key: 'imported', header: 'Imported', width: 130, wrap: false,
      render: (r) => (mayEdit
        ? <SelectPicker value={importedLabel(r)} options={['Yes', 'No']} placeholder="— not set —"
            onChange={(v) => void setImported(String(r.product_code), v)} />
        : (importedLabel(r) || <span className="muted">not set</span>)) },
    { key: 'added_on', header: 'Added', width: 130, wrap: false,
      render: (r) => fmtLongDate(r.added_on) },
    { key: 'added_by', header: 'Added by', width: 130 },
    // THE ACTION BUTTONS ON THE ROW (the user, 2026-10-03).
    ...((live && (mayEdit || mayDelete)) ? [{
      key: '_actions', header: 'Actions', width: 140, sortable: false, wrap: false,
      render: (r: Row) => (
        <div className="row" style={{ gap: 6 }}>
          {mayEdit && <button className="btn btn-sm" title="Edit this product line" onClick={() => openEdit(r)}>✎ Edit</button>}
          {mayDelete && (
            <button className="btn btn-ghost btn-sm" title="Delete this line — refused while any machine, sale or contract names it"
              onClick={() => void removeLine(r)}>🗑</button>
          )}
        </div>
      ),
    } as Column<Row>] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Product Master" icon="📖"
        subtitle="The product lines — one row per code. Not the machines: those are the Product Database."
        count={shown.length} countMore={false}
        onRefresh={() => void load()} refreshing={busy}
        actions={mayAdd && live && (
          <button className="btn btn-primary" onClick={() => { setEditingCode(null); setAdding(blankDraft); setAddTried(false); setAddErr(''); }}>＋ Add entry</button>
        )}
      />
      {!live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database.</span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-error"><span>{msg}</span></div>}
      {note && (
        <div className="sheet-banner sheet-banner-ok">
          <span>{note}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setNote('')}>✕</button>
        </div>
      )}

      {/* WHAT INACTIVE MEANS, on the page rather than in somebody's head. It is
          a narrow rule and the narrowness is the point: it stops a SALE, and
          nothing else. */}
      <div className="sheet-banner sheet-banner-info">
        <span>
          <b>Inactive</b> means the line is no longer sold — a <b>new Sale Entry</b> cannot name
          it. Everything else carries on: machines already sold still take <b>contracts, calls,
          visits, spares and feedback</b>, because a line stops being sold long before it stops
          being serviced. <b>Imported</b> (Yes / No, blank until set) decides whether a DEMO unit of the line
          owes Pre-Delivery Testing (R/SER/QC/007) in the workshop.
        </span>
      </div>

      <SectionCard title="Product lines">
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Code, name, type, category…" />
          <button className={`chip ${only === '' ? 'chip-on' : ''}`} onClick={() => setOnly('')}>
            All <b>{counts.all}</b>
          </button>
          <button className={`chip ${only === 'active' ? 'chip-on' : ''}`}
                  onClick={() => setOnly((c) => (c === 'active' ? '' : 'active'))}>
            Active <b>{counts.active}</b>
          </button>
          <button className={`chip ${only === 'inactive' ? 'chip-on' : ''}`}
                  onClick={() => setOnly((c) => (c === 'inactive' ? '' : 'inactive'))}>
            Inactive <b>{counts.inactive}</b>
          </button>
          <div className="spacer" />
          {shown.length > 0 && (
            <button className="btn btn-sm"
                    onClick={() => csvExport('product-master.csv',
                      columns.filter((c) => !String(c.key).startsWith('_')).map((c) => ({ key: c.key, header: String(c.header) })), shown, COMPLETE)}>
              ⭳ Export CSV
            </button>
          )}
        </Toolbar>
        {/* Every count here is EXACT — the catalogue is 53 rows and is read
            whole, not paged — so none of them carries a "+". */}
        <DataTable<Row> columns={columns} rows={shown} getRowId={(r) => String(r.product_code)} />
        {!busy && !rows.length && (
          <div className="muted" style={{ marginTop: 10 }}>
            Nothing here yet. Load it under <b>Bulk Uploads → Product Master (product lines)</b>
            {' — or ＋ Add entry for a single line'}.
          </div>
        )}
      </SectionCard>
      {adding && (
        <Modal open title={editingCode ? `Edit ${editingCode}` : 'Add to Product Master'} onClose={() => { setAdding(null); setEditingCode(null); }} width={560}>
          <form className="kb-form ml-form" onSubmit={(e) => { e.preventDefault(); void saveAdd(); }}>
            {([['product_code', 'Product Code', 'Unique — one line per code.'], ['product_name', 'Product Name', 'The name every machine, sale and call uses for this line.']] as const).map(([k, l, hint]) => (
              <div className="ml-field" key={k}>
                <label className="field-label">{l} <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
                <input className="input" value={adding[k]} autoFocus={k === (editingCode ? 'product_name' : 'product_code')}
                  disabled={!!editingCode && k === 'product_code'}
                  onChange={(e) => setDraft(k, e.target.value)} />
                <span className="muted ml-hint">{hint}</span>
              </div>
            ))}
            <div className="ml-field">
              <label className="field-label">Item Detail</label>
              <input className="input" value={adding.item_detail} onChange={(e) => setDraft('item_detail', e.target.value)} />
            </div>
            {([['item_type', 'Type'], ['item_category', 'Category']] as const).map(([k, l]) => (
              <div className="ml-field" key={k}>
                <label className="field-label">{l}</label>
                <SelectPicker value={adding[k]} options={used(k)} allowFreeText
                  placeholder="Choose one already used, or type a new one"
                  onChange={(v) => setDraft(k, v)} />
              </div>
            ))}
            <div className="ml-field">
              <label className="field-label">Short Form</label>
              <input className="input" value={adding.short_form} onChange={(e) => setDraft('short_form', e.target.value)} />
            </div>
            <div className="ml-field">
              <label className="field-label">Still sold?</label>
              <SelectPicker value={adding.active} options={['Active', 'Inactive']} onChange={(v) => setDraft('active', v || 'Active')} />
              <span className="muted ml-hint">Inactive means no new Sale Entry can name it.</span>
            </div>
            <div className="ml-field">
              <label className="field-label">Imported</label>
              <SelectPicker value={adding.imported} options={['Yes', 'No']} placeholder="— not set —"
                onChange={(v) => setDraft('imported', v)} />
              <span className="muted ml-hint">Decides whether a demo unit owes Pre-Delivery Testing (R/SER/QC/007).</span>
            </div>
            {(addErr || (addTried && addMissing(adding).length > 0)) && (
              <div className="field-err">{addErr || `Fill ${addMissing(adding).join(', ')}.`}</div>
            )}
            <div className="kb-form-actions">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { setAdding(null); setEditingCode(null); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingCode ? 'Save' : 'Add entry'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
