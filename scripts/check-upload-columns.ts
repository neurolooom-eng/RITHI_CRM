// ---------------------------------------------------------------------------
// Every column a register writes must EXIST on the table it writes to.
//
// The MRN register mapped its leftovers into `material_returns.extra`, a column
// no migration ever added — so the upload could never have written a row, while
// the shaped preview said "595 ready" right up to the failure. Reading the def
// cannot catch that; only a database can.
//
//   npm run check:columns -- "-h /tmp/pg -p 55432 -U postgres -d rithi"
//
// Checks each register's table exists, and that every target column does: the
// `to:` of every column, `extraInto`, and every key of `stamp`.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { UPLOADS, masterUpload } from '../src/lib/uploads';

const args = process.argv.slice(2).join(' ').trim();
if (!args) {
  console.error('usage: npm run check:columns -- "<psql connection args>"');
  process.exit(2);
}

// One column out, joined with a dot: a separator flag has to survive two levels
// of shell quoting, and a `\t` that arrives literal silently matches nothing.
const rows = execFileSync('bash', [
  '-c',
  `psql ${args} -tA -c "select table_name || '.' || column_name from information_schema.columns where table_schema='public'"`,
], { encoding: 'utf8' });

const cols = new Map<string, Set<string>>();
rows.split('\n').forEach((line) => {
  const i = line.indexOf('.');
  if (i < 1) return;
  const t = line.slice(0, i), c = line.slice(i + 1);
  if (!cols.has(t)) cols.set(t, new Set());
  cols.get(t)!.add(c);
});
if (!cols.size) { console.error('No columns came back — check the psql arguments.'); process.exit(2); }

// The master value lists all share one table; one representative is enough.
const all = [...UPLOADS, masterUpload({ key: 'complaint', label: 'Standard Complaint' })];

// THE ARCHIVE REGISTERS ARE IN A DIFFERENT DATABASE, so which ones this run can
// check depends on which database you pointed it at. Checked when the
// connection has the history tables, reported as skipped when it does not —
// never silently passed, because "no table history_calls" against the live
// project is the correct answer and would otherwise read as a broken register.
const isArchiveDb = cols.has('history_calls');
const defs = all.filter((d) => (d.db === 'archive') === isArchiveDb);
const skipped = all.length - defs.length;
if (skipped) {
  console.log(`${skipped} ${isArchiveDb ? 'live' : 'archive'} register(s) skipped — `
    + `this connection is the ${isArchiveDb ? 'ARCHIVE' : 'LIVE'} database. `
    + `Run it again against the other one to check those.`);
}

const problems: string[] = [];
for (const def of defs) {
  const have = cols.get(def.table);
  if (!have) { problems.push(`${def.label}: there is no table "${def.table}"`); continue; }
  const wanted = [
    ...def.cols.map((c) => c.to),
    ...(def.extraInto ? [def.extraInto] : []),
    ...Object.keys(def.stamp ?? {}),
  ];
  const missing = [...new Set(wanted)].filter((c) => !have.has(c));
  if (missing.length) problems.push(`${def.label} -> ${def.table}: no column ${missing.join(', ')}`);
}

if (problems.length) {
  console.error('These registers write to columns the database does not have:\n');
  problems.forEach((p) => console.error('  ✗ ' + p));
  console.error('\nAdd the column in a migration, or stop writing it.');
  process.exit(1);
}
console.log(`every column of ${defs.length} ${isArchiveDb ? 'archive' : 'live'} registers exists`);
