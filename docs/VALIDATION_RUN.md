# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-10-03T19:40:54.256Z
- **Took** 126s
- **Commit** `7ac6854` on `claude/usage-k7slq0`
- **Version** 0.10.65

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 139 | 139 |
| Automated checks | 22 | 22 |
| Labelled `expect ERROR` outcomes matched | 354 | 354 |

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
| `353 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (505 checked, 37 known and listed) |
| `check:columns` | ✅ pass | every column of all 35 registers exists |
| `check:cover-party` | ✅ pass | all passed |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (110 checked) |
| `check:kyc` | ✅ pass | all passed |
| `check:machine` | ✅ pass | all passed |
| `check:mapping` | ✅ pass | all passed |
| `check:nar003` | ✅ pass | all passed |
| `check:orders` | ✅ pass |   ✓ 182 order columns across 64 relations |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:picklist:open` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (30) replays with no change to the schema |
| `check:reports` | ✅ pass | all passed |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 288 functions |
| `check:scheduled-export` | ✅ pass | all passed |
| `check:status` | ✅ pass | every one of the 280 _status.sql rows reads yes on a fully-applied database (1 skipped) |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ✅ 139 suite(s) clean

`additional_entry_machine_key` · `admin_keys_grantable` · `admin_reset_password` · `analysis_roles` · `app_user_names` · `audit_mode` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel_batch` · `call_cancel` · `call_cancelled_state` · `call_creator` · `call_edit_sections` · `call_refresh_from_masters` · `call_registrant` · `call_reopen` · `call_request_edit` · `call_requests` · `calls_view_honest_update` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_needs_visit` · `consumption_report` · `consumption_visit_dates` · `convert_skips_transferred` · `cover_code` · `cover_expiry` · `daily_call_review` · `data_export` · `dccr_auto_review_switch` · `device_cache_status` · `directory_rename_carries_records` · `directory_rename_carries_team` · `dispatched_by_stamped` · `document_drive_details` · `documents` · `engineer_address` · `export_schedule` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `feedback_without_report` · `ffr_call_context` · `ffr_import` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_view_right` · `frequent_failure_rule2` · `frequent_failure` · `handstock_adjustments` · `handstock_needs_nsm` · `handstock_opening` · `handstock` · `high_batch_1` · `high_batch_2` · `how_rithi_functions_key` · `indoor_dc` · `indoor_dc_user_master` · `indoor_delete_job` · `indoor_register_pdt` · `indoor_service` · `indoor_stages` · `install_call_mapping_once` · `kpi_field_inst` · `link_install_call` · `lockdown` · `master_add_edit_delete` · `master_list_permissions` · `material_returns` · `objective_ffr_count` · `objective_periods` · `objective_recalc` · `ownership_transfer_same_party` · `part_hsn_code` · `party_kyc` · `party_service_engineer` · `people_training` · `permissions_by_screen` · `product_accessories` · `product_database_2_materialised` · `product_database_v2` · `product_serial_key` · `quality_objectives` · `reconciliation_needs_no_visit` · `registers_fill_product_database` · `reliability_wrr` · `rename_part` · `retention` · `review_actual_product` · `role_table_views` · `sales_contracts` · `saved_charts` · `service_note_upload_key` · `sold_through_dealer` · `solved_without_report` · `spare_approval_forms` · `spare_approval_whole_word` · `spare_bulk_approval` · `spare_bulk_decisions` · `spare_dispatch` · `spare_fixes_0311` · `spare_import_exemption` · `spare_insights_ist_window` · `spare_insights` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_request_follows_call` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `spare_workflow` · `stock_transfer` · `stores_spare_view_all` · `sys_columns` · `technical_support` · `tracker` · `transferred_machine_address` · `ucn_daily_reset` · `unresolved_login` · `unused_spare_report` · `user_directory_role` · `user_master_sync` · `user_signatures` · `view_all_except_three` · `visible_engineers_blank` · `visible_engineers` · `visit_date` · `warranty_party_refresh_once` · `zoho_migration_role` · `zoho_readonly`

