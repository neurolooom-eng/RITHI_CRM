import { excelSerial, formatDayTime, hasClockTime } from './dates';
// ===========================================================================
// A WORKBOOK WITH SHEETS, WITHOUT A DEPENDENCY.
//
// The evidence behind a quality objective is three things — the calls, the
// machines they were counted against, and the arithmetic — and a CSV can only
// carry one of them. So this writes a real .xlsx: three tabs, opened by Excel
// with no warning and no conversion step.
//
// It is ~100 lines rather than a library because this project runs on four
// runtime dependencies, and in a validated system every one of them is a thing
// somebody has to justify. An .xlsx is a ZIP of XML; the only awkward parts are
// a CRC and an offset table, and both are written out below.
//
// STORED, not deflated: no compression means no compressor. An evidence file is
// a few thousand rows of text and is opened once, so the bytes are cheaper than
// the code that would save them.
//
// Inline strings rather than a shared-string table, for the same reason: one
// fewer part, and one fewer index to keep in step.
// ===========================================================================

import { enc, xmlText, zipStore, download } from './zip';

export interface Sheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// A DATE CELL, so Excel holds a date rather than a string that looks like one.
//
// Reported from use (2026-09-18): "those Date Fields are not Complaint with the
// Long Date Format of Excel". A formatted string is TEXT to Excel — it cannot
// be sorted into order, filtered by month, subtracted from another, or given
// the reader's own date format. Worse, every one of those operations quietly
// returns something rather than refusing, so a column of dates that is really
// text is wrong in a way nobody sees.
//
// A real date cell is a NUMBER plus a format: the serial goes in `<v>`, and `s`
// points at an entry in styles.xml that tells Excel to render it as a date.
// Both formats below are the ones the user asked for.
// ---------------------------------------------------------------------------
export interface XlsxDate { __xlsxDate: number; withTime: boolean }
export const xlsxDate = (serial: number, withTime: boolean): XlsxDate =>
  ({ __xlsxDate: serial, withTime });


// ===========================================================================
// ONE VALUE, TWO DESTINATIONS — and neither of them is the wire.
//
// Extracted from ReportBuilder (0.9.320) so a second export screen cannot
// quietly grow a third opinion about what a date is. The Consumption Report
// carried `2026-09-18T08:51:02.55+00:00` into a file opened in Excel once
// already; "Solved Without a Report" shipped with the same fault a day later,
// because its CSV was built from `String(value)`. Two screens, one bug, twice
// — which is the definition of a thing that belongs in one place.
//
// A DATE IN AN .XLSX IS A NUMBER PLUS A FORMAT, never a formatted string:
// Excel cannot sort, filter by month, subtract or re-format a string, and each
// of those returns something WRONG rather than refusing.
//
// A NUMBER MUST STAY A NUMBER, and `typeof v === 'number'` is the whole test.
// PostgREST sends Postgres's numeric columns as JSON numbers and its text
// columns as strings, so this converts exactly the columns the database calls
// numbers. Widening it to numeric-LOOKING strings is the MP-010 mistake in the
// other direction: a Serial No, Call Number, Contract No or UCN of all digits
// would lose its leading zeros and stop being an identifier.
// ===========================================================================

/** The cell an .xlsx should carry: a real number, a real date, or text. */
export function xlsxCell(v: unknown): unknown {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const serial = excelSerial(v ?? '');
  // Not a date -- a part code, a UCN, a remark. Text, untouched.
  if (serial === null) return formatDayTime(v ?? '');
  return xlsxDate(serial, hasClockTime(v));
}

/** The same value for a CSV, which can only carry text. */
export function xlsxText(v: unknown): string {
  return formatDayTime(v ?? '');
}
const isXlsxDate = (v: unknown): v is XlsxDate =>
  typeof v === 'object' && v !== null && typeof (v as XlsxDate).__xlsxDate === 'number';

// Style indexes into cellXfs below: 0 general, 1 date+time, 2 date only.
const STYLE_DATETIME = 1;
const STYLE_DATE = 2;

// Excel is strict about this part: `fills` must carry BOTH the none and the
// gray125 entries or it calls the file corrupt, and the custom formats have to
// start at 164 because everything below is reserved.
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2">'
  + '<numFmt numFmtId="164" formatCode="dd-mmm-yyyy hh:mm:ss"/>'
  + '<numFmt numFmtId="165" formatCode="dd-mmm-yyyy"/>'
  + '</numFmts>'
  + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border/></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';



// XML text. `&` is replaced FIRST or it would escape the escapes. Control
// characters are stripped because Excel REFUSES a file containing one — a
// stray character in a complaint would take the whole workbook down rather
// than spoil a single cell.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const xml = xmlText;

// Excel refuses these characters in a tab name and silently truncates past 31
// — which would make two sheets collide and lose one.
const safeName = (n: string, i: number) => {
  const cleaned = String(n || '').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${i + 1}`;
};

const colRef = (n: number) => {
  let s = '';
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

function sheetXml(sheet: Sheet): string {
  const cell = (r: number, c: number, v: unknown) => {
    const ref = `${colRef(c)}${r}`;
    // A DATE IS A NUMBER WITH A FORMAT, not a string that reads like one.
    if (isXlsxDate(v)) {
      const st = v.withTime ? STYLE_DATETIME : STYLE_DATE;
      return `<c r="${ref}" s="${st}"><v>${v.__xlsxDate}</v></c>`;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    const s = String(v ?? '');
    if (s === '') return '';
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(s)}</t></is></c>`;
  };
  const head = `<row r="1">${sheet.columns.map((h, c) => cell(1, c, h)).join('')}</row>`;
  const body = sheet.rows.map((row, i) =>
    `<row r="${i + 2}">${sheet.columns.map((h, c) => cell(i + 2, c, row[h])).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${head}${body}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map((s, i) => safeName(s.name, i));
  const parts: { path: string; data: Uint8Array }[] = [
    { path: '[Content_Types].xml', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>') },
    { path: '_rels/.rels', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>') },
    { path: 'xl/workbook.xml', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>') },
    { path: 'xl/_rels/workbook.xml.rels', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      // The styles part needs a relationship id of its own, AFTER the sheets so
      // theirs still line up with the sheetId in workbook.xml.
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>') },
    { path: 'xl/styles.xml', data: enc(STYLES_XML) },
    ...sheets.map((s, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s)) })),
  ];

  return zipStore(parts);
}

export function xlsxDownload(filename: string, sheets: Sheet[]): void {
  download(filename, buildXlsx(sheets),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
