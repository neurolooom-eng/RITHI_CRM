# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-08-29 (Supabase cutover + RBAC + spare workflow shipped)_

---

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

### Supabase cutover — DONE (app now runs on Postgres)
Reads were timing out on Apps Script; the app is now on Supabase (Postgres + auto
REST + RLS + Auth). Migrations `0001`–`0008` (also consolidated in
`supabase/full_schema.sql`).
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
- ✅ **Call requests + call state** — `0010_call_request_items` (a request is one
  row per call sharing its REQID; `unique_key` is the identity; atomic insert
  via `next_call_reqid()`), `0011_call_request_actions` (map / cancel columns),
  `0012_call_state` (the two views). Applied.
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

### Open items & questions
- **User Master data + engineer logins** — directory infra is done (`0004`);
  **pending:** import the **User Master CSV** (turns on directory-based scoping +
  the RM→engineer reporting dropdown), then **bulk-create Supabase Auth logins**
  for active directory users (script with the secret key, or add in Auth → Users).
- **Tighten approval / consumption / feedback RLS** to the specific roles
  (buttons are RBAC-gated client-side; DB `sr_update` / `cons` / `fb` currently
  allow any authenticated write).
- **Raw monthly PM bulk import** — accept the raw PM tab export directly in Bulk
  Data Import (auto-map, preserve back-dated `reg_date`). Back-dating already
  works via the clean-CSV importer.
- **PM Reporting fields** — surface PM-specific report columns in the report form.
- **Product Master derivation + Warranty/Contract registers** — build from Sale
  Entry + Warranty Sale + Contract Details/Entry + Ownership Transfer (CSVs
  received); add warranties/contracts/sales/ownership tables + screens.
- **Installation Report / KYC uploads need a CallReg redeploy** — the request
  form uploads both to the Drive folder through the new `driveupload` /
  `driveref` actions, which exist only in `apps-script/CallReg.gs`, not on the
  deployed Web App. Redeploy (re-authorising the Drive scope) and send the new
  `/exec` URL to bump the baked-in default; until then an upload times out.
- **Pending Calls noise** *(watch)* — a call with no visit reported counts as
  Unattended, with no age cut-off, so an old import can crowd the list; add a
  date filter if it does. "Report pending" counts as open (visited, not closed)
  — say so if it should be hidden instead.
- **Manual Report** — currently a Drive-link paste; the `driveupload` endpoint
  added for the request form can back a file-upload flow here too (folder
  `1-46Ud9j…z2La`) (question).
- **Reports history screen** — a fuller visit-history report beyond the call-view
  mini-table (the `/reports` screen covers the list; expand if needed).
- **Product Master gaps** — migration dropped City / State / Service Engineer;
  cascade prefill leaves those blank. Re-map from ProdMaster if needed.
- **Editable Registration Date on the single-call PM form?** (question).
- **Reporting solved-branch fields** — confirm required set / Yes-No dropdowns
  for Add Consumption? / Maintenance Done? / Recomended Filter Changed? (question).
- **Rotate the Supabase secret key** — it was pasted in chat during setup.
- **Local `sheets.ts` fallback** — the Apps Script path remains as a fallback when
  Supabase isn't configured; retire once fully off sheets.

- **Customer feedback** — ✅ done. Mandatory on a solved call, with the **exact
  v2Feedback question set filtered by call type** (INSTALLATION-only, FIELD-only,
  PM/FIELD = not-installation, and all-types questions). Ratings use
  Excellent/Good/Average/Poor (`feedbackrating` master); "Advance PM Done?" is
  Yes/No, "Warranty Start Date?" a date, "Remarks" free text. Saved as a
  structured row to v2Feedback (identifying fields + answers + Call Type).

- **Masters in 200 All Masters** — mapped (baked as defaults; live once CallReg
  is redeployed). Each identified by its column header:
  - `complaint` → tab "Standard Complaint", col **"Complaint Name"** → Standard
    Complaint field on the call form.
  - `calltype` → col **"Call Type"** → Call Type select on the Request form
    (FIELD, INSTALLATION CALL, P M VISIT, SW UPGRADATION, FSCA, DEMO, ...).
  - `pendingreason` → col **"Call Pending Reason Name"** → the pending-reason
    field on the call report (Unsolved branch).
  - `cancelreason` → col **"Call Cancel Reason Name"** → the reason on the
    Hotline's **Cancel request** action (Pending Registrations).

---

## 📋 Queued (from the Service_CRM intent)

- **Spare module** — ✅ Phases 1–3 shipped.
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
  - *Phase 4* (`0011_spare_intake.sql`, `0012_spare_auto_approval.sql`): the
    intake spec — OR NO / RowNo / OR Req Date assigned by the database, UCN
    picker, engineer selection, 20 parts per request — and Supabase-only
    writes. 0011 fixes the RM's approval of a non-AMC item being refused by
    0008's stage guard (the auto-approval of Commercial/NSM rode along in the
    same update and tripped their permission checks).
  - **Next:** stock decrement on dispatch (Part Master on-hand — needs
    `parts.on_hand`/price columns first; the ITEM Master import carries only
    code, description and Active), a stores-side pick/pack view, and consumption
    reconciliation — flag a received request whose parts were never consumed
    against the call.
- **v2Consumption / v2Feedback** — ✅ fixed. They are standalone spreadsheets
  (`consumption` = `1j1IHT3P…dG7o`, `feedback` = `1Mi-b-JY…nqXc`), now wired as
  their own books; the report-time spare-consumption / feedback saves target
  each book's primary sheet (a tab whose name contains "consumption"/"feedback",
  else the first sheet). Links editable in Admin Config. Confirm the landing tab
  after redeploy; if it isn't the intended one, name it and I'll pin it.
- Link remaining masters to call registration (Contract Entry, Warranty Sale
  Entry, "200 All Masters"). ITEM Master is done — it backs Part Master, the
  spare-request picker and the in-call consumption picker.
- Preventive Maintenance (PM) schedule/calls.
- Sale Entry, Reports, Dashboard/KPI, Indoor Activity, other misc (to be placed).

---

## 🔧 Operational notes / blockers

- **Redeploy CallReg** after backend changes (latest adds report/reportget,
  tabmeta/tabappend, upload, master/masters/setmasters). Upload needs the Drive
  scope → re-authorise on redeploy. Send the new /exec URL to bump the default.
- **v2Consumption / v2Feedback** are read as tabs of the Call Register spreadsheet
  by default; if they live elsewhere set `cfg_consumption` / `cfg_feedback` or
  share the sheet.
- Role/visibility matching relies on exact `User Name` ⇄ `Call Allocated To`
  strings (case/space-insensitive). Flag any spelling mismatches.
