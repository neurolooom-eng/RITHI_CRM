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
//
// POLICIES COUNT, and they were the blind spot. This checked functions, views
// and procedures only — so `srl_insert`, created by 0008 in `rbac` and
// redefined by 0087/0088 in `spare_requests`, was invisible to it. On
// 2026-09-06 the user's `_status.sql` came back with row 40 as NO: they had
// run `rbac.sql` the day before for 0110, which put 0008's version back and
// broke spare-line inserts against a stub parent again. Exactly the fault this
// file was written for, in the one object class it did not look at.
//
// A policy's identity is its NAME AND ITS TABLE — two tables may each have a
// `xxx_read` and they are different objects — so it is keyed on both.
const DEFS = [
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  /create\s+(?:or\s+replace\s+)?(?:recursive\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
  /create\s+(?:or\s+replace\s+)?procedure\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  /create\s+policy\s+([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
];

// MIRROR FILES. A migration whose whole job is to re-assert, VERBATIM, the
// latest definition of objects another module owns — so that replaying ITS
// bundle alone leaves those objects at their latest version instead of the
// version an earlier migration in the same bundle created.
//
// `0121_rbac_policy_tail.sql` is the first. 0008 (rbac) creates a policy for
// most tables in the schema, and six of those are narrowed later by masters,
// spare_requests and handstock. Those six could not be MOVED into rbac the way
// 0087/0088 were — each sits in a migration doing work that belongs to its own
// module — so rbac ends with copies of them instead.
//
// A copy is only safe while it stays a copy, and nothing but this check makes
// it stay one. So a mirror is held to a stricter rule than everything else
// here: for every object it defines, its definition must match the owning
// migration's WORD FOR WORD (comments and whitespace aside). Edit 0040's
// sr_read and forget the mirror, and this fails — which is the whole point,
// because the alternative is rbac.sql quietly shipping last month's policy.
const MIRRORS = new Set([
  '0121_rbac_policy_tail.sql',              // rbac           -> masters, spare_requests, handstock
  '0122_spare_requests_replay_tail.sql',    // spare_requests -> handstock
  '0122_stock_transfer_replay_tail.sql',    // stock_transfer -> handstock
  '0122_notifications_replay_tail.sql',     // notifications  -> handstock
  '0122_user_directory_replay_tail.sql',    // user_directory -> rbac (a DROP, so nothing to compare)
]);

const where = new Map();   // object -> Map(module -> [files])
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const mod = moduleOf.get(file);
  if (!mod) continue;                       // build-apply-bundles.mjs already refuses this
  if (MIRRORS.has(file)) continue;          // checked below, against the definitions it copies
  const sql = readFileSync(`${DIR}/${file}`, 'utf8');
  for (const re of DEFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql))) {
      // A policy match carries its table in the second group; everything else
      // is named on its own.
      const obj = (m[2] ? `${m[2]}.${m[1]}` : m[1]).toLowerCase();
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

  // POLICIES, found the day this check learned to see them (2026-09-06), all of
  // them older than the check. `srl_insert` is NOT on this list: it is the one
  // that actually bit — the user ran `rbac.sql` for 0110 and spare-line inserts
  // against a stub parent broke again — so 0087/0088 were MOVED into `rbac`
  // and it is genuinely fixed. The rest are the same latent fault waiting.
  //
  // Six of them are not merely latent: replaying `rbac.sql` alone DOES revert
  // them today, proven by applying every migration to one database, replaying
  // the bundle on a copy, and diffing pg_policies. `_status.sql` rows 69-74
  // now report each one, so the next time somebody runs a bundle the drift is
  // visible instead of silent — which is what this list cannot give them.
  //
  // Unpicking the rest means moving migrations between modules, and that
  // changes the order a FRESH apply runs in — the other way this project has
  // broken itself. Each is its own change with its own verification.
  'call_requests.cr_insert',           // base 0003 -> rbac 0008 -> call_requests 0011
  'call_requests.cr_read',             // base 0003 -> call_requests 0053
  'call_requests.cr_update',           // base 0003 -> rbac 0008 -> call_requests 0011
  'calls.calls_insert',                // base 0001 -> rbac 0008
  'calls.calls_scoped_read',           // base 0001 -> call_requests 0008 -> rbac 0008
  'calls.calls_update',                // base 0001 -> call_requests 0008 -> rbac 0008
  'feedback.fb_read',                  // base 0001 -> rbac 0008
  'feedback.fb_write',                 // base 0001 -> rbac 0008
  'pending_registrations.pend_insert', // base 0001 -> rbac 0008
  'pending_registrations.pend_read',   // base 0001 -> rbac 0008
  'pending_registrations.pend_update', // base 0001 -> rbac 0008
  'profiles.profiles_admin_write',     // base 0001 -> rbac 0008
  'profiles.profiles_self_read',       // base 0001 -> rbac 0008
  'reports.reports_read',              // base 0001 -> rbac 0008 -> call_requests 0040
  'reports.reports_write',             // base 0001 -> rbac 0008
  'spare_consumption.cons_read',       // base 0001 -> rbac 0008 -> handstock 0038   ** reverts in practice
  'spare_consumption.cons_write',      // base 0001 -> rbac 0008 -> handstock 0059   ** reverts in practice
  'spare_dispatches.sd_read',          // spare_requests 0027 -> handstock 0095
  'spare_request_lines.srl_read',      // base 0001 -> rbac 0008
  'spare_request_lines.srl_update',    // rbac 0008 -> spare_requests 0016           ** reverts in practice
  'spare_requests.sr_insert',          // base 0001 -> rbac 0008
  'spare_requests.sr_read',            // base 0001 -> rbac 0008 -> spare_requests 0040  ** reverts in practice
  'spare_requests.sr_update',          // spare_requests 0006 -> rbac 0008           ** reverts in practice
  'stock_transfers.st_read',           // stock_transfer 0020 -> handstock 0041
  'user_directory.ud_read',            // user_directory 0004 -> rbac 0008
]);

// AND ONE THIS CHECK CANNOT SEE AT ALL, recorded so the next reader knows the
// limit rather than trusting a clean run too far: 0008 creates `masters_write`
// through `execute format(...)` in a loop, so no `create policy` literal
// appears in the file. 0067 DROPS it and replaces it with per-list
// insert/update/delete policies — and replaying `rbac.sql` brings it back.
// Policies are OR'd, so a holder of `masters.edit` can then write every list
// again, which is exactly what 0067 narrowed. `_status.sql` row 74 reports it,
// because a regex over the migration text never will.

// ---------------------------------------------------------------------------
// The mirror check. Two things have to hold for `0121_rbac_policy_tail.sql` to
// do its job, and neither is visible by reading it:
//
//   1. it must be the LAST file in its module, or an earlier migration in the
//      same bundle overwrites it right back;
//   2. every definition in it must be the owning migration's, unchanged.
// ---------------------------------------------------------------------------
{
  // The text of one `create ...` statement: from the keyword to the `;` that
  // ends it, ignoring a `;` inside a quoted string or a dollar-quoted body —
  // a function body is full of them.
  const statementAt = (sql, from) => {
    let i = from, q = null;
    while (i < sql.length) {
      if (q) {
        if (q.length > 1) { if (sql.startsWith(q, i)) { i += q.length; q = null; continue; } }
        else if (sql[i] === q) q = null;
        i++;
        continue;
      }
      const dollar = /^\$[a-z_]*\$/i.exec(sql.slice(i, i + 32));
      if (dollar) { q = dollar[0]; i += q.length; continue; }
      const c = sql[i];
      if (c === "'" || c === '"') q = c;
      else if (c === ';') return sql.slice(from, i);
      i++;
    }
    return sql.slice(from);
  };
  // Comments and whitespace are not the definition; everything else is.
  const norm = (t) => t.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // Every definition in a file, as object -> [normalised statement]. A name can
  // carry several: `dispatch_spare_lines` has three overloads, and a mirror may
  // need more than one of them.
  const defsIn = (sql) => {
    const out = new Map();
    for (const re of DEFS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sql))) {
        const obj = (m[2] ? `${m[2]}.${m[1]}` : m[1]).toLowerCase();
        if (!out.has(obj)) out.set(obj, []);
        out.get(obj).push(norm(statementAt(sql, m.index)));
      }
    }
    return out;
  };

  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  // Every definition any NON-mirror migration makes: statement -> the file it
  // came from. A mirror's copy has to be one of these, word for word.
  const owned = new Map();                  // object -> Map(statement -> file)
  for (const f of files) {
    if (!moduleOf.get(f) || MIRRORS.has(f)) continue;
    for (const [obj, stmts] of defsIn(readFileSync(`${DIR}/${f}`, 'utf8'))) {
      if (!owned.has(obj)) owned.set(obj, new Map());
      for (const st of stmts) if (!owned.get(obj).has(st)) owned.get(obj).set(st, f);
    }
  }

  const problems = [];
  for (const mirror of MIRRORS) {
    const mod = moduleOf.get(mirror);
    if (!mod) { problems.push(`${mirror} belongs to no module`); continue; }

    const inModule = files.filter((f) => moduleOf.get(f) === mod);
    if (inModule.at(-1) !== mirror) {
      problems.push(
        `${mirror} must be the LAST file in module "${mod}" — it is followed by ` +
        `${inModule.slice(inModule.indexOf(mirror) + 1).join(', ')}, which would overwrite it.`);
    }

    for (const [obj, stmts] of defsIn(readFileSync(`${DIR}/${mirror}`, 'utf8'))) {
      const candidates = owned.get(obj);
      if (!candidates) {
        problems.push(`${mirror} mirrors ${obj}, which no other migration defines — it is not a mirror, it is the owner.`);
        continue;
      }
      for (const st of stmts) {
        if (candidates.has(st)) continue;
        problems.push(
          `${obj} in ${mirror} matches NO definition in any migration — it has drifted from the one it copies.\n` +
          `      the mirror says:\n        ${st}\n` +
          `      defined in: ${[...new Set(candidates.values())].join(', ')}\n` +
          `      (WHICH definition is the right one is what \`npm run check:replay\` proves; this only\n` +
          `       proves the copy is still a copy.)`);
      }
    }
  }

  if (problems.length) {
    console.log('\nA mirror migration is no longer a faithful copy:\n');
    problems.forEach((p) => console.log(`  ✗ ${p}\n`));
    console.log(`${problems.length} problem(s) in mirror migrations.\n`);
    process.exit(1);
  }
}

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
