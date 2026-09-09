# RITHI CRM — database schema

**GENERATED — do not hand-edit.** Produced by `scripts/schema-doc.mjs` from a
database built out of `supabase/migrations/`. Re-run it after any migration:

```bash
node scripts/schema-doc.mjs "-h /tmp/pg -p 55432 -U postgres -d schema" > docs/DATABASE_SCHEMA.md
```

It is generated rather than written because a schema document that is WRONG is
worse than none — somebody plans around it. Reading 156 migration files to
describe a default is the method that has produced wrong answers in this
project before.

**61 tables · 24 views · 1423 columns · 117 policies · 39 foreign keys.**

## How to read this

**Allowed values** come from three places and they are enforced very differently:

| Source | Shown as | Enforcement |
| --- | --- | --- |
| `CHECK` constraint | the value list | **The database refuses anything else.** |
| Master value list | `master: <key>` | **Maintained, not enforced** — a person keeps the list, and the column will still accept anything written to it directly. |
| Foreign key | `→ table(col)` | It must exist in the other table. |

**Permissions** are the row-level security policies, verbatim. That is the honest
answer to "who can do what": the app's buttons are a suggestion, the policy is the
rule — and a table with RLS on and **no** policy for a command denies everyone.

---

## Contents

- [app_roles](#app-roles)
- [app_settings](#app-settings)
- [app_super_admins](#app-super-admins)
- [audit_log](#audit-log)
- [audit_mode_changes](#audit-mode-changes)
- [call_number_seq](#call-number-seq)
- [call_requests](#call-requests)
- [call_reviews](#call-reviews)
- [call_vigilance_changes](#call-vigilance-changes)
- [complaint_suggestions](#complaint-suggestions)
- [contract_entries](#contract-entries)
- [contract_items](#contract-items)
- [documents](#documents)
- [feedback](#feedback)
- [field_calls](#field-calls)
- [handstock_opening](#handstock-opening)
- [handstock_period](#handstock-period)
- [harness](#harness)
- [help_screenshots](#help-screenshots)
- [installation_calls](#installation-calls)
- [kb_articles](#kb-articles)
- [master_lists](#master-lists)
- [masters](#masters)
- [material_return_counters](#material-return-counters)
- [material_returns](#material-returns)
- [notifications](#notifications)
- [objective_cutoffs](#objective-cutoffs)
- [ownership_transfers](#ownership-transfers)
- [parties](#parties)
- [parts](#parts)
- [party_key_seq](#party-key-seq)
- [password_resets](#password-resets)
- [pending_registrations](#pending-registrations)
- [pm_calls](#pm-calls)
- [product_additional_entries](#product-additional-entries)
- [products](#products)
- [profiles](#profiles)
- [quality_objectives](#quality-objectives)
- [record_audit](#record-audit)
- [reports](#reports)
- [role_table_views](#role-table-views)
- [sale_entries](#sale-entries)
- [sale_items](#sale-items)
- [sla_rules](#sla-rules)
- [spare_consumption](#spare-consumption)
- [spare_consumption_history](#spare-consumption-history)
- [spare_dispatch_counters](#spare-dispatch-counters)
- [spare_dispatch_lines](#spare-dispatch-lines)
- [spare_dispatches](#spare-dispatches)
- [spare_issue_history](#spare-issue-history)
- [spare_or_counters](#spare-or-counters)
- [spare_request_engineer_log](#spare-request-engineer-log)
- [spare_request_lines](#spare-request-lines)
- [spare_requests](#spare-requests)
- [stock_transfer_counters](#stock-transfer-counters)
- [stock_transfer_lines](#stock-transfer-lines)
- [stock_transfers](#stock-transfers)
- [tracker_items](#tracker-items)
- [ucn_counters](#ucn-counters)
- [user_directory](#user-directory)
- [validation_results](#validation-results)

Views are listed [after the tables](#views).

---

## app_roles

**Primary key:** `role` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `role` | text | **no** |  |  |
| 2 | `label` | text | yes | `''::text` |  |
| 3 | `permissions` | jsonb | **no** | `'[]'::jsonb` |  |
| 4 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `ar_write` | `has_perm('rbac.manage'::text)` | `has_perm('rbac.manage'::text)` |
| SELECT | `ar_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## app_settings

**Primary key:** `key` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `key` | text | **no** |  |  |
| 2 | `value` | text | **no** |  |  |
| 3 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `app_settings_write` | `(is_admin() OR has_perm('config.manage'::text))` | `(is_admin() OR has_perm('config.manage'::text))` |
| SELECT | `app_settings_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## app_super_admins

**Primary key:** `email` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `email` | text | **no** |  |  |
| 2 | `created_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `asa_read` | `is_admin()` | — |

---

## audit_log

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `at` | timestamp with time zone | **no** | `now()` |  |
| 3 | `user_id` | uuid | yes |  |  |
| 4 | `email` | text | yes | `''::text` |  |
| 5 | `actor` | text | yes | `''::text` |  |
| 6 | `role` | text | yes | `''::text` |  |
| 7 | `action` | text | **no** |  |  |
| 8 | `target` | text | yes | `''::text` |  |
| 9 | `status` | text | yes | `'ok'::text` |  |
| 10 | `error` | text | yes | `''::text` |  |
| 11 | `duration_ms` | integer | yes |  |  |
| 12 | `meta` | jsonb | **no** | `'{}'::jsonb` |  |

**Triggers:** `audit_biu` → `audit_before_insert()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `audit_insert` | — | `((auth.role() = 'authenticated'::text) OR (action = ANY (ARRAY['login'::text, 'login_failed'::text])))` |
| SELECT | `audit_read` | `is_admin()` | — |

---

## audit_mode_changes

> Every change of Audit Mode: on/off, why, who, when. Written only by set_audit_mode(); never purged, never editable through the API.

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint | **no** | `nextval('audit_mode_changes_id_seq'::regclass)` |  |
| 2 | `at` | timestamp with time zone | **no** | `now()` |  |
| 3 | `turned_on` | boolean | **no** |  |  |
| 4 | `reason` | text | **no** |  |  |
| 5 | `changed_by` | uuid | yes |  | → users(id) |

**References:**

- `changed_by` → **users**(`id`) · on delete no action _(audit_mode_changes_changed_by_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `amc_read` | `(is_admin() OR has_perm('audit.view'::text))` | — |

---

## call_number_seq

**Primary key:** `yy` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `yy` | text | **no** |  |  |
| 2 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## call_requests

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `reqid` | text | yes |  |  |
| 3 | `unique_key` | text | yes |  |  |
| 4 | `submitted_at` | timestamp with time zone | **no** | `now()` |  |
| 5 | `email` | text | yes | `''::text` |  |
| 6 | `engineer` | text | yes | `''::text` |  |
| 7 | `call_type` | text | yes | `''::text` |  |
| 8 | `party_name` | text | yes | `''::text` |  |
| 9 | `state` | text | yes | `''::text` |  |
| 10 | `city` | text | yes | `''::text` |  |
| 11 | `address` | text | yes | `''::text` |  |
| 12 | `customer_contact_details` | text | yes | `''::text` |  |
| 13 | `customer_contact_number` | text | yes | `''::text` |  |
| 14 | `product` | text | yes | `''::text` |  |
| 15 | `serial_no` | text | yes | `''::text` |  |
| 16 | `standard_complaint` | text | yes | `''::text` | master: complaint (Standard Complaint) |
| 17 | `reported_problem` | text | yes | `''::text` |  |
| 18 | `installation_report` | text | yes | `''::text` |  |
| 19 | `kyc` | text | yes | `''::text` |  |
| 20 | `call_attended` | text | yes | `''::text` |  |
| 21 | `attended_date` | date | yes |  |  |
| 22 | `plan_date` | date | yes |  |  |
| 23 | `additional_comments` | text | yes | `''::text` |  |
| 24 | `ucn` | text | yes | `''::text` |  |
| 25 | `status` | text | yes | `'Pending'::text` |  |
| 26 | `created_by` | uuid | yes |  | → users(id) |
| 27 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 28 | `cancel_reason` | text | yes | `''::text` |  |
| 29 | `cancelled_at` | timestamp with time zone | yes |  |  |
| 30 | `actioned_by` | text | yes | `''::text` |  |
| 31 | `actioned_at` | timestamp with time zone | yes |  |  |
| 32 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |

**Unique:** `unique_key` _(call_requests_unique_key_uidx)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(call_requests_created_by_fkey)_

**Triggers:** `call_requests_biu` → `call_requests_biu()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `cr_insert` | — | `has_perm('request.create'::text)` |
| SELECT | `cr_read` | `(can_view_all_calls() OR (created_by = auth.uid()) OR (lower(email) = lower(auth.email())) OR (lower(TRIM(BOTH FROM engineer)) IN ( SELECT lower(TRIM(BOTH FROM v.n)) AS lower    FR…` | — |
| UPDATE | `cr_update` | `(has_perm('calls.create'::text) OR has_perm('pending.register'::text) OR (created_by = auth.uid()))` | `(has_perm('calls.create'::text) OR has_perm('pending.register'::text) OR (created_by = auth.uid()))` |

---

## call_reviews

**Primary key:** `ucn` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `ucn` | text | **no** |  |  |
| 2 | `call_number` | text | **no** | `''::text` |  |
| 3 | `risk_to_patient` | text | **no** | `''::text` |  |
| 4 | `warranty_failure` | text | **no** | `''::text` |  |
| 5 | `frequent_failure` | text | **no** | `''::text` |  |
| 6 | `review2_at` | date | yes |  |  |
| 7 | `review2_by` | text | **no** | `''::text` |  |
| 8 | `complaint_grouping` | text | **no** | `''::text` | master: dccrgrouping (DCCR Complaint Grouping) |
| 9 | `root_cause_keyword` | text | **no** | `''::text` | master: rootcause (Root Cause Key Word) |
| 10 | `spare_category` | text | **no** | `''::text` |  |
| 11 | `service_observation` | text | **no** | `''::text` |  |
| 12 | `action_taken` | text | **no** | `''::text` |  |
| 13 | `review3_at` | date | yes |  |  |
| 14 | `review3_by` | text | **no** | `''::text` |  |
| 15 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 16 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 17 | `updated_by` | uuid | yes |  | → users(id) |
| 18 | `review2_done` | boolean _(generated)_ | yes |  |  |
| 19 | `review3_done` | boolean _(generated)_ | yes |  |  |
| 20 | `any_potential_effect` | text _(generated)_ | yes |  |  |

**References:**

- `updated_by` → **users**(`id`) · on delete no action _(call_reviews_updated_by_fkey)_

**Triggers:** `call_reviews_stamp` → `call_review_stamp()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `call_reviews_write` | `has_perm('review.edit'::text)` | `has_perm('review.edit'::text)` |
| SELECT | `call_reviews_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## call_vigilance_changes

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `ucn` | text | **no** |  |  |
| 3 | `field` | text | **no** |  |  |
| 4 | `was` | text | **no** | `''::text` |  |
| 5 | `now_is` | text | **no** | `''::text` |  |
| 6 | `changed_by` | uuid | yes |  |  |
| 7 | `changed_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `cvc_read` | `(has_perm('calls.view'::text) OR has_perm('review.edit'::text))` | — |

---

## complaint_suggestions

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `asked_at` | timestamp with time zone | **no** | `now()` |  |
| 3 | `asked_by` | uuid | yes |  |  |
| 4 | `asked_by_name` | text | **no** | `''::text` |  |
| 5 | `product` | text | **no** | `''::text` |  |
| 6 | `reported` | text | **no** | `''::text` |  |
| 7 | `suggested` | jsonb | **no** | `'[]'::jsonb` |  |
| 8 | `accepted` | text | **no** | `''::text` |  |
| 9 | `accepted_rank` | integer | yes |  |  |
| 10 | `ucn` | text | **no** | `''::text` |  |

**Triggers:** `complaint_suggestions_bi` → `complaint_suggestions_bi()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `cs_insert` | — | `(auth.role() = 'authenticated'::text)` |
| SELECT | `cs_read` | `(( SELECT is_admin() AS is_admin) OR ( SELECT has_perm('audit.view'::text) AS has_perm))` | — |

---

## contract_entries

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `mc_number` | text | **no** |  |  |
| 3 | `entry_at` | timestamp with time zone | yes |  |  |
| 4 | `party_name` | text | yes | `''::text` |  |
| 5 | `payment_schedule` | text | yes | `''::text` |  |
| 6 | `bill_generate_at` | text | yes | `''::text` |  |
| 7 | `contract_type` | text | yes | `''::text` |  |
| 8 | `contract_start` | date | yes |  |  |
| 9 | `contract_end` | date | yes |  |  |
| 10 | `contract_years` | numeric | yes |  |  |
| 11 | `contract_months` | integer | yes |  |  |
| 12 | `pm_visits_total` | integer | yes |  |  |
| 13 | `status` | text | yes | `''::text` |  |
| 14 | `prev_mc_number` | text | yes | `''::text` |  |
| 15 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 16 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 17 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 18 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |

**Unique:** `mc_number` _(contract_entries_mc_number_key)_ · `mc_number` _(contract_entries_mc_number_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(contract_entries_created_by_fkey)_

**Referenced by:** `contract_items.mc_number`

**Triggers:** `contract_entries_sync_cover` → `cover_header_sync()` · `contract_entries_touch` → `touch_updated_at()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `contract_entries_write` | `has_perm('cover.edit'::text)` | `has_perm('cover.edit'::text)` |
| SELECT | `contract_entries_read` | `(has_perm('masters.view'::text) OR has_perm('cover.edit'::text) OR is_admin())` | — |

---

## contract_items

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `mc_number` | text | **no** |  | → contract_entries(mc_number) |
| 4 | `priority` | integer | yes | `2` |  |
| 5 | `product_code` | text | yes | `''::text` |  |
| 6 | `product_name` | text | yes | `''::text` |  |
| 7 | `serial_number` | text | yes | `''::text` |  |
| 8 | `entry_at` | timestamp with time zone | yes |  |  |
| 9 | `party_name` | text | yes |  |  |
| 10 | `payment_schedule` | text | yes |  |  |
| 11 | `bill_generate_at` | text | yes |  |  |
| 12 | `contract_type` | text | yes |  |  |
| 13 | `contract_start` | date | yes |  |  |
| 14 | `contract_end` | date | yes |  |  |
| 15 | `contract_years` | numeric | yes |  |  |
| 16 | `contract_months` | integer | yes |  |  |
| 17 | `pm_visits_total` | integer | yes |  |  |
| 18 | `status` | text | yes |  |  |
| 19 | `rate` | numeric | yes |  |  |
| 20 | `item_tax_amount` | numeric | yes |  |  |
| 21 | `total_after_tax` | numeric | yes |  |  |
| 22 | `present_item_status` | text | yes | `''::text` |  |
| 23 | `last_contract_number` | text | yes | `''::text` |  |
| 24 | `last_contract_end` | date | yes |  |  |
| 25 | `sa_number` | text | yes | `''::text` |  |
| 26 | `sa_end_date` | date | yes |  |  |
| 27 | `added_by` | text | yes | `''::text` |  |
| 28 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 29 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 30 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 31 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |

**Unique:** `uid` _(contract_items_uid_key)_ · `uid` _(contract_items_uid_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(contract_items_created_by_fkey)_
- `mc_number` → **contract_entries**(`mc_number`) · on delete cascade _(contract_items_mc_number_fkey)_

**Triggers:** `contract_items_defaults` → `contract_items_defaults()` · `contract_items_stub_header` → `contract_items_stub_header()` · `contract_items_sync_cover` → `cover_item_sync()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `contract_items_write` | `has_perm('cover.edit'::text)` | `has_perm('cover.edit'::text)` |
| SELECT | `contract_items_read` | `(has_perm('masters.view'::text) OR has_perm('cover.edit'::text) OR is_admin())` | — |

---

## documents

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `kind` | text | **no** | `'service_manual'::text` |  |
| 3 | `title` | text | **no** |  |  |
| 4 | `product` | text | **no** | `''::text` |  |
| 5 | `doc_no` | text | **no** | `''::text` |  |
| 6 | `revision` | text | **no** | `''::text` |  |
| 7 | `effective_date` | date | yes |  |  |
| 8 | `tags` | text | **no** | `''::text` |  |
| 9 | `url` | text | **no** |  |  |
| 10 | `file_name` | text | **no** | `''::text` |  |
| 11 | `notes` | text | **no** | `''::text` |  |
| 12 | `active` | boolean | **no** | `true` |  |
| 13 | `uploaded_by` | uuid | yes |  | → users(id) |
| 14 | `uploaded_by_name` | text | **no** | `''::text` |  |
| 15 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 16 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `uploaded_by` → **users**(`id`) · on delete no action _(documents_uploaded_by_fkey)_

**Triggers:** `documents_biu` → `documents_before_write()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `documents_delete` | `CASE     WHEN (kind = 'qms'::text) THEN has_perm('qms.manage'::text)     ELSE has_perm('docs.manage'::text) END` | — |
| INSERT | `documents_insert` | — | `CASE     WHEN (kind = 'qms'::text) THEN has_perm('qms.manage'::text)     ELSE has_perm('docs.manage'::text) END` |
| SELECT | `documents_read` | `(auth.role() = 'authenticated'::text)` | — |
| UPDATE | `documents_update` | `CASE     WHEN (kind = 'qms'::text) THEN has_perm('qms.manage'::text)     ELSE has_perm('docs.manage'::text) END` | `CASE     WHEN (kind = 'qms'::text) THEN has_perm('qms.manage'::text)     ELSE has_perm('docs.manage'::text) END` |

---

## feedback

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `ucn` | text | yes | `''::text` |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `call_type` | text | yes | `''::text` |  |
| 5 | `engineer` | text | yes | `''::text` |  |
| 6 | `engineer_email` | text | yes | `''::text` |  |
| 7 | `party_name` | text | yes | `''::text` |  |
| 8 | `state` | text | yes | `''::text` |  |
| 9 | `product_name` | text | yes | `''::text` |  |
| 10 | `serial` | text | yes | `''::text` |  |
| 11 | `complaint` | text | yes | `''::text` |  |
| 12 | `answers` | jsonb | **no** | `'{}'::jsonb` |  |
| 13 | `visit_at` | timestamp with time zone | yes |  |  |
| 14 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 15 | `created_by` | uuid | yes |  | → users(id) |

**References:**

- `created_by` → **users**(`id`) · on delete no action _(feedback_created_by_fkey)_

**Triggers:** `no_hard_delete` → `block_hard_delete()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `fb_write` | — | `(has_perm('calls.report'::text) OR has_perm('feedback.view'::text))` |
| SELECT | `fb_read` | `(has_perm('feedback.view'::text) OR has_perm('calls.report'::text))` | — |

---

## field_calls

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint | **no** | `nextval('call_split_id_seq'::regclass)` |  |
| 2 | `ucn` | text | yes |  |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `reg_date` | date | yes |  |  |
| 5 | `complaint_date` | date | yes |  |  |
| 6 | `party_name` | text | yes | `''::text` |  |
| 7 | `city` | text | yes | `''::text` |  |
| 8 | `state` | text | yes | `''::text` |  |
| 9 | `product_name` | text | yes | `''::text` |  |
| 10 | `serial` | text | yes | `''::text` |  |
| 11 | `item_status` | text | yes | `''::text` |  |
| 12 | `warranty_number` | text | yes | `''::text` |  |
| 13 | `warranty_start` | date | yes |  |  |
| 14 | `warranty_end` | date | yes |  |  |
| 15 | `contract_number` | text | yes | `''::text` |  |
| 16 | `contract_start` | date | yes |  |  |
| 17 | `contract_end` | date | yes |  |  |
| 18 | `contract_type` | text | yes | `''::text` |  |
| 19 | `call_type` | text | yes | `'FIELD'::text` | master: calltype (Call Type) |
| 20 | `standard_complaint` | text | yes | `''::text` | master: complaint (Standard Complaint) |
| 21 | `complaint_reported` | text | yes | `''::text` |  |
| 22 | `allocated_to` | text | yes | `''::text` |  |
| 23 | `allocated_to_email` | text | yes | `''::text` |  |
| 24 | `breakdown_date` | date | yes |  |  |
| 25 | `person_calling` | text | yes | `''::text` |  |
| 26 | `public_health_threat` | text | yes | `''::text` |  |
| 27 | `death` | text | yes | `''::text` |  |
| 28 | `serious_incident` | text | yes | `''::text` |  |
| 29 | `mode_of_reporting` | text | yes | `''::text` |  |
| 30 | `customer_name` | text | yes | `''::text` |  |
| 31 | `customer_number` | text | yes | `''::text` |  |
| 32 | `customer_designation` | text | yes | `''::text` |  |
| 33 | `email_address` | text | yes | `''::text` |  |
| 34 | `status` | text | yes | `'Registered'::text` |  |
| 35 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 36 | `created_by` | uuid | yes |  | → users(id) |
| 37 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 38 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 39 | `last_status` | text | yes | `''::text` |  |
| 40 | `last_visit_at` | timestamp with time zone | yes |  |  |
| 41 | `open_state` | text _(generated)_ | yes |  |  |
| 42 | `added_on` | date | yes |  |  |
| 43 | `reg_at` | timestamp with time zone | yes |  |  |
| 44 | `reopened_at` | timestamp with time zone | yes |  |  |
| 45 | `reopen_count` | integer | **no** | `0` |  |
| 46 | `cancelled_at` | timestamp with time zone | yes |  |  |
| 47 | `cancel_reason` | text | **no** | `''::text` |  |
| 48 | `cancelled_by` | uuid | yes |  |  |
| 49 | `actual_created_by` | uuid | yes |  | → users(id) · The signed-in user who registered the call. Stamped by the database, never accepted from the caller. created_by is the DESK of record (the Hotline engineer); the two disagreeing is the vigilance finding. |

**Unique:** `ucn` _(field_calls_ucn_key)_ · `ucn` _(field_calls_ucn_key)_

**References:**

- `actual_created_by` → **users**(`id`) · on delete no action _(field_calls_actual_created_by_fkey)_
- `created_by` → **users**(`id`) · on delete no action _(field_calls_created_by_fkey)_

**Constraints:**

- `field_calls_type_ck` — `CHECK ((call_table_for(call_type) = 'field'::text))`

**Triggers:** `calls_biu` → `calls_before_insert()` · `no_hard_delete` → `block_hard_delete()` · `notify_alloc` → `notify_call_allotted()` · `zz_calls_allot_guard` → `calls_allot_guard()` · `zz_calls_edit_section_guard` → `calls_edit_section_guard()` · `zz_calls_stamp_creator` → `calls_stamp_creator()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `calls_insert` | — | `has_perm('calls.create'::text)` |
| SELECT | `calls_scoped_read` | `(( SELECT has_perm('calls.view'::text) AS has_perm) AND (( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (actual_created_by = …` | — |
| UPDATE | `calls_update` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` |

---

## handstock_opening

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `engineer` | text | **no** |  |  |
| 3 | `engineer_key` | text _(generated)_ | yes |  |  |
| 4 | `part` | text | **no** |  |  |
| 5 | `part_code` | text _(generated)_ | yes |  |  |
| 6 | `qty` | numeric | **no** |  |  |
| 7 | `as_of` | date | **no** |  |  |
| 8 | `source` | text | **no** |  |  |
| 9 | `source_key` | text _(generated)_ | yes |  |  |
| 10 | `remarks` | text | **no** | `''::text` |  |
| 11 | `recorded_by` | uuid | yes |  | → users(id) |
| 12 | `recorded_by_name` | text | **no** | `''::text` |  |
| 13 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 14 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 15 | `data` | jsonb | **no** | `'{}'::jsonb` |  |

**Unique:** `engineer_key, part_code, source_key` _(handstock_opening_uniq)_

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(handstock_opening_recorded_by_fkey)_

**Triggers:** `handstock_opening_biu` → `handstock_opening_biu()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `hso_write` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` |
| SELECT | `hso_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR ( SELECT has_perm('data.view_all'::text) AS has_perm) OR (lower(btrim(engineer)) IN ( SELECT lower(btrim(v.n)) AS lower    …` | — |

---

## handstock_period

**Primary key:** `singleton` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `singleton` | boolean | **no** | `true` |  |
| 2 | `closed_through` | date | yes |  |  |
| 3 | `closed_at` | timestamp with time zone | yes |  |  |
| 4 | `closed_by` | uuid | yes |  |  |
| 5 | `closed_by_name` | text | **no** | `''::text` |  |

**Constraints:**

- `handstock_period_singleton_check` — `CHECK (singleton)`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `hp_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## harness

**Primary key:** _none_ · **Row-level security:** _off_

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `uid` | uuid | yes |  |  |
| 2 | `email` | text | yes |  |  |
| 3 | `admin` | boolean | yes | `false` |  |

**Permissions**

_No policies, RLS off — reachable by anything with table privileges._

---

## help_screenshots

**Primary key:** `section_id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `section_id` | text | **no** |  |  |
| 2 | `image` | text | **no** |  |  |
| 3 | `caption` | text | **no** | `''::text` |  |
| 4 | `updated_by` | uuid | yes |  | → users(id) |
| 5 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `updated_by` → **users**(`id`) · on delete no action _(help_screenshots_updated_by_fkey)_

**Triggers:** `help_shot_biu` → `help_shot_before_write()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `help_shot_delete` | `is_admin()` | — |
| INSERT | `help_shot_insert` | — | `is_admin()` |
| SELECT | `help_shot_read` | `(auth.role() = 'authenticated'::text)` | — |
| UPDATE | `help_shot_update` | `is_admin()` | `is_admin()` |

---

## installation_calls

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint | **no** | `nextval('call_split_id_seq'::regclass)` |  |
| 2 | `ucn` | text | yes |  |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `reg_date` | date | yes |  |  |
| 5 | `complaint_date` | date | yes |  |  |
| 6 | `party_name` | text | yes | `''::text` |  |
| 7 | `city` | text | yes | `''::text` |  |
| 8 | `state` | text | yes | `''::text` |  |
| 9 | `product_name` | text | yes | `''::text` |  |
| 10 | `serial` | text | yes | `''::text` |  |
| 11 | `item_status` | text | yes | `''::text` |  |
| 12 | `warranty_number` | text | yes | `''::text` |  |
| 13 | `warranty_start` | date | yes |  |  |
| 14 | `warranty_end` | date | yes |  |  |
| 15 | `contract_number` | text | yes | `''::text` |  |
| 16 | `contract_start` | date | yes |  |  |
| 17 | `contract_end` | date | yes |  |  |
| 18 | `contract_type` | text | yes | `''::text` |  |
| 19 | `call_type` | text | yes | `'FIELD'::text` |  |
| 20 | `standard_complaint` | text | yes | `''::text` | master: complaint (Standard Complaint) |
| 21 | `complaint_reported` | text | yes | `''::text` |  |
| 22 | `allocated_to` | text | yes | `''::text` |  |
| 23 | `allocated_to_email` | text | yes | `''::text` |  |
| 24 | `breakdown_date` | date | yes |  |  |
| 25 | `person_calling` | text | yes | `''::text` |  |
| 26 | `public_health_threat` | text | yes | `''::text` |  |
| 27 | `death` | text | yes | `''::text` |  |
| 28 | `serious_incident` | text | yes | `''::text` |  |
| 29 | `mode_of_reporting` | text | yes | `''::text` |  |
| 30 | `customer_name` | text | yes | `''::text` |  |
| 31 | `customer_number` | text | yes | `''::text` |  |
| 32 | `customer_designation` | text | yes | `''::text` |  |
| 33 | `email_address` | text | yes | `''::text` |  |
| 34 | `status` | text | yes | `'Registered'::text` |  |
| 35 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 36 | `created_by` | uuid | yes |  | → users(id) |
| 37 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 38 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 39 | `last_status` | text | yes | `''::text` |  |
| 40 | `last_visit_at` | timestamp with time zone | yes |  |  |
| 41 | `open_state` | text _(generated)_ | yes |  |  |
| 42 | `added_on` | date | yes |  |  |
| 43 | `reg_at` | timestamp with time zone | yes |  |  |
| 44 | `reopened_at` | timestamp with time zone | yes |  |  |
| 45 | `reopen_count` | integer | **no** | `0` |  |
| 46 | `cancelled_at` | timestamp with time zone | yes |  |  |
| 47 | `cancel_reason` | text | **no** | `''::text` |  |
| 48 | `cancelled_by` | uuid | yes |  |  |
| 49 | `actual_created_by` | uuid | yes |  | → users(id) |

**Unique:** `ucn` _(installation_calls_ucn_key)_ · `ucn` _(installation_calls_ucn_key)_

**References:**

- `actual_created_by` → **users**(`id`) · on delete no action _(installation_calls_actual_created_by_fkey)_
- `created_by` → **users**(`id`) · on delete no action _(installation_calls_created_by_fkey)_

**Constraints:**

- `installation_calls_type_ck` — `CHECK ((call_table_for(call_type) = 'installation'::text))`

**Triggers:** `calls_biu` → `calls_before_insert()` · `no_hard_delete` → `block_hard_delete()` · `notify_alloc` → `notify_call_allotted()` · `zz_calls_allot_guard` → `calls_allot_guard()` · `zz_calls_edit_section_guard` → `calls_edit_section_guard()` · `zz_calls_stamp_creator` → `calls_stamp_creator()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `calls_insert` | — | `has_perm('install.create'::text)` |
| SELECT | `calls_scoped_read` | `(( SELECT has_perm('calls.view'::text) AS has_perm) AND (( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (actual_created_by = …` | — |
| UPDATE | `calls_update` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` |

---

## kb_articles

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `title` | text | **no** |  |  |
| 3 | `body` | text | **no** |  |  |
| 4 | `category` | text | yes | `''::text` |  |
| 5 | `product` | text | yes | `''::text` |  |
| 6 | `tags` | text | yes | `''::text` |  |
| 7 | `attachments` | jsonb | **no** | `'[]'::jsonb` |  |
| 8 | `author_name` | text | yes | `''::text` |  |
| 9 | `author_email` | text | yes | `''::text` |  |
| 10 | `created_by` | uuid | yes |  | → users(id) |
| 11 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 12 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `created_by` → **users**(`id`) · on delete no action _(kb_articles_created_by_fkey)_

**Triggers:** `kb_biu` → `kb_before_write()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `kb_delete` | `((created_by = auth.uid()) OR is_admin())` | — |
| INSERT | `kb_insert` | — | `(auth.uid() IS NOT NULL)` |
| SELECT | `kb_read` | `(auth.role() = 'authenticated'::text)` | — |
| UPDATE | `kb_update` | `((created_by = auth.uid()) OR is_admin())` | `((created_by = auth.uid()) OR is_admin())` |

---

## master_lists

**Primary key:** `key` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `key` | text | **no** |  |  |
| 2 | `label` | text | **no** |  |  |
| 3 | `value_label` | text | **no** | `'Value'::text` |  |
| 4 | `columns` | jsonb | **no** | `'[]'::jsonb` |  |
| 5 | `sort_order` | integer | **no** | `100` |  |
| 6 | `active` | boolean | **no** | `true` |  |
| 7 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `master_lists_write` | `has_perm('masters.edit'::text)` | `has_perm('masters.edit'::text)` |
| SELECT | `master_lists_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## masters

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `name` | text | **no** |  |  |
| 3 | `value` | text | **no** |  |  |
| 4 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 5 | `added_on` | date | yes |  |  |
| 6 | `added_by` | text | yes | `''::text` |  |
| 7 | `active` | boolean | **no** | `true` |  |
| 8 | `stage_key` | text _(generated)_ | yes |  |  |
| 9 | `product_key` | text _(generated)_ | yes |  |  |

**Unique:** `name, value, stage_key, product_key` _(masters_name_value_keys_uniq)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `masters_delete` | `(has_perm('masters.edit'::text) OR has_perm((('master.'::text \|\| COALESCE(name, ''::text)) \|\| '.delete'::text)))` | — |
| INSERT | `masters_insert` | — | `(has_perm('masters.edit'::text) OR has_perm((('master.'::text \|\| COALESCE(name, ''::text)) \|\| '.edit'::text)))` |
| SELECT | `masters_read` | `(auth.role() = 'authenticated'::text)` | — |
| UPDATE | `masters_update` | `(has_perm('masters.edit'::text) OR has_perm((('master.'::text \|\| COALESCE(name, ''::text)) \|\| '.edit'::text)))` | `(has_perm('masters.edit'::text) OR has_perm((('master.'::text \|\| COALESCE(name, ''::text)) \|\| '.edit'::text)))` |

---

## material_return_counters

**Primary key:** `period` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `period` | text | **no** |  |  |
| 2 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## material_returns

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `row_no` | integer | yes |  |  |
| 4 | `mrn_no` | text | yes | `''::text` |  |
| 5 | `mrn_date` | date | yes |  |  |
| 6 | `engineer` | text | **no** | `''::text` |  |
| 7 | `engineer_email` | text | yes | `''::text` |  |
| 8 | `part` | text | **no** | `''::text` |  |
| 9 | `item_code` | text | yes | `''::text` |  |
| 10 | `item_name` | text | yes | `''::text` |  |
| 11 | `good_qty` | numeric | **no** | `0` |  |
| 12 | `defective_qty` | numeric | **no** | `0` |  |
| 13 | `customer_name` | text | yes | `''::text` |  |
| 14 | `report_no` | text | yes | `''::text` |  |
| 15 | `removed_from_equipment` | text | yes | `''::text` |  |
| 16 | `handstock_note` | text | yes | `''::text` |  |
| 17 | `remarks` | text | yes | `''::text` |  |
| 18 | `source` | text | yes | `'app'::text` |  |
| 19 | `returned_at` | timestamp with time zone | **no** | `now()` |  |
| 20 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 21 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |
| 22 | `extra` | jsonb | **no** | `'{}'::jsonb` | Everything the source export carried that has no field of its own, kept as written. |

**Unique:** `uid, part_code(part), COALESCE(row_no, 0)` _(material_returns_uid_part_idx)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(material_returns_created_by_fkey)_

**Constraints:**

- `material_returns_qty_positive` — `CHECK (((COALESCE(good_qty, (0)::numeric) + COALESCE(defective_qty, (0)::numeric)) > (0)::numeric))`

**Triggers:** `material_returns_assign_row_no` → `material_returns_assign_row_no()` · `material_returns_check_stock` → `material_returns_check_stock()` · `material_returns_immutable` → `material_returns_immutable()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `mr_delete` | `is_admin()` | — |
| INSERT | `mr_insert` | — | `(has_perm('stock.return'::text) AND (is_admin() OR can_approve_spares() OR (lower(COALESCE(engineer_email, ''::text)) = lower(auth.email()))))` |
| SELECT | `mr_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (lower(COALESCE(engineer_email, ''::text)) = lower(( SELECT auth.email() AS e…` | — |

---

## notifications

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `recipient_id` | uuid | yes |  | → users(id) |
| 3 | `recipient_email` | text | yes | `''::text` |  |
| 4 | `kind` | text | yes | `''::text` |  |
| 5 | `title` | text | **no** |  |  |
| 6 | `body` | text | yes | `''::text` |  |
| 7 | `link` | text | yes | `''::text` |  |
| 8 | `read` | boolean | **no** | `false` |  |
| 9 | `created_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `recipient_id` → **users**(`id`) · on delete no action _(notifications_recipient_id_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `notif_read` | `(recipient_id = auth.uid())` | — |
| UPDATE | `notif_update` | `(recipient_id = auth.uid())` | `(recipient_id = auth.uid())` |

---

## objective_cutoffs

> One cut-off date per month per year, shared by every objective: a call counts as closed if it was VISITED on or before this date. A month with no row measures to the end of its own period. Written only through set_objective_cutoff().

**Primary key:** `year, month` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `year` | integer | **no** |  |  |
| 2 | `month` | integer | **no** |  |  |
| 3 | `cutoff_date` | date | **no** |  |  |
| 4 | `updated_by` | uuid | yes |  |  |
| 5 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Constraints:**

- `objective_cutoffs_month_check` — `CHECK (((month >= 1) AND (month <= 12)))`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `oc_read` | `(has_perm('calls.view'::text) OR has_perm('reports.view'::text))` | — |

---

## ownership_transfers

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `serial_number` | text | **no** |  |  |
| 3 | `item_name` | text | **no** | `''::text` |  |
| 4 | `from_party` | text | **no** | `''::text` |  |
| 5 | `to_party` | text | **no** |  |  |
| 6 | `transfer_date` | date | yes |  |  |
| 7 | `reference_no` | text | **no** | `''::text` |  |
| 8 | `reason` | text | **no** | `''::text` |  |
| 9 | `remarks` | text | **no** | `''::text` |  |
| 10 | `document_url` | text | **no** | `''::text` |  |
| 11 | `recorded_by` | uuid | yes |  | → users(id) |
| 12 | `recorded_by_name` | text | **no** | `''::text` |  |
| 13 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 14 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 15 | `extra` | jsonb | **no** | `'{}'::jsonb` | Everything the source export carried that has no field of its own, kept as written. |

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(ownership_transfers_recorded_by_fkey)_

**Constraints:**

- `ownership_transfer_parties_differ` — `CHECK ((btrim(lower(from_party)) IS DISTINCT FROM btrim(lower(to_party))))`

**Triggers:** `ownership_transfer_aiu` → `ownership_transfer_move()` · `ownership_transfer_biu` → `ownership_transfer_apply()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `ownership_write` | `has_perm('ownership.transfer'::text)` | `has_perm('ownership.transfer'::text)` |
| SELECT | `ownership_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## parties

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `party_name` | text | **no** |  | master: party — derived from the parties table itself |
| 3 | `city` | text | yes | `''::text` |  |
| 4 | `state` | text | yes | `''::text` |  |
| 5 | `party_type` | text | yes | `''::text` |  |
| 6 | `address` | text | yes | `''::text` |  |
| 7 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 8 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 9 | `party_key` | text | yes |  |  |
| 10 | `name_key` | text _(generated)_ | yes |  |  |

**Unique:** `name_key` _(parties_name_key_uniq)_ · `party_key) WHERE (party_key IS NOT NULL` _(partial)_ _(parties_party_key_uniq)_

**Triggers:** `parties_aii` → `parties_after_insert()` · `parties_biu` → `parties_before_write()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `parties_write` | `has_perm('masters.edit'::text)` | `has_perm('masters.edit'::text)` |
| SELECT | `parties_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## parts

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `code` | text | yes | `''::text` |  |
| 3 | `description` | text | yes | `''::text` |  |
| 4 | `item_detail` | text | yes | `''::text` | master: spare — derived from the parts table itself |
| 5 | `active` | boolean | **no** | `true` |  |
| 6 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 7 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 8 | `code_key` | text _(generated)_ | yes |  |  |
| 9 | `item_detail_key` | text _(generated)_ | yes |  |  |
| 10 | `category` | text | **no** | `''::text` | The Item Master's own Spare / Consumable word -- Spare, Consumable, Product, Labour, or anything else that file carries -- title-cased on import. '' means nobody has said yet, and Spare Insights reports that as Unclassified rather than folding it into a bucket. Deliberately NOT constrained (0152): a check here aborts a bulk import part-written, and a category is worth reporting on rather than refusing data over. |
| 11 | `product` | text | yes |  | The machine family this part belongs to (EXT, ORG, CPX, MT75...), from the Item Master. Blank on about a third of the catalogue. |
| 12 | `purchase_cost` | numeric | yes |  | Purchase cost from the Item Master. Present on 560 of 1,324 rows, so any figure derived from it must say what it covers. |
| 13 | `purchase_cost_f` | numeric | yes |  |  |
| 14 | `source_added_by` | text | yes |  |  |
| 15 | `source_added_on` | timestamp with time zone | yes |  | When the SUPERSEDED system recorded this part. Not this system's created_at, which is when the row arrived here. |
| 16 | `source_modified_on` | timestamp with time zone | yes |  |  |
| 17 | `source_inactive_on` | timestamp with time zone | yes |  |  |

**Unique:** `item_detail_key` _(parts_item_detail_key_uniq)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `parts_write` | `has_perm('masters.edit'::text)` | `has_perm('masters.edit'::text)` |
| SELECT | `parts_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## party_key_seq

**Primary key:** `singleton` · **Row-level security:** _off_

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `singleton` | boolean | **no** | `true` |  |
| 2 | `last_no` | bigint | **no** | `0` |  |

**Constraints:**

- `party_key_seq_singleton_check` — `CHECK (singleton)`

**Permissions**

_No policies, RLS off — reachable by anything with table privileges._

---

## password_resets

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `target_email` | text | **no** |  |  |
| 3 | `target_id` | uuid | yes |  |  |
| 4 | `reset_by` | uuid | yes |  |  |
| 5 | `reset_by_email` | text | **no** | `''::text` |  |
| 6 | `reset_at` | timestamp with time zone | **no** | `now()` |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `pwr_read` | `is_admin()` | — |

---

## pending_registrations

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `requested_at` | timestamp with time zone | **no** | `now()` |  |
| 3 | `engineer` | text | yes | `''::text` |  |
| 4 | `call_type` | text | yes | `'FIELD'::text` |  |
| 5 | `party_name` | text | yes | `''::text` |  |
| 6 | `city` | text | yes | `''::text` |  |
| 7 | `state` | text | yes | `''::text` |  |
| 8 | `product` | text | yes | `''::text` |  |
| 9 | `serial` | text | yes | `''::text` |  |
| 10 | `reported_problem` | text | yes | `''::text` |  |
| 11 | `plan_date` | date | yes |  |  |
| 12 | `ucn` | text | yes | `''::text` |  |
| 13 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 14 | `created_by` | uuid | yes |  | → users(id) |

**References:**

- `created_by` → **users**(`id`) · on delete no action _(pending_registrations_created_by_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `pend_insert` | — | `(has_perm('pending.register'::text) OR has_perm('request.create'::text))` |
| SELECT | `pend_read` | `(can_view_all_calls() OR (created_by = auth.uid()) OR (has_perm('calls.view'::text) AND (lower(TRIM(BOTH FROM engineer)) IN ( SELECT lower(TRIM(BOTH FROM v.n)) AS lower    FROM vis…` | — |
| UPDATE | `pend_update` | `(has_perm('pending.register'::text) OR has_perm('calls.create'::text))` | `(has_perm('pending.register'::text) OR has_perm('calls.create'::text))` |

---

## pm_calls

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint | **no** | `nextval('call_split_id_seq'::regclass)` |  |
| 2 | `ucn` | text | yes |  |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `reg_date` | date | yes |  |  |
| 5 | `complaint_date` | date | yes |  |  |
| 6 | `party_name` | text | yes | `''::text` |  |
| 7 | `city` | text | yes | `''::text` |  |
| 8 | `state` | text | yes | `''::text` |  |
| 9 | `product_name` | text | yes | `''::text` |  |
| 10 | `serial` | text | yes | `''::text` |  |
| 11 | `item_status` | text | yes | `''::text` |  |
| 12 | `warranty_number` | text | yes | `''::text` |  |
| 13 | `warranty_start` | date | yes |  |  |
| 14 | `warranty_end` | date | yes |  |  |
| 15 | `contract_number` | text | yes | `''::text` |  |
| 16 | `contract_start` | date | yes |  |  |
| 17 | `contract_end` | date | yes |  |  |
| 18 | `contract_type` | text | yes | `''::text` |  |
| 19 | `call_type` | text | yes | `'FIELD'::text` |  |
| 20 | `standard_complaint` | text | yes | `''::text` | master: complaint (Standard Complaint) |
| 21 | `complaint_reported` | text | yes | `''::text` |  |
| 22 | `allocated_to` | text | yes | `''::text` |  |
| 23 | `allocated_to_email` | text | yes | `''::text` |  |
| 24 | `breakdown_date` | date | yes |  |  |
| 25 | `person_calling` | text | yes | `''::text` |  |
| 26 | `public_health_threat` | text | yes | `''::text` |  |
| 27 | `death` | text | yes | `''::text` |  |
| 28 | `serious_incident` | text | yes | `''::text` |  |
| 29 | `mode_of_reporting` | text | yes | `''::text` |  |
| 30 | `customer_name` | text | yes | `''::text` |  |
| 31 | `customer_number` | text | yes | `''::text` |  |
| 32 | `customer_designation` | text | yes | `''::text` |  |
| 33 | `email_address` | text | yes | `''::text` |  |
| 34 | `status` | text | yes | `'Registered'::text` |  |
| 35 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 36 | `created_by` | uuid | yes |  | → users(id) |
| 37 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 38 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 39 | `last_status` | text | yes | `''::text` |  |
| 40 | `last_visit_at` | timestamp with time zone | yes |  |  |
| 41 | `open_state` | text _(generated)_ | yes |  |  |
| 42 | `added_on` | date | yes |  |  |
| 43 | `reg_at` | timestamp with time zone | yes |  |  |
| 44 | `reopened_at` | timestamp with time zone | yes |  |  |
| 45 | `reopen_count` | integer | **no** | `0` |  |
| 46 | `cancelled_at` | timestamp with time zone | yes |  |  |
| 47 | `cancel_reason` | text | **no** | `''::text` |  |
| 48 | `cancelled_by` | uuid | yes |  |  |
| 49 | `actual_created_by` | uuid | yes |  | → users(id) |

**Unique:** `ucn` _(pm_calls_ucn_key)_ · `ucn` _(pm_calls_ucn_key)_

**References:**

- `actual_created_by` → **users**(`id`) · on delete no action _(pm_calls_actual_created_by_fkey)_
- `created_by` → **users**(`id`) · on delete no action _(pm_calls_created_by_fkey)_

**Constraints:**

- `pm_calls_type_ck` — `CHECK ((call_table_for(call_type) = 'pm'::text))`

**Triggers:** `calls_biu` → `calls_before_insert()` · `no_hard_delete` → `block_hard_delete()` · `notify_alloc` → `notify_call_allotted()` · `zz_calls_allot_guard` → `calls_allot_guard()` · `zz_calls_edit_section_guard` → `calls_edit_section_guard()` · `zz_calls_stamp_creator` → `calls_stamp_creator()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `calls_insert` | — | `has_perm('calls.create'::text)` |
| SELECT | `calls_scoped_read` | `(( SELECT has_perm('calls.view'::text) AS has_perm) AND (( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (actual_created_by = …` | — |
| UPDATE | `calls_update` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` | `(( SELECT (has_perm('calls.edit'::text) OR has_perm('calls.report'::text) OR has_perm('calls.allot'::text) OR has_perm('calls.edit.complaint'::text) OR has_perm('calls.edit.custome…` |

---

## product_additional_entries

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `serial_number` | text | **no** |  |  |
| 3 | `item_name` | text | **no** | `''::text` |  |
| 4 | `party_name` | text | **no** | `''::text` |  |
| 5 | `warranty_number` | text | **no** | `''::text` |  |
| 6 | `warranty_start` | date | yes |  |  |
| 7 | `warranty_end` | date | yes |  |  |
| 8 | `contract_number` | text | **no** | `''::text` |  |
| 9 | `contract_type` | text | **no** | `''::text` |  |
| 10 | `contract_start` | date | yes |  |  |
| 11 | `contract_end` | date | yes |  |  |
| 12 | `source_note` | text | **no** | `''::text` |  |
| 13 | `document_url` | text | **no** | `''::text` |  |
| 14 | `remarks` | text | **no** | `''::text` |  |
| 15 | `recorded_by` | uuid | yes |  | → users(id) |
| 16 | `recorded_by_name` | text | **no** | `''::text` |  |
| 17 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 18 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 19 | `serial_key` | text _(generated)_ | yes |  |  |

**Unique:** `serial_key` _(product_additional_entries_serial_key_uniq)_

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(product_additional_entries_recorded_by_fkey)_

**Triggers:** `product_additional_entry_aiu` → `product_additional_entry_apply()` · `product_additional_entry_biu` → `product_additional_entry_biu()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `pae_write` | `has_perm('cover.edit'::text)` | `has_perm('cover.edit'::text)` |
| SELECT | `pae_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## products

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `party_name` | text | yes | `''::text` |  |
| 3 | `item_name` | text | yes | `''::text` | master: product — derived from the products table itself |
| 4 | `serial_number` | text | yes | `''::text` |  |
| 5 | `item_status` | text | yes | `''::text` |  |
| 6 | `warranty_number` | text | yes | `''::text` |  |
| 7 | `warranty_start` | date | yes |  |  |
| 8 | `warranty_end` | date | yes |  |  |
| 9 | `contract_number` | text | yes | `''::text` |  |
| 10 | `contract_start` | date | yes |  |  |
| 11 | `contract_end` | date | yes |  |  |
| 12 | `contract_type` | text | yes | `''::text` |  |
| 13 | `active` | boolean | **no** | `true` |  |
| 14 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 15 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 16 | `machine_key` | text _(generated)_ | yes |  |  |
| 17 | `serial_key` | text _(generated)_ | yes |  | lower(btrim(serial_number)), stored, so a client can look one machine up by serial as an EQUALITY on an indexed column. The expression index products_serial_key_idx (0037) cannot be reached through PostgREST; this can. |

**Unique:** `machine_key` _(products_machine_key_uniq)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `products_write` | `has_perm('masters.edit'::text)` | `has_perm('masters.edit'::text)` |
| SELECT | `products_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## profiles

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | uuid | **no** |  | → users(id) |
| 2 | `email` | text | **no** |  |  |
| 3 | `full_name` | text | **no** | `''::text` |  |
| 4 | `role` | text | **no** | `'engineer'::text` |  |
| 5 | `designation` | text | yes | `''::text` |  |
| 6 | `engineer_code` | text | yes | `''::text` |  |
| 7 | `reporting_manager_email` | text | yes | `''::text` |  |
| 8 | `regional_manager_email` | text | yes | `''::text` |  |
| 9 | `active` | boolean | **no** | `true` |  |
| 10 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 11 | `extra_permissions` | jsonb | **no** | `'[]'::jsonb` |  |

**Unique:** `email` _(profiles_email_key)_ · `email` _(profiles_email_key)_

**References:**

- `id` → **users**(`id`) · on delete cascade _(profiles_id_fkey)_

**Triggers:** `profiles_role_guard` → `profiles_role_guard()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `profiles_admin_write` | `has_perm('users.manage'::text)` | `has_perm('users.manage'::text)` |
| SELECT | `profiles_self_read` | `((id = auth.uid()) OR is_admin() OR has_perm('users.manage'::text))` | — |

---

## quality_objectives

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `year` | integer | **no** |  |  |
| 3 | `sort_order` | integer | **no** | `0` |  |
| 4 | `process` | text | **no** | `''::text` |  |
| 5 | `parameter` | text | **no** |  |  |
| 6 | `yearly_target` | text | **no** | `''::text` |  |
| 7 | `current_target` | text | **no** | `''::text` |  |
| 8 | `frequency` | text | **no** | `''::text` |  |
| 9 | `responsible` | text | **no** | `''::text` |  |
| 10 | `m01` | numeric | yes |  |  |
| 11 | `m02` | numeric | yes |  |  |
| 12 | `m03` | numeric | yes |  |  |
| 13 | `m04` | numeric | yes |  |  |
| 14 | `m05` | numeric | yes |  |  |
| 15 | `m06` | numeric | yes |  |  |
| 16 | `m07` | numeric | yes |  |  |
| 17 | `m08` | numeric | yes |  |  |
| 18 | `m09` | numeric | yes |  |  |
| 19 | `m10` | numeric | yes |  |  |
| 20 | `m11` | numeric | yes |  |  |
| 21 | `m12` | numeric | yes |  |  |
| 22 | `total` | numeric | yes |  |  |
| 23 | `source` | text | **no** | `'manual'::text` |  |
| 24 | `notes` | text | **no** | `''::text` |  |
| 25 | `updated_by` | uuid | yes |  |  |
| 26 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 27 | `calc_key` | text | **no** | `''::text` | Empty = the figure is typed and Re-Calc leaves it alone. Otherwise the name of what computes it: failure_rate_12m, open_rate_monthly. |
| 28 | `calc_params` | jsonb | **no** | `'{}'::jsonb` |  |

**Unique:** `year, lower(btrim(parameter))` _(quality_objectives_year_param_uniq)_

**Triggers:** `zz_quality_objectives_cutoff_guard` → `quality_objectives_cutoff_guard()` · `zz_quality_objectives_stamp` → `quality_objectives_stamp()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `qo_write` | `has_perm('config.manage'::text)` | `has_perm('config.manage'::text)` |
| SELECT | `qo_read` | `(has_perm('calls.view'::text) OR has_perm('reports.view'::text))` | — |

---

## record_audit

> HISTORICAL. Written by triggers from 0048 until 0112 stopped them (2026-09-05) — audit_log is the trail now. Retained, not maintained: everything here happened while it was running.

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `table_name` | text | **no** |  |  |
| 3 | `op` | text | **no** |  |  |
| 4 | `record_key` | text | yes |  |  |
| 5 | `actor` | uuid | yes |  |  |
| 6 | `actor_email` | text | yes |  |  |
| 7 | `changed_at` | timestamp with time zone | **no** | `now()` |  |
| 8 | `old_data` | jsonb | yes |  |  |
| 9 | `new_data` | jsonb | yes |  |  |

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `record_audit_read` | `(is_admin() OR has_perm('audit.view'::text))` | — |

---

## reports

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `ucn` | text | **no** |  |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `call_status` | text | yes | `''::text` |  |
| 5 | `pending_reason` | text | yes | `''::text` | master: pendingreason (Call Pending Reason) |
| 6 | `manual_report` | text | yes | `''::text` |  |
| 7 | `data` | jsonb | **no** | `'{}'::jsonb` |  |
| 8 | `engineer` | text | yes | `''::text` |  |
| 9 | `engineer_email` | text | yes | `''::text` |  |
| 10 | `visit_at` | timestamp with time zone | yes |  |  |
| 11 | `updated_by` | uuid | yes |  | → users(id) |
| 12 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 13 | `uid` | text | yes |  |  |
| 14 | `source_ref` | text | **no** | `''::text` | The original AppSheet file reference this row's manual_report was derived from. Kept so a wrong link can be re-resolved. |
| 15 | `mapped_at` | timestamp with time zone | yes |  | Set when the row was loaded by the bulk report → call mapping, not reported live. |

**Unique:** `uid` _(reports_uid_uniq)_

**References:**

- `updated_by` → **users**(`id`) · on delete no action _(reports_updated_by_fkey)_

**Triggers:** `no_hard_delete` → `block_hard_delete()` · `reports_touch_call` → `reports_touch_call()` · `reports_visit_date_guard` → `reports_visit_date_guard()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `reports_write` | `has_perm('calls.report'::text)` | `has_perm('calls.report'::text)` |
| SELECT | `reports_read` | `(( SELECT is_admin() AS is_admin) OR (( SELECT has_perm('calls.view'::text) AS has_perm) AND (( SELECT can_view_all_calls() AS can_view_all_calls) OR (EXISTS ( SELECT 1    FROM cal…` | — |

---

## role_table_views

> How a register looks for a role: columns, order, widths, grouping, filters. role = '' means everyone. set_at is compared against the reader's own arrangement — the later decision wins.

**Primary key:** `storage_key, role` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `storage_key` | text | **no** |  |  |
| 2 | `role` | text | **no** | `''::text` |  |
| 3 | `view` | jsonb | **no** | `'{}'::jsonb` |  |
| 4 | `set_at` | bigint | **no** | `((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint` |  |
| 5 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 6 | `updated_by` | uuid | yes |  | → users(id) |

**References:**

- `updated_by` → **users**(`id`) · on delete no action _(role_table_views_updated_by_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `rtv_write` | `(is_admin() OR has_perm('config.manage'::text))` | `(is_admin() OR has_perm('config.manage'::text))` |
| SELECT | `rtv_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## sale_entries

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `sa_number` | text | **no** |  |  |
| 3 | `entry_at` | timestamp with time zone | yes |  |  |
| 4 | `party_name` | text | yes | `''::text` |  |
| 5 | `sold_through` | text | yes | `''::text` |  |
| 6 | `invoice_no` | text | yes | `''::text` |  |
| 7 | `invoice_date` | date | yes |  |  |
| 8 | `warranty_start` | date | yes |  |  |
| 9 | `warranty_end` | date | yes |  |  |
| 10 | `warranty_years` | numeric | yes |  |  |
| 11 | `warranty_months` | integer | yes |  |  |
| 12 | `pm_visits` | integer | yes |  |  |
| 13 | `warranty_status` | text | yes | `''::text` |  |
| 14 | `other_details` | text | yes | `''::text` |  |
| 15 | `party_type` | text | yes | `''::text` |  |
| 16 | `profile` | text | yes | `''::text` |  |
| 17 | `country` | text | yes | `''::text` |  |
| 18 | `state` | text | yes | `''::text` |  |
| 19 | `city` | text | yes | `''::text` |  |
| 20 | `engineer` | text | yes | `''::text` |  |
| 21 | `address` | text | yes | `''::text` |  |
| 22 | `pincode` | text | yes | `''::text` |  |
| 23 | `tel1` | text | yes | `''::text` |  |
| 24 | `tel2` | text | yes | `''::text` |  |
| 25 | `pan` | text | yes | `''::text` |  |
| 26 | `gst` | text | yes | `''::text` |  |
| 27 | `tax` | text | yes | `''::text` |  |
| 28 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 29 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 30 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 31 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |

**Unique:** `sa_number` _(sale_entries_sa_number_key)_ · `sa_number` _(sale_entries_sa_number_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(sale_entries_created_by_fkey)_

**Referenced by:** `sale_items.sa_number`

**Triggers:** `sale_entries_sync_cover` → `cover_header_sync()` · `sale_entries_touch` → `touch_updated_at()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sale_entries_write` | `has_perm('cover.edit'::text)` | `has_perm('cover.edit'::text)` |
| SELECT | `sale_entries_read` | `(has_perm('masters.view'::text) OR has_perm('cover.edit'::text) OR is_admin())` | — |

---

## sale_items

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `sa_number` | text | **no** |  | → sale_entries(sa_number) |
| 4 | `priority` | integer | yes | `1` |  |
| 5 | `product_code` | text | yes | `''::text` |  |
| 6 | `product_name` | text | yes | `''::text` |  |
| 7 | `serial_number` | text | yes | `''::text` |  |
| 8 | `invoice_no` | text | yes |  |  |
| 9 | `invoice_date` | date | yes |  |  |
| 10 | `sold_through` | text | yes |  |  |
| 11 | `warranty_start` | date | yes |  |  |
| 12 | `warranty_end` | date | yes |  |  |
| 13 | `warranty_years` | numeric | yes |  |  |
| 14 | `warranty_months` | integer | yes |  |  |
| 15 | `pm_visits` | integer | yes |  |  |
| 16 | `warranty_status` | text | yes |  |  |
| 17 | `other_details` | text | yes |  |  |
| 18 | `state` | text | yes |  |  |
| 19 | `city` | text | yes |  |  |
| 20 | `engineer` | text | yes |  |  |
| 21 | `accessories_included` | boolean | yes |  |  |
| 22 | `consumable_included` | boolean | yes |  |  |
| 23 | `contract_price_fixed` | boolean | yes |  |  |
| 24 | `already_sold_to` | text | yes | `''::text` |  |
| 25 | `replacement_unit` | boolean | yes |  |  |
| 26 | `replacement_unit_sl` | text | yes | `''::text` |  |
| 27 | `add_call` | text | yes | `''::text` |  |
| 28 | `inst_call` | text | yes | `''::text` |  |
| 29 | `added_by` | text | yes | `''::text` |  |
| 30 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 31 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 32 | `updated_at` | timestamp with time zone | **no** | `now()` |  |
| 33 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |

**Unique:** `uid` _(sale_items_uid_key)_ · `uid` _(sale_items_uid_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(sale_items_created_by_fkey)_
- `sa_number` → **sale_entries**(`sa_number`) · on delete cascade _(sale_items_sa_number_fkey)_

**Triggers:** `sale_items_defaults` → `sale_items_defaults()` · `sale_items_stub_header` → `sale_items_stub_header()` · `sale_items_sync_cover` → `cover_item_sync()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sale_items_write` | `has_perm('cover.edit'::text)` | `has_perm('cover.edit'::text)` |
| SELECT | `sale_items_read` | `(has_perm('masters.view'::text) OR has_perm('cover.edit'::text) OR is_admin())` | — |

---

## sla_rules

**Primary key:** `key` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `key` | text | **no** |  |  |
| 2 | `label` | text | **no** |  |  |
| 3 | `target_hours` | integer | **no** |  |  |
| 4 | `active` | boolean | **no** | `true` |  |
| 5 | `sort_order` | integer | **no** | `0` |  |
| 6 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Triggers:** `sla_rules_touch` → `sla_rules_touch()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sla_write` | `(is_admin() OR has_perm('config.manage'::text))` | `(is_admin() OR has_perm('config.manage'::text))` |
| SELECT | `sla_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## spare_consumption

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `ucn` | text | yes | `''::text` |  |
| 3 | `call_number` | text | yes | `''::text` |  |
| 4 | `part` | text | yes | `''::text` |  |
| 5 | `qty` | numeric | yes | `1` |  |
| 6 | `engineer` | text | yes | `''::text` |  |
| 7 | `data` | jsonb | **no** | `'{}'::jsonb` |  |
| 8 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 9 | `created_by` | uuid | yes |  | → users(id) |
| 10 | `engineer_email` | text | yes | `''::text` |  |
| 11 | `source` | text | **no** | `'Report'::text` |  |
| 12 | `remarks` | text | yes | `''::text` |  |
| 13 | `recorded_by` | text | yes | `''::text` |  |
| 14 | `original_qty` | numeric | yes |  |  |
| 15 | `adjusted_by` | text | yes |  |  |
| 16 | `adjusted_at` | timestamp with time zone | yes |  |  |
| 17 | `adjustment_reason` | text | yes |  |  |
| 18 | `grir` | text | **no** | `''::text` | GRIR / traceability reference for the part actually fitted — batch, goods-receipt or serial. Recorded by the engineer at consumption. |
| 19 | `source_ref` | text | **no** | `''::text` | The row id this line came from when it was imported. Lets a re-load correct rather than duplicate. |
| 20 | `source_ref_key` | text _(generated)_ | yes |  |  |

**Unique:** `source_ref_key` _(spare_consumption_source_ref_uniq)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(spare_consumption_created_by_fkey)_

**Triggers:** `consumption_adjust_guard` → `consumption_adjust_guard()` · `consumption_biu` → `consumption_before_insert()` · `consumption_reconcile_guard` → `consumption_reconcile_guard()` · `no_hard_delete` → `block_hard_delete()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `cons_write` | — | `CASE     WHEN (COALESCE(source, 'Report'::text) = 'Reconciliation'::text) THEN has_perm('consumption.reconcile'::text)     ELSE (has_perm('calls.report'::text) OR has_perm('spare.d…` |
| SELECT | `cons_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (lower(engineer_email) = lower(( SELECT auth.email() AS email))) OR (lower(TR…` | — |
| UPDATE | `cons_update` | `has_perm('consumption.reconcile'::text)` | `has_perm('consumption.reconcile'::text)` |

---

## spare_consumption_history

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `engineer` | text | **no** |  |  |
| 3 | `engineer_key` | text _(generated)_ | yes |  |  |
| 4 | `part` | text | **no** |  |  |
| 5 | `part_code` | text _(generated)_ | yes |  |  |
| 6 | `qty` | numeric | **no** |  |  |
| 7 | `consumed_at` | timestamp with time zone | yes |  |  |
| 8 | `ucn` | text | **no** | `''::text` |  |
| 9 | `call_number` | text | **no** | `''::text` |  |
| 10 | `party_name` | text | **no** | `''::text` |  |
| 11 | `source` | text | **no** |  |  |
| 12 | `source_key` | text _(generated)_ | yes |  |  |
| 13 | `ref` | text | **no** | `''::text` |  |
| 14 | `remarks` | text | **no** | `''::text` |  |
| 15 | `data` | jsonb | **no** | `'{}'::jsonb` |  |
| 16 | `recorded_by` | uuid | yes |  | → users(id) |
| 17 | `recorded_by_name` | text | **no** | `''::text` |  |
| 18 | `created_at` | timestamp with time zone | **no** | `now()` |  |

**Unique:** `source_key, ref` _(spare_consumption_history_ref_uniq)_

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(spare_consumption_history_recorded_by_fkey)_

**Constraints:**

- `spare_consumption_history_qty_check` — `CHECK ((qty >= (0)::numeric))`

**Triggers:** `spare_consumption_history_biu` → `spare_consumption_history_biu()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sch_write` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` |
| SELECT | `sch_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR ( SELECT has_perm('data.view_all'::text) AS has_perm) OR (lower(btrim(engineer)) IN ( SELECT lower(btrim(v.n)) AS lower    …` | — |

---

## spare_dispatch_counters

**Primary key:** `series, period` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `series` | text | **no** |  |  |
| 2 | `period` | text | **no** |  |  |
| 3 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## spare_dispatch_lines

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `dispatch_uid` | text | **no** |  |  |
| 3 | `line_id` | bigint | **no** |  | → spare_request_lines(id) |
| 4 | `line_uid` | text | yes | `''::text` |  |
| 5 | `part` | text | yes | `''::text` |  |
| 6 | `qty` | numeric | **no** | `0` |  |
| 7 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 8 | `received_at` | timestamp with time zone | yes |  |  |
| 9 | `received_by` | text | yes | `''::text` |  |
| 10 | `receipt_remarks` | text | yes | `''::text` |  |
| 11 | `refurbished` | boolean | **no** | `false` |  |

**References:**

- `line_id` → **spare_request_lines**(`id`) · on delete cascade _(spare_dispatch_lines_line_id_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sdl_write` | `( SELECT has_perm('spare.dispatch'::text) AS has_perm)` | `( SELECT has_perm('spare.dispatch'::text) AS has_perm)` |
| SELECT | `sdl_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## spare_dispatches

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `dc_number` | text | yes |  |  |
| 4 | `dc_date` | date | **no** | `CURRENT_DATE` |  |
| 5 | `engineer` | text | **no** |  |  |
| 6 | `engineer_email` | text | yes | `''::text` |  |
| 7 | `courier` | text | yes | `''::text` |  |
| 8 | `remarks` | text | yes | `''::text` |  |
| 9 | `line_count` | integer | **no** | `0` |  |
| 10 | `total_qty` | numeric | **no** | `0` |  |
| 11 | `dispatched_by` | text | yes | `''::text` |  |
| 12 | `dispatched_at` | timestamp with time zone | **no** | `now()` |  |
| 13 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 14 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |

**Unique:** `uid` _(spare_dispatches_uid_key)_ · `uid` _(spare_dispatches_uid_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(spare_dispatches_created_by_fkey)_

**Triggers:** `spare_dispatches_assign_no` → `spare_dispatches_assign_no()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `sd_insert` | — | `(is_admin() OR has_perm('spare.dispatch'::text))` |
| SELECT | `sd_read` | `(( SELECT is_admin() AS is_admin) OR (created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm) OR (lower(btrim(engineer)) IN ( SELECT low…` | — |
| UPDATE | `sd_update` | `(is_admin() OR has_perm('spare.dispatch'::text))` | `(is_admin() OR has_perm('spare.dispatch'::text))` |

---

## spare_issue_history

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `engineer` | text | **no** |  |  |
| 3 | `engineer_key` | text _(generated)_ | yes |  |  |
| 4 | `part` | text | **no** |  |  |
| 5 | `part_code` | text _(generated)_ | yes |  |  |
| 6 | `qty` | numeric | **no** |  |  |
| 7 | `issued_at` | timestamp with time zone | yes |  |  |
| 8 | `so_no` | text | **no** | `''::text` |  |
| 9 | `line_uid` | text | **no** | `''::text` |  |
| 10 | `source` | text | **no** |  |  |
| 11 | `source_key` | text _(generated)_ | yes |  |  |
| 12 | `ref` | text | **no** | `''::text` |  |
| 13 | `remarks` | text | **no** | `''::text` |  |
| 14 | `data` | jsonb | **no** | `'{}'::jsonb` |  |
| 15 | `recorded_by` | uuid | yes |  | → users(id) |
| 16 | `recorded_by_name` | text | **no** | `''::text` |  |
| 17 | `created_at` | timestamp with time zone | **no** | `now()` |  |

**Unique:** `source_key, ref` _(spare_issue_history_ref_uniq)_

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(spare_issue_history_recorded_by_fkey)_

**Constraints:**

- `spare_issue_history_qty_check` — `CHECK ((qty > (0)::numeric))`

**Triggers:** `spare_issue_history_biu` → `spare_issue_history_biu()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `sih_write` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` | `(( SELECT has_perm('consumption.reconcile'::text) AS has_perm) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm))` |
| SELECT | `sih_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR ( SELECT has_perm('data.view_all'::text) AS has_perm) OR (lower(btrim(engineer)) IN ( SELECT lower(btrim(v.n)) AS lower    …` | — |

---

## spare_or_counters

**Primary key:** `period` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `period` | text | **no** |  |  |
| 2 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## spare_request_engineer_log

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `request_uid` | text | **no** |  | → spare_requests(uid) |
| 3 | `or_no` | text | yes | `''::text` |  |
| 4 | `from_engineer` | text | yes | `''::text` |  |
| 5 | `from_email` | text | yes | `''::text` |  |
| 6 | `to_engineer` | text | yes | `''::text` |  |
| 7 | `to_email` | text | yes | `''::text` |  |
| 8 | `reason` | text | yes | `''::text` |  |
| 9 | `changed_at` | timestamp with time zone | **no** | `now()` |  |
| 10 | `changed_by` | uuid | yes |  |  |
| 11 | `changed_by_name` | text | yes | `''::text` |  |

**References:**

- `request_uid` → **spare_requests**(`uid`) · on delete cascade _(spare_request_engineer_log_request_uid_fkey)_

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| SELECT | `srel_read` | `(( SELECT is_admin() AS is_admin) OR ( SELECT has_perm('spare.dispatch'::text) AS has_perm) OR ( SELECT has_perm('spare.approve'::text) AS has_perm) OR (lower(from_email) = lower((…` | — |

---

## spare_request_lines

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `request_uid` | text | **no** |  | → spare_requests(uid) |
| 3 | `part` | text | yes | `''::text` |  |
| 4 | `qty` | numeric | yes | `1` |  |
| 5 | `rm_approval` | text | yes | `'Pending'::text` |  |
| 6 | `admin_approval` | text | yes | `'Pending'::text` |  |
| 7 | `stores_status` | text | yes | `'Pending'::text` |  |
| 8 | `status` | text | yes | `'Pending'::text` |  |
| 9 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 10 | `row_no` | integer | yes |  |  |
| 11 | `rm_by` | text | yes |  |  |
| 12 | `rm_at` | timestamp with time zone | yes |  |  |
| 13 | `commercial_approval` | text | yes | `'Pending'::text` |  |
| 14 | `commercial_by` | text | yes |  |  |
| 15 | `commercial_at` | timestamp with time zone | yes |  |  |
| 16 | `nsm_approval` | text | yes | `'Pending'::text` |  |
| 17 | `nsm_by` | text | yes |  |  |
| 18 | `nsm_at` | timestamp with time zone | yes |  |  |
| 19 | `dc_number` | text | yes |  |  |
| 20 | `courier` | text | yes |  |  |
| 21 | `dispatch_remarks` | text | yes |  |  |
| 22 | `dispatched_by` | text | yes |  |  |
| 23 | `dispatched_at` | timestamp with time zone | yes |  |  |
| 24 | `received_by` | text | yes |  |  |
| 25 | `received_at` | timestamp with time zone | yes |  |  |
| 26 | `receipt_remarks` | text | yes |  |  |
| 27 | `reject_reason` | text | yes |  |  |
| 28 | `rejected_stage` | text | yes |  |  |
| 29 | `stage` | text | yes | `'RM Approval'::text` |  |
| 30 | `line_uid` | text | yes |  |  |
| 31 | `approval_data` | jsonb | **no** | `'{}'::jsonb` |  |
| 32 | `dispatch_uid` | text | yes |  |  |
| 33 | `stock_out_no` | text | yes |  |  |
| 34 | `dispatched_qty` | numeric | **no** | `0` |  |
| 35 | `received_qty` | numeric | **no** | `0` |  |
| 36 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |

**Unique:** `line_uid` _(spare_request_lines_line_uid_idx)_

**References:**

- `request_uid` → **spare_requests**(`uid`) · on delete cascade _(spare_request_lines_request_uid_fkey)_

**Referenced by:** `spare_dispatch_lines.line_id`

**Triggers:** `no_hard_delete` → `block_hard_delete()` · `notify_dispatch` → `notify_spare_dispatched()` · `spare_request_line_stub_parent` → `spare_request_line_stub_parent()` · `spare_request_lines_answer_guard` → `spare_request_lines_answer_guard()` · `spare_request_lines_assign_row_no` → `spare_request_lines_assign_row_no()` · `spare_request_lines_dispatch_guard` → `spare_request_lines_dispatch_guard()` · `spare_request_lines_guard` → `spare_request_lines_guard()` · `spare_request_lines_line_uid` → `spare_request_lines_set_line_uid()` · `spare_request_lines_rm_scope_guard` → `spare_request_lines_rm_scope_guard()` · `spare_request_lines_rollup` → `spare_request_lines_rollup()` · `spare_request_lines_set_stage` → `spare_request_lines_set_stage()` · `spare_request_lines_uid_immutable` → `spare_request_lines_uid_immutable()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `srl_insert` | — | `(has_perm('spare.request'::text) AND spare_line_parent_ok(request_uid))` |
| SELECT | `srl_read` | `(EXISTS ( SELECT 1    FROM spare_requests r   WHERE (r.uid = spare_request_lines.request_uid)))` | — |
| UPDATE | `srl_update` | `(can_approve_spares() OR (EXISTS ( SELECT 1    FROM spare_requests r   WHERE ((r.uid = spare_request_lines.request_uid) AND is_spare_requester(r.*)))))` | `(can_approve_spares() OR (EXISTS ( SELECT 1    FROM spare_requests r   WHERE ((r.uid = spare_request_lines.request_uid) AND is_spare_requester(r.*)))))` |

---

## spare_requests

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `req_type` | text | yes | `'Call Based'::text` |  |
| 4 | `engineer` | text | yes | `''::text` |  |
| 5 | `engineer_email` | text | yes | `''::text` |  |
| 6 | `ucn` | text | yes | `''::text` |  |
| 7 | `call_number` | text | yes | `''::text` |  |
| 8 | `party_name` | text | yes | `''::text` |  |
| 9 | `product_name` | text | yes | `''::text` |  |
| 10 | `serial` | text | yes | `''::text` |  |
| 11 | `complaint` | text | yes | `''::text` |  |
| 12 | `item_status` | text | yes | `''::text` |  |
| 13 | `handstock_reason` | text | yes | `''::text` |  |
| 14 | `remarks` | text | yes | `''::text` |  |
| 15 | `status` | text | yes | `'Pending'::text` |  |
| 16 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 17 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |
| 18 | `rm_approval` | text | yes | `'Pending'::text` |  |
| 19 | `rm_by` | text | yes |  |  |
| 20 | `rm_at` | timestamp with time zone | yes |  |  |
| 21 | `commercial_approval` | text | yes | `'Pending'::text` |  |
| 22 | `commercial_by` | text | yes |  |  |
| 23 | `commercial_at` | timestamp with time zone | yes |  |  |
| 24 | `nsm_approval` | text | yes | `'Pending'::text` |  |
| 25 | `nsm_by` | text | yes |  |  |
| 26 | `nsm_at` | timestamp with time zone | yes |  |  |
| 27 | `stores_status` | text | yes | `'Pending'::text` |  |
| 28 | `dc_number` | text | yes |  |  |
| 29 | `dispatched_by` | text | yes |  |  |
| 30 | `dispatched_at` | timestamp with time zone | yes |  |  |
| 31 | `stage` | text | yes | `'RM Approval'::text` |  |
| 32 | `reject_reason` | text | yes |  |  |
| 33 | `rejected_stage` | text | yes |  |  |
| 34 | `courier` | text | yes |  |  |
| 35 | `dispatch_remarks` | text | yes |  |  |
| 36 | `received_by` | text | yes |  |  |
| 37 | `received_at` | timestamp with time zone | yes |  |  |
| 38 | `receipt_remarks` | text | yes |  |  |
| 39 | `or_no` | text | yes |  |  |
| 40 | `or_req_date` | date | yes |  |  |
| 41 | `extra` | jsonb | **no** | `'{}'::jsonb` | Everything the source export carried that has no field of its own, kept as written. |

**Unique:** `uid` _(spare_requests_uid_key)_ · `or_no` _(spare_requests_or_no_idx)_ · `uid` _(spare_requests_uid_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(spare_requests_created_by_fkey)_

**Referenced by:** `spare_request_engineer_log.request_uid` · `spare_request_lines.request_uid`

**Triggers:** `no_hard_delete` → `block_hard_delete()` · `spare_request_engineer_guard` → `spare_request_engineer_guard()` · `spare_requests_assign_or_no` → `spare_requests_assign_or_no()` · `spare_requests_number_immutable` → `spare_requests_number_immutable()` · `spare_requests_stage_guard` → `spare_requests_stage_guard()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| DELETE | `sr_delete` | `((is_admin() OR is_spare_requester(spare_requests.*)) AND (COALESCE(stage, 'RM Approval'::text) = 'RM Approval'::text) AND (COALESCE(rm_approval, 'Pending'::text) = 'Pending'::text…` | — |
| INSERT | `sr_insert` | — | `has_perm('spare.request'::text)` |
| SELECT | `sr_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (lower(engineer_email) = lower(( SELECT auth.email() AS email))) OR (lower(bt…` | — |
| UPDATE | `sr_update` | `(can_approve_spares() OR is_spare_requester(spare_requests.*))` | `(can_approve_spares() OR is_spare_requester(spare_requests.*))` |

---

## stock_transfer_counters

**Primary key:** `period` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `period` | text | **no** |  |  |
| 2 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## stock_transfer_lines

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `transfer_uid` | text | **no** |  | → stock_transfers(uid) |
| 3 | `row_no` | integer | yes |  |  |
| 4 | `part` | text | **no** |  |  |
| 5 | `qty` | numeric | **no** |  |  |
| 6 | `created_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `transfer_uid` → **stock_transfers**(`uid`) · on delete cascade _(stock_transfer_lines_transfer_uid_fkey)_

**Constraints:**

- `stock_transfer_lines_qty_check` — `CHECK ((qty > (0)::numeric))`

**Triggers:** `stock_transfer_lines_check_stock` → `stock_transfer_lines_check_stock()` · `stock_transfer_lines_row_no` → `stock_transfer_lines_row_no()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `stl_insert` | — | `(has_perm('stock.transfer'::text) AND (EXISTS ( SELECT 1    FROM stock_transfers t   WHERE ((t.uid = stock_transfer_lines.transfer_uid) AND ((t.created_by = auth.uid()) OR is_admin…` |
| SELECT | `stl_read` | `(EXISTS ( SELECT 1    FROM stock_transfers t   WHERE (t.uid = stock_transfer_lines.transfer_uid)))` | — |

---

## stock_transfers

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `uid` | text | **no** |  |  |
| 3 | `from_engineer` | text | **no** |  |  |
| 4 | `to_engineer` | text | **no** |  |  |
| 5 | `transfer_date` | date | **no** | `CURRENT_DATE` |  |
| 6 | `remarks` | text | yes | `''::text` |  |
| 7 | `status` | text | yes | `'Completed'::text` |  |
| 8 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 9 | `created_by` | uuid | yes | `auth.uid()` | → users(id) |
| 10 | `extra` | jsonb | **no** | `'{}'::jsonb` | Everything the source export carried that has no field of its own, kept as written. |
| 11 | `source` | text | **no** | `''::text` | import for a transfer loaded from the sheet era, as material_returns.source already means; empty for one made here. |

**Unique:** `uid` _(stock_transfers_uid_key)_ · `uid` _(stock_transfers_uid_key)_

**References:**

- `created_by` → **users**(`id`) · on delete no action _(stock_transfers_created_by_fkey)_

**Referenced by:** `stock_transfer_lines.transfer_uid`

**Constraints:**

- `stock_transfer_distinct_parties` — `CHECK ((lower(TRIM(BOTH FROM from_engineer)) <> lower(TRIM(BOTH FROM to_engineer))))`

**Triggers:** `stock_transfers_assign_no` → `stock_transfers_assign_no()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| INSERT | `st_insert` | — | `has_perm('stock.transfer'::text)` |
| SELECT | `st_read` | `(( SELECT can_view_all_calls() AS can_view_all_calls) OR (created_by = ( SELECT auth.uid() AS uid)) OR (lower(btrim(from_engineer)) IN ( SELECT lower(btrim(v.n)) AS lower    FROM v…` | — |

---

## tracker_items

> A shared list of what is being worked on -- the in-app backlog. One permission (mod:/tracker) grants both the page and the right to add and edit, because "all who have access should be able to add, edit" is the access model. Nothing is auto-deleted: an item is Done or Dropped and stays, because a shared list people delete from is one nobody trusts.

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `title` | text | **no** |  |  |
| 3 | `detail` | text | **no** | `''::text` |  |
| 4 | `status` | text | **no** | `'Open'::text` | Open · In progress · Blocked · Done · Dropped |
| 5 | `owner` | text | **no** | `''::text` |  |
| 6 | `area` | text | **no** | `''::text` |  |
| 7 | `due_date` | date | yes |  |  |
| 8 | `sort_order` | integer | **no** | `0` |  |
| 9 | `created_by` | uuid | yes |  |  |
| 10 | `created_at` | timestamp with time zone | **no** | `now()` |  |
| 11 | `updated_by` | uuid | yes |  |  |
| 12 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**Triggers:** `zz_tracker_items_stamp` → `tracker_items_stamp()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `tracker_rw` | `has_perm('mod:/tracker'::text)` | `has_perm('mod:/tracker'::text)` |

---

## ucn_counters

**Primary key:** `day, type_letter` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `day` | date | **no** |  |  |
| 2 | `type_letter` | character(1) | **no** |  |  |
| 3 | `last_no` | integer | **no** | `0` |  |

**Permissions**

_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._

---

## user_directory

**Primary key:** `id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `id` | bigint _(identity)_ | **no** |  |  |
| 2 | `name` | text | **no** |  |  |
| 3 | `email` | text | yes | `''::text` |  |
| 4 | `gmail` | text | yes | `''::text` |  |
| 5 | `designation` | text | yes | `''::text` |  |
| 6 | `reporting_manager` | text | yes | `''::text` |  |
| 7 | `regional_manager` | text | yes | `''::text` |  |
| 8 | `region` | text | yes | `''::text` |  |
| 9 | `validity` | boolean | **no** | `true` |  |
| 10 | `extra` | jsonb | **no** | `'{}'::jsonb` |  |
| 11 | `address` | text | yes | `''::text` |  |
| 12 | `city` | text | yes | `''::text` |  |
| 13 | `state` | text | yes | `''::text` |  |
| 14 | `phone` | text | yes | `''::text` |  |
| 15 | `role` | text | yes | `''::text` | RBAC role key (app_roles.role) granted when this person first signs in. |

**Triggers:** `user_directory_address_guard` → `user_directory_address_guard()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `ud_write` | `has_perm('users.manage'::text)` | `has_perm('users.manage'::text)` |
| SELECT | `ud_read` | `(auth.role() = 'authenticated'::text)` | — |
| UPDATE | `ud_address_update` | `(is_admin() OR has_perm('spare.dispatch'::text))` | `(is_admin() OR has_perm('spare.dispatch'::text))` |

---

## validation_results

**Primary key:** `test_id` · **Row-level security:** **on**

| # | Column | Type | Null | Default | Allowed values / reference |
| --- | --- | --- | --- | --- | --- |
| 1 | `test_id` | text | **no** |  |  |
| 2 | `result` | text | **no** | `''::text` |  |
| 3 | `actual` | text | yes | `''::text` |  |
| 4 | `tester` | text | yes | `''::text` |  |
| 5 | `notes` | text | yes | `''::text` |  |
| 6 | `executed_at` | timestamp with time zone | yes |  |  |
| 7 | `recorded_by` | uuid | yes |  | → users(id) |
| 8 | `updated_at` | timestamp with time zone | **no** | `now()` |  |

**References:**

- `recorded_by` → **users**(`id`) · on delete no action _(validation_results_recorded_by_fkey)_

**Triggers:** `validation_results_stamp` → `validation_results_stamp()`

**Permissions**

| Command | Policy | Using | With check |
| --- | --- | --- | --- |
| ALL | `valres_write` | `(is_admin() OR has_perm('config.manage'::text))` | `(is_admin() OR has_perm('config.manage'::text))` |
| SELECT | `valres_read` | `(auth.role() = 'authenticated'::text)` | — |

---

## Views

A view over an RLS-protected table **must** carry `security_invoker=on`, or it
reads as its OWNER and row-level security stops applying to whoever is reading —
silently, with no error. `npm run check:views` fails any that lacks it.

| View | security_invoker | Columns |
| --- | --- | --- |
| `app_user_names` | _not set_ | 2 |
| `call_state` | **on** | 6 |
| `calls` | **on** | 49 |
| `consumption_report` | **on** | 39 |
| `contract_details` | **on** | 33 |
| `engineer_stock` | _not set_ | 3 |
| `failure_modes_by_product` | **on** | 4 |
| `failure_rate_by_product` | **on** | 6 |
| `field_call_review` | **on** | 54 |
| `field_call_review_summary` | **on** | 11 |
| `handstock_balance` | **on** | 20 |
| `handstock_movements` | **on** | 16 |
| `kpi_field_inst` | **on** | 34 |
| `machine_cover` | **on** | 19 |
| `pending_calls` | **on** | 49 |
| `product_register_names` | **on** | 2 |
| `spare_pending_dispatch` | **on** | 31 |
| `spare_pending_rm` | **on** | 24 |
| `spare_stock_out_lines` | **on** | 26 |
| `spare_usage` | **on** | 14 |
| `spare_usage_rollup` | **on** | 8 |
| `tracker_list` | **on** | 15 |
| `unused_spare_report` | **on** | 25 |
| `warranty_sale_details` | **on** | 46 |

**`consumption_report`** — One row per spare booked, with its call and that call's latest visit around it. The first sixteen columns are the user's own report format, in their order; everything after is the rest of spare_consumption plus the call fields worth filtering on. `part` is split into code and description here so no consumer repeats it. security_invoker, so a reader sees only the calls their role allows.

**`kpi_field_inst`** — The KPI workbook's Field_INST tab from the register: A-AB as the sheet has them, AC-AG computed by its own formulas, plus Pending Days for a call still open. Cancelled calls excluded entirely. Close is any Solved... status, report-pending included. A day count is NULL where the event has not happened, never 0.

**`spare_pending_rm`** — Every spare line waiting for a Reporting Manager, with the REQUEST around it: the call, the customer, the product, the SERIAL, the cover, the complaint, the request type and when it was raised. Stage is computed rather than read, because `stage` is a cache and may be stale. security_invoker, so an RM sees only their own team's lines (0116, complaint added 0154).

**`unused_spare_report`** — Not Consumed Against this Call (the report's name; this view keeps its own): two findings -- NOT USED (nothing of that part booked on the call) and SHORT (less booked than was sent). Aggregated per call and part, never per line: a part sent twice on one call would otherwise flag both lines as short whenever the engineer booked the total once. DISPATCHED counts as reached, because acknowledging a delivery is not mandatory and requiring it would empty the report. Spare lines dispatched or received against a call whose part code never appears in that call's consumption. Refused and dropped lines are excluded -- nothing arrived, so nothing could be fitted. Matched on the part CODE because both sides store CODE\|Description and the description drifts. security_invoker, so a reader sees only the calls their role allows.

---

## Master value lists

Maintained by people under **Master**, not enforced by the database. A column fed
by one will still accept anything written to it directly — which is why the app
picks from these lists rather than letting them be typed.

| List key | Feeds |
| --- | --- |
| calltype (Call Type) | `calls.call_type` · `field_calls.call_type` |
| cancelreason (Call Cancel Reason) | `calls.cancel_reason` |
| complaint (Standard Complaint) | `calls.standard_complaint` · `field_calls.standard_complaint` · `installation_calls.standard_complaint` · `pm_calls.standard_complaint` · `call_requests.standard_complaint` |
| dccrgrouping (DCCR Complaint Grouping) | `call_reviews.complaint_grouping` |
| party — derived from the parties table itself | `parties.party_name` |
| pendingreason (Call Pending Reason) | `reports.pending_reason` |
| product — derived from the products table itself | `products.item_name` |
| rootcause (Root Cause Key Word) | `call_reviews.root_cause_keyword` |
| spare — derived from the parts table itself | `parts.item_detail` |

