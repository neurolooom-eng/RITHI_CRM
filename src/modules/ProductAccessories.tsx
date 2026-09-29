import { useEffect, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { MultiPick } from '../components/ui/MultiPick';
import { listProductAccessories, saveProductAccessories, deleteProductAccessories, type ProductAccessoryRow } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { listProductLines, mainAndAccessoryNames } from '../lib/productLines';
import { clearMasterCache } from '../lib/masters';

// ===========================================================================
// MAIN PRODUCT -> ACCESSORIES / ALLIED PRODUCTS (0255).
//
//   The user, 2026-09-30: "should also be able to map the Main Product and
//   Accessories / Allied products that might have been sold together -- ensure
//   we have a place holder for that". One list per product LINE (their choice).
//
// THE NAMES COME FROM THE PRODUCT MASTER (the user, 2026-09-30: "it has to
// come from Product Master ... ACCESSORY in Category Column. Use that; anything
// other than ACCESSORY should be considered as Main Product"). The main
// product picker lists the non-ACCESSORY lines, the accessories picker the
// ACCESSORY ones.
//
// READ BY BOTH SPARE PICKERS ON A CALL (partfit.ts): the Spare Request and the
// visit report's consumption offer the call's product, its accessories, and
// the common parts.
// ===========================================================================
export function ProductAccessories({ mayEdit }: { mayEdit: boolean }) {
  const [names, setNames] = useState<{ main: string[]; accessories: string[] } | null>(null);
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
  useEffect(() => {
    if (!open || rows !== null) return;
    void load();
    void listProductLines().then((l) => setNames(mainAndAccessoryNames(l)));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

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
    // The spare pickers on this device read the new list at once.
    clearMasterCache('productAccessories');
    await load();
  };
  const remove = async (r: ProductAccessoryRow) => {
    if (!confirm(`Remove the accessories list for ${r.main_product}?`)) return;
    const res = await deleteProductAccessories(r.id);
    if (!res.ok) { setErr(res.error ?? 'Could not remove.'); return; }
    clearMasterCache('productAccessories');
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
            What is sold together with each product, from the Product Master (Category ACCESSORY = accessory,
            anything else = main product). On a call for the main product, the Spare Request and the visit
            report&rsquo;s spare consumption offer its parts, its accessories&rsquo; parts and the common parts.
          </p>
          {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
          {mayEdit && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ minWidth: 200 }}>
                <SelectPicker value={main} onChange={pickMain}
                  placeholder={names ? 'Main product (Product Master)' : 'Loading the Product Master…'}
                  options={names?.main ?? []} />
              </div>
              <div style={{ minWidth: 260 }}>
                <MultiPick values={acc} options={(names?.accessories ?? []).filter((p) => p !== main)} noun="accessories"
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
