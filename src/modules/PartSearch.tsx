import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { MultiPick } from '../components/ui/MultiPick';
import { listActivePartsReadOnly, supabaseConfigured, type PartLookupRow } from '../lib/supabase';
import { complaintProducts } from '../lib/complaints';
import { loadFailure } from '../lib/dberror';

// ===========================================================================
// PART SEARCH — look a part up, and nothing else.
//
// The user, 2026-10-01: "Create a Page under Overview - 'Part Search'. List the
// Parts with Part Code, Description, Spare/Consumable, Products; list only
// Active [parts]. It's a Read only View - No Action Buttons or Edit Access for
// anyone - Including Admin this view has to be read only. No Download Option
// as well." And: every role may open it.
//
// READ-ONLY BY CONSTRUCTION, not by hiding: this file imports no write, no
// export and no row action, and asks the database for those four columns of
// ACTIVE parts only -- so Purchase Cost and retired parts never reach the
// browser at all, rather than being fetched and left off the screen. Editing a
// part stays on the Part Master, under its own permission. `check:ui` holds
// this file to that.
// ===========================================================================

type Row = PartLookupRow & Record<string, unknown>;

const productsOf = (r: PartLookupRow): string[] => complaintProducts({ products: r.product });
// What a blank class reads as -- in the column and in its filter, the same words.
const NOT_SET = '— not set —';
const classOf = (r: PartLookupRow): string => String(r.category ?? '').trim() || NOT_SET;

// A FILTER ON EVERY COLUMN, each a type-search drop-down (the user, 2026-10-01:
// "Add Filter for all Columns Present, make it Type Search drop-down"). Each
// list offers only the values the OTHER filters leave on screen, so two
// filters cannot be combined into an empty page without the list saying so
// first. A common part (no product) stays under any product chosen -- it fits
// every product.
type ColKey = 'code' | 'description' | 'category' | 'product';
type Filters = Record<ColKey, string[]>;
const NO_FILTERS: Filters = { code: [], description: [], category: [], product: [] };
const valuesOf = (r: PartLookupRow, k: ColKey): string[] =>
  k === 'product' ? productsOf(r) : k === 'category' ? [classOf(r)] : [String(r[k] ?? '').trim()].filter(Boolean);
const passes = (r: PartLookupRow, f: Filters, skip?: ColKey): boolean =>
  (Object.keys(f) as ColKey[]).every((k) => {
    if (k === skip || !f[k].length) return true;
    const vs = valuesOf(r, k);
    if (k === 'product' && vs.length === 0) return true;
    return vs.some((v) => f[k].includes(v));
  });

const COLUMNS: Column<Row>[] = [
  { key: 'code', header: 'Part Code', width: 150, wrap: false },
  { key: 'description', header: 'Description', width: 420 },
  { key: 'category', header: 'Spare / Consumable', width: 160, wrap: false,
    render: (r) => (String(r.category ?? '').trim() || <span className="muted">{NOT_SET}</span>) },
  { key: 'product', header: 'Products', width: 320,
    render: (r) => (productsOf(r).length ? productsOf(r).join(', ') : <span className="muted">Common (all products)</span>) },
];

export function PartSearch() {
  const live = supabaseConfigured();
  const [rows, setRows] = useState<PartLookupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const setCol = (k: ColKey) => (v: string[]) => setFilters((f) => ({ ...f, [k]: v }));
  // FROM THE HEADER SEARCH (2026-10-01): open on that one part.
  const location = useLocation();
  useEffect(() => {
    const code = (location.state as { code?: string } | null)?.code;
    if (code) { setFilters({ ...NO_FILTERS, code: [String(code)] }); setQ(''); window.history.replaceState({}, ''); }
  }, [location.state]);
  const filtered = Object.values(filters).some((v) => v.length) || !!q.trim();

  const load = async () => {
    if (!live) { setErr('Connect the database in Settings to search parts.'); return; }
    setBusy(true); setErr('');
    try { setRows(await listActivePartsReadOnly()); }
    catch (e) { setErr(loadFailure(e, { tables: ['parts'], hint: 'The Part Master is not on the project yet.' })); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Every word typed must appear somewhere in the part's code, description or
  // products -- the same "all the words, any order" rule as the Part Master.
  const words = useMemo(() => q.trim().toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const matchesWords = (r: PartLookupRow) => !words.length
    || words.every((w) => [r.code, r.description, productsOf(r).join(' ')].join(' ').toLowerCase().includes(w));

  const visible = useMemo(
    () => rows.filter((r) => passes(r, filters) && matchesWords(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, words]);

  // Each column's options: the values on the rows every OTHER filter keeps,
  // plus whatever is already ticked so a choice never vanishes from its list.
  const options = useMemo(() => {
    const out = {} as Record<ColKey, string[]>;
    (Object.keys(NO_FILTERS) as ColKey[]).forEach((k) => {
      const set = new Set<string>(filters[k]);
      rows.forEach((r) => { if (passes(r, filters, k) && matchesWords(r)) valuesOf(r, k).forEach((v) => set.add(v)); });
      out[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, words]);

  const PICKS: [ColKey, string, string][] = [
    ['code', 'Part Code', 'codes'],
    ['description', 'Description', 'descriptions'],
    ['category', 'Spare / Consumable', 'classes'],
    ['product', 'Products', 'products'],
  ];

  return (
    <div>
      <PageHeader
        title="Part Search" icon="🧩"
        subtitle="Active parts — code, description, Spare / Consumable and the products each fits. Read only."
        count={visible.length}
        onRefresh={() => void load()} refreshing={busy}
      />
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      <DataTable<Row>
        columns={COLUMNS}
        rows={visible as Row[]}
        getRowId={(r) => String(r.id)}
        storageKey="part-search"
        rowsBeforeScroll={16}
        dense
        emptyText={busy ? 'Loading…' : rows.length ? 'No active part matches.' : 'No active parts.'}
        toolbar={
          <Toolbar>
            <input className="input" placeholder="Search part code, description or product…" value={q}
              onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} />
            {PICKS.map(([k, label, noun]) => (
              <div key={k} className="field" style={{ minWidth: k === 'description' ? 240 : 170 }}>
                <span className="field-label">{label}</span>
                <MultiPick values={filters[k]} options={options[k]} onChange={setCol(k)}
                  noun={noun} allLabel={`Any ${label.toLowerCase()}`} />
              </div>
            ))}
            {filtered && (
              <button className="btn btn-sm" onClick={() => { setFilters(NO_FILTERS); setQ(''); }}>✕ Clear filters</button>
            )}
            <div className="spacer" />
            <span className="muted">{visible.length.toLocaleString()} of {rows.length.toLocaleString()} active parts</span>
          </Toolbar>
        }
      />
    </div>
  );
}
