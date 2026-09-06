// ---------------------------------------------------------------------------
// REPLAYING ANY ONE BUNDLE MUST NOT CHANGE THE SCHEMA.
//
// The apply bundles are run one at a time, by hand, on the live project —
// "run rbac.sql for the new role layouts" — and each carries every migration in
// its module from the beginning. So if a bundle creates an object that a LATER
// module narrows, running that bundle alone puts the wider version back. No
// error. No warning. The bundle reports success.
//
// `check:bundles` reads the migrations and finds objects defined in two
// modules, which is the shape of the fault. This runs the experiment instead:
// build a reference database from all.sql, replay each bundle onto a copy of
// it, and diff every policy, function and view. Whatever comes back different
// is a thing that bundle silently reverts.
//
// It is the only way to see the two the text cannot show:
//   • `masters_write`, which 0008 creates through `execute format(...)` in a
//     loop, so no `create policy` literal exists to find;
//   • a definition that is textually different but semantically identical,
//     which the text check would report and this one correctly ignores.
//
// Needs a running Postgres it may create databases on:
//   npm run check:replay -- "-h /tmp/pg -p 55432 -U postgres"
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2).flatMap((a) => a.split(' ')).filter(Boolean);
if (!args.length) {
  console.error('usage: npm run check:replay -- "<psql connection args, no -d>"');
  console.error('the check creates and drops its own databases, so give it a server, not a database');
  process.exit(2);
}

const SNAPSHOT = `
select 'policy ' || schemaname || '.' || tablename || '.' || policyname
       || ' | ' || cmd || ' | ' || coalesce(qual, '-') || ' | ' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public'
union all
select 'function ' || replace(pg_get_functiondef(p.oid), E'\\n', ' ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f', 'p')
union all
select 'view ' || c.relname || ' | ' || replace(pg_get_viewdef(c.oid), E'\\n', ' ')
       || ' | security_invoker='
       || coalesce((select 'on' from unnest(coalesce(c.reloptions, '{}')) o
                     where o = 'security_invoker=true'), 'OFF')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v', 'm')
order by 1
`;

const psql = (db, extra) =>
  execFileSync('psql', [...args, ...(db ? ['-d', db] : []), '-v', 'ON_ERROR_STOP=1', ...extra],
               { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

const quietly = (db, extra) => {
  try { return psql(db, extra); } catch (e) { return `\n!! ${e.stderr || e.message}`; }
};

const REF = 'rithi_replay_ref';
const COPY = 'rithi_replay_copy';

const drop = (db) => quietly('postgres', ['-q', '-c', `drop database if exists ${db} with (force)`]);

// The bundles a person is ever told to run. `_*.sql` are checks and one-off
// repairs, not bundles; all.sql is the reference itself.
const bundles = [
  ...readdirSync('supabase/apply').filter((f) => f.endsWith('.sql') && !f.startsWith('_') && f !== 'all.sql')
    .map((f) => `supabase/apply/${f}`),
  'Spare_1.sql', 'HandStock_X.sql',
].filter((f) => existsSync(f)).sort();

console.log(`\nbuilding the reference database from all.sql …`);
drop(REF);
psql('postgres', ['-q', '-c', `create database ${REF}`]);
try {
  psql(REF, ['-q', '-f', 'supabase/tests/_stub.sql', '-f', 'supabase/apply/all.sql']);
} catch (e) {
  console.error(`\nall.sql does not apply cleanly — fix that first:\n${e.stderr || e.message}`);
  process.exit(1);
}
const ref = psql(REF, ['-tAc', SNAPSHOT]).split('\n');

let bad = 0;
for (const bundle of bundles) {
  drop(COPY);
  psql('postgres', ['-q', '-c', `create database ${COPY} template ${REF}`]);
  const log = quietly(COPY, ['-q', '-f', bundle]);

  // A bundle that REFUSES to run here is doing its job — base.sql does, on any
  // database that has rbac — and leaves the schema untouched, which is the
  // property this check is about.
  if (/refus|already past/i.test(log)) {
    console.log(`  ·  ${bundle.padEnd(36)} refuses to run on a database past it — correct`);
    continue;
  }
  if (log.startsWith('\n!!')) {
    console.log(`  ✗  ${bundle.padEnd(36)} FAILED to apply${log}`);
    bad++;
    continue;
  }

  const after = psql(COPY, ['-tAc', SNAPSHOT]).split('\n');
  const gone = ref.filter((l) => !after.includes(l));
  const added = after.filter((l) => !ref.includes(l));
  if (!gone.length && !added.length) { console.log(`  ok ${bundle}`); continue; }

  bad++;
  const name = (l) => l.replace(/^policy ([a-z_.]+).*/, 'policy $1')
                       .replace(/^function CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+).*/i, 'function $1()')
                       .replace(/^view ([a-z_]+) .*/, 'view $1');
  const objects = [...new Set([...gone, ...added].map(name))].sort();
  console.log(`  ✗  ${bundle.padEnd(36)} REVERTS ${objects.length} object(s) on replay:`);
  objects.forEach((o) => console.log(`       ${o}`));
}
drop(COPY);
drop(REF);

if (bad) {
  console.log(`\n${bad} bundle(s) change the schema when replayed. Each one is a change`);
  console.log('somebody made that a later module narrowed, waiting to be undone by hand.');
  console.log('The fix is a guarded mirror at the END of the bundle\'s module — see');
  console.log('supabase/migrations/0121_rbac_policy_tail.sql and MIRRORS in check-bundles.mjs.\n');
  process.exit(1);
}
console.log(`\nevery bundle (${bundles.length}) replays with no change to the schema\n`);
