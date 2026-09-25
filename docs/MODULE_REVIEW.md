# Module-by-module review — findings

A screen-by-screen read of every module in `MODULES`, recording **bugs only**:
something that produces a wrong answer, hides a right one, or contradicts a rule
this project has already written down. Style preferences and "could be nicer"
are not here.

**How to read a finding.** Each says what is wrong, *how it fails* (the concrete
path that produces the wrong output), and **how it was established** — read from
the code, measured against a database, or reasoned about. The last one is the
weakest and is labelled as such, because this repository's own history says a
plausible reading is how wrong answers get shipped.

**This is the record; the repairs are separate changes**, each with the check or
suite that would have caught it. One has landed since: **24 is fixed on `main`**
(`1bf248e`). Every other finding (1–23, 25–46) was still true at the latest
re-review.

**Batch 1 of fixes (2026-09-25, v0.9.373, on this branch, not yet on `main`):**
2, 3, 9, 28, 29, 30, 33, 41 and 46 are fixed; 31, 32 and 45 are fixed in part
(the table says which part). Each is marked in the table below. No SQL was
changed.

**Batch 2 (2026-09-25, v0.9.374):** 1, 6, 16, 17, 19 and 25 are fixed; 21 is
fixed in part. Batch 1 is merged into `main` (#421) and deployed.

**Re-reviewed again on 2026-09-24 against `main` at `ee732f4`** (then `4a75371`, two
commits to one hand-run file, re-checked for finding 39), after 21 more
commits (88 files, about 10,800 lines):

- **All 31 open findings (1–23, 25–32) still hold.** Each buggy line was found
  by content. 20, 23, 28, 30 and 31 were measured again, on a database built
  from all 265 migrations.
- **All seventeen project checks pass** on the merged tree. So, as before,
  everything new below is in the gap those checks don't cover.
- **A fresh pass found 33–46.** Most of the serious ones are in the new
  **Product Database ownership** logic (0235–0240): who owns a machine, and what
  cover it shows. Every candidate was checked again before it went in. Two turned
  out to be deliberate design and are recorded as questions; a few that could
  not be re-checked are listed as such. See *Found by the second re-review*.

**Re-reviewed on 2026-09-23 against `main` at `092448e`.** Two things:

- **Every one of findings 1–27 was re-checked** against the code as it stands.
  For each one, the buggy code was found by content, not by line number. Three
  (13, 20, 23) were measured again on a database built from all 257
  migrations. 26 still hold. 24 is fixed.
- **A fresh pass** over what the first review missed, and over what `main`
  added since. It found **28–32**. Three of those five are one fault: a write
  that the row-level security (RLS) policy quietly matches to **zero rows**.
  PostgREST reports that as success, not an error, so the screen says "saved"
  over a write the database threw away. Findings 30 and 31 were **measured**:
  signed in as the role, the UPDATE came back with no error and changed zero
  rows.

**Baseline.** Every finding was established against `a657d7d` (`main`,
2026-09-21) and **re-verified after merging `1be01d0`** — the 21 commits `main`
gained while this was being written. On both, `npm run typecheck` passes and so
does every check: `check:ui`, `check:uploads`, `check:dberror`, `check:paging`,
`check:picklist`, `check:mapping`, `check:generated`, `check:bundles`,
`check:safe-updates`, and the database-backed `check:views`, `check:orders`,
`check:reports`, `check:upserts`, `check:status` (182 rows, 1 skipped for
pg_cron) and `check:replay` (23 bundles). So everything below is in the gap those
seventeen checks do not cover — which is the gap this project keeps finding
things in.

**A line number is a hint; the symbol is the citation.** `main` is moving under
this document — five times while it was being written, three of them into
`src/lib/supabase.ts`, which gained about a hundred lines in the middle across
those merges. Line numbers into a live file rot that fast. So reads in
`supabase.ts` are cited by **function name** with the line as `~:NNN`, which
survives a shift; everywhere else, the quoted "current" snippet identifies the
code. **If a number is off by a few, search the snippet.**

Corrected so far, none of which changed a finding: `sheets.ts:157-158` →
`:164-165`, `CallReporting.tsx:410/:447` → `:414/:451`, and the `supabase.ts`
reads re-anchored to their functions and re-checked on each merge. `main`'s edits
in that window were Drive-folder routing, an index fix on `sbListPartyItems`, and
a cover lookup that now keys on product **and** serial rather than the serial
alone — none of them touches anything recorded here, and none of them fixes it.

| # | Module | What | Severity |
| --- | --- | --- | --- |
| 1 | My Workload | "Awaiting me" is counted before the access scope exists, and never recounted — **FIXED in batch 2 (v0.9.374)** | High |
| 2 | Dashboard | "Engineers Active" is capped at 6 by the chart's own `slice` — **FIXED in batch 1 (v0.9.373, this branch)** | High |
| 3 | Dashboard | Two KPI cards say "most recent 300" over a number that is the whole register — **FIXED in batch 1 (v0.9.373, this branch)** | Medium |
| 4 | Dashboard | A private date parser, month-first, where the project has one day-first parser | Medium |
| 5 | Product & Party Search | A machine search stops at 200 rows and says nothing | Medium |
| 6 | Field Failure Register | The Word report can never carry a signature — the handler was frozen before it loaded — **FIXED in batch 2 (v0.9.374)** | High |
| 7 | *cross-cutting* | Four workbooks and every register CSV carry the wire value, not the date (**measured**) | High |
| 8 | *cross-cutting* | Seven paged reads page with no `order()` | Medium |
| 9 | Daily Complaint Review | "To be Reviewed" counts its list against the whole register — **FIXED in batch 1 (v0.9.373, this branch)** | Medium |
| 10 | Daily Complaint Review | Two deep loads can interleave; the last writer wins and may be the tab you left | Medium |
| 11 | KPI & Failure Analysis | The product chip narrows one KPI card and not the two beside it | Medium |
| 12 | KPI & Failure Analysis | Cover tiles bucket by substring, and the two patterns overlap | Low (latent) |
| 13 | Spare Insights | The date window is a UTC day, the reader's is an IST one | Low |
| 14 | Spare Insights | "By product" is the top 25 and does not say so | Low |
| 15 | *cross-cutting* | Nine paged reads order by a column that is not unique — rows doubled and dropped (**measured in Postgres**) | High |
| 16 | *cross-cutting* | Five auto-refreshers test a filter flag frozen at the first render, so they overwrite a filtered view — **FIXED in batch 2 (v0.9.374)** | Medium |
| 17 | *cross-cutting* | Three screens tell everybody "everything is done" from a list that is filtered, scoped and capped — **FIXED in batch 2 (v0.9.374)** | Medium |
| 18 | Field Call Register | A search reports its capped 1,000 as the match count; ↻ Refresh claims "Loaded all" over 800 | Medium |
| 19 | Customer Feedback | The Uploaded / Entered-here chips count only the loaded page, with no `+` — **FIXED in batch 2 (v0.9.374)** | Medium |
| 20 | Spare Requests | "Not Approved" reads as **approved** — a refused line reaches the dispatch queue (**measured**) | High |
| 21 | Hand Stock · Pending Dispatch | More chips counting one page as if it were the register — **PART-FIXED: every chip and count named, except Pending Dispatch's per-engineer totals (batch 2, v0.9.374)** | Medium |
| 22 | Spare Requests · Spare Consumption · Customer Feedback | The 30-minute auto-sync throws away every page but the first | Medium |
| 23 | User Master | Correcting somebody's name silently empties their team (**measured**) | High |
| 24 | Roles & Permissions | Unticking every box and saving **grants** the role its code defaults (**measured**) — **FIXED on `main` by `1bf248e`** | ~~High~~ |
| 25 | Stock Out | An exact count over a read that is paged and capped, under a comment saying it is not paged — **FIXED in batch 2 (v0.9.374)** | Medium |
| 26 | Call Reporting | A visit dated on the form is stored at UTC midnight and reads back at 05:30 (**measured**) | Medium |
| 27 | Data Export | Every table is paged with no `order()` — a copy that can double and drop rows | High |
| 28 | Material Returns | Two lines of one MRN can get the same screen row id, so the table draws one and drops the other (**measured**) — **FIXED in batch 1 (v0.9.373, this branch)** | Medium |
| 29 | Warranty & Contract Registers | Renew opened before the machines load starts with none ticked, and never updates — **FIXED in batch 1 (v0.9.373, this branch)** | Low |
| 30 | Request Registration | "Correct this request" says *corrected* when the database changed nothing (**measured**) — **FIXED in batch 1 (v0.9.373, this branch)** | High |
| 31 | Warranty Register | "+ Installation call" creates the call, silently fails to link it to the machine, and offers a second one (**measured**) — **PART-FIXED: the failure is now reported; hiding the button is still a decision (batch 1, v0.9.373)** | High |
| 32 | My Workload | "Installations waiting on Commercial": the card's number and the list it opens disagree, and the read is not paged — **PART-FIXED: the cards add up; the unpaged read is still open (batch 1, v0.9.373)** | Medium |
| 33 | Hand Stock Report | The .xls download writes `[object Object]` in every date column (**measured**) — **FIXED in batch 1 (v0.9.373, this branch)** | High |
| 34 | Product Database | Four roles see machines under contract as **OGP**, with no contract number (**measured**) | High |
| 35 | Product Database | A machine's owner follows the transfer **entered** last, not the one **dated** last (**measured**) | High |
| 36 | Product Database | Editing an older sale writes that sale's warranty onto the current owner's machine (**measured**) | High |
| 37 | Product Database | Correcting a serial leaves a phantom machine; deleting a transfer blanks the owner (**measured**) | Medium |
| 38 | Bulk Uploads | A 500-row transfer batch now takes 12.5 s of the 20 s limit, and grows with the register (**measured**) | Medium |
| 39 | Hand-run SQL | The Item Status correction would send AMC spares past Commercial and NSM if applied (**measured**) | High |
| 40 | Hand-run SQL | Four new probes return 2–3 result grids; the SQL editor shows only the last (**measured**) | Medium |
| 41 | Hand Stock Report | The menu entry asks for `admin.view`, the page asks for its own key, so a role granted it has no way in — **FIXED in batch 1 (v0.9.373, this branch)** | Medium |
| 42 | *cross-cutting* | Excel and .xls downloads never check `export.data`; only CSV does | Medium |
| 43 | Request Registration | A request can now be filed with its calls against two different customers (CR-007) | Medium |
| 44 | Calls | Batch cancel exists only in SQL, where it records nobody as the canceller | Low |
| 45 | *cross-cutting* | The half-loaded-download warning gives advice that cannot be followed, or is missing where it is needed — **PART-FIXED: RM Approval and the advice; capped searches still export without a warning (batch 1, v0.9.373)** | Low |
| 46 | Hand Stock Report | A manager's file says "your own stock only" and holds the team's — **FIXED in batch 1 (v0.9.373, this branch)** | Low |

---

## 1 — My Workload counts "Awaiting me" against an empty team, every time

**Where** `src/modules/Workload.tsx:45-82`

**What is wrong.** The page builds `mayRmApprove` from `useAccessScope()` and
hands it to `spareRequestSection`, which uses it through the register's own
`actionable()` to count the ⚡ *Awaiting me* card. But the load is fired from
`useEffect(() => { load(); }, [])` — once, on mount — while `useAccessScope()`
returns `EMPTY` on that first render **and resolves afterwards**.

**How it fails.** `EMPTY` is `{ ready: false, reports: [], selfName: '' }`
(`src/lib/access.ts:45`), so the closure is built with `self = ''` and an empty
`team`:

```ts
const who = norm(engineer);
if (!who) return true;
if (self && who === self) return false;   // self is '' — never fires
return team.size ? team.has(who) : true;  // team is empty — always true
```

Every line sitting at **RM Approval** therefore counts as actionable
(`spareflow.ts:140`), so a Reporting Manager's *Awaiting me* is the whole
company's RM queue — other regions' engineers included — and their **own**
request is counted as something they may approve, which the register refuses.

**Why it is every time, not a race.** `useAccessScope`'s own effect is registered
first (it is called at `Workload.tsx:35`, before the `useEffect` at line 82), but
for anyone who is not an admin or an office role it finishes inside
`loadUserMaster().then(...)` — a microtask that cannot run until React has
flushed the whole passive-effect list, `load()` included. The User Master promise
being cached (`access.ts:48`) does not help: a resolved promise still defers its
`.then`. And nothing re-runs `load` — the `useMemo` at line 57 does depend on
`mayRmApprove`, but the effect that calls it has `[]` deps.

**The register does not have this bug**, which is what makes it a bug rather than
a design: `SpareRequests.tsx:821-843` recomputes through `useMemo` on
`[scoped, …, mayRmApprove]`, so it corrects itself the moment the scope lands.
Two screens, the same helper, different answers — the thing `workload.ts:60-63`
says it exists to prevent ("a count that disagrees with the register it links to
is worse than no count").

**Established by** reading the code and React's effect/microtask ordering. Not
measured against a running app.

---

## 2 — The Dashboard's "Engineers Active" can never exceed 6

**Where** `src/modules/Dashboard.tsx:110` and `:146`

```ts
const topEngineers = useMemo(() => topCounts(all, 'allocatedTo', 6), [all]);
…
<KpiCard label="Engineers Active" value={topEngineers.length} … />
```

**How it fails.** `topCounts` ends in `.slice(0, n)` (`Dashboard.tsx:43`), so
`topEngineers` is the *Top 6 chart's* data, length ≤ 6. The KPI card beside it
reads that length as a headcount. With seven engineers or seven hundred, the card
reads **6**. It is only ever right on a company with five or fewer engineers, and
it is wrong in the direction nobody questions — a small plausible number.

The chart on the same screen is labelled "Calls by Engineer (Top 6)", so the
value is available honestly two lines away; the distinct count wanted here is
`new Set(all.map(r => g(r,'allocatedTo')).filter(Boolean)).size`, which is how
the card immediately above it counts parties (`:116`).

**Established by** reading the code. Certain — it is arithmetic on a `slice`.

---

## 3 — "most recent 300" on two cards that are showing the whole register

**Where** `src/modules/Dashboard.tsx:138-139`

```tsx
<KpiCard label="Field Calls" value={fieldS.length} … sub="most recent 300" />
<KpiCard label="Installation Calls" value={instS.length} … sub="most recent 300" />
```

**How it fails.** The load is `listFieldCalls('', 0, 'FIELD')`, and
`sheets.ts:164-165` turns a `0` limit into `sb.listCalls(type, 100000)`, which
**pages** in 1,000-row blocks (`supabase.ts`, `listCalls()`). So the value is the entire
register — tens of thousands — under a caption promising 300. A reader who takes
the caption at its word reads the two biggest numbers on the page as a sample of
300 and divides accordingly.

This is the counting rule in CLAUDE.md pointing the other way: the numbers are
*exact* and correctly carry no `+`; it is the caption that is stale. Either drop
the `sub`, or say what it is ("every call on the register").

**Worth noting beside it** (not a bug, a cost): the same lines mean opening the
Dashboard pulls up to 100,000 rows in ≥2 sequential paged sweeps — 20+ round
trips before the first chart, on a screen whose aggregates are all `group by`
questions a view could answer in one.

**Established by** reading the call chain `Dashboard → listFieldCalls →
listCalls`. Certain.

---

## 4 — The Dashboard has its own date parser, and it reads month-first

**Where** `src/modules/Dashboard.tsx:21-28`

```ts
const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})/);   // 24-October-2025
…
const d = new Date(s);                                  // everything else
```

**How it fails.** `new Date('09-10-2026')` is **month-first** in every JS engine
(9 October → 10 September), and `new Date('10/09/2026')` likewise. CLAUDE.md's
rule is explicit and has a history behind it: *"Every importer reads dates
through `src/lib/dates.ts` (day-first, always) … Do not add a private `toDate` …
to a module — there used to be four date parsers and they had started to
disagree."* This is a fifth.

It decides **Calls This Month**, the **last-6-months** column chart and the
ordering of **Recent Calls** (`:97`, `:105`, `:113`). A day-first value that is
also a valid month-first date does not fail — it lands in the wrong month
silently, which is the only outcome worth worrying about.

Whether it bites today depends on what `regDate`/`complaintDate` actually carry
on the live project: an ISO `yyyy-mm-dd` from Supabase parses correctly, a
`dd/mm/yyyy` from the sheet-era path does not. `parseAnyDate()` in `dates.ts`
already answers this question day-first for the rest of the application.

**Established by** reading the code against the documented rule. The *consequence*
is conditional on live data shapes and has NOT been measured here — the honest
statement is "this parser disagrees with the project's parser", not "the chart is
wrong today".

---

## 5 — A machine search stops at 200 and presents it as the answer

**Where** `src/modules/Lookup.tsx:144`

```ts
const rows = await searchProducts({ product, serial, exact }, 200);
```

**How it fails.** The result table renders `found` with no total, no `+` and no
"showing the first 200" — so a product with 2,547 machines (CLAUDE.md names that
exact figure for ORION-G) answers with 200 rows that look like all of them. A
reader scanning for a serial that sorts past the cap concludes the machine is not
on the register.

This is the same shape as the incident CLAUDE.md records **on this screen** ("the
serial picker offered 1,000, and a real serial read as *Nothing matches*"). The
serial *picker* was fixed — `sbListProductSerials` is paged — and the machine
*search* beside it was not. `check:ui`'s `.limit(n > 1000)` rule cannot see this:
200 is under the cap, so nothing reads as a truncation, which is precisely the
blind spot CLAUDE.md describes for the 300-row Pending Registrations case.

**Established by** reading the code. The row counts are CLAUDE.md's, not measured
here.

## 6 — The FFR Word report can never carry a signature

**Where** `src/modules/FieldFailureReport.tsx:157-197` (the `columns` memo) and
`:199-215` (`doc`)

**What is wrong.** The 📄 Word button's handler is built inside a
`useMemo(..., [])`. That array is empty, so the render functions are created
**once, on the first render**, and they close over the `doc` binding of that
first render — which in turn closes over `mySig` and `user` as they were then.

**How it fails.** `useMySignature()` (`src/lib/signature.ts:22-35`) returns
`null` and fetches asynchronously. On the first render it is therefore
**always** `null`, so the captured `doc` computes

```ts
const signature = signatureBelongsTo(raisedBy, user) ? (mySig?.signature ?? '') : '';
```

as `''` for ever, for everybody, including the raiser pressing the button on
their own report. The document prints an empty signature block; the audit row
records `meta: { signed: false }` every time, so the log agrees with itself and
nothing looks wrong. `user` is captured the same way, so if the auth context has
not settled on the first render the `signatureBelongsTo` test is false as well —
a second, independent reason for the same outcome.

This is not the "print unsigned rather than not at all" rule the file describes;
that rule is about somebody ELSE printing the report. The raiser's own copy is
supposed to carry it, and cannot.

**Established by** reading the code. The mechanism is a `useMemo` with `[]` deps
capturing a `const` from the first render — certain by the language's rules, not
by React's scheduling. Not exercised in a browser here.

**The Delivery Challan does it correctly**, which is what shows this is a bug
rather than the rule: `DeliveryChallan.tsx:96-97` computes
`signatureBelongsTo(doc.dispatchedBy, user) ? mine : null` **in the render body**,
so it recomputes the moment `useMySignature()` resolves. The same two helpers,
one frozen and one not.

---

## 7 — Four workbooks and every register CSV carry the wire value, not the date

**Where**
`src/modules/UnusedSpareReport.tsx:89`, `src/modules/ProductFailureAnalysis.tsx:208,537`,
`src/modules/FieldFailureInsights.tsx:265,411`, `src/modules/Objective.tsx:356`,
and `src/lib/format.tsx:143-158` (`csvExport`)

**What is wrong.** `xlsxCell()` is the helper that turns a value into a real
Excel date (a serial plus a style) — and `buildXlsx` does **not** apply it.
`sheetXml`'s `cell()` (`src/lib/xlsx.ts:138-149`) only recognises a value that is
*already* an `XlsxDate` object, and writes everything else as an inline string.
So the shaping happens only where the caller does it, and three callers do:
`ReportBuilder.tsx`, `Reports.tsx`, `SolvedWithoutReport.tsx`. **Four do not.**

**How it fails — measured, not reasoned.** A workbook was built both ways from a
row exactly as PostgREST sends it for the "Not Consumed Against this Call"
report, and the bytes read back:

```
--- raw rows (UnusedSpareReport) ---
  Dispatched On : <c r="B2" t="inlineStr"><is><t xml:space="preserve">2026-09-18</t></is></c>
  Qty Sent      : <c r="C2"><v>2</v></c>
  Serial No     : <c r="D2" t="inlineStr"><is><t xml:space="preserve">0012345</t></is></c>
--- through xlsxCell (ReportBuilder) ---
  Dispatched On : <c r="B2" s="2"><v>46283</v></c>
  Qty Sent      : <c r="C2"><v>2</v></c>
  Serial No     : <c r="D2" t="inlineStr"><is><t xml:space="preserve">0012345</t></is></c>
```

`t="inlineStr"` is text. So **Dispatched On**, **Received On** and **Call
Registered** (`reports.ts:193-199`) arrive in Excel as strings that cannot be
sorted into order, filtered by month, subtracted or re-formatted — and each of
those operations returns something wrong rather than refusing, which is the
whole argument in CLAUDE.md for the fix that went into `ReportBuilder`. This is
the same user-reported fault ("those Date Fields are not Complaint with the Long
Date Format of Excel"), in the fourth export screen, still there.

The numbers are fine, and the identifier is fine: `0012345` keeps its leading
zeros in both. It is only the dates.

**And the CSV side is wider than the workbooks.** `csvExport` writes
`String(r[c.key])` — no `formatDayTime`, no `xlsxText`, nothing. It is the ⭳
Export button on **26 registers**. The Field Call Register is the clearest case:
its columns render `fmtLongSmart(r.regDate)` on screen (`FieldCalls.tsx:235`)
and export `r.regDate` raw, because `csvExport` takes the key and never the
`render`. The screen says `18-Sep-2026`; its own export says something else.

**Established by** building the workbook and reading the bytes (the project's own
method) for the .xlsx half; by reading `csvExport` and one call site for the CSV
half. What each individual register's raw values look like was NOT enumerated —
the columns cast `::date` in a view come out as `2026-09-18`, while a bare
`timestamptz` comes out as `2026-09-18T08:51:02.55+00:00`, and which is which is
per column.

---

## 8 — Seven paged reads page with no `order()`

> **Six still open (2026-09-25).** `sbSearchProducts` was fixed on `main` by
> `8eee917` and now orders by `created_at desc, id desc`. The other six were
> re-checked by name and still name no order.

**Where** `src/lib/supabase.ts` — `distinctColumn()` (~:794), `sbSearchProducts()`
(~:1439), `listDirectoryAsUsers()` (~:2427), `sbEngineerNames()` (~:2568),
`countCallReviews()` (~:2702), `reviewPickLists()` (~:2733), `listCallReportReviews()`
(~:4652)

**What is wrong.** `paging.ts:19-22` states the rule: *"ORDER IS NOT OPTIONAL
WHEN PAGING. Without one, PostgREST may return page 2 overlapping page 1 and a
row is then dropped or doubled, which is worse than truncation because it looks
complete."* Every caller of `allRows()` obeys it. These seven are hand-rolled
`for (let from = 0; …) … .range(from, from + PAGE - 1)` loops that never go
through `allRows`, and none of them names an order.

**How it fails, per read** — a dropped row is the harmful direction in each:

- `countCallReviews` produces the **exact total** the DCCR header boasts about
  ("The count is EXACT — countCallReviews walks every page"), and the register is
  being written to by reviewers while it walks. A row that moves between pages is
  counted twice or not at all, in the one number on the screen that is presented
  as beyond doubt.
- `listCallReportReviews` is keyed by UCN and its own comment says a missed row
  means "a reviewer whose call sat at position 1001 would see it as un-reviewed
  and review it twice". Paging fixed the cap; without an order it did not fully
  fix the symptom.
- `listDirectoryAsUsers` is the **User Master**, and `access.ts` builds the
  manager → reports tree from it. A dropped row is an engineer who vanishes from
  their manager's team — the same outcome as the blank-name bug 0212 repaired,
  from a different cause.
- `distinctColumn`, `sbEngineerNames`, `reviewPickLists` each build a `Set`, so a
  duplicate is harmless and a dropped row silently removes a value from a
  pick-list — a name or product that "is not in the list" while its rows exist.
- `sbSearchProducts` is a single ranged request rather than a loop, so the risk
  is only that "the first 200" is an arbitrary 200 (see finding 5).

**Established by** a script over `src/lib/*.ts` that walks back from each
`.range(` to the start of its statement and reports the chains with no
`.order(`, then reading each hit in context (two false positives —
`listOwnershipTransfers` and `listAdditionalEntries` — were checked and do carry
an order). Whether Postgres actually reorders rows for these particular queries
was NOT measured; the claim is that nothing makes it stable, which is what the
project's own rule says is enough.

**No check covers it.** `check:orders` validates that the column an order NAMES
exists in the database; it cannot see a read that names no order at all.

---

## 9 — "To be Reviewed" counts its list against the whole register

**Where** `src/modules/DailyCallReview.tsx:466` and `:674-678`

```ts
const inView = (deskStage || status) ? statusCount(deskStage || status) : counts.total;
```

**How it fails.** `deskStage` is set only by the **Review 2 Pending** and
**Review 3 Pending** tabs. On the **To be Reviewed** tab it is `''`, and that tab
deliberately ignores the Review Status box (`:295` — `todo ? undefined : status`).
So `inView` falls through to `counts.total`: the Calls pane header reads
`175+ of 4,100` — the worklist's rows against the whole year's register. It reads
as 3,925 calls still to load.

The right number is already computed and already on the screen: `counts.solvedPending`,
counted in the same sweep for exactly this tab (`supabase.ts`, `countCallReviews()`), and used
correctly on the tab's own badge at `:647`. Only the pane header misses it.

There is a second, narrower version of the same fault: if the reviewer HAS set
the Review Status box and then opens To be Reviewed, `status` is truthy, so
`inView` becomes that stage's count — a number the tab's rows deliberately do not
honour.

**Established by** reading the code. Certain, given `deskStage === ''` on that tab.

---

## 10 — Two deep loads can interleave, and the last writer wins

**Where** `src/modules/DailyCallReview.tsx:334-396` (`load`) and `:412-417`

**What is wrong.** `load()` has no cancellation. The filter effect clears its
**timeout**, but a `load` already running keeps going — and on the desk tabs it
is a loop of up to twenty sequential requests that calls `setRows(all)` after
each one, on purpose ("SHOWN AS IT ARRIVES").

**How it fails.** Open **Review 2 Pending** on a register where the worklist runs
to several pages, then switch to **Review 3 Pending** before it finishes. Both
loops are now alive and both are writing `rows`. Whichever finishes last owns the
screen — and that is the one that started first if it has more pages left to
fetch. The result is Review 2's calls under the Review 3 tab, with Review 3's
header, count and stage badge around them. Nothing errors.

The same window covers `setApplied(f)` at `:363`, which is what **Load more** and
the DCCR **export** then page with (`:402`, `:513`) — so an export taken shortly
after a tab switch can be of the filter the reader left rather than the one they
are looking at.

**Established by** reading the code — there is no sequence number, no `cancelled`
flag and no `AbortController` anywhere in the function. Not reproduced in a
browser; how often it bites depends on how many pages a worklist runs to.

---

## 11 — The product chip narrows one KPI card and not the two beside it

**Where** `src/modules/KpiAnalytics.tsx:136-138` and `:170-172`

```ts
const fleet     = rates.reduce(…)                       // every product
const calls12   = rateRows.reduce(…)                    // the chosen product
const fleetRate = … rates.reduce(…) * 100 / fleet       // every product
```

**How it fails.** `rateRows` honours the product chip (`:124`); `rates` does not.
So choosing ORION-G leaves three cards side by side reading **Calls · 12 months
412 (ORION-G)**, **Machines in the field 19,204 (every product)** and **Failure
rate 38.2 (every product)**. The middle card's own `sub` says which product it is
about; the other two do not, and the third is the very statistic the chosen
product has a different value for — it is in the table immediately below, per
product, computed correctly.

Four other cards on the same row (`Spares consumed`, `Parts per call`,
`Out of guarantee`, `Under warranty`) DO follow the chip, through
`usageFiltered`. So the row is neither consistently filtered nor consistently
not, which is the part that makes it a bug rather than a choice.

**Established by** reading the code. Certain.

---

## 12 — Cover tiles bucket by substring, and the two patterns overlap

**Where** `src/modules/KpiAnalytics.tsx:118-119`

```ts
const ogpQty      = byCover.find((c) => /ogp|out of/i.test(c.label))?.qty ?? 0;
const warrantyQty = byCover.filter((c) => /warr|wgp/i.test(c.label)).reduce(…);
```

**Why it is latent rather than live.** `spare_usage.cover` is
`btrim(k.item_status)` (`0101_kpi_views.sql:46`) — the raw stored value, not
`cover_code()`. 0208 normalised the stored values to WGP / OGP / CMC / AMC and
stamps them on write, so today the two patterns match one code each and the tiles
are right.

**Why it is still a bug.** 0208's stated rule is that **an unrecognised value is
left exactly as it is**, on purpose — "a spelling nobody anticipated stays visible
as itself, which is how this one was found". The moment such a value exists —
`OUT OF WARRANTY PERIOD`, say — it matches `/warr/` **and** `/out of/`, so the
same quantity is added to *Out of guarantee* and to *Under warranty*: the two
tiles that are supposed to be opposites. That is the exact failure CLAUDE.md
describes ("a substring rule turns one cover into its opposite"), and the reason
`cover_code()` matches on the whole squashed string.

The client already has the sanctioned helper — `coverCode()` in `fieldcall.ts`,
which `check:ui` compares against the SQL word for word. This screen does not
use it.

**Established by** reading the view definition and 0208 together. The overlap is
certain; whether an unmapped spelling exists on the live project is not known
from here.

---

## 13 — The Spare Insights window is a UTC day, the reader's is an IST one

**Where** `supabase/migrations/0148_spare_insights.sql:104-105`, `:137`

```sql
where sc.created_at >= p_from::timestamptz
  and sc.created_at <  (p_to + 1)::timestamptz
```

**How it fails.** `date::timestamptz` resolves at the **database's** time zone.
If that is UTC (Supabase's default — not verified against this project), then
"from 1 Jan" means 1 Jan 00:00Z, which is 1 Jan **05:30** in IST: consumption
booked in the first five and a half hours of the reader's day falls outside their
own window, and five and a half hours of the day after `to` fall inside it. The
same applies to `date_trunc('month', sc.created_at)` at `:137`, so a spare booked
early on the 1st is charted in the previous month.

Small, and in the same family as the export-offset rule CLAUDE.md sets out ("THE
OFFSET IS THE POINT, not the punctuation") — the difference being that here it
shifts which rows are counted rather than how one is printed.

**Established by** reading the SQL. The size of the effect depends on the
database's `TimeZone` setting, which was NOT checked — `show timezone` on the
live project settles it, and if it is already `Asia/Kolkata` there is nothing
here.

---

## 14 — "By product" is the top 25 and does not say so

**Where** `supabase/migrations/0148_spare_insights.sql:129`, shown at
`src/modules/SpareInsights.tsx:179-198`

`by_product` carries `limit 25`. The section beside it, `by_part`, has the same
limit and the screen says so underneath ("The twenty-five biggest consumers in
this window"). The product table says nothing, so with more than 25 products
consuming spares it reads as the whole list, and a product missing from it reads
as a product that consumed nothing.

**Established by** reading the SQL against the screen. Certain; whether the live
project has more than 25 consuming products is not known from here.

---

## 15 — Nine paged reads order by a column that is not unique

**Where** `src/lib/supabase.ts` —

| Read | Order | Paged by | Ties are certain because |
| --- | --- | --- | --- |
| `listFeedbackRows()` (~:3694) | `created_at` | Customer Feedback's Load more | the 24,092-row import shares one timestamp |
| `listConsumptionRows()` (~:3686) | `created_at` | Spare Consumption's Load more | the bulk consumption upload does |
| `listSpareRequestLines()` (~:3150) | `created_at` | Spare Requests' Load more | every line of one request is written together |
| `queryAudit()` (~:2523) | `at` | Audit Log's Load more | a burst of writes shares the second |
| `queryParties()` (~:1138) | `party_name` | Party Master's Load more | two branches of one hospital group |
| `listAllHandstockMovements()` (~:3664) | `moved_at` | Hand Stock's Load more | a dispatch moves many parts at once |
| `listKpiFieldInst()` (~:375) | `Call Registeration Date` | the KPI **export** loop | a date column, by construction |
| `listAllMasterValues()` (~:2916) | `name` | its own internal loop | a master list is *many values per name* — **but see the note below: nothing calls it today** |
| `unusedSpareEngineers()` (~:656) | `ucn` | `allRows` | one call carries several parts |

**How it fails — measured, in Postgres 16.** 24,000 rows sharing one
`created_at` plus 12 later ones, paged exactly as `listFeedbackRows` pages:

```
=== ORDER BY created_at DESC, 1000 at a time, four pages ===
rows fetched      : 4000
distinct rows     : 3994
DOUBLED (seen 2x+): 6

=== the same four pages, ORDER BY created_at DESC, id DESC ===
with the id tiebreaker — rows: 4000, distinct: 4000
```

Six rows came back twice, so six others never came back at all — and the result
still looks complete, which is the point. The tiebreaker fixes it exactly.

**Why this is not a theoretical objection.** The project already knows the rule
and has applied it in five places — `listCallRequests` (`submitted_at + id`),
`listCallReviews` (`reg_date + id`), `listFfrs` (`ffr_date + id`),
`listDirectory` (`name + id`), `listMasterItems` (`value + id`) — with CLAUDE.md
recording why: *"a bulk import makes ties certain and a tie puts a row on two
pages or neither."* These nine were not done.

The worst is `listKpiFieldInst`: it feeds a **file** somebody sends on, so a
doubled or missing row is not noticed on a screen and cannot be.

**One correction to the row above.** `listAllMasterValues` pages by `name` when a
master list holds hundreds of values under one name, so its page boundaries fall
*inside* a single list — but it has **no callers**: `grep -rn listAllMasterValues
src/ scripts/ supabase/` returns only its own definition. It is dead code today
and nothing is wrong on any screen because of it. It is left in the table because
the next caller inherits the fault; it is not a live bug, and the eight above it
are.

**Established by** building the case in Postgres 16.13 and counting. The plan
Postgres chose for page 1 (a top-N heapsort) orders ties differently from the
full sort it chose for later pages; nothing about that is specific to this
schema. What was NOT measured is how each of the nine behaves on the live
project's data volumes.

See also finding 8 — the seven reads that name no order at all.

---

## 16 — Five auto-refreshers test a filter flag frozen at the first render

**Where** `src/modules/PartyMaster.tsx:207`, `PartMaster.tsx:100`,
`AuditLog.tsx:66`, `Reports.tsx:173`, `ProductMaster.tsx:117`

```tsx
useEffect(() => {
  …
  const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
  return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);                                   // ← the guard is captured here
```

**How it fails.** `hasFilter` is a plain `const` recomputed on every render. The
interval callback closes over the **first** render's binding, which is `false`
(the filter boxes start empty), and the effect never re-registers because its
deps are `[]`. So the guard is permanently `false` and the 30-minute sync always
fires — and `refresh()` reads **unfiltered** (`queryParties({}, 0, PAGE)`,
`queryAudit({}, 0, PAGE)`, `run({})` …).

The result after half an hour on any of these screens: the filter boxes still
show what was typed, the Load-more pages are gone, and the list underneath is the
unfiltered first page. It does not look like a refresh — it looks like the filter
found a lot more than it did. On the **Audit Log** — the screen somebody opens to
investigate one person or one action — that is the worst place for it.

`ProductMaster.tsx:117-121` is the same bug written out longhand: it computes
`anyFilter` from `f` *inside* the callback, but `f` is the first render's object.

**One screen does it correctly**, which is what shows the others are wrong:
`CoverRegister.tsx:650-655` registers the same interval with deps
`[tab, filtered]`, so the effect is torn down and rebuilt whenever the filter
changes and its guard sees the current value.

**Established by** reading the five effects and their dependency arrays. Certain
by JavaScript's closure rules.

---

## 17 — Three screens tell everybody "everything is done" from a list that is filtered, scoped and capped

**Where** `src/modules/CallReview.tsx:256`, `PendingCalls.tsx:267`,
`SpareRmApproval.tsx:254`

```tsx
Nothing here. {only === 'pending' ? 'Every solved call has been reviewed.' : …}
emptyText={busy ? 'Loading…' : 'No pending calls — everything is closed.'}
<EmptyState … hint={onDb ? 'Every spare has had its first approval.' : …} />
```

**How it fails — three ways at once**, in rising order of seriousness:

1. **The search counts.** All three test the *filtered* list. Type a search term
   that matches nothing and the screen announces that every solved call has been
   reviewed / every call is closed / every spare has been approved. This one is
   plainly wrong for any reader, in any role.
2. **The read is capped.** `CallReview` sets `capped` when the read hits its
   limit and shows a `+` on the count two lines above — then prints the absolute
   claim anyway.
3. **The rows are RLS-scoped.** An engineer sees the calls allotted to them. So
   "everything is closed" is really "nothing is open *that you can see*", and the
   two are different claims — which is precisely what CLAUDE.md records from
   2026-09-18, when a Stores Incharge looking at an empty queue could not tell
   which he was being told.

**`SpareDispatch.tsx:94-103` is the screen that was fixed**, and it is fixed the
right way — `seesEveryRecord(user, can)` chooses between the strong sentence and
*"Nothing waiting to go out that you can see. Your role is shown its own and its
team's spares, not the whole queue."* The helper exists, the comment above it
explains the incident, and three other screens with the same sentence never got
it. `seesEveryRecord` has exactly two call sites in the whole application.

**Established by** reading the three empty states and comparing them with the
fixed one. Certain for the search case; the scope case depends on the reader's
role, as described.

---

## 18 — A search reports its cap as the answer, and ↻ Refresh claims "Loaded all"

**Where** `src/modules/FieldCalls.tsx:718-727` and `:673-679`

**The search.** `searchCalls(config.callType, srch, 1000)` is a single request
with `.limit(1000)` — PostgREST's own ceiling. The banner then says
`${rows.length} matches for your search (server-side)`, and `moreAvailable` is
deliberately `false` while searching (`:986`), so the header count carries no
`+` either. A search for a common party across a 20,000-call register reports
**1000 matches** as a fact, twice over. Nothing in the pair of messages can be
read as "and possibly more".

**The refresh.** `refresh()` reads `listFieldCalls('', loadLimit, config.tab)`
with `loadLimit` starting at 800, and announces on the database path:

> Loaded all 800 field calls — search covers the full register.

The second clause is true. The first is not: it is the most recent 800, and
**Load more** exists on the same screen for that reason. The sheet path, three
lines below, gets this right — it says "most recent 300; use Load more for
older".

**And pressing ↻ while a search is active silently drops the search.**
`refresh()` reads the browse set and writes it into the same cache the table
renders from; the search effect does not re-run (its deps are `[srch, onDb,
loadLimit]`, none of which changed). The search boxes keep their terms above a
list that is no longer the result of them — the same shape as finding 16, from a
different cause.

**Established by** reading the two effects and `searchCalls`
(`supabase.ts`, `searchCalls()`). Certain.

---

## 19 — The Uploaded / Entered-here chips count only the page that is loaded

**Where** `src/modules/CustomerFeedback.tsx:179-189`

```tsx
All <b>{scoped.length}</b>
{o} <b>{scoped.filter((r) => originOf(r) === o).length}</b>
```

**How it fails.** `rows` is one 1,000-row page (`PAGE = 1000`, `:64`) until
somebody presses Load more, and `more` is tracked right beside these chips and
passed to the header count — but not to the chips, which print bare numbers.
Against the ~24,000-row feedback register that is "All 1,000" for a register of
twenty-four thousand.

The damaging one is the second chip. The rows are ordered `created_at desc`, so
the first page is the newest; a feedback **entered here** that is older than the
newest thousand uploaded rows is not on that page, and the chip reads
**Entered here 0**. That is the exact question the chips were added to answer
(the user, 2026-09-14: *"Can I segregate the Uploaded ones and the Ones that were
entered in the new CRM?"*), answered with a confident zero.

`<FacetChips>` takes a `more` prop and `check:ui` **refuses** one that does not
pass it. These are hand-rolled `<button className="chip">` elements, so the check
does not see them — not an evasion, but the same effect.

**Beside it, in the same file** (`:94`): the 30-minute auto-sync is
`setInterval(() => void load(), SYNC_TTL_MS)` with no guard at all, and `load()`
reads page 1 and calls `setRows(mapped)`. A reader who has pressed Load more five
times loses four of those pages every half hour, with the count jumping back to
1,000.

**Established by** reading the code. The 24,092 figure is CLAUDE.md's (from the
0186 feedback-key incident), not measured here.

---

## 20 — "Not Approved" reads as approved, and the line reaches Stores

**Where** `supabase/migrations/0016_spare_line_approvals.sql:85` (`spare_line_stage`)
and `src/lib/spareflow.ts:62` (`isApproved`), which carry the **same** test:

```sql
when rm !~* 'approv|auto' then 'RM Approval'
```
```ts
const isApproved = (v: unknown) => /approv|auto/i.test(s(v));
```

**What is wrong.** The test asks whether the value *contains* "approv". It is
reached first by `~* 'reject'`, so an outright `Rejected` is caught — but
**every other way of saying "no" or "not yet" contains the word "approval"**.

**How it fails — measured, against a database built from every migration.**
Asking the function itself, with the later stages set to Approved:

```
Approved          ->  Stores
Auto-Approved     ->  Stores
Pending           ->  RM Approval     ← the only one that works
Rejected          ->  Rejected
Not Approved      ->  Stores
NOT APPROVED      ->  Stores
Approval Pending  ->  Stores
Awaiting Approval ->  Stores
Pending Approval  ->  Stores
For Approval      ->  Stores
Approval Awaited  ->  Stores
Disapproved       ->  Stores
```

**And end to end**, inserting a request and a line the way the **Spare Request
Lines bulk upload** writes them:

```
--- the line the RM refused ---
 row_no | rm_approval  | stage  | status
      1 | Not Approved | Stores | Stores

--- Stores is offered it ---
 row_no |          part          | qty | engineer
      1 | PC-9|Refused by the RM |   2 | Eng Elan
```

It is in `spare_pending_dispatch`, which is the only thing
`dispatch_spare_lines()` checks before booking stock out
(`…where v.line_id = any (p_line_ids)` against that view). So the part the RM
refused is one click from leaving the building, and the register shows the line
as cleared.

**How a value like that gets in.** Not from the application — the app writes
`Approved`, `Auto-Approved`, `Rejected`, `Pending`. It gets in from the
**importer**: `uploads.ts:726` maps the spreadsheet's "RM Approval" column
straight through as free text (`TEXT('rm_approval', 'rmapproval', 'rm approval')`),
and `spare_request_lines` carries **no CHECK constraint at all** on any of the
three approval columns (asked of the database: `contype='c'` returns nothing).
The register was loaded from a sheet, and the upload's own note says *"Load the
same file three times if the approvals arrived separately"* — a file with partly
filled approval columns is the expected input, not an edge case.

**Even where the line does not reach Stores it is still wrong.** With the cover
set to OGP the same import stops at Commercial — because *Commercial* is still
`Pending` — and presents a line the RM refused to the Commercial approver as
**RM-cleared**. Measured:

```
 row_no |   rm_approval    |    stage
      1 | Not Approved     | Commercial
      2 | Approval Pending | Commercial
      3 | Pending          | RM Approval
```

**Why no check catches it.** The client and the database agree exactly — the
same regex, deliberately mirrored — so `check:replay`, `check:ui` and the suites
all pass: there is no disagreement to find. This is the failure mode CLAUDE.md
describes for cover (*"a substring rule turns one cover into its opposite"*), on
a column where the consequence is stock movement rather than a mis-grouped chart.

**Established by** running `spare_line_stage` against a database built from all
219 migrations, then inserting through the real tables and reading
`spare_pending_dispatch`. What was NOT established is whether the live project's
imported rows actually contain such a value — `select distinct rm_approval,
count(*) from spare_request_lines group by 1` answers that in one query, and it
is the first thing to run.

---

## 21 — More chips counting one page as if it were the register

**Where** `src/modules/HandStock.tsx:337, 346-349, 525-527`;
`src/modules/SpareDispatch.tsx:251`

Same shape as finding 19. Hand Stock loads 1,000 rows a page and tracks `more`
— it passes it to the header (`countMore={!hits && more}`, `:308`) and then
prints four bare numbers beneath it:

```tsx
📊 Stock Level <b>{rows.length}</b>
In hand <b>{rows.filter((r) => r.on_hand > 0).length}</b>
⚠️ Short <b>{totals.shortLines}</b>
Settled <b>{rows.filter((r) => r.on_hand === 0).length}</b>
```

**⚠️ Short** is the one that matters: it is a count of engineer/spare lines that
have gone negative — stock taken without a stock out — and it is the number My
Workload links to as a finding to act on. Over a partial load it is a floor
presented as a total.

**Pending Dispatch has a different version of it.** `listPendingDispatch()`
pages through `allRows` with `cap = 2000` (`supabase.ts`, `listPendingDispatch()`), and `allRows`
stops at its cap **silently** — there is no `more` to track. So a queue longer
than 2,000 lines is truncated with nothing on the screen saying so, and the
`🚚 Queue` chip, the KPI tiles and `summarise()`'s totals are all quietly short.

**Spare Requests is the screen that does it right**, in the same group: every
one of its chips carries `{partial ? '+' : ''}` (`SpareRequests.tsx:919-922`).

**Established by** reading the three screens against each other. The Hand Stock
case is certain; the Pending Dispatch one depends on the queue exceeding 2,000
lines, which was not checked against live data.

---

## 22 — The 30-minute auto-sync throws away every page but the first

**Where** `src/modules/SpareRequests.tsx:631`, `SpareConsumption.tsx:246`,
`CustomerFeedback.tsx:94`

```tsx
const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
```

**How it fails.** `load()` on all three reads **page one**
(`listSpareRequestLines(PAGE, 0)`, `listConsumptionRows(PAGE, 0)`,
`listFeedbackRows(PAGE, 0)`) and then `setRows(mapped)` — replacing, not
merging. Every half hour, a reader who has pressed **Load more** five times is
silently returned to the first 1,000 rows: the table shortens, the count drops,
and the row they were reading is gone. There is no message, because from
`load()`'s point of view nothing failed.

It is worse than losing your place. On **Spare Consumption**, `_dbId` is what an
adjustment writes to, and the comment at `:252-256` records that a line past the
first page could not be corrected at all until Load more started carrying it —
so an auto-sync mid-correction puts the screen back into exactly the state that
bug was fixed out of.

**Hand Stock, in the same group, gets it right**: its `load(want = Math.max(
PAGE_SIZE, loaded))` (`HandStock.tsx:171`) re-reads as far as the reader had
got, so a background sync keeps the register the size it was.

**Established by** reading the three effects and their `load` functions. Certain.

---

## 23 — Correcting somebody's name on User Master silently empties their team

**Where** `src/modules/UserMasterView.tsx` (the `name` cell, editable in the
table at `:367` and in the drawer), against
`visible_engineer_names()` and `public.handstock_key()`

**What is wrong.** The reporting tree is built by matching **name strings**:
`user_directory.reporting_manager` and `.regional_manager` hold a manager's
*name*, not a key. Nothing cascades a change of that name. The only trigger on
the table is `sync_profile_from_user_directory`, which pushes the new name
**out** to `profiles` and touches no other directory row (read from the
database: `user_directory` carries exactly two triggers, that one and the
address guard).

**How it fails — measured.** A manager with two engineers, then one edit
correcting the spelling of the manager's own name, made as an administrator:

```
--- who the RM can see, before the rename ---
 RM Ravi
 Eng A
 Eng B
(3 rows)

--- the two engineers still name the OLD spelling ---
 name  | reporting_manager
 Eng A | RM Ravi
 Eng B | RM Ravi

--- who the RM can see now ---
 Ravi Kumar
(1 row)
```

Three to one. The manager keeps themselves and loses both engineers — and with
them every call, spare request, visit and review those engineers' names scope.
Nothing errors, nothing is logged as a loss, and the manager's own screens do
not look broken: they look like a quiet week.

This is the same outcome as the blank-name bug 0212 repaired ("a caller the
directory cannot name sees no team"), reached by a different route — and 0212's
fix does not help here, because the name is not blank, it is simply no longer
the one the children point at.

**A second consequence, in the stock record.** `handstock_movements` keys every
arm on `handstock_key(r.engineer)` / `handstock_key(c.engineer)` — the engineer
name **stored on the spare request and the consumption row** — so renaming an
engineer leaves their whole existing balance under the old key while anything
raised afterwards opens a second balance under the new one. The Hand Stock
engineer dropdown is built from the directory, so it offers the new name, which
holds nothing. One person, two stock positions, neither complete.

**Nothing on the screen says so.** The drawer's help text explains that
*Reporting Manager* and *Regional Manager* are "names from this directory —
they build the tree that decides whose calls each manager can see" (`:924-925`),
which is exactly right and points at the other two fields. The `name` field
itself — the one that breaks the tree when it changes — carries no warning, and
the table lets it be edited inline along with everything else.

**Established by** building a directory on a database with all 219 migrations
applied and calling `visible_engineer_names()` before and after the rename, as
the RM. The hand-stock half is read from `handstock_movements`' definition, not
exercised end to end.

**What would make it safe** is a decision, not a patch: cascade the rename in
the same statement, or key the tree on `id` rather than on the name. Both are
larger than this document, which is why it is recorded rather than fixed.

---

## 24 — Unticking every box and saving *grants* the role its code defaults

> **FIXED on `main` by `1bf248e`** (2026-09-23, *"Roles & Permissions was
> overwriting every role on every save"*). `save()` now writes only the roles
> you changed, and it **refuses** to save any role left with zero boxes ticked,
> instead of storing `[]`. The rest of this section is kept as the record of
> what was wrong. That commit also fixed a second bug in the same screen that
> this review missed (see *What was covered*).

**Where** `src/modules/RolePermissions.tsx:267-285` (`save`) against
`src/lib/rbac.ts:395-399` (`permsForRole`)

```ts
// RolePermissions.save()
const list = r.key === 'admin' ? […] : [...(perms[r.key] ?? [])];
await setRolePerms(r.key, list, r.label);        // writes [] for a fully-unticked role
```
```ts
// rbac.ts
export const permsForRole = (role: string, config: Record<string, string[]>): string[] => {
  const stored = config[role];
  if (stored && stored.length) return stored;          // ← [] fails this test
  return DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer; // ← so the CODE defaults apply
};
```

**What is wrong.** An empty stored array means *"not configured"*, and the
fallback is the point — it is how a brand-new role works before anybody tunes
it. But **Save writes an empty array** for a role whose boxes have all been
cleared, so the one gesture that means "this role may do nothing" is stored as
"this role has never been configured", and the role receives its full code
defaults.

**How it fails — measured**, by calling `permsForRole` the way `can()` does:

```
zoho_migration       ticked 2 -> holds   2   |   unticked ALL -> holds  69
technical_support    ticked 2 -> holds   2   |   unticked ALL -> holds  69
hotline              ticked 2 -> holds   2   |   unticked ALL -> holds  70
engineer             ticked 2 -> holds   2   |   unticked ALL -> holds  57
commercial           ticked 2 -> holds   2   |   unticked ALL -> holds  61

what "revoke everything" actually leaves zoho_migration holding, first 8:
  calls.view, masters.view, consumption.view, reports.view, dashboard.view,
  feedback.view, audit.view, admin.view
  …of 69 permissions
```

**Revoking everything leaves the role with more than leaving two boxes ticked.**
It is not a small over-grant either: `zoho_migration` ends with 69 permissions
including `audit.view` and `admin.view`.

**This is the gesture the application asks for by name.** CLAUDE.md's reason for
`zoho_migration` existing as a separate role is that *"this one ends when the
migration does and can be revoked in a tick, without touching the support
login."* Unticking its boxes and pressing Save is what "revoked in a tick" means
on this screen, and it does the opposite.

**The screen already knows.** Its own export writes, for exactly this state:

> NOT CONFIGURED — showing the Engineer fallback, which is what these users
> actually get

— `RolePermissions.tsx:157`. The trap is documented in the file that walks into
it. CLAUDE.md states the other half of the same rule ("leave a role with ZERO
permissions alone — an empty array means 'not configured' and writing one key
into it turns the fallback off"); nothing states this direction.

**What a fix has to decide** (again, a decision rather than a patch): either
store a sentinel that means "deliberately nothing", or refuse the save and tell
the administrator to disable the role instead. Writing `[]` cannot mean both
things.

**Established by** running `permsForRole` from `rbac.ts` directly against the
empty-array case. Certain for the client; the database policies read
`app_roles.permissions` through `has_perm()`, which was NOT tested here and may
treat an empty array differently — worth checking before deciding which way to
fix it.

---

## 25 — An exact count over a read that is paged and capped

**Where** `src/modules/StockOut.tsx:42-45`

```tsx
count={count}
// The list loads in one request, not in pages, so this is the whole
// number rather than a lower bound.
countMore={false}
```

**How it fails.** The comment's premise is not true. `listStockOutLines`
(`supabase.ts`, `listStockOutLines()`) is `allRows(...)` — paged, in 1,000-row requests, up to
`cap = 5000` — and `allRows` **stops at its cap silently**: no flag, no error,
just fewer rows. So once Stores has issued more than 5,000 spare lines, the Stock
Out register shows 5,000 under a header that promises the number is complete.

The comment is the interesting part: it was written to justify `countMore={false}`
and it justifies it from a mechanism the function does not use. Reading it is
how somebody confirms the claim and moves on.

**Indoor Service, in the same group, does it right** —
`IndoorService.tsx:173-175` also passes `countMore={false}` and says so honestly:
*"every row is on screen. listIndoorJobs caps at 500 and the register is nowhere
near that; when it is, this…"* — a claim with its own condition attached.

See also finding 21: `listPendingDispatch` has the same silent `allRows` cap at
2,000, without even a `more` to track.

**Established by** reading `listStockOutLines` and `allRows`. The mechanism claim
is certainly wrong; whether the live register has passed 5,000 issued lines was
not checked — `select count(*) from spare_stock_out_lines` settles it.

---

## 26 — A visit dated on the form is stored at UTC midnight and reads back at 05:30

**Where** `src/modules/CallReporting.tsx:414` (the visit) and `:451` (the
feedback row)

```ts
visit_at: visitDate ? `${visitDate}T00:00:00Z` : null,
```

**What is wrong.** `visitDate` comes from an `<input type="date">` — a date with
no time, picked by somebody in India. Appending `T00:00:00Z` asserts that it
means **UTC** midnight, which it does not.

**How it fails — measured**, with `TZ=Asia/Kolkata`:

```
stored              : 2026-09-18T00:00:00Z
formatDayTime       : 18-Sep-2026 05:30:00     ← a time nobody recorded
formatDay           : 18-Sep-2026              ← the day is right
hasClockTime        : true
excelSerial         : 46283.22916666667
  -> whole day?     : false
  -> fraction (hrs) : 5.50
```

The **day** survives (India is east of UTC, so 00:00Z is still the 18th locally),
so this is not a wrong date. What it produces is a phantom time: every visit
entered on the form reads **05:30:00** on the Visit Reports register, in the
Consumption Report's *Visit Date & Time* column, and in the Customer Feedback
Report's *Visit Date*. In the .xlsx it is a fractional day, so Excel shows the
time too and any subtraction between two visits carries it.

**The upload path disagrees with it.** `REPORT_COLS` maps *Visit Date & Time*
through `toTs` → `toIsoTimestamp(v, 'local')` (`uploads.ts:157`), which reads the
value as a **wall clock** and produces the right instant — so a visit loaded from
a file on 18-Sep reads `00:00:00` while the same visit typed into the form reads
`05:30:00`. One column, two meanings, decided by how the row got in.

**This is the artefact CLAUDE.md already names**, in the other half of the same
problem: *"a date-only value must be a WHOLE day: going through
`new Date('2026-09-18')` parses UTC midnight and reads it back locally, giving
every date in India a 05:30 fraction."* `excelSerial` was fixed to treat a
date-only string as a whole day — but by the time it sees this value the string
is no longer date-only, so the fix cannot apply. The writer is what is left.

**Established by** running the stored value through the project's own
`formatDayTime`, `formatDay` and `excelSerial` under `TZ=Asia/Kolkata`. The
comparison with the upload path is read from `uploads.ts:157` and
`dates.ts:109-115`.

---

# What was covered, and what was not

**`MODULES` has grown since this was written.** It held 26 screens when the
review began. `main` has since added **Data Export** (`005029e`) and **Feedback
Without a Report** (`7cfabdc`), both while this PR was open. Both were reviewed:
Data Export is finding 27; Feedback Without a Report is **clean** on every
pattern this review looks for — it shapes its exports through `xlsxText` /
`xlsxCell`, its empty state says "Nothing to show" rather than asserting the
register is empty, and `listFeedbackWithoutReport` pages through `allRows` with
`feedback_entered_at desc, feedback_id desc`, a unique tiebreaker. Saying so
matters: a review that only ever finds faults is one nobody can calibrate.

The claim "every module" is true of the list below, not of whatever `MODULES`
holds when you read this.

**One thing this review read and missed.** `main` fixed a Machine History bug on
2026-09-22 (`1451a2b`) that this document walked straight past: its `getRowId`
was `${r.source}-${r.ref}-${r.on}-${r.detail}`, and two visits filed against one
call on one day with the same status and no remark are identical in all four —
so React deduplicated them and dropped two other rows. The chip said 5, the
table drew 3 spares and 2 visits, and nothing errored. The finding-1-through-27
method — read the screen, check it against the documented rules — looked at that
exact line while checking something else and did not ask whether the recipe could
collide. Recorded here because the document's own standard is to say how each
claim was established, and "reviewed" is not the same as "exhaustively
reviewed".

**A second miss, the same week.** `1bf248e` fixed Roles & Permissions for
something besides finding 24. The matrix was seeded **once**, by a `useState`
initialiser, from what was loaded at that moment. So the screen could show code
defaults instead of the stored grants, and Save then wrote **every** role from
that stale matrix, including roles nobody had touched. This review read that
`save()` for finding 24 and did not ask where `perms` came from.

**What the re-review (2026-09-23) checked and found sound.** Recorded because a
review that only lists faults cannot be calibrated:

- **Bulk Report Mapping → Convert.** Its write loop counts calls rather than
  changed rows, which looked like finding 30. It is not: the whole page returns
  early unless `mayRun` (`calls.report`), and that is exactly what the
  `reports_write` policy asks for. Anybody who can press Convert can write.
- **Party Master → KYC records.** Gated on `masters.edit`, which is exactly what
  `parties_write` asks for.
- **Warranty entry → "＋ Installation calls (n)"**, the button for the whole
  sale. It sits under `canEdit` (`cover.edit`), which is what `sale_items_write`
  asks for. The per-machine button in the Machines list is not gated like this.
  That is finding 31.
- **Pending Calls row ids.** `dbToCall` sets `_id = row.id`. Field, installation
  and PM calls all draw their ids from one sequence, `call_split_id_seq`, so ids
  cannot collide across the three.
- **The permission refresh in `auth.tsx`** (`896a142`) re-reads roles when the
  tab becomes visible again, at most once a minute. `reloadRoles` only ever
  merges into what is already there, so a failed read changes nothing.
- **Master List, Daily Call Review / Solved Without a Report, Report Mapping's
  own plan.** No new instance of any pattern above.

**Covered screen by screen**, reading the module and the `src/lib` helpers behind
it: Dashboard, My Workload, Product & Party Search, Machine History, Daily
Complaint Review Register, Product Failure Analysis, Spare Insights, Field
Failure Register (+ Insights, + Desk), KPI & Failure Analysis, Call Review,
Request Registration, Pending Registrations, Field Call Register, Pending Calls,
Visit Reports, Customer Feedback, Spare Requests, RM Approval, Pending Dispatch,
Stock Out, Spare Consumption, Hand Stock, Material Returns, Stock Transfer,
Party Master, Product Database, Product Database 2.0, Product Master, User
Master, Part Master, All Masters, Warranty & Contract Registers, Ownership
Transfer, How RITHI Functions, Reports (the hub and the builder behind all five),
Not Consumed Against this Call, Indoor Service, Bulk Uploads, Bulk Report
Mapping, Roles & Permissions, Audit Log, Objective, Call Reporting, Delivery
Challan.

**Looked at only in passing** — grepped for the fault patterns this review had
already established, not read line by line: Admin Config, Software Validation,
Settings, Version History, User Access, My Profile, Login / Reset / Change
Password, Data Import, PM Bulk Upload, QMS Documents, Service Manuals, Knowledge
Base, How To Use, Tracker, Solved Without a Report, Declaration, Report Detail,
Call Associations, the KPI Export and the three report detail screens. A clean
pattern-grep is weaker evidence than a read; nothing here should be taken as
"those are fine".

**Not attempted at all.** Nothing was run in a browser, so every React finding is
established by reading the code rather than by watching it fail. The Apps Script
bridge (`apps-script/CallReg.gs`) was not reviewed — `script.google.com` is
blocked from this sandbox, so it cannot be exercised, and reading it would have
produced exactly the kind of plausible-but-unverified claim this document tries
to avoid.

**The live project was not touched.** Everything measured here ran against a
throwaway Postgres 16 built from all the migrations plus `supabase/tests/_stub.sql`:
219 of them for the first review, 257 for the re-review.

**Default permissions, not the live ones.** Findings 30 and 31 name the roles
affected in two places: the code defaults (`permsForRole(role, {})`), and the
`app_roles` rows that the migrations themselves store. The two agree. On the live
project an administrator may have tuned those roles since, so the 30/31 query
below is what says who is actually affected there.
Several findings end with a query to run against the real project — they are the
cheap ones to settle first:

| Finding | The query that settles it |
| --- | --- |
| 20 (refused spares) | `select rm_approval, count(*) from spare_request_lines group by 1 order by 2 desc;` |
| 13 (UTC day window) | `show timezone;` |
| 25 (Stock Out cap) | `select count(*) from spare_stock_out_lines;` |
| 12 (cover tiles) | `select distinct item_status from calls;` |
| 14 (top 25 products) | `select count(distinct product_name) from spare_usage;` |
| 28 (MRN row ids) | `select uid, row_no, count(*) from material_returns group by 1, 2 having count(*) > 1 limit 20;` |
| 30 / 31 (who is affected) | `select role, permissions ? 'calls.create' or permissions ? 'pending.register' as may_correct_others, permissions ? 'install.create' as raises, permissions ? 'cover.edit' as maps from app_roles order by 1;` (`permissions` is `jsonb`; run on the test database, this query returns `hotline | t | t | f`) |
| 31 (already duplicated?) | `select serial, product_name, count(*) from installation_calls group by 1, 2 having count(*) > 1 order by 3 desc limit 20;` |
| 32 (1,000 cap) | `select count(*) from call_requests where call_type ilike 'INSTALL%';` — above 1,000, the card is already missing the newest pending ones |
| 34 (who sees OGP) | `select role from app_roles where permissions ? 'mod:/product-database' and not (permissions ? 'masters.view' or permissions ? 'cover.edit') and role <> 'admin';` — on the test database: engineer, spare_coordinator, stores_incharge, tally_coordinator |
| 35 (owners already wrong) | the handoff's Step 0 query 10: machines whose owner differs depending on whether transfers are ordered by entry or by date |
| 38 (how close to the limit) | `select (select count(*) from sale_items), (select count(*) from ownership_transfers);` — the measured 12.5 s was at 20,000 and 4,000 |
| 39 (what it would copy) | `select contract_type, contract_cover_code(contract_type), count(*) from products where coalesce(btrim(contract_type),'') <> '' group by 1, 2 order by 3 desc;` — any row where the two columns differ is a word the script would write verbatim |
| question: 0239 | `select count(*) from product_database where contract_number = '' and coalesce(btrim(contract_number_keyed),'') <> '';` — machines whose stored contract no longer shows |
| question: `export.data` | `select role from app_roles where not permissions ? 'export.data' order by 1;` — no migration has granted it except to Technical Support |

# If only three were fixed

**First, do not run anything with its switch turned on.** Finding 39's Item
Status correction is written to be applied with one changed word, and applying
it would send spare requests for machines under an AMC contract past
Commercial and NSM approval, by writing the contract register's own word
("Labour", say) where the code AMC belongs.

**36 and 35** — the Product Database now decides a machine's owner and cover
itself, and two ordinary actions make it wrong without an error: a one-word edit
to an older sale (a machine under warranty until 2027 reads OGP), and a
transfer entered late (the machine goes back to a previous owner). Both are
**measured**.

**20** — a spare line the RM refused sits in the Stores dispatch queue, and only
an import can put it there, which means it is already there or it is not. The
query above costs nothing and answers it.

**34** — four roles open the Product Database and see every machine under
contract as out of cover, because the view runs as the reader and the reader
cannot see contracts. Nothing on the screen says anything is hidden.

*(24 was on this list; it is fixed on `main`. 31 and 23 were on it until the
2026-09-24 re-review and are just as true. 31 (with 30) is a duplicate
installation call and a correction that was never stored; 23 is a rename that
empties a manager's team. 34, 36 and 35 are ranked above them because they
decide what cover, and so what charge, a machine is shown with. 20 stays because
it is the one that may already have happened.)*

The rest are real and worth doing; those are the ones where the system is
confidently telling somebody the wrong thing about access, stock or a record it
did not keep.

---

**Fixing these**: `docs/MODULE_REVIEW_HANDOFF.md` is the companion. It has the
open findings as patches, in the order to apply them, with the live-project
queries that come first and the ones that need a decision rather than an edit.

---

## 27 — Data Export pages every table with no `order()`

**Where** `src/modules/DataExport.tsx:87-88`

Added to `main` **after** this review was written (`005029e`, 2026-09-22), so it
is a 27th module the rest of the document does not cover. Reviewed here because
an export screen is exactly what findings 7, 8 and 15 are about.

```ts
const rows = await allRows<Record<string, unknown>>(
  (a, b) => c.from(name).select('*').range(a, b), 200000);
```

**What is right about it**, and worth saying first: the dates go out through
`xlsxText` (`:41-44`), with a comment citing the Consumption Report — so it does
**not** have finding 7. It reads through the ordinary API as the signed-in
person rather than a definer function, so RLS still applies. It pages rather
than trusting a `limit`, and says why. Someone read the history before writing
it.

**What is wrong.** The paged read names **no order**. `paging.ts:19-22` states
the rule the module otherwise follows — *"ORDER IS NOT OPTIONAL WHEN PAGING.
Without one, PostgREST may return page 2 overlapping page 1 and a row is then
dropped or doubled, which is worse than truncation because it looks complete.
Every caller passes a deterministic order"* — and this caller does not. It is
finding 8's fault in a new place, with finding 15's measured consequence: 4,000
rows fetched, 3,994 distinct.

**Why it matters more here than on a screen.** Every other instance of this
produces a slightly wrong list somebody is looking at. This one produces a
**file**, named `rithi-export-<date>.zip`, that leaves the building and gets
reconciled against. A table exported with six rows doubled and six missing looks
exactly like a complete export, and the per-table count the screen reports
(`${name} ${rows.length}`) would agree with it. Anything above 1,000 rows is
exposed — which is most of the registers this feature exists to export.

**The fix needs one decision**, because the read is generic over table names and
cannot hardcode a column. Either:

- **have `exportable_tables()` return the key** — it is already a `pg_class`
  query (`0227_data_export.sql:26-40`), so joining `pg_index`/`pg_attribute` for
  each relation's primary key is a few lines, and the screen then orders by it;
  or
- **order by `ctid`** for ordinary tables, which is always present and stable
  within a single read — but is not a column on a **view**, and the picker
  includes views (`relkind in ('r','v','m')`), so this only covers part of it.

The first is the honest one. A view with no key is the case to think about: it
may be right to refuse to export one rather than export it unreliably.

**Established by** reading the module against `paging.ts`'s own stated rule. The
consequence is the one measured for finding 15, in Postgres 16, not re-measured
here. Whether any exportable table exceeds 1,000 rows is not in doubt.

---

# Found by the re-review (2026-09-23, `main` at `092448e`)

## 28 — Two lines of one MRN can get the same screen row id

**Where** `src/modules/MaterialReturns.tsx:89` (`load`) and `:112` (`loadMore`),
read by `getRowId={(r) => r.id}` at `:159`

```ts
id: `${String(x.uid ?? '')}-${String(x.row_no ?? i)}`
```

**What is wrong.** The screen builds each row's id from the MRN number and the
row number, and nothing else. The database allows two lines with the same pair.
Its unique index is `material_returns_uid_part_idx` on
`(uid, part_code(part), coalesce(row_no, 0))`, so it only needs the **part** to
differ. When two ids collide, `DataTable` keys two rows the same. React then
draws one of them and drops a neighbour, with no error. This is the Machine
History `getRowId` fault that `main` fixed in `1451a2b`, in another screen.

**How it gets there.** `material_returns_assign_row_no` numbers a line only when
`row_no` is **null**. The MRN upload fills `row_no` from the file
(`src/lib/uploads.ts:810`, `{ to: 'row_no', from: ['row no', 'si no'] }`). The
upload's own note says *"The export has no unique row id (its SI Number
repeats)"*. So a file that gives two parts of one MRN the same row number stores
them both, and the screen then collapses them.

**Established by measurement.** On the test database I inserted two lines of
MRN `MRN-PROBE`, both with `row_no = 1`, for parts `P-001` and `P-002`. Both
were accepted (`INSERT 0 2`), and both rows' screen id comes out as
`MRN-PROBE-1`. The stock-cap trigger was switched off for that insert: it limits
quantities, not keys. The fix is to key the row on the table's own `id`, which
`listMaterialReturns` already selects. How many live rows already share a pair
is a question for the live project: see the query table.

---

## 29 — Renew opened before the machines load starts with none ticked, and never updates

**Where** `src/modules/CoverRegister.tsx:321` (`RenewPanel`)

```ts
const [d, setD] = useState<RenewalDraft>(() => proposeRenewal(header, items));
```

**What is wrong.** Opening a contract clears the machine list and then fetches it
(`:746-747`, `setItems([])` then `setItems(await listItems(...))`). The
"↻ Renew this contract" button (`:1180`) is not disabled while that fetch runs.
The panel's draft is built **once**, by the `useState` initialiser, from
whatever `items` holds at that moment. Pressed before the fetch lands, the draft
carries no machines, and it never picks them up when they arrive. Submitting
then fails with `cover.ts:564`'s *"Tick at least one machine to carry over."*

**Why Low.** It is a refusal, not a wrong record. Closing and reopening the panel
fixes it. **Established by reading**, not reproduced in a browser.

---

## 30 — "Correct this request" says *corrected* when the database changed nothing

**Where** `src/modules/RequestCallRegistration.tsx:214-230` (`saveDetail`),
calling `updateCallRequest` (`src/lib/supabase.ts`, ~:1801)

```ts
const { error } = await must().from('call_requests').update(row).eq('id', id);
return error ? { ok: false, error: errMsg(error) } : { ok: true };
```

**What is wrong.** The "✎ Correct this request" button (`:318`) appears on every
**pending** request, whoever is looking. The write is allowed by
`cr_update`: `has_perm('calls.create') OR has_perm('pending.register') OR
created_by = auth.uid()`. Reading the request is allowed far more widely:
`cr_read` starts with `can_view_all_calls()`, which covers every office role.
So an office role that is not the raiser can see the button and cannot write.
Its UPDATE matches **zero rows**, PostgREST returns no error, and the screen:

- says **"Request CRE-P1 corrected."**,
- merges the typed values into the drawer and the table (`setDetail(merged)`,
  `setRows(...)`),

so the register shows a correction the database does not hold, until the next
reload.

**Established by measurement.** On the test database, signed in (`call
public.be(...)`) as a `commercial` profile, I tried to correct a pending
installation request raised by an engineer:

```
 who           | sees_all | calls_create | pending_register | can_read_row
 as commercial | t        | f            | f                |            1
 rows updated  | 0
 stored serial afterwards | 20788        ← unchanged; the "correction" was 20789
```

Roles in this position by default are the office roles that
`can_view_all_calls()` names, apart from Hotline: commercial, nsm,
stores_incharge, spare_coordinator and tally_coordinator. They can read every
request but hold neither permission. Other roles are affected only for requests
they can read through their team, which was not measured. Commercial matters
most, because finding 32's new Workload card sends Commercial straight to these
requests.

**Fix.** Two parts, and both are needed:

- `.update(row).eq('id', id).select('id')`, and treat zero rows back as a
  refusal. `forceInherit` in `cover.ts:401` already does exactly this.
- Show the button only to somebody who can write: `can('calls.create') ||
  can('pending.register')`, or the raiser. `listCallRequests` does not map
  `created_by` onto the row today, so that has to be added first.

**0232's own test does not cover this.** `call_request_edit_test.sql` runs every
statement as the superuser, so RLS never applies to it. It proves the freeze;
it cannot prove who may correct.

---

## 31 — "+ Installation call" creates the call, silently fails to link it, and offers a second one

**Where** the per-machine button in the Warranty register's **Machines** list
(`src/modules/CoverRegister.tsx:1006-1010`, `raiseOneCall` at `:885`), and the
write-back in `raiseInstallCalls` (`src/lib/cover.ts:438`)

```ts
const { error } = await client().from('sale_items').update({ inst_call: ucn }).eq('id', it.id);
if (error) { return { created, error: `… could not be written back to the machine …` }; }
```

**What is wrong.** Raising an installation call is two writes: insert the call,
then write its UCN onto the machine's line. Each has its own gate:

| write | policy asks for |
| --- | --- |
| the call (`installation_calls`, `calls_insert`) | `has_perm('install.create')` |
| the link (`sale_items`, `sale_items_write`) | `has_perm('cover.edit')` |

The per-machine button is **not** under `canEdit` (unlike the button for the
whole sale at `:1134`). So a role holding `install.create` without `cover.edit`
gets this sequence:

1. The call is created.
2. The link UPDATE matches zero rows, with no error, so the `if (error)` branch
   that was written for exactly this case never runs.
3. `raiseOneCall` patches the row **and the cache** with the UCN, and says
   *"Installation call 26I… raised for 20788."*
4. On the next fresh read, `inst_call` is still blank. The button is back, and
   pressing it raises a **second installation call for the same machine**.

The doc comment on `raiseInstallCalls` names that outcome ("would be offered a
SECOND call on the next press") as the thing its stop-on-failure design exists
to prevent. It prevents it for a refused write, not for a write that "succeeds"
on zero rows.

**Who.** Hotline, both by the code defaults and by the `app_roles` row the
migrations store (`hotline | install.create t | cover.edit f`). Hotline is the
role that registers calls, so it is the likeliest to press this button.

**Established by measurement.** On the test database, signed in as a `hotline`
profile: `install.create = t`, `cover.edit = f`, the line is readable, and the
write-back UPDATE changed **0** rows, leaving `inst_call` blank. The call insert
itself was not replayed through the `calls` view. That half comes from the
policy above plus `has_perm('install.create') = t`.

**Fix.** `.select('id')` on the write-back, treating zero rows as the failure it
already handles. Also gate the per-machine button on `canEdit` like the other
one. Doing only the second would still leave any other caller exposed. **Check
first** whether it has already happened: see the query table.

---

## 32 — "Installations waiting on Commercial": the card's number and the list it opens disagree

**Where** `commercialInstallSection` (`src/lib/workload.ts:256`) over
`pendingInstallRequests` (`src/lib/supabase.ts`, ~:1728)

Three separate faults, all on the card added on 2026-09-22:

**(a) "Waiting on KYC" includes the customers it says it excludes.**

```ts
const blocked = rows.filter((r) => !isKycVerified(r.kyc_status));   // :259
const unknown = rows.filter((r) => !r.onMaster);                      // :260
```

A customer who is not on the Party Master has `kyc_status: ''`. That counts as
not verified, so the customer is in **both** `blocked` and `unknown`. The code's
own comment says those are "a different problem with a different fix". The
screen the card opens agrees with the comment, not the count:
`RequestCallRegistration.tsx:205` is `!!hit && !isKycVerified(hit.status)`. So
"Waiting on KYC: 7" opens a list of 7 minus the not-on-master ones, and the four
cards add up to more than "Installations pending". Fix: `blocked` =
`r.onMaster && !isKycVerified(...)`.

**(b) The read is not paged, and the card says it is exact.** The query selects
**every** installation request, of every status, oldest first, with no
`range()`, then filters to pending in the browser. PostgREST returns at most
1,000 rows (CLAUDE.md). So once the register has held more than 1,000
installation requests over its whole life, the rows that get cut off are the
**newest**, which are where pending ones are. Meanwhile `more: false` (`:270`)
tells the reader the count is exact. Fix: filter pending in the query, or page
with `allRows`. **Whether it already bites** is one count on the live project;
see the query table.

**(c) Smaller, in the same path:**

- The Party Master lookup ignores its error (`const { data: ps } = …`,
  `supabase.ts:1754`). If it fails, every customer reads as "not on the master",
  and the whole queue reads as waiting on KYC.
- The card sends `status: 'Pending'`. The register matches that exactly
  (`:149`, `String(r.status ?? '') === status`). `listCallRequests` maps a null
  status to `'Pending'`, but an **empty-string** status stays `''`. The card
  counts that as pending, so such a row is counted but not listed. 0003 defaults
  the column to `'Pending'`, so this only affects older rows.
- The register loads the newest 2,000 requests. A pending installation older
  than that is counted but not listed.

**Established by reading**: the card's filter set against the register's.
Nothing here was measured. The live counts are the queries.

---

# Found by the second re-review (2026-09-24, `main` at `ee732f4`)

**How this round was done.** Three reviewers read the 21 new commits in
parallel, split by area: Product Database and ownership, calls, and exports plus
the Hand Stock Report. Between them they raised 32 candidates. **Every finding
below was checked again by hand before it was written down**: measured against a
database built from all 265 migrations wherever it could be, otherwise read line
by line. What could not be checked again is listed at the end as exactly that.

## 33 — The Hand Stock Report's .xls download writes `[object Object]` in every date column

**Where** `src/modules/HandStockReport.tsx:168` builds the rows with
`xlsxCell(...)`, and `:187` hands those same rows to `xlsDownload`.

**What is wrong.** `xlsxCell` turns a timestamp into a date **object** that only
the **.xlsx** writer understands. The **.xls** writer's `cell()`
(`src/lib/xls.ts:69`) has no branch for that object. It is not a number, and
`excelSerial()` does not recognise it as a date, so it falls through to
`formatDayTime(v)`, which turns the object into text.

**Established by measurement.** A row built the report's way, written with the
real `buildXls`:

```
<Cell><Data ss:Type="String">[object Object]</Data></Cell>   ← Last In
<Cell><Data ss:Type="String">MP-010</Data></Cell>            ← part code, fine
<Cell><Data ss:Type="Number">3</Data></Cell>                 ← on hand, fine
```

Every date column (Last In, Last Out, Last Movement) comes out like the first
cell. The .xlsx and CSV downloads are correct. **Fix:** give the .xls writer the
raw values (`r[c.key]`). Its own `cell()` already recognises an ISO date and
writes a real DateTime. Only the .xlsx path should go through `xlsxCell`.

---

## 34 — Four roles see machines under contract as OGP, with no contract number

**Where** the `product_database` view (0239), `left join contract_pick`
(`0239:136`) with `security_invoker = on` (`:145`)

**What is wrong.** The view is right to run as the reader; CLAUDE.md requires
it. But its cover now comes from `contract_items` and `contract_entries`, and
those are readable only with `masters.view`, `cover.edit` or admin. `products`
itself is readable by anybody signed in. So a reader without those permissions
still gets every machine, but the contract join matches nothing, and the
`CASE` falls through to **OGP**. There is no error and no "hidden" marker.

**Established by measurement.** One machine under an active AMC contract, read
through the view:

```
superuser | AMC | MC-V3
hotline   | AMC | MC-V3        (masters.view = t)
engineer  | OGP | (blank)      (masters.view = f, opens /product-database = t)
```

**Who.** With the permissions the migrations store: **engineer,
spare_coordinator, stores_incharge and tally_coordinator**. All four open the
Product Database and hold neither permission. Lookup, Call Reporting's machine
list and Request Registration read the same view through `sbListPartyItems` /
`sbProductBySerial`. The field-call prefill copies Item Status from it
(`fieldcall.ts:182`). **Registrations are not affected by default**, because
every role that registers calls also holds `masters.view`, but any role later
given `calls.create` without it would stamp OGP on the call.

**The reviewer also measured the same cause on the installation call**:
`installation_calls` is scoped by the call-read policy, so an RM sees a blank
INST Call for a machine whose installation call is outside his team. I did not
re-measure that half.

**The decision to make:** let these roles read the contract rows (a policy
change), or compute cover in a `security definer` function that returns only
the derived columns. The second keeps contract terms private and still tells
the truth about cover.

---

## 35 — A machine's owner follows the transfer ENTERED last, not the one DATED last

**Where** `machine_current_party()` in
`supabase/migrations/0240_ownership_transfer_timestamp.sql:62-72`, which orders
transfers by `coalesce(t.transferred_at, t.created_at, …)`

**What is wrong.** 0240's own header says `transfer_date` is "the day the
machine changed hands … a fact about the business", while `transferred_at` is
"when the system was told". The function then orders transfers **against each
other** by when the system was told. That contradicts the upload's promise at
`src/lib/uploads.ts:1357`, *"a back-dated row loaded afterwards does not undo a
later one"*, and the same promise in `0072_ownership_transfer.sql:94`.

**Established by measurement.** Two transfers of one machine: first the 2024
hand-over to LATEST C was entered, then a missed 2020 hand-over to EARLIER B.

```
 owner now | EARLIER B
 LATEST C  | 2024-06-01 | 2026-09-24 21:24:56.64
 EARLIER B | 2020-03-01 | 2026-09-24 21:24:56.70   ← entered later, so it wins
```

**The same rule has a second consequence, reported by the reviewer.** 0240
back-filled `transferred_at` from `created_at`, which for imported transfers is
the day of the **import**. A sale's side of the comparison is its original
AppSheet `entry_at`. So every imported transfer now outranks every sale,
including a re-sale made years after the transfer. The reviewer measured this
(sale 2019 → transfer 2020 → re-sale 2023 reads the 2020 transferee); I have
not re-measured it, but it follows from the same line. 0240's closing `do`
block applies the rule to every transferred machine when it runs.

**Fix:** order transfers among themselves by `transfer_date`, falling back to
`transferred_at` only within a day. For the sale-versus-transfer comparison, use
the business dates on both sides. **Check first how many machines it has already
moved**: Step 0 query 10 in the handoff counts machines whose owner differs
between the two orders.

---

## 36 — Editing an older sale writes that sale's warranty onto the current owner's machine

**Where** `upsert_product_from_sale()`,
`supabase/migrations/0238_machine_belongs_to_its_latest_owner.sql:79-128`

**What is wrong.** The owner is taken from the **latest** event
(`v_party := machine_current_party(...)`, `:94`), but every other column comes
from **whichever sale line fired the trigger**, and the upsert overwrites all of
them (`:115-127`): the warranty number, warranty start and end, city, address
and engineer. So any edit to an older sale line rewrites the machine with the
older sale's cover, under the newer owner's name. The view then derives Item
Status from that warranty end.

**Established by measurement.** One machine, sold to CUSTOMER A in 2020
(warranty to 2021) and re-sold to CUSTOMER C in 2024 (warranty to 2027):

```
after both sales            | CUSTOMER C | DELHI | SA-V3-NEW | 2027-01-01 | WGP
after editing the old sale  | CUSTOMER C | PUNE  | SA-V3-OLD | 2021-01-01 | OGP
```

The edit was to `other_details` on the old sale's line. A machine under warranty
until 2027 now reads out of cover. The reviewer notes two more ways in, which I
read and agree with but did not measure: `transfer_to_product()` loops over
every sale line **with no `ORDER BY`**, so whichever line comes last wins; and a
bulk upsert of `sale_items` does the same in file order.

**Fix:** take the fields from the **latest** sale line for that machine, not
from `p_item_id`'s. Or return early when the line that fired is not the latest.

---

## 37 — Correcting a serial leaves a phantom machine; deleting a transfer blanks the owner

**Where** the sale-line trigger (`0237`, `0238`) upserts the **new** product +
serial and never touches the old one. The transfer trigger (`0238`) looks only
at `NEW` on an update and `OLD` on a delete.

**Established by measurement:**

- A sale line's serial corrected from `S7-TYPO` to `S7-REAL` on the Warranty
  register leaves **both** machines in the Product Database, each with the
  customer and the SA number. The phantom one will be offered in every machine
  search.
- A transfer deleted from a machine that had an imported owner leaves
  `party_name` **NULL**, not the imported owner. No screen deletes a transfer
  today (`ownership_write` needs `ownership.transfer`, and nothing in `src/`
  deletes one), so this half is reachable only directly.

**Read, not measured:** correcting a transfer's serial leaves the old machine
with the new owner, because `OLD` is not re-decided on an update.

---

## 38 — A 500-row transfer batch now takes 12.5 s of the 20 s limit, and grows with the register

**Where** `machine_current_party()` (0240) and `transfer_to_product()` (0238),
fired per row by `zz_transfer_to_product` and `zz_sale_item_to_product`

**What is wrong.** Both filter on `lower(btrim(coalesce(col, '')))`. The indexes
that exist are `lower(TRIM(BOTH FROM serial_number))` on `sale_items` and
`lower(serial_number)` on `ownership_transfers`. **Neither matches that
expression**, so every row of a batch scans both registers.

**Established by measurement**, at 20,000 sale lines and 4,000 transfers, with
the batch sizes `uploadRows` actually sends (`supabase.ts:4376`: 500, or 300 for
`_items`):

| batch | with the new trigger | trigger off |
| --- | --- | --- |
| 500 ownership transfers | **12,534 ms** | 273 ms |
| 300 sale lines | **4,152 ms** | — |

The live project's `statement_timeout` for `authenticated` is recorded as
**20 s** (`docs/BACKLOG.md:6113`). So this is not failing at this size, but it is
over half the limit, and the cost per row grows with both registers. **The
reviewer quoted an 8 s limit; the project's own measurement says 20 s**, and
this entry uses the project's. Fix: an expression index matching the filter
exactly, or filter on the expression the existing index is built on.

---

## 39 — The Item Status correction would send AMC spares past Commercial and NSM if applied

**Where** `supabase/apply/_item_status_as_at_the_complaint_date.sql` — a
hand-run file that writes when one word (`v_apply`) is changed to `true`

**What is wrong**, in order of consequence:

1. **It copies the contract's own word verbatim**:
   `coalesce(nullif(btrim(p.contract_type), ''), 'CMC')` (`:95`, and `:154` in
   the report). The contract register holds words like "Labour", and the project
   has a function for exactly this: `contract_cover_code('Labour')` = **AMC**.
   The file does not call it, and the stamp trigger's `cover_code('Labour')`
   leaves it as **Labour**. The spare request then inherits "Labour" from its
   call, and `spare_needs_commercial('Labour')` is **false** where
   `spare_needs_commercial('AMC')` is **true**. **Measured**: the four function
   calls above, on the test database.
2. **It decides contract before warranty** (`:32`, *"CONTRACT OUTRANKS
   WARRANTY"*). The Product Database view decides **warranty first**
   (`WHEN p.warranty_end >= CURRENT_DATE THEN 'WGP'` is its first branch), as
   does CLAUDE.md's rule for 2.0. A machine inside both would get the contract
   word on its old calls and WGP on new ones. The file also guesses **CMC** for a
   contract with no type, where the view says `CONTRACT (TYPE NOT RECORDED)`.
3. **Its "already approved" count counts requests nobody has approved**:
   `not in ('', 'Pending', 'RM')` (`:198`), but a new request's stage is
   `'RM Approval'` (the column default, checked). The file says to **read that
   row before applying**.

**`_how_stale_is_item_status.sql` has the same contract rule, and matches
machines on the serial alone** (`:87`, `:108`), the eleven-machines-numbered-219
trap.

**The file is being worked on in another session.** Two commits landed on
`main` during this review (`14e208e`, `4a75371`): they added rows 7–8 and
recorded, correctly, that correcting a request's status does not move its stage.
Neither touches the three faults above; the line numbers here are from after
them, and after `2f5419d`, a third commit that moved them again.

**Before anybody sets `v_apply := true`**: fix 1 and 2 at least. Nothing has
been written by this file unless somebody already flipped the switch; Step 0
query 13 shows which contract words it would copy.

---

## 40 — Four new probes return 2–3 result grids; the SQL editor shows only the last

**Measured** by running each against the test database and counting result grids:

| file | grids | what the hidden ones are |
| --- | --- | --- |
| `_why_do_the_two_report_counts_differ.sql` | 2 | the reconciliation the header tells you to read |
| `_how_stale_is_item_status.sql` | 3 | rows 1–4 and the spare list |
| `_why_are_pm_calls_still_open.sql` | 3 | the headline grid |
| `_rebuild_product_database.sql` | 2 | the counts the header promises (`:9`) |

CLAUDE.md: *"Write one statement that returns a report rather than several …
that editor shows one result grid."* `check:ui` refuses meta-commands, but it
does not count statements, which is why none of these was stopped.

**Also reported by the reviewers, read by me:**

- `_rebuild_product_database.sql` ends its list with `limit 1000` while calling
  it "the exact list", and its header names the wrong line for the switch.
- `_pm_call_numbers.sql` is committed cut off mid-`VALUES`. It does label itself
  "INCOMPLETE … DO NOT RUN", but it sits in `supabase/apply/`, where links are
  handed out.

---

## 41 — The Hand Stock Report's menu entry and its page ask for different permissions

**Where** `src/components/layout/Layout.tsx:227` (`adminOnly: true`) and `:282`,
against the route guard at `src/App.tsx:110`

**What is wrong.** The menu (and the module search) show an `adminOnly` entry to
roles holding `manage-users` or `admin.view`; the page checks
`mod:/handstock-report`. The user's own instruction, recorded in 0241, was
*"Default access to Admin/Super Admin, Rest of the Access I will select from
Roles & Permissions."* Ticking the report for, say, spare_coordinator gives that
role the page but **no menu entry and no search result**. Only typing the URL
reaches it. The reverse also happens: zoho_migration holds `admin.view` without
the key, so it sees an entry that opens the lock screen.

**Established by** reading both gates and querying `app_roles` on the test
database: only admin and technical_support hold `admin.view`.

The same gap exists for the other eleven `adminOnly` entries. It bites here
because this is the one screen the user has said they will grant role by role.
**Fix:** `navItemVisible` should ask for the module key for this entry. That
means `perm`, or dropping `adminOnly` and relying on the key, which 0241 already
grants to admin and technical_support.

---

## 42 — Excel and .xls downloads never check `export.data`; only CSV does

**Where** `src/lib/format.tsx:157` refuses a CSV without `export.data`.
`src/lib/xlsx.ts:203` and `src/lib/xls.ts:109` only ask `mayExport`, the
half-loaded warning. Neither has ever checked the permission.

**Why it matters now.** KPI Export's main button became Excel in `c61f1e7`, and
the Hand Stock Report offers both. So a role that is refused a CSV downloads the
same rows as a spreadsheet. The same was already true on Visit Reports and
Report Builder.

**A question this raised, which needs the live project.** No migration has ever
merged `export.data` into `app_roles`, except for Technical Support (0145). On
the test database, ten roles lack it, including hotline and rm. On the live
project, it depends on how the administrator has saved Roles & Permissions. The
query is in the table above. If the live rows also lack it, CSV downloads are
refused for most roles today, and this finding is the only reason Excel still
works.

---

## 43 — A request can now be filed with its calls against two different customers

**Where** `resolveMachines` (`src/modules/RequestCallRegistration.tsx:676`), which
runs at submit, and `itemCols` (`src/lib/supabase.ts:1655`), which writes each
call's own `party_name`

**What is wrong.** CR-007: *"The first call fixes the customer for the request"*,
status **met**. When a row's serial was typed rather than picked, it has no
customer. `resolveMachines` now looks each such row up in the register **on its
own**. It never checks the customer it finds against call 1's. The effect that
clears a stale machine from calls 2–5 runs only **after** the request has been
sent. So if two serials are typed without picking, call 1 can resolve to
customer A and call 2 to customer B, and the request is filed across both.

**Established by reading** the path through submit, `validate` and
`addCallRequestBatch`. Not reproduced in a browser.
`machineRowProblem` already says the rows *"may now be for different"*
customers; that comment predates this range. What is new is that the
register lookup can make it so without anybody picking anything. **Fix:** after
resolving, refuse a request whose non-installation rows name more than one
customer.

---

## 44 — Batch cancel exists only in SQL, where it records nobody as the canceller

`cancel_calls()` (0242) is sound: SECURITY INVOKER, a loop around `cancel_call`,
and one subtransaction per UCN. But **nothing in `src/` calls it**, so the user's
request (*"Cancel all these calls in 1 Go"*) can only be done in the SQL editor.
There `auth.uid()` is NULL, so `cancel_call` stamps
**`cancelled_by = NULL`** on every call. The quality record loses who cancelled
them. `_status.sql` row 185 also describes "the bulk Cancel button on the call
register", which does not exist.

**Established by** grep (no caller) and reading `cancel_call`'s body
(`cancelled_by = auth.uid()`). The reviewer measured the NULL. On the test
database, `has_perm` with nobody signed in returns `true` (the harness stub), so
the refusal path could not be probed the way the live editor behaves.

---

## 45 — The half-loaded-download warning gives advice that cannot be followed, or is missing where it is needed

All by reading `src/lib/exportscope.ts` against each caller:

- **The advice.** The pop-up says *"use 'Load more' until the button
  disappears"* (`exportscope.ts:73`). `cappedAt()` fires it on Stock Transfer,
  User Master, Pending Dispatch / Stock Out and the Field Failure register, none
  of which has a Load more button. It also says *"There are more in the
  register"*, where `cappedAt`'s own comment says only that there *may* be more.
- **Marked complete over a capped read.** RM Approval exports with `COMPLETE`
  (`SpareRmApproval.tsx:240`), but `listPendingRmApproval(cap = 2000)` stops at
  2,000 without saying so. Pending Dispatch, which has the same shape, correctly
  uses `cappedAt`.
- **A search that stops at 1,000 exports with no warning.** On Hand Stock
  (`HandStock.tsx:409`, `partial(more)` while a search result is a single
  1,000-row read) and on the Field, Installation and PM registers, where
  finding 18's capped search now also feeds the CSV.

---

## 46 — A manager's Hand Stock Report file says "your own stock only" and holds the team's

`src/modules/HandStockReport.tsx:147` writes `everyone ? 'every engineer' : 'your
own stock only'` into the file's About sheet (and a similar subtitle at `:202`).
`seesEveryRecord` is false for an RM, but the tables behind `handstock_balance`
show a manager his team (`cons_read`: mine **or my team's**). So the file
carries the team's stock under a label saying it doesn't. The reviewer measured
this with the scope suite's fixture; I checked the label and the policy. **Low**,
because the numbers are right and only the description is wrong. It is written
into a file that is reconciled against, though.

---

## More instances of existing findings

- **15 (non-unique order)** gains two. `objectiveEvidence` pages the
  `objective_evidence` RPC with `range()`, and the function orders only by
  `c.reg_date` (checked in the database). `listUnusedSpares` orders by
  `"Dispatched On", ucn`, which ties for two parts on one call dispatched the
  same day. **Both downloads are marked complete.**
- **16 (frozen auto-refresh guard)**: the Product Database instance
  (`ProductMaster.tsx`, now `:143-146`) was reported again this round. It is
  **not** a new instance: finding 16 already lists it as `ProductMaster.tsx:117`.
  An earlier version of this section miscounted it as a sixth.
- **18 (search cap reported as the answer)**: the same 1,000-row search now
  feeds the register's CSV, with no warning. See 45.
- **21 (a count over one page)** gains the Product Database's title badge,
  `count={rows.length}` with no `countMore` (`ProductMaster.tsx:173`), over a
  register of about 20,000.

## Questions, not findings

- **0239 no longer falls back to the contract stored on the machine.** A machine
  whose contract was imported onto it but never loaded into the contract
  register now reads OGP. So does one whose contract names the customer with
  different punctuation. This carries out the user's own rule (*"Contract has
  to match the product, serial no, party"*), and the stored value is still
  shown as `contract_number_keyed`, so I have **not** recorded it as a bug. How
  many machines it affects is a fact about the live data: query in the table
  above.
- **Whether `export.data` is granted on the live project.** See 42.

## Reported by the reviewers and not re-checked

Listed so nothing is lost. Each is a candidate, **not** a finding:

- **`_why_do_the_two_report_counts_differ.sql`**: said to count orphan visits
  twice and then print "DOES NOT RECONCILE" when the counts do reconcile. The
  reviewer measured it.
- **`_which_product_names_carry_stray_spaces.sql`**: said to have a row 4 that
  can never fire.
- **`_where_is_this_machine.sql`**: said to give a confident wrong verdict for a
  partial product name.
- **Request Registration**: remembered machine hits could let a slow, stale
  reply win.
- **Call Type clean-up**: finds only the exact spelling `'Call Type'`.
- **Importer change**: headings now dropped for five other registers.
- **Knowledge Base**: a retired product cannot be re-selected once
  deselected.
- **`xls.ts`**: would give a date-only value 05:30. Latent, because no caller
  sends one yet.
- **DCCR mirror in `CallReg.gs`**: writes dates as UTC midnight into the sheet.
  Read only; Apps Script cannot run here.
- **`dberror.ts` timeout advice**: tells the Hand Stock Report to "narrow" a
  search it cannot narrow.
- **`machineHistory()`**: reads 500 calls per serial with no order.

## Checked this round and found sound

- **`cancel_calls` permissions.** It cannot widen anybody's reach, and it never
  deletes anything. Its suite passes on a copy.
- **0236.** The cover policies are the same audience as before, evaluated once
  per query.
- **`product_database`.** It keeps `security_invoker` and its grant, and it
  cannot duplicate rows through the Party Master join.
- **Product Database paging.** `created_at desc, id desc` is unique.
- **KPI Excel.** Dates are whole-day serials, a leading-zero UCN stays text, and
  integers stay numbers.
- **Hand Stock Report sums and paging.** The arithmetic matches the six
  movement kinds, and paging is ordered by (engineer, part_code), which is
  unique.
- **0241.** It merges, never overwrites, and leaves an empty role alone.
- **No new hand-run SQL file contains a psql meta-command.**

---

# By module (all 62 screens, `main` at `2f5419d`)

The same findings, filed under the screen they affect, in `MODULES` order.
**Bold number** = the finding; H / M / L = High / Medium / Low. A finding that
touches several screens is listed under each. "Improve" lines are limited to
what this review has evidence for: the check that would have caught a finding,
or a decision the findings raise. They are not a wish-list. **"Not read
closely"** means only a scan for the known fault patterns; that is not the
same as "no bugs".

**Overview**

- **Dashboard** — **2** H "Engineers Active" capped at 6 · **3** M "most recent 300" caption over an exact number · **4** M a private month-first date parser.
- **My Workload** — **1** H "Awaiting me" counted before the access scope exists · **32** M the Commercial installations card disagrees with the list it opens, and its read is unpaged.
- **Product & Party Search** — **5** M machine search stops at 200 silently · **34** H cover shown as OGP to roles that cannot read contracts (same view).
- **Machine History** — no open finding (its row-id bug was fixed on `main`, `1451a2b`). Reported but not re-checked: `machineHistory()` reads 500 calls per serial with no order.

**Quality & analytics**

- **Daily Complaint Review Register** — **9** M "To be Reviewed" counted against the whole register · **10** M two loads can interleave · **8** M `countCallReviews` / `reviewPickLists` page with no order.
- **Product Failure Analysis** — **7** H workbook dates exported as text · **42** M Excel skips `export.data`.
- **Spare Insights** — **13** L date window is a UTC day · **14** L "By product" is the top 25 without saying so.
- **Call Review** — **17** M claims "every solved call has been reviewed" from a filtered list · **8** M `listCallReportReviews` pages with no order.
- **Field Failure Register** — **6** H the Word report can never carry a signature · **7** H Insights workbooks export dates as text · **45** L download warning offers a Load more that does not exist.
- **KPI & Failure Analysis** — **11** M the product chip narrows one card of three · **12** L cover tiles bucket by overlapping substrings.
- **Objective** — **7** H workbook dates as text · **15** H its evidence RPC is paged on `reg_date` alone, and the file is marked complete · **42** M.

**Masters**

- **Party Master** — **15** H paged on `party_name` alone · **16** M 30-minute refresh overwrites a filtered view.
- **Product Database** — **34** H contract machines read OGP for four roles · **35** H owner follows the transfer entered last, not dated last · **36** H editing an old sale writes its warranty onto the machine · **37** M phantom machine after a serial correction; deleting a transfer blanks the owner · **16** M frozen refresh guard · **21** M title count has no `+`. *Improve:* the 0239 question (stored contracts no longer shown), with a live query.
- **Product Database 2.0** — no finding.
- **Product Master (product lines)** — no finding.
- **User Master** — **23** H correcting a name empties that person's team · **8** M `listDirectoryAsUsers` pages with no order · **45** L export warning advice.
- **Part Master** — **16** M frozen refresh guard.
- **All Masters** — no finding. *Note:* `listAllMasterValues` (finding 15's list) has no callers today.

**Knowledge base**

- **How RITHI Functions** — no finding.
- **Service Manuals**, **QMS Documents** — not read closely.

**Cover**

- **Warranty Register** — **31** H "+ Installation call" creates the call, silently fails to link it for Hotline, and offers a second · the source of **36** and **37** (sale edits and serial corrections).
- **Contract Register** — **29** L Renew pressed before the machines load starts empty.
- **Ownership Transfer** — the source of **35** and **37** · **38** M its upload batch now takes 12.5 s of a 20 s limit.

**Service calls**

- **Request Registration** — **30** H "Correct this request" says corrected when nothing was saved · **43** M a request can be filed against two customers (CR-007) · **34** its machine list reads the same view.
- **Pending Registrations** — no open finding.
- **Field Call Register**, **Installation Calls**, **Preventive (PM)** (one component) — **18** M a capped search reported as the answer, and "Loaded all" over 800 · **7** H register CSVs carry the wire value, not the date · **26** M a visit dated on the form reads back at 05:30 (Call Reporting, opened from here) · **44** L batch cancel exists only in SQL · **45** L a capped search exports with no warning.
- **Pending Calls** — **17** M "everything is closed" from a scoped list.
- **Visit Reports / Service Reports** — **16** M frozen refresh guard · **26** M (Call Reporting is opened from here too) · **42** M.
- **Bulk Report Mapping** — no finding (checked: its Convert is gated on the same permission its write policy asks for).
- **PM Bulk Upload** — not read closely.
- **Bulk Uploads** — **38** M ownership-transfer and sale-line batches slowed by the new triggers.
- **Data Export** — **27** H every table paged with no order, in a file that leaves the building.

**Spares**

- **Spare Requests** — **20** H "Not Approved" reads as approved, so a refused line reaches Stores · **15** H paged on `created_at` alone · **22** M auto-sync throws away all pages but the first.
- **RM Approval** — **17** M "every spare has had its first approval" from a scoped list · **45** L exported as complete over a 2,000-row cap.
- **Pending Dispatch** — **21** M chips count one page as the register · **45** L warning advice.
- **Stock Out** — **25** M an exact count over a capped read · **45** L warning advice.
- **Spare Consumption** — **15** H paged on `created_at` alone · **22** M auto-sync keeps only page one.
- **Hand Stock** — **21** M "Short" chip counts one page · **15** H movements paged on `moved_at` alone · **45** L a 1,000-row search exports with no warning.
- **Material Returns (MRN)** — **28** M two lines of one MRN share a row id, so one is not drawn.
- **Stock Transfer** — **45** L warning offers a Load more that does not exist.

**Feedback & reports**

- **Customer Feedback** — **19** M chips count only the loaded page · **15** H paged on `created_at` alone · **22** M auto-sync keeps only page one.
- **Reports** (hub) and **Consumption Report**, **Call Report**, **Customer Feedback Report** — no open finding; they share `ReportBuilder`, which shapes dates correctly. **42** M its Excel skips `export.data`.
- **KPI Export** — **15** H paged on the registration date alone, file marked complete · **42** M Excel is now the main button and skips `export.data`. Its new Excel dates were measured correct. The rest of the screen was not read closely.
- **Not Consumed Against this Call** — **7** H workbook dates as text · **15** H two reads ordered by non-unique columns (`ucn`; `Dispatched On, ucn`), file marked complete.
- **Feedback Without a Report** — no finding (read closely, clean).
- **Hand Stock Report** — **33** H `.xls` dates read `[object Object]` · **41** M menu asks for `admin.view`, the page for its own key · **46** L a manager's file labelled "your own stock only" · **42** M.
- **Indoor Service Register** — no finding.
- **Solved Without a Report** — not read closely (its export's paging was checked: sound).
- **Tracker** — not read closely.

**Administration**

- **User Access** — not read closely.
- **Roles & Permissions** — **24** fixed on `main` (`1bf248e`). No open finding. *Improve:* grant `export.data` by migration if the live roles lack it (finding 42's question).
- **Audit Log** — **15** H paged on `at` alone · **16** M frozen refresh guard.
- **Admin Config**, **Software Validation**, **Settings**, **Version History** — not read closely.

**Not a screen**

- **Hand-run SQL in `supabase/apply/`** — **39** H the Item Status correction would route AMC spares past Commercial and NSM if applied · **40** M four probes return more grids than the SQL editor shows.
- **Checks that would have caught whole classes** (improvements):
  - Refuse a paged read without a unique order (**8**, **15**, **27**).
  - Refuse a hand-run file that returns more than one grid (**40**).
  - A suite that reads or writes **as the affected role** (**30**, **31**, **34**). Many suites already impersonate with `call public.be(...)`, but none covers these three. The one behind 30, `call_request_edit_test.sql`, runs as superuser, so RLS never applies to it.
