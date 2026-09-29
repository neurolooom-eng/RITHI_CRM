import { useEffect, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { MultiPick } from '../components/ui/MultiPick';
import { listProductAccessories, saveProductAccessories, deleteProductAccessories, type ProductAccessoryRow } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';

// ===========================================================================
// MAIN PRODUCT -> ACCESSORIES / ALLIED PRODUCTS (0255).
//
//   The user, 2026-09-30: "should also be able to map the Main Product and
//   Accessories / Allied products that might have been sold together -- ensure
//   we have a place holder for that". One list per product LINE (their choice),
//   by Product Database name, so Phase 2 can offer a spare request the parts of
//   the main product AND of what is sold with it.
//
// On the Part Master screen, collapsed, because it is about which parts belong
// together -- and nothing reads it yet; it is filled now so Phase 2 has data.
// ===========================================================================
export function ProductAccessories({ productNames, mayEdit }: { productNames: string[]; mayEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductAccessoryRow[] | null>(null);
  const [err, setErr] = useState('');
  const [main, setMain] = useState('');
  const [acc, setAcc] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr('');
    try { setRows(await listProductAccessories()); }
    catch (e) {
      setRows([]);
      setErr(loadFailure(e, { tables: ['product_accessories'], hint: 'Not on the project yet — run supabase/apply/masters.sql.' }));
    }
  };
  useEffect(() => { if (open && rows === null) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  // Choosing a main product that already has a list opens that list to edit.
  const pickMain = (m: string) => {
    setMain(m);
    const r = (rows ?? []).find((x) => x.main_product.toLowerCase() === m.toLowerCase());
    setAcc(r?.accessories ?? []); setNote(r?.note ?? '');
  };
  const save = async () => {
    setBusy(true);
    const r = await saveProductAccessories(main, acc, note);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    setMain(''); setAcc([]); setNote('');
    await load();
  };
  const remove = async (r: ProductAccessoryRow) => {
    if (!confirm(`Remove the accessories list for ${r.main_product}?`)) return;
    const res = await deleteProductAccessories(r.id);
    if (!res.ok) { setErr(res.error ?? 'Could not remove.'); return; }
    await load();
  };

  return (
    <div className="card" style={{ margin: '0 0 12px', padding: 10 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Main product → Accessories &amp; allied products {rows ? `(${rows.length})` : ''}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
            What is sold together with each product. The spare request will use this to offer the parts of the
            main product and of its accessories (Phase 2 — not used yet).
          </p>
          {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
          {mayEdit && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ minWidth: 200 }}>
                <SelectPicker value={main} onChange={pickMain} placeholder="Main product" options={productNames} />
              </div>
              <div style={{ minWidth: 260 }}>
                <MultiPick values={acc} options={productNames.filter((p) => p !== main)} noun="products"
                  allLabel="— no accessories —" onChange={setAcc} />
              </div>
              <input className="input" style={{ minWidth: 180 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={busy || !main} onClick={() => void save()}>Save</button>
            </div>
          )}
          {rows && rows.length === 0 && !err && <p className="muted" style={{ fontSize: 13 }}>No lists yet.</p>}
          {rows && rows.length > 0 && (
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead><tr><th>Main product</th><th>Accessories &amp; allied products</th><th>Note</th>{mayEdit && <th />}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.main_product}</td>
                    <td>{r.accessories.length ? r.accessories.join(', ') : <span className="muted">— none —</span>}</td>
                    <td>{r.note}</td>
                    {mayEdit && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => pickMain(r.main_product)}>✎</button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => void remove(r)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
