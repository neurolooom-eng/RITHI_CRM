#!/usr/bin/env node
// ===========================================================================
// Every register's ON CONFLICT target, checked against a REAL database.
//
// `on conflict (cols)` needs a unique index Postgres can INFER from that exact
// column list. It cannot infer a PARTIAL index, an EXPRESSION index, or
// anything at all on a VIEW — and none of that is visible by reading the
// upload definitions, which is why this has now shipped five times:
//
//   0071  reports_uid_key was partial
//   0074  handstock_opening keyed on an expression
//   0076  parties keyed on an expression
//   0077  three call registers pointed at a VIEW; two more at partial /
//         expression indexes
//   0079  parts and products — written as the FIX for this, and partial again
//
// Reading the SQL was not enough any of those times. Asking the database is.
//
//   node scripts/check-upsert-targets.mjs "postgres://…"
//
// with a database that has every migration applied. Exits non-zero on the
// first register whose target cannot be inferred.
// ===========================================================================
import { execFileSync } from 'node:child_process';

const url = process.argv[2];
if (!url) { console.error('usage: node scripts/check-upsert-targets.mjs <postgres url or psql args>'); process.exit(2); }
const psql = (sql) => execFileSync('psql', [...url.split(' '), '-Atc', sql], { encoding: 'utf8' }).trim();

// Read the registers out of the built app rather than re-declaring them, so the
// two cannot drift.
const { UPLOADS } = await import('../src/lib/uploads.ts').catch(async () => {
  const { execFileSync: run } = await import('node:child_process');
  run('npx', ['esbuild', 'src/lib/uploads.ts', '--bundle', '--platform=node', '--format=esm',
              '--outfile=node_modules/.cache/uploads.mjs', '--log-level=error'], { stdio: 'inherit' });
  return import('../node_modules/.cache/uploads.mjs');
});

let bad = 0;
for (const d of UPLOADS) {
  if (!d.conflict) continue;
  const kind = psql(`select coalesce((select relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='${d.table}'), '?')`);
  if (kind === 'v') {
    console.log(`  ✗ ${d.key.padEnd(28)} target is a VIEW (${d.table}) — a view cannot be upserted`); bad++; continue;
  }
  const ok = psql(`
    select count(*) from pg_index i
     where i.indrelid = to_regclass('public.${d.table}')
       and i.indisunique and i.indpred is null and i.indexprs is null
       and (select string_agg(a.attname, ',' order by k.ord)
              from unnest(i.indkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum)
           = (select string_agg(trim(x), ',') from unnest(string_to_array('${d.conflict}', ',')) x)`);
  if (ok === '1') console.log(`  ✓ ${d.key.padEnd(28)} on conflict (${d.conflict})`);
  else { console.log(`  ✗ ${d.key.padEnd(28)} NO INFERABLE UNIQUE INDEX for (${d.conflict}) on ${d.table}`); bad++; }
}
console.log(bad ? `\n${bad} register(s) would fail at upload.\n` : '\nevery upsert target is inferable\n');
process.exit(bad ? 1 : 0);
