#!/usr/bin/env node
// ===========================================================================
// EVERY PAGED READ'S `order()` COLUMN, CHECKED AGAINST A REAL DATABASE.
//
// Reported from use (2026-09-16): Stock Out was empty and told the reader to
// run migration 0027 — a bundle applied months earlier. The register reads
// `spare_stock_out_lines`, and the paged read ordered by `id`; the view calls
// that column `line_id` (`dl.id as line_id`). PostgREST does not answer a bad
// ORDER with fewer rows — it answers with an ERROR, so the whole register came
// back empty, and the message (`column … does not exist`) matched the screen's
// missing-table test and became an instruction to re-run SQL.
//
// TWO FAULTS, AND THIS SCRIPT IS FOR THE FIRST. The second — a hint that fires
// on any "does not exist" — is `src/lib/dberror.ts` and `check:dberror`.
//
// WHY IT NEEDS A DATABASE. The column is a STRING inside a chained call. No
// type-checker sees it, `check:ui` cannot know what a view is called, and
// reading the migration that creates the view is the method that produced the
// bug: `dl.id as line_id` reads like an `id` until you look twice. The only
// thing that actually knows is the database.
//
// AND IT IS THE PAGED READS THAT MATTER MOST. A bad order on a one-shot read
// fails the same way, but a paged read has a second failure mode: WITHOUT a
// stable order the pages can overlap, so a row is doubled or dropped and the
// result still looks complete. That is why `allRows()` requires one — and why
// a wrong one is worse than none.
//
//   node scripts/check-order-columns.mjs "-h /tmp/pg -p 55432 -U postgres -d x"
//
// against a database with every migration applied.
// ===========================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv[2];
if (!args) {
  console.error('usage: node scripts/check-order-columns.mjs "<postgres url or psql args>"');
  process.exit(2);
}
const psql = (sql) => execFileSync('psql', [...args.split(' '), '-Atc', sql], { encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------
// What the app asks for. Read out of the source rather than re-declared, so
// the two cannot drift — the whole point of a check that re-states its subject
// is lost the first time somebody edits one of the two.
//
// The shape matched is one chained call: `.from('x')` … `.order('c')` …, up to
// the `.range(` that makes it a paged read or the end of the statement.
// ---------------------------------------------------------------------------
const SRC = 'src/lib/supabase.ts';
const src = readFileSync(SRC, 'utf8');

const reads = [];
const fromRe = /\.from\('([a-z0-9_]+)'\)/g;
let m;
while ((m = fromRe.exec(src))) {
  const table = m[1];
  // The rest of the statement: to the next `.from(` or a blank line, whichever
  // comes first. Deliberately short — a window that runs on would pick up the
  // NEXT read's order columns and blame them on this table.
  const rest = src.slice(m.index, m.index + 600);
  const stop = Math.min(
    ...[rest.indexOf('\n\n'), rest.indexOf('.from(', 6), rest.length]
      .map((i) => (i < 0 ? rest.length : i)),
  );
  const window = rest.slice(0, stop);
  const line = src.slice(0, m.index).split('\n').length;
  for (const o of window.matchAll(/\.order\('([a-z0-9_]+)'/g)) {
    reads.push({ table, column: o[1], line, paged: /\.range\(/.test(window) });
  }
}
if (!reads.length) {
  console.error(`\nNo .from(…).order(…) pairs found in ${SRC}. The parse is broken, not the code:`);
  console.error('a check that silently finds nothing passes every time.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// What the database has.
// ---------------------------------------------------------------------------
const rows = psql(`
  select table_name || '.' || column_name
    from information_schema.columns
   where table_schema = 'public'`).split('\n').filter(Boolean);
const have = new Set(rows);
const known = new Set(rows.map((r) => r.split('.')[0]));

const bad = [];
const skipped = [];
for (const r of reads) {
  // A table this database has never heard of is not this check's finding: it
  // may be created by a migration filed elsewhere, or be a name built at
  // runtime. Reported at the end rather than failed on, because a check that
  // cries about something it cannot judge gets switched off.
  if (!known.has(r.table)) { skipped.push(r); continue; }
  if (!have.has(`${r.table}.${r.column}`)) bad.push(r);
}

console.log(`\n-- every ORDER column exists on the relation it orders --\n`);
for (const r of bad) {
  // The nearest names, since the fault is almost always a rename: `id` against
  // a view that publishes `line_id`.
  const near = rows
    .filter((x) => x.startsWith(`${r.table}.`))
    .map((x) => x.split('.').slice(1).join('.'))
    .filter((c) => c.includes(r.column) || r.column.includes(c));
  console.log(`  ✗ ${SRC}:${r.line}  ${r.table}.${r.column} does not exist`
    + (near.length ? `\n        did you mean: ${near.join(', ')}` : '')
    + (r.paged ? '\n        (a PAGED read — PostgREST answers a bad order with an ERROR,'
               + '\n         so the register comes back EMPTY, not merely unsorted)' : ''));
}
if (skipped.length) {
  const names = [...new Set(skipped.map((s) => s.table))].sort();
  console.log(`  – not in this database, so not judged: ${names.join(', ')}`);
}
if (!bad.length) {
  console.log(`  ✓ ${reads.length} order columns across `
    + `${new Set(reads.map((r) => r.table)).size} relations\n`);
}
process.exit(bad.length ? 1 : 0);
