// ===========================================================================
// THE EQUIPMENT LIST -- one party's machines, the document Product & Party
// Search exports (the user, 2026-10-15). Settled with the user the same day:
//   * a PDF, through the browser's Save as PDF, as the app's other documents;
//   * ONE PARTY per list ("Only for one party");
//   * the HEADER is the Field Failure Report's (logo | AIR LIQUIDE MEDICAL
//     SYSTEMS PVT. LTD. / SERVICE | PAGE NO:) with the title EQUIPMENT LIST;
//   * the PARTY'S DETAILS first -- all of them -- then the table;
//   * the FOOTER is the FFR's own notice, word for word: "This document is the
//     property of Air Liquide Medical Systems. Any communication or
//     reproduction thereof, even partial, is prohibited without the owner's
//     prior and written consent";
//   * who generated it and when; the cover in force today highlighted GREEN;
//   * Current Status beside the Serial, NO OT Number, and the party printed
//     ONCE, outside the table (the user, the same day).
//
// PURE: the party, the rows and the facts about the print come in as props, so
// the print page and the sample template render the same sheet. The header and
// the footer repeat on EVERY printed page, the party prints once, the column
// headings repeat; the page number is the printer's (@page).
// ===========================================================================
import { COMPANY_LOGO } from '../lib/brand';
import { contractActive, coverEndingIn, currentItemStatus, warrantyActive } from '../lib/coverToday';
import { formatDay, formatDayTime } from '../lib/dates';
import { FFR_FOOTER, FFR_HEADER } from '../lib/ffrform';
import { isSysColumn } from '../lib/syscols';
import './equipmentlist.css';

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => String(r[k] ?? '').trim();

export interface EquipmentListMeta {
  filterLabel: string;          // "All machines" / "Expiring this month (Oct-2026)"
  generatedBy: string;          // the person's name and email
  generatedAt: string;          // dd-MMM-yyyy HH:mm:ss
  today: string;                // yyyy-mm-dd: what "active" and "current" mean
  ending?: { from: string; to: string };   // a month filter's window
  /** The Service Engineer column: OFF unless chosen when generating (the
   *  user, 2026-10-15: "I don't want service engineer name by default, but
   *  it's optional"). */
  showEngineer?: boolean;
}

export const EQUIPMENT_LIST_TITLE = 'EQUIPMENT LIST';

// THE PARTY MASTER'S FIELDS, in the order a reader looks for them, under the
// names the Party Master screen uses. Every other non-empty field -- the
// columns not named here and everything the party's file carried in `extra` --
// follows under its own name, so ALL the available information is on the page.
const PARTY_FIELDS: [string, string][] = [
  ['party_key', 'Party Key'], ['party_type', 'Type'], ['profile', 'Profile'],
  ['address', 'Address'], ['pincode', 'Pincode'], ['country', 'Country'],
  ['phone', 'Phone'], ['phone_2', 'Phone 2'], ['fax', 'Fax'], ['email', 'Email'],
  ['billing_address', 'Billing Address'], ['billing_pincode', 'Billing Pincode'], ['billing_phone', 'Billing Phone'],
  ['billing_phone_2', 'Billing Phone 2'], ['billing_fax', 'Billing Fax'], ['billing_email', 'Billing Email'],
  ['gstin', 'GSTIN'], ['pan', 'PAN'], ['route', 'Route'],
  ['kyc_status', 'KYC Status'], ['kyc_verified_by', 'KYC Verified By'], ['kyc_verified_at', 'KYC Verified On'], ['kyc_notes', 'KYC Notes'],
];
// Kept off the page: keys and plumbing, not facts about the party -- and,
// since the user's word on 2026-10-15, the SERVICE ENGINEER ("Don't add service
// engineer details along with Party details") and the party's NAME, CITY and
// STATE, which are in the HEADER of every page instead.
const PARTY_SKIP = new Set(['id', 'party_name', 'name_key', 'extra', 'kyc_docs', 'created_at', 'updated_at',
  'service_engineer', 'city', 'state']);
// The same, for the details the party's own file carried (`extra`), compared
// squashed: "Service Engineer", "SERVICE ENGINEER", "service_engineer".
const EXTRA_SKIP = new Set(['serviceengineer', 'city', 'state', 'partyname']);
const squash = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every non-empty fact about the party, labelled, in reading order. */
export function partyFacts(p: Row): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  const add = (label: string, v: unknown) => {
    const text = String(v ?? '').trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push([label, /^\d{4}-\d{2}-\d{2}T/.test(text) ? formatDayTime(text) : text]);
  };
  PARTY_FIELDS.forEach(([k, label]) => add(label, p[k]));
  Object.keys(p).filter((k) => !PARTY_SKIP.has(k) && !isSysColumn(k) && !PARTY_FIELDS.some(([f]) => f === k))
    .forEach((k) => add(k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), p[k]));
  const extra = (p.extra ?? {}) as Row;
  Object.keys(extra).sort().filter((k) => !EXTRA_SKIP.has(squash(k))).forEach((k) => add(k, typeof extra[k] === 'object' ? JSON.stringify(extra[k]) : extra[k]));
  return out;
}

// "AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD." -> "Air Liquide Medical Systems Pvt. Ltd."
const titleCase = (v: string) => v.toLowerCase().replace(/(^|[\s.])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());

export function EquipmentListSheet({ party, rows, meta }: { party: Row; rows: Row[]; meta: EquipmentListMeta }) {
  const cols = 11 + (meta.ending ? 1 : 0) + (meta.showEngineer ? 1 : 0);
  const on = (active: boolean, text: string) => (active && text ? <span className="el-on">{text}</span> : text);
  const facts = partyFacts(party);
  // THE HEADER AND THE FOOTER ON EVERY PAGE, THE PARTY ONCE (the user,
  // 2026-10-15: "Header should repeat in every page. Footer should also repeat
  // in every page"; and the party "outside the table", not repeated). Printed,
  // the header and the footer are FIXED, which a browser paints on every page,
  // and the page's content sits in a table whose head and foot are empty
  // spacers of their height -- repeated on every page, so nothing runs under
  // them. The party is the first thing in that content, so it prints once;
  // the machines are a table of their own whose column headings repeat.
  // THE HEADER, MINIMAL (the user, 2026-10-15: "lose the table like look in
  // the header, make it look more professional and Minimalistic. Choose a font
  // to make it look elegant"): the FFR's content -- the logo, the company and
  // the department, the document's name -- without its boxes; a hairline
  // beneath. The page number is the printer's, in the foot of every page.
  // THE PARTY IN THE HEADER, ON EVERY PAGE (the user, 2026-10-15: "Move the
  // party name to header - Party Name, City, State reason being in Page 2
  // onwards I am not able to trace which party it belongs to").
  const place = [s(party, 'city'), s(party, 'state')].filter(Boolean).join(', ');
  const header = (
    <div className="el-head">
      <img className="el-head-logo" src={COMPANY_LOGO} alt="Air Liquide Medical Systems" />
      <div className="el-head-party">
        <div className="el-head-party-name">{s(party, 'party_name')}</div>
        {place && <div className="el-head-party-place">{place}</div>}
      </div>
      <div className="el-head-text">
        <div className="el-head-title">{EQUIPMENT_LIST_TITLE}</div>
        <div className="el-head-org">{titleCase(FFR_HEADER.org)} · {titleCase(FFR_HEADER.dept)}</div>
      </div>
    </div>
  );
  return (
    <>
      <div className="el-fixed-head">{header}</div>
      {/* THE FOOTER ON EVERY PAGE: who generated the list and when (the user,
          2026-10-15: "Move the generation details to footer"), and the
          property notice. */}
      <div className="el-fixed-foot">
        <div className="el-foot-gen">Generated by {meta.generatedBy} on {meta.generatedAt}</div>
        <div className="el-foot-notice">{FFR_FOOTER.notice}</div>
      </div>
      <table className="el-frame">
        <thead><tr><td><div className="el-head-space" /></td></tr></thead>
        <tfoot><tr><td><div className="el-foot-space" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="el-party">
            <div className="el-party-facts">
              {facts.map(([label, value]) => (
                <div key={label} className="el-fact"><span>{label}</span><b>{value}</b></div>
              ))}
            </div>
            <div className="el-meta">
              <span><b>List:</b> {meta.filterLabel}</span>
              <span><b>Machines:</b> {rows.length}</span>
            </div>
          </div>
          <table className="el-table">
            <thead>
              <tr className="el-cols">
                <th className="el-n">#</th>
                <th>Product</th><th>Serial</th><th>Current Status</th>
                {meta.ending && <th>Ending</th>}
                <th>Warranty No</th><th>Warranty Start</th><th>Warranty End</th>
                <th>Contract No</th><th>Contract Start</th><th>Contract End</th><th>Type</th>
                {meta.showEngineer && <th>Service Engineer</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const w = warrantyActive(r, meta.today);
                const c = contractActive(r, meta.today);
                return (
                  <tr key={i}>
                    <td className="el-n">{i + 1}</td>
                    <td>{s(r, 'Item Name')}</td>
                    <td className="el-nw">{s(r, 'Item Serial Number')}</td>
                    <td className="el-nw"><b>{currentItemStatus(r, meta.today)}</b></td>
                    {meta.ending && <td className="el-nw">{coverEndingIn(r, meta.ending.from, meta.ending.to).replace(/\d{4}-\d{2}-\d{2}/g, (d) => formatDay(d))}</td>}
                    <td className="el-nw">{on(w, s(r, 'Warranty Number'))}</td>
                    <td className="el-nw">{on(w, formatDay(s(r, 'Warranty Start Date')))}</td>
                    <td className="el-nw">{on(w, formatDay(s(r, 'Warranty End Date')))}</td>
                    <td className="el-nw">{on(c, s(r, 'Contract Number'))}</td>
                    <td className="el-nw">{on(c, formatDay(s(r, 'Contract Start Date')))}</td>
                    <td className="el-nw">{on(c, formatDay(s(r, 'Contract End Date')))}</td>
                    <td className="el-nw">{on(c, s(r, 'Contract Type'))}</td>
                    {meta.showEngineer && <td>{s(r, 'Service Engineer')}</td>}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={cols} className="el-empty">No machine is in this list.</td></tr>}
            </tbody>
          </table>
          {/* THE END OF THE DOCUMENT (the user, 2026-10-15: "Mark end of
              document as well"), so a reader knows no page is missing. */}
          <div className="el-end">— End of document · {rows.length} machine{rows.length === 1 ? '' : 's'} —</div>
        </td></tr></tbody>
      </table>
    </>
  );
}
