// ===========================================================================
// npm run docs:validation -- writes the Software Validation document in the
// old AppSheet template's sections (DVP_FO_51, R/QMS/SV/13), from the package.
//
// The user, 2026-10-27: "This is Validation Document of the Old Setup in
// AppSheet. Now we need to update this - ... it should match with the
// Template, Sections as per this one." Asked: "Template sections,
// summarised" -- one row per process, naming the URS / FRS / test IDs behind
// it and pointing at the full package; the sign-off and its dates left blank;
// "Word + in-app page".
//
// THE TEMPLATE IS THE USER'S OWN FILE (docs/validation/template/), so the
// header, logo, footer, styles and numbering are theirs and nothing here
// re-creates them. Kept from it: the cover, the sign-off table (names,
// functions and dates blanked), the template's own change history, the
// document's change history (Rev 02 added) and the Table of Contents heading.
// Everything from "1 Description of the Software" to "END OF DOCUMENT" is
// written from src/lib/validation.ts through src/lib/validationDoc.ts, and the
// verification status from docs/VALIDATION_RUN.md -- the last run, as recorded.
//
// Output: public/docs/RITHI_Software_Validation_R-QMS-SV-13_Rev02.docx (the
// in-app Software Validation page links it). The Table of Contents is a field
// Word refreshes on opening (settings: updateFields).
// ===========================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { VAL_META, SUPPLIERS, BACKUP, TESTS, NON_AUDITABLE, DEFECTS, URS, FRS } from '../src/lib/validation';
import { MODULES } from '../src/lib/rbac';
import { DOC_PROCESSES, coverage, unassignedScreens, idList } from '../src/lib/validationDoc';
import { SECURITY_SCAN } from '../src/lib/securityScan';

const TEMPLATE = 'docs/validation/template/SoftwareValidation_RITHI_R-QMS-SV-13_Rev01.docx';
const OUT = 'public/docs/RITHI_Software_Validation_R-QMS-SV-13_Rev02.docx';
const OUT_SECURITY = 'public/docs/RITHI_Security_Scan_2026-10-27.docx';
const REV = '02';
const REV_CHANGE = 'Re-validation for RITHI v2 (Supabase): all processes, the security scan of 27-Oct-2026, and the sections re-filled from the RITHI validation package';

const missing = unassignedScreens();
if (missing.length) {
  console.error(`These screens belong to no process in src/lib/validationDoc.ts, so the document would leave them out:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// ---- zip, read and write (stored entries kept byte-for-byte) -----------------
interface Entry { name: string; data: Buffer }
function unzip(buf: Buffer): Entry[] {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnl = buf.readUInt16LE(local + 26), lxl = buf.readUInt16LE(local + 28);
    const raw = buf.subarray(local + 30 + lnl + lxl, local + 30 + lnl + lxl + csize);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const comp = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---- WordprocessingML, small --------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t: string, o: { b?: boolean; sz?: number } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}<w:lang w:val="en-IN"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const p = (t: string, o: { style?: string; b?: boolean; sz?: number; after?: number } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}<w:spacing w:before="60" w:after="${o.after ?? 60}"/></w:pPr>${run(t, o)}</w:p>`;
const h = (level: 1 | 2 | 3, t: string) => `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>${run(t)}</w:p>`;
// A bullet of its own, not the template's list (numId 2): that one is a
// numbered list, and every list using it continues its count -- "ix." in front
// of an item that already carries its own number.
const li = (t: string) => `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:ind w:left="720" w:hanging="360"/></w:pPr>${run('•\t' + t)}</w:p>`;
// LEFT-ALIGNED: the template's Normal is justified, which in a narrow cell
// spreads three words across the width.
const cellP = (t: string, b = false) => t.split('\n').map((line) => `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="left"/></w:pPr>${run(line, { b, sz: 17 })}</w:p>`).join('');
/** A table in the template's TableGrid style: a shaded, repeating header row, widths in fiftieths of a percent. */
function table(head: string[], rows: string[][], widths: number[]): string {
  const tc = (t: string, w: number, header = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w * 50}" w:type="pct"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="EBF5FF"/>' : ''}</w:tcPr>${cellP(t, header)}</w:tc>`;
  const tr = (cells: string[], header = false) =>
    `<w:tr><w:trPr>${header ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${cells.map((c, i) => tc(c, widths[i], header)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${Math.round(w * 90.7)}"/>`).join('')}</w:tblGrid>`
    + tr(head, true) + rows.map((r) => tr(r)).join('') + '</w:tbl>' + p('');
}
// THE TABLE OF CONTENTS: a TOC field whose shown result is the headings
// themselves, so a viewer that does not update fields still shows the
// contents; Word refreshes it, page numbers and all, on opening (updateFields).
function toc(heads: { level: number; text: string }[]): string {
  const num = [0, 0, 0];
  const entries = heads.map((x, i) => {
    num[x.level - 1]++; for (let k = x.level; k < 3; k++) num[k] = 0;
    const label = num.slice(0, x.level).join('.');
    const begin = i === 0 ? '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '';
    const end = i === heads.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    return `<w:p><w:pPr><w:pStyle w:val="TOC${x.level}"/></w:pPr>${begin}${run(`${label}  ${x.text}`)}${end}</w:p>`;
  });
  return entries.join('') + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

// ---- the last validation run, as recorded ------------------------------------
const runMd = readFileSync('docs/VALIDATION_RUN.md', 'utf8');
const runAt = /\*\*Run at\*\* (\S+)/.exec(runMd)?.[1] ?? '';
const runDay = runAt ? new Date(runAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/ /g, '-') : 'not recorded';
const suites = /\| Database suites \| (\d+) \| (\d+) \|/.exec(runMd);
const checks = /\| Automated checks \| (\d+) \| (\d+) \|/.exec(runMd);
// The suites the run lists as clean: the backticked names under "suite(s) clean".
const cleanBlock = (() => { const i = runMd.indexOf('suite(s) clean'); if (i < 0) return ''; const j = runMd.indexOf('\n## ', i); return runMd.slice(i, j < 0 ? undefined : j); })();
const cleanSuites = new Set([...cleanBlock.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]));
const passedChecks = new Set([...runMd.matchAll(/\| `([a-z:0-9-]+)` \| ✅ pass/g)].map((m) => m[1]));
function testStatus(t: { auto?: string }): string {
  const a = t.auto ?? '';
  const suite = /supabase\/tests\/([a-z0-9_]+)_test\.sql/.exec(a)?.[1];
  if (suite) return cleanSuites.has(suite) ? 'pass' : 'fail';
  const chk = /check:[a-z0-9:-]+/.exec(a)?.[0];
  if (chk) return passedChecks.has(chk) ? 'pass' : 'fail';
  return 'manual';
}

// ---- the document body -----------------------------------------------------
const cov = coverage();
const B: string[] = [];

B.push(h(1, 'Description of the Software'));
B.push(p(`RITHI software is an internally developed solution for the service process of customer-related activities — installing, maintaining and complaint handling of all our ventilators in the field through their life cycle. RITHI v2 (the version this revision validates) replaces the AppSheet application of Revision 01: a web application whose records are held in a managed PostgreSQL database (Supabase), with every access rule enforced in the database itself.`));
B.push(p(VAL_META.intendedUse));
B.push(p(`Software category: ${VAL_META.gampCategory}`));
B.push(h(2, 'Intended Use'));
B.push(p('Service operation and administration as follows:'));
['Sale entry and ownership transfer', 'Complaints handling, daily complaint review and feedback', 'Installation and preventive maintenance', 'Contract management', 'Spare management and engineer hand stock', 'Indoor (workshop) service', 'Training records and controlled documents', 'Service KPIs and quality objectives'].forEach((t) => B.push(li(t)));
B.push(h(2, 'Scope'));
B.push(p('All ALMS supplied Products (Imported and Indigenous). The processes in scope, each validated below:'));
DOC_PROCESSES.forEach((pr) => B.push(li(`${pr.id}. ${pr.name}`)));
B.push(p(`In all, ${MODULES.filter((m) => m.path).length} screens, each assigned to one of these processes; the requirement behind each screen is in the RITHI validation package [4].`));
B.push(h(2, 'References'));
B.push(p('Reference documents:'));
[
  '[1] IEC/TR 80002-2:2017 — Validation of software for medical device quality systems.',
  '[2] Service Procedure QSP-05; Customer feedback QSP-08.',
  `[3] ${VAL_META.standards.join('; ')}.`,
  `[4] RITHI validation package, ${VAL_META.docId} version ${VAL_META.packageVersion} — held in RITHI under Software Validation: user and functional requirements, the traceability matrix (docs/REQUIREMENTS.md), risk register, test protocols and defect register.`,
  `[5] Validation run record (docs/VALIDATION_RUN.md) — the automated execution of every database test suite and check; last run ${runDay}.`,
  '[6] Security Scan report (docs/SECURITY_SCAN.md) — penetration test and vulnerability scan, 27-Oct-2026.',
  '[7] Servicing requirements against ISO 13485 §7.5.4 (docs/ISO13485_SERVICING.md); Cover requirements (docs/COVER_REQUIREMENTS.md); Call Request requirements (docs/CALL_REQUEST_REQUIREMENTS.md).',
  '[8] RITHI handbook (docs/HOW_TO_USE.md).',
].forEach((t) => B.push(p(t)));
B.push(h(2, 'Definitions and acronyms'));
B.push(table(['Initials and acronyms', 'Meaning'], [
  ['MD', 'Medical Device'], ['RM', 'Risk Management'], ['PRM', 'Preliminary Risk Management'],
  ['URS / FRS', 'User Requirement Specification / Functional Requirement Specification'],
  ['IQ / OQ / PQ', 'Installation / Operational / Performance Qualification (test protocols)'],
  ['NAR', 'Non-Auditable Requirement — asked for by the system owner, not offered as evidence against a regulatory clause'],
  ['RLS', 'Row-Level Security — the database decides which records each signed-in person may read or change'],
  ['RBAC', 'Role-based access control — Roles & Permissions'],
  ['UCN', 'Unique Call Number'], ['DCCR', 'Daily Complaint Review Register (R/SER/35)'], ['FFR', 'Field Failure Report'],
  ['SA / MC / OT', 'Sale entry / Maintenance Contract / Ownership Transfer numbers'],
  ['WGP / OGP / AMC / CMC', 'Within Guarantee Period / Out of Guarantee Period / Annual Maintenance Contract / Comprehensive Maintenance Contract'],
  ['PM', 'Preventive Maintenance'], ['MRN / MTN', 'Material Return Note / Material Transfer Note'],
  ['GAMP', 'Good Automated Manufacturing Practice (ISPE)'], ['ALCOA+', 'Attributable, Legible, Contemporaneous, Original, Accurate — and complete, consistent, enduring, available'],
], [30, 70]));

B.push(h(1, 'Process Definition'));
B.push(p('All process as per Service Procedure QSP-05, Customer feedback QSP-08, such as:'));
['Complaints registration, daily review and solution reporting', 'Preventive maintenance activities', 'Customer feedback collection', 'Installation activities', 'Spare requests, issue and engineer hand stock'].forEach((t) => B.push(li(t)));
B.push(p('Software tool RITHI covers all above process mentioned in QSP-05 and QSP-08, and the further processes listed in 1.2.'));
B.push(h(2, 'Process needs to be followed as per International Standards'));
B.push(p('Refer QSP-05 and QSP-08. The servicing obligations of ISO 13485:2016 §7.5.4, and the clauses it reaches into, are assessed requirement by requirement in [7]; the validation of the software itself answers §4.1.6 and IEC/TR 80002-2 [1].'));
B.push(h(2, 'Software Tool(s) usage in the Process'));
for (const c of cov) {
  B.push(p(`${c.process.id}. ${c.process.name}`, { b: true, after: 20 }));
  B.push(p(`${c.process.checks.join('; ')}. Screens: ${c.process.paths.map((x) => MODULES.find((m) => m.path === x)?.label ?? x).join(', ')}.`));
}
B.push(h(3, 'Assumptions and dependencies of software tool'));
B.push(p('Assumptions:', { b: true }));
['User should have computer knowledge and training in RITHI.', 'Each user signs in with their own login, made only for a person on an active User Master row; the role on that row decides what they may do.', 'Users have internet access; engineers in the field may work from the copy of the machine register kept on their device, which refreshes itself when the server changes.'].forEach((t) => B.push(li(t)));
B.push(p('Dependencies:', { b: true }));
SUPPLIERS.forEach((s) => B.push(li(`${s.name} — ${s.service} (criticality ${s.criticality}).`)));
B.push(h(3, 'Risks associated with each activity'));
B.push(table(['Process ID', 'Process', 'Risk Identified'], cov.map((c) => [
  c.process.id, c.process.name,
  c.risks.length ? c.risks.slice(0, 6).map((r) => `${r.id}: ${r.failure.split(/[.;—]/)[0].trim()}`).join('\n') + (c.risks.length > 6 ? `\n… and ${c.risks.length - 6} more (section 4)` : '') : '—',
]), [10, 25, 65]));
B.push(h(3, 'Storage of data'));
B.push(p('All data is stored in the cloud: the RITHI database (Supabase PostgreSQL), with uploaded files — service reports, delivery challans, attachments — in Google Drive.'));
['Complaints history, visit reports and the daily complaint review', 'Customer feedback', 'Products sold, warranty, contract and ownership records', 'Spare requests, dispatches, consumption and hand stock', 'Installation and maintenance records', 'Training records, QMS documents and the audit log'].forEach((t) => B.push(li(t)));
BACKUP.statement.forEach((t) => B.push(p(t)));

B.push(h(1, 'Validation Planning'));
B.push(table(['', 'Module', 'Check plan', 'Responsibility'], cov.map((c) => [
  c.process.id, c.process.name, c.process.checks.join('\n'), c.process.responsibility,
]), [6, 24, 45, 25]));
B.push(h(2, 'Type 1 - In-house Developed software'));
B.push(p('YES. RITHI is custom software (GAMP Category 5), developed and changed under the project\'s own change control: every change is built, tested by the automated suites and recorded in Version History before it goes live.'));
B.push(h(2, 'Type 2- OFF The Shelf (OTS) Software'));
B.push(p('The platform services RITHI runs on are configured off-the-shelf services (GAMP Category 1/4), assessed as suppliers in the validation package:'));
SUPPLIERS.forEach((s) => B.push(li(`${s.name}: ${s.conclusion}`)));
B.push(h(2, 'Type 3 – Disposal'));
B.push(p('Quality records are never deleted by the application: a wrong entry is voided or cancelled with a reason and kept. Data is exported from RITHI to Google Drive by the scheduled exports (Data Export), and the audit log is retained and archived. On retirement of RITHI, a complete export of every register is taken and verified before the database is closed.'));
B.push(p('The following tables record the validation of the software before implementing, and the periodic validation every year and as and when required.'));

B.push(h(1, 'Risk Analysis and Control Measures'));
B.push(p('Refer 2.2.2. Each risk of the RITHI risk register [4], with the control that mitigates it. "Validated By" is signed by the person verifying the control.'));
const riskRows: string[][] = [];
for (const c of cov) c.risks.forEach((r, i) => {
  const proof = r.refs.filter((x) => /^(OQ|PQ|IQ)-/.test(x));
  const st = proof.map((id) => TESTS.find((t) => t.id === id)).filter(Boolean).map((t) => testStatus(t!));
  const status = `Residual ${r.residual}` + (proof.length ? ` · ${proof.join(', ')}${st.length && st.every((s) => s === 'pass') ? ` — passed ${runDay}` : st.includes('fail') ? ' — FAILED' : ''}` : '');
  riskRows.push([`${c.process.id}.${i + 1}`, i === 0 ? c.process.name : '', `${r.id} ${r.fn}: ${r.failure}`, r.controls, '', status]);
});
B.push(table(['Process ID', 'Process', 'Risk Identified', 'Mitigation', 'Validated By', 'Status'], riskRows, [9, 12, 25, 31, 10, 13]));

B.push(h(1, 'Validation Tasks'));
B.push(p(`Each check of 3, with the requirements and tests that prove it. Automated tests run on every change; the last run (${runDay}) passed ${suites ? `${suites[1]} of ${suites[2]}` : '—'} database test suites and ${checks ? `${checks[1]} of ${checks[2]}` : '—'} automated checks [5]. A manual test is executed and signed here.`));
const taskRows: string[][] = [];
for (const c of cov) {
  const auto = c.tests.filter((t) => testStatus(t) !== 'manual');
  const passed = auto.filter((t) => testStatus(t) === 'pass');
  const manual = c.tests.filter((t) => testStatus(t) === 'manual');
  c.process.checks.forEach((chk, i) => taskRows.push([
    i === 0 ? c.process.id : '', i === 0 ? c.process.name : '', chk, i === 0 ? c.process.responsibility : '', '',
    i === 0 ? [
      `Requirements: ${idList(c.urs.map((r) => r.id))}`,
      `Functional: ${c.frs.length} (${idList(c.frs.map((r) => r.id), 5)})`,
      `Automated tests: ${passed.length} of ${auto.length} passed ${runDay}`,
      manual.length ? `Manual tests to execute: ${idList(manual.map((t) => t.id), 6)}` : 'Manual tests: none',
    ].join('\n') : '',
  ]));
}
B.push(table(['', 'Module', 'Check plan', 'Responsibility', 'Validated by', 'Verification Status'], taskRows, [5, 14, 27, 15, 11, 28]));
const openDefects = DEFECTS.filter((d) => !/^FIXED/i.test(d.fix));
B.push(p(`Non-auditable requirements (${NON_AUDITABLE.length}) are listed in the package [4] and are not offered as evidence against a clause. Requirements in the package: ${URS.length} user, ${FRS.length} functional; tests: ${TESTS.length}. Open defects in the register: ${openDefects.length}${openDefects.length ? ` (${idList(openDefects.map((d) => d.id), 10)})` : ''}.`));

B.push(h(1, 'CONCLUSION'));
B.push(p('RITHI is validated for its suitability and all mitigation measures have been implemented and followed, subject to the open items recorded in the package [4] and in the Security Scan report [6].'));
B.push(p(''));
B.push(p('Verified by the responsible persons'));
B.push(p(''));
B.push(p('Validation Date:                                        Validated by:'));
B.push(p(''));
B.push(p('END OF DOCUMENT', { b: true }));

// ---- assemble on the template ------------------------------------------------
const textOf = (x: string) => [...x.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
/** The template, with its front matter kept (and adjusted) and the body replaced. */
function assemble(o: { body: string[]; out: string; history: boolean; coverTitle?: string; headerTitle?: string; docRef?: string }) {
  const entries = unzip(readFileSync(TEMPLATE));
  const get = (n: string) => entries.find((e) => e.name === n)!;
  const docXml = get('word/document.xml').data.toString('utf8');
  const bodyStart = docXml.indexOf('<w:body>') + 8;
  const bodyEnd = docXml.lastIndexOf('</w:body>');
  const body = docXml.slice(bodyStart, bodyEnd);

  // The body's top-level elements, in order.
  const kids: string[] = [];
  {
    const pat = /<(\/?)(w:p|w:tbl|w:sdt|w:sectPr)\b[^>]*?(\/?)>/g;
    let depth = 0, st = 0, m: RegExpExecArray | null;
    while ((m = pat.exec(body))) {
      const [, close, , self] = m;
      if (!close && !self) { if (depth === 0) st = m.index; depth++; }
      else if (close) { depth--; if (depth === 0) kids.push(body.slice(st, m.index + m[0].length)); }
      else if (self && depth === 0) kids.push(m[0]);
    }
  }
  const tocAt = kids.findIndex((k) => textOf(k).trim() === 'TABLE OF CONTENTS');
  const sect = kids[kids.length - 1];
  if (tocAt < 0 || !sect.startsWith('<w:sectPr')) { console.error('The template is not the one this generator was written for.'); process.exit(1); }

  let front = kids.slice(0, tocAt + 1);
  // THE SIGN-OFF LEFT BLANK (the user: "Leave those Blank"): every cell of the
  // sign-off table after its label column is emptied -- function, name, date.
  const signIdx = front.findIndex((k) => k.startsWith('<w:tbl') && textOf(k).includes('Written by'));
  front[signIdx] = front[signIdx].replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
    if (!/Written by|Checked by|Approved by/.test(textOf(tr))) return tr;
    let n = 0;
    return tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => (n++ === 0 ? tc : tc.replace(/<w:r\b[\s\S]*?<\/w:r>/g, '')));
  });
  if (o.coverTitle) {
    const coverIdx = front.findIndex((k) => k.startsWith('<w:tbl') && textOf(k).trim() === 'RITHI');
    if (coverIdx >= 0) front[coverIdx] = front[coverIdx].replace(/(<w:t[^>]*>)RITHI(<\/w:t>)/, `$1${esc(o.coverTitle)}$2`);
  }
  const histIdx = front.findIndex((k) => k.startsWith('<w:tbl') && /Revision\s*Date\s*Change/.test(textOf(k)));
  if (o.history) {
    // THE DOCUMENT'S CHANGE HISTORY: Rev 02 in the first empty row, date and author blank.
    let done = false;
    front[histIdx] = front[histIdx].replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
      if (done || textOf(tr).trim()) return tr;
      done = true;
      let n = 0;
      return tr.replace(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g, (_m, attrs, inner) => {
        const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(inner)?.[0] ?? '';
        const val = [REV, '', REV_CHANGE, ''][n++] ?? '';
        return `<w:p${attrs}>${pPr}${val ? run(val, { sz: 18 }) : ''}</w:p>`;
      });
    });
  } else {
    // A NEW DOCUMENT: neither history belongs to it -- the template's own nor
    // the validation document's. Both tables and their headings go.
    const drop = new Set<number>();
    front.forEach((k, i) => { if (/CHANGE HISTORY/.test(textOf(k)) || /masked text/.test(textOf(k)) || (k.startsWith('<w:tbl') && /(Revision|Version)\s*Date\s*Change/.test(textOf(k)))) drop.add(i); });
    front = front.filter((_, i) => !drop.has(i));
  }
  const heads = o.body.flatMap((x) => { const m = /w:val="Heading([123])"[\s\S]*?<w:t xml:space="preserve">([^<]*)<\/w:t>/.exec(x); return m ? [{ level: Number(m[1]), text: m[2].replace(/&amp;/g, '&') }] : []; });
  get('word/document.xml').data = Buffer.from(docXml.slice(0, bodyStart) + front.join('') + toc(heads) + o.body.join('') + sect + docXml.slice(bodyEnd), 'utf8');

  // THE HEADER: the revision 02 with its date blank (the sign-off's to give),
  // and for another document its own title and reference.
  for (const e of entries.filter((x) => /^word\/header\d*\.xml$/.test(x.name))) {
    let s = e.data.toString('utf8');
    s = s.replace(/(<w:t[^>]*>)01(<\/w:t>)/, `$1${o.history ? REV : '00'}$2`).replace(/(<w:t[^>]*>)01\/03\/2023(<\/w:t>)/, '$1$2');
    if (o.headerTitle) s = s.replace(/(<w:t[^>]*>)Software validation of\s+RITHI(<\/w:t>)/, `$1${esc(o.headerTitle)}$2`);
    if (o.docRef) s = s.replace(/(<w:t[^>]*>)(\s*)R\/QMS\/SV\/13(<\/w:t>)/, `$1$2${esc(o.docRef)}$3`);
    e.data = Buffer.from(s, 'utf8');
  }
  // THE TABLE OF CONTENTS IS FILLED BY WORD ON OPENING.
  {
    const st = get('word/settings.xml');
    let s = st.data.toString('utf8');
    if (!s.includes('<w:updateFields')) s = s.replace(/<w:settings\b[^>]*>/, (m) => `${m}<w:updateFields w:val="true"/>`);
    st.data = Buffer.from(s, 'utf8');
  }
  mkdirSync('public/docs', { recursive: true });
  writeFileSync(o.out, zip(entries));
}

assemble({ body: B, out: OUT, history: true });
console.log(`wrote ${OUT}: ${cov.length} processes, ${riskRows.length} risks, ${taskRows.length} check rows; last run ${runDay}`);

// ---- the Security Scan report ---------------------------------------------------
const S: string[] = [];
const SC = SECURITY_SCAN;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ /g, '-');
S.push(h(1, 'Scope'));
S.push(p(`Security scan of RITHI version ${SC.version}, ${day(SC.date)}: a penetration test and a vulnerability scan, asked for by the system owner. It is an annex to the Software Validation document R/QMS/SV/13 (reference [6] there).`));
SC.scope.forEach((t) => S.push(li(t)));
S.push(h(1, 'Method'));
S.push(table(['Activity', 'How it was done'], SC.method.map((m) => [m.name, m.how]), [28, 72]));
S.push(h(1, 'Summary of findings'));
const sevs = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
S.push(table(['Severity', 'Found', 'Fixed', 'Open / accepted'], sevs.map((sv) => {
  const f = SC.findings.filter((x) => x.severity === sv);
  return [sv, String(f.length), String(f.filter((x) => x.status === 'Fixed').length), String(f.filter((x) => x.status !== 'Fixed').length)];
}), [25, 25, 25, 25]));
S.push(p('Every High finding is fixed and verified: after the release the live check found no table or view returning a row to the public key, and the penetration test passes on every validation run.'));
S.push(h(1, 'Findings'));
// One block per finding: seven narrow columns broke every word in two.
SC.findings.forEach((f) => S.push(table([`${f.id}`, f.title], [
  ['Severity', f.severity], ['Status', f.status], ['Found by', f.found],
  ['What was found', f.what], ['Fix / action', f.fix], ...(f.refs.length ? [['References', f.refs.join(', ')]] : []),
], [18, 82])));
S.push(h(1, 'Found sound'));
SC.clean.forEach((t) => S.push(li(t)));
S.push(h(1, 'Re-running the scan'));
['The penetration test is supabase/tests/security_pentest_test.sql: it runs with every `npm run validate`, so a change that re-opens a hole fails the validation run.', 'The live, read-only checks are scripts/security-live-check.mjs: GitHub → Actions → "Security scan (live, read-only)" → Run workflow. It prints counts and statuses, never a row.', 'Dependencies: `npm audit`.'].forEach((t) => S.push(li(t)));
S.push(h(1, 'CONCLUSION'));
S.push(p('The penetration test and vulnerability scan found two High findings, both fixed and verified on the live project; the open items are the owner\'s decisions recorded above.'));
S.push(p(''));
S.push(p('Reviewed by:                                        Date:'));
S.push(p(''));
S.push(p('END OF DOCUMENT', { b: true }));
assemble({ body: S, out: OUT_SECURITY, history: false, coverTitle: 'RITHI — SECURITY SCAN', headerTitle: 'Security scan of RITHI', docRef: 'Annex to R/QMS/SV/13' });
console.log(`wrote ${OUT_SECURITY}: ${SC.findings.length} findings`);
