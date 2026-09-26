# Module review — status and log

The running record of the module review: **what is done, what is pending, and
what happened when**. Updated with every batch. Evidence for each finding is in
[`MODULE_REVIEW.md`](MODULE_REVIEW.md), and the fix for each is in
[`MODULE_REVIEW_HANDOFF.md`](MODULE_REVIEW_HANDOFF.md). This file is the index,
not the argument.

_Last updated: 2026-09-26. `main` at `162c107` (v0.9.375), deployed._

---

## Status at a glance

| | Count | Findings |
| --- | --- | --- |
| ✅ **Fixed and live** | **21** | 1, 2, 3, 5, 6, 9, 16, 17, 18, 19, 21, 22, 24, 25, 28, 29, 30, 33, 41, 45, 46 |
| ◐ **Partly fixed** | **3** | 15, 31, 32 |
| ⏳ **Open** | **22** | 4, 7, 8, 10, 11, 12, 13, 14, 20, 23, 26, 27, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44 |
| | **46** | |

**Everything fixed so far is front end only. No SQL has been changed, so
nothing needs running on the live project for batches 1–3.**

---

## Pending — grouped by what it needs

### A. Needs a decision from you (and usually SQL)

| # | Screen | The decision |
| --- | --- | --- |
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
