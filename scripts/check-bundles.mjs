// ---------------------------------------------------------------------------
// A BUNDLE MUST CARRY THE LATEST DEFINITION OF EVERYTHING IT DEFINES.
//
// The apply bundles are replayed one at a time, not only as a set. So if a
// function is created in module A and later REDEFINED in module B, re-running
// A on its own puts the old definition back — silently, with no error, and the
// bundle reports success.
//
// That is not hypothetical. `visible_engineer_names()` was created by 0004
// (user_directory) and redefined by 0092 (rbac). A full apply was fine, because
// rbac runs after user_directory. Running `user_directory.sql` ALONE undid
// 0092, a Reporting Manager stopped seeing their team, and the backlog note
// that sent somebody to run that bundle was the thing that broke it. It read as
// "the migration was never applied" and it was not: it had been applied and
// then overwritten.
//
// The rule that prevents it is simple: every definition of one object lives in
// ONE module. Then replaying any single bundle leaves that object at its latest
// definition, whichever bundle you run and in whatever order.
//
//   node scripts/check-bundles.mjs
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'supabase/migrations';

// migration file -> module it belongs to. READ from the generator's source
// rather than imported from it: that module builds every bundle the moment it
// loads, and a check has no business writing files.
const moduleOf = new Map();
{
  const src = readFileSync('scripts/build-apply-bundles.mjs', 'utf8');
  const body = src.slice(src.indexOf('const MODULES = {'));
  const re = /^  ([a-z_]+): \{/gm;
  const starts = [...body.matchAll(re)].map((m) => ({ name: m[1], at: m.index }));
  starts.forEach((s0, i) => {
    const chunk = body.slice(s0.at, i + 1 < starts.length ? starts[i + 1].at : body.length);
    for (const f of chunk.match(/'(\d{4}_[a-z0-9_]+\.sql)'/g) ?? []) {
      moduleOf.set(f.slice(1, -1), s0.name);
    }
  });
}

// Objects a migration DEFINES. Only `create [or replace]` counts — a migration
// that merely calls or grants on an object does not redefine it.
const DEFS = [
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  /create\s+(?:or\s+replace\s+)?(?:recursive\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
  /create\s+(?:or\s+replace\s+)?procedure\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
];

const where = new Map();   // object -> Map(module -> [files])
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const mod = moduleOf.get(file);
  if (!mod) continue;                       // build-apply-bundles.mjs already refuses this
  const sql = readFileSync(`${DIR}/${file}`, 'utf8');
  for (const re of DEFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql))) {
      const obj = m[1].toLowerCase();
      if (!where.has(obj)) where.set(obj, new Map());
      const by = where.get(obj);
      if (!by.has(mod)) by.set(mod, []);
      if (!by.get(mod).includes(file)) by.get(mod).push(file);
    }
  }
}

// KNOWN, AND NOT YET PAID OFF. These were split before this check existed. Each
// is the same latent fault: re-run the earlier bundle on its own and the object
// goes back a version, quietly. They are listed rather than fixed because
// unpicking them means moving migrations between modules, which changes the
// order a FRESH apply runs in — the other way this project has broken itself —
// and that deserves its own change with its own verification, not a footnote to
// somebody else's.
//
// The list only ever shrinks. Anything NOT on it fails the check, so a new one
// cannot be added by accident; take one off the list when you have moved it.
const KNOWN = new Set([
  'call_requests_biu',              // base 0003        -> call_requests 0097
  'calls_before_insert',            // base 0001        -> call_requests 0050
  'can_see_call',                   // base 0001        -> rbac 0034
  'dispatch_spare_lines',           // spare_requests   -> handstock 0065
  'engineer_stock',                 // stock_transfer   -> handstock 0039
  'is_admin',                       // base 0001        -> rbac 0008
  'next_ucn',                       // base 0001        -> call_requests 0040
  'notify_spare_dispatched',        // notifications    -> handstock 0064
  'spare_pending_dispatch',         // spare_requests   -> handstock 0055
  'spare_requests_stage_guard',     // rbac 0008        -> spare_requests 0016
  'stock_transfer_lines_check_stock', // stock_transfer -> handstock 0089
  'visible_engineer_names',         // base 0001        -> user_directory 0092
]);

const split = [...where].filter(([, by]) => by.size > 1).sort((a, b) => a[0].localeCompare(b[0]));
const fresh = split.filter(([obj]) => !KNOWN.has(obj));

const describe = ([obj, by]) => {
  console.log(`  ${fresh.some((f) => f[0] === obj) ? '✗' : '·'} ${obj}`);
  for (const [mod, files] of by) console.log(`      ${mod.padEnd(18)} ${files.join(', ')}`);
  const last = [...by].flatMap(([mod, fs]) => fs.map((f) => ({ f, mod })))
    .sort((a, b) => a.f.localeCompare(b.f)).at(-1);
  console.log(`      → move them all into "${last.mod}", which holds the last one (${last.f}).\n`);
};

if (fresh.length === 0) {
  const stale = [...KNOWN].filter((k) => !split.some(([obj]) => obj === k));
  if (stale.length) {
    console.log(`\n${stale.length} object(s) on the known list are no longer split — take them off it:`);
    stale.forEach((k) => console.log(`  · ${k}`));
    console.log('');
    process.exit(1);
  }
  console.log(`\nno NEW object is split across modules (${where.size} checked, ${split.length} known and listed)\n`);
  process.exit(0);
}

console.log('\nAn object defined in two modules: re-running the EARLIER bundle');
console.log('puts the older definition back, with no error and no warning.\n');
fresh.forEach(describe);
console.log(`${fresh.length} NEW object(s) split across modules.\n`);
process.exit(1);
