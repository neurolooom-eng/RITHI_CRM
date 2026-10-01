import { useEffect, useMemo, useState } from 'react';
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
type Kind = 'all' | 'spare' | 'consumable' | 'unset';

const productsOf = (r: PartLookupRow): string[] => complaintProducts({ products: r.product });

const COLUMNS: Column<Row>[] = [
  { key: 'code', header: 'Part Code', width: 150, wrap: false },
  { key: 'description', header: 'Description', width: 420 },
  { key: 'category', header: 'Spare / Consumable', width: 160, wrap: false,
    render: (r) => (String(r.category ?? '').trim() || <span className="muted">— not set —</span>) },
  { key: 'product', header: 'Products', width: 320,
    render: (r) => (productsOf(r).length ? productsOf(r).join(', ') : <span className="muted">Common (all products)</span>) },
];

export function PartSearch() {
  const live = supabaseConfigured();
  const [rows, setRows] = useState<PartLookupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [products, setProducts] = useState<string[]>([]);

  const load = async () => {
    if (!live) { setErr('Connect the database in Settings to search parts.'); return; }
    setBusy(true); setErr('');
    try { setRows(await listActivePartsReadOnly()); }
    catch (e) { setErr(loadFailure(e, { tables: ['parts'], hint: 'The Part Master is not on the project yet.' })); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const productOptions = useMemo(
    () => Array.from(new Set(rows.flatMap(productsOf))).sort((a, b) => a.localeCompare(b)),
    [rows]);

  const visible = useMemo(() => {
    // Every word typed must appear somewhere in the part's code, description or
    // products -- the same "all the words, any order" rule as the Part Master.
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const want = new Set(products.map((p) => p.toLowerCase()));
    return rows.filter((r) => {
      const cat = String(r.category ?? '').trim().toLowerCase();
      if (kind === 'spare' && cat !== 'spare') return false;
      if (kind === 'consumable' && cat !== 'consumable') return false;
      if (kind === 'unset' && cat) return false;
      const ps = productsOf(r);
      // A common part fits every product, so it stays when products are chosen.
      if (want.size && ps.length && !ps.some((p) => want.has(p.toLowerCase()))) return false;
      if (!words.length) return true;
      const hay = [r.code, r.description, ps.join(' ')].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, kind, products]);

  const counts = useMemo(() => {
    const c = { all: rows.length, spare: 0, consumable: 0, unset: 0 };
    rows.forEach((r) => {
      const cat = String(r.category ?? '').trim().toLowerCase();
      if (cat === 'spare') c.spare++; else if (cat === 'consumable') c.consumable++; else if (!cat) c.unset++;
    });
    return c;
  }, [rows]);

  const kinds: [Kind, string][] = [
    ['all', `All (${counts.all.toLocaleString()})`],
    ['spare', `Spare (${counts.spare.toLocaleString()})`],
    ['consumable', `Consumable (${counts.consumable.toLocaleString()})`],
    ['unset', `Not set (${counts.unset.toLocaleString()})`],
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
            <div className="row" style={{ gap: 4 }} role="group" aria-label="Spare / Consumable">
              {kinds.map(([k, label]) => (
                <button key={k} className={`btn btn-sm${kind === k ? ' btn-primary' : ''}`} aria-pressed={kind === k}
                  onClick={() => setKind(k)}>{label}</button>
              ))}
            </div>
            <MultiPick values={products} options={productOptions} onChange={setProducts}
              noun="products" allLabel="Any product" />
            <div className="spacer" />
            <span className="muted">{visible.length.toLocaleString()} of {rows.length.toLocaleString()} active parts</span>
          </Toolbar>
        }
      />
    </div>
  );
}
