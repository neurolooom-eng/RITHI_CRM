# RITHI CRM — every screen, what it lets you do, and what it reads

**GENERATED — do not hand-edit.** Produced by `scripts/module-inventory.ts`
(`npm run inventory`). Re-run it after adding or changing a screen.

Written for one question: *is there a requirement and a test for this?* So it
lists what an auditor would ask about — the screen, who may open it, what may
be DONE on it, and what it reads — and says for each column where the fact
came from, because some are authoritative and one is a floor.

## The count

| | |
| --- | --- |
| Screens in `MODULES` | **54** |
| …with a component this script could resolve | 46 |
| …on the menu | 51 |
| …naming a table in their own source | 1 |
| Redirects (not screens of their own) | 4 |

A screen naming **no table** is not a screen that reads nothing — it reads
through a function in `src/lib`, which this script deliberately does not
follow. The column is a **floor**, and saying so is the point: an inventory
that guessed would be read as a census.

## Overview

### Dashboard `/`

- **Opened by** `mod:/`
- **Source** `src/modules/Dashboard.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `dashboard.view` — View dashboard

### Spare Insights `/spare-insights`

- **Opened by** `mod:/spare-insights`
- **Source** `src/modules/SpareInsights.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `consumption.view` — View consumption
- **Buttons** “This year”

### Product & Party Search `/lookup`

- **Opened by** `mod:/lookup`
- **Source** `src/modules/Lookup.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `calls.create` — Create / register calls
- **Buttons** “By product / serial”, “By party”, “Search”, “＋ Field call”

### Machine History `/machine-history`

- **Opened by** `mod:/machine-history`
- **Source** `src/modules/MachineHistory.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “⭳ Export CSV”

## Quality & Analytics

### Daily Call Review `/daily-review`

- **Opened by** `mod:/daily-review`
- **Source** `src/modules/DailyCallReview.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `review.edit` — Complete the daily call review (Review 2 / 3)
- **Buttons** “Clear”, “Change the filters”, “Cancel”, “All NO”, “Close”

### Field Failure Register `/failure-report`

- **Opened by** `mod:/failure-report`
- **Source** `src/modules/FieldFailureReport.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `ffr.view` — Read the whole Field Failure Register
  - `ffr.manage` — Raise and complete a Field Failure Report
- **Buttons** “＋ Raise FFR”, “Clear the filters”, “Desk”, “Table”, “Cancel”

### KPI & Failure Analysis `/kpi`

- **Opened by** `mod:/kpi`
- **Source** `src/modules/KpiAnalytics.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Objective `/objective`

- **Opened by** `mod:/objective`
- **Source** `src/modules/Objective.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `config.manage`
- **Buttons** “+ Add an objective”, “⭳”, “Cancel”, “Delete”, “Save”

## Service Calls

### Call Review `/call-review`

- **Opened by** `mod:/call-review`
- **Source** `src/modules/CallReview.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `callreview.mark` — Review a closed call’s report (mark Report Reviewed)
- **Buttons** “＋ Reco”, “Book it”, “Cancel”, “Re-open”

### Request Registration `/request-registration`

- **Opened by** `mod:/request-registration`
- **Source** `src/modules/RequestCallRegistration.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `request.create` — Raise call requests
- **Buttons** “＋ New Request”, “⭳ Export CSV”, “＋ Add call”, “Clear”, “Remove”

### Pending Registrations `/pending-registrations`

- **Opened by** `mod:/pending-registrations`
- **Source** `src/modules/PendingRegistrations.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `pending.register` — Register pending (Hotline)
- **Also tested in the screen** (not offered under this page in the matrix): `edit`
- **Buttons** “Map this UCN”, “＋ Create new call”, “Back”, “Cancel request”, “✎ Edit”

### Field Call Register `/field-calls`

- **Opened by** `mod:/field-calls`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.view` — View calls
  - `calls.create` — Create / register calls
  - `calls.edit` — Edit calls
  - `calls.edit.complaint` —  Edit the complaint (complaint, breakdown date)
  - `calls.edit.customer` —  Edit customer & product (party, city, product, serial)
  - `calls.edit.vigilance` —  Edit the vigilance answers (health threat, death, incident)
  - `calls.edit.contact` —  Edit customer contact details (name, number, designation)
  - `calls.allot` — Re-allocate a call to another engineer
  - `calls.report` — Report / update calls
  - `calls.cancel` — Cancel a call (and restore it)
- **Also tested in the screen** (not offered under this page in the matrix): `consumption.reconcile`, `pending.register`, `spare.request`
- **Buttons** “Clear”, “⭳ Export CSV”

### Installation Calls `/installations`

- **Opened by** `mod:/installations`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `install.create` — Create installation calls (Commercial)
- **Also tested in the screen** (not offered under this page in the matrix): `calls.allot`, `calls.cancel`, `calls.create`, `calls.edit`, `calls.report`, `consumption.reconcile`, `pending.register`, `spare.request`
- **Buttons** “Clear”, “⭳ Export CSV”

### Preventive (PM) `/pm-calls`

- **Opened by** `mod:/pm-calls`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `calls.allot`, `calls.cancel`, `calls.create`, `calls.edit`, `calls.report`, `consumption.reconcile`, `pending.register`, `spare.request`
- **Buttons** “Clear”, “⭳ Export CSV”

### Pending Calls `/pending-calls`

- **Opened by** `mod:/pending-calls`
- **Source** `src/modules/PendingCalls.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `calls.allot`
- **Buttons** “Clear”, “⭳ Export CSV”

### Visit Reports / Service Reports `/reports`

- **Opened by** `mod:/reports`
- **Source** `src/modules/Reports.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `reports.view` — View reports
- **Buttons** “⭳ Export CSV”

### Customer Feedback `/feedback`

- **Opened by** `mod:/feedback`
- **Source** `src/modules/CustomerFeedback.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `feedback.view` — View feedback
- **Buttons** “⭳ Export CSV”

## Master

### Party Master `/parties`

- **Opened by** `mod:/parties`
- **Source** `src/modules/PartyMaster.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `masters.edit` — Edit masters
- **Buttons** “⭳ Export CSV”

### Product Database `/product-database`

- **Opened by** `mod:/product-database`
- **Source** `src/modules/ProductMaster.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `calls.create` — Create / register calls
- **Buttons** “+ Field”, “+ Install”, “Clear”, “⭳ Export CSV”

### Product Master (product lines) `/product-master`

- **Opened by** `mod:/product-master`
- **Source** `src/modules/ProductLines.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `masters.edit` — Edit masters
- **Buttons** “⭳ Export CSV”
- **Reads directly** `product_master`

### User Master `/user-master`

- **Opened by** `mod:/user-master`
- **Source** `src/modules/UserMasterView.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `users.manage` — Manage users
- **Buttons** “Cancel”, “✎ Edit”, “+ New User”, “⭳ Export CSV”, “Done”

### Part Master `/parts`

- **Opened by** `mod:/parts`
- **Source** `src/modules/PartMaster.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `masters.edit` — Edit masters
- **Buttons** “＋ Add part”, “✎ Edit”, “⭳ Export CSV”, “Cancel”

### All Masters `/masters`

- **Opened by** `mod:/masters`
- **Source** `src/modules/AllMasters.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `masters.edit` — Edit masters
- **Buttons** “⭳ Export CSV”

## Not on the menu

### Service Manuals `/service-manuals`

- **Opened by** `mod:/service-manuals`
- **Source** `src/modules/DocumentLibrary.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `docs.manage` — Add / edit service manuals
- **Buttons** “＋ Add document”, “Cancel”

### Reports `/exports`

- **Opened by** `mod:/exports`
- **Source** `src/modules/ReportsHub.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### User Access `/users`

- **Opened by** `mod:/users` · administrator-only screen
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

## Documents

### QMS Documents `/qms`

- **Opened by** `mod:/qms`
- **Source** `src/modules/DocumentLibrary.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `qms.manage` — Add / edit QMS documents
- **Buttons** “＋ Add document”, “Cancel”

## Contracts & Warranty

### Warranty Register `/warranties`

- **Opened by** `mod:/warranties`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `cover.edit` — Edit sales / warranties / contracts

### Contract Register `/contracts`

- **Opened by** `mod:/contracts`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Ownership Transfer `/ownership-transfer`

- **Opened by** `mod:/ownership-transfer`
- **Source** `src/modules/OwnershipTransfer.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `ownership.transfer` — Transfer a machine between customers
  - `cover.edit` — Edit sales / warranties / contracts
- **Buttons** “＋ Record a transfer”, “＋ Add entry details”, “Cancel”

## Administration

### Bulk Report Mapping `/report-mapping`

- **Opened by** `mod:/report-mapping` · administrator-only screen
- **Source** `src/modules/ReportMapping.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `calls.report`

### PM Bulk Upload `/pm-bulk-upload`

- **Opened by** `mod:/pm-bulk-upload` · administrator-only screen
- **Source** `src/modules/PmBulkUpload.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “⭳ Download template”, “Clear”

### Bulk Uploads `/bulk-uploads`

- **Opened by** `mod:/bulk-uploads` · administrator-only screen
- **Source** `src/modules/BulkUploads.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Tracker `/tracker`

- **Opened by** `mod:/tracker`
- **Source** `src/modules/Tracker.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “+ Add an item”, “Delete”

### Roles & Permissions `/roles`

- **Opened by** `mod:/roles` · administrator-only screen
- **Source** `src/modules/RolePermissions.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `rbac.manage` — Manage roles & permissions
- **Also tested in the screen** (not offered under this page in the matrix): `admin.view`
- **Buttons** “＋ Add a role”, “Add role”, “Cancel”

### Audit Log `/audit`

- **Opened by** `mod:/audit` · administrator-only screen
- **Source** `src/modules/AuditLog.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `audit.view` — View audit log
- **Buttons** “⭳ Export CSV”

### Admin Config `/admin-config`

- **Opened by** `mod:/admin-config` · administrator-only screen
- **Source** `src/modules/AdminConfig.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `config.manage` — Admin config

### Software Validation `/software-validation`

- **Opened by** `mod:/software-validation` · administrator-only screen
- **Source** `src/modules/SoftwareValidation.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `config.manage` — Admin config
- **Also tested in the screen** (not offered under this page in the matrix): `manage-users`

### Settings `/settings`

- **Opened by** `mod:/settings`
- **Source** `src/modules/Settings.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `admin.view`, `manage-users`
- **Buttons** “Reset Demo Data”

### Version History `/version-history`

- **Opened by** `mod:/version-history`
- **Source** `src/modules/VersionHistory.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

## Spares

### Spare Requests `/spare-requests`

- **Opened by** `mod:/spare-requests`
- **Source** `src/modules/SpareRequests.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `spare.request` — Request spares
  - `spare.approve_rm` — Approve spare — RM stage
  - `spare.approve_commercial` — Approve spare — Commercial
  - `spare.approve_nsm` — Approve spare — NSM
  - `spare.drop` — Drop a spare (any stage)
  - `spare.receive` — Acknowledge spare receipt
- **Also tested in the screen** (not offered under this page in the matrix): `manage-users`, `spare.dispatch`
- **Buttons** “＋ Add spare”, “Cancel”, “Change call”, “⊘ Drop”, “＋ New Spare Request”, “Clear”, “⭳ Export CSV”, “✎ Change engineer”

### RM Approval `/spare-rm-approval`

- **Opened by** `mod:/spare-rm-approval`
- **Source** `src/modules/SpareRmApproval.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `spare.approve_rm` — Approve spare — RM stage
- **Buttons** “⭳ Export CSV”, “Clear”, “Cancel”

### Pending Dispatch `/spare-dispatch`

- **Opened by** `mod:/spare-dispatch`
- **Source** `src/modules/SpareDispatch.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `spare.dispatch` — Dispatch / DC (Stores)
- **Also tested in the screen** (not offered under this page in the matrix): `spare.drop`
- **Buttons** “⭳ Export CSV”, “Clear”, “Cancel”

### Stock Out `/stock-out`

- **Opened by** `mod:/stock-out`
- **Source** `src/modules/StockOut.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Spare Consumption `/spare-consumption`

- **Opened by** `mod:/spare-consumption`
- **Source** `src/modules/SpareConsumption.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `consumption.view` — View consumption
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
- **Buttons** “✎”, “＋ Add consumption”, “⭳ Export CSV”, “Cancel”, “＋ Add another part”

### Hand Stock `/handstock`

- **Opened by** `mod:/handstock`
- **Source** `src/modules/HandStock.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Also tested in the screen** (not offered under this page in the matrix): `stock.transfer`
- **Buttons** “⭳ Export CSV”

### Material Returns (MRN) `/mrn`

- **Opened by** `mod:/mrn`
- **Source** `src/modules/MaterialReturns.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `stock.return` — Return spares to Stores (MRN)
- **Also tested in the screen** (not offered under this page in the matrix): `spare.approve_rm`, `spare.dispatch`, `users.manage`
- **Buttons** “＋ New MRN”, “⭳ Export CSV”, “＋ Add spare”, “Cancel”

### Stock Transfer `/stock-transfer`

- **Opened by** `mod:/stock-transfer`
- **Source** `src/modules/StockTransfer.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `stock.transfer` — Transfer hand-stock between engineers
- **Buttons** “＋ Add part”, “Cancel”, “＋ New Transfer”, “⭳ Export CSV”

## Reports

### Reports — Consumption Report `/exports/consumption`

- **Opened by** `mod:/exports/consumption`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Reports — KPI Export `/exports/kpi`

- **Opened by** `mod:/exports/kpi`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Reports — Not Consumed Against this Call `/exports/unused`

- **Opened by** `mod:/exports/unused`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Reports — Call Report `/exports/calls`

- **Opened by** `mod:/exports/calls`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Reports — Customer Feedback Report `/exports/feedback`

- **Opened by** `mod:/exports/feedback`
- **Source** — not resolved from `App.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

## Indoor Service

### Indoor Service Register `/indoor`

- **Opened by** `mod:/indoor`
- **Source** `src/modules/IndoorService.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `indoor.receive` — Receive equipment into the workshop
  - `indoor.work` — Record cleaning, findings and work done
  - `indoor.qc` — Sign the quality check (4.5.6)
  - `indoor.dispatch` — Dispatch a unit back
  - `indoor.condemn` — Condemn a unit (scrap it)
- **Buttons** “Receive equipment”, “Record cleaning”, “Add a harvested part”, “Add an accessory”, “Add a check”

## Redirects

Paths that resolve to another screen rather than being one.

- `/call-updation` → `/field-calls`
- `/breakdowns` → `/field-calls`
- `/users` → `/user-master`
- `*` → `/`

