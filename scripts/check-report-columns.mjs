#!/usr/bin/env node
// ===========================================================================
// EVERY REPORT'S COLUMN PICKER, CHECKED AGAINST THE VIEW IT EXPORTS.
//
// A report is a view plus two lists in `src/lib/reports.ts` — MANDATORY (always
// exported) and OPTIONAL (offered in the picker). The file is built from those
// lists and NOT from the view, so the two can disagree, and they disagree
// SILENTLY in both directions:
//
//   IN THE VIEW, NOT IN THE LISTS — the column cannot be exported by anybody.
//     The picker does not offer it, nothing errors, and the database carries it
//     the whole time. That is what happened to `Visit UID` on 2026-09-18: it was
//     added to `consumption_report` for the user, announced as added, and was
//     unreachable from the report for a day. Nothing in the repository could
//     have said so — `check:ui` does not know what a view is called, `tsc` sees
//     two lists of strings, and reading the migration is what missed it.
//
//   IN THE LISTS, NOT IN THE VIEW — every row exports an EMPTY column under a
//     heading that promises a value. Worse than the first, because the file
//     looks complete: a reader takes a blank cell for a blank field.
//
// So both directions are failures here, and the only thing that actually knows
// the answer is the database.
//
//   node scripts/check-report-columns.mjs "-h /tmp/pg -p 55432 -U postgres -d x"
//
// against a database with every migration applied.
// ===========================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv[2];
if (!args) {
  console.error('usage: node scripts/check-report-columns.mjs "<postgres url or psql args>"');
  process.exit(2);
}
const psql = (sql) => execFileSync('psql', [...args.split(' '), '-Atc', sql], { encoding: 'utf8' }).trim();

// The lists, read out of the source rather than re-declared here. A check that
// re-states its subject stops being a check the first time somebody edits one
// of the two copies.
const SRC = 'src/lib/reports.ts';
const src = readFileSync(SRC, 'utf8');

const listNamed = (name) => {
  const m = src.match(new RegExp(`export const ${name}: string\\[\\] = \\[([\\s\\S]*?)\\n\\];`));
  if (!m) { console.error(`✗ ${SRC} has no ${name}`); process.exit(1); }
  // Entries only — a `//` comment line inside the list is not a column.
  return m[1].split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .map((l) => (l.match(/^'((?:[^'\\]|\\.)*)',?$/) || [])[1])
    .filter((v) => v !== undefined)
    .map((v) => v.replace(/\\'/g, "'"));
};

const REPORTS = [
  { label: 'Spare Consumption', view: 'consumption_report',
    mandatory: 'CONSUMPTION_MANDATORY', optional: 'CONSUMPTION_OPTIONAL' },
  { label: 'Call Report', view: 'call_report',
    mandatory: 'CALL_REPORT_MANDATORY', optional: 'CALL_REPORT_OPTIONAL' },
  { label: 'Customer Feedback', view: 'feedback_report',
    mandatory: 'FEEDBACK_REPORT_MANDATORY', optional: 'FEEDBACK_REPORT_OPTIONAL' },
];

let fail = 0;
for (const r of REPORTS) {
  const mandatory = listNamed(r.mandatory);
  const optional = listNamed(r.optional);
  const offered = [...mandatory, ...optional];

  const inDb = psql(
    `select string_agg(column_name, E'\\n' order by ordinal_position)
       from information_schema.columns
      where table_schema = 'public' and table_name = '${r.view}'`,
  ).split('\n').filter(Boolean);

  if (!inDb.length) {
    console.log(`  ✗ ${r.label}: the database has no view public.${r.view}`);
    fail++; continue;
  }

  const missing = inDb.filter((c) => !offered.includes(c));
  const phantom = offered.filter((c) => !inDb.includes(c));
  const dupes = offered.filter((c, i) => offered.indexOf(c) !== i);

  if (!missing.length && !phantom.length && !dupes.length) {
    console.log(`  ✓ ${r.label} — ${offered.length} columns, `
      + `${mandatory.length} mandatory + ${optional.length} optional, all in ${r.view}`);
    continue;
  }
  fail++;
  console.log(`  ✗ ${r.label} (${r.view})`);
  // Say which list to add it to: the view's order is the file's order, so a new
  // column at the end of the view goes at the end of OPTIONAL.
  for (const c of missing) console.log(`      in the view, offered by nobody: "${c}" — add it to ${r.optional}`);
  for (const c of phantom) console.log(`      offered, not in the view: "${c}" — it would export an empty column`);
  for (const c of dupes)   console.log(`      listed twice: "${c}"`);
}

// A DEFAULT-ON column that is not optional is ticked in the picker and dropped
// on the way out, because the file is built from the OPTIONAL list. `check:ui`
// holds this too — it needs no database — and it is repeated here so a run of
// this script alone cannot pass a report whose defaults go nowhere.
const defaults = listNamed('CONSUMPTION_DEFAULT_ON');
const stray = defaults.filter((c) => !listNamed('CONSUMPTION_OPTIONAL').includes(c));
if (stray.length) {
  fail++;
  console.log(`  ✗ default columns not in CONSUMPTION_OPTIONAL: ${stray.join(', ')}`
    + ' — they would be ticked and then dropped from the file');
} else {
  console.log(`  ✓ default-on columns (${defaults.join(', ')}) are all optional columns`);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
