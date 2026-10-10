# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-10-10T10:14:17.344Z
- **Took** 206s
- **Commit** `552b70c5` on `claude/field-service-module-poc-hslouq`
- **Version** 0.10.157

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 166 | 166 |
| Automated checks | 22 | 22 |
| Labelled `expect ERROR` outcomes matched | 407 | 407 |

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
| `414 migrations applied to a fresh database` | ✅ pass |  |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (599 checked, 37 known and listed) |
| `check:columns` | ✅ pass | every column of all 37 registers exists |
| `check:cover-party` | ✅ pass | all passed |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (133 checked) |
| `check:kyc` | ✅ pass | all passed |
| `check:machine` | ✅ pass | all passed |
| `check:mapping` | ✅ pass | all passed |
| `check:nar003` | ✅ pass | all passed |
| `check:orders` | ✅ pass |   ✓ 195 order columns across 71 relations |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:picklist:open` | ✅ pass | all passed |
| `check:replay` | ✅ pass | every bundle (31) replays with no change to the schema |
| `check:reports` | ✅ pass | all passed |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 347 functions |
| `check:scheduled-export` | ✅ pass | all passed |
| `check:status` | ✅ pass | every one of the 331 _status.sql rows reads yes on a fully-applied database (1 skipped) |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ✅ pass | every upsert target is inferable, and its table accepts the update |
| `check:views` | ✅ pass | every view over an RLS-protected table applies RLS to the reader |

## Database suites

### ✅ 166 suite(s) clean

`additional_entry_machine_key` · `admin_keys_grantable` · `admin_reset_password` · `analysis_roles` · `app_user_names` · `audit_mode` · `auto_review2` · `bulk_review2` · `call_allot_permission` · `call_cancel_batch` · `call_cancel` · `call_cancelled_state` · `call_creator` · `call_edit_sections` · `call_refresh_from_masters` · `call_registrant` · `call_reopen` · `call_request_edit` · `call_request_unmap` · `call_requests` · `calls_view_honest_update` · `clear_notifications` · `close_call` · `complaint_suggestions` · `complaint_text` · `consumption_needs_visit` · `consumption_report` · `consumption_visit_dates` · `convert_skips_transferred` · `cover_code` · `cover_expiry` · `daily_call_review` · `data_export` · `dccr_auto_review_switch` · `dccr_failure_cohort` · `dccr_history_import` · `dccr_updated_by` · `device_cache_status` · `directory_rename_carries_records` · `directory_rename_carries_team` · `dispatched_by_stamped` · `document_drive_details` · `documents` · `engineer_address` · `export_schedule` · `failure_within_months` · `feedback_dates` · `feedback_key_repair` · `feedback_key` · `feedback_upsert_policy` · `feedback_without_report` · `ffr_call_context` · `ffr_import` · `ffr_multi_machine` · `ffr_reviewer_history` · `ffr_reviewer_nsm` · `ffr_update_sheet_import` · `ffr_view_right` · `frequent_failure_rule2` · `frequent_failure` · `handstock_adjustments` · `handstock_balance_all` · `handstock_needs_nsm` · `handstock_opening` · `handstock` · `high_batch_1` · `high_batch_2` · `how_rithi_functions_key` · `indoor_call_status` · `indoor_dc` · `indoor_dc_user_master` · `indoor_delete_job` · `indoor_register_pdt` · `indoor_service` · `indoor_stages` · `install_call_mapping_once` · `install_call_registers_requests` · `install_warranty_start` · `installation_warranty_starts` · `kpi_field_inst` · `link_install_call` · `lockdown` · `master_add_edit_delete` · `master_list_permissions` · `material_returns` · `negative_handstock` · `objective_ffr_count` · `objective_overrides` · `objective_periods` · `objective_recalc` · `ownership_transfer_same_party` · `part_hsn_code` · `party_kyc` · `party_service_engineer` · `pdqc` · `people_training` · `permissions_by_screen` · `pm_due` · `pm_spare_dccr` · `product_accessories` · `product_database_2_materialised` · `product_database_v2` · `product_serial_key` · `quality_objectives` · `reconciliation_needs_no_visit` · `registers_fill_product_database` · `reliability_wrr` · `rename_part` · `retention` · `review_actual_product` · `review_batch_3` · `review_batch_4` · `role_table_views` · `sales_contracts` · `saved_charts` · `service_note_latest` · `service_note_upload_key` · `service_notes_batch_save` · `sold_through_dealer` · `solved_without_report` · `spare_approval_forms` · `spare_approval_whole_word` · `spare_bulk_approval` · `spare_bulk_decisions` · `spare_dispatch` · `spare_engineer_from_history` · `spare_fixes_0311` · `spare_import_exemption` · `spare_insights_ist_window` · `spare_insights` · `spare_issue_history` · `spare_line_approvals` · `spare_line_stub_rls` · `spare_line_uid` · `spare_or_no_key` · `spare_or_number` · `spare_recycling` · `spare_request_files_visit` · `spare_request_follows_call` · `spare_request_reassign` · `spare_rm_scope` · `spare_stock_scope` · `spare_workflow` · `stock_transfer` · `stores_dispatch_report` · `stores_spare_view_all` · `sys_columns` · `technical_support` · `tracker` · `transfer_fresh_warranty` · `transfer_ot_number_invoice` · `transferred_machine_address` · `ucn_daily_reset` · `unresolved_login` · `unused_spare_report` · `user_directory_role` · `user_master_sync` · `user_signatures` · `user_tags` · `view_all_except_three` · `visible_engineers_blank` · `visible_engineers` · `visit_date` · `warranty_party_refresh_once` · `zoho_migration_role` · `zoho_readonly`

