# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-09-02 (spare reconciliation shipped and applied; live project fully caught up: split confirmed applied, PM schedule fields, btree+trigram search indexes, split hardening, partial dispatch + per-shipment receipt, roles/visibility, guide screenshots)_

---

## 🚧 In progress

### Applied on the live project — 2026-09-01
Run and confirmed by the user, in this order:
- **`stock_out_lines_and_refurb.sql`** (0064–0065, applied 2026-09-02) — Stock
  outs became a FLAT list (`spare_stock_out_lines`, one row per spare issued)
  carrying **days to dispatch**, measured from the last approval (NSM where the
  item needs that review, else Commercial, else RM) to the stock out.
  **Refurbished spares:** Stores may issue the recycled equivalent (R + part
  code, description unchanged); hand stock is now derived from the ISSUE, so the
  R-part is held and consumed as its own stock line. The swap is refused unless
  the R-code is in Part Master AND active. The engineer's notification says the
  part is refurbished.
  ⚠️ **Operational:** the R-codes must be added to Part Master as ACTIVE before
  Stores can issue them.
- **`consumption_reconciliation.sql`** (0059–0063, applied 2026-09-02) — the
  spare reconciliation set:
  * **Book** a missed spare against a call (RECO on any call row / its drawer,
    for Spare Coordinator, Hotline, Admin). Parts come from that engineer's hand
    stock; several at once; UCN, engineer, part and reason all required.
  * **Adjust** a wrongly reported quantity; **void** an entry made in error by
    setting it to 0 (deletes stay blocked — the line keeps `was N`, the reason
    and who changed it, and the spare returns to hand stock).
  * **Cap:** no consumption line, reported or hand-booked, may exceed the
    engineer's hand stock. A refused report tells the engineer to ask the Spare
    Coordinator, so control of the balance sits with the coordinator.
  * Identity (call, part, engineer, source) can never be changed by an
    adjustment — to move a line, void it and book the right one.
- Live state CONFIRMED with `supabase/apply/_state_check.sql`: split applied,
  0041 hardening applied (3 CHECK constraints), reg_at/added_on present,
  37 trigram + 8 btree search indexes, partial dispatch + per-shipment receipt,
  call re-open. **Run that script before assuming anything is or isn't applied**
  — twice today a stale note sent us at the wrong problem.
- **`search_indexes.sql` (re-run)** — the first run had created only the 37
  trigram indexes; the re-run added the 8 btree (`_eq`) ones that serve the
  exact-match / IN lookups (products by party for the request cascade, calls by
  serial for "open calls"). A trigram index cannot serve `=`/`IN`.
- **`pm_schedule_fields.sql`** (0050) — `reg_at` + `added_on`.
- **`harden_call_split.sql`** (0041) — per-table CHECK so a call can never be
  filed under the wrong type.
- **`partial_dispatch.sql`** (0055) — Stores can send fewer units than were
  requested; the line stays queued for its remainder. `dispatched_qty` on the
  line, a `spare_dispatch_lines` table (a line can span several stock outs),
  existing dispatches back-filled, `spare_pending_dispatch.qty` = the REMAINDER,
  hand stock counts what was dispatched, `dispatch_spare_lines(..., p_qtys)`
  rejects over-sending.
- **`receive_per_shipment.sql`** (0056) — the engineer acknowledges each delivery
  as it lands (`received_qty` on the line, receipt stamps per shipment,
  `receive_spare_shipments()`); the line only turns **Received** once every unit
  is confirmed, so the stage logic is unchanged.
- **`help_screenshots.sql`** (0043, knowledge_base) — the guide's per-task
  screenshots. Admins can now add/replace/remove a picture on each step of
  "How to use RITHI CRM"; everyone else sees them.
- **`notify_uid_fix.sql`** (0054) — `notify_spare_dispatched()` declared a plpgsql
  variable `uid` that clashed with `spare_requests.uid`, so the trigger aborted the
  UPDATE Pending Dispatch runs: **nobody could book a spare out** ("column
  reference \"uid\" is ambiguous"). Variable renamed to `v_uid`, column qualified;
  same rename in `notify_call_allotted()`. Reproduced and fixed on PG16.
- **`fix_roles.sql`** — one-shot role/visibility reconciliation: merges the
  baseline permissions into `app_roles` for all nine roles (merge, so admin edits
  survive), re-asserts `can_view_all_calls()` / `can_see_call()`, and folds the
  office-role bypass into the read policies for the call registers (select +
  update), `reports`, **`call_requests`** and `pending_registrations`.
  ⚠️ The Pending Registrations screen reads **`call_requests`** (via
  `listCallRequestsAsPending`), *not* `pending_registrations` — two earlier fixes
  targeted the wrong table. `cr_read` (0003) had no office bypass at all, which is
  why Hotline saw only her own request. Now 0053.
- **`search_indexes.sql`** (0052) — pg_trgm trigram indexes for substring ILIKE
  search *and* plain btree indexes for the `=`/`IN` lookups (products by party for
  the request cascade, calls by serial for "open calls"). Fixes "canceling
  statement due to statement timeout" on Search, on Create-New-Call prepare, and
  the empty product list when picking a party.

**Note for future visibility work:** a role seeing "nothing" is usually the
`has_perm('calls.view') AND <scope>` gate — `has_perm` only falls back to the
engineer defaults when the role's `app_roles` row has ZERO permissions, so a row
with *some* permissions but missing `calls.view` silently blocks everything.

### Calls table split (3 physical tables) — ✅ APPLIED LIVE (confirmed 2026-09-01)
`calls` is a VIEW over `field_calls` / `installation_calls` / `pm_calls` on the
live project — verified with `check_db_state.sql`. The "SQL to run" notes below
were STALE: `0044_daily_call_review.sql` cannot even run without `field_calls`,
so the split necessarily went in with the Daily Call Review work.
**Do not run `split_call_tables.sql` again.** Stage 3 hardening (0041) has since
been applied too.

- **Stage 1 — DB (applied):** `0040_call_tables_split.sql` splits
  `calls` into `field_calls` / `installation_calls` / `pm_calls`. `calls`
  becomes a UNION view with INSTEAD OF routing triggers, so the app is
  unchanged; `pending_calls` / `call_state` rebuilt over the union; RLS + the
  UCN/call-number/last-visit machinery live per table; UCN letters now F/I/P
  (PM detection fixed). Validated on PG16 (fresh apply, idempotent, routing +
  returned UCN, RLS scoping, report sync, call-registration suite).
  ✅ Applied (see above).
- **Stage 2 — client (shipped, v0.8.41):** `listCalls`/`searchCalls` read the
  typed table via `callTable()`, so each register (esp. PM) is isolated;
  cross-type screens keep the view.
- **Stage 3 — hardening (built, SQL to run):** `0041_call_split_hardening.sql`
  adds a per-table CHECK (`call_table_for(call_type)`), so a row can never be
  misfiled, and drops the redundant per-table call_type index. `calls` view
  kept (recommended). ✅ Applied live (2026-09-01).
- Related (all shipped): PM bulk upload (v0.8.46), Commercial-gated Installation
  creation (v0.8.47), SLA rules engine (v0.8.49), notification bell (v0.8.50).

### PM Bulk Upload — due month + registration date & time (shipped v0.8.58, SQL to run)
- Every uploaded PM row is dated the **1st of a chosen due month** (a
  `<input type="month">` picker, defaulting to the current month — pick a past
  month to **backfill older calls**). Today's date is captured as **Added On**.
- **Numbering is unchanged** (UCN + Call Number as before). What orders a batch
  is a new **registration date-and-time** (`reg_at`): each call a few seconds
  apart — **00:30 on the 1st, 5s apart** for a fresh month, or **10s after the
  latest existing call** when adding to a month that already has some — and the
  **start time + gap are editable** before import. `reg_date` stays a plain date
  so every date-based view/index keeps working.
- `0050_pm_schedule_fields.sql` adds `added_on` + `reg_at timestamptz` to the
  three split tables (reg_at back-filled to midnight of reg_date), drops the
  earlier per-month-serial trial, makes `calls_before_insert()` derive
  `reg_date`↔`reg_at`, and rebuilds the `calls`/`pending_calls` views + INSTEAD
  OF routing. Validated on PG16 (fresh-month 00:30+5s, backdated +10s
  continuation, derivation both ways, numbering unchanged).
  ✅ **Applied live (2026-09-01)** — `reg_at` / `added_on` are in place, so PM
  Bulk Upload's due-month + registration date-and-time are now functional.
- **Deferred (feasibility):** auto-generate the monthly PM schedule from Product
  Master (due-date + contract cover per machine) instead of a spreadsheet upload.

### Go-live cutover
Run in this order: **`_backup_before_reset.sql`** → **`_reset_for_production.sql`**
→ (if section 2 was run) **`daily_review.sql`**. `_restore_from_backup.sql` undoes
the reset from the snapshot.
- **`supabase/apply/_backup_before_reset.sql`** — snapshots every table the
  reset empties into a `bak` schema in the same project, and refuses to run
  twice rather than overwriting an older snapshot. It is a fallback for a
  SQL-editor-only cutover, NOT a real backup: it is in the same database, so it
  covers the reset and nothing else. The header carries the `pg_dump` line.
- **`supabase/apply/_restore_from_backup.sql`** — puts the snapshot back. Three
  things it has to get right that a plain `insert … select *` does not, all of
  them found by testing the round trip rather than by reading:
  - every `id` here is **GENERATED ALWAYS**, so the insert needs
    `OVERRIDING SYSTEM VALUE` — without it the restore is refused, and a plain
    insert that dropped the id would silently RENUMBER every row.
  - **GENERATED columns must be excluded** from the column list
    (`field_calls.open_state`, `call_reviews.review2_done`/`review3_done`/
    `any_potential_effect`). Listing one fails the whole restore with "cannot
    insert a non-DEFAULT value into column"; they recompute themselves.
  - write triggers are disabled during the restore (they would restamp
    `updated_at` / `created_by`), and every sequence is moved **past** the
    restored ids afterwards or the next real insert collides.
  - Verified: seed → snapshot → reset → restore returns identical ids, UCNs and
    quantities, recomputed `open_state`, and a following insert takes the next
    free id.
- **`supabase/apply/_reset_for_production.sql`** — empties the data produced
  while testing and keeps the people and the setup (`profiles`,
  `user_directory`, `app_roles`, `app_settings`, `sla_rules`, `master_lists`).
  Hand-maintained, NOT generated. Points worth knowing before running it:
  - It uses **TRUNCATE**, not DELETE, because `0049` blocks the application role
    from deleting quality records on purpose. That is also why it is a script
    the user runs in the SQL editor and not anything the app can do.
  - `TRUNCATE ... RESTART IDENTITY` does **not** reach three sequences, because
    they are not owned by the column that uses them: `ucn_seq` (the last four
    digits of every UCN), `call_req_seq` (the REQID) and `call_split_id_seq`
    (0040 made the id shared across field / installation / pm so the `calls`
    union view has unique ids). The script `setval`s them explicitly — without
    that the test run's count stays visible in production UCNs.
  - Clearing `masters` also clears the values **0046 seeded** (DCCR Complaint
    Grouping / Root Cause Key Word). Re-run `daily_review.sql` afterwards, or
    the Daily Call Review's dropdowns come up empty and it does not look like a
    data problem.
  - Verified end to end on a throwaway PG16: after the reset the first call is
    `…F0001` / `CL<yy>00001` / id 1, the first request is `R1`, and the spare
    series restarts at `OR-YYMM-0001`.

### Bulk Report Mapping — recovering lost visit history
- **`/report-mapping`** (admin). A CSV of recovered visits → each matched to its
  call → AppSheet file references resolved to Drive links → written. Nothing is
  written until the operator has SEEN what every row resolved to.
  - **Matched on UCN, then Call Number** — the same two keys and the same
    precedence 0048 uses, so a recovered visit lands where a live one would.
    Deliberately NOT on serial or party: a machine has many calls, so that would
    attach a visit to an arbitrary one. Unmatched and ambiguous rows are held
    back and listed, never guessed at.
  - **AppSheet references** come in three shapes and an export mixes them: a
    `gettablefileurl?...&fileName=` link, the bare `Reports_Images/foo.png`
    path, or something already a Drive link / id. Only the first two need
    resolving and both reduce to a FILE NAME, looked up through a new
    read-only `drivefind` GET action on the bridge (GET, because a GET response
    is readable cross-origin — no ref/poll dance like the uploads). A name
    matching more than one file comes back EMPTY: the wrong photo on a service
    record is worse than none.
  - **`reports.source_ref`** (0071) keeps the original reference next to the
    derived link, so a wrong resolution can be re-run rather than being
    permanent. `mapped_at` marks a visit as recovered, not reported live.
  - ⚠️ **`reports_uid_key` was PARTIAL** (`where uid is not null`, 0002), and
    Postgres will not infer a partial index from `on conflict (uid)` — the
    upsert failed outright until 0071 replaced it with a full unique index
    (NULLs are distinct, so the sheet-era rows with no uid are unaffected).
    That upsert is what makes re-running a sheet CORRECT its rows instead of
    doubling the visit history.
  - Dates are read **day-first** (`03/04/2026` = 3 April). Letting `Date()` read
    an Indian export would silently move a visit by a month.
  - `npm run check:mapping` runs 31 checks over the pure half
    (`scripts/check-report-mapping.ts`) — there is no test runner in this repo.
  - ⚠️ `script.google.com` is blocked from the sandbox, so `drivefind` has NOT
    been exercised end to end. **CallReg.gs must be redeployed** for it to exist.

### Stock levels before the movement history (0074 + 0075)
Hand stock is derived from movements. Raw spare data starts **June 2022**, so
everything before it existed only as balances — and because consumption is
CAPPED at hand stock (0061), an engineer holding pre-2022 stock could not report
fitting it. Two tables fix that, both consolidated as ARMS of
`handstock_movements` so the balance, the movement trail, `engineer_stock`, the
transfer guard and the cap all inherit them untouched:
- **`handstock_opening`** — the opening pools. WinMax HS (struck June 2022) and
  the 22 H2 / 23 / 24 / 25 levels **alongside** it. **Additive, not
  restatements** (confirmed by the user): they sit beside one another and beside
  the movements, and nothing double-counts because there are no movements before
  June 2022. Unique on (engineer, part, source) so re-loading a corrected sheet
  replaces THAT pool.
- **`spare_consumption_history`** — the ~44,000 pre-2026 consumption rows, in
  their own table with **no cap and no reconciliation**. Applying today's cap
  retrospectively would have refused most of the history, silently dropping real
  consumption to satisfy a rule that did not exist when it happened — and the
  cap runs a derivation PER ROW, so 44,000 rows would each aggregate the whole
  movement history. Measured: **44,000 rows insert in 0.9 s**. Reconciliation
  stays on the 2026 entries in `spare_consumption`, which is where the control
  point belongs.
- ⚠️ Both needed a **stored** `source_key` (`lower(btrim(source))`) rather than
  an expression index: `on conflict` cannot infer an expression index, so the
  upload's upsert would have been refused — the same trap the partial
  `reports_uid_key` sprang in 0071. `check:uploads` now verifies every
  register's conflict key is derived from something it fills.

### Consolidation pass (v0.9.40)
- **One date parser** — `src/lib/dates.ts`. coverImport, dataImport, uploads and
  reportMapping each had their own; they had started to disagree (only one read
  space-separated `08 06 2026`). All four now delegate. Behaviour is preserved:
  the cover importer still writes a wall-clock time as if UTC and the others
  still read it as local — `toIsoTimestamp(v, 'local')` everywhere, settled — see below.
- **One header matcher** — `src/lib/headers.ts` (strict → loose → squash).
  Bulk Report Mapping now recognises the same headings Bulk Uploads does
  (`UC Number`, `Visit Date & Time`, `Death?`); it was strict-only.
- **One CSV parser** — `src/lib/csv.ts`.
- **Legacy Data Import trimmed** to what Bulk Uploads does not do: cover
  exports + Normalise, user_directory, MRN two-tab flattening. Seven duplicated
  shapers removed.
- **Dead code removed**: `CrudModule`, `schemas.tsx` (7 of 8 configs were
  never routed), `CallExtras` (wrote consumption to localStorage, bypassing the
  cap — reachable only from the unrouted configs), the `/products` demo route,
  `seedDemoData`, `nextCode`, `partCode`.
- **FFR + KPI** are honest placeholders (they rendered blank from the emptied
  demo collections). Both still need a table — see queued.
- **Two conflicts put to the user and SETTLED 2026-09-03**: (1) imported
  wall-clock timestamps are read as LOCAL time in every importer — the cover
  importer had written them as UTC, putting sale/contract entry times 5½ h off
  for IST; (2) display reads a non-ISO date DAY-FIRST like the imports, so a
  visit's report date is the day the export meant (`parseAnyDate`).

### To run on the live project — pending
- **[`_handstock_opening_engineers.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_handstock_opening_engineers.sql)**
  — **opening stock for active engineers only.** The WinMax export's `User Name`
  column holds dealers and customers as well as engineers; 252,592 of its
  257,130 parts came in under names like `A AND M HEALTH CARE C`, each given a
  hand-stock balance. Asked which way to load it, the user said **User Master,
  active names only** (2026-09-04). The uploader now holds the rest back before
  writing; this applies the same rule to what is already loaded. Names what it
  removes, prints the balance before and after, safe to re-run, and refuses
  outright if the User Master is not loaded. Everything it deletes is re-loadable
  from the same file.
Read from the user's `_status.sql` on 2026-09-03 plus what has shipped since.
Everything else in this file's earlier lists HAS been run — documents, reports,
user_directory (0068), rbac (0069), masters, call_requests (0083),
sales_contracts (0080), daily_review, Spare_1 (0084/0085/0087/0088) and
HandStock_X for 0089/0090/0091. Do not re-add them here without a status read.

- **[`performance.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql)**
  (migrations `0098`, `0099`, `0101`) — **the Hand Stock timeout, the products
  dropdown, and the KPIs.** `0101` adds the four aggregate views KPI & Failure
  Analysis reads (`spare_usage`, `spare_usage_rollup`, `failure_rate_by_product`,
  `failure_modes_by_product`) — without it that screen says which script to run.
  Also **the spare-request reassignment (`0100`) is in `HandStock_X.sql`.** `0099` turns JIT off for the database: the timeout was Postgres
  spending 3.7 s COMPILING the movement query, which then ran in 174 ms. The
  planner's estimate is inflated by the cost of RLS sub-plans it barely runs, so
  the more access rules a query carries the more certain it is to be compiled —
  which is exactly why switching RLS off appeared to "fix" it, and sent three
  rounds of work at the wrong cause. With JIT off and nothing else changed the
  whole 102,893-row history reads in 323 ms. Applies to connections opened AFTER
  it runs, so give the pool a few minutes. Reverse with
  `alter database postgres reset jit;`. `0098` adds `product_register_names`,
  the distinct product list Product & Party Search offers.
- **[`call_requests.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/call_requests.sql)**
  (migration `0097`) — **REQID had restarted at R1.** `_reset_for_production.sql`
  reset the counter when the demo data was cleared (correct then — the table was
  empty), and the 18,576 requests loaded afterwards each carried their own
  number, which never calls `nextval`. The counter now follows any explicit
  REQID, so a bulk load can no longer strand it, and it is resynced once here.
  The two already issued out of order become **RC1** and **RC2** — `R1` is a
  number the sheet era may have used too. Prints what it re-lettered.
- **[`HandStock_X.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/HandStock_X.sql)**
  (migrations `0095`, `0096`) — closing a hand-stock period. `close_handstock_period('YYYY-MM-DD')`
  writes an opening figure per engineer and part and moves the line; every arm of
  the movement view then reads only what falls after it. Verified neutral on a
  copy of the live data: 6,203 pools / 257,188 parts before and after, with the
  view dropping 102,893 → 22,442 rows. Not needed to make the screen fast (0099
  did that) — it is what keeps it fast as the years add up. NOT urgent.
- **[`rbac.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql)**
  (migration `0093`) — puts **Product & Party Search** on the roles that already
  hold Product Master. A new module is in the code's defaults, but `has_perm`
  reads the STORED list and only falls back to those defaults when the row is
  EMPTY, so a role saved even once in Roles & Permissions would not see the
  screen at all. Merged in, so an admin's other edits are untouched.
  `_status.sql` row 45.
- **[`user_directory.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/user_directory.sql)**
  (migration `0092`) — a **Reporting Manager who sees no calls** while the header
  says "Team view · 15 engineers". The screen finds him in the User Master by
  email, gmail OR username; `visible_engineer_names()` matched on email/gmail and
  nothing else, so a stale address resolved to no row, the tree came back empty,
  and RLS returned nothing. The name is now the fallback — only when the address
  finds nobody. Gates EVERY manager feature shipped 2026-09-03: team visibility,
  the engineer pickers, the chips, the grouping and the bulk allotment.
  `_status.sql` row 44.

  ⚠️ **This entry named the wrong bundle, and running the one it named UNDID the
  fix.** 0092 was filed under `rbac`, so `rbac.sql` carried it and
  `user_directory.sql` did not — but `user_directory.sql` replays `0004`, which
  defines `visible_engineer_names()` WITHOUT the fallback. So the instruction
  "run user_directory.sql for 0092" put the old definition back, silently, and
  the bundle reported success. On the live project `_status.sql` row 44 read NO
  on 2026-09-04 for exactly that reason: applied, then overwritten.

  0092 now lives in the **user_directory** module, after 0004, so the bundle that
  owns the function carries its latest definition and re-running it is safe.
  Re-run `user_directory.sql` once more and row 44 goes green.

  **The class**: a bundle must carry the LATEST definition of everything it
  defines, or replaying it alone reverts an object a later module redefined.
  `npm run check:bundles` reports it; **twelve** objects are split this way today
  and are listed in that script, including `dispatch_spare_lines` (re-running
  `Spare_1.sql` on its own would revert partial dispatch and refurbished issue)
  and `spare_pending_dispatch`. They are recorded rather than fixed here because
  moving migrations between modules changes the order a FRESH apply runs in —
  the other way this project has broken itself — so it wants its own change.
- **[`_dedupe_part_product_keys.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_dedupe_part_product_keys.sql)**,
  then re-run
  **[`HandStock_X.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/HandStock_X.sql)**
  — 0081/0082 SKIP their unique indexes when the table already holds duplicates
  and print a notice the bundle's success hides, which is why `_status.sql` row
  35 stays NO after running it. **Part Master and Product Master cannot upload
  until this is done.**

  ⚠️ 0090 rebuilds `handstock_movements`, and **`create or replace view` does NOT
  carry `security_invoker` over** — without re-asserting it the view runs as its
  owner and every arm's row-level security stops applying. The migration
  re-asserts it on every rebuild; any future arm must do the same.

### Uploads still to load — waiting on the SQL above
In this order. Everything here has been shaped against the user's real files and
the counts are what to expect:

| register | file | expect |
| --- | --- | --- |
| Part Master | `ITEM_Master_2.csv` | needs row 35 |
| Product Master | `v2_ProdMaster.csv` | needs row 35 |
| Hand Stock — WinMax opening | `HS_Winmax.csv` | 4,375 |
| Stock Out — all years | `Stock_Out.csv` | 48,139 |
| Consumption — yearly export | 22H2 / 23 / 24 / 25 | 5,233 / 10,338 / 11,938 / 12,292 |
| Consumption | `v2Consumption_1.csv` | 8,352 |
| Stock Transfer Register → Lines | `ST_Entry` → `StockTransferList` | 338 → 849 |
| Ownership Transfer | `OwnershipTransfer.csv` | — |
| Master Value Lists | Standard Complaint and the rest | the go-live reset emptied them |

Loaded already: Party Master (5,873), Field / Installation / PM calls, Call
Requests, Field Reports, Spare Request (4,081) and its Lines (8,571), MRN (595).

### Open questions put to the user, unanswered
- **WinMax opening:** its `User Name` column is not only engineers — the first
  rows are names like `A AND M HEALTH CARE C`, dealers rather than people. It is
  252,592 of the 257,130 parts in the balance. Filter that pool to names in the
  User Master, or load it whole?
- **A Knowledge Base how-to for Product & Party Search**, as was done for call
  re-allocation (offered, not asked for).


### Queued — waiting on the user
- **Per-tab permissions — deliberately NOT built (user's call, 2026-09-02).**
  The Roles & Permissions tree goes header → page → View + actions. Tabs within
  a page (Pending Dispatch's Queue / Stock outs, the Daily Review stages) were
  asked about and then left out: each needs its own enforcement, and a checkbox
  that nothing enforces is worse than no checkbox. The tree supports a third
  level already — the master lists prove it — so adding them later is a matter
  of naming the tabs and enforcing them, not restructuring.
- **Split User Access out of User Master** (deferred by the user, 2026-09-01).
  `/users` currently redirects into **User Master**, which carries both the
  directory (name, designation, region, reporting/regional manager, validity)
  and the sign-in side (role, extra permissions, create-login, clone).
  The merge was suspected of causing a role bug, but it was **not** the cause —
  the coarse `Role` enum (`admin|manager|engineer|viewer`) was collapsing every
  RBAC role, so Hotline/NSM/Commercial all displayed as "Field Engineer".
  Fixed display-side in **v0.8.63** (`roleLabel()` prefers the real `rbacRole`);
  the merged screen itself already offers the full role list and flags a
  directory-vs-sign-in mismatch. So the split is a **presentation preference,
  not a defect** — pick it up only if the combined screen proves unwieldy in use.
  If done: keep one write path (the directory row is what grants the role on
  first sign-in), or the two screens will disagree.
- **Deploy the daily digest** — the Edge Function + schedule are in the repo
  (`supabase/functions/daily-digest/`, built, not deployable from here). Needs a
  **Resend API key** and the Supabase **CLI** deploy: set the secrets,
  `supabase functions deploy daily-digest --no-verify-jwt`, then run
  `schedule_daily_digest.sql`. Steps in `daily-digest-DEPLOY.md`.
- **RBAC view-matrix** — the user will send a matrix of role × module × level
  (who can view/create/edit/approve/export what). Translate it into the role
  defaults in `src/lib/rbac.ts` **and** a `set` SQL that writes the same
  permissions into `app_roles` (live roles are populated, so a code change alone
  is not enough — a DB grant is required).

## ✅ Done

### Platform & data
- CallReg Apps Script bridge (standalone, opens sheets by ID; JSONP-safe reads
  and writes). Endpoints: ping, tabs, list, parties/products/items, prodsearch,
  auth, users, config/setconfig/configcheck, pending, crnrequest, setucn,
  getview/setview, add/update, reportget/report, tabmeta/tabappend, upload,
  master/masters/setmasters.
- Versioned default Web App URL baked into the app (clients auto-adopt on bump).
- Local caching with 30-min force-sync and "synced X ago"; force-update button.

### Calls
- Field Call Register — live against the FIELD tab; new calls get a UCN written
  back. Installation Calls — live against INST (same schema, I-type UCN).
- Call Registration Request: the repeatable unit is a **call** —
  Product + Serial No + Standard Complaint + Reported Problem — up to 5 per
  request, each written as its own `call_requests` row under one REQID.
  **Installation Report / KYC are file uploads** to the CallReg Drive folder
  (`driveupload` / `driveref` endpoints); the request stores the Drive link.
- Party → Product → Serial cascade picker (Party + Product Master) auto-fills.
- Add Field Call: today's dates defaulted; warranty/contract freeze once loaded
  from Product Master; section reorder persists.
- Call Registration Request → 2026-CRNRequest; Pending Registrations (Hotline)
  registers UCN-less Data-2026 rows, mapping warranty/contract, back-fills UCN.
- **Request Call Registration is a register** — a table of every request with
  its outcome (Pending / Registered / Mapped / Cancelled) and UCN, status
  filter, search, CSV export and a row-detail drawer; **New Request** raises one
  in a drawer. It used to be a form with no way to see what you had raised.
- **Call Number is assigned, not typed** (`0015_call_number.sql`) — from a
  request it is the request's **UniqueID** (REQID-Product-Serial); a direct
  customer call gets **CLYY#####** (five-digit running number, per year,
  seeded from the existing series). Blank ones are back-filled. It matters
  because reports / spare requests / consumption / feedback are keyed by it.
- **Call status everywhere** — a call is **Solved / Unsolved / Report pending /
  Unattended** by its LATEST visit, derived once in Postgres (`call_state` /
  `pending_calls` views, `0012_call_state.sql`). Colour-coded column on the
  Field / Installation / PM registers, and a **Pending Calls** module
  (`/pending-calls`): every call nobody has closed, with clickable status tiles,
  type filter, search, CSV export and the registers' role scoping.
- **Pending Registrations = the Hotline desk** — clicking a request opens it in
  full and closes it out one of three ways: **map** it to an existing call (its
  UCN goes into the editable **UCN Number (Mapped)** column), **create** a new
  call (UCN assigned and back-filled), or **cancel** it with a reason from the
  `cancelreason` master. Each takes it off the pending list. Column 2 shows
  **Open Calls** — calls on that machine nobody has closed — so a duplicate is
  visible before another is created. Gated on `pending.register`, so the Hotline
  role can act without call-edit rights.
- **Call reporting** (replaces the standalone Call Updation view): "Update Call"
  on every Field/Installation call → Reporting-N tab, keyed by UCN.
  - Sectioned by Call Status: Solved (full report + manual report upload + spare
    consumption → v2Consumption + customer feedback → v2Feedback), Unsolved
    (pending reason only), Report Pending (reason auto-set).

### Access & roles
- User Master login (AL / Gmail ID, set-password-first, Validity=TRUE only).
- **User Master is maintained in the app** (`0033_user_directory_role.sql`) —
  admins add and edit directory rows, and each carries the **role** the person
  is granted: `ensure_my_profile()` builds their profile from that row on first
  sign-in, and saving applies the role straight away to someone already signed
  in. Fixes a signed-in user with no profile showing as a bare engineer and
  never appearing in User Access. The address door (0030) still cannot set a
  role.
- Role-based call visibility (engineer = own calls; RM = reporting sub-tree;
  admin = all).
- Admin **"View as"** engineer preview (persistent banner + exit).

### Masters
- **Party Master** — wired (cascade + live datalist in the intake & request forms).
- **Product Master** — wired (cascade + Product Master view + register-from-row).
- Generic master-value layer: `master` endpoint + `useMaster` hook + Admin Config
  → **Master Value Lists** editor (id / tab / column per master).
- **Part Master** — wired to the live ITEM Master (`parts`); search on code /
  description, active filter, Load more, CSV export. (It used to render the
  local demo collection, which `clearDemoData()` empties — hence the blank
  screen.)
- **All Masters** (`/masters`) — one view over every master: the registers
  (Party / Product / Part / User) with row counts, and each value list with its
  values, searchable and exportable. Module grant: `0013_all_masters_module.sql`.
- **Each value list has its own screen** (`/masters/<key>`, Master Lists in the
  sidebar) — one table per master with Add / Deactivate / Remove, shared with
  the All Masters overview.
- **Access is per list.** Roles & Permissions lists every master under the
  Master heading with three switches — open it (`mod:/masters/<key>`), add /
  edit its values (`master.<key>.edit`) and delete one (`master.<key>.delete`).
  Each inherits from the broad key above it, so a role holding `mod:/masters`
  opens every list and one holding `masters.edit` maintains every list; the
  per-list keys exist to grant *less* than that. `0067_master_list_permissions.sql`
  enforces the same split in RLS, so a new list still needs no release.
- **Value lists are their own maintained tables** (`0014_master_lists.sql`) —
  a `master_lists` registry (label, what one row is called, extra columns) plus
  the `masters` rows; All Masters opens each list as its own table with Add /
  Deactivate / Remove, gated per list (above), and clears the dropdown cache on
  every edit. A value in use is deactivated (`masters.active`, 0066) rather than
  deleted, so the records already carrying it keep making sense.
  Seeded from the **200 All Masters** workbook: calltype 8, complaint 507,
  pendingreason 21, cancelreason 27, feedbackrating 4, **orapproval** 13 (that
  one carries Stage + Status columns in `masters.extra`). A new list needs a
  registry row, not a release.
- In-call **Spares Consumed** picker reads the live `spare` master too (it used
  to list the same cleared demo collection). A consumed part is stored by its
  `CODE|Description` catalogue string; the old Amount/Total column and the stock
  decrement are gone — the live `parts` table carries neither price nor on-hand.

### Documents
- **Service manuals + QMS documents** (`0070_documents.sql`, `/service-manuals`
  and `/qms`). The FILE goes to **Google Drive** through the CallReg bridge —
  the same `uploadToDrive` path a manual report takes — and the row here is the
  catalogue entry that makes it findable. A manual is keyed by **product**; a
  QMS document by number / revision / effective date.
  - **The point is the lookup.** Opening a call shows **📄 Supporting
    documents**: the manual for that machine, plus Knowledge Base articles whose
    title / product / tags match the call's product or standard complaint. A
    manual saved with a BLANK product is a general one and is offered on every
    call — which is why `serviceManualsForProduct()` cannot be a plain equality
    filter.
  - Two rights, because they are two jobs: `docs.manage` (manuals) and
    `qms.manage` (the controlled shelf). Everyone signed in READS both — a
    manual nobody can open is no use in the field.
  - A superseded document is **retired, not deleted**: calls were worked from
    it, and the shelf is the record of what the field was told.
  - ⚠️ `script.google.com` is blocked from the sandbox, so the Drive upload
    round-trip has **not** been exercised from here — only the catalogue side.
    The upload reuses the report path, which is in daily use.

### UX
- All tables: column show/hide/reorder/resize (⚙ lists every schema field),
  saved views (per-user + admin "Save for everyone"), ⚑ Filters (top toolbar).
- Mobile & tablet responsive (off-canvas sidebar ≤1024px, full-screen drawers on
  phones, touch targets, no sideways scroll).
- Collapsible sidebar + nav groups (persisted); in-app Version History; sticky
  build footer.

---

## 🔜 In progress / Next

### Migrations to run (Supabase SQL editor)
Apply with the bundles in `supabase/apply/` rather than the numbered files —
run `_status.sql` first to see what the project is missing, then the bundle(s)
it flags. They are generated from the migrations by
`scripts/build-apply-bundles.mjs`, carry their module's migrations in order,
preflight their prerequisites, and are idempotent.

- ✅ **`all.sql` applied (2026-08-29)** — `user_directory` (`0004`), `rbac`
  (`0005`, `0007`, `0008_rbac_enforcement`) and the whole spare module
  (`0006`, `0009`, `0011_spare_intake`, `0012_spare_auto_approval`) are now
  live on the project. None of these had ever been run: the spare tables were
  still at `0001`, which is why the spare register only ever half-worked.
- **`0023_handstock.sql`** — the hand-stock views, and `engineer_stock`
  redefined over them (bundle: **`HandStock_X.sql`**, at the repo root; needs
  `Spare_X.sql` and `stock_transfer` first). Until it is run, the Hand Stock
  module says so and stays empty, and the report form has no stock to consume
  from.
- ⚠️ **An apply bundle must survive being re-run over a LATER state, not just
  a fresh one.** `0023_handstock.sql` used `create or replace view`, which may
  not drop a column — so once `0039` had added `returned` to the balance, every
  re-run of `HandStock_X.sql` (and of `all.sql`, which carries it) died on
  `42P16: cannot drop columns from view`. The views are dropped and rebuilt
  now. Separately, `all.sql` applied `0038`'s consumption-visibility rule from
  the rbac module, long before `0023` added the `engineer_email` it reads, so a
  FRESH project failed at that line; `0038` adds the column itself now. Both
  were found by applying `all.sql` twice in a row on a throwaway Postgres —
  worth doing after any change to a bundled migration. The same check then
  caught `0040_call_tables_split.sql`: it makes `public.calls` a VIEW, so the
  table-only work in `0001`, both `0008`s, `0014`, `0015`, `0032` and `0037`
  (indexes, ALTER TABLE, ENABLE RLS, policies) died on replay. Each of those
  regions is now wrapped in a guard that runs it only while `calls` is still
  a table; on a split project `0040`'s own policies on the typed tables are
  what apply. **Any new table-only statement on `public.calls` needs the same
  guard.**
- **`0039_material_returns.sql`** — MRN (Material Return Note): the return
  register, its `MRN-YYMM-NNNN` numbering, the guard that stops an engineer
  returning more than they hold, and the fifth hand-stock movement that
  subtracts it. Shipped **inside `HandStock_X.sql`** (re-run that file; it now
  carries `0023` then `0037`) rather than as its own bundle, because it adds a
  column to the same two views — a later re-run of the hand-stock file must
  carry it or it would redefine them back without returns. Until it is run, the
  Material Returns module says so and stays empty. `_status.sql` row 17.
- `0011_call_request_actions.sql` — cancel/mapping columns on `call_requests`.
- `0012_call_state.sql` — `call_state` + `pending_calls` views. Until it is
  run, the Call Status column stays blank and Pending Calls says so.
- ⚠️ **Migration numbers have collided repeatedly** (two `0008`s, two `0010`s,
  two `0011`s, two `0012`s) because parallel branches each claimed the next
  number. Ordering between a pair that shares a number is undefined. Worth
  moving to timestamp-prefixed names.



### Supabase cutover — DONE (app now runs on Postgres)
Reads were timing out on Apps Script; the app is now on Supabase (Postgres + auto
REST + RLS + Auth). Migrations `0001`–`0013`, applied per module from
`supabase/apply/`. ⚠️ `supabase/full_schema.sql` is a **stale** snapshot — it
predates the spare module's `0009`/`0011`/`0012` (no `or_no`, no
`spare_needs_review`), so use the apply bundles, not that file.
- ✅ Schema + reports-as-history (per-visit, keyed by UID); data layer
  (`src/lib/supabase.ts`), `sheets.ts` delegates when connected.
- ✅ Baked project URL + publishable key; **email/password login** via `profiles`.
- ✅ Loaded: masters 567, parties 5,872, products 20,999, parts 1,324, calls
  (FIELD+INST+PM) 11,299, reports 16,838 visits.
- ✅ On Supabase: Field / Installation / **PM** registers (**server-side search**,
  no 300-cap), **Dashboard**, product cascade + **Product Master** view,
  **Party Master** view, master dropdowns (paginated past the 1000 cap),
  **Reports** view, **Update Call reporting** (per-visit history, engineer picker),
  **spare consumption + feedback**, **Request Registration** (→ `call_requests`,
  multi-product ≤5, REQID/UniqueID), **Pending Registrations** (the Hotline
  desk over `call_requests`), **Spare Requests** (writes + reads Supabase), in-app **Bulk
  Data Import**, unified **call view** (actions on top + mini-tables keyed by Call
  Number).
- ✅ **Historical requests imported** — the CRN Registration sheet export
  (Data2026) drops straight into Bulk Data Import: 4,083 rows → 4,077 (six
  exact double-submissions deduped on UniqueID), 2,692 requests, Jan–Aug 2026.
  A row with a UCN loads as **Registered**, one without stays **Pending** and
  reaches the Hotline desk. Needs `0024_call_request_extra.sql` — the sheet's
  "Any Open Call?", Regional Manager and Comments / Remarks live in `extra`.
- ✅ **Call requests + call state** — `0010_call_request_items` (a request is one
  row per call sharing its REQID; `unique_key` is the identity; atomic insert
  via `next_call_reqid()`), `0011_call_request_actions` (map / cancel columns),
  `0012_call_state` (the two views) and `0014_call_state_denorm` — the state is
  kept ON the call by a trigger on `reports`, because deriving it per read cost
  >5s under the visit-table RLS (statement timeout). Applied.
- ✅ **Apply bundles** — new SQL goes in `supabase/migrations/` **and** a bundle
  (`node scripts/build-apply-bundles.mjs`): `supabase/apply/call_requests.sql`
  for this module, `all.sql` for everything, `_status.sql` to see what a project
  is missing. Migration numbers are per-module and collide
  (`0011_spare_intake` vs `0011_call_request_actions`) — go by file name.
  `supabase/tests/call_requests_test.sql` exercises the whole set against a
  throwaway Postgres.
- ✅ **Local browser cache + "synced X ago" + 30-min auto/force sync** on masters,
  Reports, and spare tables; **Load more** in every table footer.
- ✅ **Global date formats** (Short `dd-mmm-yyyy`, Long `dd-mmm-yyyy hh:mm:ss`).
- ✅ **RBAC** — 10 roles, admin-editable **Roles & Permissions** matrix
  (functional + per-module actions), enforced in `can()` + nav + route guard.
- ✅ **User Access** — assign role per user + per-user **extra_permissions**.
- ✅ **Spare approval workflow** — RM → Commercial → NSM → Stores(DC); Commercial
  & NSM auto-approve unless item is AMC/OGP; RBAC-gated stage actions.
- ✅ New-call create fix (`0008`: creator can read back the inserted row).
- ✅ **Reporting reads fixed** — every `reports` query ordered by a `created_at`
  column the table never had, so the Reporting page failed with *“column
  reports.created_at does not exist”*. Ordering is now `visit_at` (newest visit
  first, nulls last) tie-broken by `id`. **Run the `reports` apply bundle**
  (`0010_reports_ordering.sql`) for the indexes behind that sort — the app works
  without it, large loads are just slower.

### Migrations to run (Supabase SQL editor)
- **`0032_call_state_by_entry.sql`** (apply bundle: `call_requests`) — the call's
  status now comes from the latest **visit entry** (by entry timestamp), not the
  latest visit date, and "Solved - Report Pending" no longer reads as Solved.
  Until it is run, a back-dated visit can still win and a report-pending call
  drops off Pending Calls.

### Open items & questions
- **User Master data + engineer logins** — directory infra is done and `0004`
  is now **applied** (via the `user_directory` bundle);
  **pending:** import the **User Master CSV** (turns on directory-based scoping +
  the RM→engineer reporting dropdown).
  ✅ **First-time logins are solved:** the app now handles Supabase **invite**
  links as well as reset links — an invited user lands on a "Welcome — set your
  password" screen (`recoveryIsInvite` in `supabase.ts`, `ResetPassword.tsx`).
  ✅ **Bulk provisioning:** `scripts/create-auth-users.mjs` creates confirmed
  Auth accounts from `user_directory` (or a CSV / a list of emails), upserts a
  `profiles` row for each, and optionally sends invite emails (`--invite`). Run
  it locally with the SERVICE_ROLE key. After that, users either get the invite
  email or click **Forgot password?** to set their password.
- **Audit-log retention** — ✅ shipped: `0033_audit_retention.sql` adds
  `purge_audit_log()` and a daily pg_cron job that deletes rows older than 7
  days. **To run:** apply `0033` in the SQL editor as `postgres`; if pg_cron
  isn't on, enable it (Dashboard → Database → Extensions) and re-run. The file
  prints the manual fallback (`select public.purge_audit_log();`) if it can't.
- **Tighten consumption / feedback RLS** to the specific roles — `cons` / `fb`
  still allow any authenticated write. **Spare approvals are done:**
  `0008_rbac_enforcement` scoped `sr_update` and added a per-stage guard, which
  `0009` and `0012` extended to the receipt and auto-approval paths.
- **Raw monthly PM bulk import** — accept the raw PM tab export directly in Bulk
  Data Import (auto-map, preserve back-dated `reg_date`). Back-dating already
  works via the clean-CSV importer.
- **PM Reporting fields** — surface PM-specific report columns in the report form.
- **Product Master derivation + Warranty/Contract registers** — ✅ shipped
  (`0036_sales_contracts.sql`). Sale Entry → Warranty Sale Details and Contract
  Entry → Contract Details are header+item registers: a common value is stored
  once on the header and the item column is an override, so editing the header
  moves every machine that follows it (the exports had 692 warranty dates, 402
  contract statuses and 29 contract types drifted from their own header — those
  land as pinned overrides and are kept). `machine_cover` answers what a serial
  is under today, and `sync_product_cover()` keeps `products` — what the call
  form reads — in step. All four exports import as exported in Bulk Data Import,
  in any order. **To run:** `supabase/apply/_status.sql`, then
  `supabase/apply/sales_contracts.sql`, then import the four CSVs.
  **Still open:** Ownership Transfer (no table yet), and the AMC/CMC renewal
  flow (raising the next MC from an expiring one).
- **Pending Calls noise** *(watch)* — a call with no visit reported counts as
  Unattended, with no age cut-off, so an old import can crowd the list; add a
  date filter if it does. "Report pending" counts as open (visited, not closed)
  — say so if it should be hidden instead.
- **Manual Report** — ✅ upload restored. The report form takes either a pasted
  Drive link or a file (PDF/photo, ≤10 MB) uploaded through the same
  `driveupload` / `driveref` endpoints the request form uses (folder
  `1-46Ud9j…z2La`); the returned link fills the field, so both paths store one
  ordinary Drive link. The previous visit's report is linked from the drawer.
  Live: CallReg was redeployed with the Drive scope (`driveupload` / `driveref`),
  and the new `/exec` is baked in as URL version 8 — which also unblocks the
  request form's Installation Report / KYC uploads. **Queued:** surface the link
  as a 📎 column in the Reports register and the call-view mini-table.
- **Reports history screen** — a fuller visit-history report beyond the call-view
  mini-table (the `/reports` screen covers the list; expand if needed).
- **Product Master gaps** — migration dropped City / State / Service Engineer;
  cascade prefill leaves those blank. Re-map from ProdMaster if needed.
- **Editable Registration Date on the single-call PM form?** (question).
- **Reporting field spec** — ✅ done. The Update Call form follows the agreed
  list: fetched call context (UC Number / Call Number / Call Type / Email-ID), a
  **Service Report** section in spec order, the three statuses (Solved - Report
  Completed / Unsolved / Solved - Report Pending), pending reason from the master
  (mandatory when Unsolved), Yes/No dropdowns for Add Consumption? (mandatory),
  Maintenance Done? (optional) and Recomended Filter Changed? (mandatory), a
  mandatory manual report on a completed call, Warranty Start Date on
  installations only, Accessory Serial No suggested from the party's CPX/ASU
  units, and Name / Contact Number / Designation on sign-off. Consumption lines
  stay editable (change part or quantity, delete) until the report is saved.
- **Rotate the Supabase secret key** — it was pasted in chat during setup.
- **Local `sheets.ts` fallback** — the Apps Script path remains as a fallback when
  Supabase isn't configured; retire once fully off sheets.

- **Customer feedback** — ✅ done. Mandatory on a solved call, with the **exact
  v2Feedback question set filtered by call type** (INSTALLATION-only, FIELD-only,
  PM/FIELD = not-installation, and all-types questions). Ratings use
  Excellent/Good/Average/Poor (`feedbackrating` master); "Advance PM Done?" is
  Yes/No, "Warranty Start Date?" a date, "Remarks" free text. Saved as a
  structured row to v2Feedback (identifying fields + answers + Call Type).

- **Masters in 200 All Masters** — ✅ loaded into `masters` and editable in All
  Masters (see Masters above). Each identified by its column header:
  - `complaint` → tab "Standard Complaint", col **"Complaint Name"** → Standard
    Complaint field on the call form.
  - `calltype` → col **"Call Type"** → Call Type select on the Request form
    (FIELD, INSTALLATION CALL, P M VISIT, SW UPGRADATION, FSCA, DEMO, ...).
  - `pendingreason` → col **"Call Pending Reason Name"** → the pending-reason
    field on the call report (Unsolved branch).
  - `cancelreason` → col **"Call Cancel Reason Name"** → the reason on the
    Hotline's **Cancel request** action (Pending Registrations).
  - `feedbackrating` → col **"Feedback"** → the rating answers on the feedback
    form.
  - `orapproval` → cols **"Approval Stage" / "Status" / "Reason for Approval /
    Rejection"** → the reason list behind a spare approval or rejection; not yet
    wired into the Spare Requests dialogs (the reasons are free text there).

---

## 📋 Queued (from the Service_CRM intent)

- **Spare module** — ✅ Phases 1–4 shipped, and **live on Supabase since
  2026-08-29** (applied with the `all.sql` bundle).
  - *Phase 1:* raise a Call-Based spare request from a call (📦 Spare /
    Request Spares); **Spare Requests** register lists one row per part with the
    approval/dispatch chain, role-scoped. Parts come from the `spare` master.
  - *Phase 2:* approval chain RM → Commercial → NSM → Stores (DC dispatch);
    Commercial + NSM auto-approve unless the item is AMC or OGP.
  - *Phase 3* (`0009_spare_receipt.sql`): engineer **acknowledgement** closes the
    loop (Dispatched → Received, raiser only); reject **reasons** and dispatch
    details (DC, courier, remarks) captured in confirmation dialogs; stage KPI
    tiles + stage chips with a **"Needs my action"** queue; a request **detail
    drawer** with every part and the full approval trail; new `spare.receive`
    permission. The migration extends `0008_rbac_enforcement.sql`'s stage guard
    to cover the receipt columns (the raiser holds no approval permission, so
    the guard would otherwise reject the acknowledgement) and grants
    `spare.receive` in `app_roles` additively.
  - *Phase 4* (`0011_spare_intake.sql`): the intake spec — OR NO / RowNo / OR
    Req Date assigned by the database, UCN picker, engineer selection, 20 parts
    per request — and Supabase-only writes (the `v2_ORReq-All` append is gone).
  - *Phase 4 fix* (`0012_spare_auto_approval.sql`): an RM approving a non-AMC
    item was **refused by the database**. `buildPatch` writes the Commercial and
    NSM auto-approvals in the same update as the RM's approval, and 0008's stage
    guard demanded permissions the RM does not hold — so the common path could
    not be approved at all. The guard now allows exactly that case; a manual
    approval still needs its own action and AMC/OGP still cannot be auto-cleared.
  - **Verified:** `supabase/tests/` applies every migration to a throwaway
    Postgres and exercises the triggers (12 scenarios: OR numbering from 47042,
    RowNo per OR, qty/20-part limits, the non-AMC fast path, receipt restricted
    to the raiser and to dispatched requests, the AMC review rule). It is what
    caught the 0012 bug — the build and the TypeScript tests could not see it.
    The harness runs as superuser, so it covers **triggers, not RLS policies**;
    the policies still want a check against the live project.
  - *Phase 5* (`0016_spare_line_approvals.sql`): **approvals moved from the
    request to the spare.** The RM decides each line on its own, so one OR can
    go forward partly approved. Every later stage reads the same per-line
    state, which is what lets it be actioned per spare *or* per OR (an "all N"
    button; the RM stage deliberately has none). The request keeps a rolled-up
    stage — the least-advanced surviving line — maintained by trigger, and the
    header's own approval columns are frozen so the two cannot disagree.
  - *Phase 6* (`0017_spare_or_number_monthly.sql`): OR numbers become
    **`OR-YYMM-NNNN`, restarting at 0001 each month** (a back-dated request is
    numbered in its own month). A per-month counter table replaces the single
    running sequence; numbers already issued keep the old `OR47042` form, since
    they are quoted on DCs and in Tally. `0018`/`0019` settled the shape on
    `OR-2608-0001`; the four-digit counter keeps the register sorting correctly.
  - *Phase 7* (`0022_spare_line_uid.sql`): **every spare has its own ID** —
    `<OR number>-<RowNo>`, e.g. `OR-2608-0001-01`. It leads the register, the RM
    approves against it and Stores dispatches against it, so two spares on one
    OR can be dispatched on different days with different DCs (the per-line
    columns for that have existed since 0016; this adds the reference to quote).
    Fixed once issued, unique across the register.
  - *Phase 9* (`0025_spare_dropped_stage.sql`,
    `scripts/import-spare-history.mjs`): the **26_SpareRequest history imports**
    — 4,088 requests and 8,480 spare lines back to June 2023, with the approval
    chain, stores status and SO number per line. Driven by `v2_OR_Req`, which
    carries every identifying field, so the **57 ORs missing from `v2_ORReq-All`
    still import in full**. Imported requests keep their original `OR43016`-style
    numbers; the monthly `OR-YYMM-NNNN` counter is untouched, since its seeding
    only matches the new format. Each imported spare gets its own ID
    (`OR43016-01`) from the existing trigger.
    New terminal **Dropped** stage for a spare Stores did not send — distinct
    from Rejected (254 of the 272 had the RM's approval first), and it no longer
    holds its request open.
    ⚠️ **8 lines are both RM-Rejected and Stores-Dropped**; the derivation calls
    those Rejected — the approver's decision closed the line — where the sheet's
    own Status column said Dropped. Every other line matches the sheet exactly
    (8,033 Dispatched, 35 Stores, 15 RM, 6 Commercial). One-line change in
    `spare_line_stage()` if the sheet should win instead.
    The CSVs stay out of git (`migration-data/*.csv` is ignored) — customer data.
  - *Phase 17* (`0041_stock_read_scope.sql`): **the stock screens follow the
    reporting tree too** — Hand Stock, Stock Transfer, Material Returns.
    Two gaps after 0040 scoped the spare register:
    • `engineer_stock` was **not** `security_invoker`, so it ran with the
      view owner's rights and bypassed RLS entirely. `listAllStock()` feeds
      the Stock Transfer screen from it, so any signed-in user could read
      every engineer's stock level whatever the table policies said. Now
      invoker-rights. `engineer_stock_available()` is SECURITY DEFINER, so the
      overdraw guard still counts every movement — verified, it still sees
      another team's 6 valves.
    • `st_read` tested `is_admin()` alone, so the office desks could not see
      transfers at all; now `can_view_all_calls()`, as everywhere else.
    Hand Stock and Material Returns needed no policy of their own:
    `handstock_balance` / `handstock_movements` are already security_invoker
    and inherit, and `mr_read` (0039) already reads this way.
    "View as" is a client-side identity — the query still runs under the
    administrator's own session, so RLS cannot scope a preview. The same
    `previewScoped()` filter #75 gave Spare Requests now narrows Hand Stock
    (levels + movements), Stock Transfer (stock + transfers; a transfer counts
    if either side is in scope) and Material Returns while a preview is
    active, and is a no-op in a real session. `src/lib/access.ts`.
    **Merged (#76). Still to run on the live project: `HandStock_X.sql`**
    (carries `0041`) — the stock-side scoping is not in force until it is.
    ⚠️ **Two re-run breaks found on `main`, both pre-existing and left alone**
    (verified by stashing this branch's changes and reproducing):
    `all.sql` is no longer idempotent — `0040_call_tables_split.sql` turns
    `calls` into a view, so a second pass dies at base's `create index ... on
    public.calls`; and `HandStock_X.sql` re-run dies with *cannot drop columns
    from view*, because a later migration widens `handstock_balance` and
    re-running 0023 tries to narrow it back. First runs are clean and live
    databases are unaffected, but the "bundles are idempotent" guarantee is
    broken in both. They belong to the call and material-returns work.
  - *Phase 15* (`0032_stores_sees_pending_dispatch.sql`): **Stores Incharge
    could not open Pending Dispatch.** 0027 granted `mod:/spare-dispatch` only
    to roles whose stored list already held `spare.dispatch` — one condition
    too many, since a role's list is editable in Roles & Permissions, so any
    role re-saved or trimmed came out of that migration without the screen
    while still being the role that dispatches.
    Granted by ROLE now as well (the way `0020_stock_transfer.sql` does it),
    OR'd with the action, plus the spare register so Stores can see what is
    coming. Every clause appends only, so an admin's other edits survive.
    ⚠️ **The wider trap:** `0008_rbac_enforcement.sql` seeds each role with a
    HARD-CODED module list, and a stored `app_roles` row wins outright over the
    client defaults (`permsForRole`). So **every new module is invisible to
    every role until a migration grants it** — this has now bitten for
    handstock (0023), stock transfer (0020) and dispatch (0027/0032). Worth
    making the grant part of adding a module rather than a follow-up fix.
  - *Phase 14* (`0031_pending_dispatch_live_stage.sql`): **the dispatch queue
    computes the stage instead of trusting the column.**
    Reported symptom: Spare Requests showed three spares at Stores while
    Pending Dispatch was empty. The two screens were asking different
    questions — the register derives the stage in the app from the approval
    columns (`deriveStage`), the queue filtered on `spare_request_lines.stage`,
    which is a trigger-maintained CACHE of that same derivation. Any write that
    does not refresh it (a load with triggers off, a row last written before
    0016/0025 changed the rule) leaves the two disagreeing, and the spare is
    invisible to Stores while looking perfectly normal in the register.
    The view now applies `spare_line_stage()` to the columns. The cached column
    is repaired for every line as well, since the register's chips and tiles
    and the header roll-up still read it.
    Reproduced first: with the stored stage forced to 'Commercial' behind the
    trigger's back, the queue returned 0 rows before and all 3 after — kept as
    step 12 of `spare_dispatch_test.sql`.
  - *Phase 13* (`0029_engineer_address.sql`): **the Declaration form**
    (`/declaration/<stock out>`) — the template's second sheet, the paper that
    travels with the parcel. Same printing as the challan: A4, narrow margins,
    one complete `<section>` per sheet (18 rows, the sheet's own grid), so the
    heading and the sender block are on every page.
    Three things the form needs and the app did not have, each settled where it
    belongs:
    • **the address** — from the **User Master**: `user_directory` gains
      `address` / `city` / `state` / `phone`. The sheet always had those
      columns and the User Master screen already showed City/State/Contact, but
      the table never carried them, so on Supabase they were blank. Now read,
      shown (Address added to the screen), imported, and **lifted out of
      `extra`** for a directory imported before they were columns.
    • **the approximate value** — typed per parcel. The form says approximate,
      and `parts` carries no price at all.
    • **the purpose sentence** — the sheet's COVID-era wording is the default
      and is editable.
    Dispatch may correct the four address fields from the form and save them
    back to the User Master; a guard refuses every other column from a
    non-admin, so the reporting tree cannot be edited through that door.
    **Split across two migrations, on purpose.** `0029` is the four columns and
    the `extra` backfill, and ships in the **User Directory** bundle where the
    User Master lives. `0030_engineer_address_write.sql` is only the rule about
    writing them, and ships with **RBAC**, because its policy calls
    `has_perm()` — which RBAC defines and which applies after the directory.
    (Both were first put in the RBAC bundle, which worked but hid a User Master
    column change inside "Roles & Permissions". Bundle ORDER is the constraint,
    and it has now bitten twice: a new object may only reference what its own
    module already depends on. Splitting the migration, rather than moving it,
    is the way out.)
    `0029` drops the write guard around its backfill and puts it back only if
    it exists, so it is safe both on a first run (no guard yet) and re-run
    after `0030` (guard restored) — verified by applying the bundles out of
    order and checking the trigger is still installed.
  - *Phase 12* (`0028_dc_number_is_stock_out.sql`): **the Delivery Challan
    prints** (`/dc/<stock out>`), laid out from `v2_DCTemplate.xlsx`.
    A4, narrow margins (0.25in sides, 0.75in top/bottom), and the letterhead
    AND the signature block on **every** sheet.
    That last part decided the implementation. Two browser mechanisms were
    tried and both fail: a table's `<thead>` repeats, but Chromium prints
    `<tfoot>` only on the LAST page; and a `position: fixed` footer repeats but
    reserves no space, so it paints over the final rows (both reproduced, and
    the second one confirmed in a printed PDF). So the pages are cut in code —
    `paginate()` in `src/lib/dc.ts` — one complete `<section>` per sheet,
    20 rows each, which is exactly the template's own grid and exactly what
    fits: a sheet measures ~250mm against 259mm of usable A4.
    Verified by printing through headless Chromium: 1/6/20 spares → 1 sheet,
    21/40 → 2, 41/45/60 → 3, with the letterhead and both signature blocks on
    every page and no row hidden.
    **One number, not two.** 0027 minted an SO- and a DC- series on the
    assumption the challan had its own number. The template says otherwise —
    it identifies the delivery by **Stock Out No.** and has no DC field — and
    so does the sheet era, whose `SO NO` column is what the import loaded into
    `dc_number`. `dc_number` now mirrors the stock out, every existing read
    (hand stock's movement ref, the trail, the register, the history) keeps
    working, and `next_dc_number()` is retired. If a distinct challan series is
    ever wanted, `spare_dispatches_assign_no()` is the one place it comes back.
    ⚠️ **Still to do:** the workbook's second sheet, the **Declaration form**
    (for the courier), is not built — it needs a recipient name and address and
    an approximate value, none of which the app holds. Ask where those come
    from before building it.
  - *Phase 11* (`0027_spare_dispatch.sql`): **Pending Dispatch** — the Stores
    queue as a screen of its own (`/spare-dispatch`), grouped by engineer,
    longest wait first. Multi-select within a group (or tick the whole
    engineer) and book the lot out in ONE stock out.
    New `spare_dispatches` header, one row per stock out, carrying the
    generated **SO-YYMM-NNNN** and **DC-YYMM-NNNN** numbers, the engineer, the
    courier and the DC date; `spare_request_lines` gains `dispatch_uid` /
    `stock_out_no` and keeps `dc_number`, so hand stock, the trail and the
    imported history all still read.
    `dispatch_spare_lines()` does the batch atomically and enforces what the
    screen promises — the caller holds `spare.dispatch`, every line is still
    waiting at Stores, and the whole batch goes to one engineer (a DC is one
    delivery to one person).
    Numbering is the OR/ST upsert counter, so concurrent dispatchers cannot
    collide. ⚠️ **The DC format is still to be confirmed** — it is produced in
    exactly one place, `next_dc_number()`, so changing it is a one-function
    change. A DC *document* (the printable challan) is not built yet, pending
    that format.
    Dispatch was removed from the register's own modal: there is now one way
    to book stock out, so nobody types a DC number by hand. The register's
    Stores action links to that engineer's queue instead.
    No change was needed for hand stock or the call-report picker: `0023`
    already counts a spare from the DISPATCH, not the acknowledgement, so a
    booked-out spare is in the engineer's hand stock — and therefore in the
    consumption picker — immediately.
  - *Phase 10* (`0026_spare_approval_data.sql`): **Commercial and NSM answer
    their own forms**, transcribed from the two Google Forms.
    Commercial branches — status → clearing reason → MC/SA number *or* the
    four-step Direct PO checklist, or a pending reason. NSM is flat — status,
    multi-select reasons with an *Other*, remarks.
    Answers live in `spare_request_lines.approval_data` as jsonb keyed by
    stage, so a form can change without a migration; the decision itself stays
    in the columns the workflow reads, so stage derivation is untouched.
    A separate trigger gates each stage's answer by that stage's permission.
    **New third outcome:** "Admin Process in Progress" / "Put on HOLD" record
    *why* without approving, so the spare stays in that stage's queue —
    previously Commercial and NSM could only approve or reject.
    **Resolved (asked and answered):** the clearing reasons include Under CMC
    and Under Warranty while `needsReview()` routes only AMC and OGP items to
    Commercial — which looked like a mismatch, and is not. **Contract entry
    lags reality:** a machine whose CMC or warranty has not been keyed in yet
    still reads as OGP, so it lands with Commercial, who clears it as *Under
    CMC* / *Under Warranty*. Those reasons are how Commercial records that the
    system is behind the contract. Routing stays AMC + OGP; the form keeps all
    five reasons. Do not "fix" either one.
  - *Phase 8* (`0023_handstock.sql`): **Hand Stock** (`/handstock`) — the stock
    level an engineer is carrying, per spare:
    **stock out (Stores) − consumption − transfer out + transfer in**.
    Two tabs: **Stock Level**, one line per engineer and spare with every term
    as its own column (in-hand / short / settled filters, per-engineer filter,
    search, CSV, and a per-line movement trail in a drawer); and
    **Movements**, the ledger those levels are made of — every stock out,
    consumption and transfer, newest first, filtered by kind and engineer,
    paged and exportable.
    It does **not** add a second stock system: `0020_stock_transfer.sql` owns
    the transfer tables and the `/stock-transfer` screen, and `engineer_stock`
    — which that screen and its overdraw guard read — is redefined as a view
    over `handstock_balance`, so the two can never disagree.
    That consolidation fixed two ways a balance was wrong: only
    `req_type = 'HandStock'` requests counted as stock in, so a spare
    dispatched against a **call** was consumed out of a balance it had never
    been added to (engineer goes negative, transfers refused); and a dispatch
    carrying a DC but **no `dispatched_at`** — sheet-era rows, imports —
    counted for nothing. Stock out is now every dispatched line, decided by the
    *status*, dated by the best timestamp the row has.
    **Reporting → Spare consumption offers only what that engineer holds**,
    with the quantity in hand, and refuses more — so a report can no longer
    consume a spare nobody issued.
    Movements are matched on the engineer's **name** (case- and
    space-insensitive) and the part **CODE**; consumption never carried an
    email, so the report form now writes one for future rows.
    Requirements are written up in **`HandStock_Req.md`** (repo root), numbered
    HS-1…HS-40 with the check that proves each one.
    A **negative** level is shown, not hidden. `supabase/tests/handstock_test.sql`
    covers it, and `stock_transfer_test.sql` still passes against the
    redefined view.
  - **Next:** warehouse-side stock — the *Stores* balance, decremented on
    dispatch (needs `parts.on_hand`/price columns first; the ITEM Master import
    carries only code, description and Active) and a stores pick/pack view.
    Engineer-side stock is now live, so consumption reconciliation is a filter
    over it (a spare still in hand long after the call closed). A transfer is
    deliberately immediate — if hand-overs need the receiving engineer to
    accept them, that is an acknowledgement step on `stock_transfers`. Also worth a smoke test
    on the live project now that the migrations are applied: raise a request,
    approve it as RM, dispatch it, acknowledge it — the RLS paths (`sr_update`,
    the new `sr_delete`) are the part the trigger harness cannot cover.
- **Stock Transfer** — ✅ shipped (`0020_stock_transfer.sql`). Engineer-to-engineer
  hand-stock transfers, numbered `ST-YYMM-NNNN`. **Stock is derived, not stored:**
  the `engineer_stock` view sums hand-stock dispatched to an engineer, less
  consumption, plus/minus transfers — so a balance cannot drift from its history.
  A transfer only offers parts the sender holds and caps the qty at what is
  left, enforced by trigger as well as in the form (an AFTER trigger, so a
  multi-row insert that individually passes but together over-draws is caught).
  **Note:** inflow keys off *dispatch*, not the engineer's acknowledgement —
  acknowledgement needs `spare.receive`, which the role defaults no longer give
  engineers, so keying off it would leave every balance at zero.
  **Next:** store-level stock (this is engineer hand-stock only), and stock
  decrement straight from a Call-Based dispatch.
- **v2Consumption / v2Feedback** — ✅ fixed. They are standalone spreadsheets
  (`consumption` = `1j1IHT3P…dG7o`, `feedback` = `1Mi-b-JY…nqXc`), now wired as
  their own books; the report-time spare-consumption / feedback saves target
  each book's primary sheet (a tab whose name contains "consumption"/"feedback",
  else the first sheet). Links editable in Admin Config. Confirm the landing tab
  after redeploy; if it isn't the intended one, name it and I'll pin it.
- Link remaining masters to call registration (Contract Entry, Warranty Sale
  Entry) — ✅ the registers now own both, and a machine row registers a field
  call directly. ITEM Master is done — it backs Part Master, the spare-request picker
  and the in-call consumption picker; "200 All Masters" is done — every list is
  a maintained table in All Masters.
- **Next on masters:** point the Spare Requests approve/reject dialogs at the
  `orapproval` list instead of free-text reasons.
- Preventive Maintenance (PM) schedule/calls.
- Sale Entry, Reports, Dashboard/KPI, Indoor Activity, other misc (to be placed).

---

## 🚀 Before go-live

- **Clear all data and re-upload fresh from the sheet CSVs.** Everything in
  Supabase today is migration/test data loaded while the modules were being
  built (plus whatever the demo seed left behind). Before go-live, purge the
  data tables and re-import a clean export of every sheet in one pass through
  **Bulk Data Import**, so the live system starts from the sheet as the single
  source of truth.
  - **Purge, then load in dependency order:** masters / value lists → parties →
    products → parts (ITEM Master) → user directory → calls (FIELD + INST + PM)
    → reports (per-visit) → spare requests + lines → consumption → feedback →
    call requests → stock transfers + lines. Children reference parents, so the
    order matters. **Hand Stock needs nothing of its own** — a balance is
    derived (stock out − consumption − transfer out + transfer in), and
    `engineer_stock` is a view over it, so both come back correct once the
    ledgers underneath are loaded.
  - **Keep, do not purge:** Supabase Auth users, `profiles`, `app_roles` /
    Roles & Permissions, per-user extra access, saved table views, and Admin
    Config. Those are configuration, not data.
  - **Reset the counters after loading** so new records continue the series
    rather than colliding with the imported rows: the UCN counters (F / I / PM);
    the **Call Number** running number (`0015_call_number.sql`, `CLYY#####`,
    seeded from the existing series); `next_call_reqid()` for REQID; and the
    **OR NO** per-month counter table (`0017`–`0019`, `OR-YYMM-NNNN` restarting
    at 0001 each month) — a fresh load of historical spares must not leave the
    current month's counter behind the numbers it just imported — and
    `stock_transfer_counters` (`0020`) for the same reason. Spare line UIDs
    (`0022`, `<OR number>-<RowNo>`) follow the OR number, so they need no
    counter of their own.
  - **Verify against the sheet before opening it up:** row counts per table,
    a spot-check of back-dated `reg_date` values, call status derivation
    (`call_state`), and that role scoping still resolves — it matches on exact
    `User Name` ⇄ `Call Allocated To` strings.
  - Needs a repeatable purge path (a `supabase/apply/` reset bundle, or a
    documented SQL snippet) rather than deleting tables by hand — it will
    likely be run more than once during the dry run.

---

## 🩺 Daily Call Review (DCCR) — shipped 2026-08-31

- The module is live: three review stages, the derived Any Potential Effect /
  Action Taken / Review Status, the two per-product masters, and the export in
  the register's own 38-column format.
- **PENDING — SQL to run on the live project.** Run `supabase/apply/_status.sql`
  first; it now reports `daily_review (DCCR)` and `daily_review: values`. If
  either says NO, run **`supabase/apply/daily_review.sql`** (0044 + 0046 + 0047).
  Until it is applied the module reads nothing — `field_call_review` does not
  exist. **Re-run it after 0047** even if the earlier parts are already in: 0047
  adds the report context, the age banding and — importantly — the indexes that
  keep the register fast.
- The register opens on the **last 30 days** and reads a page (500) at a time,
  with every filter applied by the database. It has to: the per-call report
  lookups run for every row a query returns, so pulling the whole register at
  once cost ~13.7 s per page on 25k calls / 50k visits and showed nothing until
  the last page landed (which is what "it is hanging" was). With
  `field_calls_reg_date_idx` a page is ~0.25 s. If the register ever feels slow
  again, check that index exists before anything else.
- **Visits and consumption map to a call by CALL NUMBER**, not UCN (0048). The
  Field Call view's own panels do the same (`reportsByCall` /
  `spareConsumptionByCall` both filter on `call_number`), and rows from the
  register may carry no UCN at all. The view matches on either key, with blank
  keys excluded so an empty `call_number` cannot sweep in every other blank one.
  Anything else that joins reports or consumption to a call should follow suit.
- `supabase/tests/_stub.sql` now sets Supabase's own default privileges
  (`authenticated`/`anon` get blanket DML on `public`, RLS being the gate).
  Without it a suite that runs `set local role authenticated` fails on
  "permission denied for table reports" — an artefact of the harness that says
  nothing about the policy under test.
- The stage counters read `field_call_review_summary` — the same register
  WITHOUT the report lookups — so counting a year of calls is ~25 ms rather
  than ~3 s. Keep new filterable columns on both views.
- The seed carries the register's own master values (707 groupings, 657 root
  cause key words, tagged MONNAL T60 / MONNAL T75 / COMM). Source CSVs are kept
  in `migration-data/dccr/` so the seed can be regenerated.
- `review.edit` is granted by the migration to admin, hotline, nsm, rgm, rm and
  commercial. Confirm the matrix in Roles & Permissions matches what the team
  wants — nobody else can complete a review, though everyone who can open the
  module reads it.
- Historic reviews are **not** imported. The register's own 3,850 reviewed calls
  for 2026 still live in the workbook; if they should be carried over, that is a
  one-off load into `call_reviews` keyed by UCN (the DCCR export format is the
  same shape, so it maps column for column).
- Review 1 is answered on the Call Registration form. A call registered before
  those three questions were mandatory reads as **Review 1 Pending** — it is
  completed by editing the call, not from this module.

---

## 🔧 Operational notes / blockers

- ⚠️ **`notify_spare_dispatched()` (0045_notifications.sql, on `main`) is broken
  and takes spare dispatch down with it.** It declares a local `uid` and then
  does `select ... from public.spare_requests where uid = new.request_uid`, so
  Postgres raises *“column reference "uid" is ambiguous”* — and because the
  trigger fires on the dispatch write, **the dispatch itself fails**. Reproduced
  on PG16: `spare_stock_scope`, `handstock`, `spare_workflow` and
  `stock_transfer` all now fail at their dispatch steps, and they pass on the
  commit before notifications landed. Fix is one line — rename the variable
  (e.g. `v_uid`) or qualify the column (`where spare_requests.uid = ...`).
  NOT fixed here: it is nothing to do with the daily review, and it deserves
  its own change so it can be verified on its own.

- **Redeploy CallReg** after backend changes, re-authorising the Drive scope,
  and send the new /exec URL so the baked-in default can be bumped. Done for the
  upload endpoints (`driveupload` / `driveref`) — URL version **8**, 2026-08-29.
- **v2Consumption / v2Feedback** are read as tabs of the Call Register spreadsheet
  by default; if they live elsewhere set `cfg_consumption` / `cfg_feedback` or
  share the sheet.
- ⚠️ **A merge on main reverted four modules** (2026-08-29). The audit-log
  branch was cut from a much older tree, and merging it took its stale hunks:
  `SpareRequests.tsx` lost per-spare approvals (leaving calls to `wfButtons` /
  `runPending` that no longer existed), `FieldCalls.tsx` lost `StateBadge`,
  `RequestCallRegistration.tsx` lost its product rows, `UserAccess.tsx` lost
  `sbSendPasswordReset`. **`npm run build` failed on main**, so the Pages
  deploy was broken too. Repaired here by restoring each file from the commit
  before that merge and re-applying the audit calls on top. Worth checking a
  long-lived branch against main before merging it.
- `0009_audit_log.sql` arrived with no apply bundle, which the generator's
  coverage check refuses (rightly) — it now has one (`supabase/apply/audit.sql`),
  and `_status.sql` reports it.
- Role/visibility matching relies on exact `User Name` ⇄ `Call Allocated To`
  strings (case/space-insensitive). Flag any spelling mismatches.
- **`supabase/apply/all.sql` is not re-runnable** (the per-module bundles are).
  On a second run `0012_call_state.sql` recreates `pending_calls` as
  `select c.*, s.state as open_state`, and by then `0014` has added a real
  `open_state` column to `calls` — so the view has the name twice and the
  bundle stops with *“column open_state of relation pending_calls already
  exists”*. Pre-existing, harmless on a first apply; fix by qualifying that
  select when `0012` is next touched.
- **`CallReporting.tsx` was missing its `uploadToDrive` / `MAX_UPLOAD_BYTES`
  import** — `npm run build` failed on the branch tip. Import added.
