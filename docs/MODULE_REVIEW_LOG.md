# Module review — status and log

The running record of the module review: **what is done, what is pending, and
what happened when**. Updated with every batch. Evidence for each finding is in
[`MODULE_REVIEW.md`](MODULE_REVIEW.md), and the fix for each is in
[`MODULE_REVIEW_HANDOFF.md`](MODULE_REVIEW_HANDOFF.md). This file is the index,
not the argument.

_Last updated: 2026-09-30. **Findings 57–67 decided and built (v0.10.11, on the branch): per-screen keys, parent keys, admin-only rows, dead ticks gone.** Before that: **Software Validation Rev 3.0 (v0.10.7, on the branch): every page read, 1,072 actions, every gap given a requirement, test and — where the code falls short — an open defect; data flow diagrams; the auto review switch.** Before that: **20, follow-up (v0.10.7, on the branch, not merged): "Cleared for Stores Processing" counts as approved.** Before that: **Batch 7 (v0.10.2): 20, 23 and 31 fixed as you decided, merged in #453 on your word ("Lets merge"); migrations 0256–0262 are applied by that merge's "Apply database migrations" run.** Before that: **Findings 57–67 added: every screen's actions checked against Roles & Permissions** (evidence in [`PERMISSIONS_REVIEW.md`](PERMISSIONS_REVIEW.md)). Batch 6 in v0.9.398: 13 fixed (0254, the first migration to apply itself); the background-sync race in D fixed. On 2026-09-29 the live project was baselined, so a merged migration now applies itself. Table review findings 49–56, page: [RITHI Table Atlas](https://claude.ai/artifact/6fPgVRuyiVcATdfzekKwTs)._

---

## Status at a glance

| | Count | Findings |
| --- | --- | --- |
| ✅ **Fixed and live** | **43** | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 38, 40, 41, 43, 45, 46, 47, 48, 49, 50, 51, 52 — 20, 23 and 31 in batch 7 (v0.10.2, #453) |
| 🔀 **Fixed on the branch, not merged** | **8** | 57, 58, 59, 63, 64, 65, 66, 67 (PR #464, v0.10.11) |
| ☑ **Closed by your decision** | **2** | 60 and 61 — as designed (2026-09-30) |
| ⏳ **Open** | **14** | 26, 27, 34, 35, 36, 37, 39, 42, 44, 53, 54, 55, 56, 62 (62 parked by you) |
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

| **62** | downloads | **PARKED by you (2026-09-30: "Park it for now").** **Finding 42 is wider than Excel.** Word (the FFR R-SER-03), the Data Export ZIP, the ⭳ Download on a signed service report, and the print pages (`/dc`, `/declaration`, `/ffr`) never check `export.data` either; only CSV does. Decide together with 42: one "Export / download" for everything, or a download tick per page? |

### B. SQL or performance, no decision needed

| # | What |
| --- | --- |
| **40b** | Found while fixing 40: **12 more hand-run files** return more than one grid (`_which_products_are_missing` — added on 2026-09-29 by another session, its grids numbered 0–3 to run one at a time; `_admin_grant_check`, `_dedupe_part_product_keys`, `_load_check`, `_move_blank_status_visits`, `_party_name_normalise`, `_party_search_diagnose`, `_reassign_spare_engineer`, `_registered_by_check`, `_reset_for_production`, `_stray_cover_rows`, `_yearly_consumption_check`; `_why_is_it_empty_2` was only its `set_config` lines, which the check now ignores). `check:ui` now refuses a NEW one and lists these by name. Also `_pm_call_numbers.sql` is still cut off mid-list and marked DO NOT RUN — it needs the rest of YOUR list to finish. |
| **56** | Filter/sort columns with no index on big registers (feedback paging, call_requests paging, spare line stage, …) — candidates only; confirm with the probe's Full scans rows before adding any. |


### C. Front end, no decision needed

| # | What |
| --- | --- |

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

### 2026-10-03 — High-rated batch 2: twelve defects from the second re-review fixed (v0.10.68, 0333–0340, on the branch, not merged)
- **Your ask:** *"Start fixing the High defects. Ensure it doesn't insert any breaking changes. Update the documents / how rithi works / how to RITHI appropriately"*.
- **How "no breaking change" was made true, not assumed:**
  - Every fix began by reading the rule's LIVE definition and every app and database path that writes those columns.
  - The honest paths are named in each migration's header: the importers, the screens, renames, receipts, Change engineer, the follow-the-call refresh, the DCCR upload, and 0324's own deletion.
  - Where a writer was only ever an importer, the importer keeps the old rule (`bulk.upload` / `import.panel`, or no signed-in user).
  - Where a client value could only be honest or forged, it is **discarded, not refused** (the 0113/0114 rule): a forged import marker, and an Item Status other than the call's.
  - **`high_batch_2_test` proves both halves in every section**: the hole is closed AND the honest path beside it still works. 25 refusals, every one labelled. Run on a database WITHOUT 0333–0340, 22 of the 25 expectations go unmet.
- **Fixed:**
  - **D-118 (0339):** an import marker is the importer's alone. Anyone else's is dropped before the stock guards read it.
  - **D-119 (0339):** a recorded transfer is not re-pointed or back-dated.
  - **D-122 (0339):** a return is the returner's own stock, checked on the name the stock is counted by.
  - **D-123 (0339):** a lower stock-out quantity or opening balance, or a delete, never leaves an engineer below zero. Both tables are imaged.
  - **D-120 (0340):** part and quantity are fixed once the RM has decided. This is a trigger of its own; `spare_request_lines_guard` is untouched.
  - **D-121 (0340):** the engineer moves only by Change engineer. Item Status follows the call; the request type is kept.
  - **D-127 (0333):** re-open, close, close-again, cancel and restore need sight of the call. The five functions were redefined from their live bodies with one check added.
  - **D-135 (0335):** a party name, part code and product code change only through a rename.
  - **D-141 (0336):** a verified, PDT-signed, reported, condemned or report-uploaded Indoor job is not deleted.
  - **D-126 (0337):** Product Database 2.0's stored copy is closed to the public key.
  - **D-133 (0338):** three helpers are closed to the public key.
- **Partly fixed:** D-128 (0334). A review needs a real call the writer can see; reading every review is still open to every signed-in user, because narrowing it changes counts on screens.
- **Two bugs the suite caught in my own first drafts, both fixed before anything was recorded:**
  - **The sight check answered NULL, not false, for a call with no creator recorded,** so it waved such calls through. Fixed with `coalesce`, and the reason is written in 0333.
  - **The Indoor delete counted the empty re-verifier text as "re-verified"** and refused a job received in error. Fixed.
- **One rule narrowed to keep your decision:** 0324's own suite deletes a job carrying a QC result, checks, parts and an unsigned PDT as a duplicate intake. So none of those is a trace, and that deletion works exactly as before.
- **Existing suites changed, because what they assumed is now refused:**
  - `material_returns_test` section 8 loads its imported history with no session.
  - `admin_keys_grantable_test`'s two reviewer roles now see the call they review.
  - Both say why in the file.
- **Not in this batch:**
  - **D-142** (namesake approval) — FRS-235.3 itself specifies the name match, so it needs your decision.
  - The rest of the open High defects need a decision, as listed under each.
- **Documents updated:**
  - `docs/HOW_TO_USE.md`: calls, spare requests, hand stock, returns, transfers, review, Product and Part Master, Indoor deletion.
  - How RITHI Functions: hand stock, spares, calls, masters and quality, plus the Spare module schema.
  - A stale line corrected: the Change engineer "Why" was described as optional; it has been required since 0313.
  - Eleven requirement texts amended.
  - OQ-239 added.
  - `_status.sql` rows 265–272.
  - DATABASE_SCHEMA.md regenerated.
- **Merged `main` twice on the way:** #520 took 0331 and v0.10.65, so the stock migration is 0339 and the re-review v0.10.66; then #521 took 0332 and v0.10.66 too, so the spare migration is 0340, the re-review v0.10.67 and this batch v0.10.68, with status rows 265–272 and the test OQ-239 (#521 took OQ-238).

### 2026-10-03 — Second re-review: every open defect re-checked at `1cdceb0`, and a fresh pass over every module (v0.10.67, on the branch, not merged)
- **Your ask:** *"Re-review all the modules"*.
- **Method:** seven readers in parallel, each on its own copy of a database built from all 344 migrations, every write tried as a signed-in user. Two re-checked the 59 open or partly fixed defects; five read every module fresh — Masters, Indoor Service, Cover and sales (including the dealer workflow, #515, and the transferred-machine address, #516), Service Calls with Quality and Overview, and Spares with Reports and Administration.
- **Every High finding below was reproduced again before it was recorded,** from the readers' own scripts or tests written for the purpose. One claim did not reproduce at first and did on a second look: the dealer re-load refusal fires only for a signed-in user, which is how an upload runs.
- **The open defects:**
  - **None is fixed by the merges since the last review,** except the ones that said so: D-098 (0329) and D-109, D-110 (0327) hold as a signed-in user.
  - **Moved to PARTLY FIXED:**
    - **D-040:** item 4 never worked. The four call helpers swallow an error, so the "could not be read" banner cannot fire.
    - **D-086:** Add is right now; Edit and Delete still disagree with the database.
    - **D-097:** 0328 put Sold Through back. The warranty dates are still cleared.
    - **D-108:** the engineer can no longer point a repair at an old visit, but the DC's approver still can, through `record_indoor_visit()`.
    - **D-116:** the handbook is right now; the column comments are not.
  - **Wider or corrected:** D-018, D-039, D-049, D-053, D-055, D-058, D-059, D-060, D-084, D-085, D-099, D-104 (its Renew half contradicts FRS-220.4 — your decision), D-105, D-107.
  - **Five requirement texts named old keys and are corrected:** FRS-120.8 and FRS-133.4 (re-open), FRS-180.1, FRS-240.1 and FRS-241.1 (add).
- **New, 36 defects (D-118 – D-153), the serious ones first:**
  - **Hand stock can be driven below zero, or created from nothing, by six routes** — the control point CLAUDE.md names:
    - **D-118:** marking a consumption, transfer or return "imported" skips the limit, and anybody can set the marker. Found by two readers independently.
    - **D-119:** editing a transfer's header moves stock unchecked.
    - **D-122:** a return can take another engineer's stock; the policy checks the email and stock is counted by name.
    - **D-123:** Stores can cut an issued quantity or delete an opening balance, with nothing audited.
    - **D-124:** consumption can be booked off any engineer's stock.
  - **Spare approvals can be walked around:**
    - **D-120:** the requester can change the part and quantity after every approval (measured: approved for 1 × GP-1, booked out 40 × another part).
    - **D-121:** a plain update moves the engineer and changes the cover, so Commercial is skipped.
    - **D-125:** the challan's "dispatched by" can be rewritten after issue.
  - **Calls and quality:**
    - **D-126:** Product Database 2.0's stored copy is readable with the public web key, without signing in.
    - **D-127:** an RM can re-open or close calls they cannot see (measured: an Unattended call of another team closed as Solved).
    - **D-128:** a review can be written on any call, even one that does not exist, and raises a Field Failure Report in the writer's name.
    - Also: D-129 (searching the review register zeroes its counts), D-130 (visits filed under the UCN alone are missed), D-131 (feedback read takes 12 s), D-132 (Product & Party Search can show another party), D-133 (three helpers callable without signing in), D-134.
  - **Masters (0325, merged in #513):**
    - **D-135:** renaming a party, part or product line first lets it be deleted while records name it, and skips the rename carry.
    - **D-136:** the guard misses Sold Through, Indoor consignees and five other columns.
    - Also D-137 – D-140.
  - **Indoor Service:**
    - **D-141:** a condemned, verified, PDT-signed job can be deleted outright.
    - **D-142:** anyone sharing the authoriser's name can read and approve a DC. Found by two readers.
    - Also: D-143 (renaming the authoriser strands their DCs), D-144 (approval silently puts back to Unsolved a call solved since), D-145, D-146.
  - **The dealer workflow (0328, mine, merged in #515):**
    - **D-147:** re-loading the Installation Calls register is refused for calls already raised on a dealer.
    - **D-148:** correcting a transfer leaves a no-sale machine on the old dealer.
    - **D-149:** "+ Installation call" is offered on every transfer and a second OT- call is not refused.
    - **D-150:** the screen decides "dealer" from the sale's copy, the database from the Party Master.
    - Also D-151 – D-153.
- **Checked and clean:**
  - 0325's keys each do one thing, and the buttons ask the keys the database asks.
  - The live project ends up the same as a fresh build after the edits to 0121 and 0286.
  - 0326's Country fill.
  - 0327: an issuer cannot approve their own DC, double approval is refused, no Indoor function is open to the web key, and the filed visit and spares pass the visit-first rule and the hand-stock cap.
  - 0328 → 0329 dropped no rule.
  - Every spare guard still carries all six rules.
  - `check:ui`, `check:dberror`, `check:reports`, `check:upserts`, `check:views`, `check:bundles` and `check:generated` pass.
- **New read-only check for the live project:** `supabase/apply/_review_findings_on_live_data.sql` says, in one grid, whether these holes have already left a mark — negative balances, import markers set by non-uploaders, reviews and Field Failure Reports on calls that do not exist, duplicate installation call numbers, and whether the stored copy is open to the web key.
- **Needs your decision:** D-104 (Renew against FRS-220.4) and D-142 (FRS-235.3 itself states the name match). Everything else has a stated fix that needs no decision.
- **Nothing in the code was changed.** The register, five requirement texts, this entry, the live-data check and the version are the whole change.

### 2026-10-03 — Sold Through is the dealer; the dealer's customer gets the installation call (v0.10.62, 0328)
- **Carried back and merged at your word** (*"Finish the work and merge it to main and deploy"*), after it had been taken out of the review branch for the dev branch; cherry-picked from `470855d`.
- **Your explanation:** *"Sold through -- it is to monitor the equipments sold through Dealer. Only party identified as dealer should be listed ... we can not have an installation call for a dealer ... we do a Ownership transfer and then generate an installation call from the ownership transfer entry ... OT-PRODUCT-SERIAL NO"*.
- **Your choices:**
  - A transfer's Sold Through is its From party when that party is a dealer.
  - The transfer's call is dated the transfer date.
  - The dealer rule is kept by the screen and the database.
  - All 249 Sold Through values 0318 cleared are restored.
- **Done (0328, sales_contracts):**
  - **Sold Through picker:** dealers only.
  - **No installation call for a dealer:** not offered on the entry or the Register line, and not counted pending. Refused by the database however it is raised (calls already raised are left).
  - **On a transfer:** Sold Through is stamped from a dealer From party, and the Product Database follows the latest dealer transfer, even when the sale is re-saved.
  - **+ Installation call on a transfer:** OT-PRODUCT-SERIAL, for the customer, dated the transfer date, built by the sale's own call builder, one per machine.
  - **0318 Sold Through restored, once:** where the line still follows its entry and the entry's value is blank or different.
- **Records:** URS-177, FRS-243 and OQ-235 are new, and `_status.sql` row 260 is added.
- **Tests:** suite `sold_through_dealer_test` is new, with new assertions in `check:cover-party` and `check:ui`.

### 2026-10-03 — Indoor DC: authorised and approved as the User Master says (v0.10.61, 0327, on the branch, not merged)
- **Your decision:** *"AJAY G (INDOOR) is mapped to VIGNESH and Bagyaraj.. it is dynamic based on the user master. So when I say RM / RGM / NSM - it should map as per the user Master"*.
  - The NSM is **the Regional Manager's own manager**.
  - The person named **sees and approves the DC whatever their role**.
- **Done, in 0327 (Indoor bundle):**
  - **Authorisers:** the issuer's Reporting Manager, their Regional Manager, and the Reporting Manager on the Regional Manager's own User Master row. Never the issuer, and no longer every `nsm` login.
  - **Visibility:** the person named reads that DC, its lines and its units, and nothing else of Indoor Service.
  - **My Workload** shows them *Awaiting my approval*. When their role cannot open Indoor Service, the card opens `/indoor-dc-approvals`. The DC print opens for them, limited by row-level security.
  - **Approval** files each unit's drafted visit and its spares **in the database**, in one transaction with the approval, so no call-report key is needed. A refusal (for example a spare the engineer does not hold) files nothing and leaves the DC pending.
  - **Only the approval** (or `record_indoor_visit`) marks a visit filed.
  - The issuer cannot approve a DC naming themselves.
- **Defects:** D-108, D-109 and D-110 are fixed.
- **Records:** FRS-234.3/.4 and FRS-235.1/.3/.6/.9 are amended; OQ-234 is new.
- **`_status.sql`:** row 253 moved with `approve_indoor_dc`; row 259 is new.
- **Suites:**
  - New: `indoor_dc_user_master_test`.
  - Updated: `indoor_stages_test`, whose Regional Manager now names an NSM, whose calls now exist, and whose approval files the visit.

### 2026-10-03 — Re-review: the 42 open defects re-checked, and a fresh pass over #476–#504 (v0.10.59, on the branch, not merged)
- **Your ask:** *"Re-review modules"*. Two halves:
  - Every defect still open in the register was re-checked against `main` at `bea2b69` (v0.10.49).
  - Everything other sessions merged from 1 to 3 October was read fresh: Warranty / Contract / Installation calls (#481–#502, 0318, 0319), and Indoor Service, Spares, Masters, Reports, Part Search and global search (#471–#504, 0308–0323).
- **Method:** five readers in parallel, each against a database built from all 337 migrations, with every write tried as a signed-in user on a throwaway copy. The two most serious claims were reproduced again before being recorded: 0318's cleared warranty and the Indoor DC approvers' missing keys.
- **The 42 open defects:**
  - **None** has been fixed by the recent merges.
  - **Four are partly fixed:** D-020 and D-025 (already said so), plus **D-053** (Department was saved before the defect was filed) and **D-068** (the permission mismatch is gone; the overwrite is not).
  - **Thirteen entries corrected** where the code had moved or the text was wrong: D-018, D-021, D-037, D-044, D-053, D-055, D-059, D-061, D-067, D-068, D-071, D-084, D-096.
  - Two are wider than written:
    - **D-037 / D-096:** every engineer reads, and can change through the API, every customer feedback row (`fb_read` / `fb_update` on `visit.feedback`, a child of `calls.report`).
    - **D-061:** a QMS document can also be deleted outright.
- **New, 21 defects (D-097 – D-117):**
  - **0318 (the one-time warranty update), already applied live on 2 October** — "3663 sale(s) updated from the Party Master; 17279 machine line(s) put back on their sale":
    - **D-097:** a machine whose sale entry holds no value lost its own value. Reproduced: warranty to 2027-12-31 under a stand-in entry, gone afterwards, from the Product Database too. The old values are in `sale_items_inherit_backup`. **`supabase/apply/_what_0318_cleared.sql` counts them per field on the live project** (read-only, one grid).
    - **D-098:** the same run rewrote Product Database rows from the sale, transferred machines' addresses included, with no backup.
  - **Indoor DC (0321, 0323):**
    - **D-107:** a unit can be dispatched past its DC and the approval.
    - **D-108:** the engineer can mark the visit filed with an older visit.
    - **D-109:** with the shipped role permissions, RM and RGM cannot open Indoor and NSM cannot file the visit, so only an administrator can approve.
    - **D-110:** an NSM can authorise and approve their own DC.
  - **Indoor records:**
    - **D-111:** a signed PDT can be changed and keeps its signature.
    - **D-112:** the register's Dispatch Date is the DC's issue date.
    - **D-114:** the cleaning gate rests on a browser-sent time.
    - **D-115:** the report number can be blanked.
    - **D-116:** the comments and handbook say the visit is filed at issue.
  - **Cover screens (read, not run in a browser):**
    - **D-099:** a newly saved machine still reads unsaved, and the installation-call bar can be wrong.
    - **D-100:** Renew and Convert use unsaved edits and drop them.
    - **D-101:** Convert can overlap a machine's own warranty and names the original buyer.
    - **D-103:** Register-tab pages have no tiebreaker.
    - **D-104:** Renew and Convert bypass the required fields.
    - **D-105:** serial-only keys in Renew and Convert.
    - **D-106:** Save writes back every field.
  - **Others:**
    - **D-102:** 0319 maps a call naming a different machine (from its own suite).
    - **D-113:** a stock transfer with a reason on some lines only is refused and leaves an empty header.
    - **D-117:** global search shows five hits per kind without saying there are more.
- **Checked and clean:**
  - 0317 against 0316: no rule dropped.
  - 0311 tick-box approval; 0309/0310 rename guards.
  - The print routes are key-guarded and use the company logo; signatures appear only for the right person.
  - The new definer functions are revoked from the web key.
  - 0319's once-only marker and its unmapped list's permission.
  - `_status.sql` gives no false NO.
  - The Reports fixes (#496) and the parent-key unticking (#490).
- **Needs your decision before anything is changed:**
  - D-097 / D-098: restore, and which address a transferred machine carries.
  - D-101: Convert's start date and party.
  - D-109 / D-110: who approves an Indoor DC, and may they approve their own.
- **Nothing in the code was changed.** This entry, the register, the probe and the version are the whole change.

### 2026-10-02 — High-rated batch 1: rules the screens kept, now kept by the database (v0.10.35, merged in #483)
- **Your ask:** *"Start with the next batch of items, Dont merge till i say so"*. Every open defect left is rated **High**, so this batch takes the ten whose fix needs no decision from you: the rule is already stated (by you, a requirement or the screen), and the fix makes the database or the screen keep it.
- **Fixed:**
  - **D-036 (0311):** only an Unattended or Unsolved call can be cancelled, by the database as well as the button; the batch cancel inherits it.
  - **D-042 (0312):** who booked a reconciliation line and who adjusted a line come from the signed-in session; with no session (a load) the given name is kept.
  - **D-043 (0313):** a rejection, a drop and a reassignment each need a reason on every path; Pending Dispatch and the Change engineer form refuse a blank one first.
  - **D-051, D-062 (0314):** material returns, stock transfers, training sessions, attendance and R&R periods are imaged in `record_audit`; returns and transfers also write an Audit Log entry.
  - **D-066 (0315):** the audit log is readable with *View audit log*, as the record trail already was.
  - **D-019:** Machine History reads every register whole and names one that refuses.
  - **D-026:** the printed Field Failure Report needs the register's key.
  - **D-045:** the challan and declaration read their stock out by number.
  - **D-070:** signing out (or a session ending elsewhere) clears the cached lists and menu counts.
- **Found while proving D-042, and fixed — D-083 (0316):** raising a consumption line's quantity has failed since 0196 with *"function public.handstock_available(text, text) does not exist"* — a function no migration ever defined. Reductions and voids worked, and no suite raised a quantity, which is how it lasted. The guard now reads the same balance the insert cap reads.
- **Two existing suites changed, because the rules they assumed changed:** `call_cancel_test` section 7 cancelled a re-opened call (now refused — the refusal is asserted and the ranking it was proving is kept); `spare_line_approvals_test` rejected and dropped lines with no reason (they carry one now).
- **One status row corrected:** row 60 counted every `record_audit` trigger in the database and expected 30; 0314 adds 15 more, so it would have read NO on a fully-applied project. It now counts the ten tables it names.
- **Left for a decision** (High, but each changes what somebody may do): D-055 and D-059 (deleting cover records and User Master rows), D-061 (overwriting a QMS revision), D-033 (vigilance defaults), D-037 (feedback scope), D-038 (PM batch), D-049 (who may transfer whose stock), D-060 (ownership transfer by serial), and the rest of the list.
- **Proved:** `high_batch_1_test` (all five migrations, each half of each rule, and run on a database WITHOUT 0311–0316 it fails in every section); the full `validate` run; `check:ui` (nine new assertions); `_status.sql` rows 237–242.

### 2026-10-02 — The Medium-rated defects, fixed (v0.10.24, merged in #475)
- **Your ask:** *"Fix all low impact items, keep it in the branch.. Don't merge till I say so."*
- **What "low impact" was taken to mean:** no open defect is rated Low, so it was taken as the ones whose requirements are all **Medium** — the lowest any open defect carries. Mostly screens showing a wrong count, date or message.
- **Fixed** (screens only, no SQL):
  - **D-022:** the potential-effect card opens what it counts.
  - **D-023:** Spare Insights' year follows the calendar.
  - **D-024:** the dashboard says when it uses the built-in SLA targets.
  - **D-040, all 7:** a + on loaded-only counts; Pending Calls tiles counted before their own filter; the Indoor register paged; failed reads stated on an opened call and on the open-call check; an edit link to an unloaded call fetches it; "every … has …" only to a reader who sees every record.
  - **D-046:** a failed Stock Out read is stated.
  - **D-047, all 4:** Spare Consumption marks its count and no longer re-filters rows the database scoped; Stock Transfer paged; the Hand Stock drawer says when it stops at 500; a searched .csv names its search.
  - **D-048:** the Hand Stock drawer's sum adds up.
  - **D-064:** day-first date boxes on Renew and Ownership Transfer; the stale renewal message corrected; the Document Library's Updated column formatted.
- **Not fixed, and why:**
  - **D-025's rest moved to D-035.** `reopen_call()` does not store a reason at all, so demanding one would be discarded, and the Field Call register re-opens without one.
  - **D-056 left open.** Refusing to delete a master value that is in use means checking every register that can carry it — a design change, not a small fix.
- **Proved:** `npm run build`, `check:ui` (the card-filter count is now 7, and the register reads the new one) and `check:orders` (171 order columns across 61 relations).

### 2026-10-01 — D-057 accepted as is (no code change)
- **Your decision:** *"Leave it as it is, it is that way for Ease of Operation."* The User Master keeps proposing one starting password for every new login, and the first sign-in does not force a change.
- **Recorded rather than left as a defect:**
  - URS-133, FRS-001, FRS-168 and OQ-161 now describe what the system does. They had claimed a forced change that does not exist, and FRS-001 cited a sheet-era forced change that D-074 removed.
  - Risk R-80's residual is now **High**. It had read Low on the strength of that missing control.
  - FM-69 lists no action and keeps its occurrence and detection scores.
- **The cost, stated so it stays a decision:** until a person changes it, whoever knows the starting password can sign in as them, and what is done under that login is not attributable to them.
- Handbook updated.

### 2026-09-30 — The admin-only actions are keys; only the Admin column is greyed (v0.10.16)
- **Your ask:** *"All Admin Actions that are greyed out now should be editable from the Role & Permissions. Only the Admin Role should be Greyed out not the Actions."* It reverses finding 65's "shown greyed, never tickable".
- **Ten keys, one per action:**
  - `review.correct_date`, `objective.lock`, `spare.reassign` and `users.reset_password`;
  - `bulk.upload`, `pm.bulk_upload` and `import.panel`;
  - `export.tables`, `export.schedules` and `audit.mode`.
  - Each sits on its page's row. The Admin column is the one greyed.
- **The database asks the same keys** (0302–0307), replacing `is_admin()` in the functions and policies behind them.
  - An administrator still passes. Nobody else holds a key until it is ticked, so nothing widens on the day.
- **Two rules that are not a straight swap:**
  - `users.reset_password` is not a child of Manage users. A holder who is not an administrator is refused an Admin's password, and the password of anyone holding rbac.manage, users.manage, users.manage.access or the reset key.
  - A review's completion date is now refused in the database without `review.correct_date`. The screen alone held it before (D-020, now partly fixed; recording the change, FRS-106.4, is still open).
- **Found on the way:** Review 1's date is not stored on `call_reviews` (it is derived), so only Review 2 and 3 are guarded. My first draft named `review1_at` and would have broken every review save; the new suite caught it before commit.
- **Proved:**
  - `admin_keys_grantable_test`: a non-admin role with the keys passes each gate, one without is refused, and the two password-reset refusals fire.
  - validate: 123 suites and 22 checks.
  - Also clean: `check:replay`, `check:views`, `check:status` (rows 228–233), `check:generated`, `check:bundles`, `check:ui` and the build.

### 2026-09-30 — D-074 fixed: one way in, and an unknown login holds nothing (v0.10.15)
- **Your ask:** *"Remove the demo sign-in and fix D-074."*
- **One way in.** The local sign-in, its seeded demo accounts and the stored hash of the old `service.almsind@gmail.com` password are gone from `src/lib/auth.tsx`. So is the sheet-era User Master sign-in (`auth.tsx`, `sheets.ts`). The copy an old browser holds (`rithi.db.users`, `rithi.session`) is deleted on load, because that copy carried the hash whatever the code said.
  - Without a Supabase connection nobody is signed in. The sign-in screen offers **Reconnect to the RITHI database**, since Settings is behind the sign-in.
  - `UsersAdmin.tsx`, dead since `/users` redirected to the User Master and the last caller of the local account functions, is deleted.
- **An unknown login holds nothing.** This is a login with no profile and no User Master row.
  - In the app, `can()` refuses it before anything else, it is given no role, and it sees one page saying the login is not set up, with Sign out.
  - In the database, `has_perm()` answers **FALSE** for it (0300). It is FALSE and not NULL because `if not has_perm()` skips on NULL. A super administrator is the one exception.
  - Field Solutions now asks for a profile to read or add an article (0301).
- **Measured:** on a database built without 0300/0301, such a login inserted a call request, a spare request and a Field Solutions article. With them, all three are refused. The engineer, the super administrator and the no-session paths are unchanged. `unresolved_login_test`, `_status.sql` row 227.
- **One remedy for a forgotten password:** the reset screen now says to ask an administrator, as the sign-in screen does.
- **Proved:** validate — 122 suites, 22 checks. Also `check:ui` (11 new assertions, one mutation-tested), `check:replay`, `check:views`, `check:status`, `check:generated`, `check:bundles` and the build.
- **Still true:** the old password is in git history. The system owner reported it changed on 2026-09-30; that is reported, not verified from here.

### 2026-09-30 — Findings 57–67 decided and built (v0.10.11, on the branch, not merged)

Your decisions, and what each became:

- **60 — "Manage users" can grant any key: as intended.** Closed by decision.
- **61 — anybody signed in adds a Field Solutions article: acceptable.** Closed by decision.
- **62 — downloads that skip the export permission: parked.** Stays open.
- **63, 64 — "It should show the Individual View's Control Action and its Check Box": keys of their own per screen.**
  Installation Calls get `install.*` and PM Calls `pm.*` (edit and its four sections, re-allocate, report,
  file a visit, cancel, re-open; PM also create), Field calls `calls.reopen` and `calls.report.visit`.
  The Contract Register gets `contract.edit`; the Objective page `objective.manage`; chart sharing
  `charts.share`; validation results `validation.manage`; shared table layouts `layouts.share`;
  the 2.0 rebuild `pd2.rebuild`; returning stock for another engineer `stock.return.others`.
  Every row now lists every key its buttons test, a key of another module included (a call register
  shows Request spares and Reco), and `check:ui` fails a screen that tests a key its row does not show.
  Each screen asks the key the database asks (0287–0297). **0298 copied every new key once** to exactly
  the roles and people holding the key it replaced, so nobody gained or lost anything on the day.
- **65 — admin-only actions listed, greyed.** Nine rows (bulk uploads, PM bulk upload, the Data Import
  panel, table export and export schedules, Audit Mode, password reset, changing a spare request's engineer,
  correcting a review date, locking an objective month): ticked for Admin, disabled for everyone.
- **66 — ticks that did nothing, fixed.** `dashboard.view` and the User Access page are gone (0298 removes
  them from every role); `reports.view` moved to the rows that test it; `masters.view` shown only where it
  governs reading (Warranty, Contract, Machine History, 2.0); Admin config now opens SLA Targets, the Call
  Registration desk and the Frequent Failure rule, which the database already allowed it.
- **67 — "Break it down".** Manage users → details, create logins, disable/delete, assign roles & permissions,
  Settings. Edit masters → records, KYC, rename a part, swap the Serviceman. Edit sales/warranties → entries,
  delete an entry; contracts the same. Each register's Report key → file a visit, book spares on a visit, record
  feedback on a visit. The Tracker's delete is its own tick. The old key is the PARENT (0286, `perm_parents`, read
  by `has_perm()` and `can()` alike), so a role holding it keeps everything until you untick it and pick.
  **Resetting a password stays an administrator's** (65).
- **57, 58, 59 fixed.** Pending Registrations' editor applies the register's section locks and never edits a closed
  call; SLA Targets is gated on Admin config and a refused save says so (it read "saved"); an Indoor unit cannot be
  set to Dispatched or Closed without the dispatch right (0297).

**Found while building it, and closed:** a login could be created WITH ANY ROLE, Admin included, by anybody holding
"Manage users" — the role guard fired on updates only. It fires on insert now: "Create logins" makes an Engineer, and
any other role, or the role a User Master row grants at first sign-in, needs "Assign roles & grant permissions".

Proved by `permissions_by_screen_test` as signed-in users; `npm run validate` 118/118 suites, 22/22 checks, the
replay check included. `_status.sql` rows 214–225. **Not merged.**

### 2026-09-30 — Software Validation Rev 3.0: every page read, every action given a requirement (v0.10.7, on the branch, not merged)
- **Your ask:** read every page, list every action, update the requirements, then everything downstream (risk, DFMEA, tests), and add data flow charts.
- **Inventory** — [`docs/CAPABILITY_INVENTORY.md`](CAPABILITY_INVENTORY.md): 1,072 actions across every screen, each with the line it was read from and what guards it. Before this, 474 had no requirement stating them and 309 were only partly stated. The document ends with where each gap is now stated.
- **Package** (`src/lib/validation.ts`), now 166 URS, 215 FRS, 216 tests, 104 risks, 93 DFMEA rows and 75 defects:
  - added 87 URS, 121 FRS, 126 tests, 61 risks, 61 DFMEA rows and 58 defects;
  - folded duplicates first (three "every download is authorised" requirements, two "a register says how much it shows", two old-review loads, two Excel-export defects);
  - applied 27 corrections to existing requirements, tests and the CW/SR documents that the reading proved false (e.g. FRS-064 said a re-open reason is recorded — it is discarded; URS-024 said balances cannot go negative; FRS-017 said feedback is scoped like calls; CW-020 still said Product Database 2.0 follows row-level security).
- **Traceability:** every URS has an FRS and a test, and every FRS has a test. Requirement Coverage reads 0 of 64 screens and 0 of 115 actions unnamed. `MODULES_WITHOUT_REQUIREMENT` is now empty.
- **What is still false, said as such:** 53 defects are open, and 68 tests say they are expected to fail until their defect is fixed. Among them:
  - Excel downloads skip the export permission (D-018);
  - approver, receiver and consumption-author names are taken from the browser;
  - Additional Entries cannot be saved from their screen;
  - an ownership transfer moves every machine sharing the serial;
  - closed calls can be cancelled through the API;
  - feedback is not scoped in the database;
  - Data Export and uploads leave no audit entry.
- **Your decisions, built (0269):**
  - Auto review is a person's switch. Its answers carry the switcher's name and an auto marker, and it never touches a started Review 2.
  - Who may switch it was two names in 0269; **0285 makes it a role — Admin, NSM, Technical Support** (the user, 2026-09-30), and takes the by-name grant back. For Technical Support it is the role's one write.
  - Old reviews load as imported and raise no FFR.
  - FFR CAPA starts blank.
  - "9:15" is no longer in the documents.
- **Data flows:** four flows are defined in the package and drawn in Software Validation (Data Flows) and How RITHI Functions: a call through to feedback, Daily Review → FFR → Objective, hand stock, and a sale to cover and PM. `check:ui` fails any step citing a screen, requirement or test that does not exist.
- **Fixed on the way:**
  - The two traceability tabs shared a key, and one claimed every requirement was covered (D-073).
  - **A plaintext password for `service.almsind@gmail.com` sat in a comment in `src/lib/auth.tsx`.** It is removed from the file but remains in git history, and the stored hash is short enough to reverse. **The system owner changed that password on 2026-09-30** (reported, not verified from here). The local demo sign-in still admits the old one; removing that path is the open half of D-074.
- **Proved:** validate with every suite and check; `check:ui`, `check:uploads`, `check:generated`, build. The document generators were re-run: REQUIREMENTS.md, REQUIREMENT_COVERAGE.md, DATABASE_SCHEMA.md.
- **Not verified:** the inventory was built by reading code, not by running it on live; the open defects are unconfirmed on live data.

### 2026-09-30 — 20, follow-up (v0.10.7, on the branch, not merged): "Cleared for Stores Processing" is a yes
- **Your word**, after 0256 went live: *"'Cleared for Stores Processing' - These values should be considered as Approved."*
- **0270** adds the phrase to the yes words in `spare_line_stage`.
  - Whole phrase, any case, any spacing between the words. "Not cleared for stores processing" still waits.
  - Nothing stored is rewritten.
  - Open lines are restaged, so lines 0256 held for this phrase move FORWARD: to the next approver still needed, or to Stores.
- **Also updated:**
  - the client `APPROVED_RE`, which `check:ui` still compares with the SQL character for character;
  - the upload keeps the phrase as written;
  - `_approval_words.sql` no longer lists it as unusual;
  - `_status.sql` row 199 also tests the phrase and the longer sentence.
- **Proved:** `spare_approval_whole_word_test` now includes the phrase, three spellings of it, and three near misses. A line 0256 held at RM Approval moves to Stores with its words kept. The suite fails on a database without 0270.
- **Renumbered 0263 → 0266 → 0268 → 0270** after merging main, which took 0263, 0266 and 0268 in the meantime. validate: 114/114 suites, 22/22 checks.

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
