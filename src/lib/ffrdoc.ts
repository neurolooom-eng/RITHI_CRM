// ===========================================================================
// THE FIELD FAILURE REPORT AS A WORD DOCUMENT — R-SER-03 Rev 02.
//
// "FFR word copy has to be exactly same as the template" (the user,
// 2026-09-12). It now is, and the difference from the first version is worth
// stating because it was a deliberate decision that turned out to be the wrong
// one:
//
// THE FIRST VERSION TREATED THE TEMPLATE AS A SPECIFICATION and wrote a
// document that carried the same FIELDS in a tidier layout. That is not what a
// controlled form is. R-SER-03 is a numbered, revision-controlled record; a
// document that holds the same information in a different shape is a different
// form, however good it looks.
//
// SO THE LAYOUT IS NOW TAKEN FROM THE TEMPLATE FILE ITSELF — its header band
// with the mark, department and page number, its title, its two-column grid at
// the template's own 6435/4500 split, every label with the template's exact
// wording and internal spacing, its page size and margins, and its footer with
// the property notice and `TMPL No: R/SER/03 Rev: MAR 2020`. The rows live in
// ffrform.ts and the printable HTML page renders the SAME rows, so the two
// cannot drift apart.
//
// IT IS STILL WRITTEN RATHER THAN FILLED IN, and that is not a shortcut. The
// template's `<<Customer Name>>` tags are AutoCrat merge fields, and Word does
// not store them as text: it splits `<<Customer Name>>` across runs, so a
// search-and-replace inside the .docx finds nothing and joining runs first is a
// second parser to get right. Writing the document from the extracted layout
// gives byte-level control of the result and no dependency on how Word happened
// to split a run that day.
//
// WHAT THIS MEANS FOR RA/QA: the output matches the controlled form's layout,
// labels, page setup and form identity. It is not a copy of the controlled
// FILE. If byte-fidelity to the .docx is required, that is the inflater route
// and a decision for RA/QA rather than something to assume.
// ===========================================================================
import { enc, xmlText, zipStore, download, dataUriBytes, pngSize } from './zip';
import {
  FFR_ROWS, FFR_HEADER, FFR_FOOTER, FFR_GRID, FFR_PAGE,
  ffrCellValue, ffrProblemText, type FfrCell,
} from './ffrform';

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
  /** THE RAISER'S SAVED SIGNATURE, as a PNG data URI — and only ever when the
   *  person generating the document IS the raiser (src/lib/signature.ts). Left
   *  undefined otherwise, and the block then prints empty to be signed by hand,
   *  exactly as the controlled form is completed today. */
  signature?: string;
  /** The company's mark for the header band. JPEG or PNG bytes; omitted when
   *  the asset could not be read, which costs the document its logo and
   *  nothing else. */
  logo?: Uint8Array;
  logoType?: 'jpeg' | 'png';
}

// ---- the small amount of WordprocessingML this needs ----------------------
// Times New Roman throughout, as the template is set.
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
const rpr = (opts: { b?: boolean; size?: number } = {}) =>
  `<w:rPr>${FONT}${opts.b ? '<w:b/><w:bCs/>' : ''}`
  + `${opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : '<w:sz w:val="22"/><w:szCs w:val="22"/>'}`
  + '</w:rPr>';

const B = (t: string, size?: number) =>
  `<w:r>${rpr({ b: true, size })}<w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`;
const T = (t: string, size?: number) =>
  `<w:r>${rpr({ size })}<w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`;

/** A paragraph. Multi-line text becomes SEVERAL paragraphs, because a newline
 *  inside a <w:t> is not a line break in Word — it is whitespace, and the
 *  observation box is where somebody notices. */
function para(runs: string, opts: { align?: string } = {}): string {
  return `<w:p><w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}`
    + `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rpr()}</w:pPr>${runs}</w:p>`;
}

/** The template's labels are bold and their values are not, which is what makes
 *  a filled form readable as a form. An empty value leaves the label alone. */
const labelled = (c: FfrCell, value: string) =>
  para(B(c.label) + (value ? T(value) : ''));

/** Several paragraphs from text that may carry newlines. */
const multiline = (text: string) => {
  const parts = String(text ?? '').split(/\r?\n/);
  return parts.map((l) => para(l ? T(l) : T(''))).join('');
};

const tc = (w: number, body: string, span = 1) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>`
  + `${body || para(T(''))}</w:tc>`;

const tr = (cells: string) => `<w:tr>${cells}</w:tr>`;

const FULL = FFR_GRID.left + FFR_GRID.right;

const borders = '<w:tblBorders>'
  + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="6" w:color="000000"/>`).join('')
  + '</w:tblBorders>';

// ---------------------------------------------------------------------------
// THE HEADER BAND, exactly as the template's: the mark spanning two rows on the
// left, the organisation and department over the form's title in the middle,
// and the page number spanning two rows on the right. `PAGE` is a Word FIELD,
// not a literal 1 — a report whose observation runs to a second page must
// number it.
// ---------------------------------------------------------------------------
const H_GRID = [2310, 6780, 1815];

function headerXml(hasLogo: boolean): string {
  const pageField = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
    + `<w:r>${rpr()}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>`
    + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
    + `<w:r>${rpr()}<w:t>1</w:t></w:r>`
    + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

  // The template's own extent for the mark, so it prints at the size the
  // controlled form prints it at rather than at whatever the asset happens to
  // measure.
  const logoRun = hasLogo
    ? '<w:r><w:drawing>'
      + '<wp:inline distT="0" distB="0" distL="0" distR="0"'
      + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
      + '<wp:extent cx="1172210" cy="457200"/><wp:docPr id="7" name="Logo"/>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
      + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:nvPicPr><pic:cNvPr id="7" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1172210" cy="457200"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    : '';

  const cell = (w: number, body: string, vMerge?: 'restart' | 'continue') =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>`
    + `${vMerge ? `<w:vMerge w:val="${vMerge}"/>` : ''}`
    + '<w:vAlign w:val="center"/></w:tcPr>'
    + `${body || para(T(''))}</w:tc>`;

  const table = `<w:tbl><w:tblPr><w:tblW w:w="${H_GRID.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders}</w:tblPr>`
    + `<w:tblGrid>${H_GRID.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + tr(cell(H_GRID[0], para(logoRun, { align: 'center' }), 'restart')
      + cell(H_GRID[1], para(B(FFR_HEADER.org), { align: 'center' })
        + para(B(FFR_HEADER.dept), { align: 'center' }))
      + cell(H_GRID[2], para(B(`${FFR_HEADER.pageLabel} `) + pageField), 'restart'))
    + tr(cell(H_GRID[0], '', 'continue')
      + cell(H_GRID[1], para(B(FFR_HEADER.title), { align: 'center' }))
      + cell(H_GRID[2], '', 'continue'))
    + '</w:tbl>';

  return part('w:hdr', table);
}

const footerXml = () => part('w:ftr',
  para(T(FFR_FOOTER.notice, 16), { align: 'center' })
  + para(T(FFR_FOOTER.tmpl, 20), { align: 'center' }));

/** The XML envelope shared by document.xml, header and footer. */
function part(tag: string, body: string): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `${body}</${tag.split(' ')[0]}>`;
}

// ---------------------------------------------------------------------------
// A PICTURE IN A WORD DOCUMENT is four things agreeing: the bytes as a part of
// the ZIP, a content type for its extension, a RELATIONSHIP from the part that
// shows it, and a drawing referencing that relationship by id. Any one missing
// and Word reports the file as CORRUPT rather than as missing a picture — which
// is why an unreadable signature yields no picture at all rather than half of
// one.
//
// EMU is the unit: 914,400 to the inch. The signature's extent is computed from
// its own pixels at 96 dpi and scaled to fit the block, so it keeps its shape —
// a fixed width and height would stretch one person's handwriting into the
// proportions of another's.
// ---------------------------------------------------------------------------
const EMU_PER_PX = 9525;
const SIG_MAX_W_EMU = 2200000;
const SIG_MAX_H_EMU = 700000;
const SIG_REL = 'rIdSig';

function signatureRun(bytes: Uint8Array): string {
  const size = pngSize(bytes);
  if (!size) return '';
  let cx = size.w * EMU_PER_PX;
  let cy = size.h * EMU_PER_PX;
  const k = Math.min(SIG_MAX_W_EMU / cx, SIG_MAX_H_EMU / cy, 1);
  cx = Math.round(cx * k); cy = Math.round(cy * k);
  return '<w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Signature"/>`
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:nvPicPr><pic:cNvPr id="1" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${SIG_REL}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

export function buildFfrDocx(f: FfrDocFields): Uint8Array {
  const sigBytes = f.signature ? dataUriBytes(f.signature) : new Uint8Array(0);
  const sigRun = sigBytes.length ? signatureRun(sigBytes) : '';
  const hasSig = !!sigRun;

  const logoBytes = f.logo ?? new Uint8Array(0);
  const hasLogo = logoBytes.length > 0;
  const logoExt = f.logoType === 'png' ? 'png' : 'jpeg';

  // THE BODY, ROW BY ROW, FROM THE SHARED FORM DEFINITION.
  const rows = FFR_ROWS.map((r) => {
    if (r.kind === 'section') return tr(tc(FULL, para(B(r.title)), 2));
    if (r.kind === 'pair') {
      return tr(
        tc(FFR_GRID.left, labelled(r.left, ffrCellValue(f, r.left.key)))
        + tc(FFR_GRID.right, labelled(r.right, ffrCellValue(f, r.right.key))));
    }
    if (r.kind === 'block') {
      const text = r.key === 'problemReported' ? ffrProblemText(f) : ffrCellValue(f, r.key);
      return tr(tc(FULL, para(B(r.label)) + multiline(text), 2));
    }
    // stack: two labelled lines in one full-width box. The signature line is
    // the one that may carry a picture.
    return tr(tc(FULL, r.lines.map((c) => {
      const isSignature = c.label.startsWith('Signature');
      return para(B(c.label) + (isSignature ? sigRun : (ffrCellValue(f, c.key) ? T(ffrCellValue(f, c.key)) : '')));
    }).join(''), 2));
  }).join('');

  const table = `<w:tbl><w:tblPr><w:tblW w:w="${FULL}" w:type="dxa"/>${borders}</w:tblPr>`
    + `<w:tblGrid><w:gridCol w:w="${FFR_GRID.left}"/><w:gridCol w:w="${FFR_GRID.right}"/></w:tblGrid>`
    + `${rows}</w:tbl>`;

  const sectPr = '<w:sectPr>'
    + '<w:headerReference w:type="default" r:id="rIdHdr"/>'
    + '<w:footerReference w:type="default" r:id="rIdFtr"/>'
    + `<w:pgSz w:w="${FFR_PAGE.w}" w:h="${FFR_PAGE.h}"/>`
    + `<w:pgMar w:top="${FFR_PAGE.top}" w:right="${FFR_PAGE.side}"`
    + ` w:bottom="${FFR_PAGE.bottom}" w:left="${FFR_PAGE.side}" w:header="270" w:footer="720"/>`
    + '</w:sectPr>';

  const documentXml = part('w:document', `<w:body>${table}${sectPr}</w:body>`);

  const rels = (entries: string) =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `${entries}</Relationships>`;
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

  return zipStore([
    { path: '[Content_Types].xml', data: enc(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + (hasSig || (hasLogo && logoExt === 'png') ? '<Default Extension="png" ContentType="image/png"/>' : '')
      + (hasLogo && logoExt === 'jpeg' ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')
      + '<Override PartName="/word/document.xml"'
      + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/header1.xml"'
      + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
      + '<Override PartName="/word/footer1.xml"'
      + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      + '</Types>') },
    { path: '_rels/.rels', data: enc(rels(rel('rId1', 'officeDocument', 'word/document.xml'))) },
    { path: 'word/document.xml', data: enc(documentXml) },
    { path: 'word/_rels/document.xml.rels', data: enc(rels(
      rel('rIdHdr', 'header', 'header1.xml')
      + rel('rIdFtr', 'footer', 'footer1.xml')
      + (hasSig ? rel(SIG_REL, 'image', 'media/signature.png') : ''))) },
    { path: 'word/header1.xml', data: enc(headerXml(hasLogo)) },
    { path: 'word/footer1.xml', data: enc(footerXml()) },
    // The header's own relationships part exists only when it has a picture to
    // relate to; an empty one is valid but pointless, and an entry pointing at
    // a part that is not there is not.
    ...(hasLogo ? [
      { path: 'word/_rels/header1.xml.rels', data: enc(rels(rel('rIdLogo', 'image', `media/logo.${logoExt}`))) },
      { path: `word/media/logo.${logoExt}`, data: logoBytes },
    ] : []),
    ...(hasSig ? [{ path: 'word/media/signature.png', data: sigBytes }] : []),
  ]);
}

/** The file name somebody will look for later. The template carries no FFR
 *  number field, so the number travels here — which is where the register
 *  already put it. */
export function ffrDocName(f: FfrDocFields): string {
  const base = `${f.ffrNo} - ${f.productName} ( ${f.productSerial} )`.trim();
  return `${base.replace(/[\\/:*?"<>|]/g, '-')}.docx`;
}

export function ffrDocDownload(f: FfrDocFields): void {
  download(ffrDocName(f), buildFfrDocx(f),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
