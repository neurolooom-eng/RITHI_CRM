# Handoff — fixing what `MODULE_REVIEW.md` found

This is the **doing** document. `docs/MODULE_REVIEW.md` is the evidence: what is
wrong, how it fails, and how each claim was established. This one says **what to
change, in what order, and how to know it worked** — written so it can be worked
straight into `main` without going back to the session that produced it.

**The patches below are written, not compiled.** Every line number and every
"current" snippet was read off the tree, but no patch here has been applied or
type-checked. Treat them as precise descriptions of the change, not as diffs to
paste blind — `npm run build` after each batch is the check that matters.

**A line number is a hint; the quoted snippet is the citation.** `main` moved
five times while this was being written, three of them into `supabase.ts`, which
gained about a hundred lines in the middle — most citations into it drifted each
time.
Line numbers here were re-checked against `main` at `092448e` (2026-09-23).
If one is off by a few when you get there, **search for the quoted "current"
snippet**, which is what actually identifies the code. Reads in `supabase.ts`
are cited by function name in `MODULE_REVIEW.md` for the same reason.

**Where things stand (re-review, 2026-09-23).**

- **Finding 24 is fixed on `main`** (`1bf248e`). Its section, C2, is kept only
  as a pointer.
- Findings 1–23 and 25–27 were re-checked and still hold.
- The re-review added **28–32**, as sections A12, A13, B9 and C6. Two of them,
  **C6 (findings 30 + 31)**, are the most urgent new ones. **Read C6 before
  anything in Batch A.**

---

## Step 0 — nine queries, before any code

Nine findings depend on facts about the **live Supabase project** that this
repository cannot know. Run these first in the SQL editor; two of them may make a
fix unnecessary, and two may turn a "possible" into "already happened".

```sql
-- 1. Finding 20 (HIGH). Which values does the approval column actually hold?
--    Anything outside Approved / Auto-Approved / Rejected / Pending is a line
--    the register is describing wrongly RIGHT NOW.
select rm_approval, count(*) from public.spare_request_lines group by 1 order by 2 desc;
select commercial_approval, count(*) from public.spare_request_lines group by 1 order by 2 desc;
select nsm_approval, count(*) from public.spare_request_lines group by 1 order by 2 desc;

-- 2. Finding 13. If this says Asia/Kolkata there is nothing to fix.
show timezone;

-- 3. Finding 25. Under 5,000 and the Stock Out count is honest today.
select count(*) from public.spare_stock_out_lines;

-- 4. Finding 12. Anything outside WGP / OGP / CMC / AMC makes the KPI
--    cover tiles double-count.
select item_status, count(*) from public.calls group by 1 order by 2 desc;

-- 5. Finding 14. Over 25 and the "By product" table is silently truncating.
select count(distinct coalesce(nullif(btrim(product_name), ''), '— not set —'))
  from public.spare_usage;

-- 6. Findings 30 + 31 (HIGH). Who is actually affected on the live project.
--    may_correct_others = f on a role that can read every request -> finding 30.
--    raises = t and maps = f -> finding 31 (on a database built from the
--    migrations, hotline reads t / t / f).
select role,
       permissions ? 'calls.create' or permissions ? 'pending.register' as may_correct_others,
       permissions ? 'install.create' as raises,
       permissions ? 'cover.edit'     as maps
  from public.app_roles order by 1;

-- 7. Finding 31. Has it already happened? Two installation calls for one machine.
select serial, product_name, count(*), string_agg(ucn, ', ' order by created_at) as ucns
  from public.installation_calls
 group by 1, 2 having count(*) > 1 order by 3 desc limit 20;

-- 8. Finding 32. Over 1,000 and the Commercial card is already missing the
--    newest pending installations.
select count(*) from public.call_requests where call_type ilike 'INSTALL%';

-- 9. Finding 28. Any rows here are MRN lines the screen is drawing as one.
select uid, row_no, count(*) from public.material_returns
 group by 1, 2 having count(*) > 1 limit 20;
```

Queries 6–9 were run against a database built from every migration, so their
column names are right. They returned nothing there because it holds no data.
**On query 7, two calls for one machine is not always this bug**: a genuine
re-installation looks the same. The UCNs are listed in the order they were
created, so compare their dates.

**If query 1 returns anything unexpected**, that is the one to act on before
anything else on this page. The affected lines can be listed with:

```sql
select l.id, r.or_no, r.engineer, l.part, l.rm_approval, l.stage
  from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
 where l.rm_approval is not null
   and l.rm_approval !~* '^(approved|auto-approved|rejected|pending)$'
 order by l.id;
```

---

## The order to work in

Three batches, and they are ordered by **what a mistake costs**, not by severity:

1. **Batch A — mechanical.** Each is a few lines, none changes a rule, none needs
   a decision. Do them in one branch, one commit each. ~13 fixes.
2. **Batch B — small, but the change has a shape to get right.** Still no
   decision needed; more care per fix. ~9 fixes.
3. **Batch C — needs a decision from you.** These are the ones where the *right*
   answer is a product/ops judgement, not a patch. C2 is fixed. Do not let the
   rest block A and B, with two exceptions. **C6** is urgent (see below).
   **C5** is small and about a file that leaves the building.

Batches A and B together clear 23 of the 31 open findings and touch no SQL, so
they ship as one ordinary front-end change: `npm run build`, changelog entry,
version bump, merge, deploy.

**C6 comes first, before A, even though it sits in Batch C.** It needs no
decision for its main fix, only for where the button is shown. Its failure is a
duplicate installation call and a correction the screen claims but never stored.

---

# Batch A — mechanical

## A1 · Finding 2 (HIGH) — "Engineers Active" capped at 6

`src/modules/Dashboard.tsx:146`

```tsx
// current
<KpiCard label="Engineers Active" value={topEngineers.length} tone="neutral" icon="🧑‍🔧" />
```

```tsx
// change — count the distinct engineers, the way the card above counts parties
<KpiCard label="Engineers Active" value={activeEngineers} tone="neutral" icon="🧑‍🔧" />
```

and add beside `uniqueParties` (`:116`):

```ts
const activeEngineers = new Set(all.map((r) => g(r, 'allocatedTo').trim()).filter(Boolean)).size;
```

**Verify** — open the Dashboard with more than six engineers in the register; the
card should exceed 6 and match `select count(distinct allocated_to) from calls`.

---

## A2 · Finding 3 — "most recent 300" over the whole register

`src/modules/Dashboard.tsx:138-139` — delete both `sub` props, or replace with
`sub="every call on the register"`. The values are already exact (`listCalls`
pages to 100,000), so nothing else changes.

**Verify** — read it. The number and the caption have to agree.

---

## A3 · Finding 9 — "To be Reviewed" counted against the whole register

`src/modules/DailyCallReview.tsx:466`

```ts
// current
const inView = (deskStage || status) ? statusCount(deskStage || status) : counts.total;
```

```ts
// change — the todo tab has its own count, already computed for it
const inView = todo
  ? counts.solvedPending
  : (deskStage || status) ? statusCount(deskStage || status) : counts.total;
```

**Verify** — on **To be Reviewed** the pane header's "of N" must equal the number
on the tab's own badge (`:647`). They are the same set.

---

## A4 · Finding 11 — the KPI row half-honours its product chip

`src/modules/KpiAnalytics.tsx:136-138`

```ts
// current
const fleet = rates.reduce((t, r) => t + num(r.machines), 0);
const calls12 = rateRows.reduce((t, r) => t + num(r.calls_12m), 0);
const fleetRate = fleet ? (rates.reduce((t, r) => t + num(r.calls_12m), 0) * 100) / fleet : 0;
```

```ts
// change — all three read the SAME set, and that set follows the chip
const fleet = rateRows.reduce((t, r) => t + num(r.machines), 0);
const calls12 = rateRows.reduce((t, r) => t + num(r.calls_12m), 0);
const fleetRate = fleet ? (calls12 * 100) / fleet : 0;
```

Then make the two silent cards say their scope, as the middle one already does:
add `sub={product || 'every product'}` to **Machines in the field** and
**Failure rate**.

**Verify** — pick a product chip; the three cards must be readable together
(`calls12 / fleet * 100 ≈ fleetRate`), and `fleetRate` must match that product's
row in the table below.

---

## A5 · Finding 12 — cover tiles bucketed by overlapping substrings

`src/modules/KpiAnalytics.tsx:118-119`

```ts
// current — /warr/ and /out of/ both match "OUT OF WARRANTY"
const ogpQty = byCover.find((c) => /ogp|out of/i.test(c.label))?.qty ?? 0;
const warrantyQty = byCover.filter((c) => /warr|wgp/i.test(c.label)).reduce((t, c) => t + c.qty, 0);
```

```ts
// change — use the project's own normaliser, which matches the WHOLE string
import { coverCode } from '../lib/fieldcall';
…
const coverQty = (code: string) =>
  byCover.filter((c) => coverCode(c.label) === code).reduce((t, c) => t + c.qty, 0);
const ogpQty = coverQty('OGP');
const warrantyQty = coverQty('WGP');
```

**Verify** — `ogpQty + warrantyQty` must never exceed `totalQty`. Add a row to
`scripts/check-ui.ts` refusing a `/warr|ogp/`-style regex in a module; the
`coverCode` client/SQL comparison it already runs is the precedent.

---

## A6 · Finding 14 — "By product" is silently the top 25

`src/modules/SpareInsights.tsx`, in the **By product** card (after the table,
`:195`), add the same sentence its sibling carries:

```tsx
<p className="muted" style={{ fontSize: 12.5 }}>The twenty-five biggest consumers in this window.</p>
```

Only do this if Step 0's query 5 returns more than 25. If it does not, the table
is complete and the caption would be the lie instead.

---

## A7 · Finding 19 + 21 — chips counting one page as the register

Three files, one pattern. **`SpareRequests.tsx:663` is the model**:

```ts
const partial = onDb && more;
…
<b>{count}{partial ? '+' : ''}</b>
```

- `src/modules/CustomerFeedback.tsx:181,187` — the All / Uploaded / Entered-here
  chips. `more` is already in scope.
- `src/modules/HandStock.tsx:337,346,347,348,349` and `:525,527` — Stock Level,
  In hand, ⚠️ Short, Settled, All, and the movement chips. `more` is in scope.

**Verify** — load a register with more than one page and check every chip shows
`+` until Load more is exhausted.

---

## A8 · Finding 25 — Stock Out's exact count over a capped read

`src/modules/StockOut.tsx:42-45`. The comment is wrong (`listStockOutLines` is
`allRows`, capped at 5,000), so either:

- **if Step 0's query 3 is well under 5,000** — fix the comment only, and say
  what it depends on, the way `IndoorService.tsx:173-175` does; or
- **if it is near or past it** — have `StockOuts` report whether the read hit the
  cap and pass that through to `countMore`.

**Never leave the comment as it is.** A false justification is what stops the
next reader checking.

---

## A9 · Finding 5 — the machine search stops at 200

`src/modules/Lookup.tsx:144`

```ts
// current
const rows = await searchProducts({ product: product.trim(), serial: serial.trim(), exact }, 200);
```

The honest minimum is to ask for one more than you show and say so:

```ts
const CAP = 200;
const rows = await searchProducts({ product: …, serial: …, exact }, CAP + 1);
const list = rows.slice(0, CAP).map((r, i) => ({ ...r, id: String(i) })) as Row[];
setFound(list);
setTruncated(rows.length > CAP);
```

and render `{truncated && <div className="sheet-banner sheet-banner-info">Showing
the first {CAP} — narrow the search to see the rest.</div>}` above the table.

**Verify** — search a product with more than 200 machines (ORION-G, per
CLAUDE.md) and confirm the banner appears.

---

## A10 · Finding 6 (HIGH) — the FFR Word report's frozen signature

`src/modules/FieldFailureReport.tsx:197`

```ts
// current
], []);
```

```ts
// change — primitives, not the user object
], [mySig, user?.email, user?.fullName]);
```

`doc` is redefined each render, so the memo simply has to be allowed to see the
current one. **Depend on the primitives, not on `user`**: the auth context builds
a new `can` and a new context value on every render, so `[mySig, user]` would
rebuild the columns far more often than the signature actually changes.

**`DeliveryChallan.tsx:96-97` is the model** — it computes the block in the
render body, so there is no memo to get wrong. If you prefer that shape, lift
`doc` out of the memo and pass the signature in as a prop; either works.

**Verify** — save a signature under My Profile, raise an FFR as yourself, press
📄 Word: the signature block must carry it. The audit row's
`meta.signed` must read `true` (it is hard-wired `false` today).

---

## A11 · Finding 1 (HIGH) — My Workload counts against an empty team

`src/modules/Workload.tsx:82`

```ts
// current — runs once, while useAccessScope() is still EMPTY
useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
```

```ts
// change — load once, when the scope that feeds mayRmApprove has arrived
useEffect(() => { if (scope.ready) load(); /* eslint-disable-next-line */ }, [scope.ready]);
```

`scope.ready` goes `false → true` exactly once (every branch of `useAccessScope`
sets it), so this fires once, with the resolved scope, and the wrong first load
never happens at all.

**Do not put `load` in the deps.** It is a `useMemo` over `[can, email,
mayRmApprove]`, and `can` is rebuilt on every render of `AuthProvider` — so
`load`'s identity changes whenever the auth context re-renders, and the page
would re-read seven registers each time. `scope.ready` is the signal; `load` is
not.

**Verify** — as a Reporting Manager, **⚡ Awaiting me** on My Workload must equal
the ⚡ chip on Spare Requests. They call the same `actionable()`; today they
disagree.

---

## A12 · Finding 28 — MRN lines sharing a screen row id

`src/modules/MaterialReturns.tsx:89` (`load`) and `:112` (`loadMore`).

```ts
// current (both places; :112 uses `offset + i`)
id: `${String(x.uid ?? '')}-${String(x.row_no ?? i)}`
```

```ts
// change — the table's own key, which is unique by construction
id: String(x.id)
```

`listMaterialReturns` selects `*`, so `id` is already on every row. The
database's unique index is
`(uid, part_code(part), coalesce(row_no, 0))`. So `uid-row_no` can repeat
whenever the parts differ, and `id` cannot.

**Also clear the cache.** The screen caches the mapped rows under `CACHE_KEY`.
Rows cached under the old ids are harmless but will sit there until the next
sync; bump the cache key if you want them gone at once.

**Verify** — Step 0 query 9. For any `(uid, row_no)` it returns, the screen must
show every line of that MRN, and the count shown must match the rows.

---

## A13 · Finding 29 — Renew seeded before the machines load

`src/modules/CoverRegister.tsx:1180`. Disable the button until the machine list
has arrived. The simplest honest signal is a `loadingItems` flag, set around the
`listItems` call at `:746-747`:

```tsx
<button className="btn" style={{ marginTop: 14 }} disabled={loadingItems}
  onClick={() => setRenewing(true)}>
```

Do **not** fix it by re-seeding `RenewPanel`'s `useState` from `items` in an
effect. That would overwrite whatever the user has already ticked or typed in
the panel.

**Verify** — open a contract with machines and press Renew at once; every
machine must start ticked.

---

# Batch B — small, with a shape to get right

## B1 · Finding 16 — five auto-refreshers with a frozen guard

`PartyMaster.tsx:207`, `PartMaster.tsx:100`, `AuditLog.tsx:66`,
`Reports.tsx:173`, `ProductMaster.tsx:117`.

Each registers `setInterval(() => { if (!hasFilter) refresh(); }, …)` inside a
`useEffect(…, [])`, so the guard is the first render's `false` for ever.

**`CoverRegister.tsx:737-742` is the model** — it registers the same interval
with the filter in its deps, so the effect is rebuilt when the filter changes.
Split each of the five into two effects:

```tsx
// 1. mount only: cache / first load — unchanged, stays on []
useEffect(() => { …existing first-load logic… /* eslint-disable-next-line */ }, []);

// 2. the timer, which must see the CURRENT filter
useEffect(() => {
  if (!supabaseConfigured()) return;
  const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
  return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hasFilter]);
```

`ProductMaster.tsx:117-121` computes `anyFilter` from `f` inside the callback —
same fix, deps `[f]`.

**Verify** — set a filter, wait out `SYNC_TTL_MS` (or drop it to 10s locally),
and confirm the list is still filtered. Today it silently becomes the unfiltered
first page with the boxes still filled in.

---

## B2 · Finding 22 — the auto-sync discards every page but the first

`SpareRequests.tsx:631`, `SpareConsumption.tsx:246`, `CustomerFeedback.tsx:94`.

**`HandStock.tsx:171` is the model**: `load(want = Math.max(PAGE_SIZE, loaded))`
re-reads as far as the reader had got. Give each of the three the same shape —
`load()` takes how much to re-read, defaults to what is loaded, and the interval
calls it with no argument.

**Verify** — press Load more twice, wait out the interval, and confirm the row
count does not drop back to one page.

---

## B3 · Finding 17 — three screens claiming "everything is done"

`CallReview.tsx:256`, `PendingCalls.tsx:267`, `SpareRmApproval.tsx:254`.

**`SpareDispatch.tsx:94-103` is the model.** Two things to fix in each, and the
first matters more than the second:

1. **Distinguish "no rows" from "no rows matched your filter".** All three test
   the *filtered* list, so a search that matches nothing prints the absolute
   claim. Test the unfiltered set for the claim, and say "nothing matched" when a
   filter is on.
2. **Qualify by scope.** Use `seesEveryRecord(user, can)` from `../lib/rbac` —
   it takes the USER, never `user.role` — and only make the strong claim when it
   is true. Otherwise: *"Nothing waiting that you can see. Your role is shown its
   own and its team's …"*

**Verify** — as an engineer with no calls allotted, Pending Calls must not say
"everything is closed". Typing a nonsense search on any of the three must not
either.

---

## B4 · Finding 18 — the 1,000-row search cap reported as the answer

`src/modules/FieldCalls.tsx:718-727` and `:673-679`.

- Ask for `1001`, show 1,000, and say "1000+ matches — narrow the search" when
  the extra row comes back. `moreAvailable` (`:986`) is deliberately `false`
  while searching; leave that, and let the banner carry the `+`.
- `:675` — "Loaded all {n}" on the database path is false; it is the most recent
  `loadLimit`. Say what the sheet path says three lines below: "most recent
  {loadLimit}; use Load more for older".
- Pressing ↻ while a search is active replaces the results with the browse set.
  Make `refresh()` a no-op (or re-run the search) when `searching` is true.

---

## B5 · Finding 10 — two deep loads interleaving on the DCCR

`src/modules/DailyCallReview.tsx:334-396`.

Add a sequence number; only the newest load may write:

```ts
const loadSeq = useRef(0);

const load = async (f: ReviewFilter) => {
  const seq = ++loadSeq.current;
  const mine = () => seq === loadSeq.current;      // still the current load?
  …
  const page = (await listCallReviews(f, 0, PAGE)) as ReviewRow[];
  if (!mine()) return;                              // a newer load owns the screen
  …
  while (all.length < MAX_DESK) {
    const next = (await listCallReviews(f, all.length, PAGE)) as ReviewRow[];
    if (!mine()) return;
    all = all.concat(next); setRows(all);
    if (next.length < PAGE) break;
  }
  if (!mine()) return;
  setRows(all); setMore(…); setApplied(f); …
};
```

**Verify** — on a register with several pages per worklist, switch from Review 2
Pending to Review 3 Pending mid-load. The rows must end as Review 3's.

---

## B6 · Finding 26 — a visit dated on the form stored at UTC midnight

`src/modules/CallReporting.tsx:414` and `:451`

```ts
// current — asserts the picked date means UTC midnight
visit_at: visitDate ? `${visitDate}T00:00:00Z` : null,
```

```ts
// change — it is a wall clock, and dates.ts already knows how to say so
import { toIsoTimestamp } from '../lib/dates';
…
visit_at: visitDate ? toIsoTimestamp(visitDate, 'local') : null,
```

This is the same helper the bulk upload uses (`uploads.ts:157`), which is why the
two paths disagree today. Checked, under `TZ=Asia/Kolkata`:

```
toIsoTimestamp('2026-09-18','local') : 2026-09-17T18:30:00.000Z
  reads back as                      : 18-Sep-2026 00:00:00
```

**Do not backfill without deciding.** Existing rows written the old way read 05:30
in IST; correcting them is a data migration with its own risk, and the *day* on
every one of them is already right. Decide whether the phantom time is worth a
migration, and if it is, write it as one rather than a hand-run UPDATE.

**Verify** — file a visit dated today, then read it back on Visit Reports: the
time must read `00:00:00`, not `05:30:00`.

---

## B7 · Finding 4 — the Dashboard's private date parser

`src/modules/Dashboard.tsx:21-28`. Delete `parseSheetDate` and use
`parseAnyDate` from `src/lib/dates.ts`, which is day-first and already handles
the `24-October-2025` shape. Three call sites: `:97`, `:105`, `:113`.

Add a `check:ui` rule refusing `new Date(` on a value in a module — CLAUDE.md
has asked for one parser since there were four of them.

---

## B8 · Finding 7 (HIGH) — downloads carrying the wire value

Two halves, and the second is the bigger behaviour change.

**The workbooks.** Four callers build sheets from raw rows; give each the
treatment `ReportBuilder.tsx:159-163` already uses:

```ts
rows: src.map((r) => Object.fromEntries(cols.map((c) => [c, xlsxCell(r[c])])))
```

- `UnusedSpareReport.tsx:89-90` — the **Not Consumed** sheet (`Dispatched On`,
  `Received On`, `Call Registered` are all dates today).
- `ProductFailureAnalysis.tsx:208` (the evidence sheet's date column, `:241`) and
  `:537`.
- `FieldFailureInsights.tsx:265` and `:411` (both use `rawSheet`).
- `Objective.tsx:356` — `rows: calls` and `rows: machines.map(baseRow)`.

Also replace the bare `new Date().toISOString()` "Downloaded"/"Taken" cells with
`formatDayTime(new Date().toISOString())`, which is what `ReportBuilder.tsx:182`
does.

**The CSVs.** `csvExport` (`src/lib/format.tsx:143-158`) formats nothing, and it
is the ⭳ button on 26 registers. The one-line fix:

```ts
import { formatDayTime } from './dates';
…
const body = rows.map((r) => columns.map((c) => esc(formatDayTime(r[c.key]))).join(',')).join('\n');
```

`formatDayTime` is anchored at both ends and returns anything that is not a
timestamp exactly as it arrived, so part codes, UCNs and remarks are untouched —
there is no `MP-010` risk here (that one was `excelSerial`, a different helper).
Checked, under `TZ=Asia/Kolkata`:

```
"MP-010"                     -> "MP-010"
"26H26F0029"                 -> "26H26F0029"
"0012345"                    -> "0012345"
"OR47042"                    -> "OR47042"
"2026-09-18 pump replaced"   -> "2026-09-18 pump replaced"
"2026-09-18"                 -> "18-Sep-2026"
```

**This changes every existing CSV's date columns** from `2026-09-18T08:51:02+00:00`
to `18-Sep-2026 08:51:02`. That is the point, and it is also the sort of change
somebody downstream may have built a spreadsheet around. Worth one line in the
changelog saying so.

**Verify** — export the Field Call Register to CSV and compare the Registered
Date column with what the screen shows. They must match. For the .xlsx, unzip it
and check the cell carries `s="1"`/`s="2"` with a numeric `<v>`, not
`t="inlineStr"`.

---

## B9 · Finding 32 — the Commercial installations card

`src/lib/workload.ts:256` (`commercialInstallSection`) and `pendingInstallRequests`
in `src/lib/supabase.ts`. Three changes, in this order:

1. **Make the card agree with the list it opens** (`workload.ts:259`):

   ```ts
   // current
   const blocked = rows.filter((r) => !isKycVerified(r.kyc_status));
   // change — the same three-way rule as RequestCallRegistration.tsx:203-205
   const blocked = rows.filter((r) => r.onMaster && !isKycVerified(r.kyc_status));
   ```

   After this change, verified + waiting on KYC + not on the master adds up to
   "Installations pending".

2. **Stop the read being capped.** Put the pending test in the query, so the
   read is small by construction. Blank and null must stay pending, which is the
   whole reason the comment gives for filtering in the browser:

   ```ts
   .ilike('call_type', 'INSTALL%')
   .or('status.is.null,status.eq.,status.ilike.pending')
   ```

   **I have not tested that `or()` string against PostgREST.** In particular, I
   have not confirmed that `status.eq.` (with an empty value) is how it matches
   `''`. The existing comment calls that "a corner nobody should have to reason
   about". If you would rather not rely on it, keep the filter in the browser
   and page the read with `allRows` instead. Either way, `more: false` is only
   true once the read is complete.

3. **Stop swallowing the Party Master error** (`supabase.ts`, the
   `const { data: ps } = …` loop). Throw it. `Workload` already shows a
   section's failure, and "every customer not on the master" is a worse answer
   than an error.

**Leave alone:** the `status: 'Pending'` hand-off and the register's 2,000-row
window. Both are real, but they only miss older rows. `listCallRequests` already
maps a null status to `'Pending'`, so the hand-off misses only an empty-string
status. They are listed in the finding so nobody is
surprised by them.

**Verify** — the four cards: verified + waiting + not on master = pending. Then
click each card: the list must show the same number, provided the register
has loaded far enough back.

---

# Batch C — needs a decision from you

These four are recorded with a recommendation, not a patch, because the right
answer is a judgement about how the business works.

## C1 · Finding 20 (HIGH) — "Not Approved" reads as approved

**The bug** `spare_line_stage` (SQL) and `isApproved` (`spareflow.ts:62`) both
ask whether the value *contains* `approv`. Ten plausible spreadsheet phrasings
resolve to **Stores**.

**Decide two things:**

1. **What to do about existing rows** — Step 0's query 1 tells you whether any
   exist. If they do, they are not a code problem: somebody has to say what each
   one meant.
2. **Whether to constrain the column or fix the test.** The safer of the two is
   both:
   - tighten the test to whole-string matching, mirrored on both sides:
     `rm ~* '^(approved|auto-approved)$'` in SQL and
     `/^(approved|auto-approved)$/i` in `spareflow.ts` — and remember
     **`check:ui` compares the two, so they must move together**;
   - and make the importer normalise rather than pass through, the way
     `cover_code()` does for cover (`uploads.ts:726`).

**A migration that changes `spare_line_stage` needs the whole CLAUDE.md drill**:
file it under the right module in `scripts/build-apply-bundles.mjs`, re-run
`node scripts/build-apply-bundles.mjs`, `npm run check:generated`, move the
`_status.sql` row with the definition, and `npm run validate` — seven migrations
call that function and three views are built on it.

**Whatever you choose, tightening the test will move lines backwards** out of
Stores and into RM Approval. That is correct, and it will look alarming on the
dispatch queue the morning it ships. Say so in the changelog.

---

## C2 · Finding 24 — FIXED on `main`

Fixed by `1bf248e` (2026-09-23, *"Roles & Permissions was overwriting every
role on every save"*). It took option (a): the save **refuses** any role left
with zero boxes ticked, and it now writes only the roles you changed. Nothing
to do here. One question from the old section is still open: is `has_perm()`
right about an empty array on the SQL side? It only matters if you later move to
a sentinel.

---

## C3 · Finding 23 (HIGH) — a rename empties a manager's team

**The bug** `user_directory.reporting_manager` holds a *name*. Nothing cascades a
change to it. Measured: `visible_engineer_names()` went 3 → 1 on one edit.

**Decide:**

- **(a) Cascade in the same statement.** A `before update` trigger on
  `user_directory` that rewrites `reporting_manager` / `regional_manager` on every
  row naming the old value. Small, keeps the current design, and is a *write* that
  touches many rows — so it needs a suite proving it moves exactly the right ones.
- **(b) Key the tree on `id`.** Correct, and much larger: `visible_engineer_names()`,
  the import, the User Master screen and every row already stored.
- **(c) Refuse the rename** when anything points at the old name, and offer to do
  (a) explicitly. Least clever, most honest, and it makes the blast radius visible
  to the person about to cause it.

**Until one of them ships**, the cheap mitigation is a warning on the `name` field
in `UserMasterView.tsx` — the drawer already explains the manager fields at
`:924-925`, and the field that breaks the tree says nothing.

**The hand-stock half is separate** and not fixed by any of the above:
`handstock_movements` keys on the engineer name **stored on the request**, so a
renamed engineer's balance stays under the old key. That is a data-repair
question, not a code one.

---

## C5 · Finding 27 (HIGH) — Data Export pages every table with no order

`src/modules/DataExport.tsx:87-88`. Same class as C4 and the same fix, but it
needs its own decision because the read is **generic over table names**:

```ts
const rows = await allRows<Record<string, unknown>>(
  (a, b) => c.from(name).select('*').range(a, b), 200000);
```

**Decide where the order comes from:**

- **(a) Return the key from `exportable_tables()`.** It is already a `pg_class`
  query (`0227_data_export.sql:26-40`); join `pg_index` / `pg_attribute` for each
  relation's primary key and hand it to the screen, which orders by it. This is
  the honest fix and it is a small migration.
- **(b) `ctid` for ordinary tables.** Always present, stable within one read, no
  migration — but a **view** has no `ctid`, and the picker offers views
  (`relkind in ('r','v','m')`), so this covers only part of the list.

**The case to think about is a view with no key.** It may be right to refuse to
export one rather than export it unreliably — an export that silently doubles
and drops rows is worse than an export that did not happen, because it is
reconciled against.

**Do this one before the rest of C4.** Every other instance produces a wrong
list on a screen; this one produces a file that leaves the building, and the
per-table count it prints would agree with the wrong file.

---

## C4 · Findings 8 + 15 (HIGH) — paged reads with a bad or missing order

**The bug** Sixteen paged reads: seven name no order at all, nine order by a
column that is not unique. Measured in Postgres: 4,000 rows fetched, 3,994
distinct.

**Mechanically this is the easiest batch on the page** — append `, id` (or the
view's key) to each order, and give the seven unordered ones one. The decision is
only about **`countCallReviews`**, which is the DCCR's "exact" total: adding an
order to a full-table scan of `field_call_review_summary` costs a sort over every
row, on a query that already walks the whole register. Measure it before and
after on a copy of live data; if it is slow, that count wants to be a database
`count(*)` rather than a client-side walk, which is a better fix anyway.

The list, with the order each one should get, is the table in finding 15 plus the
seven in finding 8. **`unusedSpareEngineers` is the odd one** — it orders by
`ucn`, which repeats across the parts of one call; it wants the view's own key.

**Add the check that would have caught it.** `check:orders` validates that the
column an order *names* exists; it cannot see a read with no order. Extending it
to refuse a `.range(` chain with no `.order(`, and to flag an order whose columns
are not collectively unique, is maybe thirty lines and is the reason this class
would not come back.

---

## C6 · Findings 30 + 31 (HIGH) — a write RLS matched to zero rows reads as success

**Do this one first.** It is one fault in two places. A PostgREST `update()` that
row-level security matches to **zero rows** returns **no error**. Both screens
test only `error`, so both report success over a write the database threw away.
**Measured** for both, signed in as the role on a database built from every
migration.

**The fix, the same shape twice** — ask for the changed rows back, and treat
none as a refusal. `forceInherit` in `src/lib/cover.ts:401` already does this:

```ts
// src/lib/supabase.ts — updateCallRequest (finding 30)
const { data, error } = await must().from('call_requests').update(row).eq('id', id).select('id');
if (error) return { ok: false, error: errMsg(error) };
if (!data?.length) return { ok: false, error: 'You cannot correct this request — only its raiser, Hotline or a role that registers calls can.' };
return { ok: true };
```

```ts
// src/lib/cover.ts:438 — raiseInstallCalls, the write-back (finding 31)
const { data, error } = await client().from('sale_items').update({ inst_call: ucn }).eq('id', it.id).select('id');
const why = error?.message ?? (data?.length ? '' : 'your role cannot edit the warranty register');
if (why) {
  return { created, error: `${str(it.serial_number)}: call ${ucn} was created but could not be written back to the machine — ${why}` };
}
```

The finding-31 message already names the UCN and says it was not mapped, which
is the point: somebody can then map it by hand rather than raise a second call.
With this change, that message is shown for the zero-row case too.

**The decision — who sees the buttons.** The fixes above make the failure
honest. They do not stop somebody pressing a button they cannot use, and on 31
the call has already been **created** by the time the write-back fails. So:

- **31: gate the per-machine "+ Installation call" on `canEdit`**
  (`CoverRegister.tsx:1006`), the same as the whole-sale button at `:1134`.
  That stops a call being raised by somebody who cannot then map it. The
  alternative is to grant `cover.edit`'s write on `inst_call` alone to
  `install.create` holders, which needs a policy change. Decide which you want.
  **Do not skip the `.select('id')` part either way**: it guards every other
  caller.
- **30: show "✎ Correct this request" only to somebody `cr_update` admits**:
  `can('calls.create') || can('pending.register') || detail.createdBy === user.id`.
  **`Row` does not carry `created_by` today**: `listCallRequests` maps the row
  to named fields and leaves it out. Add `createdBy: r.created_by` to that
  mapping first. Its `email` field is not a substitute, because `cr_update`
  tests `created_by` only. Otherwise Commercial, who works this queue from
  finding 32's card, needs a grant. That is a product question about whether
  Commercial should correct requests at all.

**Before shipping 31, run Step 0 query 7.** A machine with two installation calls
from before the fix needs one of them cancelled by hand, and nothing in this
patch finds them.

**Add the check that would catch this class.** A suite that corrects a request
**as a Commercial profile**. `call_request_edit_test.sql` runs every statement
as the superuser, so RLS never applies to it. It is the right suite to extend:
`call public.be(...)`, `set local role authenticated`, and then assert the row
did **not** change. Asserting that no error was raised proves nothing here,
because none is.

---

# Before any of it ships

From `CLAUDE.md`, and every one of these has bitten this project before:

- **`npm run build` must pass** — it runs `tsc --noEmit` first.
- **A user-visible change needs a `CHANGELOG` entry** in `src/lib/changelog.ts`
  (in-app Version History), in the user's words, and a `package.json` bump. `main`
  may have claimed your version from another branch: take the next one **above**
  it, and keep `package-lock.json`'s two version fields in step.
- **Any SQL change** (C1 only, on this page) needs the full drill: the migration
  filed in `scripts/build-apply-bundles.mjs`, `node scripts/build-apply-bundles.mjs`,
  `npm run check:generated`, the `_status.sql` row moved with the definition, and
  `npm run validate`.
- **`check:ui` holds several of these rules already** and should hold the new
  ones: the `coverCode` client/SQL comparison (A5), the paging-order rule (C4),
  the "one date parser" rule (B7).
- **Nothing is live until it is on `main`** — pushing there triggers
  `.github/workflows/deploy.yml`. Check `main` itself builds *before* merging into
  it.

## Suggested commits

| Commit | Findings | Files |
| --- | --- | --- |
| Dashboard: a headcount, a caption and one date parser | 2, 3, 4 | `Dashboard.tsx` |
| Counts that are lower bounds say so | 14, 19, 21, 25 | `SpareInsights.tsx`, `CustomerFeedback.tsx`, `HandStock.tsx`, `StockOut.tsx` |
| Two screens that disagreed with their own registers | 1, 9, 11 | `Workload.tsx`, `DailyCallReview.tsx`, `KpiAnalytics.tsx` |
| The FFR report can carry a signature again | 6 | `FieldFailureReport.tsx` |
| A filter survives the background sync | 16, 22 | five + three modules |
| An empty list stops claiming an empty register | 17 | `CallReview.tsx`, `PendingCalls.tsx`, `SpareRmApproval.tsx` |
| A download is not the wire, in the four places it still was | 7 | four modules + `format.tsx` |
| The search cap, the load claim and the interleaving load | 5, 10, 18 | `Lookup.tsx`, `FieldCalls.tsx`, `DailyCallReview.tsx` |
| A visit is dated where it happened | 26 | `CallReporting.tsx` |
| Cover is one vocabulary on the KPI page too | 12 | `KpiAnalytics.tsx` |
| An MRN line is keyed by its own id | 28 | `MaterialReturns.tsx` |
| Renew waits for the machines | 29 | `CoverRegister.tsx` |
| The Commercial card counts what it opens | 32 | `workload.ts`, `supabase.ts` |

Batch C gets one branch each — they are arguments, not edits. **C6 first.**

---

## Working this with Claude locally

Each batch is a self-contained prompt. For example:

> Read `docs/MODULE_REVIEW.md` findings 2, 3 and 4 and
> `docs/MODULE_REVIEW_HANDOFF.md` sections A1, A2 and B7. Apply those three
> fixes to `src/modules/Dashboard.tsx` only. Run `npm run build` and
> `npm run check:ui`. Add a CHANGELOG entry and bump the version per CLAUDE.md.
> Do not touch anything else.

Keep the batches apart. Every fix on this page is small; what makes them risky is
doing eleven of them in one commit and not knowing which one turned CI red.
