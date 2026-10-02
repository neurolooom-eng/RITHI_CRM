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
| Screens in `MODULES` | **65** |
| …with a component this script could resolve | 64 |
| …on the menu | 64 |
| …naming a table in their own source | 1 |
| Redirects (not screens of their own) | 5 |

A screen naming **no table** is not a screen that reads nothing — it reads
through a function in `src/lib`, which this script deliberately does not
follow. The column is a **floor**, and saying so is the point: an inventory
that guessed would be read as a census.

## Overview

### Dashboard `/`

- **Opened by** `mod:/`
- **Source** `src/modules/Dashboard.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### My Workload `/workload`

- **Opened by** `mod:/workload`
- **Source** `src/modules/Workload.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “Open the register ›”

### Product & Party Search `/lookup`

- **Opened by** `mod:/lookup`
- **Source** `src/modules/Lookup.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.create` — Create / register calls
- **Buttons** “By product / serial”, “By party”, “Search”, “＋ Field call”

### Machine History `/machine-history`

- **Opened by** `mod:/machine-history`
- **Source** `src/modules/MachineHistory.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters

### Part Search `/part-search`

- **Opened by** `mod:/part-search`
- **Source** `src/modules/PartSearch.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

## Quality & Analytics

### Daily Complaint Review Register (R/SER/35) `/daily-review`

- **Opened by** `mod:/daily-review`
- **Source** `src/modules/DailyCallReview.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `review.edit` — Complete the daily call review (Review 2 / 3)
  - `review.auto` — Switch auto review on or off (Review 2 answered No in your name)
  - `review.correct_date` — Correct the date a review was completed
  - `ffr.manage` — Raise and complete a Field Failure Report
- **Buttons** “Clear”, “Change the filters”, “Cancel”, “All NO”, “Close”

### Product Failure Analysis `/product-failure`

- **Opened by** `mod:/product-failure`
- **Source** `src/modules/ProductFailureAnalysis.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `charts.share` — Share a chart with a role or with everyone
- **Buttons** “⭳ Download”, “Clear all”, “＋ New chart”, “Save”, “Cancel”

### Spare Insights `/spare-insights`

- **Opened by** `mod:/spare-insights`
- **Source** `src/modules/SpareInsights.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `consumption.view` — View consumption
- **Buttons** “This year”

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
- **Actions an administrator can grant** (from the permission matrix):
  - `objective.manage` — Edit, recalculate and cut off the quality objectives
  - `objective.lock` — Lock or unlock the objective cut-off
  - `reports.view` — View reports
- **Buttons** “+ Add an objective”, “⭳”, “Cancel”, “Delete”, “Save”

## Service Calls

### Call Review `/call-review`

- **Opened by** `mod:/call-review`
- **Source** `src/modules/CallReview.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `callreview.mark` — Review a closed call’s report (mark Report Reviewed)
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
  - `calls.reopen` — Re-open, close or close again a Field call
  - `install.reopen` — Re-open, close or close again an installation call
  - `pm.reopen` — Re-open, close or close again a PM call
- **Buttons** “＋ Reco”, “Book it”, “Cancel”, “Re-open”

### Request Registration `/request-registration`

- **Opened by** `mod:/request-registration`
- **Source** `src/modules/RequestCallRegistration.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `request.create` — Raise call requests
  - `calls.create` — Create / register calls
  - `pending.register` — Register pending (Hotline)
- **Buttons** “＋ New Request”, “⭳ Export CSV”, “Cancel”, “✎ Correct this request”, “＋ Add call”, “Clear”, “Remove”

### Pending Registrations `/pending-registrations`

- **Opened by** `mod:/pending-registrations`
- **Source** `src/modules/PendingRegistrations.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `pending.register` — Register pending (Hotline)
  - `calls.create` — Create / register calls
  - `install.create` — Create installation calls (Commercial)
  - `calls.edit` — Edit Field calls (all sections)
  - `install.edit` — Edit installation calls (all sections)
- **Buttons** “Map this UCN”, “＋ Create new call”, “Back”, “Cancel request”, “✎ Edit”

### Field Call Register `/field-calls`

- **Opened by** `mod:/field-calls`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.view` — View calls
  - `calls.create` — Create / register calls
  - `calls.edit` — Edit Field calls (all sections)
  - `calls.edit.complaint` —  Edit the complaint (complaint, breakdown date)
  - `calls.edit.customer` —  Edit customer & product (party, city, product, serial)
  - `calls.edit.vigilance` —  Edit the vigilance answers (health threat, death, incident)
  - `calls.edit.contact` —  Edit customer contact details (name, number, designation)
  - `calls.allot` — Re-allocate a Field call to another engineer
  - `calls.report` — Report / update Field calls (all of the below)
  - `calls.report.visit` —  File a visit on a Field call
  - `visit.spares` —  Book spares used on a visit (any register)
  - `visit.feedback` —  Record customer feedback on a visit (any register)
  - `calls.cancel` — Cancel a Field call (and restore it)
  - `calls.reopen` — Re-open, close or close again a Field call
  - `spare.request` — Request spares
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
- **Buttons** “Clear”, “⭳ Export CSV”

### Installation Calls `/installations`

- **Opened by** `mod:/installations`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.view` — View calls
  - `install.create` — Create installation calls (Commercial)
  - `install.edit` — Edit installation calls (all sections)
  - `install.edit.complaint` —  Edit the complaint
  - `install.edit.customer` —  Edit customer & product
  - `install.edit.vigilance` —  Edit the vigilance answers
  - `install.edit.contact` —  Edit customer contact details
  - `install.allot` — Re-allocate an installation call
  - `install.report` — Report / update installation calls (all of the below)
  - `install.report.visit` —  File a visit on an installation call
  - `visit.spares` —  Book spares used on a visit (any register)
  - `visit.feedback` —  Record customer feedback on a visit (any register)
  - `install.cancel` — Cancel an installation call (and restore it)
  - `install.reopen` — Re-open, close or close again an installation call
  - `spare.request` — Request spares
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
- **Buttons** “Clear”, “⭳ Export CSV”

### Preventive (PM) `/pm-calls`

- **Opened by** `mod:/pm-calls`
- **Source** `src/modules/FieldCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.view` — View calls
  - `pm.create` — Create PM calls
  - `pm.edit` — Edit PM calls (all sections)
  - `pm.edit.complaint` —  Edit the complaint
  - `pm.edit.customer` —  Edit customer & product
  - `pm.edit.vigilance` —  Edit the vigilance answers
  - `pm.edit.contact` —  Edit customer contact details
  - `pm.allot` — Re-allocate a PM call
  - `pm.report` — Report / update PM calls (all of the below)
  - `pm.report.visit` —  File a visit on a PM call
  - `visit.spares` —  Book spares used on a visit (any register)
  - `visit.feedback` —  Record customer feedback on a visit (any register)
  - `pm.cancel` — Cancel a PM call (and restore it)
  - `pm.reopen` — Re-open, close or close again a PM call
  - `spare.request` — Request spares
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
- **Buttons** “Clear”, “⭳ Export CSV”

### Pending Calls `/pending-calls`

- **Opened by** `mod:/pending-calls`
- **Source** `src/modules/PendingCalls.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.allot` — Re-allocate a Field call to another engineer
  - `install.allot` — Re-allocate an installation call
  - `pm.allot` — Re-allocate a PM call
- **Buttons** “Clear”, “⭳ Export CSV”

### Visit Reports / Service Reports `/reports`

- **Opened by** `mod:/reports`
- **Source** `src/modules/Reports.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.view` — View calls
- **Buttons** “⭳ Excel”, “⭳ CSV”

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
  - `masters.edit` — Edit masters (all of the below)
  - `masters.edit.records` —  Add / edit master records (parties, parts, products, lists)
  - `masters.edit.kyc` —  Verify a party’s KYC
  - `masters.edit.swap_serviceman` —  Swap the Serviceman on every party at once
- **Buttons** “✎ Change engineer”, “⭳ Export CSV”, “Cancel”, “Remove”

### Product Database `/product-database`

- **Opened by** `mod:/product-database`
- **Source** `src/modules/ProductMaster.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `install.create` — Create installation calls (Commercial)
- **Buttons** “+ Field”, “+ Install”, “Clear”, “⭳ Export CSV”

### Product Database 2.0 `/product-database-2`

- **Opened by** `mod:/product-database-2`
- **Source** `src/modules/ProductDatabase2.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `pd2.rebuild` — Rebuild Product Database 2.0
- **Buttons** “⭳ Export CSV”

### Product Master (product lines) `/product-master`

- **Opened by** `mod:/product-master`
- **Source** `src/modules/ProductLines.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “⭳ Export CSV”
- **Reads directly** `product_master`

### User Master `/user-master`

- **Opened by** `mod:/user-master`
- **Source** `src/modules/UserMasterView.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `users.manage` — Manage users (all of the below)
  - `users.manage.details` —  Edit User Master details, profiles and R&R
  - `users.manage.create` —  Create logins (a new login is an Engineer; any other role needs the tick below)
  - `users.manage.disable` —  Disable or delete logins
  - `users.manage.access` —  Assign roles & grant permissions
  - `users.reset_password` — Reset a person’s password
- **Buttons** “Cancel”, “✎ Edit”, “+ New User”, “⭳ Export CSV”, “Done”

### Part Master `/parts`

- **Opened by** `mod:/parts`
- **Source** `src/modules/PartMaster.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.edit` — Edit masters (all of the below)
  - `masters.edit.records` —  Add / edit master records (parties, parts, products, lists)
  - `masters.edit.rename_part` —  Rename a part (moves every record that names it)
- **Buttons** “＋ Add part”, “✎ Edit”, “⭳ Export CSV”, “Cancel”

### All Masters `/masters`

- **Opened by** `mod:/masters`
- **Source** `src/modules/AllMasters.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.edit` — Edit masters (all of the below)
  - `masters.edit.records` —  Add / edit master records (parties, parts, products, lists)
- **Buttons** “⭳ Export CSV”

## Knowledge Base

### How RITHI Functions `/knowledge-base/how-it-works`

- **Opened by** `mod:/knowledge-base/how-it-works` · administrator-only screen
- **Source** `src/modules/HowRithiFunctions.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “Data flows”

### Service Manuals `/service-manuals`

- **Opened by** `mod:/service-manuals`
- **Source** `src/modules/DocumentLibrary.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `docs.manage` — Add / edit service manuals
- **Buttons** “＋ Add document”, “Cancel”

### Technical / Service Notes `/service-manuals/notes`

- **Opened by** `mod:/service-manuals/notes`
- **Source** `src/modules/DocumentLibrary.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `docs.manage` — Add / edit service manuals
- **Buttons** “＋ Add document”, “Cancel”

## Documents

### QMS Documents `/qms`

- **Opened by** `mod:/qms`
- **Source** `src/modules/DocumentLibrary.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `qms.manage` — Add / edit QMS documents
- **Buttons** “＋ Add document”, “Cancel”

### Training `/training`

- **Opened by** `mod:/training` · administrator-only screen
- **Source** `src/modules/Training.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `training.manage` — Manage training — assign, record sessions, see everyone's training and R&R
- **Buttons** “Cancel”, “＋ Assign training”, “＋ Record session”, “⭳ Export CSV”, “Assign”, “＋ Add these people”, “Save session”

## Contracts & Warranty

### Warranty Register `/warranties`

- **Opened by** `mod:/warranties`
- **Source** `src/modules/CoverRegister.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `cover.edit` — Edit sales / warranties (all of the below)
  - `cover.edit.entries` —  Add / edit warranty entries and their machines
  - `cover.edit.delete` —  Delete a whole warranty entry with its machines
  - `calls.create` — Create / register calls
  - `install.create` — Create installation calls (Commercial)
- **Buttons** “Remove”, “Apply to rates”, “Clear rates”, “+ Field call”, “Delete entry”, “+ Add machine”, “+ New entry”, “⭳ Export CSV”, “Entries”, “By machine”

### Contract Register `/contracts`

- **Opened by** `mod:/contracts`
- **Source** `src/modules/CoverRegister.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `masters.view` — View masters
  - `contract.edit` — Edit contracts (all of the below)
  - `contract.edit.entries` —  Add / edit contract entries and their machines
  - `contract.edit.delete` —  Delete a whole contract entry with its machines
  - `calls.create` — Create / register calls
- **Also tested in the screen** (not offered under this page in the matrix): `install.create`
- **Buttons** “Remove”, “Apply to rates”, “Clear rates”, “+ Field call”, “Delete entry”, “+ Add machine”, “+ New entry”, “⭳ Export CSV”, “Entries”, “By machine”

### Ownership Transfer `/ownership-transfer`

- **Opened by** `mod:/ownership-transfer`
- **Source** `src/modules/OwnershipTransfer.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `ownership.transfer` — Transfer a machine between customers
  - `cover.edit.entries` —  Add / edit warranty entries and their machines
- **Buttons** “＋ Record a transfer”, “＋ Add entry details”, “Cancel”

## Administration

### Bulk Report Mapping `/report-mapping`

- **Opened by** `mod:/report-mapping` · administrator-only screen
- **Source** `src/modules/ReportMapping.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `calls.report.visit` —  File a visit on a Field call
  - `install.report.visit` —  File a visit on an installation call
  - `pm.report.visit` —  File a visit on a PM call

### PM Bulk Upload `/pm-bulk-upload`

- **Opened by** `mod:/pm-bulk-upload` · administrator-only screen
- **Source** `src/modules/PmBulkUpload.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `pm.bulk_upload` — Upload PM calls in bulk
- **Buttons** “⭳ Download template”, “Clear”

### Bulk Uploads `/bulk-uploads`

- **Opened by** `mod:/bulk-uploads` · administrator-only screen
- **Source** `src/modules/BulkUploads.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `bulk.upload` — Load registers in bulk (Bulk Uploads)

### Data Export `/data-export`

- **Opened by** `mod:/data-export` · administrator-only screen
- **Source** — **not resolved from `App.tsx`**
- **Actions an administrator can grant** (from the permission matrix):
  - `export.tables` — Export whole tables (Data Export)
  - `export.schedules` — Create, pause or delete an export schedule

### Device Cache Status `/device-cache`

- **Opened by** `mod:/device-cache` · administrator-only screen
- **Source** `src/modules/DeviceCacheStatus.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Solved Without a Report `/missing-visit-reports`

- **Opened by** `mod:/missing-visit-reports` · administrator-only screen
- **Source** `src/modules/SolvedWithoutReport.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “⭳ Excel”, “⭳ CSV”

### Tracker `/tracker`

- **Opened by** `mod:/tracker`
- **Source** `src/modules/Tracker.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `tracker.delete` — Delete a Tracker item
- **Buttons** “+ Add an item”, “Delete”

### Roles & Permissions `/roles`

- **Opened by** `mod:/roles` · administrator-only screen
- **Source** `src/modules/RolePermissions.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `rbac.manage` — Manage roles & permissions
- **Also tested in the screen** (not offered under this page in the matrix): `admin.view`
- **Buttons** “＋ Add a role”, “Add role”, “Cancel”, “⭳ Export matrix”

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
  - `config.manage` — Admin config (SLA targets, Call Registration desk, Frequent Failure rule)
  - `import.panel` — Load data through the Data Import panel
  - `audit.mode` — Switch Audit Mode on or off, and read its history

### Software Validation `/software-validation`

- **Opened by** `mod:/software-validation` · administrator-only screen
- **Source** `src/modules/SoftwareValidation.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `validation.manage` — Record software validation results

### Settings `/settings`

- **Opened by** `mod:/settings`
- **Source** `src/modules/Settings.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `users.manage.settings` —  Change the Settings page (connections, templates)
- **Also tested in the screen** (not offered under this page in the matrix): `admin.view`
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
  - `spare.dispatch` — Dispatch / DC (Stores)
  - `spare.drop` — Drop a spare (any stage)
  - `spare.receive` — Acknowledge spare receipt
  - `spare.reassign` — Change the engineer on a spare request (before dispatch)
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
  - `spare.drop` — Drop a spare (any stage)
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
- **Actions an administrator can grant** (from the permission matrix):
  - `consumption.reconcile` — Add consumption against a call (reconciliation)
  - `stock.transfer` — Transfer hand-stock between engineers
- **Buttons** “⭳ Export CSV”, “Cancel”

### Material Returns (MRN) `/mrn`

- **Opened by** `mod:/mrn`
- **Source** `src/modules/MaterialReturns.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `stock.return` — Return spares to Stores (MRN)
  - `stock.return.others` — Return stock in another engineer’s name
- **Buttons** “＋ New MRN”, “⭳ Export CSV”, “＋ Add spare”, “Cancel”

### Stock Transfer `/stock-transfer`

- **Opened by** `mod:/stock-transfer`
- **Source** `src/modules/StockTransfer.tsx`
- **Actions an administrator can grant** (from the permission matrix):
  - `stock.transfer` — Transfer hand-stock between engineers
- **Buttons** “＋ Add part”, “Cancel”, “＋ New Transfer”, “⭳ Export CSV”

## Not on the menu

### Reports `/exports`

- **Opened by** `mod:/exports`
- **Not on the menu itself** — it is the parent key, and the menu lists its 5 reports instead. Granting it grants all of them.
- **Source** `src/modules/ReportsHub.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.

## Reports

### Reports — Consumption Report `/exports/consumption`

- **Opened by** `mod:/exports/consumption`
- **Source** `src/modules/ReportsHub.tsx` (served by `/exports/:tab`)
- **Actions an administrator can grant** (from the permission matrix):
  - `reports.view` — View reports

### Reports — KPI Export `/exports/kpi`

- **Opened by** `mod:/exports/kpi`
- **Source** `src/modules/ReportsHub.tsx` (served by `/exports/:tab`)
- **Actions an administrator can grant**: none — the screen is opened or it is not.

### Reports — Not Consumed Against this Call `/exports/unused`

- **Opened by** `mod:/exports/unused`
- **Source** `src/modules/ReportsHub.tsx` (served by `/exports/:tab`)
- **Actions an administrator can grant** (from the permission matrix):
  - `reports.view` — View reports

### Reports — Call Report `/exports/calls`

- **Opened by** `mod:/exports/calls`
- **Source** `src/modules/ReportsHub.tsx` (served by `/exports/:tab`)
- **Actions an administrator can grant** (from the permission matrix):
  - `reports.view` — View reports

### Reports — Customer Feedback Report `/exports/feedback`

- **Opened by** `mod:/exports/feedback`
- **Source** `src/modules/ReportsHub.tsx` (served by `/exports/:tab`)
- **Actions an administrator can grant** (from the permission matrix):
  - `feedback.view` — View feedback
  - `visit.feedback` —  Record customer feedback on a visit (any register)

### Feedback Without a Report `/feedback-without-report`

- **Opened by** `mod:/feedback-without-report` · administrator-only screen
- **Source** `src/modules/FeedbackWithoutReport.tsx`
- **Actions an administrator can grant**: none — the screen is opened or it is not.
- **Buttons** “⭳ Excel”, “⭳ CSV”

### Hand Stock Report `/handstock-report`

- **Opened by** `mod:/handstock-report` · administrator-only screen
- **Source** `src/modules/HandStockReport.tsx`
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
- `/dccr-insights` → `/product-failure`
- `/users` → `/user-master`
- `*` → `/`

