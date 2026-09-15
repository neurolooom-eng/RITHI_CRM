# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-09-15T03:40:23.759Z
- **Took** 60s
- **Commit** `9ed20c0` on `claude/field-service-module-poc-hslouq`
- **Version** 0.9.261

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 71 | 77 |
| Automated checks | 11 | 13 |
| Labelled `expect ERROR` outcomes matched | 162 | 162 |

**How a suite is judged.** Each suite runs on its OWN copy of a database
built from every migration, because run against one shared database they
collide on their own fixtures and that reads as a failure it is not. Its
output is then matched: every `expect ERROR` label consumes the next error.
**Both directions fail** — an error nobody expected, and an expectation whose
error never arrived. The second is the one that matters most: a guard that
stopped working produces a suite that runs clean.

## Setup

| | Result | |
| --- | --- | --- |
| `219 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (338 checked, 37 known and listed) |
| `check:columns` | ❌ **FAIL** | > esbuild scripts/check-upload-columns.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/check-upload-columns.mjs --log-level=error && node node_modules/.cache/check-upload-columns.mjs |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (45 checked) |
| `check:mapping` | ✅ pass | all passed |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (22) replays with no change to the schema |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 184 functions |
| `check:status` | ❌ **FAIL** |   ✗ performance: JIT is OFF |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ❌ 6 suite(s) did not come out clean

**audit_mode_test.sql**

- unexpected error — `psql:supabase/tests/audit_mode_test.sql:98: ERROR:  permission denied for table audit_mode_changes`

**ffr_import_test.sql**

- unexpected error — `psql:supabase/tests/ffr_import_test.sql:80: ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification`

**indoor_service_test.sql**

- **expected an error that did not happen** — expect ERROR: cannot be dispatched before its quality check is recorded
- **expected an error that did not happen** — expect ERROR: the unit has not been decontaminated. The ONE hard gate in
- **expected an error that did not happen** — expect ERROR: this file: everything else here is a record, this is a
- **expected an error that did not happen** — expect ERROR: person putting their hands inside a device from a hospital.
- **expected an error that did not happen** — expect ERROR: indoor.condemn is required. The coordinator holds every
- **expected an error that did not happen** — expect ERROR: other right in this module and still cannot scrap a machine:
- **expected an error that did not happen** — expect ERROR: 0158 grants condemn to admin alone, deliberately.
- **expected an error that did not happen** — expect ERROR: indoor_jobs_other_needs_note

**ownership_transfer_same_party_test.sql**

- unexpected error — `psql:supabase/tests/ownership_transfer_same_party_test.sql:57: ERROR:  duplicate key value violates unique constraint "ownership_transfer_key_uniq"`

**spare_bulk_decisions_test.sql**

- unexpected error — `psql:supabase/tests/spare_bulk_decisions_test.sql:115: ERROR:  RBAC: your role cannot drop a spare`

**spare_insights_test.sql**

- **expected an error that did not happen** — expect ERROR: parts_category_check. Spare, Consumable, Product, Labour or

### ✅ 71 suite(s) clean

`additional_entry_machine_key` · `admin_reset_password` · `app_user_names` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel` · `call_creator` · `call_edit_sections` · `call_registrant` · `call_reopen` · `call_requests` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_report` · `cover_expiry` · `daily_call_review` · `documents` · `engineer_address` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `ffr_call_context` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_view_right` · `frequent_failure` · `handstock_opening` · `handstock` · `kpi_field_inst` · `master_list_permissions` · `material_returns` · `objective_ffr_count` · `objective_periods` · `objective_recalc` · `product_serial_key` · `quality_objectives` · `reliability_wrr` · `rename_part` · `retention` · `role_table_views` · `sales_contracts` · `spare_approval_forms` · `spare_bulk_approval` · `spare_dispatch` · `spare_import_exemption` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `spare_workflow` · `stock_transfer` · `technical_support` · `tracker` · `ucn_daily_reset` · `unused_spare_report` · `user_directory_role` · `user_signatures` · `visible_engineers` · `visit_date` · `zoho_migration_role` · `zoho_readonly`

