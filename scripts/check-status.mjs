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

const out = execFileSync('psql', [...args.split(/\s+/), '-q', '-f', 'supabase/apply/_status.sql'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

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

console.log(`\nevery _status.sql row reads yes on a fully-applied database (${nos.length} skipped)`);
