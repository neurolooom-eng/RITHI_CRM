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
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
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
  spareTables: [`to_regclass('public.spare_requests')`, 'the spare_requests table', '0001_init.sql (apply bundle: base)'],
  callRequestTable: [`to_regclass('public.call_requests')`, 'the call_requests table', '0003_call_requests.sql (apply bundle: base)'],
  rbac: [`to_regprocedure('public.has_perm(text)')`, 'has_perm()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  isAdmin: [`to_regprocedure('public.is_admin()')`, 'is_admin()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  approvers: [`to_regprocedure('public.can_approve_spares()')`, 'can_approve_spares()', '0008_rbac_enforcement.sql (apply bundle: rbac)'],
  callTables: [`to_regclass('public.calls')`, 'the calls table', '0001_init.sql'],
  reportTables: [`to_regclass('public.reports')`, 'the reports table', '0001_init.sql'],
  spareLineStages: [`to_regprocedure('public.spare_line_stage(text,text,text,text,timestamptz,text)')`,
                    'per-spare approvals (spare_request_lines.dispatched_at)',
                    '0016_spare_line_approvals.sql (apply bundle: Spare_X.sql)'],
  transferTables: [`to_regclass('public.stock_transfer_lines')`, 'the stock-transfer tables',
                   '0020_stock_transfer.sql (apply bundle: stock_transfer)'],
};

const MODULES = {
  base: {
    title: 'Base schema',
    blurb: ['Tables, RLS and the UCN generator that every other module builds on:',
            'profiles, parties/products/parts, calls, reports-as-history, and the',
            'call_requests table the RBAC policies reference.'],
    needs: [],
    files: ['0001_init.sql', '0002_reports_history.sql', '0003_call_requests.sql'],
  },
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
    needs: ['profiles', 'visibleEngineers', 'callRequestTable'],
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
      '0008_calls_creator_read.sql',
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
  audit: {
    title: 'Audit Log',
    blurb: ['The audit trail: who did what, when, whether it worked and how long it',
            'took. Clients insert their own events; the identity is stamped by the',
            'database so it cannot be forged, and only admins can read it.'],
    needs: ['profiles', 'isAdmin'],
    files: ['0009_audit_log.sql'],
  },
  reports: {
    title: 'Reports',
    blurb: ['The visit history: the indexes behind its newest-first ordering.'],
    needs: ['profiles'],
    files: ['0010_reports_ordering.sql'],
  },
  handstock: {
    // Written to the repo root as HandStock_X.sql, alongside Spare_X.sql — it
    // is the file handed round for hand stock.
    out: 'HandStock_X.sql',
    title: 'Hand Stock',
    blurb: [
      'The stock level an engineer is carrying, per spare:',
      '',
      '  Stock Level = Stock Out (Stores) - Consumption',
      '              - Stock Transfer From + Stock Transfer To',
      '',
      'The movement behind every figure (the DC, the call, the other engineer),',
      'each term of the formula as its own column, and `engineer_stock` --- what',
      'Stock Transfer and its stock guard read --- redefined over the same',
      'derivation, so the two screens cannot disagree.',
      '',
      'Needs the spare workflow through per-spare approvals and the stock-transfer',
      'tables; _status.sql says which of those are missing.',
    ],
    needs: ['spareTables', 'rbac', 'isAdmin', 'approvers', 'spareLineStages', 'transferTables'],
    files: ['0023_handstock.sql'],
    tail: () => cookbook(),
  },
  stock_transfer: {
    title: 'Stock Transfer',
    blurb: ['Engineer-to-engineer hand-stock transfers, with the stock balance derived',
            'from what each engineer was dispatched and has consumed.'],
    needs: ['spareTables', 'rbac', 'visibleEngineers'],
    files: ['0020_stock_transfer.sql'],
  },
  spare_requests: {
    // Handed round as a NUMBERED consolidated file at the repo root rather
    // than from supabase/apply/. The number is a revision: bump it when
    // handing over a new consolidated SQL, so it never overwrites one that
    // has already been applied somewhere.
    out: 'Spare_1.sql',
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
      '0022_spare_line_uid.sql',
    ],
  },
};

// Read queries for the objects above, kept with them so whoever applies the
// module also has the queries to check it. Commented out: pasting the file
// applies the module and nothing else.
function cookbook() {
  const bar = '='.repeat(75);
  return [
    `-- ${bar}`,
    `-- Reading a stock level back. Uncomment one and run it on its own.`,
    `-- ${bar}`,
    `--`,
    `-- 1. What is the field holding right now?`,
    `-- select engineer, part_code, part, stock_out, consumed,`,
    `--        transferred_in, transferred_out, on_hand`,
    `--   from public.handstock_balance`,
    `--  where on_hand > 0`,
    `--  order by engineer, part_code;`,
    `--`,
    `-- 2. One engineer's stock — what the report form's consumption picker offers`,
    `--    and what Stock Transfer will let them hand over.`,
    `-- select part, on_hand from public.handstock_balance`,
    `--  where engineer_key = lower(btrim('Engineer Name')) and on_hand > 0`,
    `--  order by part_code;`,
    `--`,
    `-- 3. Where a disputed level came from: every movement behind one line.`,
    `-- select moved_at, movement, qty, ref, ref_type, ucn, party_name, remarks`,
    `--   from public.handstock_movements`,
    `--  where engineer_key = lower(btrim('Engineer Name')) and part_code = 'SP-100'`,
    `--  order by moved_at desc;`,
    `--`,
    `-- 4. Short lines — consumed or handed on more than Stores ever issued.`,
    `-- select engineer, part_code, stock_out, consumed, transferred_out, on_hand`,
    `--   from public.handstock_balance where on_hand < 0 order by on_hand;`,
    `--`,
    `-- 5. Transfers, newest first (0020_stock_transfer.sql's tables).`,
    `-- select t.uid, t.transfer_date, t.from_engineer, t.to_engineer,`,
    `--        l.row_no, l.part, l.qty, t.remarks`,
    `--   from public.stock_transfer_lines l`,
    `--   join public.stock_transfers t on t.uid = l.transfer_uid`,
    `--  order by t.transfer_date desc, t.uid, l.row_no;`,
    `--`,
    `-- 6. Spares dispatched to an engineer and never consumed or handed on`,
    `--    (a spare sitting in a car long after the call closed).`,
    `-- select engineer, part_code, part, stock_out, on_hand, last_in`,
    `--   from public.handstock_balance`,
    `--  where on_hand > 0 and last_in < now() - interval '30 days'`,
    `--  order by last_in;`,
    `--`,
    `-- 7. Do the register and the transfer screen agree? (they read one view now)`,
    `-- select b.engineer_key, b.part_code, b.on_hand, e.qty`,
    `--   from public.handstock_balance b`,
    `--   join public.engineer_stock e on e.engineer = b.engineer_key and e.part = b.part`,
    `--  where b.on_hand <> e.qty;   -- expect no rows`,
    ``,
  ].join('\n');
}

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
  if (m.tail) parts.push(m.tail());
  const out = m.out ? join(__dir, '..', m.out) : join(OUT, `${name}.sql`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, parts.join('\n'));
  return out;
}

// A single ordered file: every module above, in dependency order, for a project
// that is behind on several. Generated from the same lists, so it cannot drift
// from the per-module bundles.
// Dependency order: base, then the shared foundations, then the modules.
const ALL_ORDER = ['base', 'user_directory', 'rbac', 'masters', 'call_requests', 'audit', 'reports', 'spare_requests', 'stock_transfer', 'handstock'];

MODULES.all = {
  title: 'Everything, in dependency order',
  blurb: ['Every module below, in dependency order — enough to bring an empty',
          'database, or one behind on several modules, fully up to date.',
          '',
          'Prefer a per-module bundle when you only need that one module.'],
  needs: [],
  files: ALL_ORDER.flatMap((m) => MODULES[m].files),
};

// Every migration must belong to exactly one module, or `all` silently stops
// meaning all — which is how 0002 and 0008_calls_creator_read went unbundled.
{
  const onDisk = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  // Every module, not just the ordered ones — a module missing from ALL_ORDER
  // used to be invisible here as well as absent from all.sql.
  const modules = Object.keys(MODULES).filter((m) => m !== 'all');
  const unordered = modules.filter((m) => !ALL_ORDER.includes(m));
  const inBundles = modules.flatMap((m) => MODULES[m].files);
  const missing = onDisk.filter((f) => !inBundles.includes(f));
  const unknown = inBundles.filter((f) => !onDisk.includes(f));
  const dupes = inBundles.filter((f, i) => inBundles.indexOf(f) !== i);
  const problems = [
    ...unordered.map((m) => `module "${m}" is missing from ALL_ORDER, so all.sql would omit it`),
    ...missing.map((f) => `${f} is in no module`),
    ...unknown.map((f) => `${f} is bundled but not on disk`),
    ...dupes.map((f) => `${f} is in more than one module`),
  ];
  if (problems.length) {
    console.error('Migration coverage problems:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(MODULES);
for (const n of names) console.log(`wrote ${build(n).replace(/.*\/RITHI_CRM\//, '')}`);
