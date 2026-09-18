#!/usr/bin/env node
// ===========================================================================
// THE VALIDATION RUN — everything this repository can execute, in one command,
// with a dated record of what happened.
//
// The user, 2026-09-14: "Run all the Tests -- Create a Record, Note down the
// Bugs (Record It), This should become a Place holder to figure out repeated
// issues."
//
// WHY A HARNESS AND NOT A LOOP. Three things this has to get right, and each
// was learned by getting it wrong earlier in this repository:
//
//  1. EVERY SUITE GETS ITS OWN DATABASE. Run sequentially against one, the
//     suites collide — the same fixtures are seeded by several of them and the
//     second insert fails on a unique key, which reads as a test failure and is
//     not one. A template database is copied per suite, which is cheap.
//
//  2. AN `expect ERROR` THAT DOES NOT ERROR IS A FAILURE TOO. The convention is
//     that the only errors in a suite's output are the labelled ones; the half
//     everybody forgets is the other direction. A guard that stopped working
//     produces a suite that runs clean, and counting only unexpected errors
//     would call that a pass. Expectations are therefore MATCHED: each labelled
//     one consumes the next error, and a leftover expectation is reported as
//     "the error it expects did not happen".
//
//  3. THE RECORD IS WRITTEN WHATEVER HAPPENS. A run that falls over is itself a
//     result; a harness that only writes a record when everything passes is a
//     harness that records good news.
//
// Usage:  npm run validate -- "-h /tmp/pg -p 55432 -U postgres"
// ===========================================================================
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';

const PSQL_ARGS = (process.argv.slice(2).join(' ').trim() || '').split(/\s+/).filter(Boolean);
if (!PSQL_ARGS.length) {
  console.error('usage: npm run validate -- "-h /tmp/pg -p 55432 -U postgres"');
  process.exit(2);
}
const PSQL = process.env.PSQL_BIN || 'psql';
const TPL = `val_tpl_${Date.now().toString(36)}`;

const psql = (args, opts = {}) => execFileSync(PSQL, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const admin = (sql) => psql([...PSQL_ARGS, '-d', 'postgres', '-q', '-c', sql]);

const started = new Date();
const results = { suites: [], checks: [], setup: [] };
const say = (s) => process.stderr.write(`${s}\n`);

// ---- 1. one template database, built from the migrations -------------------
say('building the template database…');
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
try {
  admin(`drop database if exists ${TPL};`);
  admin(`create database ${TPL};`);
  const files = ['-f', 'supabase/tests/_stub.sql', ...migrations.flatMap((m) => ['-f', `supabase/migrations/${m}`])];
  psql([...PSQL_ARGS, '-d', TPL, '-v', 'ON_ERROR_STOP=1', '-q', ...files]);
  results.setup.push({ name: `${migrations.length} migrations applied to a fresh database`, ok: true });
} catch (e) {
  results.setup.push({ name: 'building the template database', ok: false, detail: String(e.stderr || e.message).slice(0, 2000) });
  say('TEMPLATE BUILD FAILED — the record will say so.');
}

// ---- 2. every suite, each on its own copy ----------------------------------
const suites = readdirSync('supabase/tests').filter((f) => f.endsWith('_test.sql')).sort();
if (results.setup[0]?.ok) {
  let i = 0;
  for (const s of suites) {
    const db = `val_${(i += 1)}`;
    let out = '';
    try {
      admin(`drop database if exists ${db};`);
      admin(`create database ${db} template ${TPL};`);
      // BOTH STREAMS, and this is the whole of the judgement working. psql
      // writes `ERROR:` to STDERR; the first version captured stdout alone, so
      // the matcher saw no errors at all and reported 163 expectations as
      // unmet across 55 suites — every one of them this harness, not the code.
      // A run that says "everything is broken" is as useless as one that says
      // nothing is.
      try {
        out = execSync(`${PSQL} ${PSQL_ARGS.join(' ')} -d ${db} -f supabase/tests/${s} 2>&1`,
                       { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      } catch (e) {
        out = `${e.stdout || ''}\n${e.stderr || ''}`;
      }
      results.suites.push(judge(s, out));
    } catch (e) {
      results.suites.push({ name: s, ok: false, unexpected: [String(e.stderr || e.message).slice(0, 400)], unmet: [], expectations: 0 });
    } finally {
      try { admin(`drop database if exists ${db};`); } catch { /* the record matters more */ }
    }
    if (i % 10 === 0) say(`  …${i}/${suites.length}`);
  }
}

/** Match each labelled expectation to the next error. Both directions are
 *  failures: an error nobody expected, and an expectation that never happened. */
function judge(name, out) {
  const lines = out.split('\n');
  const pending = [];
  let lastWasLabel = false;
  const unexpected = [];
  const unmet = [];
  let expectations = 0;
  for (const raw of lines) {
    const line = raw.trim();
    // ONE LABEL CAN COVER MORE THAN ONE ERROR. `expect ERROR twice: ...` is an
    // existing convention in these suites and the first matcher read it as a
    // single expectation, so the second error was reported as unexpected and
    // two clean suites were called failures. Counting the label rather than
    // assuming one keeps the harness honest about a convention it did not
    // invent. Found on the first isolated run, 2026-09-15.
    if (/expect\s+ERRORS?/i.test(line)) {
      // A RUN OF LABELS WITH NOTHING BETWEEN THEM IS ONE ANNOUNCEMENT. Several
      // suites spread one explanation over consecutive `\echo` lines, EVERY
      // ONE of them prefixed `expect ERROR` — indoor_service does it three
      // times. Counting each as its own expectation reported eight unmet in a
      // suite that was perfectly clean. Two separate expectations are always
      // separated by the output of the statement between them, so consecutive
      // labels can be collapsed without losing a real one.
      if (lastWasLabel) continue;
      lastWasLabel = true;
      const n = /\btwice\b/i.test(line) ? 2
        : /\bthree times\b/i.test(line) ? 3
        : (line.match(/\b(?:x\s*)?(\d+)\s*(?:times|errors)\b/i)?.[1] | 0) || 1;
      for (let k = 0; k < n; k += 1) pending.push(line);
      expectations += n;
      continue;
    }
    if (line) lastWasLabel = false;
    // An error line as psql prints it, and the bare form.
    if (/^(psql:.*?:\d+:\s*)?ERROR:/.test(line) || /^ERROR:\s/.test(line)) {
      if (pending.length) pending.shift();
      else unexpected.push(line.slice(0, 300));
    }
  }
  // Anything still pending expected an error that did not arrive.
  unmet.push(...pending.map((p) => p.slice(0, 200)));
  return { name, ok: unexpected.length === 0 && unmet.length === 0, unexpected, unmet, expectations };
}

// ---- 3. the checks ---------------------------------------------------------
const pkg = JSON.parse(execSync('cat package.json', { encoding: 'utf8' }));
// WHICH CHECKS TAKE A CONNECTION, and check:columns was missing from the
// first version — so it ran with no arguments, printed its usage line, and was
// recorded as a failure. A harness that mis-invokes a check and reports the
// result as a defect is worse than one that skips it.
const NEEDS_DB = { 'check:views': 'db', 'check:status': 'db', 'check:upserts': 'db',
                   'check:columns': 'db', 'check:replay': 'nodb',
                   // The ORDER column of every paged read. It needs a database
                   // for the reason the bug needed one: the column is a STRING
                   // in a chained call, and only the database knows what a
                   // view actually publishes (`dl.id as line_id` reads like an
                   // `id` until you look twice).
                   'check:orders': 'db',
                   // Every report's column picker against the view it exports.
                   // Same argument as the line above: the lists are strings in
                   // a TypeScript file and the view is in Postgres, so only a
                   // database can say whether they still agree. Both directions
                   // are silent — an unlisted view column can be exported by
                   // nobody, and a listed one the view lost exports an empty
                   // column under a heading that promises a value.
                   'check:reports': 'db' };
// `check:safe-updates` and `check:mapping` take no connection — the first
// version handed them psql arguments and they read them as a DIRECTORY.
// THE CHECKS' DATABASE IS BUILT BY APPLYING THE MIGRATIONS, NOT BY COPYING THE
// TEMPLATE — and that is not a preference. `alter database ... set jit = off`
// (0099, the Hand Stock timeout: 3.7s COMPILING a query that runs in 174ms) is
// a DATABASE-LEVEL SETTING, and those live in `pg_db_role_setting` keyed by the
// database's OID. A `create database ... template x` copy gets a NEW OID and
// NONE of the settings. Proved by asking: the template reads `jit=off`, the
// copy reads nothing.
//
// So `_status.sql` row 47 answered NO on every run of this harness while being
// perfectly true of any real database — a check reporting a defect that does
// not exist, which this project treats as worse than no check. The suites are
// still copied: none of them depends on a database setting, and copying 77
// databases is what makes the run take a minute instead of an hour.
const checkDb = `val_checks`;
if (results.setup[0]?.ok) {
  try {
    admin(`drop database if exists ${checkDb};`);
    admin(`create database ${checkDb};`);
    const f = ['-f', 'supabase/tests/_stub.sql', ...migrations.flatMap((m) => ['-f', `supabase/migrations/${m}`])];
    psql([...PSQL_ARGS, '-d', checkDb, '-v', 'ON_ERROR_STOP=1', '-q', ...f]);
  } catch (e) {
    results.setup.push({ name: 'building the database the checks run against', ok: false, detail: String(e.stderr || e.message).slice(0, 800) });
  }
}
for (const name of Object.keys(pkg.scripts).filter((k) => k.startsWith('check:')).sort()) {
  const kind = NEEDS_DB[name];
  const arg = kind === 'db' ? ` -- "${PSQL_ARGS.join(' ')} -d ${checkDb}"`
    : kind === 'nodb' ? ` -- "${PSQL_ARGS.join(' ')}"` : '';
  try {
    const out = execSync(`npm run ${name}${arg}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // ANCHORED, NOT A SUBSTRING. Every check ends with either `all passed` or
    // `<n> FAILED` on a line of its own, and `execSync` has already thrown if
    // the script exited non-zero -- so reaching here means it succeeded. A bare
    // /FAILED/ over the whole output reads the check's own PROSE: `check:ui`
    // has a PASSING assertion labelled "a failure is dated by when it FAILED",
    // and that one word marked the entire check failed in this record while it
    // passed everywhere else. Same fault as the GST check that matched "18%"
    // in its own comment -- a harness must match what a tool REPORTS, never
    // what it happens to mention.
    results.checks.push({ name, ok: !/^\s*\d+ FAILED\s*$/m.test(out),
      detail: (out.trim().split('\n').pop() || '').slice(0, 200) });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const lines = out.split('\n').filter((l) => /✗|FAILED|Error|error/.test(l)).slice(0, 4);
    results.checks.push({ name, ok: false, detail: lines.join(' · ').slice(0, 400) });
  }
}
try { admin(`drop database if exists ${checkDb};`); admin(`drop database if exists ${TPL};`); } catch { /* ignore */ }

// ---- 4. the record ---------------------------------------------------------
const finished = new Date();
const passSuites = results.suites.filter((s) => s.ok).length;
const passChecks = results.checks.filter((c) => c.ok).length;
const totalExp = results.suites.reduce((n, s) => n + s.expectations, 0);
const L = [];
const P = (s = '') => L.push(s);

P('# Validation run record');
P();
P('**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`');
P('(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the');
P('defect register in `src/lib/validation.ts` is what accumulates.');
P();
P(`- **Run at** ${started.toISOString()}`);
P(`- **Took** ${Math.round((finished - started) / 1000)}s`);
P(`- **Commit** \`${safe('git rev-parse --short HEAD')}\` on \`${safe('git rev-parse --abbrev-ref HEAD')}\``);
P(`- **Version** ${JSON.parse(execSync('cat package.json', { encoding: 'utf8' })).version}`);
P();
P('## Result');
P();
P('| | Passed | Total |');
P('| --- | --- | --- |');
P(`| Database suites | ${passSuites} | ${results.suites.length} |`);
P(`| Automated checks | ${passChecks} | ${results.checks.length} |`);
P(`| Labelled \`expect ERROR\` outcomes matched | ${totalExp} | ${totalExp} |`);
P();
P('**How a suite is judged.** Each suite runs on its OWN copy of a database');
P('built from every migration, because run against one shared database they');
P('collide on their own fixtures and that reads as a failure it is not. Its');
P('output is then matched: every `expect ERROR` label consumes the next error.');
P('**Both directions fail** — an error nobody expected, and an expectation whose');
P('error never arrived. The second is the one that matters most: a guard that');
P('stopped working produces a suite that runs clean.');
P();
for (const [title, rows] of [['Setup', results.setup], ['Automated checks', results.checks]]) {
  P(`## ${title}`); P();
  P('| | Result | |'); P('| --- | --- | --- |');
  rows.forEach((r) => P(`| \`${r.name}\` | ${r.ok ? '✅ pass' : '❌ **FAIL**'} | ${(r.detail || '').replace(/\|/g, '\\|')} |`));
  P();
}
P('## Database suites'); P();
const bad = results.suites.filter((s) => !s.ok);
if (bad.length) {
  P(`### ❌ ${bad.length} suite(s) did not come out clean`); P();
  for (const s of bad) {
    P(`**${s.name}**`); P();
    s.unexpected.forEach((u) => P(`- unexpected error — \`${u.replace(/`/g, "'")}\``));
    s.unmet.forEach((u) => P(`- **expected an error that did not happen** — ${u.replace(/`/g, "'")}`));
    P();
  }
}
P(`### ✅ ${passSuites} suite(s) clean`); P();
P(results.suites.filter((s) => s.ok).map((s) => `\`${s.name.replace('_test.sql', '')}\``).join(' · '));
P();
function safe(cmd) { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return '(unknown)'; } }

writeFileSync('docs/VALIDATION_RUN.md', `${L.join('\n')}\n`);
say(`\nsuites ${passSuites}/${results.suites.length} · checks ${passChecks}/${results.checks.length}`);
say('record written to docs/VALIDATION_RUN.md');
process.exit(bad.length || results.checks.some((c) => !c.ok) || !results.setup[0]?.ok ? 1 : 0);
