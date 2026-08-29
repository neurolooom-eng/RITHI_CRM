# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-08-29_

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

### UX
- All tables: column show/hide/reorder/resize (⚙ lists every schema field),
  saved views (per-user + admin "Save for everyone"), ⚑ Filters (top toolbar).
- Mobile & tablet responsive (off-canvas sidebar ≤1024px, full-screen drawers on
  phones, touch targets, no sideways scroll).
- Collapsible sidebar + nav groups (persisted); in-app Version History; sticky
  build footer.

---

## 🔜 In progress / Next

### Supabase cutover — status
Reads were timing out on Apps Script; the app now runs on Supabase (Postgres +
auto REST + RLS + Auth).
- ✅ Schema (`0001_init.sql`) + reports-as-history (`0002_reports_history.sql`).
- ⚠️ **Run `0010_call_request_items.sql`** — drops the `reqid` unique constraint
  (a request has one row per call, all sharing the REQID), makes `unique_key`
  the unique identity, and adds `next_call_reqid()` so a multi-call request is
  written as one atomic insert. Without it only the first call of a request
  saves.
- ✅ Data layer (`src/lib/supabase.ts`); `sheets.ts` delegates to it when connected.
- ✅ Baked project URL + publishable key; **email/password login** via `profiles`.
- ✅ Loaded: masters 567, parties 5,872, products 20,999, parts 1,324, calls
  (FIELD+INST+PM) 11,299, reports 16,838 visits (by UID).
- ✅ Live on Supabase: Field / Installation / **PM** registers (full load, no
  300-cap, full-register search), Dashboard, product cascade + Product Master
  search, master dropdowns, **Update Call reporting** (visit history by UID),
  spare consumption + feedback, in-app **Bulk Data Import**, unified **call view**
  (actions at top + mini-tables: visit history / spares requested / consumed /
  feedback).

### Open items & questions (moved here from chat)
- **User Master → Supabase** — infra DONE, awaiting data + logins. Built:
  `0004_user_directory.sql` (directory table + RLS; `visible_engineer_names()` /
  `my_dir_name()` rewritten so `can_see_call()` scopes by directory), `listUsers`
  delegates to it (access.ts scoping is DB-driven), reporting dropdown prefers
  directory names, importer + transform support `user_directory`. **Pending:**
  (1) run `0004`; (2) send/import the User Master CSV; (3) **engineer logins** —
  create Supabase Auth accounts for active directory users (bulk-create script
  with the secret key, or add via Authentication → Users).
- **Spare request WRITES still hit the sheet.** ✅ done — the `v2_ORReq-All`
  sheet append is gone; raising a request writes `spare_requests` +
  `spare_request_lines` on Supabase only. `0011_spare_intake.sql` assigns the
  **OR NO** (running number continuing the sheet's series from OR47042), the
  **RowNo** (restarting at 1 per OR) and the **OR Req Date**; qty is at least 1
  and a request carries at most 20 parts, enforced in the DB as well as the UI.
  The intake form now covers the full field spec: a **UC Number picker** that
  searches the Call Register and copies party / product / serial / complaint /
  item status onto the request, an **Engineer Name** every role except Engineer
  may repoint, and free-text remarks. Reads still fall back to the sheet when
  Supabase isn't connected.
- **Pending Registrations** — the UCN-less request list wasn't migrated; still on
  the sheet path. Migrate or wire a Supabase intake table.
- **Raw monthly PM bulk import** *(user use-case)* — accept the **raw PM tab
  export** directly in Bulk Data Import (auto-map headers, preserve back-dated
  `reg_date`), so the monthly load is one drop. Back-dating already works via the
  clean-CSV importer (dates are preserved; UCN only auto-assigned when blank).
- **Editable Registration Date on the single-call PM form?** — for one-off
  back-dated entries (question — confirm if wanted).
- **Manual Report** — currently a Drive-link paste field. The generic
  `driveupload` endpoint added for the request form can back a file-upload flow
  here too (folder `1-46Ud9j…z2La`) (question).
- **Reporting solved-branch fields** — confirm which are required and whether
  "Add Consumption?" / "Maintenance Done?" / "Recomended Filter Changed?" should
  be Yes/No dropdowns (question).
- **Server-side search** — registers currently load fully and search client-side
  (fine at a few thousand rows). If it feels heavy on low-end phones, switch to
  Supabase-side search + paging (offered).
- **Product Master gaps** — the migration dropped **City / State / Service
  Engineer** columns; the cascade prefill leaves those blank. Re-map from
  ProdMaster if needed.
- **User management** — `createUser` / `updateUser` still write the local list;
  wire to Supabase (invite via Auth + `profiles`).
- **Rotate the Supabase secret key** — it was pasted in chat during setup.

### Other in-flight
- **PM Reporting** — PM calls now load; PM-specific reporting columns
  (Complaint Observation, Job Done, Service Report, pending reason) to be
  surfaced in the report form for PM.
- **Product Master derivation + Warranty/Contract registers** — Product Master
  is *built from* Sale Entry + Warranty Sale + Contract Details/Entry +
  Ownership Transfer (CSVs received). Add tables (warranties, contracts, sales,
  ownership); feed the Warranty / Contract Register screens.
- **reports history view** — data is now per-visit (by UID); add a full
  visit-history screen/report beyond the mini-table in the call view.

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
  - `cancelreason` → col **"Call Cancel Reason Name"** → reserved for call
    cancellation (no UI yet).

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
  - **Next:** stock decrement on dispatch (Part Master on-hand), a stores-side
    pick/pack view, and consumption reconciliation — flag a received request
    whose parts were never consumed against the call.
- **v2Consumption / v2Feedback** — ✅ fixed. They are standalone spreadsheets
  (`consumption` = `1j1IHT3P…dG7o`, `feedback` = `1Mi-b-JY…nqXc`), now wired as
  their own books; the report-time spare-consumption / feedback saves target
  each book's primary sheet (a tab whose name contains "consumption"/"feedback",
  else the first sheet). Links editable in Admin Config. Confirm the landing tab
  after redeploy; if it isn't the intended one, name it and I'll pin it.
- Link remaining masters to call registration (Contract Entry, Warranty Sale
  Entry, ITEM Master, "200 All Masters").
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
