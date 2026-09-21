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
