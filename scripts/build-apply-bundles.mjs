#!/usr/bin/env node
// ===========================================================================
// Build one self-sufficient "apply" bundle per MODULE from the migrations.
// ---------------------------------------------------------------------------
// A module's migrations are spread across the numbered files and interleaved
// with other modules', so applying a module to a project that is behind means
// hunting for its pieces — and finding them one error at a time. Each bundle
// carries every migration for its module, in order, with a preflight that
// names any missing prerequisite up front instead of failing mid-script.
//
// Bundles are GENERATED — edit the migrations, then re-run this. One file per
// module, regenerated in place, so nothing is duplicated or overwritten by a
// neighbouring module.
//
//   node scripts/build-apply-bundles.mjs           # all modules
//   node scripts/build-apply-bundles.mjs spare_requests
//
// Apply one by pasting it into the Supabase SQL Editor and running it. Every
// bundle is idempotent: running it twice is a no-op.
// ===========================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dir, '..', 'supabase', 'migrations');
const OUT = join(__dir, '..', 'supabase', 'apply');

// A prerequisite the bundle needs but does not itself install, as
// [SQL existence test, what it is, which migration provides it].
const NEEDS = {
  profiles: [`to_regclass('public.profiles')`, 'the profiles table', '0001_init.sql'],
  visibleEngineers: [`to_regprocedure('public.visible_engineer_names()')`, 'visible_engineer_names()', '0004_user_directory.sql (apply bundle: user_directory)'],
  spareTables: [`to_regclass('public.spare_requests')`, 'the spare_requests table', '0001_init.sql'],
  rbac: [`to_regprocedure('public.has_perm(text)')`, 'has_perm()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  isAdmin: [`to_regprocedure('public.is_admin()')`, 'is_admin()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  approvers: [`to_regprocedure('public.can_approve_spares()')`, 'can_approve_spares()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  callTables: [`to_regclass('public.calls')`, 'the calls table', '0001_init.sql'],
  reportTables: [`to_regclass('public.reports')`, 'the reports table', '0001_init.sql'],
};

const MODULES = {
  user_directory: {
    title: 'User Directory',
    blurb: ['The engineer directory and the reporting-tree helpers that call and',
            'spare visibility are scoped by.'],
    needs: ['profiles'],
    files: ['0004_user_directory.sql'],
  },
  rbac: {
    title: 'Roles & Permissions',
    blurb: ['The role → action matrix, per-user extra access, and its enforcement in',
            'Postgres (policies plus the per-stage approval guard), and the All Masters',
            'module grant.'],
    needs: ['profiles', 'visibleEngineers'],
    files: ['0005_rbac.sql', '0007_user_access.sql', '0008_rbac_enforcement.sql', '0013_all_masters_module.sql'],
  },
  call_requests: {
    title: 'Call Requests & Call State',
    blurb: [
      'The Hotline request desk: a request is one row per call (Product + Serial +',
      'Complaint + Reported Problem), closed out by mapping it to an existing call,',
      'registering a new one, or cancelling it. Plus the call_state / pending_calls',
      'views the Call Status column and the Pending Calls module read, and Call',
      'Number assignment (the request UniqueID, or CLYY##### for a direct call).',
    ],
    needs: ['profiles', 'visibleEngineers', 'callTables', 'reportTables'],
    files: [
      '0003_call_requests.sql',
      '0010_call_request_items.sql',
      '0011_call_request_actions.sql',
      '0012_call_state.sql',
      '0014_call_state_denorm.sql',
      '0015_call_number.sql',
    ],
  },
  masters: {
    title: 'Master Value Lists',
    blurb: ['The master lists registry — each value list (Call Type, Standard Complaint,',
            'Pending Reason, Cancel Reason, Feedback, Spare Approval Reason) as its own',
            'maintained table, seeded from the "200 All Masters" workbook.'],
    needs: ['profiles', 'rbac'],
    files: ['0021_master_lists.sql'],
  },
  reports: {
    title: 'Reports',
    blurb: ['The visit history: the indexes behind its newest-first ordering.'],
    needs: ['profiles'],
    files: ['0010_reports_ordering.sql'],
  },
  stock_transfer: {
    title: 'Stock Transfer',
    blurb: ['Engineer-to-engineer hand-stock transfers, with the stock balance derived',
            'from what each engineer was dispatched and has consumed.'],
    needs: ['spareTables', 'rbac', 'visibleEngineers'],
    files: ['0020_stock_transfer.sql'],
  },
  spare_requests: {
    title: 'Spare Requests',
    blurb: [
      'The spare-request workflow end to end: the approval chain (RM → Commercial',
      '→ NSM → Stores), the engineer receipt that closes it, the OR/RowNo',
      'numbering (OR-YYMM-NNNN, restarting each month), and per-SPARE approvals —',
      'the RM decides each line on its own, so one OR can go forward partly approved.',
    ],
    needs: ['spareTables', 'rbac', 'isAdmin', 'approvers'],
    files: [
      '0006_spare_workflow.sql',
      '0009_spare_receipt.sql',
      '0011_spare_intake.sql',
      '0012_spare_auto_approval.sql',
      '0016_spare_line_approvals.sql',
      '0017_spare_or_number_monthly.sql',
      '0018_spare_or_number_padded.sql',
      '0019_spare_or_number_format.sql',
    ],
  },
};

function preflight(needs) {
  const checks = needs.map((k) => {
    const [test, what, from] = NEEDS[k];
    return `  if ${test} is null then\n    missing := array_append(missing, '${what} — ${from}');\n  end if;`;
  }).join('\n');
  return `-- Stop with a readable list rather than a cryptic error partway through.
do $$
declare missing text[] := '{}';
begin
${checks}
  if array_length(missing, 1) is not null then
    raise exception E'Apply these first, then re-run this bundle:\\n  - %',
      array_to_string(missing, E'\\n  - ');
  end if;
end $$;
`;
}

function build(name) {
  const m = MODULES[name];
  if (!m) throw new Error(`Unknown module "${name}". Known: ${Object.keys(MODULES).join(', ')}`);
  const bar = '='.repeat(75);
  const parts = [
    `-- ${bar}`,
    `-- RITHI CRM — ${m.title}: apply bundle`,
    `--`,
    ...m.blurb.map((l) => `-- ${l}`),
    `--`,
    `-- GENERATED by scripts/build-apply-bundles.mjs — do not edit by hand.`,
    `-- Edit the migrations below and re-run the generator.`,
    `--`,
    `-- Carries, in order:`,
    ...m.files.map((f) => `--   ${f}`),
    `--`,
    `-- Paste into the Supabase SQL Editor and Run. Safe to run more than once.`,
    `-- ${bar}`,
    ``,
    preflight(m.needs),
    ``,
    `begin;`,
    ``,
  ];
  for (const f of m.files) {
    parts.push(`-- ${'-'.repeat(72)}`, `-- ${f}`, `-- ${'-'.repeat(72)}`, ``);
    parts.push(readFileSync(join(MIGRATIONS, f), 'utf8').trimEnd(), ``);
  }
  parts.push(`commit;`, ``);
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${name}.sql`);
  writeFileSync(out, parts.join('\n'));
  return out;
}

// A single ordered file: every module above, in dependency order, for a project
// that is behind on several. Generated from the same lists, so it cannot drift
// from the per-module bundles.
MODULES.all = {
  title: 'Everything, in dependency order',
  blurb: ['For a project that is behind on more than one module. Runs the user',
          'directory, then call requests (RBAC tightens their policies next),',
          'then RBAC, then the whole spare-request workflow.',
          '',
          'Prefer a per-module bundle when you only need that one module.'],
  needs: ['profiles'],
  files: [
    ...MODULES.user_directory.files,
    ...MODULES.call_requests.files,
    ...MODULES.rbac.files,
    ...MODULES.reports.files,
    ...MODULES.spare_requests.files,
    ...MODULES.stock_transfer.files,
  ],
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(MODULES);
for (const n of names) console.log(`wrote ${build(n).replace(/.*\/RITHI_CRM\//, '')}`);
