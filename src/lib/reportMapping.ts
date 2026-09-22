// ---------------------------------------------------------------------------
// BULK REPORT → CALL MAPPING.
//
// Recovering visit history that was lost: a spreadsheet of reports, each of
// which has to find the call it belongs to, and each of which may carry an
// AppSheet file reference where a Drive link should be.
//
// Everything here is PURE — no network, no Supabase. That is deliberate: the
// screen shows the operator exactly what each row will become BEFORE anything
// is written, and a preview you cannot trust is worse than no preview.
// ---------------------------------------------------------------------------

// ---- AppSheet references --------------------------------------------------
//
// AppSheet stores a file column three ways, depending on how the sheet was
// exported, and an export usually contains a mixture:
//
//   1. a full link back into the app —
//      https://www.appsheet.com/template/gettablefileurl?appName=…&fileName=…
//   2. the bare relative path AppSheet keeps in the cell —
//      Reports_Images/Row 42_Photo.204512.png
//   3. a Drive link or a bare Drive file id, if someone already converted it
//
// Only 1 and 2 need resolving, and both reduce to the same thing: a FILE NAME
// to find in Drive. 3 is already an answer. Anything else is left alone and
// reported rather than guessed at — a wrong link on a quality record is worse
// than an absent one.

import { toIsoTimestamp } from './dates';
import { loose, findHeaderFor } from './headers';

export type RefKind = 'empty' | 'drive-link' | 'drive-id' | 'appsheet-url' | 'appsheet-path' | 'other-url' | 'unknown';

export interface ParsedRef {
  kind: RefKind;
  raw: string;
  /** The file to look for in Drive — set for the two AppSheet shapes. */
  fileName: string;
  /** A usable link, when the value already was one (or trivially becomes one). */
  url: string;
  /** Why this one needs no lookup / cannot be resolved. Shown in the preview. */
  note: string;
}

// A Drive file id: Google's are 25+ chars of [A-Za-z0-9_-]. Requiring a length
// AND the absence of a dot or slash keeps a bare filename ("photo.png") and a
// path from being mistaken for one.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{25,}$/;
const DRIVE_LINK_RE = /^https?:\/\/(drive|docs)\.google\.com\//i;
const APPSHEET_RE = /^https?:\/\/(www\.)?appsheet\.com\//i;

export const driveLinkForId = (id: string): string => `https://drive.google.com/file/d/${id}/view`;

// The last path segment, percent-decoded. AppSheet paths arrive encoded about
// half the time, and a name with a space is common ("Row 42_Photo.png").
export function baseName(path: string): string {
  let p = String(path ?? '').trim();
  try { p = decodeURIComponent(p); } catch { /* already plain, or badly encoded */ }
  p = p.replace(/\\/g, '/');
  const seg = p.split('/').filter(Boolean).pop() ?? '';
  return seg.trim();
}

export function parseRef(value: unknown): ParsedRef {
  const raw = String(value ?? '').trim();
  const base: ParsedRef = { kind: 'unknown', raw, fileName: '', url: '', note: '' };
  if (!raw) return { ...base, kind: 'empty', note: 'No attachment on this row.' };

  if (DRIVE_LINK_RE.test(raw)) return { ...base, kind: 'drive-link', url: raw, note: 'Already a Drive link — left as it is.' };

  if (APPSHEET_RE.test(raw)) {
    // fileName is the parameter that matters; the rest identifies the app.
    let file = '';
    try { file = new URL(raw).searchParams.get('fileName') ?? ''; }
    catch { const m = /[?&]fileName=([^&]+)/i.exec(raw); file = m ? m[1] : ''; }
    const name = baseName(file);
    return name
      ? { ...base, kind: 'appsheet-url', fileName: name, note: 'AppSheet link — will be looked up in Drive by file name.' }
      : { ...base, kind: 'unknown', note: 'AppSheet link with no fileName — nothing to look up.' };
  }

  if (/^https?:\/\//i.test(raw)) return { ...base, kind: 'other-url', url: raw, note: 'Already a link, not AppSheet — left as it is.' };

  if (DRIVE_ID_RE.test(raw)) return { ...base, kind: 'drive-id', url: driveLinkForId(raw), note: 'A Drive file id — turned into a link.' };

  // What is left is a path or a bare file name. It needs a dot-extension to be
  // a file at all; without one it is more likely a stray value than a document.
  const name = baseName(raw);
  if (name && /\.[A-Za-z0-9]{1,5}$/.test(name)) {
    return { ...base, kind: 'appsheet-path', fileName: name, note: 'AppSheet file path — will be looked up in Drive by file name.' };
  }
  return { ...base, kind: 'unknown', note: 'Not a link, an id or a file name — left alone for you to look at.' };
}

/** Every distinct file name a batch of rows needs looked up in Drive. */
export function fileNamesToResolve(refs: ParsedRef[]): string[] {
  const seen = new Set<string>();
  refs.forEach((r) => { if (r.fileName) seen.add(r.fileName); });
  return [...seen];
}

// ---- matching a report to its call ----------------------------------------

export interface CallKey { ucn: string; call_number: string; serial: string; party_name: string; product_name: string }
export type MatchHow = 'ucn' | 'call-number' | 'none' | 'ambiguous';
export interface Match { how: MatchHow; ucn: string; call_number: string; note: string }

const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();

// A report finds its call by UCN first, then by Call Number — the same two keys
// (and the same precedence) the Daily Complaint Review Register uses in 0048, so a recovered
// visit lands where a live one would have.
//
// Deliberately NOT matched on serial or party: a machine has many calls, so
// that would attach a visit to an arbitrary one of them. An unmatched row is
// held back for a human instead — the cost of a wrong call is a visit recorded
// against the wrong machine's history, which nothing downstream would catch.
export function matchCall(row: { ucn?: unknown; call_number?: unknown }, calls: CallKey[]): Match {
  const ucn = norm(row.ucn);
  const cn = norm(row.call_number);

  if (ucn) {
    const hit = calls.filter((c) => norm(c.ucn) === ucn);
    if (hit.length === 1) return { how: 'ucn', ucn: hit[0].ucn, call_number: hit[0].call_number, note: 'Matched on UCN.' };
    if (hit.length > 1) return { how: 'ambiguous', ucn: '', call_number: '', note: `${hit.length} calls share that UCN.` };
  }
  if (cn) {
    const hit = calls.filter((c) => norm(c.call_number) === cn);
    if (hit.length === 1) return { how: 'call-number', ucn: hit[0].ucn, call_number: hit[0].call_number, note: 'Matched on Call Number.' };
    if (hit.length > 1) return { how: 'ambiguous', ucn: '', call_number: '', note: `${hit.length} calls share that Call Number.` };
  }
  return {
    how: 'none', ucn: '', call_number: '',
    note: ucn || cn ? 'No call with that UCN or Call Number.' : 'The row carries neither a UCN nor a Call Number.',
  };
}

// ---- shaping a row --------------------------------------------------------

// Column aliases, so an export does not have to be renamed by hand first.
const ALIASES: Record<string, string[]> = {
  uid: ['uid', 'row id', 'rowid', 'id', 'unique id', 'uniqueid', 'key'],
  ucn: ['ucn', 'uc number', 'ucnumber', 'uc no', 'unique call number'],
  call_number: ['call_number', 'call number', 'callno', 'call no', 'callnumber'],
  call_status: ['call_status', 'call status', 'status'],
  pending_reason: ['pending_reason', 'pending reason'],
  engineer: ['engineer', 'engineer name', 'attended by', 'allocated to'],
  engineer_email: ['engineer_email', 'engineer email', 'email'],
  // The same headings Bulk Uploads' report registers read — keep the two lists
  // in step, or a file loads on one screen and not the other.
  visit_at: ['visit_at', 'visit date & time', 'visit date and time', 'visit date', 'visit_date', 'date of visit', 'attended date', 'date'],
  manual_report: ['manual_report', 'manual report', 'report', 'attachment', 'file', 'document', 'photo', 'image'],
};

// The same three-pass header matcher every importer uses (./headers), so a
// heading this tool reads is the same heading Bulk Uploads reads — `UC Number`,
// `Visit Date & Time`, `Death?` and the rest match here too.
export function pick(row: Record<string, unknown>, field: keyof typeof ALIASES): string {
  const h = findHeaderFor(Object.keys(row), ALIASES[field]);
  return h ? String(row[h] ?? '').trim() : '';
}

/** A date the database will accept, or '' — never a half-parsed guess. The
 *  one shared parser (./dates), read as local time as this tool always has. */
export function toTimestamp(v: unknown): string {
  return toIsoTimestamp(v, 'local') ?? '';
}

export interface MappedRow {
  uid: string;
  ucn: string;
  call_number: string;
  call_status: string;
  pending_reason: string;
  engineer: string;
  engineer_email: string;
  visit_at: string;
  manual_report: string;
  source_ref: string;
  data: Record<string, unknown>;
  /** Preview only — not written. */
  match: Match;
  ref: ParsedRef;
  problem: string;
}

// Everything that is not a recognised column is kept in `data`, exactly as the
// visit history already does — a recovered report should carry as much of what
// the engineer wrote as the export still has.
const KNOWN = new Set(Object.values(ALIASES).flat().map(loose));

export function shapeRow(raw: Record<string, unknown>, calls: CallKey[], rowNo: number): MappedRow {
  const ref = parseRef(pick(raw, 'manual_report'));
  const match = matchCall({ ucn: pick(raw, 'ucn'), call_number: pick(raw, 'call_number') }, calls);

  const data: Record<string, unknown> = {};
  Object.keys(raw).forEach((k) => {
    const v = String(raw[k] ?? '').trim();
    if (v && !KNOWN.has(loose(k))) data[k.trim()] = v;
  });

  const visit_at = toTimestamp(pick(raw, 'visit_at'));
  // A uid is what makes the load re-runnable: the same sheet imported twice
  // updates its rows instead of doubling the visit history. When the export has
  // no id of its own, one is derived from the call + visit, which is stable
  // across runs — a random one would not be.
  const uid = pick(raw, 'uid')
    || (match.ucn && visit_at ? `REC-${match.ucn}-${visit_at.slice(0, 19).replace(/[:T-]/g, '')}` : '');

  const problems: string[] = [];
  if (match.how === 'none' || match.how === 'ambiguous') problems.push(match.note);
  if (!uid) problems.push('No row id, and no call + visit date to derive one from.');
  if (!visit_at) problems.push('No usable visit date.');

  return {
    uid,
    ucn: match.ucn,
    call_number: match.call_number,
    call_status: pick(raw, 'call_status'),
    pending_reason: pick(raw, 'pending_reason'),
    engineer: pick(raw, 'engineer'),
    engineer_email: pick(raw, 'engineer_email'),
    visit_at,
    manual_report: ref.url,      // filled in later for the two AppSheet shapes
    source_ref: ref.raw,
    data,
    match,
    ref,
    problem: problems.join(' '),
  };
}

export const summarise = (rows: MappedRow[]) => ({
  total: rows.length,
  matched: rows.filter((r) => r.match.how === 'ucn' || r.match.how === 'call-number').length,
  unmatched: rows.filter((r) => r.match.how === 'none').length,
  ambiguous: rows.filter((r) => r.match.how === 'ambiguous').length,
  needLookup: rows.filter((r) => r.ref.fileName).length,
  alreadyLinked: rows.filter((r) => r.ref.url).length,
  ready: rows.filter((r) => !r.problem).length,
});

// ===========================================================================
// WHAT TO DO WITH EACH ROW — the user's rule, 2026-09-22:
//
//   "If the Report is already present, it should not update. If the Report is
//    Absent, then it should update the Report Link on an Existing Visit Entry
//    - with Status 'Solved - Report Completed' - with the Report Link. If there
//    is no Visit with 'Solved - Report Completed', then it should add Visit
//    Entry."
//
// So the anchor is the call's COMPLETED visit, and there are three outcomes:
//
//   skip    a completed visit already carries a document. Nothing is written,
//           and that is the point: a recovered link must never displace the one
//           an engineer filed.
//   attach  a completed visit exists with no document. ONLY the link, the
//           source reference and the status are written onto it -- not a whole
//           visit, because everything else on that row is the engineer's.
//   create  the call has no completed visit at all. A new one is filed,
//           carrying the link and the status.
//
// THE MATCH ON STATUS IS SQUASHED, NOT EQUALITY. The register writes
// "Solved - Report Completed", exports write "Solved-Report Completed" and
// "SOLVED - REPORT COMPLETED", and all three are the same judgement. Squashing
// keeps "Solved - Report PENDING" distinct, which equality-on-a-prefix would
// not: `solvedreportcompleted` and `solvedreportpending` differ.
// ===========================================================================

export const SOLVED_REPORT_COMPLETED = 'Solved - Report Completed';

const statusKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COMPLETED_KEY = statusKey(SOLVED_REPORT_COMPLETED);

/** Is this visit the call's completed one? */
export const isCompletedVisit = (status: unknown): boolean => statusKey(status) === COMPLETED_KEY;

export interface ExistingVisit {
  uid: string;
  call_status: string;
  manual_report: string;
  /** When the visit was ENTERED. Used only to pick between several completed
   *  visits, by the same rule the call's own status uses (0032). */
  updated_at: string;
}

export type MapAction = 'skip' | 'attach' | 'create';
export interface VisitDecision { action: MapAction; uid: string; why: string }

export function decideVisit(visits: ExistingVisit[], derivedUid: string, hasLink: boolean): VisitDecision {
  const completed = visits.filter((v) => isCompletedVisit(v.call_status));

  // A row with nothing to attach cannot improve anything, and filing an empty
  // visit for it would be inventing history.
  if (!hasLink) {
    return completed.length
      ? { action: 'skip', uid: completed[0].uid, why: 'This row carries no document to attach.' }
      : { action: 'skip', uid: '', why: 'This row carries no document, and the call has no completed visit to add it to.' };
  }

  const withReport = completed.find((v) => String(v.manual_report ?? '').trim() !== '');
  if (withReport) {
    return { action: 'skip', uid: withReport.uid, why: 'A completed visit on this call already has a report.' };
  }

  if (completed.length) {
    // The LATEST ENTRY, matching sync_call_last_visit's ordering -- that is the
    // visit the call's own status comes from, so it is the one a reader sees.
    const latest = [...completed].sort((a, b) =>
      String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')) || String(b.uid).localeCompare(String(a.uid)))[0];
    return { action: 'attach', uid: latest.uid, why: 'Adding the report to the completed visit that has none.' };
  }

  return { action: 'create', uid: derivedUid, why: 'No completed visit on this call — filing one.' };
}

export const summariseActions = (d: VisitDecision[]) => ({
  skip: d.filter((x) => x.action === 'skip').length,
  attach: d.filter((x) => x.action === 'attach').length,
  create: d.filter((x) => x.action === 'create').length,
});
