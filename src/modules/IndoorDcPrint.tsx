// ===========================================================================
// INDOOR_DC, PRINTABLE (0321, 2026-10-02).
//
// The user's template for the Indoor Service module's own delivery challan,
// reproduced as it is laid out: the Service Center's letterhead with the
// company's mark, DELIVERY CHALLAN (DC), the GSTIN / DC No. / DATE box, To and
// the customer's reference, Mode of Despatch, the five-column table, the four
// sign boxes and the note. The pattern of the other printable records
// (IndoorPdtPrint.tsx): a route of its own, no menu, one Print button that is
// not on the paper.
//
// THE TEXT IS THE TEMPLATE'S (INDOOR_DC_FORM in indoorforms.ts), never the
// spare DC's COMPANY constant: the two forms print different letterheads.
//
// ISSUED BY (Stores) prints the name RITHI knows for the person who issued
// the DC, stamped by the database; the stored signature beside it only when
// that person is the one printing (URS-057, signatureBelongsTo).
// AUTHORISED BY (0323): while the DC is PENDING APPROVAL the box stays EMPTY
// and the sheet carries a "PENDING APPROVAL" band naming who it waits for --
// a name in that box before anybody approved would read as an authorisation
// that was never given. Once approved, the approver's name prints there (with
// their signature under the same rule). A REJECTED DC prints a REJECTED band
// and its reason. The other two boxes are signed by hand.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { indoorDcByNo, supabaseConfigured, type IndoorDc, type IndoorDcLine } from '../lib/supabase';
import { INDOOR_DC_FORM } from '../lib/indoorforms';
import { formatDay } from '../lib/dates';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
// A PRINTED DOCUMENT CARRIES THE COMPANY'S MARK, never the application's.
import { COMPANY_LOGO } from '../lib/brand';
import './indoorprint.css';

/** The paper has ruled rows below the last item; at least this many print. */
const MIN_ROWS = 10;

export function IndoorDcPrint() {
  const { dcNo = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [doc, setDoc] = useState<{ dc: IndoorDc; lines: IndoorDcLine[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this DC.'); return; }
    let live = true;
    // Read BY ITS NUMBER, RLS-scoped: a DC the reader may not see is not found.
    indoorDcByNo(dcNo)
      .then((d) => { if (!live) return; if (!d) setErr(`Indoor DC ${dcNo} was not found, or you cannot view it.`); else setDoc(d); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [dcNo]);

  if (err) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back</button></div>
        <div className="ip-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!doc) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  const { dc, lines } = doc;
  const F = INDOOR_DC_FORM;
  const signature = signatureBelongsTo(dc.issued_by_name, user) ? (mySig?.signature ?? '') : '';
  const approved = dc.approval_status === 'Approved';
  const approverSignature = approved && signatureBelongsTo(dc.approved_by_name, user) ? (mySig?.signature ?? '') : '';
  const blanks = Math.max(0, MIN_ROWS - lines.length);

  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm 12mm 12mm; } }'}</style>
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back to the register</button>
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'indoor.dc_print', target: dc.dc_no, status: 'ok', meta: { lines: lines.length } }); window.print(); }}>
          🖨 Print
        </button>
        <span className="muted">{dc.dc_no} · Indoor DC · {lines.length} line{lines.length === 1 ? '' : 's'} · A4</span>
      </div>

      <section className="ip-sheet ip-portrait">
        <table className="ip-head">
          <tbody>
            <tr>
              <td className="ip-logo"><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
              <td className="ip-org" colSpan={2}>
                <div className="ip-org-name">{F.org}</div>
                <div className="ip-org-dept">{F.dept}</div>
                {F.address.map((l) => <div key={l}>{l}</div>)}
                <div>{F.tel}</div>
                <div>{F.email}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="ip-dc-title">{F.title}</div>
        {dc.approval_status === 'Pending approval' ? (
          <div className="ip-band">PENDING APPROVAL — awaiting {dc.authorised_by_name || 'the authoriser'}</div>
        ) : dc.approval_status === 'Rejected' ? (
          <div className="ip-band">REJECTED — {dc.rejection_reason}</div>
        ) : null}

        <table className="ip-grid">
          <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
          <tbody>
            <tr>
              <td className="ip-label">{F.gstin}</td>
              <td>
                <div><span className="ip-label">DC No. : </span>{dc.dc_no}</div>
                <div><span className="ip-label">DATE : </span>{formatDay(dc.dc_date)}</div>
              </td>
            </tr>
            <tr>
              <td>
                <div className="ip-label">To</div>
                <div className="ip-pre">{dc.consignee}</div>
              </td>
              <td>
                <div><span className="ip-label">MIRN No. / CUSTOMER REF No. : </span>{dc.customer_ref}</div>
                <div><span className="ip-label">DATE : </span>{dc.customer_ref_date ? formatDay(dc.customer_ref_date) : ''}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}><span className="ip-label">Mode of Despatch : </span>{dc.mode_of_despatch}</td>
            </tr>
          </tbody>
        </table>

        <table className="ip-grid ip-lines">
          <colgroup>
            <col style={{ width: '8%' }} /><col style={{ width: '18%' }} /><col style={{ width: '44%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '22%' }} />
          </colgroup>
          <thead><tr>{F.columns.map((c) => <th key={c} className="ip-c">{c}</th>)}</tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="ip-c">{l.line_no}</td>
                <td>{l.part_no}</td>
                <td>{l.description}</td>
                <td className="ip-c">{Number(l.qty)}</td>
                <td>{l.purpose}</td>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <tr key={`b${i}`}><td /><td /><td /><td /><td /></tr>
            ))}
          </tbody>
        </table>

        <table className="ip-grid ip-sign">
          <colgroup>{F.signBoxes.map((b) => <col key={b} style={{ width: '25%' }} />)}</colgroup>
          <thead><tr>{F.signBoxes.map((b) => <th key={b}>{b}</th>)}</tr></thead>
          <tbody>
            <tr>
              <td>
                {signature ? <img className="ip-sign-ink" style={{ margin: '0 auto' }} src={signature} alt="" /> : null}
                <div className="ip-sign-name">{dc.issued_by_name}</div>
              </td>
              <td>
                {approverSignature ? <img className="ip-sign-ink" style={{ margin: '0 auto' }} src={approverSignature} alt="" /> : null}
                {approved ? <div className="ip-sign-name">{dc.approved_by_name}</div> : null}
              </td>
              <td /><td />
            </tr>
          </tbody>
        </table>
        <p className="ip-note" style={{ fontStyle: 'normal' }}>{F.note}</p>
      </section>
    </div>
  );
}
