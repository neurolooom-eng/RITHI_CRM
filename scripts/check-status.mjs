#!/usr/bin/env node
// ===========================================================================
// _status.sql MUST READ YES ON A DATABASE THAT HAS EVERYTHING.
//
// `supabase/apply/_status.sql` is the file somebody runs to ask "what is
// missing?", and it is hand-maintained — one row per checkable object, each
// naming the bundle to run when it answers NO.
//
// A ROW THAT ANSWERS NO WHEN NOTHING IS MISSING IS WORSE THAN NO ROW AT ALL,
// because it is acted on: it sends somebody to re-run a bundle that is already
// in, and it teaches them that a NO here might mean nothing. That happened
// (2026-09-12/13): two Field Failure rows read NO on a fully-applied live
// database because a LATER migration had legitimately replaced what they
// tested — 0169 dropped the zero-argument next_ffr_no() and rewrote
// ffr_from_review as a wrapper — and the rows went on asserting the old shape.
//
// So: build a database from every migration, run _status.sql, and fail on any
// NO. On that database nothing CAN be missing, so every NO is a faulty check.
//
//   npm run check:status -- "-h /tmp/pg -p 55444 -U postgres -d <db>"
//
// The database must already carry _stub.sql + every migration — the same one
// check:views is pointed at.
// ===========================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = (process.argv[2] ?? '').trim();
if (!args) {
  console.error('usage: npm run check:status -- "<psql args for a database built from every migration>"');
  process.exit(2);
}

// ROWS THAT CANNOT PASS ON A THROWAWAY POSTGRES, and say so in their own text.
// Listed by a distinctive fragment of the bundle name, with the reason — an
// exemption without one is how a real failure gets quietly added to the list.
const EXEMPT = [
  // pg_cron is a Supabase extension; a plain local Postgres has no such
  // scheduler, and the row's own description explains the fallback.
  ['quarter past nine', 'needs the pg_cron extension, which a throwaway Postgres has not got'],
];

// FIRST, THAT THE REPORT RAN AT ALL.
//
// This check used to congratulate itself on a _status.sql that did not
// COMPILE. `psql -f` exits 0 on a failed statement unless told otherwise, so a
// syntax error produced an empty report, the "NO" filter below matched nothing,
// and the script printed "every row reads yes". It was caught by accident
// (2026-09-14) while adding a row: the skipped-row count silently fell from 1
// to 0 and the error was on stderr, which was not being read.
//
// A checker that passes on NO OUTPUT is the worst kind, because it is loudest
// exactly when it knows least. So: stop psql on the first error, keep stderr,
// and then prove the report has as many rows as the file has checks — an empty
// or truncated report now fails instead of passing.
let out;
try {
  out = execFileSync('psql', [...args.split(/\s+/), '-q', '-v', 'ON_ERROR_STOP=1',
                              '-f', 'supabase/apply/_status.sql'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('\n_status.sql did not run. It is the file people are told to run FIRST,');
  console.error('so it failing silently is worse than any row it could get wrong.\n');
  console.error(String(e.stderr ?? e.message).trim());
  process.exit(1);
}

// Every check in the file is a `(<sort order>, '<name>', '<provides>', <test>)`
// tuple; every check in the REPORT is a row answering yes or NO. If the two
// disagree the report is truncated, and a missing row proves nothing.
const declared = (readFileSync('supabase/apply/_status.sql', 'utf8')
  .match(/^\s{4}\(\d+, '/gm) ?? []).length;
const rows = out.split('\n').filter((l) => / \| (yes|NO  <-- apply this) +\|/.test(l)).length;
if (!rows || rows !== declared) {
  console.error(`\n_status.sql declares ${declared} checks and the report came back with ${rows} rows.`);
  console.error('The report is empty or truncated, so "no NOs" would mean nothing.');
  process.exit(1);
}

const nos = out.split('\n').filter((l) => l.includes('NO  <-- apply this'));
const unexpected = [];
for (const line of nos) {
  const name = line.split('|')[0].trim();
  const hit = EXEMPT.find(([frag]) => name.includes(frag));
  if (hit) console.log(`  – skipped: ${name.slice(0, 70)}\n      (${hit[1]})`);
  else unexpected.push(name);
}

if (unexpected.length) {
  console.error('\nA _status.sql row reads NO on a database where EVERY migration is applied.');
  console.error('Nothing is missing, so the CHECK is wrong — most often because a later');
  console.error('migration replaced what it tests and the row was not moved with it.\n');
  unexpected.forEach((n) => console.error(`  ✗ ${n}`));
  console.error('\nFix the row in supabase/apply/_status.sql to test the CURRENT definition.');
  process.exit(1);
}

console.log(`\nevery one of the ${rows} _status.sql rows reads yes on a fully-applied database`
  + (nos.length ? ` (${nos.length} skipped)` : ''));
