#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Supabase loads pg_safeupdate for the API roles: an UPDATE or DELETE with no
// WHERE clause is REFUSED — "UPDATE requires a WHERE clause" — including inside
// a SECURITY DEFINER function, since the guard is a session setting, not a
// privilege. psql never shows it, so the only symptom is a screen that stops at
// row 1 in production. (That is how the Party Master upload failed: a counter
// bumped with `update ... set last_no = last_no + 1` and no WHERE.)
//
// So: every update/delete a function runs must name its rows. Only the LAST
// definition of each function is checked — a later migration that fixes one is
// the definition the database ends up with. DO blocks are not checked: those
// are applied in the SQL editor, where the guard is not loaded.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'supabase/migrations';
const latest = new Map();   // function name -> { file, line, body }

const DEFN = /create\s+or\s+replace\s+function\s+([a-z0-9_.]+)\s*\(/gi;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  for (const m of sql.matchAll(DEFN)) {
    const open = sql.indexOf('$$', m.index);
    if (open < 0) continue;
    const close = sql.indexOf('$$', open + 2);
    if (close < 0) continue;
    latest.set(m[1].replace(/^public\./, ''), {
      file, line: sql.slice(0, m.index).split('\n').length,
      body: sql.slice(open + 2, close),
    });
  }
}

const problems = [];
for (const [name, { file, line, body }] of latest) {
  for (const raw of body.replace(/--[^\n]*/g, ' ').split(';')) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!/^(update|delete from)\s+[a-z_.'"%]/i.test(s)) continue;
    if (/\bwhere\b/i.test(s)) continue;
    problems.push(`${name}()  ${file}:${line}\n      ${s.slice(0, 100)}`);
  }
}

if (problems.length) {
  console.error('These run without a WHERE clause, and Supabase refuses them:\n');
  problems.forEach((p) => console.error('  ✗ ' + p));
  console.error('\nName the rows — even a counter table with one row in it.');
  process.exit(1);
}
console.log(`no WHERE-less update or delete in any of the ${latest.size} functions`);
