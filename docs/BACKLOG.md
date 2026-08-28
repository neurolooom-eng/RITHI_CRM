# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-08-28_

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

- **Supabase cutover (Google Sheets → Postgres)** — in progress. Reads were
  timing out on Apps Script; moving to Supabase (Postgres + auto REST + RLS +
  Auth). Done: schema (`supabase/migrations/0001_init.sql`), data layer
  (`src/lib/supabase.ts`), baked project defaults, **email/password login** via
  `profiles` (role + RM/RGM hierarchy), connection panel, CSV transform + load
  scripts. Data prepared: masters 567, parties 5,872, products 20,999, parts
  1,324, calls (FIELD+INST+PM) 11,302, reports 17,392. **Next:** load into
  Supabase, then switch each screen's reads/writes off `sheets.ts`.
- **PM Reporting** — the PM Call Register has its own reporting columns (Call
  Status, Visiting Service Engineer, Complaint Observation, Job Done, Service
  Report, pending reason). Wire PM-call reporting like Field/Installation.
- **Product Master derivation + Warranty/Contract registers** — Product Master
  is *built from* Sale Entry + Warranty Sale + Contract Details/Entry +
  Ownership Transfer. Add tables for these sources (warranties, contracts,
  sales, ownership) and either import the materialized Product Master (done) or
  recompute it. Feeds the Warranty Register / Contract Register screens.
- **reports = one row per UCN** currently (unique). Reporting-N has multiple
  visits per call (17,392 rows for 11,302 calls) — add visit history later;
  the load keeps the latest visit per UCN.

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
