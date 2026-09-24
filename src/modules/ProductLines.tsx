import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, Toolbar, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { csvExport, fmtLongDate } from '../lib/format';
import './fieldcalls.css';
import { COMPLETE } from '../lib/exportscope';

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
  const { can } = useAuth();
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
    { key: 'added_on', header: 'Added', width: 130, wrap: false,
      render: (r) => fmtLongDate(r.added_on) },
    { key: 'added_by', header: 'Added by', width: 130 },
  ];

  return (
    <div>
      <PageHeader
        title="Product Master" icon="📖"
        subtitle="The product lines — one row per code. Not the machines: those are the Product Database."
        count={shown.length} countMore={false}
        onRefresh={() => void load()} refreshing={busy}
      />
      {!live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database.</span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-error"><span>{msg}</span></div>}

      {/* WHAT INACTIVE MEANS, on the page rather than in somebody's head. It is
          a narrow rule and the narrowness is the point: it stops a SALE, and
          nothing else. */}
      <div className="sheet-banner sheet-banner-info">
        <span>
          <b>Inactive</b> means the line is no longer sold — a <b>new Sale Entry</b> cannot name
          it. Everything else carries on: machines already sold still take <b>contracts, calls,
          visits, spares and feedback</b>, because a line stops being sold long before it stops
          being serviced.
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
                      columns.map((c) => ({ key: c.key, header: String(c.header) })), shown, COMPLETE)}>
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
            {can('masters.edit') ? '' : ' — which needs the right to edit masters'}.
          </div>
        )}
      </SectionCard>
    </div>
  );
}
