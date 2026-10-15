// ===========================================================================
// A MACHINE'S COVER, AS OF TODAY (the user, 2026-10-15, Product & Party Search:
// "Current Item Status ... If warranty is Active then highlight those details,
// if Contract is active highlight those details. Add a Filter with Potential
// Expiry in the Current and Next Month. And a Separate filter for Products in
// OGP").
//
// Settled with the user the same day:
//   * the CURRENT status is worked out for TODAY from the dates, by the
//     database's own rule (sync_product_machine, 0391): a contract active
//     today is its type (CMC / AMC); else a warranty active today is WGP; else
//     a machine with any warranty or contract on record is OGP; one with none
//     keeps the status it was stored with. The stored status is only worked
//     out when a machine's records change, so it can be days out of date;
//   * EXPIRING is a warranty OR contract still active today whose end date
//     falls on or before the last day of NEXT month.
//
// Pure, no imports beyond the cover vocabulary, and TODAY is passed in -- so
// check:ui can pin the rule itself. Dates are yyyy-mm-dd and compare as text.
// ===========================================================================
import { coverCode } from './fieldcall';

type Sheet = Record<string, unknown>;
const s = (r: Sheet, k: string) => String(r[k] ?? '').trim();
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export const warrantyEnd = (r: Sheet) => day(s(r, 'Warranty End Date'));
export const contractEnd = (r: Sheet) => day(s(r, 'Contract End Date'));

/** The warranty is in force today. */
export function warrantyActive(r: Sheet, today: string): boolean {
  const e = warrantyEnd(r);
  return !!e && e >= today;
}
/** The contract is in force today. */
export function contractActive(r: Sheet, today: string): boolean {
  const e = contractEnd(r);
  return !!e && e >= today;
}

/** The cover a machine has TODAY: CMC / AMC / WGP / OGP, else as stored. */
export function currentItemStatus(r: Sheet, today: string): string {
  if (contractActive(r, today)) return coverCode(s(r, 'Contract Type')) || 'CMC';
  if (warrantyActive(r, today)) return 'WGP';
  const onRecord = warrantyEnd(r) || contractEnd(r) || s(r, 'Warranty Number') || s(r, 'Contract Number');
  if (onRecord) return 'OGP';
  return coverCode(s(r, 'Item Status'));
}

/** The last day of the month after `today`'s, yyyy-mm-dd. */
export function endOfNextMonth(today: string): string {
  // Arithmetic on the calendar, not a Date: no time zone can move the day.
  const [y, m] = today.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const leap = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][nm - 1];
  return `${ny}-${String(nm).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
}

/** What is about to lapse: the warranty and / or contract active today and
 *  ending by the end of next month, in words; '' when neither. */
export function expiringCover(r: Sheet, today: string): string {
  const by = endOfNextMonth(today);
  const parts: string[] = [];
  const w = warrantyEnd(r), c = contractEnd(r);
  if (w && w >= today && w <= by) parts.push(`Warranty ${w}`);
  if (c && c >= today && c <= by) parts.push(`Contract ${c}`);
  return parts.join(' · ');
}
