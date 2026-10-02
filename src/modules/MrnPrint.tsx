// ===========================================================================
// MATERIAL RETURN NOTE (MRN), R/SER/STR/002 -- one Material Return, printed
// (2026-10-02). Landscape A4, as the paper is.
//
// THE USER'S DECISION: "PRINT WHAT EXISTS" -- no new form fields. So each
// column prints a column the return already holds, or nothing:
//   Qty.                         good + defective
//   Customer Name & Place        customer_name (the return records no place)
//   Report No.                   report_no
//   Removed From Equip. (Sl.No.) removed_from_equipment
//   Hand Stock                   handstock_note, as written
//   Good / Damaged               good_qty / defective_qty
//   Store Dept. Use              blank -- Stores writes it on the paper
// Returned By = the engineer; Authorized By and Received By blank; Entered By
// = the person who keyed it. A stored signature prints only in a block naming
// the person printing (URS-057).
//
// ONE MRN IS ONE `uid` -- the submission the Material Returns screen groups
// by. MRN NO. prints the slip number written on it (mrn_no), and the uid where
// none was written.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { materialReturnByUid, placeOfPerson, supabaseConfigured, userNameById } from '../lib/supabase';
import {
  MRN_FORM, MRN_ROWS_PER_PAGE, STORES_DEPT, STORES_ORG, mrnQty, pages, partCells, qtyCell,
} from '../lib/storeforms';
import { formatDay } from '../lib/dates';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { COMPANY_LOGO } from '../lib/brand';
import { RecordHead, SignBlock } from './StoresPrintParts';
import './indoorprint.css';

type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? '').trim();

export function MrnPrint() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [place, setPlace] = useState('');
  const [enteredBy, setEnteredBy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this note.'); return; }
    let live = true;
    (async () => {
      try {
        const r = await materialReturnByUid(uid);
        if (!live) return;
        if (r.length === 0) { setErr(`Material return ${uid} was not found, or you cannot view it.`); return; }
        setRows(r);
        const [p, e] = await Promise.all([placeOfPerson(s(r[0]!.engineer)), userNameById(s(r[0]!.created_by))]);
        if (live) { setPlace(p); setEnteredBy(e); }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [uid]);

  const back = () => navigate('/mrn');
  if (err) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={back}>← Back</button></div>
        <div className="ip-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!rows) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  const head = rows[0]!;
  const engineer = s(head.engineer);
  const mrnNo = s(head.mrn_no) || s(head.uid);
  const sheets = pages(rows, MRN_ROWS_PER_PAGE);
  const sig = (name: string) => (signatureBelongsTo(name, user) ? (mySig?.signature ?? '') : '');

  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 landscape; margin: 8mm 10mm 10mm; } }'}</style>
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={back}>← Back to Material Returns</button>
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'stock.mrn_print', target: s(head.uid), status: 'ok', meta: { lines: rows.length, mrn_no: s(head.mrn_no) } }); window.print(); }}>
          🖨 Print
        </button>
        <span className="muted">{mrnNo} · MRN R/SER/STR/002 · {sheets.length} sheet{sheets.length === 1 ? '' : 's'} · A4 landscape</span>
      </div>

      {sheets.map((part, p) => (
        <section key={p} className={`ip-sheet ip-landscape${p < sheets.length - 1 ? ' ip-break' : ''}`} style={{ fontSize: '9.5pt' }}>
          <RecordHead logo={COMPANY_LOGO} org={STORES_ORG} dept={STORES_DEPT} title={MRN_FORM.title}
            labels={MRN_FORM.labels} record={MRN_FORM.record} page={`${p + 1} of ${sheets.length}`} />

          <table className="ip-grid">
            <colgroup><col style={{ width: '62%' }} /><col style={{ width: '38%' }} /></colgroup>
            <tbody>
              <tr>
                <td><span className="ip-label">NAME : </span>{engineer}</td>
                <td><span className="ip-label">MRN NO. : </span>{mrnNo}</td>
              </tr>
              <tr>
                <td><span className="ip-label">PLACE : </span>{place}</td>
                <td><span className="ip-label">DATE : </span>{head.mrn_date ? formatDay(head.mrn_date) : ''}</td>
              </tr>
            </tbody>
          </table>

          <table className="ip-grid ip-lines">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '10%' }} /><col style={{ width: '17%' }} />
              <col style={{ width: '5%' }} /><col style={{ width: '14%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '7%' }} />
              <col style={{ width: '5%' }} /><col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} /><col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="ip-c" rowSpan={2}>S.No.</th>
                <th className="ip-c" rowSpan={2}>Part No.</th>
                <th className="ip-c" rowSpan={2}>Description</th>
                <th className="ip-c" rowSpan={2}>Qty.</th>
                <th className="ip-c" rowSpan={2}>Customer Name &amp; Place</th>
                <th className="ip-c" rowSpan={2}>Report No.</th>
                <th className="ip-c" colSpan={2}>Type of Material</th>
                <th className="ip-c" colSpan={2}>Cond. of Material</th>
                <th className="ip-c" colSpan={2}>Store Dept. Use</th>
              </tr>
              <tr>
                <th className="ip-c">Removed From Equip. (Sl.No.)</th>
                <th className="ip-c">Hand Stock</th>
                <th className="ip-c">Good</th>
                <th className="ip-c">Damaged</th>
                <th className="ip-c">Main SB. Ref</th>
                <th className="ip-c">Damaged SB. Ref</th>
              </tr>
            </thead>
            <tbody>
              {part.map((r, i) => {
                const { partNo, description } = partCells(r.part, r.item_code, r.item_name);
                return (
                  <tr key={s(r.id) || i}>
                    <td className="ip-c">{p * MRN_ROWS_PER_PAGE + i + 1}</td>
                    <td>{partNo}</td>
                    <td>{description}</td>
                    <td className="ip-c">{mrnQty(r.good_qty, r.defective_qty)}</td>
                    <td>{s(r.customer_name)}</td>
                    <td>{s(r.report_no)}</td>
                    <td>{s(r.removed_from_equipment)}</td>
                    <td>{s(r.handstock_note)}</td>
                    <td className="ip-c">{qtyCell(r.good_qty)}</td>
                    <td className="ip-c">{qtyCell(r.defective_qty)}</td>
                    <td /><td />
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, MRN_ROWS_PER_PAGE - part.length) }, (_, i) => (
                <tr key={`b${i}`}>{Array.from({ length: 12 }, (_, k) => <td key={k} />)}</tr>
              ))}
            </tbody>
          </table>

          <SignBlock boxes={MRN_FORM.signBoxes} cells={[
            { name: engineer, signature: sig(engineer) },
            {},
            {},
            { name: enteredBy, signature: sig(enteredBy) },
          ]} />
        </section>
      ))}
    </div>
  );
}
