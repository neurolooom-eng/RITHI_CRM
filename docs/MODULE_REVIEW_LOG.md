# Module review — status and log

The running record of the module review: **what is done, what is pending, and
what happened when**. Updated with every batch. Evidence for each finding is in
[`MODULE_REVIEW.md`](MODULE_REVIEW.md), and the fix for each is in
[`MODULE_REVIEW_HANDOFF.md`](MODULE_REVIEW_HANDOFF.md). This file is the index,
not the argument.

_Last updated: 2026-09-26. Table review done — findings 49–56, page: [RITHI Table Atlas](https://claude.ai/artifact/6fPgVRuyiVcATdfzekKwTs). R1 built in v0.9.378 and finding 47 fixed in v0.9.377 — the SQL for both (0243; sys_columns.sql) still to be applied. R2–R3 pending._

---

## Status at a glance

| | Count | Findings |
| --- | --- | --- |
| ✅ **Fixed and live** | **21** | 1, 2, 3, 5, 6, 9, 16, 17, 18, 19, 21, 22, 24, 25, 28, 29, 30, 33, 41, 45, 46 |
| ✅ **Fixed, SQL still to run** | **1** | 47 (v0.9.377: the screen part is live; the database part needs 0243 applied) |
| ◐ **Partly fixed** | **3** | 15, 31, 32 |
| ⏳ **Open** | **31** | 4, 7, 8, 10, 11, 12, 13, 14, 20, 23, 26, 27, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44, 48, 49, 50, 51, 52, 53, 54, 55, 56 |
| | **56** | |

**Batches 1–3 were front end only.** Finding 47 is the first fix with SQL:
**apply [`0243_reconciliation_needs_no_visit.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/migrations/0243_reconciliation_needs_no_visit.sql)
once in the Supabase SQL editor.** Until then the reconciliation form still
refuses on a call with no visit, but now shows why.

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
| **51** | functions | **Register-wide maintenance functions run for any caller** (anonymous included, measured). Two are called by the cover admin actions and need a permission inside — confirm `cover.edit`; the rest can be withdrawn. |
| **39** | Hand-run SQL | ⚠ **Do not run `_item_status_as_at_the_complaint_date.sql` with `v_apply := true`.** Decide first: does **warranty or contract** win when a machine is under both? The file says contract; the Product Database says warranty. It must also map contract words through `contract_cover_code()`. |
| **35 / 36 / 37** | Product Database | The ownership triggers (handoff C8). Should transfers be ordered by their **date** or by when they were **entered**? And how should an imported transfer compare with a sale's timestamp? The fixes for 36 (edit an old sale) and 37 (corrected serial, deleted transfer) follow from that. |
| **34** | Product Database | Four roles see contract machines as OGP. Options: widen the contract read policy, **or** a function that returns only the derived cover (recommended), **or** show "—". |
| **20** | Spare Requests | "Not Approved" reads as approved. Decide what happens to rows already stored with that value (Step 0 query 1 shows whether any exist). |
| **23** | User Master | A renamed person empties their team. Options: cascade the rename, key the tree on id, or refuse the rename. |
| **31** (rest) | Warranty Register | Hide the per-machine "+ Installation call" from roles without `cover.edit`, **or** let those roles write `inst_call`. The failure is already reported honestly. |
| **42** | downloads | Excel skips the export permission. Should the permission be granted to roles by migration first? Step 0 query 15 shows who lacks it. |
| **27** | Data Export | Where each table's order key comes from (a migration returning it), and whether to refuse views that have no key. |
| **44** | Calls | Batch cancel: build the button, or keep it SQL-only and record who cancelled. |

### B. SQL or performance, no decision needed

| # | What |
| --- | --- |
| **49** | ⚠ **High, measured.** `party_key_seq` has row-level security OFF and the not-signed-in role holds every privilege: as anonymous I set the Party Key counter to 999,999 and the next key issued was Party-1000000. Fix: RLS on with no policy + withdraw grants (like the other counters). Probe rows Security 1–2 show the live grants. |
| **50** | ⚠ **High, measured in SQL** (web path unverified). `raise_ffr()` runs with owner rights, is callable anonymously, checks nobody: as anonymous it raised FFR - 001/26 on a call of my choosing — an undeletable quality record using a controlled number. Fix: withdraw execute (only the review trigger and `backfill_ffrs()` call it, both as owner). |
| **52** | Numbered series (`next_ucn`, `next_party_key`, `next_spare_or_no`, …) callable by anyone, leaving gaps; 47 owner-rights functions callable anonymously in all. Fix: withdraw from anon; the app calls only `next_call_reqid()`. |
| **56** | Filter/sort columns with no index on big registers (feedback paging, call_requests paging, spare line stage, …) — candidates only; confirm with the probe's Full scans rows before adding any. |
| **48** | An edit through the `calls` view answers **"UPDATE 1" when row-level security let nothing through** — the view's INSTEAD OF trigger returns the row whatever the table update did. **Measured** 2026-09-26 (a role without `calls.edit`: `UPDATE 1`, the call unchanged). The same false-"saved" class as 30/31, one layer down. Which screens write through `calls` and trust that answer is **not yet checked**. |
| **38** | Two expression indexes so the ownership triggers stop scanning. A 500-row transfer upload measured 12.5 s against a 20 s limit. |
| **13** | Spare Insights' date window is a UTC day, not an IST one (SQL function). |
| **40** | Four hand-run probes return 2–3 result grids; the SQL editor shows only the last. |

### C. Front end, no decision needed — candidates for batch 4

| # | What |
| --- | --- |
| **10** | Daily Complaint Review: two loads can interleave, and the last writer wins. |
| **4** | Dashboard: a private month-first date parser. |
| **7** | Four workbooks and the register CSVs export raw database dates. |
| **14** | Spare Insights "By product" is the top 25 without saying so. |
| **11** | KPI: the product chip narrows one card of three. |
| **12** | KPI cover tiles bucket by substring; the two patterns overlap. |
| **26** | Call Reporting: a visit date entered on the form reads back at 05:30. |
| **43** | Request Registration: one request can span two customers (CR-007). |
| **15** (rest) | Four more paged reads need a unique order, plus `handstock_movements`, a view with no unique key. |
| **8** | Six reads page with no order at all. |
| **32** (rest) | The Commercial installations card's read is not paged. |

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
| **R2** | Date fields as `dd-mmm-yyyy`, readable by Excel | `formatDay()` in `src/lib/dates.ts` is that format, and the Excel downloads built by `ReportBuilder` already write real Excel dates. | Finding **7**: four workbooks and the register CSVs export raw database dates. Screens have **not** been audited for dates shown any other way, so that audit is the first step. |
| **R3** | Date-time fields as `dd-mmm-yyyy hh:mm:ss`, readable by Excel | `formatDayTime()` is that format, and `ReportBuilder` applies it on the way out. It was already your rule (2026-09-24). | The same audit as R2, for date-times. |

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
- **Older than the fixes, and rare:** the 30-minute sync can overlap a Load
  more already in flight and lose or misplace a page.
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
