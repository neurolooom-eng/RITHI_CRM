// ===========================================================================
// The two blocks the STORES records share (MTN R/SER/STR/003, MRN
// R/SER/STR/002): the header with its RECORD block, and the row of sign boxes.
// Presentational only -- what goes in each box is decided by the page, and a
// signature reaches a box only when the page has already asked
// signatureBelongsTo() for it.
// ===========================================================================
import type { RecordBlock } from '../lib/storeforms';

export function RecordHead({ logo, org, dept, title, labels, record, page }: {
  logo: string; org: string; dept: string; title: string;
  labels: { docRef: string; issue: string; rev: string; page: string };
  record: RecordBlock; page: string;
}) {
  return (
    <table className="ip-head">
      <colgroup><col style={{ width: '21%' }} /><col style={{ width: '49%' }} /><col style={{ width: '30%' }} /></colgroup>
      <tbody>
        <tr>
          <td className="ip-logo"><img src={logo} alt="Air Liquide Medical Systems" /></td>
          <td className="ip-mid">{org}<br />{dept}<br />{title}</td>
          <td className="ip-rec">
            <div className="ip-rec-title">RECORD</div>
            <table>
              <tbody>
                <tr><td>{labels.docRef}</td><td>{record.docRef}</td></tr>
                <tr><td>{labels.issue}</td><td>{record.issue}</td></tr>
                <tr><td>{labels.rev}</td><td>{record.rev}</td></tr>
                <tr><td>{labels.page}</td><td>{page}</td></tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export interface SignCell { name?: string; date?: string; signature?: string }

export function SignBlock({ boxes, cells }: { boxes: readonly string[]; cells: SignCell[] }) {
  return (
    <table className="ip-grid ip-sign">
      <colgroup>{boxes.map((b) => <col key={b} style={{ width: `${100 / boxes.length}%` }} />)}</colgroup>
      <thead><tr>{boxes.map((b) => <th key={b}>{b}</th>)}</tr></thead>
      <tbody>
        <tr>
          {boxes.map((b, i) => {
            const c = cells[i] ?? {};
            return (
              <td key={b}>
                {c.signature ? <img className="ip-sign-ink" style={{ margin: '0 auto' }} src={c.signature} alt="" /> : null}
                {c.name ? <div className="ip-sign-name">{c.name}</div> : null}
                {c.date ? <div>{c.date}</div> : null}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
