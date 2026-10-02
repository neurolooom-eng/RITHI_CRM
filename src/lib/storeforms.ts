// ===========================================================================
// THE TWO STORES RECORDS, as data (2026-10-02).
//
//   R/SER/STR/003  MATERIAL TRANSFER NOTE (MTN) -- one Stock Transfer.
//   R/SER/STR/002  MATERIAL RETURN NOTE (MRN)   -- one Material Return.
//
// The user photographed both paper records and asked for them printed from
// what RITHI already holds -- "PRINT WHAT EXISTS" for the MRN: no new form
// fields. The wording, the record block and the column headings are the
// paper's, kept here once so the page and anything else that prints them read
// one definition (the reason indoorforms.ts and ffrform.ts exist).
// ===========================================================================
import { partCode } from './parts';
import { partDescription } from './handstock';

export const STORES_ORG = 'AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.';
export const STORES_DEPT = 'SERVICE';

/** The RECORD block at the top right of each form, as printed. */
export interface RecordBlock { docRef: string; issue: string; rev: string }

export const MTN_FORM = {
  title: 'MATERIAL TRANSFER NOTE (MTN)',
  record: { docRef: 'R/SER/STR/003', issue: '02 01.11.09', rev: '00 01.11.09' } as RecordBlock,
  labels: { docRef: 'DOC. REF', issue: 'ISSUE No./DATE', rev: 'REV. No./DATE', page: 'PAGE No.' },
  columns: ['S.No.', 'Part No.', 'Description', 'Qty.', 'Reason for Transfer', 'Remarks'],
  signBoxes: ['Issued By (With Date)', 'Received By (With Date)', 'Authorised By', 'Entered By'],
} as const;

export const MRN_FORM = {
  title: 'MATERIAL RETURN NOTE (MRN)',
  record: { docRef: 'R/SER/STR/002', issue: '02 01.11.09', rev: '00 01.11.09' } as RecordBlock,
  labels: { docRef: 'DOC. REF', issue: 'ISSUE NO./DATE', rev: 'REV. NO./DATE', page: 'PAGE NO.' },
  signBoxes: ['Returned By (Engineer Name)', 'Authorized By', 'Received By (Stores In Charge)', 'Entered By (Stores Assistant)'],
} as const;

/** Rows per printed sheet. The pages are cut in code, as the spare DC's are
 *  (lib/dc.ts paginate): the header and the sign boxes then print on every
 *  sheet and PAGE No. can say "n of N", which a browser's own page breaks
 *  cannot. */
export const MTN_ROWS_PER_PAGE = 18;
export const MRN_ROWS_PER_PAGE = 10;

export function pages<T>(rows: T[], per: number): T[][] {
  if (rows.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}

/** A spare's Part No. and Description from its catalogue string
 *  ("CODE|Description"), preferring the separate columns where a register
 *  carries them (the MRN's item_code / item_name). */
export function partCells(part: unknown, code?: unknown, name?: unknown): { partNo: string; description: string } {
  const c = String(code ?? '').trim();
  const n = String(name ?? '').trim();
  return { partNo: c || partCode(part), description: n || partDescription(part) };
}

/** MTN "Reason for Transfer": the line's own reason where one was given, else
 *  the transfer's common remarks (the user: "Optional to keep one common
 *  remark or per item remark"). */
export const mtnReason = (lineReason: unknown, commonRemarks: unknown) =>
  String(lineReason ?? '').trim() || String(commonRemarks ?? '').trim();

/** A name with its place, as "Name & Place" reads: "Ravi Menon, Chennai". */
export const nameAndPlace = (name: string, place: string) =>
  [name.trim(), place.trim()].filter(Boolean).join(', ');

/** MRN quantity: good + defective, the two columns the return records. */
export const mrnQty = (good: unknown, defective: unknown) => {
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  return n(good) + n(defective);
};

/** A number as the form prints it: blank for zero in a condition column, so a
 *  line of three good parts shows 3 under Good and nothing under Damaged. */
export const qtyCell = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x !== 0 ? String(x) : '';
};
