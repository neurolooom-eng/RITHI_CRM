// ===========================================================================
// QUOTATIONS -- the rules behind the Quotations screen and the printed
// quotation (0428; the user, 2026-10-13: "Quote Generation for Both Product
// Contract + Spares").
//
// A quotation is a header and its lines; a line is a CONTRACT line (one
// machine, AMC or CMC, a period, a rate) or a SPARE line (a Part Master part,
// quantity, unit price). The arithmetic on a line -- taxable, GST, total -- is
// the DATABASE'S (generated columns on quotation_lines); what is here is the
// client's COPY of the same three expressions for the as-you-type preview and
// the printed totals of a quotation read back. quotations_test.sql asserts
// the two agree on the awkward cases, and `check:ui` pins the rounding.
//
// It is a module of its own, with no import of supabase.ts, for the paging.ts
// reason: that module reads import.meta.env and nothing in it can be tested
// as behaviour from a node script.
// ===========================================================================
import { addPeriod, dayAfter, formatDay } from './dates';
import { GST_PERCENT } from './coverspec';

export type QuoteLineType = 'Contract' | 'Spare';
export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Cancelled';

export const QUOTE_STATUSES: QuoteStatus[] = ['Draft', 'Sent', 'Accepted', 'Declined', 'Cancelled'];
/** Frozen: the database refuses any change to the header or the lines. */
export const FROZEN_STATUSES: QuoteStatus[] = ['Accepted', 'Declined', 'Cancelled'];
export const isFrozen = (status: unknown): boolean => FROZEN_STATUSES.includes(String(status ?? '') as QuoteStatus);

/** Where a quotation may move from where it is. A frozen one moves nowhere. */
export function nextStatuses(status: unknown): QuoteStatus[] {
  switch (String(status ?? '')) {
    case 'Draft': return ['Sent', 'Accepted', 'Declined', 'Cancelled'];
    case 'Sent': return ['Accepted', 'Declined', 'Cancelled', 'Draft'];
    default: return [];
  }
}

export const QUOTE_COVER_TYPES = ['AMC', 'CMC'];
/** How long a quotation stands, by default: 30 days from its date. */
export const DEFAULT_VALIDITY_DAYS = 30;
export const DEFAULT_GST_PCT = GST_PERCENT;

export const DEFAULT_TERMS = [
  'Prices are in Indian Rupees, exclusive of GST unless shown; GST is charged at the rate in force on the date of invoice.',
  'Payment: 100% in advance against Proforma Invoice, unless agreed otherwise in writing.',
  'Spares are supplied subject to availability; delivery 2 to 4 weeks from receipt of a confirmed order.',
  'A service contract starts on the date agreed and covers the machines, serials and period stated on the quotation only.',
  'Freight, insurance and installation are extra unless stated above.',
  'This quotation is valid until the date shown; thereafter prices are subject to confirmation.',
].join('\n');

export interface QuoteLineInput {
  qty: unknown;
  unit_price: unknown;
  discount_pct?: unknown;
  gst_pct?: unknown;
}
export interface QuoteLineAmounts { taxable: number; tax: number; total: number }

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
/** Postgres `round(numeric, 2)` -- half away from zero, which is not what
 *  JavaScript's Math.round does for a negative, and not what toFixed does
 *  for 1.005. The amounts here are never negative, so rounding half up on
 *  the scaled value matches the database to the paisa. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The database's three generated columns, in the same order of rounding:
 *  taxable is rounded first and GST is taken from the ROUNDED taxable, so a
 *  line's total is always its two printed figures added together. */
export function lineAmounts(l: QuoteLineInput): QuoteLineAmounts {
  const qty = num(l.qty, 0);
  const price = num(l.unit_price, 0);
  const disc = num(l.discount_pct, 0);
  const gst = num(l.gst_pct, DEFAULT_GST_PCT);
  const taxable = round2(qty * price * (1 - disc / 100));
  const tax = round2(taxable * gst / 100);
  return { taxable, tax, total: round2(taxable + tax) };
}

export interface QuoteTotals extends QuoteLineAmounts {
  lines: number; contractLines: number; spareLines: number;
}
export function quoteTotals(lines: (QuoteLineInput & { line_type?: unknown })[]): QuoteTotals {
  const t: QuoteTotals = { taxable: 0, tax: 0, total: 0, lines: 0, contractLines: 0, spareLines: 0 };
  for (const l of lines) {
    const a = lineAmounts(l);
    t.taxable = round2(t.taxable + a.taxable);
    t.tax = round2(t.tax + a.tax);
    t.total = round2(t.total + a.total);
    t.lines += 1;
    if (l.line_type === 'Contract') t.contractLines += 1;
    else if (l.line_type === 'Spare') t.spareLines += 1;
  }
  return t;
}

/** What a quotation carries, in a word or two, for the register. */
export function quoteContents(contractLines: unknown, spareLines: unknown): string {
  const c = num(contractLines), s = num(spareLines);
  const parts: string[] = [];
  if (c) parts.push(`${c} machine${c === 1 ? '' : 's'} on contract`);
  if (s) parts.push(`${s} spare line${s === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'No lines yet';
}

/** The last day of a contract period: the contract form's own rule
 *  (addPeriod, months only), so a quotation and the contract it becomes end
 *  on the same day. '' where either input is missing. */
export function periodEndFor(startIso: string, months: unknown): string {
  const m = num(months, 0);
  if (!startIso || m <= 0) return '';
  return addPeriod(startIso, 0, m);
}
/** The day a renewal would start: the day after the current cover ends. */
export const startAfter = (coverEndIso: string): string => (coverEndIso ? dayAfter(coverEndIso) : '');

/** "01-Apr-2026 to 31-Mar-2027 (12 months)" for a contract line. */
export function periodText(start: unknown, end: unknown, months: unknown): string {
  const s = start ? formatDay(start) : '';
  const e = end ? formatDay(end) : '';
  const m = num(months, 0);
  const range = s && e ? `${s} to ${e}` : s ? `from ${s}` : '';
  const mm = m ? `${m} month${m === 1 ? '' : 's'}` : '';
  return range && mm ? `${range} (${mm})` : range || mm;
}

// ---------------------------------------------------------------------------
// AMOUNT IN WORDS, the Indian way: lakhs and crores, rupees and paise. A
// printed quotation carries the grand total in words under the figure, so a
// misread digit is caught by the reader.
// ---------------------------------------------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const out: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) out.push(`${ONES[h]} Hundred`);
  if (r) {
    if (r < 20) out.push(ONES[r]);
    else out.push(TENS[Math.floor(r / 10)] + (r % 10 ? ` ${ONES[r % 10]}` : ''));
  }
  return out.join(' ');
}
function wholeInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${wholeInWords(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}
/** "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Six and Paise Fifty Only". */
export function amountInWords(amount: unknown): string {
  const v = num(amount, NaN);
  if (!Number.isFinite(v) || v < 0) return '';
  const whole = Math.floor(round2(v));
  const paise = Math.round((round2(v) - whole) * 100);
  const words = `Rupees ${wholeInWords(whole)}`;
  return paise ? `${words} and Paise ${wholeInWords(paise)} Only` : `${words} Only`;
}

/** ₹ 12,34,506.50 -- always two decimals, so a column of figures lines up. */
export function money(v: unknown): string {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Why a quotation cannot be saved yet, in the user's words; [] when it can. */
export function quoteProblems(h: { party_name?: unknown; quote_date?: unknown; valid_until?: unknown },
  lines: { line_type?: unknown; description?: unknown; serial_number?: unknown; cover_type?: unknown;
           period_months?: unknown; part_code?: unknown; qty?: unknown; unit_price?: unknown;
           discount_pct?: unknown; gst_pct?: unknown }[]): string[] {
  const out: string[] = [];
  if (!String(h.party_name ?? '').trim()) out.push('Party Name');
  if (!h.quote_date) out.push('Quotation Date');
  if (h.valid_until && h.quote_date && String(h.valid_until) < String(h.quote_date)) out.push('Valid Until is before the Quotation Date');
  if (!lines.length) out.push('at least one line');
  lines.forEach((l, i) => {
    const n = i + 1;
    if (!String(l.description ?? '').trim()) out.push(`line ${n}: description`);
    if (l.line_type === 'Contract') {
      if (!String(l.serial_number ?? '').trim()) out.push(`line ${n}: the machine's serial`);
      if (!QUOTE_COVER_TYPES.includes(String(l.cover_type ?? ''))) out.push(`line ${n}: AMC or CMC`);
      if (!(num(l.period_months, 0) > 0)) out.push(`line ${n}: period in months`);
    } else if (l.line_type === 'Spare') {
      if (!String(l.part_code ?? '').trim()) out.push(`line ${n}: a part from the Part Master`);
    } else out.push(`line ${n}: Contract or Spare`);
    if (!(num(l.qty, 0) > 0)) out.push(`line ${n}: quantity above 0`);
    if (!(num(l.unit_price, -1) >= 0)) out.push(`line ${n}: a unit price`);
    const d = num(l.discount_pct, 0);
    if (d < 0 || d > 100) out.push(`line ${n}: discount between 0 and 100`);
    const g = num(l.gst_pct, DEFAULT_GST_PCT);
    if (g < 0 || g > 100) out.push(`line ${n}: GST between 0 and 100`);
  });
  return out;
}
