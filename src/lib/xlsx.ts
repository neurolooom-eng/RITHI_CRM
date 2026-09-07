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

export interface Sheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = (s: string) => new TextEncoder().encode(s);

// XML text. `&` is replaced FIRST or it would escape the escapes. Control
// characters are stripped because Excel REFUSES a file containing one — a
// stray character in a complaint would take the whole workbook down rather
// than spoil a single cell.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const xml = (v: unknown) => String(v ?? '')
  .replace(CONTROL_CHARS, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

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
      + '</Relationships>') },
    ...sheets.map((s, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s)) })),
  ];

  // ---- the ZIP ------------------------------------------------------------
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  for (const p of parts) {
    const name = enc(p.path);
    const crc = crc32(p.data);
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(p.data.length), ...u32(p.data.length),
      ...u16(name.length), ...u16(0), ...name,
    ]);
    chunks.push(local, p.data);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(p.data.length), ...u32(p.data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...name,
    ]));
    offset += local.length + p.data.length;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(parts.length), ...u16(parts.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  const total = chunks.reduce((a, c) => a + c.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; }
  return out;
}

export function xlsxDownload(filename: string, sheets: Sheet[]): void {
  const blob = new Blob([buildXlsx(sheets) as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
