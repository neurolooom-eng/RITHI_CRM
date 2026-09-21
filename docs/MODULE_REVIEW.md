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

**Nothing here is fixed.** This is the record; the repairs are separate changes,
each with the check or suite that would have caught it.

**Baseline.** On `a657d7d` (`main`, 2026-09-21) `npm run typecheck` passes and
every database-free check passes: `check:ui`, `check:uploads`, `check:dberror`,
`check:paging`, `check:picklist`, `check:mapping`, `check:generated`,
`check:bundles`, `check:safe-updates`. So everything below is in the gap those
checks do not cover — which is the gap this project keeps finding things in.

| # | Module | What | Severity |
| --- | --- | --- | --- |
| 1 | My Workload | "Awaiting me" is counted before the access scope exists, and never recounted | High |
| 2 | Dashboard | "Engineers Active" is capped at 6 by the chart's own `slice` | High |
| 3 | Dashboard | Two KPI cards say "most recent 300" over a number that is the whole register | Medium |
| 4 | Dashboard | A private date parser, month-first, where the project has one day-first parser | Medium |
| 5 | Product & Party Search | A machine search stops at 200 rows and says nothing | Medium |
| 6 | Field Failure Register | The Word report can never carry a signature — the handler was frozen before it loaded | High |
| 7 | *cross-cutting* | Four workbooks and every register CSV carry the wire value, not the date (**measured**) | High |
| 8 | *cross-cutting* | Seven paged reads page with no `order()` | Medium |
| 9 | Daily Complaint Review | "To be Reviewed" counts its list against the whole register | Medium |
| 10 | Daily Complaint Review | Two deep loads can interleave; the last writer wins and may be the tab you left | Medium |
| 11 | KPI & Failure Analysis | The product chip narrows one KPI card and not the two beside it | Medium |
| 12 | KPI & Failure Analysis | Cover tiles bucket by substring, and the two patterns overlap | Low (latent) |
| 13 | Spare Insights | The date window is a UTC day, the reader's is an IST one | Low |
| 14 | Spare Insights | "By product" is the top 25 and does not say so | Low |
| 15 | *cross-cutting* | Nine paged reads order by a column that is not unique — rows doubled and dropped (**measured in Postgres**) | High |
| 16 | *cross-cutting* | Five auto-refreshers test a filter flag frozen at the first render, so they overwrite a filtered view | Medium |
| 17 | *cross-cutting* | Three screens tell everybody "everything is done" from a list that is filtered, scoped and capped | Medium |
| 18 | Field Call Register | A search reports its capped 1,000 as the match count; ↻ Refresh claims "Loaded all" over 800 | Medium |
| 19 | Customer Feedback | The Uploaded / Entered-here chips count only the loaded page, with no `+` | Medium |

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
`sheets.ts:157-158` turns a `0` limit into `sb.listCalls(type, 100000)`, which
**pages** in 1,000-row blocks (`supabase.ts:235-248`). So the value is the entire
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

**Worth checking beside it** (not verified in this pass): every other screen that
memoises columns containing a handler over asynchronously-loaded state has the
same shape. `Reports.tsx`, `SpareDispatch.tsx` and `DeliveryChallan.tsx` all
render signature blocks.

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

**Where** `src/lib/supabase.ts` — `distinctColumn` (:773), `sbSearchProducts`
(:1403), `listDirectoryAsUsers` (:2009), `sbEngineerNames` (:2149),
`countCallReviews` (:2285), `reviewPickLists` (:2315), `listCallReportReviews`
(:4618)

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
counted in the same sweep for exactly this tab (`supabase.ts:2294-2299`), and used
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
| `listFeedbackRows` (:3272) | `created_at` | Customer Feedback's Load more | the 24,092-row import shares one timestamp |
| `listConsumptionRows` (:3264) | `created_at` | Spare Consumption's Load more | the bulk consumption upload does |
| `listSpareRequestLines` (:2730) | `created_at` | Spare Requests' Load more | every line of one request is written together |
| `queryAudit` (:2101) | `at` | Audit Log's Load more | a burst of writes shares the second |
| `queryParties` (:1108) | `party_name` | Party Master's Load more | two branches of one hospital group |
| `listAllHandstockMovements` (:3249) | `moved_at` | Hand Stock's Load more | a dispatch moves many parts at once |
| `listKpiFieldInst` (:376) | `Call Registeration Date` | the KPI **export** loop | a date column, by construction |
| `listAllMasterValues` (:2498) | `name` | its own internal loop | a master list is *many values per name* |
| `unusedSpareEngineers` (:637) | `ucn` | `allRows` | one call carries several parts |

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

The worst two are the ones nobody would re-check: `listKpiFieldInst` feeds a
**file** somebody sends on, and `listAllMasterValues` pages by `name` when a
master list holds hundreds of values under one name — page boundaries fall
inside a single list.

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
(`supabase.ts:255-260`). Certain.

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
