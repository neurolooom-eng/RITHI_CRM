import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listSpareDispatches, listDispatchLines, supabaseConfigured } from '../lib/supabase';
import { buildDc, paginate, COMPANY, DECLARATION, type DcDocument, type DcPage } from '../lib/dc';
import logo from '../assets/alms-logo.jpg';
import './dc.css';

// ===========================================================================
// DELIVERY CHALLAN — the printable document for one stock out (v2_DCTemplate).
//
// A4, narrow margins, and the letterhead AND the signature block on every
// sheet when the spares run past page 1.
//
// The pages are cut in code (see paginate() in lib/dc.ts) rather than left to
// the browser, because neither browser mechanism does what the form needs:
// <thead> repeats but <tfoot> prints only on the last page, and a fixed
// footer repeats without reserving space, so it paints over the last rows.
// Both were tried and both failed that way. One <section> per sheet, each
// carrying its own header and footer, is exact.
//
// The template identifies the delivery by Stock Out No. and Stock Out Date —
// there is no separate challan number on the form, and none in the data
// either (0028_dc_number_is_stock_out.sql).
// ===========================================================================

export function DeliveryChallan() {
  const { stockOut = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DcDocument | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print a challan.'); return; }
    let live = true;
    (async () => {
      try {
        // The header list is RLS-scoped, so a stock out the user may not see
        // simply is not there — no separate permission check needed.
        const heads = await listSpareDispatches(500);
        const head = heads.find((h) => String(h.uid) === stockOut);
        if (!head) { if (live) setErr(`Stock out ${stockOut} was not found, or you cannot view it.`); return; }
        const lines = await listDispatchLines(stockOut);
        if (live) setDoc(buildDc(head, lines));
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [stockOut]);

  if (err) {
    return (
      <div className="dc-page">
        <div className="dc-toolbar">
          <button className="btn btn-sm" onClick={() => navigate('/spare-dispatch')}>← Back</button>
        </div>
        <div className="dc-sheet"><p>{err}</p></div>
      </div>
    );
  }
  if (!doc) return <div className="dc-page"><div className="dc-sheet"><p>Loading challan…</p></div></div>;

  const pages = paginate(doc.lines);

  return (
    <div className="dc-page">
      <div className="dc-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/spare-dispatch')}>← Back to dispatch</button>
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>🖨 Print</button>
        <button className="btn btn-sm" onClick={() => navigate(`/declaration/${encodeURIComponent(doc.stockOutNo)}`)}>
          📜 Declaration
        </button>
        <span className="muted">
          A4, narrow margins · {pages.length} sheet{pages.length === 1 ? '' : 's'} — the letterhead and signature
          block print on every one.
        </span>
      </div>

      {pages.map((p) => <Sheet key={p.page} doc={doc} page={p} />)}
    </div>
  );
}

// One printed sheet: letterhead, the party/stock-out block, its slice of the
// grid, and the signature block. Complete on its own — that is the point.
function Sheet({ doc, page }: { doc: DcDocument; page: DcPage }) {
  return (
    <section className="dc-sheet">
      <div className="dc-letterhead">
        <div className="dc-logo"><img src={logo} alt="Air Liquide Healthcare" /></div>
        <div className="dc-org">
          <div className="dc-org-name">{COMPANY.name}</div>
          <div>{COMPANY.address1}</div>
          <div>{COMPANY.address2}</div>
          <div>{COMPANY.phone}</div>
          <div>{COMPANY.email}</div>
        </div>
      </div>

      <div className="dc-title">DELIVERY CHALLAN</div>

      <div className="dc-parties">
        <div className="dc-to">
          <div className="dc-label">To</div>
          <div className="dc-name">{doc.engineer}</div>
          {!!doc.courier && <div className="dc-label">Courier: {doc.courier}</div>}
        </div>
        <div className="dc-meta">
          <div><b>Stock Out No. :</b> {doc.stockOutNo}</div>
          <div><b>Stock Out Date :</b> {doc.stockOutDate}</div>
          <div><b>Ref. No. :</b> {doc.refNo}</div>
          <div><b>Ref. Date :</b> {doc.refDate}</div>
        </div>
      </div>

      <table className="dc-table">
        <colgroup>
          <col className="dc-c-sr" /><col className="dc-c-order" /><col className="dc-c-code" />
          <col /><col className="dc-c-qty" />
        </colgroup>
        <thead>
          <tr>
            <th className="dc-th">Sr.No.</th>
            <th className="dc-th">Order No.</th>
            <th className="dc-th">Item Code</th>
            <th className="dc-th">Description</th>
            <th className="dc-th">Qty</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r, i) => (
            <tr key={r ? `l${r.sr}` : `e${i}`} className={r ? '' : 'dc-empty'}>
              <td className="dc-c-sr">{r ? r.sr : ''}</td>
              <td>{r?.orderNo ?? ''}</td>
              <td>{r?.itemCode ?? ''}</td>
              <td>{r?.description ?? ''}</td>
              <td className="dc-c-qty">{r ? r.qty : ''}</td>
            </tr>
          ))}
          {/* The total belongs to the whole challan, so it closes the last
              sheet only; the others say where they carry on. */}
          <tr>
            <td className="dc-c-sr" /><td /><td />
            <td className="dc-strong" style={{ textAlign: 'right' }}>
              {page.last ? 'Total' : `Continued on sheet ${page.page + 1}`}
            </td>
            <td className="dc-c-qty dc-strong">{page.last ? doc.totalQty : ''}</td>
          </tr>
        </tbody>
      </table>

      <div className="dc-remarks"><span className="dc-strong">Remarks :</span> {doc.remarks}</div>
      <div className="dc-signs">
        <div>
          <div>GSTIN / UIN: : {COMPANY.gstin}</div>
          <div>CIN: : {COMPANY.cin}</div>
          <div>PAN NO: : {COMPANY.pan}</div>
        </div>
        <div>
          <div className="dc-strong">{DECLARATION.forCompany}</div>
          <div className="dc-sign-space" />
          <div>{DECLARATION.signatory}</div>
        </div>
      </div>
      <div className="dc-signs">
        <div>{DECLARATION.received}</div>
        <div>
          <div className="dc-strong">{DECLARATION.forCustomer}</div>
          <div className="dc-sign-space" />
          <div>{DECLARATION.signatoryStamp}</div>
        </div>
      </div>

      {page.pages > 1 && (
        <div className="dc-pagenote">Sheet {page.page} of {page.pages} · Stock Out {doc.stockOutNo}</div>
      )}
    </section>
  );
}
