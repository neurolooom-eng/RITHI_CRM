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
- Party → Product → Serial cascade picker (Party + Product Master) auto-fills.
- Add Field Call: today's dates defaulted; warranty/contract freeze once loaded
  from Product Master; section reorder persists.
- Call Registration Request → 2026-CRNRequest; Pending Registrations (Hotline)
  registers UCN-less Data-2026 rows, mapping warranty/contract, back-fills UCN.
- **Call requests** — Request Call Registration is a **register** (every request
  with its outcome + UCN, status filter, search, CSV, New Request in a drawer).
  A request is one row per call (Product + Serial + Standard Complaint +
  Reported Problem, ≤5 per REQID); Installation Report / KYC upload to Drive.
  **Pending Registrations is the Hotline desk** — map to an existing call,
  create a new one, or cancel with a reason; an **Open Calls** column flags a
  machine that already has an unclosed call. SQL: `0010`–`0013`, or
  `supabase/call_requests.sql` in one paste.
- **Call status everywhere** — Solved / Unsolved / Report pending / Unattended
  from the call's latest visit, kept on the call by a trigger (deriving it per
  read timed out under the visit-table RLS). Colour-coded column on every
  register plus a **Pending Calls** module.
- **Call Number is assigned, not typed** — the request's UniqueID, else
  **CLYY#####** per year, seeded from the existing series; blanks back-filled.
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
  multi-product ≤5, REQID/UniqueID), **Pending Registrations** (reads
  `call_requests`), **Spare Requests** (writes + reads Supabase), in-app **Bulk
  Data Import**, unified **call view** (actions on top + mini-tables keyed by Call
  Number).
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
- **Manual Report** — currently a Drive-link paste; option to restore file
  upload to the Drive folder `1-46Ud9j…z2La` (question).
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
  - `cancelreason` → col **"Call Cancel Reason Name"** → reserved for call
    cancellation (no UI yet).

---

## 📋 Queued (from the Service_CRM intent)

- **Spare module** — ✅ Phase 1 shipped: raise a Call-Based spare request from a
  call (📦 Spare / Request Spares) → appended to `v2_ORReq-All` of
  `26_SpareRequest`; **Spare Requests** register lists the exploded status view
  (`v2_OR_Req`) with the approval/dispatch chain, role-scoped. Spare parts come
  from the `spare` master (LookupValues → SPARE). **Next:** approvals
  (RM/Admin/NSM) and stores/dispatch views.
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
