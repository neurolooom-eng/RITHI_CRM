#!/usr/bin/env node
// ===========================================================================
// APPLY THE MIGRATIONS NOBODY HAS RUN YET.
//
// The user, 2026-09-09: "work on the CI / CD pipeline to auto execute the sql
// queries in supabase" -- after a hand-run bundle deadlocked against the live
// app.
//
// WHY THIS RUNS MIGRATIONS AND NOT THE APPLY BUNDLES. The bundles exist to
// REBUILD a module from nothing and are deliberately replayable, so running one
// re-executes ~150 statements to apply the two that are new. That is what
// takes long exclusive locks on tables the app is reading, which is what
// deadlocked. A ledger of what has already run turns "apply the change" into
// exactly the statements that are new.
//
// THE LEDGER IS THE WHOLE DESIGN. `public.schema_migrations` records a filename
// per applied migration. It is written in the SAME transaction as the migration
// it records, so a failure leaves neither -- there is no state where a
// migration ran but was not recorded, which is the failure mode that makes
// these systems untrustworthy.
//
// A FIRST RUN AGAINST AN EXISTING DATABASE MUST BE A BASELINE. This project's
// database already has all 155 migrations in it. Without a ledger the script
// would take "not recorded" to mean "not applied" and run every one of them
// again -- most are idempotent, but "most" is not a basis for touching a
// production database. So: with no ledger and an existing schema, it REFUSES
// and tells you to run --baseline, which records them as applied and executes
// nothing.
//
// LOCK TIMEOUTS, because that is what the deadlock was. Every migration runs
// with a short `lock_timeout`, so a statement that cannot get its lock gives up
// in seconds instead of waiting behind live traffic and deadlocking. Giving up
// is safe here -- the transaction rolls back whole and the ledger is unchanged,
// so a retry is just a re-run.
//
// Usage:
//   node scripts/apply-migrations.mjs --dry-run     what would run, no writes
//   node scripts/apply-migrations.mjs --baseline    record all as applied
//   node scripts/apply-migrations.mjs               apply what is pending
//
// Reads SUPABASE_DB_URL. It is NEVER printed, logged, or passed on a command
// line where `ps` could see it -- psql takes it through the environment.
// ===========================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const LOCK_TIMEOUT = process.env.MIGRATE_LOCK_TIMEOUT || '10s';
const STATEMENT_TIMEOUT = process.env.MIGRATE_STATEMENT_TIMEOUT || '15min';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const baseline = args.has('--baseline');

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set.\n' +
    'In CI it comes from the repository secret of the same name; locally, export it for one command.\n' +
    'It is the Supabase project\'s POSTGRES connection string (Project Settings -> Database ->\n' +
    'Connection string -> URI). Use the POOLER/session URI if direct connections are blocked.');
  process.exit(2);
}

// psql, with the URL handed over in the environment rather than argv.
const psql = (sql, { quiet = true } = {}) => execFileSync(
  'psql',
  [url, '-v', 'ON_ERROR_STOP=1', ...(quiet ? ['-tA'] : []), '-c', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
);

const psqlFile = (file) => execFileSync(
  'psql',
  [url, '-v', 'ON_ERROR_STOP=1', '-f', file],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
);

// Anything psql prints can carry the connection string in an error line, so it
// is scrubbed before it reaches a log.
const scrub = (s) => String(s ?? '').split(url).join('***');

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) { console.error(`No migrations in ${DIR}.`); process.exit(2); }

const LEDGER = `
create table if not exists public.schema_migrations (
  filename    text primary key,
  checksum    text not null default '',
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user
);
-- The ledger is infrastructure, not data: nothing in the app reads it, and no
-- API role should. RLS on with no policy denies everyone but the owner.
alter table public.schema_migrations enable row level security;
comment on table public.schema_migrations is
  'Which migration files have been applied, written in the same transaction as the migration itself. Managed by scripts/apply-migrations.mjs; not read by the app.';
`;

const sum = (f) => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex').slice(0, 16);

try {
  const hadLedger = psql(
    `select to_regclass('public.schema_migrations') is not null;`).trim() === 't';
  if (!hadLedger && !dryRun) psql(LEDGER);

  const applied = new Set(
    hadLedger
      ? psql('select filename from public.schema_migrations;').split('\n').map((s) => s.trim()).filter(Boolean)
      : [],
  );
  const pending = files.filter((f) => !applied.has(f));

  // THE GUARD. No ledger + an existing schema means a database that was built
  // before this script existed; treating every migration as pending would
  // re-run all of them against production.
  if (!hadLedger) {
    const existing = psql(`select to_regclass('public.app_roles') is not null;`).trim() === 't';
    if (existing && !baseline) {
      console.error(
        `This database already has a schema but no migration ledger, so I cannot tell\n` +
        `what has run. Applying all ${files.length} migrations to it would be a guess.\n\n` +
        `Record them as already applied (runs no SQL):\n` +
        `  node scripts/apply-migrations.mjs --baseline\n\n` +
        `Only do that if this database IS up to date with supabase/migrations/.`);
      process.exit(3);
    }
  }

  if (dryRun) {
    console.log(pending.length
      ? `${pending.length} migration(s) would run, in this order:\n  ${pending.join('\n  ')}`
      : 'Nothing pending — the database is up to date.');
    process.exit(0);
  }

  if (baseline) {
    for (const f of files) {
      psql(`insert into public.schema_migrations (filename, checksum, applied_by)
            values ($m$${f}$m$, $m$${sum(f)}$m$, 'baseline')
            on conflict (filename) do nothing;`);
    }
    console.log(`Baseline recorded: ${files.length} migration(s) marked applied. No SQL was executed.`);
    process.exit(0);
  }

  if (!pending.length) { console.log('Nothing pending — the database is up to date.'); process.exit(0); }

  console.log(`${pending.length} migration(s) to apply.`);
  for (const f of pending) {
    process.stdout.write(`  ${f} … `);
    // ONE TRANSACTION PER MIGRATION, with the ledger row inside it. Postgres
    // makes DDL transactional, so a failure leaves the database and the ledger
    // both untouched and the fix is to re-run.
    const wrapped = `${join('/tmp', `mig-${f}`)}`;
    const body = readFileSync(join(DIR, f), 'utf8');
    const sql = [
      'begin;',
      `set local lock_timeout = '${LOCK_TIMEOUT}';`,
      `set local statement_timeout = '${STATEMENT_TIMEOUT}';`,
      body,
      `insert into public.schema_migrations (filename, checksum)
         values ($m$${f}$m$, $m$${sum(f)}$m$)
         on conflict (filename) do update set checksum = excluded.checksum, applied_at = now();`,
      'commit;',
    ].join('\n');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(wrapped, sql);
    try {
      psqlFile(wrapped);
      console.log('applied');
    } catch (e) {
      console.log('FAILED');
      const out = scrub(e.stdout) + scrub(e.stderr);
      console.error(out);
      if (/lock_timeout|deadlock detected|canceling statement/i.test(out)) {
        console.error(
          `\nThat is a LOCK problem, not a bad migration: the statement could not get its\n` +
          `lock within ${LOCK_TIMEOUT} because the live app was reading the same tables.\n` +
          `Nothing was applied and the ledger is unchanged, so re-running is safe.\n` +
          `Re-run it when the app is quieter, or raise MIGRATE_LOCK_TIMEOUT.`);
      }
      process.exit(1);
    }
  }
  console.log('Done.');
} catch (e) {
  console.error(scrub(e.stdout) + scrub(e.stderr) + scrub(e.message));
  process.exit(1);
}
