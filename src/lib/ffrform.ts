// ===========================================================================
// R-SER-03 FIELD FAILURE REPORT — THE CONTROLLED FORM, AS DATA.
//
// The user, 2026-09-12: "FFR word copy has to be exactly same as the template
// -- Add a HTML version which can be printed, similar to DC and declaration."
//
// TWO RENDERINGS OF ONE FORM, SO THE FORM IS WRITTEN ONCE. The Word file and
// the printable page are produced from the rows below. A controlled form
// transcribed twice is a form that drifts — one copy gains a label, the other
// keeps the old wording, and nobody notices until an assessor holds both.
//
// TAKEN FROM THE TEMPLATE ITSELF, not from a reading of it. The rows, their
// order, their spans and the labels' exact wording and spacing were extracted
// from `R-SER-03 Field Failure Report Rev02` — including the padding inside
// labels ("Complaint Date  :", "Address             :"), which is how the
// printed form aligns its colons and is therefore part of the form rather than
// stray whitespace.
//
// WHERE THE TEMPLATE'S `<<tags>>` WERE, a value goes. Where it has a bare label
// and no tag, the label stays and the value follows it if the register holds
// one — that is filling the form in, not changing it. Boxes this system has no
// data for (Phone No, Mobile No, Contact person, Email, Punched S. No, the two
// Software lines) print as the template prints them: labelled and empty, to be
// completed by hand.
//
// WHAT IS DELIBERATELY NOT ADDED: the template carries NO FFR number and NO
// date field. An earlier version of the generated document invented both at the
// top. They are gone — "exactly the same as the template" is the requirement,
// and the number travels in the file name, which is where the register already
// puts it.
// ===========================================================================
import type { FfrDocFields } from './ffrdoc';

/** Which value fills a box, or '' for a box the form leaves empty. */
export type FfrKey = keyof FfrDocFields | '';

export interface FfrCell {
  /** The label EXACTLY as the template prints it, padding included. */
  label: string;
  /** The field whose value follows the label, if any. */
  key?: FfrKey;
}

export type FfrRow =
  /** A full-width heading row: "Customer Information", "Equipment Information". */
  | { kind: 'section'; title: string }
  /** Two boxes side by side — the template's 6435 / 4500 split. */
  | { kind: 'pair'; left: FfrCell; right: FfrCell }
  /** A full-width box whose label sits on its own line above the value, which
   *  may run to several lines (Problem Description, the Observation). */
  | { kind: 'block'; label: string; key: FfrKey }
  /** A full-width box holding two labelled lines (CAPA No / Problem Status,
   *  Raised by / Signature). */
  | { kind: 'stack'; lines: FfrCell[] };

/** The header, repeated on every printed page — a three-column band carrying
 *  the company's mark, the department, the page number and the form's title. */
export const FFR_HEADER = {
  org: 'AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.',
  dept: 'SERVICE',
  title: 'FIELD FAILURE REPORT',
  pageLabel: 'PAGE NO:',
} as const;

/** The footer, likewise on every page. */
export const FFR_FOOTER = {
  notice: 'This document is the property of Air Liquide Medical Systems. '
    + 'Any communication or reproduction thereof, even partial, is prohibited '
    + 'without the owner’s prior and written consent',
  tmpl: 'TMPL No: R/SER/03 Rev: MAR 2020',
} as const;

/** The template's own column split, in twentieths of a point (the unit Word
 *  measures a table in). Carried here so the printed page divides its width in
 *  the same proportion as the Word file. */
export const FFR_GRID = { left: 6435, right: 4500 } as const;

/** A4 with the template's margins, so the two renderings paginate alike. */
export const FFR_PAGE = { w: 11906, h: 16838, top: 1800, bottom: 1440, side: 1296 } as const;

export const FFR_ROWS: FfrRow[] = [
  { kind: 'section', title: 'Customer Information' },
  { kind: 'pair',
    left:  { label: 'Hospital Name : ', key: 'customerName' },
    right: { label: 'Complaint Date  : ', key: 'crnDate' } },
  { kind: 'pair',
    left:  { label: 'Address             : ', key: 'place' },
    right: { label: 'Phone No   :' } },
  { kind: 'pair',
    left:  { label: '' },
    right: { label: 'Mobile No           :' } },
  { kind: 'pair',
    left:  { label: 'Contact person:' },
    right: { label: 'Email                   :' } },

  { kind: 'section', title: 'Equipment Information' },
  { kind: 'pair',
    left:  { label: 'UC Number: ', key: 'crnNo' },
    right: { label: 'Model                   :', key: 'itemCode' } },
  { kind: 'pair',
    left:  { label: 'Equipment Name: ', key: 'productName' },
    right: { label: 'Software Details  :' } },
  { kind: 'pair',
    left:  { label: 'Serial No: ', key: 'productSerial' },
    right: { label: 'Software               :' } },
  { kind: 'pair',
    left:  { label: 'Punched S. No   :' },
    right: { label: 'Equipment status : ', key: 'cover' } },
  { kind: 'pair', left: { label: '' }, right: { label: '' } },

  { kind: 'block', label: 'Problem Description  :', key: 'problemReported' },
  { kind: 'block', label: 'Service Department Observation', key: 'serviceObservation' },
  { kind: 'stack', lines: [
    { label: 'CAPA No: ', key: 'capaNo' },
    { label: 'Problem Status: ', key: 'problemStatus' },
  ] },
  { kind: 'stack', lines: [
    { label: 'Raised by: ', key: 'raisedBy' },
    { label: 'Signature:' },
  ] },
];

/** The value a cell shows. Kept here rather than in either renderer, so the
 *  Word file and the page cannot disagree about what an empty box looks like. */
export function ffrCellValue(f: FfrDocFields, key?: FfrKey): string {
  if (!key) return '';
  const v = f[key as keyof FfrDocFields];
  return typeof v === 'string' ? v : '';
}

/** The Problem Description box carries the reported problem and, beneath it,
 *  anything added later — the register's own two columns, which the template
 *  has one box for. */
export function ffrProblemText(f: FfrDocFields): string {
  return [f.problemReported, f.additionalProblem].filter((s) => String(s ?? '').trim()).join('\n');
}
