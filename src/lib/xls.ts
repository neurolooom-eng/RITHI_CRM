import { download } from './zip';
import { excelSerial, formatDayTime, hasClockTime } from './dates';

// ===========================================================================
// A .xls FILE, AND AN HONEST ONE.
//
// The user, 2026-09-24, asked for three exports: `.csv`, `.xlsx` and `.xls`.
//
// WHAT THIS IS NOT: the old BIFF binary format Excel 97-2003 wrote. Writing
// that faithfully in a browser is a compound-document container and a record
// stream, and a half-right one is a file Excel refuses — which is worse than
// not offering it.
//
// WHAT IT IS: SpreadsheetML 2003, Microsoft's own XML spreadsheet format,
// which every Excel since 2002 opens natively. It is chosen over the two
// alternatives for one reason — IT KEEPS THE TYPES. The usual trick of writing
// an HTML table and calling it .xls loses them: every number arrives as text,
// and this project has measured what that costs twice (Line ID sorting 1, 10,
// 100, 2 and a SUM over QTY answering 0). Here a number is `Type="Number"` and
// a date is `Type="DateTime"`, so Excel sorts, sums and filters them.
//
// SAY THE ONE THING IT COSTS: Excel 2010 and later show "the file format and
// extension don't match" before opening it, because SpreadsheetML normally
// carries a .xml extension. It opens correctly after that prompt. The screen
// says so beside the button rather than leaving somebody to wonder whether the
// file is broken — .xlsx is the better choice unless something downstream
// demands the old name.
//
// SAME CELL RULE AS THE .XLSX, deliberately: a real number stays a number, a
// real date becomes a date, everything else is text left exactly as it arrived.
// Two writers disagreeing about what a value IS would be the `MP-010` fault in
// a second place.
// ===========================================================================

export interface XlsSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

const xml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // A control character is not representable in XML 1.0 and makes the file
  // unopenable rather than ugly. Dropped, not escaped.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

// Excel's sheet-name rules, the same ones the .xlsx writer honours: 31
// characters, and none of \ / ? * [ ] :
const safeName = (name: string, i: number) =>
  (name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;

// SpreadsheetML wants a DateTime as ISO 8601, not as Excel's day serial — the
// serial is the .xlsx's representation and putting one here yields a cell
// reading 46000. `excelSerial()` is still the test for "is this a date at all",
// so the two writers agree on WHICH values are dates even though they spell
// them differently.
const isoForExcel = (v: unknown): string | null => {
  if (excelSerial(v) === null) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000`;
};

function cell(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  const iso = isoForExcel(v);
  if (iso !== null) {
    const style = hasClockTime(v) ? 'sDateTime' : 'sDate';
    return `<Cell ss:StyleID="${style}"><Data ss:Type="DateTime">${iso}</Data></Cell>`;
  }
  const s = formatDayTime(v ?? '');
  if (s === '') return '<Cell/>';
  return `<Cell><Data ss:Type="String">${xml(s)}</Data></Cell>`;
}

/** The whole workbook as SpreadsheetML 2003 text. */
export function buildXls(sheets: XlsSheet[]): string {
  const body = sheets.map((s, i) => {
    const head = `<Row>${s.columns.map((c) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${xml(c)}</Data></Cell>`).join('')}</Row>`;
    const rows = s.rows.map((r) => `<Row>${s.columns.map((c) => cell(r[c])).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="${xml(safeName(s.name, i))}"><Table>${head}${rows}</Table></Worksheet>`;
  }).join('');

  return '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    + '<Styles>'
    + '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>'
    + '<Style ss:ID="sHead"><Font ss:Bold="1"/></Style>'
    // The same two formats the .xlsx uses, month NAMED so a date cannot be read
    // the other way round — the project's one display rule, carried into the file.
    + '<Style ss:ID="sDate"><NumberFormat ss:Format="dd-mmm-yyyy"/></Style>'
    + '<Style ss:ID="sDateTime"><NumberFormat ss:Format="dd-mmm-yyyy hh:mm:ss"/></Style>'
    + '</Styles>'
    + body
    + '</Workbook>';
}

export function xlsDownload(filename: string, sheets: XlsSheet[]): void {
  download(filename, new TextEncoder().encode(buildXls(sheets)), 'application/vnd.ms-excel');
}
