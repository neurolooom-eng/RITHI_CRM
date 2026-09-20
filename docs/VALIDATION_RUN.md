# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-09-20T06:23:25.681Z
- **Took** 54s
- **Commit** `091a9b2` on `claude/field-service-module-poc-hslouq`
- **Version** 0.9.307

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 94 | 94 |
| Automated checks | 16 | 16 |
| Labelled `expect ERROR` outcomes matched | 165 | 165 |

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
| `242 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (361 checked, 37 known and listed) |
| `check:columns` | ✅ pass | every column of all 33 registers exists |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (55 checked) |
| `check:mapping` | ✅ pass | all passed |
| `check:orders` | ✅ pass |   ✓ 111 order columns across 54 relations |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (23) replays with no change to the schema |
| `check:reports` | ✅ pass | all passed |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 203 functions |
| `check:status` | ✅ pass | every one of the 178 _status.sql rows reads yes on a fully-applied database (1 skipped) |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ✅ 94 suite(s) clean

`additional_entry_machine_key` · `admin_reset_password` · `analysis_roles` · `app_user_names` · `audit_mode` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel` · `call_creator` · `call_edit_sections` · `call_registrant` · `call_reopen` · `call_requests` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_needs_visit` · `consumption_report` · `consumption_visit_dates` · `cover_code` · `cover_expiry` · `daily_call_review` · `dispatched_by_stamped` · `documents` · `engineer_address` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `ffr_call_context` · `ffr_import` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_view_right` · `frequent_failure_rule2` · `frequent_failure` · `handstock_needs_nsm` · `handstock_opening` · `handstock` · `how_rithi_functions_key` · `indoor_service` · `kpi_field_inst` · `master_list_permissions` · `material_returns` · `objective_ffr_count` · `objective_periods` · `objective_recalc` · `ownership_transfer_same_party` · `party_kyc` · `party_service_engineer` · `product_database_v2` · `product_serial_key` · `quality_objectives` · `reliability_wrr` · `rename_part` · `retention` · `review_actual_product` · `role_table_views` · `sales_contracts` · `saved_charts` · `spare_approval_forms` · `spare_bulk_approval` · `spare_bulk_decisions` · `spare_dispatch` · `spare_import_exemption` · `spare_insights` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `spare_workflow` · `stock_transfer` · `stores_spare_view_all` · `technical_support` · `tracker` · `ucn_daily_reset` · `unused_spare_report` · `user_directory_role` · `user_master_sync` · `user_signatures` · `view_all_except_three` · `visible_engineers_blank` · `visible_engineers` · `visit_date` · `zoho_migration_role` · `zoho_readonly`

