# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-09-23T15:18:38.456Z
- **Took** 80s
- **Commit** `630337b` on `claude/tender-rubin-8ian45`
- **Version** 0.9.357

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 101 | 101 |
| Automated checks | 22 | 22 |
| Labelled `expect ERROR` outcomes matched | 178 | 178 |

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
| `257 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (385 checked, 37 known and listed) |
| `check:columns` | ✅ pass | every column of 33 live registers exists |
| `check:cover-party` | ✅ pass | all passed |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (81 checked) |
| `check:kyc` | ✅ pass | all passed |
| `check:machine` | ✅ pass | all passed |
| `check:mapping` | ✅ pass | all passed |
| `check:nar003` | ✅ pass | all passed |
| `check:orders` | ✅ pass |   ✓ 121 order columns across 58 relations |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:picklist:open` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (25) replays with no change to the schema |
| `check:reports` | ✅ pass | all passed |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 219 functions |
| `check:scheduled-export` | ✅ pass | all passed |
| `check:status` | ✅ pass | every one of the 189 _status.sql rows reads yes on a fully-applied database (1 skipped) |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ✅ 101 suite(s) clean

`additional_entry_machine_key` · `admin_reset_password` · `analysis_roles` · `app_user_names` · `audit_mode` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel` · `call_cancelled_state` · `call_creator` · `call_edit_sections` · `call_registrant` · `call_reopen` · `call_request_edit` · `call_requests` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_needs_visit` · `consumption_report` · `consumption_visit_dates` · `cover_code` · `cover_expiry` · `daily_call_review` · `data_export` · `dispatched_by_stamped` · `documents` · `engineer_address` · `export_schedule` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `feedback_without_report` · `ffr_call_context` · `ffr_import` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_view_right` · `frequent_failure_rule2` · `frequent_failure` · `handstock_needs_nsm` · `handstock_opening` · `handstock` · `how_rithi_functions_key` · `indoor_service` · `kpi_field_inst` · `master_list_permissions` · `material_returns` · `objective_ffr_count` · `objective_periods` · `objective_recalc` · `ownership_transfer_same_party` · `party_kyc` · `party_service_engineer` · `product_database_2_materialised` · `product_database_v2` · `product_serial_key` · `quality_objectives` · `reliability_wrr` · `rename_part` · `retention` · `review_actual_product` · `role_table_views` · `sales_contracts` · `saved_charts` · `solved_without_report` · `spare_approval_forms` · `spare_bulk_approval` · `spare_bulk_decisions` · `spare_dispatch` · `spare_import_exemption` · `spare_insights` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `spare_workflow` · `stock_transfer` · `stores_spare_view_all` · `technical_support` · `tracker` · `ucn_daily_reset` · `unused_spare_report` · `user_directory_role` · `user_master_sync` · `user_signatures` · `view_all_except_three` · `visible_engineers_blank` · `visible_engineers` · `visit_date` · `zoho_migration_role` · `zoho_readonly`

