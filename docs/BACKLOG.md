# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-08-31 (MRN — Material Return Note — built on `claude/handstock-hc86x7`; `HandStock_X.sql` to re-run on the live project)_

---

## 🚧 In progress

### Calls table split (3 physical tables)
- **Stage 1 — DB (built, SQL to run):** `0040_call_tables_split.sql` splits
  `calls` into `field_calls` / `installation_calls` / `pm_calls`. `calls`
  becomes a UNION view with INSTEAD OF routing triggers, so the app is
  unchanged; `pending_calls` / `call_state` rebuilt over the union; RLS + the
  UCN/call-number/last-visit machinery live per table; UCN letters now F/I/P
  (PM detection fixed). Validated on PG16 (fresh apply, idempotent, routing +
  returned UCN, RLS scoping, report sync, call-registration suite).
  **⏳ Run `split_call_tables.sql` on the live Supabase project.**
- **Stage 2 — client (shipped, v0.8.41):** `listCalls`/`searchCalls` read the
  typed table via `callTable()`, so each register (esp. PM) is isolated;
  cross-type screens keep the view.
- **Stage 3 — hardening (built, SQL to run):** `0041_call_split_hardening.sql`
  adds a per-table CHECK (`call_table_for(call_type)`), so a row can never be
  misfiled, and drops the redundant per-table call_type index. `calls` view
  kept (recommended). **⏳ Run `harden_call_split.sql` after the split.**
- Related, queued (this order): Admin/Super-Admin PM bulk upload → Commercial-
  gated Installation creation → daily full-list email digest.

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
  sidebar) — one table per master with Add / Remove, shared with the All Masters
  overview. All `/masters/*` screens are gated by the one `mod:/masters` action,
  so a new list needs no permission row.
- **Value lists are their own maintained tables** (`0014_master_lists.sql`) —
  a `master_lists` registry (label, what one row is called, extra columns) plus
  the `masters` rows; All Masters opens each list as its own table with Add /
  Remove, gated on `masters.edit`, and clears the dropdown cache on every edit.
  Seeded from the **200 All Masters** workbook: calltype 8, complaint 507,
  pendingreason 21, cancelreason 27, feedbackrating 4, **orapproval** 13 (that
  one carries Stage + Status columns in `masters.extra`). A new list needs a
  registry row, not a release.
- In-call **Spares Consumed** picker reads the live `spare` master too (it used
  to list the same cleared demo collection). A consumed part is stored by its
  `CODE|Description` catalogue string; the old Amount/Total column and the stock
  decrement are gone — the live `parts` table carries neither price nor on-hand.

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

## 🔧 Operational notes / blockers

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
