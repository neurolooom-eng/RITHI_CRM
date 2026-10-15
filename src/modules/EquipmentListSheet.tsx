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
  ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['country', 'Country'],
  ['phone', 'Phone'], ['phone_2', 'Phone 2'], ['fax', 'Fax'], ['email', 'Email'],
  ['billing_address', 'Billing Address'], ['billing_pincode', 'Billing Pincode'], ['billing_phone', 'Billing Phone'],
  ['billing_phone_2', 'Billing Phone 2'], ['billing_fax', 'Billing Fax'], ['billing_email', 'Billing Email'],
  ['gstin', 'GSTIN'], ['pan', 'PAN'], ['service_engineer', 'Service Engineer'], ['route', 'Route'],
  ['kyc_status', 'KYC Status'], ['kyc_verified_by', 'KYC Verified By'], ['kyc_verified_at', 'KYC Verified On'], ['kyc_notes', 'KYC Notes'],
];
// Kept off the page: keys and plumbing, not facts about the party.
const PARTY_SKIP = new Set(['id', 'party_name', 'name_key', 'extra', 'kyc_docs', 'created_at', 'updated_at']);

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
  Object.keys(extra).sort().forEach((k) => add(k, typeof extra[k] === 'object' ? JSON.stringify(extra[k]) : extra[k]));
  return out;
}

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
  const header = (
    <table className="el-ffrhead">
      <tbody>
        <tr>
          <td className="el-h-logo" rowSpan={2}><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
          <td className="el-h-mid">{FFR_HEADER.org}<br />{FFR_HEADER.dept}</td>
          <td className="el-h-page" rowSpan={2}>{FFR_HEADER.pageLabel}</td>
        </tr>
        <tr><td className="el-h-mid el-h-title">{EQUIPMENT_LIST_TITLE}</td></tr>
      </tbody>
    </table>
  );
  return (
    <>
      <div className="el-fixed-head">{header}</div>
      <div className="el-fixed-foot">{FFR_FOOTER.notice}</div>
      <table className="el-frame">
        <thead><tr><td><div className="el-head-space" /></td></tr></thead>
        <tfoot><tr><td><div className="el-foot-space" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="el-party">
            <div className="el-party-name">{s(party, 'party_name')}</div>
            <div className="el-party-facts">
              {facts.map(([label, value]) => (
                <div key={label} className="el-fact"><span>{label}</span><b>{value}</b></div>
              ))}
            </div>
            <div className="el-meta">
              <span><b>List:</b> {meta.filterLabel}</span>
              <span><b>Machines:</b> {rows.length}</span>
              <span><b>Generated by:</b> {meta.generatedBy}</span>
              <span><b>Generated on:</b> {meta.generatedAt}</span>
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
        </td></tr></tbody>
      </table>
    </>
  );
}
