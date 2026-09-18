# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-09-18T10:40:44.567Z
- **Took** 72s
- **Commit** `77a5e83` on `claude/tender-rubin-8ian45`
- **Version** 0.9.301

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 80 | 92 |
| Automated checks | 14 | 15 |
| Labelled `expect ERROR` outcomes matched | 164 | 164 |

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
| `238 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (357 checked, 37 known and listed) |
| `check:columns` | ✅ pass | every column of 33 live registers exists |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (52 checked) |
| `check:mapping` | ✅ pass | all passed |
| `check:orders` | ✅ pass |   ✓ 109 order columns across 53 relations |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (22) replays with no change to the schema |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 200 functions |
| `check:status` | ✅ pass | every one of the 176 _status.sql rows reads yes on a fully-applied database (1 skipped) |
| `check:ui` | ❌ **FAIL** | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ❌ 12 suite(s) did not come out clean

**analysis_roles_test.sql**

- unexpected error — `psql:supabase/tests/analysis_roles_test.sql:182: ERROR:  No visit has been filed on CONS-VP-1 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**consumption_report_test.sql**

- unexpected error — `psql:supabase/tests/consumption_report_test.sql:47: ERROR:  No visit has been filed on CR-2 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**frequent_failure_test.sql**

- unexpected error — `psql:supabase/tests/frequent_failure_test.sql:79: ERROR:  No visit has been filed on FF-NOW yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**handstock_needs_nsm_test.sql**

- unexpected error — `psql:supabase/tests/handstock_needs_nsm_test.sql:242: ERROR:  Spare approvals are recorded per spare — update spare_request_lines, not the request`

**handstock_opening_test.sql**

- unexpected error — `psql:supabase/tests/handstock_opening_test.sql:65: ERROR:  No visit has been filed on HSO-U1 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**handstock_test.sql**

- unexpected error — `psql:supabase/tests/handstock_test.sql:58: ERROR:  No visit has been filed on U-1 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- unexpected error — `psql:supabase/tests/handstock_test.sql:64: ERROR:  No visit has been filed on U-2 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- unexpected error — `psql:supabase/tests/handstock_test.sql:70: ERROR:  No visit has been filed on U-3 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- unexpected error — `psql:supabase/tests/handstock_test.sql:123: ERROR:  No visit has been filed on U-5 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- unexpected error — `psql:supabase/tests/handstock_test.sql:124: ERROR:  No visit has been filed on U-6 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- unexpected error — `psql:supabase/tests/handstock_test.sql:184: ERROR:  No visit has been filed on U-77 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**rename_part_test.sql**

- unexpected error — `psql:supabase/tests/rename_part_test.sql:41: ERROR:  No visit has been filed on 26A02F0001 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- **expected an error that did not happen** — expect ERROR: ...nor the engineer
- **expected an error that did not happen** — expect ERROR: ...nor the UCN
- **expected an error that did not happen** — expect ERROR: the old set_config flag buys nothing
- **expected an error that did not happen** — expect ERROR: permission denied for table part_rename_ticket

**retention_test.sql**

- unexpected error — `psql:supabase/tests/retention_test.sql:37: ERROR:  No visit has been filed on 26A02F0001 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**spare_import_exemption_test.sql**

- unexpected error — `psql:supabase/tests/spare_import_exemption_test.sql:25: ERROR:  No visit has been filed on 26A02F0001 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**spare_insights_test.sql**

- unexpected error — `psql:supabase/tests/spare_insights_test.sql:50: ERROR:  No visit has been filed on SI-1 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`

**spare_workflow_test.sql**

- **expected an error that did not happen** — expect ERROR: AMC needs a real Commercial approval
- **expected an error that did not happen** — expect ERROR: RM cannot write a manual Commercial approval

**stock_transfer_test.sql**

- unexpected error — `psql:supabase/tests/stock_transfer_test.sql:32: ERROR:  RBAC: NSM approval requires the spare.approve_nsm permission`
- unexpected error — `psql:supabase/tests/stock_transfer_test.sql:45: ERROR:  No visit has been filed on U1 yet, so a spare cannot be booked against it. File the visit report first — the spare is recorded on the visit it was used on.`
- **expected an error that did not happen** — expect ERROR:

### ✅ 80 suite(s) clean

`additional_entry_machine_key` · `admin_reset_password` · `app_user_names` · `audit_mode` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel` · `call_creator` · `call_edit_sections` · `call_registrant` · `call_reopen` · `call_requests` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_needs_visit` · `consumption_visit_dates` · `cover_code` · `cover_expiry` · `daily_call_review` · `dispatched_by_stamped` · `documents` · `engineer_address` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `ffr_call_context` · `ffr_import` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_view_right` · `frequent_failure_rule2` · `how_rithi_functions_key` · `indoor_service` · `kpi_field_inst` · `master_list_permissions` · `material_returns` · `objective_ffr_count` · `objective_periods` · `objective_recalc` · `ownership_transfer_same_party` · `party_kyc` · `party_service_engineer` · `product_serial_key` · `quality_objectives` · `reliability_wrr` · `review_actual_product` · `role_table_views` · `sales_contracts` · `saved_charts` · `spare_approval_forms` · `spare_bulk_approval` · `spare_bulk_decisions` · `spare_dispatch` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `stores_spare_view_all` · `technical_support` · `tracker` · `ucn_daily_reset` · `unused_spare_report` · `user_directory_role` · `user_master_sync` · `user_signatures` · `visible_engineers_blank` · `visible_engineers` · `visit_date` · `zoho_migration_role` · `zoho_readonly`

