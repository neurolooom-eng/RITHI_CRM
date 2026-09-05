// ---------------------------------------------------------------------------
// EVERY VIEW OVER AN RLS-PROTECTED TABLE MUST BE `security_invoker`.
//
// Without it a view runs as its OWNER, and row-level security stops applying to
// whoever is reading. There is no error and no warning: the view simply returns
// everything. `create or replace view` does not carry the setting over, so one
// migration that rebuilds a view and forgets the `alter` re-opens it silently.
//
// That is not hypothetical. 0040 set it on `calls`, 0050 re-created the view and
// set it again, 0057 re-created the view and did not — and every signed-in user
// could read every call in the register. `pending_calls` and `call_state` carry
// the setting themselves and leaked anyway, because a view marked invoker that
// reads a view running as its owner inherits the owner's reach.
//
// Run against a database with the migrations applied:
//   npm run check:views -- "-h /tmp/pg -p 55432 -U postgres -d mydb"
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2).flatMap((a) => a.split(' ')).filter(Boolean);
if (!args.length) {
  console.error('usage: npm run check:views -- "<psql connection args>"');
  process.exit(2);
}

// Views the project has decided any signed-in user may read. Each needs a
// REASON, because "it was already like that" is how such a list grows.
const OPEN_BY_DESIGN = new Map([
  ['app_user_names',
   'id -> display name only, so a table can show who created a row instead of a UUID (0068). Discloses no more than the user directory itself.'],
]);

const SQL = `
select c.relname || '|' || string_agg(distinct rt.relname, ', ' order by rt.relname)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_rewrite rw on rw.ev_class = c.oid
  join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
  join pg_class rt on rt.oid = d.refobjid and rt.relkind = 'r' and rt.relrowsecurity
 where c.relkind = 'v'
   and coalesce(array_to_string(c.reloptions, ',') not like '%security_invoker=on%', true)
 group by c.relname
 order by c.relname;
`;

const out = execFileSync('psql', [...args, '-At', '-c', SQL], { encoding: 'utf8' });
const rows = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const at = l.indexOf('|');
  return { view: l.slice(0, at), reads: l.slice(at + 1) };
});

const bad = rows.filter((r) => !OPEN_BY_DESIGN.has(r.view));
rows.filter((r) => OPEN_BY_DESIGN.has(r.view))
  .forEach((r) => console.log(`  · ${r.view} — open by design: ${OPEN_BY_DESIGN.get(r.view)}`));

if (!bad.length) {
  console.log('\nevery view over an RLS-protected table applies RLS to the reader\n');
  process.exit(0);
}

console.log('\nThese views run as their OWNER, so row-level security does NOT apply');
console.log('to whoever reads them. Everyone signed in can read everything they show.\n');
bad.forEach((r) => {
  console.log(`  x ${r.view}`);
  console.log(`      reads (RLS-protected): ${r.reads}`);
  console.log(`      -> alter view public.${r.view} set (security_invoker = on);\n`);
});
console.log(`${bad.length} view(s) bypassing row-level security.\n`);
process.exit(1);
