// ===========================================================================
// MATERIAL TRANSFER NOTE (MTN), R/SER/STR/003 -- one Stock Transfer, printed
// (2026-10-02).
//
// The user's paper record, laid out as kept: the company's mark, the
// organisation, SERVICE and the title, the RECORD block (DOC. REF, ISSUE,
// REV., PAGE No.), Issuer / Receiver with their places, MTN No. and Date, the
// six-column table and the four sign boxes.
//
// WHAT EACH BOX PRINTS, from what RITHI holds:
//   * PLACE = the engineer's City on the User Master, else their Region.
//   * Reason for Transfer = the line's own reason (0322), else the transfer's
//     common remarks; Remarks = blank (there is no per-line remark).
//   * Issued By = the sending engineer and the transfer date; Received By is
//     BLANK, because a transfer records no receipt; Authorised By blank;
//     Entered By = the person who keyed it.
//   A stored signature prints only in a block that names the person printing
//   (URS-057, signatureBelongsTo); every other block is signed by hand.
//
// THE SAME GATE AS THE SCREEN: the Stock Transfer page's key (App.tsx); the
// transfer is read by its number and RLS-scoped, so one the reader may not see
// is simply not found.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { placeOfPerson, stockTransferByUid, supabaseConfigured, type StockTransferDoc } from '../lib/supabase';
import {
  MTN_FORM, MTN_ROWS_PER_PAGE, STORES_DEPT, STORES_ORG, mtnReason, nameAndPlace, pages, partCells,
} from '../lib/storeforms';
import { formatDay } from '../lib/dates';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { COMPANY_LOGO } from '../lib/brand';
import { RecordHead, SignBlock } from './StoresPrintParts';
import './indoorprint.css';

export function MtnPrint() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [doc, setDoc] = useState<StockTransferDoc | null>(null);
  const [places, setPlaces] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this note.'); return; }
    let live = true;
    (async () => {
      try {
        const d = await stockTransferByUid(uid);
        if (!live) return;
        if (!d) { setErr(`Stock transfer ${uid} was not found, or you cannot view it.`); return; }
        setDoc(d);
        const [from, to] = await Promise.all([placeOfPerson(d.from_engineer), placeOfPerson(d.to_engineer)]);
        if (live) setPlaces({ from, to });
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [uid]);

  const back = () => navigate('/stock-transfer');
  if (err) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={back}>← Back</button></div>
        <div className="ip-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!doc) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  const sheets = pages(doc.lines, MTN_ROWS_PER_PAGE);
  const sig = (name: string) => (signatureBelongsTo(name, user) ? (mySig?.signature ?? '') : '');
  const date = doc.transfer_date ? formatDay(doc.transfer_date) : '';

  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm 12mm 12mm; } }'}</style>
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={back}>← Back to Stock Transfer</button>
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'stock.mtn_print', target: doc.uid, status: 'ok', meta: { lines: doc.lines.length } }); window.print(); }}>
          🖨 Print
        </button>
        <span className="muted">{doc.uid} · MTN R/SER/STR/003 · {sheets.length} sheet{sheets.length === 1 ? '' : 's'} · A4</span>
      </div>

      {sheets.map((rows, p) => (
        <section key={p} className={`ip-sheet ip-portrait${p < sheets.length - 1 ? ' ip-break' : ''}`}>
          <RecordHead logo={COMPANY_LOGO} org={STORES_ORG} dept={STORES_DEPT} title={MTN_FORM.title}
            labels={MTN_FORM.labels} record={MTN_FORM.record} page={`${p + 1} of ${sheets.length}`} />

          <table className="ip-grid">
            <colgroup><col style={{ width: '62%' }} /><col style={{ width: '38%' }} /></colgroup>
            <tbody>
              <tr>
                <td><span className="ip-label">Name &amp; Place of Issuer : </span>{nameAndPlace(doc.from_engineer, places.from)}</td>
                <td><span className="ip-label">MTN No. : </span>{doc.uid}</td>
              </tr>
              <tr>
                <td><span className="ip-label">Name &amp; Place of Receiver : </span>{nameAndPlace(doc.to_engineer, places.to)}</td>
                <td><span className="ip-label">Date : </span>{date}</td>
              </tr>
            </tbody>
          </table>

          <table className="ip-grid ip-lines">
            <colgroup>
              <col style={{ width: '7%' }} /><col style={{ width: '17%' }} /><col style={{ width: '30%' }} />
              <col style={{ width: '7%' }} /><col style={{ width: '22%' }} /><col style={{ width: '17%' }} />
            </colgroup>
            <thead><tr>{MTN_FORM.columns.map((c) => <th key={c} className="ip-c">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((l, i) => {
                const { partNo, description } = partCells(l.part);
                return (
                  <tr key={i}>
                    <td className="ip-c">{p * MTN_ROWS_PER_PAGE + i + 1}</td>
                    <td>{partNo}</td>
                    <td>{description}</td>
                    <td className="ip-c">{l.qty}</td>
                    <td>{mtnReason(l.reason, doc.remarks)}</td>
                    <td />
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, MTN_ROWS_PER_PAGE - rows.length) }, (_, i) => (
                <tr key={`b${i}`}><td /><td /><td /><td /><td /><td /></tr>
              ))}
            </tbody>
          </table>

          <SignBlock boxes={MTN_FORM.signBoxes} cells={[
            { name: doc.from_engineer, date, signature: sig(doc.from_engineer) },
            // A transfer records no receipt, so nobody is named here.
            {},
            {},
            { name: doc.entered_by_name, signature: sig(doc.entered_by_name) },
          ]} />
        </section>
      ))}
    </div>
  );
}
