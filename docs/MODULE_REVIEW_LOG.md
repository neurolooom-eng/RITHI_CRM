# Module review — status and log

The running record of the module review: **what is done, what is pending, and
what happened when**. Updated with every batch. Evidence for each finding is in
[`MODULE_REVIEW.md`](MODULE_REVIEW.md), and the fix for each is in
[`MODULE_REVIEW_HANDOFF.md`](MODULE_REVIEW_HANDOFF.md). This file is the index,
not the argument.

_Last updated: 2026-09-30. **Batch 7 (v0.10.2): 20, 23 and 31 fixed as you decided, merged in #453 on your word ("Lets merge"); migrations 0256–0262 are applied by that merge's "Apply database migrations" run.** Before that: **Findings 57–67 added: every screen's actions checked against Roles & Permissions** (evidence in [`PERMISSIONS_REVIEW.md`](PERMISSIONS_REVIEW.md)). Batch 6 in v0.9.398: 13 fixed (0254, the first migration to apply itself); the background-sync race in D fixed. On 2026-09-29 the live project was baselined, so a merged migration now applies itself. Table review findings 49–56, page: [RITHI Table Atlas](https://claude.ai/artifact/6fPgVRuyiVcATdfzekKwTs)._

---

## Status at a glance

| | Count | Findings |
| --- | --- | --- |
| ✅ **Fixed and live** | **43** | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 38, 40, 41, 43, 45, 46, 47, 48, 49, 50, 51, 52 — 20, 23 and 31 in batch 7 (v0.10.2, #453) |
| ⏳ **Open** | **24** | 26, 27, 34, 35, 36, 37, 39, 42, 44, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67 |
| | **67** | |

**SQL is no longer a hand step for new fixes.** On 2026-09-29 the live
project was brought up to date and baselined (see the log). From here a fix
with a migration applies itself when it is merged; the "Apply database
migrations" run for that merge is the record, and it is read before anything
is called live.

**Also pending: three standing requirements you set on 2026-09-26** (R1–R3,
below). They apply to every table and every date, not to one finding.

---

## Pending — grouped by what it needs

### A. Needs a decision from you (and usually SQL)

| # | Screen | The decision |
| --- | --- | --- |
| **53** | tables | **Records that feed quality and stock can be deleted without trace**: Daily Complaint Review answers (`call_reviews`), dispatch lines, historical issues/consumption, opening stock, MRNs, indoor child records. Decide which are quality records (block delete, void instead) and which are working data (keep delete, add to the audit). |
| **54** | tables | **The row audit covers 10 tables**; not permission changes, the User Master, complaint reviews, cover registers, machines/parts/parties or stock movements. Decide which to add. (`record_audit`'s description also wrongly says it is switched off.) |
| **55** | tables | **Links with no foreign key** — UCN on 13 tables, `contract_items.sa_number`, `dispatch_uid`, `spare_request_engineer_log.or_no`. Decide whether to enforce UCN (a trigger over the 3 call tables) and whether existing orphans are stopped or only reported. Probe rows Orphans 1–8 count them. |
| **39** | Hand-run SQL | ⚠ **Do not run `_item_status_as_at_the_complaint_date.sql` with `v_apply := true`.** Decide first: does **warranty or contract** win when a machine is under both? The file says contract; the Product Database says warranty. It must also map contract words through `contract_cover_code()`. |
| **35 / 36 / 37** | Product Database | The ownership triggers (handoff C8). Should transfers be ordered by their **date** or by when they were **entered**? And how should an imported transfer compare with a sale's timestamp? The fixes for 36 (edit an old sale) and 37 (corrected serial, deleted transfer) follow from that. |
| **34** | Product Database | Four roles see contract machines as OGP. Options: widen the contract read policy, **or** a function that returns only the derived cover (recommended), **or** show "—". |
| **42** | downloads | Excel skips the export permission. Should the permission be granted to roles by migration first? Step 0 query 15 shows who lacks it. |
| **27** | Data Export | Where each table's order key comes from (a migration returning it), and whether to refuse views that have no key. |
| **44** | Calls | Batch cancel: build the button, or keep it SQL-only and record who cancelled. |
| **26** | Call Reporting | **Moved here from C (2026-09-26): it is not a one-line fix.** The form stores a visit date as UTC midnight (reads back 05:30); the upload stores it as IST midnight, which is 18:30 UTC the day before. **Five live database objects** cast `visit_at` to a date — `objective_value`, `objective_evidence`, `reliability_wrr`, `machine_install_start` and the `kpi_field_inst` export (counted on a database built from every migration) — and on a database in UTC (the test database is; `show timezone` on the live project was NOT checked) that makes an UPLOADED visit's day one day EARLY in those calculations — so "fixing" the form to match the upload would move form-entered visits a day early too. Options: set the database time zone to `Asia/Kolkata` (also settles 13), **or** keep UTC and store every date-only visit at UTC midnight on BOTH paths. Run `show timezone;` in the SQL editor first. |

| **60** | User Master → Access | **A holder of "Manage users" can grant any other person "Manage roles & permissions", "Manage users" or "View all data"**, and that person can grant them back. Neither can change their own permissions or make anyone Admin (`profiles_role_guard`). Verified on the database. Decide: should granting those admin-level keys through a person's extra permissions need Admin (recommended)? |
| **61** | Field Solutions | **Any signed-in user can add an article** (`kb_insert`: `auth.uid() is not null`). Decide whether anyone may, or only a role with a key. |
| **62** | downloads | **Finding 42 is wider than Excel.** Word (the FFR R-SER-03), the Data Export ZIP, the ⭳ Download on a signed service report, and the print pages (`/dc`, `/declaration`, `/ffr`) never check `export.data` either; only CSV does. Decide together with 42: one "Export / download" for everything, or a download tick per page? |
| **63** | Roles & Permissions | **A page's row does not show the keys its buttons test.** Installation Calls and PM Calls are governed by the Field Call keys and show none (PM shows nothing at all); Contract Register by `cover.edit` (including delete-an-entry) and shows nothing; Objective by `config.manage`; Pending Calls, Product Database 2.0, Product Failure Analysis, the six Reports rows, Pending Dispatch's Drop, MRN-for-someone-else, Bulk Report Mapping, Settings — all by keys filed on other rows. Decide: show shared keys on every row that uses them, or give Installation and PM keys of their own (needs a migration copying today's grants)? |
| **65** | several | **Admin only, so no other role can ever be given it**: Bulk Uploads (32 registers), PM Bulk Upload, Data Import, Data Export (export and schedules), Audit Mode, Frequent Failure rule, Call Registration desk, User Master reset password, Spare Requests change engineer, Daily Complaint Review date correction, Objective cut-off lock. Decide which should become grantable keys. |
| **66** | Roles & Permissions | **Ticks that do nothing**: `dashboard.view` (tested nowhere); `reports.view` on Visit Reports (the screen and its table test `calls.view`); `config.manage` on Admin Config (no control there tests it); `masters.edit` on Product Master (read-only screen); `masters.view` on six rows (only the database's read rules use it); the User Access row (`/users` redirects to User Master). Decide: remove, or make each mean something. |
| **67** | several | **One key does many jobs**: `users.manage` (create logins, reset passwords, disable, delete, assign roles, grant any key, clone — and every Settings control); `masters.edit` (KYC verification, part rename that moves every record naming the part, bulk Serviceman swap); `cover.edit` (includes deleting a whole entry with its machines); `calls.report` (saving a visit also books spare consumption and feedback); Tracker's page key (includes delete). Decide which to split. |

### B. SQL or performance, no decision needed

| # | What |
| --- | --- |
| **40b** | Found while fixing 40: **12 more hand-run files** return more than one grid (`_which_products_are_missing` — added on 2026-09-29 by another session, its grids numbered 0–3 to run one at a time; `_admin_grant_check`, `_dedupe_part_product_keys`, `_load_check`, `_move_blank_status_visits`, `_party_name_normalise`, `_party_search_diagnose`, `_reassign_spare_engineer`, `_registered_by_check`, `_reset_for_production`, `_stray_cover_rows`, `_yearly_consumption_check`; `_why_is_it_empty_2` was only its `set_config` lines, which the check now ignores). `check:ui` now refuses a NEW one and lists these by name. Also `_pm_call_numbers.sql` is still cut off mid-list and marked DO NOT RUN — it needs the rest of YOUR list to finish. |
| **56** | Filter/sort columns with no index on big registers (feedback paging, call_requests paging, spare line stage, …) — candidates only; confirm with the probe's Full scans rows before adding any. |

| **59** | **Indoor Service: a unit can be set to Dispatched or Closed without the dispatch right.** The Status picker needs only `indoor.work`; the guard (0158) checks `indoor.dispatch` when the dispatch date, reference or dispatcher changes, not the status. A passed quality check is still required. Verified on the database. |

### C. Front end, no decision needed

| # | What |
| --- | --- |
| **57** | **Pending Registrations → ✎ Edit → Save call rewrites any field of a live call with no permission check**, and without the per-section locks the call registers apply (`PendingRegistrations.tsx:671`, `:405`). Only the database's `calls_update` stands behind it. Verified. |
| **58** | **Admin Config → SLA Targets: no check on screen, and a refused save reads "saved".** The database requires Admin or `config.manage`; `saveSlaRule` looks only for an error, and a refused update is not one. Technical Support opens this page by default and holds neither. Verified. |
| **64** | **The screen tests a different key from the database**, so a button is offered and then refused, or offered to the wrong role: Warranty → "+ Installation call" (no check; database wants `install.create` + `cover.edit`); Warranty/Contract → "+ Field call" and Product Database → "+ Install" (no check / wrong key); Pending Registrations → "Create new call" (tests `pending.register`, database wants `calls.create`/`install.create`); Call Review → Reco and Re-open (test `callreview.mark`, database wants `consumption.reconcile` / `pending.register` or `calls.create`); Software Validation (also accepts `users.manage`, database does not); Reset password and Change engineer (offered on `users.manage`, database wants Admin); Data Export (page key on screen, Admin in the database); Call Registration desk and Frequent Failure rule (Admin on screen, database also accepts `config.manage`); Request Registration → Correct this request (no check on screen). |

Evidence for 57–67, screen by screen: [`PERMISSIONS_REVIEW.md`](PERMISSIONS_REVIEW.md).

### R. Your standing requirements (added 2026-09-26)

In your words:

> - I need a key, Timestamp, sys_created_by, sys_updated_by in all the tables.
> - All date fields should be long date which is readable by Excel - dd-mmm-yyyy
> - All DateTime fields should be long date time which is readable by Excel -
>   dd-mmm-yyyy hh:mm:ss

**Where things stand.** Measured on 2026-09-26 on a database built from all
265 migrations. The live project may differ.
[`_tables_without_key_time_author.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/_tables_without_key_time_author.sql)
is read-only and gives the same table for the live database, one row per
table.

| Of 77 tables | Missing |
| --- | --- |
| A primary key | **0**. Every table has one; mostly a synthetic `id`. |
| A natural key (what makes a row "the same row" on a re-load) | **22**, plus **3** whose only unique index is partial or an expression, which an upload cannot target |
| `created_at` | **40** |
| `updated_at` | **46** |
| Any timestamp at all | **14**. Mostly counters, plus `masters`, `user_directory` and three `indoor_job_*` child tables. |
| A "created by" column | **57** |
| An "updated by" column | **68** |
| `sys_created_by` / `sys_updated_by` by those names | **77**. No table has them. |
| All of key + `created_at` + `updated_at` + created by + updated by | **76**. Only `indoor_jobs` has all five. |

Dates in the database are already real types: 73 `date` columns and 139
timestamp columns. The two text columns with date-like names
(`bill_generate_at`) hold a choice, not a date. **So R2 and R3 are about how
dates are shown and exported, not how they are stored.**

| # | Requirement | Already true | Still to do |
| --- | --- | --- | --- |
| **R1** | Key, timestamp, `sys_created_by`, `sys_updated_by` on every table | ✅ **Built, v0.9.378** (0244/0245): `sys_id`, `sys_created_by`, `sys_created_on`, `sys_updated_by`, `sys_updated_on` on 68 tables, written only by the database; existing rows filled from same-meaning fields. | **Your step: run `sys_columns.sql` once.** Not done: showing them on screens with names (R2/R3); natural keys per table (a separate question). |
| **R2** | Date fields as `dd-mmm-yyyy`, readable by Excel | `formatDay()` in `src/lib/dates.ts` is that format. **Downloads done in v0.9.394 (finding 7):** every .xlsx writes a date as a real Excel date formatted `dd-mmm-yyyy`, whatever screen built it; every register CSV writes `dd-MMM-yyyy`. | **Screens audited 2026-09-29** (below): six fixed. **Your decision (2026-09-29): the Delivery Challan and Declaration KEEP `dd-mm-yyyy`**, the way the paper form is filled in by hand. |
| **R3** | Date-time fields as `dd-mmm-yyyy hh:mm:ss`, readable by Excel | `formatDayTime()` is that format. **Downloads done in v0.9.394**, the same way as R2, in your own time rather than the database's UTC. | Screens audited with R2; timestamps now show `dd-MMM-yyyy HH:mm:ss`. |

**Your answers (2026-09-26)**, which is what was built: Q1 → a new `sys_id` on every table; Q2 → separate `sys_created_on` / `sys_updated_on`, overlapping no existing field; Q3 → the login id; Q4 → fill existing rows from existing fields; Q5 → every table except the counters. The questions as they were asked:

**Questions R1 needed answered before any of it was built:**

- **Q1 — "a key".** A natural key where one exists (a re-load then corrects a
  row instead of duplicating it)? Every table already has a system key. The
  backlog's view is that append-only logs (`audit_log`, `notifications`, …)
  should **not** get a natural key, because every row there is a separate
  event. Do you agree, or do you want one there too?
- **Q2 — the timestamp column names.** Keep the existing `created_at` /
  `updated_at` and add them where missing? Or use `sys_created_on` /
  `sys_updated_on` to match the author columns? Renaming would touch every
  view and report that reads the old names.
- **Q3 — what `sys_created_by` holds.** The person's login id (never changes)
  or their email or name (readable, but goes stale when somebody is renamed —
  finding 23 is that problem)?
- **Q4 — existing rows.** Who created a row that is already there is not
  recorded anywhere for most tables. The honest value is blank ("not
  recorded"), not a guess. Agreed?
- **Q5 — "all the tables".** Including the counter tables (`ucn_counters` and
  so on) and settings tables? A counter row has no meaningful author.

**Two things to know before R2/R3 are built:**

- In an **.xlsx** download a date is stored as an Excel date with the format
  applied. Excel can then sort it, filter it by month and do arithmetic on it.
  That is already how `ReportBuilder` works.
- A **CSV** file cannot carry a date type; every cell is text.
  `26-Sep-2026 14:05:00` in a CSV is text that Excel *may* turn into a date
  when it opens the file. I am not certain this works under every Windows
  regional setting (a non-English setting may not read `Sep`), so this should
  be tested on your machine. Where a real Excel date is needed, the answer is
  the .xlsx download, not the CSV.

### D. Also pending, outside the findings list

- **Step 0 — fifteen read-only queries against the live project** (in the
  handoff). Only you can run these. Queries 1, 7, 10 and 13 tell us whether 20,
  31, 35 and 39 have **already** affected live data.
- ~~The 30-minute sync can overlap a Load more already in flight~~ — fixed in
  batch 6 (v0.9.398).
- **Ten screens were only pattern-scanned, not read line by line:** Service
  Manuals, QMS Documents, PM Bulk Upload, Solved Without a Report, Tracker,
  User Access, Admin Config, Software Validation, Settings, Version History.
- **19 reviewer-reported items were never re-checked.** They are
  listed in `MODULE_REVIEW.md` under "Reported by the reviewers and not
  re-checked".
- **Not possible from here:** testing in a browser, running a real PostgREST
  (the download is blocked), and exercising `CallReg.gs` (`script.google.com`
  is blocked).

---

## Log

Newest first. Each entry says what was done, where it landed, and how it was
checked.

### 2026-09-30 — 23, second half: a rename carries the person's records (v0.10.2, merged in #453)
- **0259** (`user_directory`): when a User Master name changes, 16 columns follow it, each matched as its own read policy matches (lower, trimmed):
  - calls: `allocated_to` on field, installation and PM calls;
  - `call_requests` and `pending_registrations`;
  - `spare_requests` and `spare_dispatches`;
  - consumption and consumption history;
  - opening stock, issue history, MRNs, and both sides of a stock transfer;
  - the Service Engineer on `parties` and `products`. These are included because a new call's Allocated To is filled from the customer's Service Engineer, so a stale name there hides every new call.
- **Not changed, on purpose:** signatures (`rm_by`, `dispatched_by`, `received_by`, `recorded_by`), a visit report's and a feedback's engineer, the sale's engineer, and `spare_request_engineer_log`.
- **Same limits as 0257:** nothing moves for a blank old name, a change of case or spacing only, or an old name another row still holds.
- **Four guards refused or reacted to exactly this change:**
  - consumption engineer;
  - the engineer of a dispatched request;
  - an answered call request (frozen);
  - "Call allotted to you".
- **How they let it through:** each now admits only THIS rename, recognised by a per-transaction ticket in the `rename_part()` pattern. The ticket table has RLS on, no policy and no grants, so it cannot be forged; a `set_config` flag could be.
  - **0260** is in `call_requests`, **0261** in `handstock` and **0262** in `notifications`, each after the migration that owns the previous body, which was taken from the database.
  - The three bundles declare `engineerRename`, so run alone they say to run `user_directory` first.
- **Proved** by `directory_rename_carries_records_test`, as a signed-in administrator:
  - all 16 columns move, including a row spelled " eng old ";
  - no allotment notice is sent;
  - the manager still sees all three calls;
  - hand stock is one balance of the same size under the new name;
  - another engineer's rows and `recorded_by` are untouched;
  - outside a rename the three guards still refuse;
  - no ticket is left, and none can be written by a signed-in user;
  - a duplicate old name moves nothing.
- **It fails without its migrations.** With 0259 alone and no guard changes, the SAVE ITSELF is refused ("This request is already Registered — Engineer cannot be changed"), so the four must ship together, and they do.
- `_status.sql` rows 202–203 read NO, NO without them; yes, NO with 0259 alone; yes, yes with all four.
- **Also:** the ticket table gets the five system columns through `sys_columns_attach()`, because it is created after 0244. The first validation run caught it (row 187, `sys_columns_test`).
- **validate:** 113/113 suites, 22/22 checks.
- **Measured:** renaming an engineer with 3,000 calls, 2,000 customers and 1,000 opening lines, among 23,000 / 20,000 / 20,000, took 0.52 s.
- **Not verified:** live data. A legacy row that a table's own insert guard would now refuse (for example an opening balance or issue line with a blank source) would make the rename refuse loudly, not skip silently.

### 2026-09-30 — Batch 7 (v0.10.2): 20, 23, 31 — merged in #453
- **Your decisions**, asked and answered the same day:
  - **20:** hold any other word for the approver.
  - **23:** carry the rename; leave work already filed under the old name, and warn on screen.
  - **31:** let Hotline write the link, and only the link.
- **20 — 0256.** `spare_line_stage` passes a stage only on the words Approved or Auto-Approved (any case, spaces, optional hyphen). Nothing stored is rewritten; open lines whose cached stage changes are restaged, so a line with "Not Approved" goes BACK from Stores to RM Approval.
  - The client rule (`spareflow.ts`) is the same pattern, and `check:ui` now compares the two character for character. The handoff said it already did; it did not.
  - The Spare Request Lines upload tidies the four standard words and keeps any other word as written.
  - New read-only `supabase/apply/_approval_words.sql`, one grid: the unusual words on live and the lines that move.
- **23 — 0257.** A trigger on `user_directory`: when a name changes, rows naming the old name as Reporting or Regional Manager follow it.
  - It matches as the tree does (lower case, not trimmed), so it can never widen a team.
  - Nothing moves when another row keeps the old name, the old name was blank, or only the case changed.
  - Only an Admin can change a name at all (`user_directory_address_guard`), which I found while testing: the handoff assumed "Manage users".
  - User Master shows what will and will not move under the name, and asks before saving, from the drawer and from the table.
- **Found while doing 23:** call visibility also matches the ALLOTTEE's NAME (`can_see_call`, `calls_scoped_read`). So under "leave it", a renamed engineer and their manager would stop seeing calls allotted to the old name. Put back to you; **your answer (same day): "Rename existing records"** — the entry above.
- **31 — 0258.** `link_install_call(item, ucn)` writes INST Call and nothing else, for `install.create` or `cover.edit`.
  - It refuses a call number already there, and a UCN that is not an installation call for that product and serial.
  - Not callable by the not-signed-in role.
  - The Warranty register writes back through it, and the per-machine button is shown to roles that can raise the call. That also closes finding 64's "+ Installation call" row.
- **Proved** as signed-in users, not the superuser, with three new suites. Each fails on a database built without its migration and passes with it:
  - `spare_approval_whole_word`: 12 phrasings wait, 7 pass; Stores is offered only the cleared lines; a line cached as Stores moves back with its word kept.
  - `directory_rename_carries_team`: team 3 → 3 across the rename; exactly the right rows move; the three limits hold.
  - `link_install_call`: Hotline's direct write still matches 0 rows; the function maps, is idempotent, and refuses the three wrong cases.
  - `_status.sql` rows 199–201 read NO without the migrations and yes with them.
  - 16 new `check:ui` assertions, and two old ones re-pointed from the direct UPDATE to the function.
- **Not verified:** anything on the live project. `_approval_words.sql` is how to see which spares will move before the merge.

### 2026-09-30 — Actions vs Roles & Permissions: findings 57–67

The user: *"The Actions listed in every view should be part of the Roles and
Permissions. I don't think that is present."* Then: *"Add all these to the
Review List -- Bug List"*. All 60 screens were read in five groups, and every
action was compared with the page's row in `PERM_TREE`. The claims that
matter most were re-checked by hand against the code and a database built
from every migration. Every key the code checks exists on the matrix, and
almost every write is refused by the database without the right key. The
gaps are what a row shows and controls. Filed as 57–67, all open; full
evidence in [`PERMISSIONS_REVIEW.md`](PERMISSIONS_REVIEW.md). Nothing changed in the app or the database. **Not merged:
the user asked that nothing reach `main` until they say so.**

### 2026-09-30 — Batch 6 (v0.9.398): 13, and the sync race

- **13 — Spare Insights counts India's days (0254).** The window's bounds and
  the month grouping name `Asia/Kolkata`, so the answer no longer depends on
  the database's zone — which is why this needed no answer to `show timezone`.
  The body is `pg_get_functiondef`'s with three expressions changed (diffed).
  `spare_insights_ist_window_test` books at 00:10 on 1 Jan, 23:50 on 31 Jan and
  03:00 on 1 Feb, India time, and asks in UTC, Asia/Kolkata and
  America/Los_Angeles: January 3, February 4, every time. Without 0254 it reads
  January as 6 in UTC. `_status.sql` row 197.
  **The first migration merged since the baseline, and it applied itself**:
  the PR's dry-run against live named 0254 as the only file pending, and run
  36618945635 on the merge logged it "applied". Deploy 709 was cancelled
  because #450 landed a minute later; deploy 710, which contains this batch,
  succeeded.
- **D — the background sync no longer races Load more.** Fifteen screens ran a
  bare 30-minute timer that called the loader whatever else was happening; a
  tick landing during Load more ran two reads at once, and whichever finished
  second replaced the other's rows. `startBackgroundSync()` in `cache.ts` now
  waits while the screen is busy and retries every five seconds, so the
  refresh is late rather than lost or racing. `check:ui` runs it against
  real timers (a tick due mid-read does not run, and does run once the read
  ends; stopping cancels the retry) and refuses a bare timer on the sync
  interval in any screen — it named all fifteen with the change removed.
- **The log itself:** the eight "SQL still to run" findings are live (the
  bundles were run and `_status.sql` read yes on 2026-09-29).

### 2026-09-29 — `sales_contracts.sql` timed out on the live project ("Failed to fetch (api.supabase.com)")
- **Cause, measured** on a database with 20,000 sale lines and 4,000 transfers:
  the bundle took **361 s**. Two sections were almost all of it — **0238**
  (304 s) and **0240** (52 s) — because they rewrite every machine through the
  per-row ownership lookup that had no index (finding 38). The SQL editor's
  request gives up long before that; the database was not refusing anything.
- **Fix, on the branch:** 0252's indexes (numbered 0250 until main took that number) now run BEFORE 0237/0238/0240 in the
  bundle. Same data, indexes absent (as on live): the whole bundle takes
  **7 s**. With the indexes, 0238 is 4 s and 0240 0.4 s.
- **Without waiting for the branch:** create the two indexes on their own first
  (a few seconds), then `main`'s `sales_contracts.sql` finishes quickly too.

### 2026-09-29 — R2/R3 screen audit (branch only, NOT merged — the user asked to hold `main`)
- **Found and fixed: "today" was the UTC day.** `todayISO()` was
  `toISOString().slice(0, 10)`, which from midnight to 05:29 IST names
  YESTERDAY (measured). `visitdate.ts` said it was local — it was not — so a
  visit filed after midnight defaulted to the day before and the real date was
  refused as "in the future"; DC, MRN, stock-transfer, sale and Spare Insights
  defaults were a day early too. `todayLocal()` in `dates.ts` now; every use in
  `src` goes through it. No database guard compares a client date with the
  server's `current_date` (checked: the four functions that raise near it do
  not), so the change cannot trip one.
- **Display fixed:** Indoor Service (six stage stamps shown as raw UTC
  `yyyy-mm-dd`), Call Review (`en-GB` 18/09/2026), Software Validation and the
  Hand Stock sync note (browser locale), PM Bulk Upload (no year), and the
  Roles & Permissions download's "Taken on".
- **Already right:** every table column without a formatter goes through the
  table's own ISO → `dd-MMM-yyyy` rule, and every other screen uses the shared
  formatters.
- **Delivery Challan / Declaration keep `dd-mm-yyyy`** — your decision, 2026-09-29.
- **Checks:** a `check:ui` behaviour test pins the clock at 00:30 IST and
  expects the 29th; nothing in `src` may take a day from `toISOString()` or
  print one with `toLocaleDateString`. validate 106/106 suites, 22/22 checks.

### 2026-09-26 — Batch 5 (v0.9.394)
- **7 / R2 / R3 for downloads:** `buildXlsx` shapes every body cell itself, so
  the four workbooks that skipped `xlsxCell` now write real dates; every
  register CSV formats a date value as `dd-MMM-yyyy [HH:mm:ss]`. Proved by
  building a workbook from a raw PostgREST row and reading the bytes: dates are
  styled serials, `0012345` and `MP-010` stay text.
- **15 (rest), SQL 0251:** `objective_evidence()` breaks every tie it pages by.
  The body is the database's own, with four ORDER BYs changed and nothing else
  (diffed). Status row 193.
- **32 (rest):** a filtered request count shows `+` over a partial load; a
  blank status is Pending.
- **38, SQL 0252:** two indexes matching the ownership triggers' lookups.
  **Measured** at 20,000 sale lines and 4,000 transfers: a 500-row transfer
  batch 15.6 s → 0.57 s. Status row 194.
- **40:** the four named probes are one grid each (tested with data on a
  database); `check:ui` counts grids in every hand-run file. Two bugs fixed on
  the way: the report-count reconciliation counted an orphan's repeat visits
  twice and printed "DOES NOT RECONCILE" on data that reconciled (a reviewer's
  unconfirmed report, now measured and fixed); and the Item Status probe
  matched machines on the serial alone.
- **48:** the `calls` view's update trigger returns NULL when nothing was
  written (0114 and its 0245 mirror, identically), and `updateCall` /
  `reallocateCalls` count the rows the database says it changed.
  `calls_view_honest_update_test` fails on the old trigger ("reported 3 rows
  where nothing was written") and passes on the new. Status row 195.
- **Also fixed:** a `check:ui` date helper used the UTC day, so two cover-expiry
  assertions failed whenever the checks ran on Indian time. The app was right.
- **Your step:** run `objective.sql`, `sales_contracts.sql` and
  `sys_columns.sql` (or migrations 0251, 0252 and the sys_columns bundle).

### 2026-09-26 — Batch 4, front end (v0.9.380)
- **Fixed:** 4 (Dashboard dates day-first through `parseAnyDate`), 8 (six
  paged reads now name an order), 10 (only the newest Daily Complaint Review
  load may write, Load more included), 11 (KPI machines and failure rate
  follow the product chip), 12 (cover tiles through `coverCode()`), 14 (the
  top-25 product list says so), 43 (a request whose machines name two
  customers is refused, CR-007).
- **More of 15:** tiebreakers on the KPI export (UCN), Hand Stock movements
  (every column — the view has no key), Not Used report (part code), its
  engineer list and the master values. Left: the Objective evidence function.
- **More of 32:** the installations card's read is paged, and a failed Party
  Master lookup is an error rather than "every customer is unknown".
- **26 moved to A:** it interlocks with five database objects that cast the visit to a date, and with the database's
  time zone — see the row there.
- **Checks:** 22 new `check:ui` assertions, every one failing on `main` before
  the fix and passing after; `check:orders` against a database (133 order
  columns, all exist); `check:paging`; build.

### 2026-09-26 — Low-hanging fruit from the table review fixed (v0.9.379)
- **49** Party Key counter locked (RLS on, grants withdrawn). **50, 52**
  `raise_ffr()`, the maintenance functions and the numbered series withdrawn
  from the API roles — every caller checked to be a definer first. **51** the
  two cover functions the app calls now need `cover.edit` or admin (the
  recommendation, applied with "low hanging fruits"). **54** `record_audit`'s
  description corrected; which tables to audit is still your call.
- **Proved** as a signed-in user, not the superuser: the refusals happen, and a
  call, a party and a review still get their UCN, Party Key and FFR. Status
  rows 188–190 read NO before and yes after. Full validation.
- **Your step**: run `lockdown.sql`, `sales_contracts.sql` and
  `data_integrity.sql` (or just migrations 0246–0248).

### 2026-09-26 — Table review: all 77 tables — findings 49–56
- Asked: *"Deep dive into all tables"* — integrity & security, data dictionary,
  performance and live data quality, as a shareable page:
  **[RITHI Table Atlas](https://claude.ai/artifact/6fPgVRuyiVcATdfzekKwTs)**.
- Facts introspected from a database built from all 268 migrations; security
  findings EXERCISED as the anonymous role and as a plain engineer, in rolled-back
  transactions.
- **Measured**: anonymous rewrite of the Party Key counter (49); anonymous FFR
  creation via `raise_ffr()` (50); anonymous/engineer runs of register-wide
  maintenance functions (51); an engineer burning a UCN (52).
- **Read**: deletable quality/stock records (53), audit coverage of 10 tables and
  `record_audit`'s stale description (54), 13 unguarded UCN links and three
  single-parent links without a foreign key (55), unindexed filters (56).
- **Checked and fine**: 76/77 tables RLS on; every definer function pins
  `search_path`; hard deletes refused on the 10 core quality tables; no duplicate
  indexes.
- New read-only probe **`supabase/apply/_table_health.sql`** — orphans,
  duplicates, blanks, full-table scans and the live grants in one grid; tested on
  a database with and without 0243–0245.
- **Not verified**: anything on the live project (the probe is how); whether the
  web API can pass `raise_ffr`'s row-typed argument.

### 2026-09-26 — R1 built (v0.9.378): system columns on every table
- Your decisions: a new `sys_id`; login ids; existing rows filled from
  existing fields; every table but the counters; and *"shouldn't overlap with
  any of the other fields"*.
- 0244 adds and stamps the five columns on 68 tables; 0245 rebuilds the six
  `select t.*` views so re-running any bundle leaves them the same.
- The fill copies same-meaning fields only, by a table rewrite that fires no
  trigger. On calls the creator is the person who typed it, not the desk.
- **Proved**: `sys_columns_test` (7 sections, including forged values sent
  through the `calls` view); `_status.sql` row 187; 7 `check:ui` assertions;
  104 suites and 22 checks. **Measured**: 1.2 s to apply on 37,000 rows; about
  13 µs added per row written.
- **Found on the way — finding 48**: an edit through `calls` answers
  "UPDATE 1" even when nothing was saved.
- **Your step**: run `sys_columns.sql` once. Not done yet.

### 2026-09-26 — Finding 47 fixed (v0.9.377) — your decision: exempt reconciliation
- **0243**: a Reconciliation line no longer needs a visit on its call; every
  other source still does. Only those allowed to reconcile can use it (the
  insert policy), so it is not a way round the rule for engineers.
- **Both Spare Consumption drawers** now show a refusal inside themselves.
- **Proved**: new suite `reconciliation_needs_no_visit` fails on the old
  function and passes on the new; `_status.sql` row 186 reads NO without 0243;
  4 new `check:ui` assertions fail on the old screen. Full validation: 103
  suites, 22 checks, all passing.
- **Corrected along the way**: 0214's comment says such a line shows blank
  visit dates. Measured, it shows the booking time in both dates (0215's
  fallback), and only Visit UID is blank. My report of this date said "blank"
  too, and was wrong.
- **Your step**: apply 0243 once (link above). Not yet done.

### 2026-09-26 — Finding 47: reconciliation refused on a call with no visit
- Reported with screenshots: AJAY G (INDOOR SERVICE) holds 7 parts, all
  received by transfer, and none could be booked against 26G06F0006.
- **Ruled out** by reading and measuring:
  - the hand stock: the picker lists all 7, and transfers in count;
  - name and part-code matching: the stock cap uses the same keys as the
    picker;
  - permission: the drawer only opens for `consumption.reconcile`.
- **Reproduced** on a copy database, running as the Spare Coordinator, with
  AJAY's stock received only by transfer:
  - with no visit on the call, the insert is refused by 0214 ("No visit has
    been filed on 26G06F0006 yet…");
  - with one visit added, the identical insert succeeds and on-hand goes
    from 1 to 0.
- **Also found:** the refusal goes to the page's banner, which sits under
  the drawer's full-screen overlay.
- **Not verified:** whether 26G06F0006 has a visit on the live project.
  This read-only query shows it:
  `select (select count(*) from public.calls where ucn = '26G06F0006') as calls,
  (select count(*) from public.reports where ucn = '26G06F0006') as visits,
  (select count(*) from public.spare_consumption where ucn = '26G06F0006') as spares_booked;`
  A `visits` of 0 confirms this cause.

### 2026-09-26 — Your three standing requirements added (R1–R3)
- Key, timestamp and authors on every table, plus the two Excel date formats.
  Recorded under Pending → R, with a baseline measured on a database built from
  every migration.
- New read-only probe `_tables_without_key_time_author.sql` gives the same
  table for the live project. It was checked against the local build and its
  counts matched the separate measurement.
- One count reconciled: `BACKLOG.md` says 22 tables have no natural key, and a
  stricter count says 25. Both are right. The three in between
  (`material_returns`, `quality_objectives`, `saved_charts`) have only a
  partial or expression unique index, which an upload cannot use.
- Nothing built yet. R1 waits on Q1–Q5.

### 2026-09-26
- **Batch 3 deploy confirmed** — "Deploy to GitHub Pages" run 678 on `162c107`
  succeeded (19:57 UTC, 25 Sep). All three batches are live.
- This log started. Its counts were checked against the git history and the
  Actions runs, not written from memory. Two assertion counts in the first draft
  were wrong and were corrected before it was committed.

### 2026-09-25 — Batch 3 (v0.9.375), PR #423, merged `162c107`
- **Fixed:** 5, 18, 22, and the rest of 21 and 45. Also part of 15: `id`
  tiebreakers on five paged reads.
- **New helper:** `readUpTo` in `paging.ts`. It re-reads the loaded pages in
  parallel and walks them in order.
- **Re-reviewed before merge** by an independent pass. Nothing was made
  worse; four real problems were found and fixed before merge (`d0367d1`):
  - capped-search `+` missing from the chips, footer and group headings;
  - Hand Stock's screen didn't admit a capped search;
  - the Pending Dispatch banner described the cut wrongly;
  - re-reads ran one page after another.
- **Checks:** 12 new `check:ui` assertions, each failing on the code before
  its fix, and 12 new `check:paging` tests.
- Deploy run 678 succeeded.

### 2026-09-25 — Batch 2 (v0.9.374), PR #422, merged `b5cbb20`
- **Fixed:** 1, 6, 16, 17, 19 and 25, and part of 21.
- **Re-reviewed before merge.** No regressions, but five fixes covered only one
  path. They were completed before merge (`fe59eb7`):
  - "To be Reviewed" read "N of 0" with the Call Status box set;
  - strong claims appeared after a failed load;
  - Renew raced when two contracts were opened quickly;
  - the download warning gave advice that couldn't be followed;
  - RM Approval's count had no `+`.
- **Checks:** 15 new `check:ui` assertions, each failing on the code before its
  fix.
- Deploy run 677 succeeded.

### 2026-09-25 — Batch 1 (v0.9.373), PR #421, merged `50d8497`
- **Fixed:** 2, 3, 9, 28, 29, 30, 33, 41 and 46. The easy part of 31 and 32
  too, plus part of 45.
- 30 and 31 (a save or link the database silently skipped) now count the
  rows changed with `update(…, { count: 'exact' })`. The client library
  documents this; it could not be run against a real PostgREST here.
- **Checks:** three new `check:ui` assertions, each failing on the old code.
- Deploy run 676 succeeded.
- The same PR carried the review documents and the by-module index.

### 2026-09-25 — Findings filed by module
- All 62 screens were mapped to their findings.
- Three corrections to the review were found while mapping:
  - `main` had already fixed one of finding 8's reads;
  - finding 16 had counted one screen twice;
  - finding 39's line numbers had moved.

### 2026-09-24 — Second re-review (`main` at `ee732f4`, then `4a75371`)
- All 31 findings open at the time still held.
- **Findings 33–46 were added.** Three parallel reviewers raised 32 candidates,
  and each was checked by hand before it went in. The serious ones were in
  the Product Database ownership logic (34–38) and the Item Status script (39).
- Two candidates were design, recorded as questions. The candidates that
  couldn't be re-checked were listed as such.

### 2026-09-23 — First re-review (`main` at `092448e`)
- 26 of 27 findings still held. 24 was fixed on `main` (`1bf248e`).
- **Findings 28–32 were added.** 30 and 31 were measured: the UPDATE matched
  zero rows with no error.

### 2026-09-21 — Review started (`main` at `a657d7d`)
- Screen-by-screen review of every module. **Findings 1–27** filed with
  evidence, and the handoff written in three batches: mechanical, careful,
  decision.
- Findings 15, 20, 23, 24 and 26, and the workbook half of 7, were measured on
  a Postgres built from every migration, or by building the file.

---

## How to keep this log

- **Each batch:** add a dated entry at the top of the log. Move each fixed
  finding from Pending to the counts, update the at-a-glance table, and note
  the PR, the merge commit and whether the deploy succeeded.
- **Each decision you make on group A:** record it here, with the date, before
  it is built.
- **Anything found and not fixed** goes under Pending, in the group it belongs
  to. It does not go into a commit message only.
