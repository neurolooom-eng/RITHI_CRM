// ===========================================================================
// THE FIELD FAILURE REPORT AS A WORD DOCUMENT — R-SER-03 Rev 02.
//
// WHY THIS WRITES THE DOCUMENT RATHER THAN FILLING THE TEMPLATE.
//
// The supplied template is an AutoCrat form: its fields are `<<Column Name>>`
// tags matching the register's headings. Filling it in the browser would mean
// reading a .docx (so an inflater), patching `word/document.xml`, and writing it
// back. And the tags DO NOT SURVIVE AS TEXT: Word splits them across runs, so
// `<<Customer Name>>` is stored as `<<` in one run and `Customer Name>>` in the
// next. A search-and-replace finds nothing; joining runs first is a second
// parser to get right.
//
// So the template is treated as the SPECIFICATION for the document — its
// layout, its wording and its field set — and the document is written from
// that. The form number and revision are carried on the page, so a reader can
// tell which controlled form it follows.
//
// THIS IS A DIFFERENCE WORTH KNOWING: the output matches the controlled form,
// it is not a copy of the controlled file. If byte-fidelity to the .docx is
// required for the QMS, that is the inflater route above and a decision for
// RA/QA rather than something to assume.
//
// The file itself is a ZIP of XML, written with zip.ts — the same writer the
// workbook export uses.
// ===========================================================================
import { enc, xmlText, zipStore, download } from './zip';

/** Everything the report prints. The names are the register's, not the sheet's
 *  column letters, so a reader of this file can see what fills each box. */
export interface FfrDocFields {
  ffrNo: string;
  ffrDate: string;
  customerName: string;
  place: string;
  crnNo: string;            // the UCN
  crnDate: string;
  productName: string;
  itemCode: string;
  productSerial: string;
  cover: string;            // WGP / OGP / AMC
  problemReported: string;
  additionalProblem: string;
  serviceObservation: string;
  problemStatus: string;
  capaNo: string;
  raisedBy: string;
}

const FORM_ID = 'R-SER-03';
const FORM_REV = 'Rev 02';

// ---- the small amount of WordprocessingML this needs ----------------------
const B = (t: string) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`;
const T = (t: string) => `<w:r><w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`;

/** A paragraph. Multi-line text becomes several paragraphs, because a newline
 *  inside a <w:t> is not a line break in Word — it is whitespace, and the
 *  observation field is where somebody notices. */
function para(runs: string, opts: { align?: string; size?: number } = {}): string {
  const pr = `<w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}`
    + `<w:spacing w:after="40"/>${opts.size ? `<w:rPr><w:sz w:val="${opts.size}"/></w:rPr>` : ''}</w:pPr>`;
  return `<w:p>${pr}${runs}</w:p>`;
}

const lines = (label: string, value: string): string => {
  const parts = String(value ?? '').split(/\r?\n/);
  return [para(B(label)), ...parts.map((l) => para(T(l)))].join('');
};

/** One cell of the two-column information grid. */
const cell = (w: number, body: string) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${body || para(T(''))}</w:tc>`;

const row = (cells: string) => `<w:tr>${cells}</w:tr>`;

/** A full-width row that spans both columns. */
const wide = (body: string) =>
  row(`<w:tc><w:tcPr><w:tcW w:w="9360" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>${body}</w:tc>`);

const pair = (l: string, r: string) => row(cell(4680, l) + cell(4680, r));

const field = (label: string, value: string) =>
  para(B(label) + T(value ? ` ${value}` : ' '));

const section = (title: string) =>
  wide(para(B(title)));

export function buildFfrDocx(f: FfrDocFields): Uint8Array {
  const body = [
    para(B(`FFR No. : ${f.ffrNo}`)),
    para(T(`Date: ${f.ffrDate}`)),
    '<w:p/>',
    '<w:tbl>'
    + '<w:tblPr><w:tblW w:w="9360" w:type="dxa"/>'
    + '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="6" w:color="000000"/>`).join('')
    + '</w:tblBorders></w:tblPr>'
    + '<w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid>'
    + section('Customer Information')
    + pair(field('Hospital Name :', f.customerName), field('Complaint Date :', f.crnDate))
    + pair(field('Address :', f.place), field('Phone No :', ''))
    + pair(field('Contact person :', ''), field('Email :', ''))
    + section('Equipment Information')
    + pair(field('UC Number :', f.crnNo), field('Model :', f.itemCode))
    + pair(field('Equipment Name :', f.productName), field('Software Details :', ''))
    + pair(field('Serial No :', f.productSerial), field('Software :', ''))
    + pair(field('Punched S. No :', ''), field('Equipment status :', f.cover))
    + wide(lines('Problem Description :', [f.problemReported, f.additionalProblem].filter(Boolean).join('\n')))
    + wide(lines('Service Department Observation', f.serviceObservation))
    + wide(field('CAPA No :', f.capaNo) + lines('Problem Status :', f.problemStatus))
    + wide(para(B('Raised by: ') + T(f.raisedBy)) + para(T('')) + para(B('Signature:')))
    + '</w:tbl>',
    para(T(`${FORM_ID} ${FORM_REV}`), { size: 16 }),
  ].join('');

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}`
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
    + '</w:body></w:document>';

  return zipStore([
    { path: '[Content_Types].xml', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml"'
      + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>') },
    { path: '_rels/.rels', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1"'
      + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
      + ' Target="word/document.xml"/>'
      + '</Relationships>') },
    { path: 'word/document.xml', data: enc(documentXml) },
  ]);
}

/** The file name somebody will look for later: the register's own
 *  "FFR - 001/26 - MONNAL T75 ( 11125 )", with the slash made safe. */
export function ffrDocName(f: FfrDocFields): string {
  const base = `${f.ffrNo} - ${f.productName} ( ${f.productSerial} )`.trim();
  return `${base.replace(/[\\/:*?"<>|]/g, '-')}.docx`;
}

export function ffrDocDownload(f: FfrDocFields): void {
  download(ffrDocName(f), buildFfrDocx(f),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
