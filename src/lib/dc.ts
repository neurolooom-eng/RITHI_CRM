// ---------------------------------------------------------------------------
// The Delivery Challan document — v2_DCTemplate, as a model.
//
// The template identifies a delivery by **Stock Out No.** and **Stock Out
// Date**; there is no separate challan number on it (and the sheet era's
// column was `SO NO` too), so one number does both jobs — see
// 0028_dc_number_is_stock_out.sql.
//
// The letterhead and the two signature blocks are fixed text on the form. They
// live here rather than in the component so the printed page has one source
// for them, and so a change of address or GSTIN is one edit.
// ---------------------------------------------------------------------------

export const COMPANY = {
  name: 'Air Liquide Medical Systems Pvt Ltd',
  address1: '5th floor Tower B, Campus Tek Meadows, No:51, Rajiv Gandhi Salai, Sholinganallur',
  address2: 'TAMILNADU, INDIA 600 119',
  phone: 'Phone: 044 42823414 , |  Fax:',
  email: 'Email: service.almsindia@airliquide.com | URL: http://www.device.airliquidehealthcare.com',
  gstin: '33AAACE8420F1Z3',
  cin: 'U33112TN1987PTC014641',
  pan: 'AAACE8420F',
} as const;

export const DECLARATION = {
  received: 'Received the above material in good condition',
  forCompany: 'For Air Liquide Medical Systems Pvt Ltd',
  forCustomer: 'For Customer/Engineer',
  signatory: 'Authorised Signatory',
  signatoryStamp: 'Authorised Signatory with Stamp',
} as const;

// One printed line of the challan.
export interface DcLine {
  sr: number;
  orderNo: string;    // the OR the spare was raised on
  itemCode: string;   // the part code
  description: string;
  qty: number;
}

export interface DcDocument {
  stockOutNo: string;
  stockOutDate: string;
  refNo: string;
  refDate: string;
  engineer: string;
  courier: string;
  remarks: string;
  lines: DcLine[];
  totalQty: number;
}

const s = (v: unknown) => String(v ?? '').trim();
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// A spare is stored as "CODE|Description"; the challan prints them in separate
// columns, exactly as the template does.
export const codeOf = (part: unknown): string => s(part).split('|')[0]!.trim().toUpperCase();
export const descOf = (part: unknown): string => {
  const t = s(part);
  const i = t.indexOf('|');
  return (i === -1 ? t : t.slice(i + 1)).trim();
};

// dd-MM-yyyy, the way the form is filled in by hand.
export function dcDate(v: unknown): string {
  const t = s(v);
  if (!t) return '';
  const d = new Date(t.length <= 10 ? `${t}T00:00:00` : t);
  if (Number.isNaN(d.getTime())) return t;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// Build the document from the stock-out header and its spare lines.
export function buildDc(head: Record<string, unknown>, lines: Record<string, unknown>[]): DcDocument {
  const rows: DcLine[] = lines.map((l, i) => ({
    sr: i + 1,
    orderNo: s(l.or_no) || s(l.request_uid),
    itemCode: codeOf(l.part),
    description: descOf(l.part),
    qty: n(l.qty),
  }));
  return {
    stockOutNo: s(head.uid),
    // The challan number and the stock out are the same number; if an older
    // row carries a different one, the challan still shows what it was sent on.
    stockOutDate: dcDate(head.dc_date ?? head.dispatched_at),
    refNo: s(head.ref_no),
    refDate: dcDate(head.ref_date),
    engineer: s(head.engineer),
    courier: s(head.courier),
    remarks: s(head.remarks),
    lines: rows,
    totalQty: rows.reduce((t, r) => t + r.qty, 0),
  };
}

// ---------------------------------------------------------------------------
// The DECLARATION lists what is IN THE PARCEL, so the same part sent twice is
// one line with a quantity of two. (The challan keeps them apart: each of its
// lines carries the order it was raised against, and merging them would lose
// that. The two documents answer different questions from the same dispatch.)
// ---------------------------------------------------------------------------
export function mergeDcLines(lines: DcLine[]): DcLine[] {
  const by = new Map<string, DcLine>();
  lines.forEach((l) => {
    const k = `${l.itemCode.trim().toLowerCase()}|${l.description.trim().toLowerCase()}`;
    const had = by.get(k);
    if (had) had.qty += l.qty;
    else by.set(k, { ...l });
  });
  return [...by.values()].map((l, i) => ({ ...l, sr: i + 1 }));
}

// The template prints a grid of 20 rows per sheet, and that is exactly what
// one A4 page holds once the letterhead (60mm) and the repeated signature
// block (69mm) are taken out of 259mm of usable height. So the pages are cut
// here rather than left to the browser:
//
// A browser will repeat a table's <thead> on every printed page, but Chromium
// prints <tfoot> only on the LAST page, and a position:fixed footer repeats
// without reserving any space — it simply paints over the last rows (verified,
// both of them). Cutting the pages ourselves is the only way to get the
// letterhead AND the signature block on every sheet with nothing hidden.
export const ROWS_PER_PAGE = 20;

export interface DcPage {
  rows: (DcLine | null)[];   // null = an empty row of the grid
  first: boolean;
  last: boolean;
  page: number;
  pages: number;
}

export function paginate(lines: DcLine[], perPage = ROWS_PER_PAGE): DcPage[] {
  const pages = Math.max(1, Math.ceil(lines.length / perPage));
  return Array.from({ length: pages }, (_, i) => {
    const rows: (DcLine | null)[] = lines.slice(i * perPage, (i + 1) * perPage);
    // Every sheet shows the full grid, so a part-filled last page still reaches
    // the signature block the way the printed form does.
    while (rows.length < perPage) rows.push(null);
    return { rows, first: i === 0, last: i === pages - 1, page: i + 1, pages };
  });
}
