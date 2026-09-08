# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-09-08 (the reliability template and the DCCR export; storage
sized against the 500 MB cap)_

_Previously: 2026-09-06 (bundle replay safety; see the top of In progress) ·
2026-09-02 (spare reconciliation shipped and applied; live project fully caught
up)_

---

## 📌 OPEN ITEMS — everything waiting, in one place

This file is 2,000+ lines and its open items were scattered across four
sections. They are indexed here so nothing waits unseen; each links to the entry
that explains it.

### Waiting on the user

| | what | where |
| --- | --- | --- |
| 🔢 | **The PM count is short** — 7,029 rows where two years at 10,000/yr should be ~20,000. Find out before nine years load through the same path. | *Nine years vs the 500 MB cap* |
| 📏 | **PM rows measure ~2× field-call rows** for identical columns. Bloat, or genuinely longer text? 140 MB either way across a backfill. | *Nine years vs the 500 MB cap* |
| 🔒 | **`handstock_period.closed_through`** — while NULL, none of the 68 MB of spare history can move without silently changing stock balances. | *Nine years vs the 500 MB cap* |
| 📄 | **What six AppSheet columns held** — CALL DETAILS, VISIT REMARKS, CHANGE PRODUCT?, SEND EMAIL FOR DEFECTIVE SPARE, SL NO(T), Complaint. Two sample rows would settle it. | *The reliability template* |
| 📊 | **Four objectives still typed** — FFR field failures, PM Calls, Installation call, b.Customer feedback. And the CPX failure rule. | *Objectives 8-12* |

✅ **NOTHING PENDING ON THE DATABASE (2026-09-08).**

`tracker.sql` (row 110) run by the user later the same day — **reported, not
verified**: no `_status.sql` output has been seen since. The Tracker is usable,
and adding the few other people to it is a tick each on Roles & Permissions.

The round below IS verified — from the user's own `_status.sql` output: **all 119
rows read `yes`**, including row 109 (the consumption report) and, for the first
time, the two that had been expected to stay `NO`:

* **`DCCR: ...at a quarter past nine`** — **pg_cron is enabled.** Review 2 now
  auto-answers on the 03:45 UTC schedule rather than only when somebody opens the
  Daily Call Review. That was the last environment setting outstanding.
* **`performance: JIT is OFF`** — the Hand Stock compile-time fix is applied.

This is the entry to trust: it has the evidence behind it. Every other line in
this file is a note, and this file has twice claimed the opposite of what was
applied.

🧭 **THERE IS NOW AN IN-APP TRACKER** (`/tracker`, Administration, v0.9.144),
and **0144 seeds it with the fifteen open items indexed above** (v0.9.145).

It does not replace this file, and the two must not converge. **This file keeps
the reasoning** — why a rule is the way it is, what was tried, what went wrong,
which claims are evidence and which are notes. **The tracker keeps what is being
worked on now.** Only OPEN items crossed over: copying two hundred settled
entries would bury fifteen live ones, and a list nobody can scan is a list nobody
reads.

⚠️ **They will drift, and that is fine.** Closing an item on the tracker does not
close it here; this index is still the one to update when something is genuinely
finished.

### Waiting on a decision

| | what |
| --- | --- |
| 💰 | **Pro vs splitting projects.** Nine years of history is ~1.25 GB with this indexing; the free tier cannot hold it even split three ways. The recommendation is Pro (8 GB). |
| 🧹 | **REINDEX the fat tables.** Index bloat is real here — `record_audit` holds 8 MB of indexes over 792 kB of rows. Likely 30–60 MB back for no behaviour change. |

### Waiting on me

| | what |
| --- | --- |
| 🛠️ | **The reliability export itself.** `reliability_wrr` (WRR-2026 cols 1–14) and the DCCR export (cols 15–67) are both ready; nothing yet writes the file. |
| 🛡️ | **`has_perm()` returns NULL with no signed-in user**, so the bare `if not has_perm(...)` guard never fires. Fixed in the two functions I touched; **15 other migrations still use the bare pattern**. Latent, not exploitable — execute is granted to `authenticated` only. |

### Long-standing

Audit Mode rules · the security migration (D-2/D-3/D-4) · a CI workflow · two
data uploads (77 yearly consumptions, Ownership Transfer) · `engineer_stock`
`security_invoker`.

---

## 🚧 In progress

### The UCN counter restarts daily — 2026-09-06 (shipped, NOT yet applied)

Asked: "why is the UCN not resetting the last 2 digits on a daily basis?"

Because nothing ever reset it. `next_ucn()` took the last four digits from
`ucn_seq`, ONE sequence for the whole database, created in 0001 and never reset
— so the date in front changed daily and the number behind it climbed forever,
shared across all three call types. Not a regression: 0001's own comment said
"confirm this matches the legacy format before go-live", and
`docs/SUPABASE_MIGRATION.md` carried "whether the sequence should reset per
day/month" as an open item from the beginning. Now settled there.

The register is the evidence: it holds `26H28F0009` then `26H29F0003`, and a
monotonic counter cannot go down. The sheet reset daily; the database did not.

**0125** replaces the sequence with `ucn_counters` (day, type_letter, last_no):
- restarts at 0001 each day, **per call type** (user's choice) — the type letter
  is already in the UCN so nothing collides, and a Field register that counts
  1, 2, 3 is the one that reads properly on paper;
- **numbers already issued are untouched** (user's choice). A day's counter is
  SEEDED past whatever that day already carries, so applying it mid-day
  continues the day rather than colliding with a UCN already on a challan;
- ⚠️ **and the day is now Asia/Kolkata.** `next_ucn()` read `now()` in UTC, so
  the DD inside a UCN rolled at **5:30 am IST** — a call registered before then
  already carried yesterday's date. A daily reset on that clock would have reset
  at 5:30 too, so both are fixed together.

`ucn_seq` is dropped. `_reset_for_production.sql` truncates `ucn_counters`
instead of resetting it, and `_backup_before_reset.sql` snapshots that table and
no longer lists the sequence.

**To run:** `supabase/apply/call_requests.sql` — `_status.sql` row 86.


### Bundle replay safety — 2026-09-06 (shipped, NOT yet applied)

`_status.sql` came back with six policy rows at NO after the user ran
`rbac.sql`. Same fault as the `srl_insert` one the day before: a bundle carries
its module from the beginning, so a rule written early and narrowed later goes
BACK when the earlier bundle is re-run. It was measured rather than reasoned
about — every migration applied to one database, each bundle replayed onto a
copy, and every policy, function and view diffed. **Six bundles** were reverting
something. All six are fixed and `npm run check:replay` now passes on all 19.

- **Guarded mirrors.** Where the object could not be moved into the bundle that
  owns the last word, the module now ends with a verbatim copy of the owner's
  definition, skipped while the later module's tables are absent:
  `0121_rbac_policy_tail` (6 policies + the per-stage approval guard),
  `0122_spare_requests_replay_tail` (`dispatch_spare_lines`, two overloads, and
  `sd_read`), `0122_stock_transfer_replay_tail` (`engineer_stock`, `st_read`,
  the transfer stock guard), `0122_notifications_replay_tail`, and
  `0122_user_directory_replay_tail` (drops `ud_admin_write` again).
- **`base.sql` refuses** to run where `app_roles` exists. Mirroring its 29
  later-narrowed objects would have been worse than saying no. Bootstrap is
  unaffected; anywhere else, `all.sql` is the answer.
- **`npm run check:replay`** (new) is the proof, and the only check that can see
  `masters_write` — 0008 creates it through `execute format()`, so no
  `create policy` literal exists for a text check to find.
- **`npm run check:bundles`** grew a MIRRORS list: a mirror must be LAST in its
  module and must match the migration it copies word for word.

⚠️ **Two real faults it turned up on the way:**

1. **The refurbished-part notice has never been sent.** 0064 extends
   `notify_spare_dispatched()` to say the dispatched part is refurbished, but
   `notifications` runs AFTER `handstock` in `ALL_ORDER`, so 0054's version
   overwrote it on every apply. `_status.sql` row 81 reports it.
2. **The per-stage approval guard is currently back at 0008's version on the
   live project** — the `rbac.sql` run that produced the six NOs did that too,
   and 0008's guard refuses an engineer acknowledging receipt. `_status.sql`
   row 82 reports it. Running the new `rbac.sql` repairs it.

**To run on the live project, in any order (that is now the point):**
`rbac.sql`, then `notifications.sql`. Verified from a database rebuilt into the
exact state the user reported: the two together clear all nine NO rows.

**Not fixed, recorded:** `engineer_stock` has no `security_invoker` while the
`handstock_balance` it reads does. `check:views` does not flag it because the
view is not directly over an RLS table, and the read scope is untested. Worth
its own change — see the `create or replace view` note in CLAUDE.md for why an
invoker view over an owner-run one is not protection.


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

### The 500 MB cap — MEASURE BEFORE SPLITTING (2026-09-07)

The user is at ~450 MB of a 500 MB per-project allowance and asked whether
tables could live in a SECOND Supabase project and still be queried and compared
from here.

**They can, but a second project is a second Postgres database**: no SQL joins
across the two, no shared `auth.uid()`, no shared `has_perm()` / `app_roles`, and
none of the apply bundles, `_status.sql`, `check:replay` or `check:views` can see
across the boundary. That is a permanent architectural cost and worth paying only
if the space is genuinely in use.

**A separate SCHEMA does not help here** — same database, same disk. Schemas buy
separation, not capacity. (It would have been the answer if the reason were
ownership or retention.)

⚠️ **A CHECK FILE MUST BE ONE SQL STATEMENT.** The first cut of
`_storage_check.sql` used `\echo` and `\pset` to label its sections — those are
**psql's own commands**, and the Supabase SQL Editor rejects them with
`syntax error at or near "\"`. Every other `_*_check.sql` here is a single
query returning one labelled result set, and that is why. It is now the same
shape as `_status.sql`.

### The reliability template — it is WRR-2026, not Merge WRR (2026-09-08)

**CORRECTED by the user: "it's not Merge WRR, it is WRR-2026."** The sheet a
person fills is the YEAR sheet; `Merge WRR` consolidates the year sheets and is
downstream. WRR-2026's columns 1-14 are Merge WRR's columns 1-14 heading for
heading, so `reliability_wrr` is right and only its address was wrong.

**WRR-2026 IS TWO EXPORTS SIDE BY SIDE:**

| columns | what | where from |
| --- | --- | --- |
| 1-14 | the reliability fields | `reliability_wrr(product)` (0141) |
| 15-67 | the DCCR | `IMPORTRANGE` from a Google Sheet today |

**`DCCR_EXPORT_COLUMNS` already produces 41 of those 51**, in the same order and
under the same headings. **Ten are missing:**

| col | heading | obtainable? |
| --- | --- | --- |
| 15 | Updated By | ✅ `call_reviews.updated_by` |
| 16 | Updated Date | ✅ `call_reviews.updated_at` |
| 32 | CALL PENDING REASON | ✅ `reports.pending_reason` |
| 67 | DUMMY COLUMN | ✅ a spacer — emit blank |
| 35 | CALL DETAILS | ❓ |
| 36 | VISIT REMARKS | ❓ distinct from "VISIT REMARKS (Reporting)", which IS exported |
| 37 | CHANGE PRODUCT? | ❓ |
| 57 | SEND EMAIL FOR DEFECTIVE SPARE | ❓ |
| 63 | SL NO(T) | ❓ |
| 64 | Complaint | ❓ distinct from Standard Complaint and NATURE OF COMPLAINT |

✅ **ALL TEN ADDED 2026-09-08** ("for now add those columns and leave it blank").
`DCCR_EXPORT_COLUMNS` is now WRR-2026 columns 15-67 **exactly — 53 for 53, in
order**, verified against the workbook itself and locked by `check:ui`.

CALL PENDING REASON is FILLED (the register already carries it). The other nine
are blank: the six ❓ because guessing would put invented values on a quality
record, `Updated By`/`Updated Date` because they live on `call_reviews` but not on
the view this screen reads — filling those is a migration, not a line — and
`DUMMY COLUMN` because it is a spacer.

⏳ **Still wanted: what the six ❓ held.** Two rows from the old AppSheet sheet
would settle it.


The user's `VEGA__French_Template_Reliability.xlsx` is a Weibull study, and only
TWO of its sixteen sheets are typed into — the rest derive:

```
Installed Base = FILTER(Inst_PrdMaster!B:B, Inst_PrdMaster!I:I = <model>)
Services       = FILTER('Merge WRR'!C5:K, ...)
```

So filling **`Inst_PrdMaster`** and **`Merge WRR`** fills the workbook; the age
bands, the Pareto and the Weibull fit recalculate themselves.

**`reliability_wrr(product)` (0141) is the Merge WRR half.** ONE ROW PER VISIT —
a call attended three times is three services in a reliability study, and
counting it once flatters the failure rate. **PM calls are excluded**: the sheet
carries its own "Date of last preventive maintenance" column, which would be
meaningless if a PM were a service row of its own. Installation calls ARE
included — the user's own sample has one.

**The DCCR lines up with the template almost name for name**, which is no
coincidence: `any_potential_effect`, `spare_category` and `root_cause_keyword`
are the template's own headings. `Symptoms` is `complaint_grouping` (the
normalised symptom), not the caller's words — the sample reads "MACHINE NOT
SWITCHING ON" as the reason and "DEVICE NOT GETTING ON" as the symptom, and a
Pareto needs the second.

⚠️ **`any_potential_effect` is a GENERATED column** — YES when any of the three
Review 2 answers is. It cannot be inserted, and that is the point: the template's
column cannot drift from the answers behind it.

**Two readings that are mine**, both one line to change: "Default confirmed" has
no column anywhere and is 'Yes' when a root cause was recorded; "FQI/FRC/FSCA n°"
is always NIL because nothing holds one.

**Nine of the sixteen `Inst_PrdMaster` columns have no column in `products`** —
Item Details Long, Item Details, Sold Through, State, City, Address, Item Code,
PO No., PO Date. The Product Master importer is `extraInto: 'extra'` and keeps
them under the SPREADSHEET'S OWN HEADINGS; 0140 surfaces them as `details` jsonb
on the evidence's machine rows. One jsonb, not nine typed columns.

⏳ **STILL TO BUILD: the export itself.** `reliability_wrr` and `details` are the
data; nothing yet writes the two-sheet workbook. `src/lib/xlsx.ts` already makes
multi-sheet files. The template's headings differ from what the user typed —
**Customer Name** not Party Name, **Town** not City, **Installation date** not
Warranty Start Date, **warranty stop** not Warranty End Date — and the export
must use the TEMPLATE's, or the paste lands in the wrong columns.

### Nine years of history vs the 500 MB cap — SIZED (2026-09-07)

The user has call and failure data back to **2017** and wants it in the system.
None of it is loaded: `field_calls` starts 2026-01, `pm_calls` 2024-09.

**Measured cost per row, from the live project:**

| | rows in db | data/row | ALL-IN per row (with indexes) |
| --- | --- | --- | --- |
| `field_calls` | 3,959 | 1,124 B | **7,152 B** |
| `pm_calls` | 7,029 | 2,088 B | **6,860 B** |
| `installation_calls` | 459 | 1,981 B | 8,262 B |
| `reports` | 16,168 | 531 B | 908 B |

**Volume, per the user:** field ~5,900/yr, **PM ~10,000/yr minimum**,
installation ~690/yr — about **16,600 calls a year**, so 2017-2026 is
~**150,000 calls** and ~210,000 visits.

| | rows only | with the CURRENT indexing |
| --- | --- | --- |
| 150,000 calls | ~170-260 MB | **~1.05 GB** |
| ~210,000 visits | ~110 MB | ~190 MB |
| **total** | **~280-370 MB** | **~1.25 GB** |

⚠️ **THE FREE TIER CANNOT HOLD THIS, EVEN SPLIT.** Archive-indexed (btrees on
UCN / serial / reg_date, NO trigrams) it is still ~400-520 MB — one archive
project completely full with no room for next year. Live-indexed it needs three
projects today and a fourth within two years.

**The recommendation is Supabase Pro** (8 GB, ~$25/mo): 1.25 GB fits six times
over, everything stays joinable, RLS keeps working, and the apply bundles and
check scripts keep meaning something. Splitting a validated quality system
across three databases nobody can join is far more expensive than the
subscription — most of all the first time a figure is wrong because half the
data was in the other project.

**THE INDEX MULTIPLIER IS THE WHOLE STORY.** Rows are ~300 MB; indexes take it
to 1.25 GB. The bulk is `pg_trgm` (substring search on party name, call number,
complaint text). An archive nobody types into does not need them — that alone is
the difference between 4x and ~1.4x.

#### ⏳ TO CHECK — the user is doing this (2026-09-07)

1. **THE PM COUNT IS SHORT.** At 10,000/yr, 2024-09 → 2026-09 should hold
   ~20,000 rows. `pm_calls` has **7,029 — about a third.** Whatever loaded it
   stopped early or was filtered. **Find out before nine years go through the
   same path**, or the backfill silently loses two thirds of itself.

2. **PM ROWS MEASURE NEARLY DOUBLE.** 2,088 B/row against `field_calls`' 1,124,
   for tables with IDENTICAL columns (the 0040 split). Either PM complaint text
   really is twice as long, or `pm_calls` is carrying bloat. Across 150,000
   calls that is 170 MB vs 310 MB of rows — 140 MB on a 500 MB allowance. If it
   is bloat, `VACUUM FULL` returns it; if it is real, it has to be budgeted.

3. **`handstock_period.closed_through`** — still unanswered. While it is NULL,
   `handstock_cutoff()` is `-infinity` and EVERY row of
   `spare_issue_history` + `spare_consumption_history` (68 MB) still feeds live
   hand stock. Nothing there is safe to move until a period is closed. Hand
   stock is derived, never stored, so removing source rows changes balances with
   no error and no warning.

#### Also worth knowing

**Visits reach back further than calls.** `reports` holds visits from 2021-08
while the call registers start 2024/2026 — 16,168 visits against 11,447 calls.
Those visits' calls are missing today and will re-attach when the history loads.
Worth confirming that is "visits loaded first" and not a partial call load.

### Where the 331 MB actually is (2026-09-07, measured)

From the user's own `_storage_check.sql` output. **331 MB of disk, not 450** —
the dashboard figure is larger because it counts more than `public` (WAL, and the
`auth` / `storage` / `realtime` schemas).

| | total | heap+toast | indexes |
| --- | --- | --- | --- |
| `pm_calls` | 46 MB | 14 MB | **32 MB** |
| `spare_issue_history` | 35 MB | 26 MB | 9.7 MB |
| `spare_consumption_history` | 33 MB | 28 MB | 5.4 MB |
| `field_calls` | 27 MB | 4.3 MB | **23 MB** |
| `products` | 22 MB | 16 MB | 6.5 MB |
| `spare_request_lines` | 20 MB | 18 MB | 2.1 MB |
| `reports` | 14 MB | 8.4 MB | 5.6 MB |
| `parties` | 12 MB | 3.7 MB | **8.1 MB** |

**INDEXES ARE THE LARGEST SINGLE COST.** `field_calls` carries 23 MB of indexes
over 4.3 MB of data — more than five times the table. The three call tables plus
`parties` hold ~66 MB of indexes over ~23 MB of heap, and the biggest ones are
all `pg_trgm` (substring search on party name, call number, complaint text).

**I predicted `record_audit` and I was wrong.** It is 8.8 MB — 2.6% — and of that
only 792 kB is heap: the table is effectively empty and the 8 MB is INDEX BLOAT.
A `reindex` reclaims it. Worth doing, not worth planning around.

⚠️ **THE "NEVER USED" FLAGS IN THAT RUN WERE NOT EVIDENCE.** Every index read 0
scans *and* `reports` reported 8 live rows — statistics had recently been reset,
so both numbers were empty rather than small. The report now prints
`stats_reset` in section 0 and counts rows EXACTLY (`query_to_xml`), so that
tell cannot be misread again. **Do not drop an index on a scan count taken
inside 30 days of a reset**, and never on a `_pkey` or `_uniq` at all — an
upsert's `on conflict` needs it whether or not anything scans it.

⚠️ **Measure first.** `supabase/apply/_storage_check.sql` (read-only) reports the
database total, every table by size split into heap / indexes / toast, the ten
biggest indexes with their use counts, and dead-row bloat.

**The prime suspect is `record_audit` (0048).** It stored a FULL jsonb copy of
every row on every insert, update and delete — an UPDATE wrote the old row AND
the new one — across every bulk upload this project has run, with three indexes
on top. **0112 stopped the trigger and RETAINED the table**, so it is dead weight
that nothing writes to and only an admin screen reads. What happens to it is a
quality-record decision, not a technical one, but its size is the first number
worth knowing.

Second suspect: dead rows. Autovacuum marks them reusable but does not return
them to disk; only `VACUUM FULL` does, and it takes an ACCESS EXCLUSIVE lock, so
it is an out-of-hours job.

File storage is a separate Supabase allowance and this project does not use it —
uploads go to Drive through the Apps Script bridge.

### A cut-off PER MONTH (2026-09-07) — and a null-propagation bug it turned up

**0138 got the shape wrong and 0139 fixes it.** "Set the Cut Off Date before
Recalculation" was read as ONE date per objective applied to every month a run
wrote; the user meant one **per month**. The consequence was exactly what was
flagged at the time: re-calculating in October with 09-Oct also re-read January
as at 09-Oct, re-basing a figure reported eight months earlier.

`objective_cutoffs(year, month, cutoff_date)` — one row per month per year,
**shared by every objective**, because a cut-off belongs to the reporting round
rather than to any one measure. No write policy at all; `set_objective_cutoff()`
is the only way in, so the admin lock has one door. `recalc_quality_objectives`
is back to **one argument**: it reads the cut-offs, it does not set one.

⚠️ **`has_perm()` RETURNS NULL WHEN THERE IS NO SIGNED-IN USER**, because
`my_extra_perms()` does. So the common guard

```sql
if not public.has_perm('config.manage') then raise exception ... end if;
```

**does not fire** — `not NULL` is NULL, which is not true, and execution falls
straight through into the write. Found when a test fixture referenced a user
that did not exist in that suite and the "engineer" successfully set a cut-off.

`set_objective_cutoff` and `recalc_quality_objectives` now use
`coalesce(public.has_perm(...), false)`. **The bare pattern appears in 15 other
migrations** and has NOT been changed — that is a separate pass, and worth
doing. Not reachable from the API today (execute is granted to `authenticated`,
and a null uid means `anon`), but that is a second lock, not a reason to leave
the first one open.

**A test fixture whose user does not exist tests the null path, not the role.**
That is why it hid this. Fixtures in `objective_periods_test` now create every
user they impersonate.

### The cut-off, settled (2026-09-07)

**The open question below is CLOSED: the cut-off tests the VISIT date.** A call
visited 30 May and written up 3 June is closed in May. Figures moved when 0138
was applied, and that was the point.

The fallback when a solving report has **no visit date** is the entry date, and
the evidence marks the row. Treating a blank as "never solved" would make the
figure worse for a missing keystroke — a metric that degrades on a data-entry
lapse teaches people to distrust it.

**`recalc_quality_objectives(year, cutoff)`** stores the date on every open-rate
objective before computing, rather than holding it for the run. A figure and the
setting behind it must not be able to disagree, and the evidence has to be able
to say what was applied months later. Passing no date changes nothing.

⚠️ **A stored cut-off applies to EVERY month the run writes** — re-calculating in
October with 09-Oct also re-reads January as at 09-Oct. The user asked for this
("the Team is used to this way of Working") and knows a monthly KPI is not
strictly measured that way. It is not hidden: stored on the objective, on the
Re-Calculate dialog, and in the evidence notes.

**The lock** is `objective_cutoff_locked` in `app_settings`, the Audit Mode shape
(0114), plus a TRIGGER on `quality_objectives` — a lock the definition screen's
JSON box could walk around would be decoration. Admins are exempt: the lock holds
back whoever else has `config.manage`, and locking an admin out of their own
switch only teaches them to leave it off.

⚠️ **`recalc_quality_objectives(integer)` NO LONGER EXISTS** — the 1-argument form
is dropped so `recalc_quality_objectives(2026)` is not ambiguous. `_status.sql`
row 95 checks the new signature; anything else calling the old one will fail.

### The solve cut-off (2026-09-07)

`objective_period` returns **three** dates now, and the split is the point:

| | what it decides | moves? |
| --- | --- | --- |
| `period_start`..`period_end` | WHICH calls are counted (registered in the period) | never |
| `solve_cutoff` | whether each was CLOSED in time | `calc_params.cutoff_days` or `cutoff_date` |

They used to be one date. Widening the period to give a grace would have pulled
in the next month's registrations and changed the denominator nobody asked to
change — the bug this shape exists to prevent.

`solve_cutoff` is **always capped at today**. A future cut-off can only ever
move a call from open to closed, so it flatters the figure; that is a HARD STOP
in `objective_notes`, not a preference.

~~**Open question, deliberately left as it was.** The cut-off tests when the
solving report was **ENTERED** (`reports.updated_at`), not the visit date.~~
**ANSWERED 2026-09-07 and changed in 0138: it tests the VISIT date.** Putting
both dates in the export is what let the question be settled by looking rather
than arguing — see the entry above.

### Objectives 8-12 — what is computed and what is still typed (2026-09-07)

| # | Objective | Freq. | Computed by | State |
| --- | --- | --- | --- | --- |
| 8  | Breakdown Calls | Monthly | `open_rate_monthly` `{"family":"field"}` | ✅ |
| 9  | Preventive Maintenance Calls | **Quarterly** | `open_rate_monthly` `{"family":"pm"}` | ✅ |
| 10 | Installation call | **Quarterly** | `open_rate_monthly` `{"family":"installation"}` | ✅ |
| 11 | Problem Call attending within 3 days | Monthly | `attended_within_days` `{"family":"field","days":3}` | ✅ |
| 12 | b.Customer feedback | **Quarterly** | — | ⏳ typed; the user is detailing the logic |

`public.feedback` exists (one row per visit, `answers jsonb`) but nothing says
how a score is derived from it. **Left typed on purpose** — a number nobody
agreed to is worse on a quality record than a blank one.

**Two readings put into 11 that the user has not confirmed**, both one field on
the screen to change, and both now STATED in the evidence file rather than
buried: "within 3 days" is read as an attended-in-days of **3 or fewer**, and
"Problem call" is read as the **field** register.

⚠️ **`frequency` is now load-bearing.** It used to be a label. `objective_period`
reads it, so editing an objective's Monitoring Frequency changes how it is
measured. "Monthly" and "3 Months"/"Quarterly" are recognised; anything else
reads as monthly — the safer wrong answer, since a monthly reading of a
quarterly objective still reports every month and the reverse loses eight.

**`call_type` turned out to be trustworthy after all.** The plan was to stop
using it because all three call tables DEFAULT it to 'FIELD'; the schema in
fact CHECKs `call_table_for(call_type)` against each table's own name, so a row
cannot sit in the wrong register. `calc_params.family` is still what the
objectives use — it reads one register instead of the union of three, and
"which register" is the question being asked — but not for the reason first
assumed. Found by inserting a fixture and reading the constraint, not by
reading the column default.

### To run on the live project — NOTHING PENDING (2026-09-07)

**"all sql executed" — the user, 2026-09-07**, covering both bundles below.

⚠️ **REPORTED, NOT VERIFIED FROM HERE.** No `_status.sql` output has been seen
for this round, so rows 93-103 are *expected* to read `yes` and nothing in this
file is evidence that they do. The live project cannot be reached from the
sandbox. Run
[`_status.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_status.sql)
before diagnosing anything here — that is the check, and this is only a note.

Two rows are expected to stay `NO` and are NOT missing migrations:
**`performance: JIT is OFF`** and **`DCCR: ...at a quarter past nine`** (pg_cron
must be enabled in Dashboard → Database → Extensions, then `daily_review.sql`
re-run). Both are project settings rather than SQL.

**The figures do not appear until Re-Calculate.** Applying the SQL installs the
machinery; `recalc_quality_objectives` is explicit by design and nothing is
written to the twelve month columns until an administrator presses it on the
Objective page.

What the two bundles brought:

| bundle | brings | rows |
| --- | --- | --- |
| [`objective.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/objective.sql) ([raw](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/objective.sql)) | 0130 the objectives register, 0132 Re-Calc + evidence, 0133 the serial filter (the Indian Extend), 0134 the machines as rows, 0135 the installation base as a Product Master listing with the filter stated, 0136 quarterly periods + objectives 8-11 + the stated assumptions, 0137 the settable solve cut-off + the closure date in the export, 0138 closure on the visit date + the admin lock, 0139 a cut-off PER MONTH | 93, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106 |
| [`performance.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/performance.sql) ([raw](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql)) | 0128 the KPI Field & Installation export (columns A–AB), 0131 Phase 2 (AC–AG + Pending Days), 0129 `products.serial_key` | 94 |

⚠️ **This is a note, not evidence.** Run
[`_status.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_status.sql)
before diagnosing anything here — this file has twice claimed the opposite of
what was applied.

**0132–0134 now DROP `objective_evidence` before creating it.** The return type
widened in 0135, and `create or replace function` cannot change a return type —
so replaying `objective.sql` onto a database that already carried the new shape
failed outright, the same way `create or replace view` failed once 0131 widened
`kpi_field_inst`. Caught by `npm run check:replay`, which is the only thing that
finds this class. Both are the same rule stated twice: **a file has to be
runnable on a database in any state, not only on an empty one.**

**`products.active` is deliberately NOT honoured** by the installation base.
The column exists and defaults to true; nothing in this system reads it, and
nothing maintains it. Filtering on it would move every failure rate on the
strength of data that has never been kept. If it is ever maintained, that is
the moment to revisit — not before.

### To run on the live project — NOTHING PENDING (2026-09-06)

**Everything run by the user on 2026-09-06.** In one go, after the ordering
note went into `_status.sql`'s header:

| bundle | brings |
| --- | --- |
| `call_requests.sql` | 0113 (created_by is the database's to say), 0114 (the desk of record + `actual_created_by`) — rows 66, 67 |
| `audit.sql`         | 0114 audit (the Audit Mode switch + its change log) — row 68 |
| `rbac.sql`          | 0087/0088 moved here, so `srl_insert` stops being reverted — row 40 |
| `Spare_1.sql`, `HandStock_X.sql`, `masters.sql` | the five policies a bundle replay had reverted, and the blanket `masters_write` it had recreated — rows 69-74 |
| `reports.sql`       | 0115 (a visit cannot be dated in the future or before the complaint) — row 75 |

ORDER MATTERED and is now written into `_status.sql`'s header rather than only
in a chat message: `rbac.sql` FIRST, then the other three. Run the other way
round it re-reverts rows 69-74, which is exactly how row 40 came back NO after
the first attempt.

✅ **VERIFIED — every row of `_status.sql` reads `yes`, all 85**, from the
user's own output on 2026-09-06 after the runs above. Not "reported" this time:
this round has the evidence behind it, which is the only thing that makes a
line in this file worth reading. (The rule still stands for every other entry —
`_status.sql` is the evidence, this file is a note, and it has twice claimed
the opposite of what was actually applied.)

Worth keeping in view because two rows now read `yes` for a REASON THAT CAN BE
UNDONE: row 40 and rows 69-74 are correct because `rbac.sql` was run FIRST.
Running it again on its own, without the other three afterwards, puts them
back to NO. `_status.sql`'s header says so; `npm run check:bundles` lists the
24 further rules with the same shape.

⚠️ **Still outstanding on the user's side, and NOT SQL** — "ran all sql
scripts" does not cover these: the 77 missing yearly consumptions (delete +
re-upload the four files per `_yearly_consumption_check.sql`, to 39,801 total
with 12,015 in 2024), and the Ownership Transfer upload.

### To run on the live project — NOTHING PENDING (2026-09-05, third round)

**`daily_review.sql` and `data_integrity.sql` run by the user on 2026-09-05**,
bringing 0111 (the DCCR's Call Status filter, via `open_state` on the summary
view) and 0112 (record_audit stopped — no trigger writes to it now; the table is
retained). `_status.sql` rows 60 and 65 cover those two.

⚠️ ROW 60 IS INVERTED from what it used to assert. It checked that the
record_audit trigger EXISTED; it now checks that none does. A `yes` there means
the trail is OFF, which is the intended state — do not "fix" it by re-applying
0048.

⚠️ REPORTED, NOT VERIFIED FROM HERE, same as the round above.

### To run on the live project — NOTHING PENDING (2026-09-05, second round)

**`call_requests.sql` and `rbac.sql` run by the user on 2026-09-05**, bringing
0107 (complaint-text help), 0108 (cancel a call), 0109 (close without a visit)
and 0110 (an admin resets a password) live. `_status.sql` rows 61-64 cover
those four.

⚠️ REPORTED, NOT VERIFIED FROM HERE. This records what the user said they ran;
nothing in this file is evidence that a migration is applied. Run
`supabase/apply/_status.sql` before diagnosing anything that looks like one of
these features misbehaving — that is the check, and this is only a note.

### To run on the live project — NOTHING PENDING (2026-09-05)

**Every row of `_status.sql` reads `yes` — all 70.** From the user's own output
on 2026-09-05, after running `call_requests.sql` (0104 + 0105),
`sales_contracts.sql` (0106), `data_integrity.sql` (0103) and `HandStock_X.sql`
(0102).

⚠️ **0102 and 0103 were confirmed by a one-off query, not by `_status.sql`,
because I had not added rows for them** — I added rows for 0104–0106 and
forgot these two. The report's silence looked like coverage. Rows 59 and 60
close that, and the rule stands: **a bundle that gains a checkable object gains
a `_status.sql` row in the same change.**

#### What 0105 changed on the live system, and what to expect

The `calls` view had lost `security_invoker` when 0057 rebuilt it, so it read as
its OWNER: **every signed-in user could read every call**, and `pending_calls`,
`call_state` and the KPI views inherited that reach despite carrying the setting
themselves. Now closed.

**Engineers and managers will see FEWER calls** — the ones their role permits.
A report of "I have lost my calls" is the fix working. `npm run check:views`
fails on any view over an RLS-protected table lacking the setting, so the class
cannot return silently.

Also fixed, and needing no SQL: `updateFieldCall` never delegated to Supabase,
so EDITING a call was posted to the Apps Script bridge while CREATING one went
to the database.

### Everything before this was applied — NOTHING ELSE PENDING (2026-09-04)

**Every row of `_status.sql` reads `yes` — all 65.** Read from the user's own
output on 2026-09-04, after they ran `performance.sql`, `call_requests.sql`,
`HandStock_X.sql`, `_handstock_opening_engineers.sql` and finally
`user_directory.sql`. That covers migrations 0092–0101 and the opening-stock
correction.

Do not re-add anything here without a status read. This file is a record, not
evidence — it has twice claimed the opposite of what was applied, and once (see
below) it named a bundle whose own contents undid the fix it was recommending.

#### What those runs settled, and what to remember from each

- **The Hand Stock timeout was JIT** (`0099`), not the data and not RLS.
  `EXPLAIN` with the JIT block showing: *Optimization 2134 ms, Emission 1440 ms,
  total 3742* — against 174 ms of execution. `jit_above_cost` is 100,000 and the
  planner's estimate for the movement view is half a million, almost all of it
  the cost of RLS sub-plans it barely runs. So the more access rules a query
  carries, the more certain Postgres is to spend seconds compiling it — which is
  precisely why switching RLS off "fixed" it and sent three rounds of work at the
  wrong cause. With JIT off, the whole 102,893-row history reads in 323 ms.
  Reverse with `alter database postgres reset jit;`.
  **If a future screen is mysteriously slow, read the JIT block before blaming
  the policies.**
- **A period can be closed** (`0095`, `0096`) but is no longer needed for speed —
  it is what keeps Hand Stock fast as the years add up. Verified neutral:
  6,203 pools / 257,188 parts before and after, view 102,893 → 22,442 rows.
- **REQID** (`0097`) continues from the register instead of restarting at R1, and
  a bulk load can no longer strand the counter. The two issued out of order are
  now **RC1** and **RC2**.
- **The KPIs and the product list** (`0098`, `0101`).
- **The spare-order engineer can be corrected before dispatch, never after**
  (`0100`), with its own log.
- **Opening stock is active User Master names only**
  (`_handstock_opening_engineers.sql`), by the user's decision on 2026-09-04.
  The uploader now holds the rest back before writing, and `_status.sql` row 55
  keeps it honest.

#### ⚠️ The one that cost a round trip — read this before writing a bundle note

This list previously said: run **`user_directory.sql`** for migration `0092` (the
Reporting Manager name fallback). **That instruction UNDID the fix.** 0092 was
filed under the `rbac` module, so `rbac.sql` carried it and `user_directory.sql`
did not — but `user_directory.sql` replays `0004`, which defines
`visible_engineer_names()` WITHOUT the fallback. Running it put the old
definition back, silently, and the bundle reported success. Row 44 read `NO` on
2026-09-04 for exactly that reason: **applied, then overwritten** — which reads
identically to "never applied".

0092 now lives in **user_directory**, after 0004, so the bundle that owns the
function carries its latest definition. Re-running it is safe, and on a project
that has lost the fix it restores it. That is what turned row 44 green.

**The class**: a bundle must carry the LATEST definition of everything it
defines, or replaying it alone reverts an object a later module redefined.
`npm run check:bundles` reports it, and **twelve objects are still split this
way** — they are listed in that script so the list can only shrink, and a NEW one
fails the check. Among them:

- `dispatch_spare_lines` — re-running **`Spare_1.sql` on its own would revert
  partial dispatch and refurbished issue**.
- `spare_pending_dispatch`, `engineer_stock`, `stock_transfer_lines_check_stock`,
  `notify_spare_dispatched` — all superseded in the `handstock` module.

They are recorded rather than moved because unpicking them changes the order a
FRESH apply runs in, which is the other way this project has broken itself. That
wants its own change, with its own verification. **Until it is done, prefer
`all.sql` over a single bundle when repairing a live project.**

### Uploads — what is loaded, and what is left (2026-09-04)

Confirmed by the user as they went. Counts are what to expect against their real
files.

| register | file | expect | state |
| --- | --- | --- | --- |
| Part Master | `ITEM_Master_2.csv` | — | ✅ loaded |
| Product Master | `v2_ProdMaster.csv` | — | ✅ loaded |
| Hand Stock — WinMax opening | `HS_Winmax.csv` | active engineers only | ✅ loaded, then corrected |
| Stock Out — all years | `Stock_Out.csv` | 48,139 | ✅ loaded |
| Consumption — yearly export | 22H2 / 23 / 24 / 25 | 5,233 / 10,338 / 11,938 / 12,292 | ✅ loaded — see the count below |
| Consumption | `v2Consumption_1.csv` | 8,352 | ✅ loaded |
| Stock Transfer Register → Lines | `ST_Entry` → `StockTransferList` | 338 → 849 | ✅ loaded |
| Master Value Lists | all eight lists | see below | ✅ **complete** |
| **Ownership Transfer** | `OwnershipTransfer.csv` | — | ⬜ **still to load** |

Loaded earlier: Party Master (5,873), Field / Installation / PM calls, Call
Requests, Field Reports, Spare Request (4,081) and its Lines (8,571), MRN (595).

✅ **The value lists are COMPLETE** (the user's read, 2026-09-04):

    calltype 8 · cancelreason 27 · complaint 507 · dccrgrouping 707
    feedbackrating 4 · orapproval 13 · pendingreason 21 · rootcause 657

That is every list in the `master_lists` registry. `party`, `product` and
`spare` look like value lists on the forms but are NOT in this registry —
`listMaster()` resolves them from `parties`, `products` and `parts` instead, so
there is nothing to load for them and their absence is correct, not a gap.

⛔ **The yearly consumption total is 39,724 and should be 39,801** — CONFIRMED by
the user's read on 2026-09-04 (4 files loaded, 39,724 rows). The 77 missing rows
are real consumptions: they were entered in January for December work, so they
belong to 2024, and before v0.9.64 they landed on the same reference as the
first 77 rows of the 2024 file — one silently replacing the other. The code fix
shipped, but **the data only corrects itself on a re-load**.

Consumption is an OUT arm, so 77 missing rows make those engineer/part levels
read **too HIGH**. That is one strand of the user's "the Handstock levels are
incorrect", though 77 rows against 39,801 will only move the pairs they touch.

To correct it: run the DELETE at the foot of
`supabase/apply/_yearly_consumption_check.sql` (commented out on purpose), then
load the four files again. They are history, not a control point — nothing else
points at these rows.

### Open questions put to the user, unanswered
- ~~**WinMax opening:** filter that pool to names in the User Master, or load it
  whole?~~ **ANSWERED 2026-09-04: "only user master - Active names only."** Both
  Opening Stock registers now filter before writing, and
  `_handstock_opening_engineers.sql` corrected what was already loaded.
  `_status.sql` row 55 keeps it that way.
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

### Apply bundles
- ⚠️ **A bundle replay was reverting policies, and the check could not see it**
  (v0.9.99, 2026-09-06) — the user's `_status.sql` came back with row 40 NO.
  Nothing had failed to apply: `srl_insert` is created by 0008 (`rbac`) and
  redefined by 0087/0088, which sat in `spare_requests`. Running `rbac.sql`
  for 0110 the day before put 0008's version back, silently, and a spare line
  against a stub parent was refused again. Reproduced exactly: full apply →
  row 40 yes; replay `rbac.sql` → NO.
  - **FIXED for this object**: 0087 and 0088 MOVED into the `rbac` module, so
    every definition of `srl_insert` is in one bundle. Safe order-wise —
    `spare_request_lines`, `request_uid` and `spare_requests` are all 0001
    (base, which runs first), `has_perm`/`is_admin` are 0008 above them, and
    the helper's body is plpgsql so it is not parsed until it runs. Verified:
    fresh `all.sql` clean and all-yes; replay `rbac.sql` alone → row 40 still
    yes.
  - **`check:bundles` NOW SEES POLICIES.** It checked functions, views and
    procedures only, which is why this was invisible to it. Keyed on
    `table.policy`, because two tables may each have an `xxx_read`.
  - It found **24 more**, all older than the check. Listed in `KNOWN` rather
    than unpicked: moving migrations between modules changes the order a FRESH
    apply runs in, which is the other way this project has broken itself.
  - **SIX ARE NOT MERELY LATENT — they had already reverted on the live
    project.** Established by replaying the user's exact bundle sequence
    against a copy and diffing `pg_policies`: `sr_read` (0040), `sr_update`
    (0009), `srl_update` (0016), `cons_read` (0038), `cons_write` (0059), and
    `masters_write`, which 0067 DROPPED and 0008 recreates through
    `execute format()` — so no `create policy` literal exists for the checker
    to find, and policies being OR'd, `masters.edit` could write every list
    again.
  - ✅ **Restored 2026-09-06** by `Spare_1.sql`, `HandStock_X.sql` and
    `masters.sql`, run after `rbac.sql`. Verified on the copy beforehand:
    after those three, every policy matches a full apply and the policy SET is
    identical.
  - ✅ **Row 40 restored 2026-09-06 by `rbac.sql`.** ITS RESTORE BUNDLE HAD
    MOVED, and that cost a round trip: because 0087/0088 are now in `rbac`,
    `Spare_1.sql` no longer carries them — so the fix for row 40 is `rbac.sql`,
    and I named Spare_1/HandStock_X/masters, which left row 40 NO. And
    `rbac.sql` reverts the six, so ORDER MATTERS: `rbac.sql` FIRST, then
    `Spare_1.sql`, `HandStock_X.sql`, `masters.sql`. Verified by
    reproducing their exact reported state and running the four in that order:
    every policy then matches a clean full apply and the policy SET is
    identical. `_status.sql`'s header now states the ordering and row 40 names
    its restore bundle, so the next reader is not relying on my having said it.
  - `_status.sql` rows 69-74 report all six by name with the bundle that
    restores each — verified BOTH ways (all yes on a full apply, all NO after
    an `rbac.sql` replay). The KNOWN list cannot tell anybody their live
    project has drifted; these rows can.

### Spares
- **Reject and Drop in bulk, behind a confirmation** (v0.9.106,
  `0118_spare_bulk_decisions.sql`) — `decide_spare_lines(ids, decision, actor,
  reason)` takes the decision as an argument and `approve_spare_lines` (already
  live, so its signature is kept) is now one line calling it. Three near-copies
  of the same stage resolution would have drifted within a release.
  - A REASON is required for reject and drop and refused if blank. An approval
    explains itself; ending somebody's request does not, and a register of
    reasonless rejections cannot be reviewed afterwards.
  - Nothing acts on the button press: it opens a confirmation naming the
    decision and the count, which is also where the reason is asked for — the
    database refuses a reasonless one either way, so the form asks rather than
    the error message.
  - 0033 applies to reject at the RM stage as much as to approve, because the
    TRIGGER refuses it either way; a function that promises what the trigger
    then refuses is worse than one that says no itself.
  - ⚠️ **FOUND WHILE BUILDING IT: `spare.drop` was never granted to anybody.**
    0036 built the feature — the guard, the `Dropped` stage, the button — and no
    migration ever put the permission in `app_roles`. `has_perm` falls back to
    the engineer defaults only for a role with ZERO permissions, and every role
    has some, so the answer was always false. Only an administrator (who passes
    `is_admin()` first) could ever drop a spare, and the button never rendered
    for anyone else because the client reads the same table. 0118 grants it to
    spare_coordinator, hotline and stores_incharge — the roles 0036's own
    header names.
  - ⚠️ **Run `Spare_1.sql`** — `_status.sql` row 78, verified NO before and yes
    after.

- **Bulk approval, and an RM queue of its own** (v0.9.103,
  `0116_spare_bulk_approval.sql`) — tick boxes on the spare register plus a new
  `/spare-rm-approval` screen modelled on Pending Dispatch.
  - `approve_spare_lines(ids, actor)` approves each line **at the stage it is
    at**, so a mixed selection advances everything one step and nothing skips a
    review. It SKIPS what the caller may not approve and returns
    `approved / skipped / reason` — a batch of forty that fails on one line is a
    batch you take apart by hand.
  - **"All stages" is a PERMISSION, not a bypass.** The NSM role gains
    `spare.approve_rm` and `spare.approve_commercial` (MERGED, never
    overwritten). A bypass flag would put a second invisible rule beside the
    0016 guard; a permission shows on the Roles screen and an admin can revoke
    it without a migration. Admin/Super Admin already pass the guard.
  - 0033 still applies inside bulk — never your own request, a manager only
    within their tree. Tests 2 and 3 are what fail if that stops holding.
  - ⚠️ **`spare_rm_may_approve()` depends on `user_directory`, not `profiles`.**
    With no directory row `my_dir_name()` is null, the self-test never matches
    and `has_reports()` is false, so the function falls through to its
    permissive branch. My first run of the suite proved exactly that against
    profile-only fixtures. Pre-existing (the single-line guard uses the same
    function), but worth knowing: an approver missing from the directory is
    less constrained, not more.
  - Found by running it: `why := why || 'text'` on a `text[]` makes Postgres
    parse the literal AS an array and fail. `array_append` says which meaning
    is wanted.
  - ✅ **`Spare_1.sql` run 2026-09-06** — `_status.sql` row 76.

### Every register
- **A layout can be set for a ROLE** (v0.9.117, `0120_role_table_views.sql`) —
  "like save for everyone, I need option to set the views to roles". One row
  per (register, role) holding columns, order, widths and GROUPING; `role = ''`
  is everyone, so the same mechanism answers both and they cannot drift.
  - The old "save for everyone" went through the Apps Script sheet bridge,
    carried only the columns, and had no notion of a role. On a Supabase
    project it now routes through the same function with an empty role.
  - **Ranked by WHEN, not by who** — the reader's own arrangement carries
    `at`, the role layout carries `set_at` stamped by the database (a caller
    cannot back-date one). Same rule as the Auto Save default and for the same
    reason: "the admin always wins" makes every column picker a lie, "your own
    always wins" makes "apply to a role" a lie.
  - A layout stored before 0120 has no `at`, so it reads as time 0 and yields
    to the first administrator layout — an upgrade must not look like somebody
    actively arranging.
  - Writes go through `set_role_table_view()` / `clear_role_table_view()`; the
    table itself refuses `insert` from `authenticated`, so the rule lives in
    one place and `set_at` cannot be forged. Test 9 asserts that.
  - `my_table_view()` resolves the role IN THE DATABASE — a role name is never
    matched in the browser against a role the browser only thinks it has.
  - ⚠️ **Run `rbac.sql`** — `_status.sql` row 80, verified NO before and yes
    after.

- **Load more, Refresh and the sync age live together** (v0.9.105) — the user's
  rule, with the AppSheet screens as the reference: they answer the same
  question the count does ("is this current, and is there more?"), so they
  belong beside it in the heading, not in each table's toolbar among the
  controls that act on rows. 21 registers moved by script plus 5 by hand;
  `PageHeader` gained `onRefresh` / `refreshing` / `syncedAt`.
  - `check:ui` now REFUSES a `↻ Refresh` or a `timeAgo()` inside a `<Toolbar>`,
    so they cannot drift back. **`MasterListTable` is the one exception and a
    principled one**: it is embedded inside All Masters, both DCCR master tabs
    and the master list page, so it has no heading of its own.
  - ⚠️ **Found by the sweep: Pending Calls had been showing "⟳ synced never".**
    Its `lastSync` is epoch milliseconds and `timeAgo` did
    `new Date(String(iso))`, which is an Invalid Date for a number. It advertises
    `unknown`, so it now honours one. "never" is the worst kind of wrong answer
    here — it looks like an answer rather than a fault, so nobody reported it.
  - 🔜 **Engineer grouping is NOT yet everywhere.** The `<FacetChips>` strip is
    on Field Calls, Pending Calls, Spare Requests and KPI Analytics only. Other
    registers group by engineer through the DataTable's `groupable` instead.
    Extending the strip is per-register work: each needs a count source, and the
    "+" rule decides whether those counts carry one.

### Daily Call Review
- **Auto save: two decisions, the later one wins** (v0.9.116) — an admin can
  apply it to everyone; a reviewer can still set their own. The rule for the
  disagreement is the whole design: `effectiveAutoSave(mine, org)` compares
  WHEN each was decided. "The admin always wins" would make every reviewer's
  switch a lie; "a personal choice always wins" would make "apply for everyone"
  a lie.
  - The org default lives in `app_settings`, whose write policy is already
    admin-only (0047) — so the gate is the database's, not a hidden button. No
    migration.
  - Two keys, written together: the value and WHEN it was set. The timestamp is
    the load-bearing part.
  - The pre-existing `'1'`/`'0'` localStorage shape reads as "chosen at time 0",
    so an upgrade cannot look like somebody actively choosing and outrank the
    administrator. Pinned in `check:ui`.

- **Review 2 in bulk, except inside the first year** (v0.9.112,
  `0119_bulk_review2.sql`) — the user's rule: "if the Age at failure is less
  than 366, then it has to be done 1 by 1. If it is not, then it can be bulk
  set." That rule IS the function, not a caveat on it: Review 2 is where
  Warranty Failure (1 yr) is answered, so a machine under a year old is exactly
  the case the question exists for.
  - Enforced in the DATABASE as well as the screen. A hidden checkbox is a
    convenience; this is a quality record.
  - An UNKNOWN age is refused too — "not known to be inside its first year" is
    not "known to be outside it". If that excludes too much of the register it
    is one line, but it should be changed with the numbers in front of somebody.
  - Never overwrites a Review 2 already answered; skips and counts rather than
    failing the batch, like the spare batches.
  - The rule is `bulkReview2Block()` in `lib/dccr.ts`, pure, so `check:ui` pins
    the boundary both sides (365 refused, 366 allowed) without a database.
  - ⚠️ **The migration shipped early by accident** — swept into #167 by a broad
    `git add -A` while three asks were in flight, so 0119 reached `main` with no
    test, no `_status.sql` row, no UI and no changelog. All four followed here.
    The lesson is the commit discipline, not the migration: stage what the
    commit is about.
  - ⚠️ **Run `daily_review.sql`** — `_status.sql` row 79, verified NO before and
    yes after.

- **The worklist tabs scope the QUERY, and highlight means contrast**
  (v0.9.109) — two user reports on the Review Desk.
  - ⚠️ **"Review 2 Pending 175" was showing 85.** The tabs narrowed the LOADED
    PAGE in the browser: the register reads 500 rows of everything, of which 85
    happened to be at that stage, and Load more was the only way to the rest.
    `deskStage` now goes into `ReviewFilter.status`, so the read is scoped and
    one page covers the worklist.
  - The counters are deliberately **not** scoped by review status — a counter
    narrowed by the very thing it counts can only report itself, and the Review
    2 tab would zero the number on the Review 3 tab. Same rule the facet chips
    follow. `inView` is what that leaves: the stage's own total where one is
    chosen, the register's where none is.
  - **"Highlight" means CONTRAST, not a tint** — now in CLAUDE.md as a standing
    preference. The first attempt was `--primary-soft` and it did not read on
    screen. The lifted facts INVERT (`background: var(--text); color:
    var(--surface)`) and the first-year warning is solid `--danger`; both hold
    in either theme by construction. Call Status is the exception and keeps its
    semantic colour, because inverting it would throw away what the colour is
    carrying.

- **A first-year failure is a warning, and the review's four facts are lifted**
  (v0.9.108) — the user's marks on the Review Desk screenshot.
  - `age_days < 366` (the user's line, not 365) renders as a red warning with
    ⚠️ rather than a grey note. It is the ANSWER to "Warranty Failure (1 yr)"
    sitting directly above it, and it was set in the same type as "over a year
    old", so the reviewer had to read the number and do the arithmetic.
    `check:ui` pins the boundary — `<= 365` or `< 365` would move the day
    silently.
  - CUSTOMER, PRODUCT · SERIAL, CALL STATUS and NATURE OF COMPLAINT get
    `is-key` on the call card: weight, size and a tinted ground rather than a
    highlighter colour, so it holds in both themes. Call Status uses the new
    `CALL_STATE_TONES` — the call's own state is not a review stage and must
    not be coloured as one.

- **Review 2 Pending / Review 3 Pending are tabs** (v0.9.107) — the two lists
  somebody sits down to clear, so they are tabs rather than a filter to set
  every morning. Each is the **Review Desk narrowed** (`deskStage`), not a
  second copy: same three panes, same questions, same save, so they cannot
  drift from it. `check:ui` asserts they render `tab === 'desk' || 'r2' || 'r3'`
  through one block.
  - The tab counts come from `countCallReviews`' full walk, so they are EXACT
    and take no "+". The Calls pane's own number is what has LOADED and does
    carry one. Both ways of the rule on one screen again.

- **The Review Desk, and Review 2's two facts** (v0.9.104,
  `0117_frequent_failure.sql`) — the three-pane setup the user asked for, from
  the AppSheet original: calls grouped (Review Stage, then Call Status) |
  the reviews | what happened on the call. Splitters are draggable and the
  widths persist per browser.
  - **ONE BODY IN TWO FRAMES.** `ReviewDrawer` gained `layout='drawer' |
    'panes'` and renders the same fields either stacked (drawer) or side by
    side (desk). A second copy of the review fields would drift from the first
    and one of them would stop matching the rules; `check:ui` asserts there is
    exactly one "Review 2 · Risk assessment".
  - The divider must be a GRID CHILD between the two panes — appending it after
    them puts the details pane in the 6px track. Caught before shipping and
    pinned.
  - **Age of the product** moved from "From the report" to sit under Warranty
    Failure (1 yr), with the one-year line drawn rather than left as arithmetic
    on a day count.
  - **Frequent Failure** now has the register's answer under it: earlier calls
    on the same product+serial with the same complaint, in the 6 months BEFORE
    **this call's own date** (not today's — otherwise reopening an old review
    changes its answer). It lists the UCNs: the reviewer is recording a
    judgement they may have to defend.
    - A blank serial returns NOTHING rather than matching every other
      blank-serial call — a confident number built out of absent data is the
      worst kind of wrong here, because it decides whether an FFR is raised.
    - SECURITY DEFINER on purpose: an answer filtered by the reader's own call
      scope would read LOWER than the truth, which is the one direction that
      matters.
    - A failed read shows "could not be read", never an empty list. `[]` means
      "no earlier failures" and must not be said by accident.
  - **"All NO"** fills the three Review 2 answers; it does not save. Nothing is
    recorded that nobody looked at.
  - Visits are rows (newest first, status, engineer, **the Service Report as a
    link** — previously unreachable from the review); spares are a table
    (#, Part No, Description, Qty) rather than a comma-joined line.
  - ✅ **`daily_review.sql` run 2026-09-06** — `_status.sql` row 77.

### Reporting
- **A visit cannot be dated in the future, or before the complaint** (v0.9.100,
  `0115_visit_date_sanity.sql`) — the user's two rules for the Visit Update
  form. The future one is the one with teeth: a call's status comes from its
  LATEST visit, so a visit dated next week closes a call nobody has been to and
  keeps it closed until that day passes.
  - The form bounds the picker (`max` today, `min` the complaint date) AND
    re-checks on submit, because `min`/`max` stop the picker and not a pasted
    value. The rule itself is `src/lib/visitdate.ts`, pure and with TODAY passed
    in, so `check:ui` pins it without a DOM — the same shape as
    `fieldcall.ts` / `docmatch.ts`.
  - The complaint date falls back to the registration date where a call carries
    none (installations, PMs, older imports); with neither, only the future rule
    applies. Refusing the visit instead would invent a requirement the call
    never carried.
  - **The database enforces it too, and deliberately NOT on history.**
    `reports` is also where the superseded system's visits live, and they must
    load exactly as they were — an imperfect date is still the record of what
    happened, and refusing the file leaves a GAP instead of an imperfection
    (0089 makes the same exemption for imported stock). The signal is the row's
    own id: `WEB-…` is the form (checked), `IMP-…` is Bulk Uploads and anything
    else is Bulk Report Mapping / a restore (not checked). Tests 5, 6 and 9
    exist to catch it if that ever stops holding.
  - Not `> now()`: the app writes the chosen day as UTC midnight, which is still
    in the future until 05:30 IST — a naive test would refuse a visit entered
    early in the morning and dated today. It compares DAYS, the visit's own
    (UTC, as written) against today in India.
  - ✅ **`reports.sql` run 2026-09-06** — `_status.sql` row 75, verified NO
    before and yes after.

### Calls
- **The desk of record and the person at the keyboard** (v0.9.98,
  `0114_call_registrant_split.sql`) — the user's correction to 0113: one column
  was carrying two different facts. `created_by` is now the Hotline DESK a call
  is filed to, defaulting to the hotline-role profile (SIVARANI) or to an
  administrator's pinned choice (`app_settings.calls.default_registrant_email`,
  set on Admin Config → Call Registration). `actual_created_by` is the person
  who typed it in — service.almsind / devika.m / karthiksundar.b when she is
  away — stamped from `auth.uid()` with a caller-supplied value DISCARDED. A
  supplied desk is accepted only when it names a hotline desk.
  **The two DIFFERING is the finding**, and section 4 of
  `_registered_by_check.sql` is that list.
  - The backfill is exact, not a guess: until now `created_by` WAS the person at
    the keyboard, so `actual_created_by := created_by` loses nothing.
  - `calls` / `pending_calls` rebuilt to carry the column (appended — `create or
    replace view` can only add at the end), `security_invoker` re-asserted on
    all three views, and the INSTEAD OF functions regenerated so a write through
    the view carries it.
  - **The RLS arm had to widen**: the visibility test allowed "a call you
    created", and with `created_by` now naming the DESK that arm stops matching
    for exactly the people this is about. Devika would have lost sight of the
    call she had just typed in. It tests either column now.
  - ✅ **`call_requests.sql` run 2026-09-06** — `_status.sql` rows 66 and 67.
  - Two hotline profiles and no pinned setting is an AMBIGUITY: the database
    returns no desk and files the call to whoever registered it, rather than
    picking one arbitrarily. That is the case the Admin Config card exists for.
- **Audit Mode** (v0.9.98, `0114_audit_mode.sql`) — an admin-only switch, asked
  for with the rules to follow ("I will give the list of rules for that later").
  **Nothing reads it.** The switch, `set_audit_mode()` (admin-only, refuses
  without a reason) and `audit_mode_changes` (no insert/update/delete path
  through the API, not touched by the audit-log retention purge) are built and
  tested; no application behaviour is conditioned on the mode. Documented in the
  Validation Package as **NAR-001, the package's first Non-Auditable
  Requirement** — a statement about PROVENANCE (not derived from a regulatory
  clause, not offered as evidence against one), not about its use going
  unrecorded.
  - ✅ **`audit.sql` run 2026-09-06** — `_status.sql` row 68.
  - 🔜 **Pending from the user:** the rules. Each is to be assessed on its own
    merits when it arrives; a rule that would alter, conceal or suppress a
    quality record, or change what a record shows an assessor, is outside the
    NAR classification and needs raising as an auditable requirement with its
    own risk assessment first.
- **`supabase/apply/_registered_by_check.sql`** — read-only: how much of the
  register is attributable at all, where the line falls between stamped and
  unstamped, WHO has been registering calls, and (section 4, added with 0114)
  the calls whose desk and keyboard disagree. Two
  defects were found by running it against a fixture rather than by reading it:
  sections 3/4 used an INNER join to `profiles`, which silently dropped a call
  whose registrar's profile had gone — out of a count whose whole purpose is to
  be complete; and section 5 gave the same label to "no registrar stamped" and
  "stamped, but no profile", which are different facts and only one is a gap.
- **Who REGISTERED a call is the database's to say** (v0.9.97,
  `0113_call_creator_authoritative.sql`) — a COMPLIANCE control, not a
  convenience: only the Hotline engineer is trained on the vigilance questions
  answered at Review 1, so a call registered by anyone else must be findable.
  `zz_calls_stamp_creator` (BEFORE INSERT, named `zz_` so it fires after
  `calls_biu`) overwrites a caller-supplied `created_by` with `auth.uid()`
  whenever there IS one; an administrative connection (auth.uid() null — a
  restore) keeps what it supplies. Surfaced as a read-only "Registered By" on
  the call and a groupable column on all three registers; the DataTable already
  resolves the UUID via `app_user_names`.
  ⚠️ v0.9.96's editable "Registered By (email)" default is WITHDRAWN — editable,
  client-side and skipped whenever `initial` carried an empty string. The
  engineer's email is off the call form entirely; the column and its sheet
  header stay so imported values still export.
  ✅ **`call_requests.sql` run 2026-09-06** — `_status.sql` row 66.
- **The DCCR can be filtered by CALL status** (v0.9.93,
  `0111_dccr_call_status.sql`) — `field_call_review_summary` gains `open_state`
  and `cancelled_at`, APPENDED (`create or replace view` can only add at the
  end) and with `security_invoker` re-asserted. The summary is what the stage
  counters read, so without it a filter the rows honoured and the counts did not
  would make the register disagree with its own header. The filter uses
  `open_state` only: `field_call_review` carries no `cancelled_at`, so Cancelled
  is not offered — `cancelled_at` is on the summary ready for that.
  ✅ `daily_review.sql` run 2026-09-05 (row 65).
- **An open call can be CLOSED without a visit** (v0.9.87,
  `0109_close_call.sql`) — `close_call()` sets `last_status = 'Solved'` and
  nothing else: `last_visit_at` is untouched, so no visit is invented, and the
  call is Solved like any other (the user's decision — NOT a separate state).
  A later report takes over through `sync_call_last_visit`, re-opening the call
  if it says Unsolved. Refuses on a call that is already closed, cancelled or
  re-opened (the last has `close_reopened_call`, which gives the count back).
  Same gate as re-open. ✅ `call_requests.sql` run 2026-09-05 (row 63).
- **A call can be CANCELLED** (v0.9.83, `0108_call_cancel.sql`) — `cancel_call()`
  / `restore_call()` gated on the new `calls.cancel` permission (merged into
  admin, nsm, hotline). `cancelled_at` / `cancel_reason` / `cancelled_by` on all
  three call tables; `call_state` reads Cancelled AHEAD of Reopened and
  `pending_calls` excludes it. NOT a delete — visits and quality records are
  untouched (0049 still stands). `open_state` is deliberately not involved: it
  is a stored generated column on three tables.
  ✅ `call_requests.sql` run 2026-09-05 (row 62).
  ⚠️ 0104/0107 now `create extension if not exists pg_trgm` themselves: 0052
  installs it but sits in `performance`, which runs LAST, so a FRESH `all.sql`
  died at 0104 (a `language sql` body is parsed at creation, so the missing
  operator was an apply-time error). Verified: fresh `all.sql` now applies with
  no errors and `_status.sql` comes back all-yes.
- **The deploy and the branch preview no longer share a concurrency queue**
  — both push to `gh-pages`, so one `pages` group looked right, but a QUEUED run
  is cancelled by any newer arrival in its group whatever that run's own
  `cancel-in-progress` says. Merging and then syncing the branch (the normal
  loop) started a preview that killed deploy run #322 eight seconds in, and the
  site stayed a version behind with nothing to show for it. `pages-deploy` and
  `pages-preview` now. The cost: a preview and a deploy can push together and
  the loser is rejected — that lands on the preview, which is disposable.
- **A call registered from a request is dated to the day it happened** (v0.9.82)
  — `callDateFromRequest()` in `src/lib/fieldcall.ts`: attended date where the
  request was already attended, else the logged instant read through
  `localIsoDate()` (the browser's calendar, not the front of the UTC string).
  Complaint Date and Breakdown Date both take it, and the form shows which and
  why. New Field Call still defaults to today. Pinned by `npm run check:ui`.
- **Reported Problem keeps the house style** (v0.9.81, `0107_complaint_text_help.sql`)
  — `suggest_complaint_text()` offers the alarm number in the PRODUCT'S own
  spelling (the alarm lists already curated per product in the `dccrgrouping`
  master, used until now only at DCCR Review 3), the phrasings that product's
  calls have used more than once, and a WARNING for an alarm number the product
  does not have. `alarm_value_for()` resolves the number, product list before
  COMM. SECURITY DEFINER, aggregates only, same boundary as 0104.
  ✅ `call_requests.sql` run 2026-09-05 (row 61).
- **The call form's live lists are injected, not in the schema** (v0.9.80) —
  Party datalist, the Standard Complaint master with its past-calls suggestions,
  and the engineer list come from `useCallFieldMasters()` in
  `src/modules/callFields.tsx`. That injection used to live inside the Field
  Calls screen, so the **Register panel on a pending request** and the
  pre-mapping call editor rendered the same schema with none of it: Standard
  Complaint was a bare text box, "Call Allocated To" was an EMPTY dropdown, and
  no suggestions appeared. Nothing errored — the boxes were simply empty.
  `npm run check:ui` now fails any screen that renders the call schema without
  the injection.
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
- **record_audit is STOPPED** (v0.9.94, `0112_stop_record_audit.sql`) — the ten
  triggers are dropped; the TABLE and `record_audit_fn()` stay, so re-attaching
  is one `create trigger`. It existed for 21 CFR Part 11, which is the FDA's and
  does not apply to a CDSCO-regulated operation. ⚠️ It IS a reduction:
  `audit_log` is client-written (bypassable by a direct API call) and purged on
  the retention window; record_audit was neither. FRS-021, R-14 (residual raised
  Low → Medium), FM-16, the ALCOA table and the controls summary all say so.
  ✅ `data_integrity.sql` run 2026-09-05 — record_audit is stopped on the live
  project. `_status.sql` row 60 now checks the OPPOSITE of what it used to
  (that no record_audit trigger remains), so a `yes` there means it is off.
- **The Validation Package is anchored on CDSCO, not FDA** (v0.9.94) —
  Medical Devices Rules 2017 (Fifth Schedule) + ISO 13485:2016 / ISO 14971 /
  ISO/TR 80002-2 / GAMP 5 / CSA, with the IT Act 2000 for the standing of
  electronic records. Every `21 CFR 820.x` and `Part 11 §11.10(x)` citation
  re-pointed; the Part 11 appendix (`PART11`, its screen section and the
  `part11` tab) removed. ⚠️ The clause mapping is the author's and needs RA/QA
  confirmation against the current text.
- **An admin can reset a forgotten password** (v0.9.91,
  `0110_admin_reset_password.sql`) — `admin_reset_password(email, password)`,
  SECURITY DEFINER, gated on `is_admin()`, refusing a super admin unless the
  caller is one and refusing anything under 10 characters. It writes
  `auth.users.encrypted_password` with `crypt(pw, gen_salt('bf'))` — the same
  bcrypt hash Supabase writes — because setting somebody else's password needs
  the service_role key, which cannot be in a browser. ⚠️ Off the supported path:
  it runs no Supabase password policy and stops working if Supabase changes how
  it stores passwords (loudly — the person cannot sign in). Sessions and refresh
  tokens for that user are deleted so the reset takes effect everywhere.
  `password_resets` logs who/whom/when and never the password. The generator is
  `src/lib/password.ts` (crypto.getRandomValues, rejection-sampled, no
  ambiguous characters), pinned by `npm run check:ui`.
  ✅ `rbac.sql` run 2026-09-05 (row 64).
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
