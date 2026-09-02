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
  fieldCalls: [`to_regclass('public.field_calls')`, 'the split call tables (field_calls)',
               '0040_call_tables_split.sql (apply bundle: call_requests)'],
  masterLists: [`to_regclass('public.master_lists')`, 'the master_lists registry',
                '0021_master_lists.sql (apply bundle: masters)'],
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
    blurb: ['The engineer directory (User Master) and the reporting-tree helpers that',
            'call and spare visibility are scoped by, including the delivery address a',
            'parcel is sent to.',
            '',
            'Also `app_user_names` --- id -> display name and nothing else --- so the',
            'tables can show WHO created a row instead of a raw UUID. Readable by any',
            'signed-in user, which discloses no more than the directory itself.'],
    needs: ['profiles'],
    files: ['0004_user_directory.sql', '0029_engineer_address.sql', '0068_app_user_names.sql'],
  },
  rbac: {
    title: 'Roles & Permissions',
    blurb: ['The role → action matrix, per-user extra access, and its enforcement in',
            'Postgres (policies plus the per-stage approval guard), the All Masters',
            'module grant, the rule letting dispatch fix a delivery address, and the',
            'role a User Master row grants when that person first signs in.'],
    needs: ['profiles', 'visibleEngineers', 'callRequestTable'],
    files: ['0005_rbac.sql', '0007_user_access.sql', '0008_rbac_enforcement.sql', '0013_all_masters_module.sql',
            '0030_engineer_address_write.sql', '0033_user_directory_role.sql', '0034_office_roles_see_all.sql',
            '0035_data_view_all.sql', '0037_call_read_scale.sql', '0051_pending_registrations_view_all.sql',
            '0069_nsm_service_manager.sql'],
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
    needs: ['profiles', 'visibleEngineers', 'callTables', 'reportTables', 'rbac'],
    files: [
      '0008_calls_creator_read.sql',
      '0010_call_request_items.sql',
      '0011_call_request_actions.sql',
      '0012_call_state.sql',
      '0014_call_state_denorm.sql',
      '0015_call_number.sql',
      '0024_call_request_extra.sql',
      '0032_call_state_by_entry.sql',
      '0040_call_tables_split.sql',
      '0041_call_split_hardening.sql',
      '0043_installation_create_gate.sql',
      '0050_pm_schedule_fields.sql',
      '0053_call_requests_view_all.sql',
      '0057_call_reopen.sql',
      '0058_close_reopened_call.sql',
    ],
  },
  sla: {
    title: 'SLA Rules',
    blurb: ['Configurable service-level targets (sla_rules): the hours + on/off for',
            'first visit, closure, closure-with-spare and stores dispatch. Read by',
            'everyone; edited by admins / config.manage. Highlights open calls.'],
    needs: ['profiles', 'rbac', 'isAdmin'],
    files: ['0044_sla_rules.sql'],
  },
  knowledge_base: {
    title: 'Knowledge Base',
    blurb: ['Team-written field-solution articles (kb_articles): anyone signed in reads',
            'every article and contributes one; the author or an admin edits or deletes.',
            'Rich text with images and tables is stored as sanitized HTML on the row.'],
    needs: ['profiles', 'isAdmin'],
    files: ['0042_knowledge_base.sql', '0043_help_screenshots.sql'],
  },
  daily_review: {
    title: 'Daily Call Review (DCCR)',
    blurb: ['The three-stage daily review every field call goes through: Review 1 is',
            'the registration\'s own Public Health Threat / Death / Serious Incident',
            'answers, Review 2 is Risk to Patient / Warranty Failure / Frequent',
            'Failure, and Review 3 is Complaint Grouping / Root Cause Key Word /',
            'Spare-Consumable-Correction-Calibration.',
            '',
            'Stages 2 and 3 are stored in `call_reviews`; ANY POTENTIAL EFFECT, ACTION',
            'TAKEN and REVIEW STATUS are derived, so the register cannot drift from',
            'its own formulas. `field_call_review` is what the module reads.',
            '',
            'Also installs the two per-product masters the review reads — DCCR',
            'Complaint Grouping and Root Cause Key Word — with the register\'s values.',
            '',
            'Writing a review needs the `review.edit` action, granted here to admin,',
            'hotline, NSM, RGM, RM and Commercial.',
            '',
            'The register also carries what the reviewer judges the call by, all of it',
            'derived from the report: every visit as "date : what was done", the latest',
            'visit\'s status and software version, the spares consumed, and the age of',
            'the product at failure with the register\'s own banding of it. The visits',
            'and the consumption are matched to a call by CALL NUMBER (or its UCN), the',
            'same association the Field Call view\'s own panels read.'],
    needs: ['profiles', 'rbac', 'fieldCalls', 'masterLists'],
    files: ['0044_daily_call_review.sql', '0046_dccr_master_values.sql', '0047_daily_review_report_context.sql',
            '0048_daily_review_map_by_call_number.sql'],
  },
  notifications: {
    title: 'Notifications',
    blurb: ['Per-user in-app notifications (notifications): a bell that fires when a call',
            'is allotted to an engineer or a spare they requested is dispatched. Read/',
            'marked by the recipient; rows created by SECURITY DEFINER triggers.'],
    needs: ['profiles'],
    files: ['0045_notifications.sql', '0054_notify_uid_ambiguous.sql'],
  },
  validation: {
    title: 'Software Validation',
    blurb: ['Validation execution tracker (validation_results): stores the executed',
            'result of each IQ/OQ/PQ test case in the database. Read by signed-in',
            'users; recorded by admins / config.manage.'],
    needs: ['profiles', 'rbac', 'isAdmin'],
    files: ['0046_validation_results.sql'],
  },
  data_integrity: {
    title: 'Data Integrity (audit trail & retention)',
    blurb: ['Database-enforced audit trail (record_audit) on the quality-record tables',
            'and a record-retention guard blocking application deletion of quality',
            'records. Read by admins / audit.view; written only by triggers.'],
    needs: ['profiles', 'rbac', 'isAdmin'],
    files: ['0048_record_audit.sql', '0049_record_retention_guard.sql'],
  },
  performance: {
    title: 'Search performance (trigram indexes)',
    blurb: ['pg_trgm trigram indexes so substring searches (product, party, call',
            'registers) are index-backed instead of full table scans — the fix for',
            '"canceling statement due to statement timeout" on Search. Runs last so',
            'every table it indexes already exists; skips the calls view / absent columns.'],
    needs: [],
    files: ['0052_search_indexes.sql'],
  },
  audit: {
    title: 'Audit Log',
    blurb: ['The audit trail: who did what, when, whether it worked and how long it',
            'took. Clients insert their own events; the identity is stamped by the',
            'database so it cannot be forged, and only admins can read it.'],
    needs: ['profiles', 'isAdmin'],
    files: ['0009_audit_log.sql', '0033_audit_retention.sql', '0047_audit_retention_compliance.sql'],
  },
  documents: {
    title: 'Document Library (service manuals & QMS)',
    blurb: ['The service-manual shelf and the QMS shelf (`documents`). The FILES live',
            'in Google Drive; this is the catalogue that makes one findable --- above',
            'all which PRODUCT a manual covers, so a call can hand the engineer the',
            'manual for the machine in front of them instead of a folder to hunt',
            'through. Read by everyone signed in; maintained by `docs.manage` for the',
            'manuals and `qms.manage` for the controlled QMS documents, which are two',
            'separate jobs. A superseded document is RETIRED, never deleted.'],
    needs: ['profiles', 'rbac'],
    files: ['0070_documents.sql'],
  },
  masters: {
    title: 'Master Value Lists',
    blurb: ['The master lists registry — each value list (Call Type, Standard Complaint,',
            'Pending Reason, Cancel Reason, Feedback, Spare Approval Reason) as its own',
            'maintained table, seeded from the "200 All Masters" workbook.',
            '',
            'Values can be deactivated (kept on every record that uses them, dropped',
            'from the pickers), and access is granted list by list: master.<list>.edit',
            'to add or change values and master.<list>.delete to remove one, with the',
            'global `masters.edit` still granting both on every list.'],
    needs: ['profiles', 'rbac'],
    files: ['0021_master_lists.sql', '0066_master_values_active.sql', '0067_master_list_permissions.sql'],
  },
  reports: {
    title: 'Reports',
    blurb: ['The visit history: the indexes behind its newest-first ordering, and the',
            'two columns the bulk report -> call mapping needs --- `source_ref` (the',
            'AppSheet reference a Drive link was derived from, kept so a wrong one can',
            'be re-resolved) and `mapped_at` (this visit was recovered in bulk, not',
            'reported live).'],
    needs: ['profiles'],
    files: ['0010_reports_ordering.sql', '0071_report_source_ref.sql'],
  },
  handstock: {
    // Written to the repo root as HandStock_X.sql, alongside Spare_1.sql — it
    // is the file handed round for hand stock.
    out: 'HandStock_X.sql',
    title: 'Hand Stock',
    blurb: [
      'The stock level an engineer is carrying, per spare:',
      '',
      '  Stock Level = Stock Out (Stores) - Consumption',
      '              - Stock Transfer From + Stock Transfer To',
      '              - Returned to Stores (MRN)',
      '',
      'The movement behind every figure (the DC, the call, the other engineer),',
      'each term of the formula as its own column, and `engineer_stock` --- what',
      'Stock Transfer and its stock guard read --- redefined over the same',
      'derivation, so the two screens cannot disagree.',
      '',
      'Includes MRN (Material Return Note) --- the return register itself, its',
      'MRN-YYMM-NNNN numbering, and the guard that stops an engineer returning',
      'more than they are holding.',
      '',
      'Needs the spare workflow through per-spare approvals and the stock-transfer',
      'tables; _status.sql says which of those are missing.',
    ],
    needs: ['spareTables', 'rbac', 'isAdmin', 'approvers', 'spareLineStages', 'transferTables'],
    // MRN lives here rather than in a bundle of its own: it adds a term to the
    // same two views, so a later re-run of this file must carry it or it would
    // redefine them back without returns.
    // 0038 scopes spare_consumption, whose engineer_email column 0023 adds —
    // so it belongs here, not in rbac, which applies before this module.
    files: ['0023_handstock.sql', '0038_spare_consumption_scope.sql', '0039_material_returns.sql',
            '0041_stock_read_scope.sql', '0055_partial_dispatch.sql', '0056_receive_per_shipment.sql',
            '0059_consumption_reconciliation.sql',
            '0060_reconcile_within_handstock.sql',
            '0061_cap_all_consumption.sql',
            '0062_adjust_consumption_qty.sql',
            '0063_void_consumption_line.sql',
            '0064_stock_out_lines_and_refurb.sql',
            '0065_refurb_stock_and_part_master.sql'],
    tail: () => cookbook(),
  },
  sales_contracts: {
    title: 'Sale / Warranty and Contract registers',
    blurb: ['The two parent/child registers behind machine cover: Sale Entry -> Warranty',
            'Sale Details, and Contract Entry -> Contract Details.',
            '',
            'A value common to the deal is stored once on the HEADER; the matching',
            'column on an item is an OVERRIDE that is null unless someone pins it, so',
            'editing a header moves every machine under it. The *_details views serve',
            'the effective (coalesced) rows, machine_cover answers "what is this serial',
            'under today", and sync_product_cover() keeps products --- what the call',
            'form reads --- in step.',
            '',
            'Writing needs the `cover.edit` action; the bundle grants it to admin,',
            'commercial and nsm so an existing project keeps working.'],
    needs: ['profiles', 'rbac', 'isAdmin'],
    files: ['0036_sales_contracts.sql', '0037_cover_import_speed.sql'],
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
      '0025_spare_dropped_stage.sql',
      '0026_spare_approval_data.sql',
      '0027_spare_dispatch.sql',
      '0028_dc_number_is_stock_out.sql',
      '0031_pending_dispatch_live_stage.sql',
      '0032_stores_sees_pending_dispatch.sql',
      '0033_rm_approves_own_team.sql',
      '0040_spare_read_scope.sql',
      '0036_spare_drop.sql',
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
const ALL_ORDER = ['base', 'user_directory', 'rbac', 'audit', 'masters', 'documents', 'call_requests', 'daily_review', 'reports', 'spare_requests', 'stock_transfer', 'handstock', 'sales_contracts', 'sla', 'knowledge_base', 'notifications', 'validation', 'data_integrity', 'performance'];

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
