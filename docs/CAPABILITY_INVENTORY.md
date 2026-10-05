# Capability inventory — every screen, every action

_Compiled 2026-09-30 for the Software Validation update (the user: "Read Every Page one by One — List all Actions, And take every single capability and update the Requirements document")._

**How it was made.** Every screen file (and the helpers each action calls) was read in full, one screen at a time, in five groups. Each row is one thing a person can do on the screen, or one thing the screen does by itself (a background refresh, a count, a notification), with the file and line it was read from, what guards it, and whether a requirement **states** it:

- **Covered** — a URS / FRS / CR / SR / CW requirement whose text states that behaviour, named.
- **partial** — a requirement touches it but does not state all of it; what is missing is said.
- **GAP** — no requirement states it.

A requirement merely naming the screen was not counted as covering an action on it. Where the reader found the code doing something wrong, it is in the Note column; those are carried into the Defect Register (`src/lib/validation.ts`, `DEFECTS`), not into the requirements.

**What it is not.** It was built by reading code, not by running it, and nothing here was checked against the live project. Line numbers are as of the commit it was written against and will drift.

| Group | Screens | Capabilities | GAP | partial |
|---|---|---|---|---|
| Overview & Quality | 12 | 178 | 89 | 51 |
| Service Calls & Feedback | 14 | 239 | 75 | 67 |
| Spares & Hand Stock | 11 | 219 | 121 | 53 |
| Masters, Cover & Knowledge | 14 | 206 | 80 | 71 |
| Reports, Administration & app-wide | 16 | 230 | 109 | 67 |

Each group ends with its own gaps summary.


---

# Overview & Quality

## Capability inventory — group 1 (Overview and Quality & Analytics screens)

Sources read in full: the 11 screen files plus `FieldFailureDesk.tsx`, `FieldFailureInsights.tsx`, `lib/workload.ts`, `lib/machineHistory.ts`, `components/machine/MachineHistoryView.tsx`, and the parts of `lib/supabase.ts`, `lib/format.tsx`, `lib/xlsx.ts`, `lib/exportscope.ts`, `lib/ffr.ts`, `lib/callreview.ts` and the migrations that the screens call.
Requirement sources checked: `URS`, `FRS`, `TESTS` and `NON_AUDITABLE` in `src/lib/validation.ts`, plus CR-xxx (`docs/CALL_REQUEST_REQUIREMENTS.md`), SR-xxx (`docs/ISO13485_SERVICING.md`) and CW-xxx (`docs/COVER_REQUIREMENTS.md`).
**How the Guard column reads:** `mod:<path>` is the screen's module key, checked by the router (`src/App.tsx:109-119`) for every screen below except the print page. A permission name is the check the UI makes. "DB:" is the database policy or function check where I confirmed it in a migration.
**Covered by** lists a requirement only where its text states the behaviour. A test ID is added when that test exercises the behaviour.

---

### Dashboard (`/`) — `src/modules/Dashboard.tsx`
Purpose: shows live counts, charts and SLA flags for the Field and Installation calls the reader's role can see.

| # | Capability (plain words a user would use) | Where (file:line) | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See counts of Field calls and Installation calls ("every call you can see") | Dashboard.tsx:74, 86-89, 141-142 | mod:/ ; RLS on calls, plus a client-side filter by allottee (`inScope`) | partial: URS-013 — says analytics can be retrieved, but not what the dashboard counts | PM calls are not loaded, so PM is missing from every figure on this page (only FIELD and INST, line 74). `dashboard.view` sits in PERM_TREE (rbac.ts:462) but the screen never checks it. |
| 2 | See how many call requests are waiting for a UCN (Pending Registrations card) | Dashboard.tsx:77, 143 | mod:/ ; cr_read policy | partial: URS-066 — asks that a waiting request be visible, not that the dashboard counts it | If this count fails to load, the card quietly shows "—" (line 77) |
| 3 | See "Calls This Month" (by registration date, falling back to complaint date) | Dashboard.tsx:91-94, 144 | mod:/ | GAP | |
| 4 | See the SLA Breached count and a "due soon" count | Dashboard.tsx:119-126, 145 | mod:/ ; rules read from sla_rules | URS-014, FRS-019 (OQ-11, PQ-03) | The "due soon" threshold (within a quarter of the target, minimum 6 h; sla.ts:37-39) is stated nowhere |
| 5 | SLA "needs attention" table: breached first, then due, top 20, naming the rule that is closest to breach; "…and N more" | Dashboard.tsx:152-177 | mod:/ | URS-014, FRS-019 (OQ-11) | |
| 6 | Click an SLA row or a recent call to open that call in its own register (Field, Installation or PM) | Dashboard.tsx:50-56, 161, 196 | mod:/ plus the target register's key | GAP | |
| 7 | If the SLA rules cannot be read, the page falls back to the rules built into the code without saying so | Dashboard.tsx:62-67 | none | GAP | Breach flags could then be computed against targets nobody configured |
| 8 | See counts of Public Health Threats and Serious Incidents (calls answered "yes") | Dashboard.tsx:96-97, 146-147 | mod:/ | GAP | Vigilance figures with no time window: they count every call the reader can see |
| 9 | See "Parties Served" and "Engineers Active" (distinct counts) | Dashboard.tsx:112-116, 148-149 | mod:/ | GAP | |
| 10 | Charts: calls over the last 6 months, item status mix, top products, calls by engineer (top 6) | Dashboard.tsx:99-106, 179-191 | mod:/ | partial: URS-013 — analytics in general only | Dates are parsed day-first (line 24) |
| 11 | Recent Calls list (latest 8 by registration date) | Dashboard.tsx:108-110, 192-208 | mod:/ | GAP | |
| 12 | Scope chip in the header ("All calls" / "Team view · N engineers" / "My calls") | Dashboard.tsx:131; access.ts:275-280 | none | partial: URS-002 — asks for role-based visibility, not a label saying which applies | |
| 13 | Banners for not connected, load failure and loading; empty-chart text "No data yet" | Dashboard.tsx:133-135, 181-194 | none | GAP | |

### My Workload (`/workload`) — `src/modules/Workload.tsx` + `src/lib/workload.ts`
Purpose: one page of queue counts gathered from every register the reader can open, where each count links to the filtered list behind it.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | A section appears only when the reader can open the register behind it. The permission is checked before anything loads, so no request is made otherwise | Workload.tsx:60-73; workload.ts:47-49 | mod:/workload plus each register's mod key | partial: FRS-088 — states this rule for the installations section only (FRS-088 rationale) | Counts are still taken over RLS-scoped reads |
| 2 | Each section loads on its own. One failing shows its own error banner and the others still arrive, always in a fixed order | Workload.tsx:74-85, 113-115 | none | GAP | |
| 3 | Loading starts only once the reporting team is known, so "Awaiting me" matches the register | Workload.tsx:88-95 | none | GAP | |
| 4 | Spare Requests section: Awaiting me, In approval, Awaiting dispatch, Dispatched, Received, Rejected. Clicking a card opens Spare Requests with that stage filtered | workload.ts:92-125 | mod:/spare-requests | GAP | Counts use the register's own `deriveStage` and `actionable` |
| 5 | RM Approval section: number waiting, engineers waiting, longest wait in days (the last two are figures and open nothing) | workload.ts:129-148 | mod:/spare-rm-approval | GAP | |
| 6 | Pending Dispatch section: spares waiting, ageing (a week or more), units, engineers, orders | workload.ts:151-168 | mod:/spare-dispatch | partial: URS-028 — measures time to issue, not a queue with ageing | |
| 7 | Hand Stock section: Short (taken without a stock out; opens Hand Stock filtered to short lines), units in the field, engineers holding, part codes, stock out, consumed, returned | workload.ts:172-192 | mod:/handstock | partial: URS-009 — asks for tracked stock, not these summary figures | |
| 8 | Material Returns section: MRNs, lines, good qty, defective qty | workload.ts:195-211 | mod:/mrn | GAP | |
| 9 | Stock Transfer section: transfers, lines, units moved, engineers involved | workload.ts:214-229 | mod:/stock-transfer | GAP | |
| 10 | Daily Complaint Review section: exact counts for Review 1/2/3 Pending, Any Potential Effect, Completed and Calls in view. Clicking opens the register filtered to that stage | workload.ts:294-320 | mod:/daily-review | GAP | The "Any Potential Effect" card opens the register UNFILTERED (status '', line 314), so the list opened does not match the number shown |
| 11 | "Installations waiting on Commercial": pending installation requests split into KYC verified / waiting on KYC / customer not on the master. Each opens Request Registration filtered | workload.ts:256-292 | mod:/request-registration | FRS-088.1-.5, URS-074 | |
| 12 | A count taken over a partial read (the 4,000-row budget) shows "+" | workload.ts:83, 108; Workload.tsx:134 | none | GAP | The "+" rule is in CLAUDE.md but in no requirement (FRS-091 covers the Hand Stock Report only) |
| 13 | A card with no list behind it (a figure) opens nothing and does not look clickable | Workload.tsx:138-141; workload.ts:16-21 | none | GAP | |
| 14 | "Open the register ›" link on each section; Refresh; last-synced time; total card count | Workload.tsx:101-106, 121-123 | register key | GAP | |
| 15 | Messages for "Counting N more registers…", not connected, and the empty state when no register is open to the role | Workload.tsx:108-112, 148-155 | none | GAP | |

### Product & Party Search (`/lookup`) — `src/modules/Lookup.tsx`
Purpose: from a product or serial to the customer holding it, or from a customer to every machine they hold.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Switch between the "By product / serial" and "By party" modes | Lookup.tsx:198-201 | mod:/lookup | FRS-037 (OQ-25) | |
| 2 | Product list taken from the machine register, with a machine count beside each product | Lookup.tsx:92-99, 206-212; supabase.ts:1473-1490 | mod:/lookup | FRS-037, URS-031 (OQ-25) | |
| 3 | If the register list fails, the product list falls back to the `product` master value list and shows the error with a "press Refresh" hint | Lookup.tsx:101-105, 207-211 | none | GAP | The master list was known to be short (Lookup.tsx:67-69) |
| 4 | Serial list depends on the chosen product (exact match on product), and choosing a product clears the serial | Lookup.tsx:107-125, 206, 216-221 | mod:/lookup | FRS-037, URS-031 | |
| 5 | Serial typed freely when no product is chosen; this runs a contains search | Lookup.tsx:222-225, 150-154 | mod:/lookup | partial: FRS-037 — does not describe a serial-only contains search | |
| 6 | The machine search shows at most 200 results, with a banner when more matched | Lookup.tsx:56-60, 146-163, 247-251 | mod:/lookup | GAP | |
| 7 | When exactly one machine (or one party) matches, its party opens straight away | Lookup.tsx:159, 171 | none | partial: FRS-037 — says both routes "land on one answer", not the auto-open | |
| 8 | Party search: a type-ahead dropdown searched on the server over parties that OWN a machine, plus a box that takes any part of a name | Lookup.tsx:234-240, 165-175; supabase.ts:928-939 | mod:/lookup ; parties RLS | partial: FRS-037 — says the party list "opens the master", but the dropdown actually searches `products.party_name` | |
| 9 | Party card: type, city, state, address, contact, designation, telephone, email, service engineer, GST, party key; "Back to results" | Lookup.tsx:128-144, 177-183, 282-303 | mod:/lookup | FRS-037, URS-031 | Prefers the party whose name matches exactly (line 138) |
| 10 | Every machine at the party: product, serial, status, warranty end, contract type and end, engineer | Lookup.tsx:30-38, 305-326 | mod:/lookup | FRS-037, URS-031 (OQ-25) | |
| 11 | "＋ Field call" on a machine row opens the Field Call Register pre-filled from that machine | Lookup.tsx:307-320 | calls.create (UI) | GAP | |
| 12 | Searches answer from the copy on this device when one exists (offline). A note states the copy's age and failures, with "Download again" | Lookup.tsx:194; MachineRegisterNote.tsx:13-66; supabase.ts:1473,1495,1514,1620 | none | URS-078 (the copy, its age, working with no signal); partial for "Download again" — URS-078 says the copy is replaced only by a complete newer one, not that the user can force a re-download | The duplicates hint is shown to administrators only |
| 13 | No export on this screen | Lookup.tsx (no export) | — | FRS-037 ("Export is deliberately absent") | |
| 14 | Result tables can be sorted, resized and have columns shown or hidden (remembered per device) | Lookup.tsx:254-263, 306-326; DataTable.tsx:46, 544, 936 | none | GAP | Generic table behaviour |
| 15 | Messages: not connected, search errors (dismissible), "No machine matched", "No party matched", validation "Give a product or a serial…" / "Give a party name…" | Lookup.tsx:147, 166, 195-196, 264, 278 | none | GAP | |

### Machine History (`/machine-history`) — `src/modules/MachineHistory.tsx` (+ `components/machine/MachineHistoryView.tsx`, `lib/machineHistory.ts`)
Purpose: for one machine (model plus serial), where it is now and everything any register holds about it.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Pick the product first, then its serial. The serial list follows the product, and a new product clears the serial | MachineHistory.tsx:68-82, 133-155 | mod:/machine-history | URS-053, URS-031, CW-001 (model plus serial is the identity) | |
| 2 | A serial the master does not hold can be typed freely | MachineHistory.tsx:147-154 | none | GAP | |
| 3 | Arriving from a link (Product Database 2.0) with a product and serial: the serial is applied only if it is on that product's list, then looked up automatically; otherwise a message says so | MachineHistory.tsx:51-100 | none | GAP | |
| 4 | Every row of every register is filtered to the same model AND serial, never the serial alone | machineHistory.ts:61-68, 165, 201-275 | none | URS-060, CW-001, SR-013 | |
| 5 | "Where it is now": holder, status, city/state, engineer, warranty number, end and state, contract type, number, end and state | MachineHistoryView.tsx:85-98; machineHistory.ts:88-117 | RLS on products and machine_cover | partial: SR-013, URS-011 — say the history and cover are retrievable, not this panel | |
| 6 | Warning when the Product Database party differs from the party on the cover and calls, saying the transfer is missing | MachineHistoryView.tsx:99-119; machineHistory.ts:141-146 | none | partial: CW-011 — says ownership should come from transfers, not that the screen flags a mismatch | |
| 7 | Note when the machine is not on the Product Database | MachineHistoryView.tsx:120-129 | none | GAP | |
| 8 | A timeline from 11 registers (Product Database, Call, Visit, Spare, Field Failure, Feedback, Sale/warranty, Contract, Ownership, Additional entry, Workshop), each row naming its register, newest first, undated rows last | machineHistory.ts:151-289; MachineHistoryView.tsx:133-179 | RLS per table | SR-013 ("service history is retrievable by that identity"); partial: CW-011 (its status line says Machine History shows transfers) | |
| 9 | Voided spare lines appear marked VOIDED; cancelled calls marked CANCELLED; migrated FFRs and uploaded feedback labelled | machineHistory.ts:172, 226-229, 237, 243 | none | partial: URS-037 — asks that migrated data be distinguishable; not stated for this screen | |
| 10 | Filter the timeline by register using chips with counts | MachineHistoryView.tsx:55-68, 137-146 | none | GAP | |
| 11 | Export the rows shown to CSV | MachineHistoryView.tsx:148-159 | export.data (csvExport gate, format.tsx:170) | URS-013, FRS-018 (OQ-10) | |
| 12 | Every lookup is written to the audit log (`machine.history`) | MachineHistory.tsx:112-113 | none | partial: URS-016 — "key actions" is not defined | Written by the client (FRS-021) |
| 13 | A register that fails to load is silently read as zero rows, while the screen tells the reader every count is exact. Each read is also capped (limit 200/500) | machineHistory.ts:163, 184-199; MachineHistoryView.tsx:161-162 | none | GAP | A history could look complete when one register refused or was cut off |
| 14 | UCNs are coloured by call state | MachineHistoryView.tsx:62, 76-78 | none | GAP | |
| 15 | Messages: "Nothing anywhere mentions this machine", not connected, product list failure | MachineHistory.tsx:72, 111, 126-131 | none | GAP | |

### Daily Complaint Review Register (`/daily-review`) — `src/modules/DailyCallReview.tsx`
Purpose: every field call goes through Review 1, 2 and 3 (R/SER/35), using a register, a review desk, worklists and an export.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Tabs: Register, Review Desk, To be Reviewed, Review 2 Pending, Review 3 Pending, Export, with exact counts on the tabs | DailyCallReview.tsx:70-85, 668-686 | mod:/daily-review | partial: SR-026 — says the review is recorded, not how it is organised | |
| 2 | Register filters applied by the database: call date from/to (opens on 1 Jan of the current year), review status, call status, product, engineer, "Potential effect only", free-text search (debounced) | :185-204, 296-303, 433-440, 840-878, 941 | mod:/daily-review ; call_reviews/field_call_review RLS | GAP | |
| 3 | Arriving from My Workload with a stage already selected | :196 | none | GAP | |
| 4 | Register grouped by Review Status by default, and can be grouped by call status, product, engineer or complaint grouping | :923-930 | none | URS-033, FRS-039 | |
| 5 | Register pages 500 at a time with Load more. Worklist tabs load in full up to 10,000, drawing each page as it arrives. Counts on loaded rows show "+" | :89-112, 345-431, 620-635, 709-716 | none | partial: FRS-048 — says registers page; the "+" and load-in-full rules are not stated | |
| 6 | Counts are exact over the whole filtered set (not narrowed by stage), showing "still counting" or "total could not be counted". A failed count shows no figure rather than the previous one | :305-321, 388-412, 484-498, 629-635 | none | GAP | |
| 7 | "Stale database" banner when the visit and spare context columns are missing | :380-387 | none | GAP | |
| 8 | AUTO-ANSWER: opening the register runs `auto_answer_review2`, which answers Review 2 = NO on calls logged before today (from 9:15 am), skips first-year and unknown-age calls, and says what it did and what it held back | :442-474; migration 0124 | DB: definer function, review.edit | partial: SR-026 — its status line mentions "an auto-answer rule" but no requirement states the rule | High. It writes quality judgements with review2_by = 'Auto (9:15 am)'. It seems to be run from the browser of whoever opens the register, so 0173 would stamp review2_by_uid as that person. URS-058 says no judgement shall be attributed to "a process or the system itself". |
| 9 | Review Desk: three panes (calls / review / call details), with draggable splitters whose widths are remembered per device | :215-256, 700-835 | none | GAP | |
| 10 | Desk list grouped by review stage then call status; expand all / collapse all; first-year failures marked with their age | :258-282, 719-808 | none | GAP | |
| 11 | Bulk Review 2 = NO: tick eligible rows or use "Select all eligible" / "Mark N as NO", then confirm in a modal. First-year, unknown-age and already-answered calls are never included (refused by the database too). Audit logged | :500-532, 737-746, 887-910, 942-957, 989-1017 | review.edit (UI). DB: bulk_set_review2 checks review.edit and refuses age < 366 | partial: FRS-069 — covers attribution on the "bulk-review path"; the bulk rule itself and the first-year exclusion are not stated | High: sets a quality judgement on many records at once |
| 12 | Auto save switch: a personal choice stored on the device, with an organisation default read from app_settings (the later decision wins). While on, answers are written after a delay without stamping "completed by". A "saved N ago" note acknowledges each save | :129-150, 644-653, 1226-1241, 1279-1295, 1790-1801 | review.edit | partial: FRS-069 (the auto-save path records a person), FRS-052 (typing never commits on an auto-saving record); the behaviour of auto save is not stated | `applyAutoSaveToEveryone` (:152-163) exists but no control on the screen calls it |
| 13 | Export DCCR: reads every page of the filtered set and writes a CSV in the register's own columns and order; the Export tab lists the columns; audit logged | :535-558, 654-656, 968-987 | export.data (csvExport) | URS-013, FRS-018 (gate); partial — the register format is not stated | |
| 14 | Open a call's review from the register (row click or Review/View button) in a drawer | :597-604, 885, 1019-1027, 1840-1850 | mod:/daily-review | GAP | |
| 15 | Call card: call number, date, customer, product and serial, engineer, call status, nature of complaint | :1371-1384 | none | partial: SR-005 | |
| 16 | "From the report": hour meter from the latest visit, software version, pending reason, visits newest first (status, engineer, job done) | :1246-1250, 1386-1455 | RLS on reports | partial: URS-055 — asks that a closed call's report be reviewed; this is a different review | |
| 17 | View the signed service report inside the screen (document preview) | :1440-1444, 1816-1827 | none | GAP | |
| 18 | Spares consumed on the call, as a table (part number, description, qty) | :1457-1502 | RLS on spare_consumption | GAP | |
| 19 | Machine History pop-up for this call's machine | :1316-1325, 1364-1369 | none (same RLS) | partial: SR-013 | |
| 20 | "Raise FFR" opens the Field Failure Register pre-filled from this review. Existing FFRs on the call are listed as "Already reported" | :1064-1069, 1137-1145, 1326-1361 | ffr.manage (UI); DB ffr_write | partial: URS-058 — carrying the judgement onto a further record; the manual raise itself is not stated | High (creates a quality record) |
| 21 | Review 1 shown read-only: public health threat, death, serious incident, completed/pending, date | :1511-1528 | none | partial: SR-026, SR-029 (status lines mention Review 1) | |
| 22 | Review 2 answers (Risk to Patient, Warranty Failure 1 yr, Frequent Failure) chosen from Yes/No pickers. "All NO" fills the three but does not save | :1530-1587, 1862-1877 | review.edit | partial: SR-026, URS-045 | |
| 23 | Age at failure shown under Warranty Failure, with a WITHIN THE FIRST YEAR warning below 366 days, or "not known" | :1556-1584 | none | GAP | |
| 24 | Frequent-failure evidence: the count including this call, the earlier UCNs with date, days before, engineer and what they matched on, rule 1 / rule 2 and thresholds. Says "cannot tell" with no serial and "could not be read" on failure | :1175-1191, 1588-1661 | DB: frequent_failure (definer) | URS-046, FRS-054 (OQ-40); partial — rule 2 (same complaint on N serials of the product within X days) is not in URS-046 or FRS-054 | |
| 25 | Any Potential Effect worked out live from the three answers, with "a Field Failure Report is to be raised" | :1264-1266, 1663-1669 | none | partial: SR-026 | |
| 26 | AUTOMATIC FFR: saving a review whose Any Potential Effect = YES creates one FFR per call, filled from the call, visits and spares. It never undoes itself, and fills the FFR's observation from Review 3 while that is blank | migration 0167 (trigger zz_ffr_from_review, zz_ffr_observation) | DB definer trigger | partial: FRS-069 — mentions raise_ffr() carrying the name only; the rule that raises the report is not stated | High (creates a quality record automatically) |
| 27 | Review 3: Complaint Grouping and Root Cause Key Word from pick lists narrowed to the call's product ("for T60 only" / "every product's"), keeping an existing value even if it is no longer on the list; Spare/Consumable/Correction/Calibration picker | :1193-1210, 1252-1272, 1672-1761 | review.edit | URS-045, FRS-052 (typing never selects; OQ-39); partial — narrowing by product is not stated | |
| 28 | "Change product?": record that an accessory failed, not the machine. Every analysis then counts the failure against the chosen product line, and the call is not changed | :1710-1739 | review.edit | GAP | High: changes what a quality finding is attributed to |
| 29 | Service Dept Observation (free text) and Action Taken ("FFR Generation" until the FFR number is typed) | :1762-1780 | review.edit | GAP | |
| 30 | Save review: writes the answers; the name stamped when a stage completes; the database stamps the reviewer uid and the review dates | :1279-1296, 1786-1789 | review.edit; DB call_reviews_write (review.edit) | URS-058, FRS-069 (OQ-52) | |
| 31 | Administrator can overwrite the Review 2 and Review 3 completion dates | :1111-1133, 1536, 1678 | isAdmin (UI only) | GAP | High: alters the date a quality judgement carries |
| 32 | Without review.edit, everything is read-only with the message "You need the … permission" and no tick boxes | :128, 887-890, 1803 | review.edit | partial: URS-002, FRS-004 | |
| 33 | Audit log entries: review, autosave, bulk, export, autosave default | :157, 516-521, 554, 1289-1292 | none | partial: URS-016 | Written by the client (FRS-021) |
| 34 | UCN coloured by call state; call-status badge | :562, 1377-1380 | none | GAP | |

### Product Failure Analysis (`/product-failure`; `/dccr-insights` redirects here) — `src/modules/ProductFailureAnalysis.tsx`
Purpose: Pareto, share and trend analysis of the review register, asking what fails and why.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Loads up to 8,000 review rows (8 pages of 1,000), shows "+" when capped; Refresh; synced time | ProductFailureAnalysis.tsx:900-939 | mod:/product-failure ; RLS via field_call_review (call policies) | partial: URS-036, FRS-048 — the load cap and "+" are not stated | |
| 2 | Year chips (opens on the current year), dated by complaint date or else registration date; "Every year" warns that migrated history is included | :110-131, 392-400, 445-456, 598-621 | none | partial: URS-037 — the screen warns but shows no migrated / system-created split | |
| 3 | Cards: failures reviewed, any potential effect, risk to patient, failed in warranty, frequent failure, product corrected | :577-581, 640-653 | none | partial: URS-036 | |
| 4 | Built-in analyses: which products fail (under the product as reviewed), per cover (share), root cause, complaint grouping, standard complaint, spare category, machines failing more than once (model plus serial), software version (version order), age at failure (in age order) | :462-526, 655-731 | none | partial: URS-036 — covers "how it fails" and cover; failure rate RELATIVE TO THE FIELD is not on this page (it is on KPI) | Counting under the corrected product (`live_product_name`) is stated nowhere |
| 5 | Each block has a chart plus a table on the side (rank, count, share, cumulative) and a Data labels toggle | :147-382 | none | GAP | |
| 6 | Cross-filter: clicking any bar or table row narrows every chart; "Narrowed to" chips; Clear all | :387-456, 623-638 | none | GAP | |
| 7 | Download any block as .xlsx with three sheets: ranked, the reviews counted (raw), how it was worked out (scope, year, rules). Warns when the data was partly loaded; audit logged | :210-305 | NOT gated by export.data — `xlsxDownload` (xlsx.ts:211-215) has no permission check | GAP (the gate in URS-013/FRS-018 is not applied here) | High: raw review rows can be downloaded by roles denied export |
| 8 | Trend by month, quarter or year: line, table and clickable periods; labels; .xlsx download | :528-575, 843-876 | not export-gated | GAP | |
| 9 | Build a chart: pick one of 22 named dimensions and a form (pareto/share/ordered), name it, and keep it for yourself or share it with everyone or a role. Saved charts render with the same blocks; Remove; warning if the dimension no longer exists | :76-108, 402-429, 733-841 | sharing needs config.manage (UI); DB saved_charts sc_write_mine / sc_write_shared (0206) | GAP | |
| 10 | Not connected / error / "Reading the reviews…" states | :940-946 | none | GAP | |

### Spare Insights (`/spare-insights`) — `src/modules/SpareInsights.tsx`
Purpose: what spares were consumed, under what cover, into which products, and whether consumable or spare, within a date window.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Pick the consumption window (From/To; default 01-Jan-2026 to today) and a "This year" button | SpareInsights.tsx:30-32, 76-91 | mod:/spare-insights | GAP | Both the default and "This year" are hard-coded to 2026-01-01, so the button will be wrong from 2027 |
| 2 | Recalculates automatically when the dates change (debounced), plus Refresh | :44-52, 61-65 | none | GAP | |
| 3 | Every figure is computed in the database in one call (`spare_insights`, invoker, so cons_read RLS applies) | :47; migrations 0148, 0254 | DB RLS on spare_consumption | partial: URS-036 ("computed from the service record") | PERM_TREE lists consumption.view (rbac.ts:488), but the screen does not check it |
| 4 | Cards: spares consumed (qty and lines), distinct parts, calls involved, % unclassified (never rounded to 0) | :54-57, 95-103 | none | partial: URS-036 | |
| 5 | Banner saying how much is unclassified, pointing to Part Master | :105-114 | none | GAP | |
| 6 | Consumable vs spare donut and table | :119-135 | none | GAP | |
| 7 | Consumption by the call's cover (item status) | :137-147 | none | URS-036 ("under each type of cover") | Region is NOT on this page (URS-036 also asks for region; that is on KPI) |
| 8 | Highest-consuming parts (top 25 table, top 12 chart) | :152-176 | none | partial: URS-036 | |
| 9 | Consumption by product (top 25), saying whether the list is complete or cut at 25 | :180-207 | none | partial: URS-036 | |
| 10 | Month-by-month column chart when more than one month is in the window | :209-216 | none | GAP | |
| 11 | Voided lines count as nothing; dated by when the consumption was booked (IST window, 0254) | :88; 0148_spare_insights.sql:80-106 | none | GAP | |
| 12 | Error banner (with a "run performance.sql" hint), not-connected banner, empty texts | :67-74, 134, 146 | none | GAP | |

### Call Review (`/call-review`) — `src/modules/CallReview.tsx`
Purpose: a second review of solved calls' reports. The reviewer marks the report reviewed, books a missed spare (Reco) or re-opens the call.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Lists solved calls only (not report-pending, not re-opened) from up to 20,000, with "+" when capped | CallReview.tsx:110-122, 226-232; callreview.ts:22-26; supabase.ts:5526-5536 | mod:/call-review ; call RLS | FRS-063 (OQ-49) | |
| 2 | Search by UCN, call number, party, product, serial, engineer or complaint | :124-135, 235 | none | GAP | |
| 3 | Tabs: Awaiting review (count), Reviewed, All solved | :236-240 | none | partial: FRS-063 | |
| 4 | An empty list says why: search, cap, "every solved call has been reviewed" (only for roles that see everything), or scope-limited | :258-269 | none | GAP | |
| 5 | Show 500 more at a time ("Load more (N to go)") | :40, 56, 220, 290-296 | none | GAP | |
| 6 | Three-pane desk with draggable splitters whose widths are remembered | :80-108, 251 | none | GAP | |
| 7 | Call details: call number, type, party, where, product, serial, cover, engineer, registered, complaint, reported | :302-327 | none | GAP | |
| 8 | Review state shown (status, reviewer, date) | :330-334 | none | FRS-063 | |
| 9 | "✓ Report Reviewed" / "Update review" with optional remarks. The database stamps the reviewer | :175-184, 336-345 | callreview.mark (UI); DB crr_write / crr_update | URS-055, FRS-063 (OQ-49); partial — re-marking an already-reviewed call and remarks are not stated | |
| 10 | Reco: book a spare the engineer missed. Part picked from the ATTENDING engineer's hand stock (parts with 0 on hand disabled); qty ≥ 1, GRIR, reason required; capped at the balance by trigger | :161-171, 199-218, 346-348, 356-382 | callreview.mark (UI). DB cons_write needs consumption.reconcile; trigger caps at hand stock | URS-055, FRS-064, FRS-028, FRS-030 (OQ-49, OQ-15, OQ-16) | The button is shown to callreview.mark holders; the database requires consumption.reconcile |
| 11 | Re-open the call, reason required; it then leaves the list | :186-197, 349-351, 384-396 | callreview.mark (UI). DB reopen_call needs pending.register or calls.create | URS-025, FRS-031, FRS-064 (OQ-19, OQ-49) | The UI and DB authorities differ; the reason is enforced by the client only (p_reason defaults to '') |
| 12 | Visits and spares for the call (matched on call number OR UCN); report links open in a new tab; "no visit on a solved call is itself the finding" | :143-159, 405-418; CallContext.tsx:132-133 | RLS | FRS-064 (the matching); GAP for the display | |
| 13 | Audit log for mark, reco and re-open | :181, 193, 213 | none | partial: URS-016 | |
| 14 | Message for roles without callreview.mark; error and success banners; manual Refresh | :231, 243-249 | none | partial: URS-002 | |

### KPI & Failure Analysis (`/kpi`) — `src/modules/KpiAnalytics.tsx`
Purpose: failure rate per 100 machines in the field, failure modes, and spare use by cover, region and product, all from database views.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Loads three database views (failure rate, failure modes, spare usage rollup), paged, security_invoker | KpiAnalytics.tsx:80-93; supabase.ts:1420-1435 | mod:/kpi ; RLS through the views | FRS-042, FRS-050 (OQ-29, OQ-35) | |
| 2 | If the views are missing, a message names migration 0101; other errors shown verbatim | :86-90 | none | GAP | |
| 3 | Cards: machines in the field, calls in 12 months, failure rate per 100 machines per year, spares consumed, parts per call, parts on OGP calls, parts under warranty | :114-150, 180-188 | none | FRS-042, URS-036 (rate); partial for the other cards | |
| 4 | OGP and warranty tiles use the WGP/OGP/CMC/AMC vocabulary (`coverCode`); an unrecognised value lands in neither | :118-125 | none | GAP | |
| 5 | Product and Region filter chips (remembered per device) narrow every panel, the rate table included | :74-75, 95-99, 151-160, 195-198 | none | partial: URS-036 (region) | |
| 6 | Spare use by cover (donut), by region (the engineer's region; "No region" kept), by product, and region × cover table (top 25) | :200-255 | none | URS-036, FRS-042 | |
| 7 | Failure-rate table sorted by rate; "—" when no machines. When the reader is not full-visibility, a note says the figures are their share against the whole-fleet denominator | :47-59, 128-134, 257-278 | none | FRS-042 | |
| 8 | Click a rate row to toggle the product filter | :275 | none | GAP | |
| 9 | "How products fail" by standard complaint (12 months and all time, top 200). Clicking a row opens the Field Call Register searched for that complaint | :61-66, 135-141, 280-295 | none | FRS-042 (grouping by complaint); GAP for the drill-through | |
| 10 | Scope chip, synced time, Refresh | :164-175 | none | GAP | |

### Objective (`/objective`) — `src/modules/Objective.tsx`
Purpose: the yearly quality and business objectives, with monthly figures that are typed or computed from the register, and an evidence workbook behind each computed figure.
(`validation.ts:216-220` lists `/objective` in MODULES_WITHOUT_REQUIREMENT on purpose; the SR-033 status line is the only statement.)

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Table of the current year's objectives: #, process, parameter, target, frequency, 12 months, total. A cell is coloured good or bad against a "<x%" or ">x%" target; ƒ marks a computed row | Objective.tsx:43-59, 519-589 | mod:/objective ; DB qo_read (calls.view or reports.view) | partial: SR-033 (status line only) | |
| 2 | Sentence listing the monthly and quarterly objectives (quarterly = cumulative in Mar/Jun/Sep/Dec, other months NA) | :104-109, 476-482 | none | GAP | |
| 3 | Click a month to type a figure. Blank means NOT MEASURED (NULL, not 0); "%" is parsed; a non-number is refused | :83-102, 547-566 | config.manage (UI); DB qo_write (config.manage) | GAP | High: hand-edits a QMS figure |
| 4 | Re-calculate (with a confirm modal): writes only the computed rows, up to this month, replacing anything typed over a computed figure; reports what was written | :111-154, 485-487, 603-661 | config.manage | partial: SR-033 | High |
| 5 | Per-month cut-off dates in the Re-calculate modal, saved as each is set; locked for everyone but administrators when the lock is on | :116-136, 618-645 | config.manage, plus admin when locked; DB set_objective_cutoff checks the lock | GAP | High: changes the basis of reported figures |
| 6 | Administrator locks or unlocks the cut-off dates | :491-512 | isAdmin (UI); DB set_objective_cutoff_lock | GAP | |
| 7 | Add an objective | :488-490 | config.manage | GAP | |
| 8 | Edit an objective's definition: parameter, process, targets, frequency, responsible, "computed by" (3 formulas), cut-off days or a fixed cut-off date (mutually exclusive), parameters as JSON (validated) | :413-446, 537-543, 664-746 | config.manage | GAP | |
| 9 | Delete an objective and its 12 figures (browser confirm) | :747-752 | config.manage; DB qo_write allows delete | GAP | High: deletes a quality record |
| 10 | Download evidence for a computed month as .xlsx: the calls or FFRs, the installed base with the filter the database used, and a calculation sheet (numerator ÷ denominator, solved-after-cut-off count, stored vs computed "agrees?", assumptions and hard stops) | :156-391, 572-578 | NOT export-gated (xlsxDownload). DB objective_evidence gates each objective (e.g. ffr.view) | partial: SR-033 (status line mentions "an evidence sheet naming its assumptions and hard stops") | Export restriction not applied |
| 11 | Evidence messages: quarterly month not applicable, nothing behind the figure, access refused worded as withheld rather than broken | :226-235, 392-410 | none | GAP | |
| 12 | Explanation of how the computed columns are worked out (TTA/TTS bands, pending days, open/close) | :761-780 | none | GAP | Line 596 says "Every figure here is typed today", which contradicts the ƒ rows |
| 13 | Scope chip; not-connected and "no objectives for YEAR — run objective.sql" messages | :453, 456-461, 590-592 | none | GAP | |

### Field Failure Register (`/failure-report`) — `src/modules/FieldFailureReport.tsx` (+ `FieldFailureDesk.tsx`, `FieldFailureInsights.tsx`)
Purpose: the register of Field Failure Reports (R-SER-03): raise, complete, weekly-review, print and analyse them.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Loads the register (up to 5,000 rows, record plus the live call beside it); Refresh | FieldFailureReport.tsx:66-77, 271-282; supabase.ts:5706-5718 | mod:/failure-report ; DB ffr_read: ffr.view, or calls you can see / raised by you (0165, 0176) | partial: URS-002 — the ffr.view "whole register" right is not stated in URS or FRS | |
| 2 | When the register is empty for a reader without ffr.view, a banner says it may be access rather than an empty register | :296-314 | none | GAP | |
| 3 | Year multi-select (opens on the current year, by FFR date) and Product multi-select (only products in the chosen years); both apply to Insights too. "Nothing matches — Clear the filters" | :99-153, 316-348 | none | GAP | |
| 4 | Switch between Insights and Register, and within Register between Desk and Table | :59-64, 356-368 | none | GAP | |
| 5 | "＋ Raise FFR" opens a blank form | :279-281 | ffr.manage (UI); DB ffr_write | GAP | High: creates a quality record by hand |
| 6 | Arriving from the Daily Complaint Review Register: the form is pre-filled from the review, with a warning if the call is not solved | :79-97 | ffr.manage | partial: URS-058 — carrying the judgement onto a further record; the pre-fill is not stated | |
| 7 | The FFR number (FFR - NNN/YY) is issued by the database on save, restarts each year, and is never edited | :35-38, 416-419; 0168 ffr_stamp | DB trigger | partial: FRS-071 ("drawn per year"); non-editability not stated | |
| 8 | Form fields: source, FFR/CRN/installation dates, UCN, customer, place, product, cover (WGP/OGP/AMC/CMC), item code, serial, call type, problem, additional problem, observation, problem status, visit remarks, spares consumed, CAPA responsibility/no/status, FFR status (Open/Closed/Cancelled), verified by, current call status, remarks | :252-267, 413-460; ffr.ts:155-171 | ffr.manage | GAP | |
| 9 | Required: "Problem reported by customer" and "Customer Name" (refused with those messages) | :224-228 | client only | GAP | |
| 10 | Raised By set once when the report is raised (name), never on an edit; the database stamps the raiser's uid and keeps it | :230-241; 0168 ffr_stamp | DB trigger | partial: URS-058, FRS-069 (the name is carried from the review); the manual-raise stamp is not stated | |
| 11 | Edit a report from a table row, or from "Edit / weekly review" on the desk. Only the whitelisted columns are sent | :382, 402; FieldFailureDesk.tsx:217-219; ffr.ts:113-133 | ffr.manage (UI); DB ffr_update | partial: URS-059 (edits are logged) | On the desk the edit button shows for everyone but does nothing without ffr.manage. The drawer has no field for the weekly review date (reviewed_at) or the attachment, so "Due a review" cannot be cleared from this screen |
| 12 | Update log: who, when, and each field's from → to, plus "Report raised" | :462-465, 488-586 | DB ffrh_read (ffr.view or ffr.manage) | URS-059, FRS-070 (OQ-53) | |
| 13 | Print (opens /ffr/:no) and download a Word copy of R-SER-03. The raiser's own saved signature goes in only when the person printing is the raiser; company logo; audit logged | :183-222, 468-474 | none beyond reading the row | FRS-067, URS-057 (OQ-51) | |
| 14 | Table view: search, status buttons All/Open/Closed/Cancelled, CSV export (warns if more than 5,000); table sort, resize and columns | :385-404 | export.data (csvExport) | URS-013, FRS-018 (gate) | |
| 15 | The live call shown beside the record, with an "— withdrawn" badge when the review no longer says YES | :170-182; ffr.ts:148-153 | none | GAP | |
| 16 | Desk: report list with search and chips All / Open / Due a review (open and not reviewed in 7 days); the report; "the call as it stands now"; draggable panes remembered | FieldFailureDesk.tsx:50-250 | none | GAP | |
| 17 | Desk call context: visits and spares for the report's call come from `ffr_call_context` (0178), which returns them to register readers who cannot see the call itself | FieldFailureDesk.tsx:109-139 | DB definer function (0178) | GAP | High: deliberately widens visit and spare visibility for ffr.view holders; stated in no requirement |
| 18 | Reports cannot be deleted (retention guard, 0166) | migration 0166 | DB trigger | partial: URS-017; FRS-070 mentions 0166 only for ffr_history | |
| 19 | Insights cards: reports, open, due a review, CAPA in hand, call still open, effect withdrawn, closed, cancelled, migrated | FieldFailureInsights.tsx:202-228, 530-548 | none | URS-037, FRS-071 (the migrated split; "the Insights tab does"); GAP for the others | |
| 20 | Insights cross-filter across 8 dimensions (machine, cover, status, CAPA, root cause, grouping, customer, period), with chips and Clear all | FieldFailureInsights.tsx:104-146, 185-200, 495-522 | none | GAP | |
| 21 | Insights charts: which machines fail, cover, root cause, grouping, customer, report status, CAPA status | FieldFailureInsights.tsx:550-815 | none | GAP | |
| 22 | Trend by month, quarter or year with a table (change, share, running) and labels; .xlsx download with the raw reports and "how worked out" | FieldFailureInsights.tsx:245-313, 573-656 | NOT export-gated | GAP | |
| 23 | Pareto with a free 3-level drill (machine / complaint grouping / root cause), 80% line, table, labels; .xlsx download with raw reports (origin: migrated or raised here) | FieldFailureInsights.tsx:177-182, 315-474, 660-765 | NOT export-gated | partial: URS-037 (origin column); GAP for the rest | The raw sheet builds a 'Machine the call named' value, but that column is missing from its column list (:377-379 vs :389) |

### Field Failure Report — print page (`/ffr/:ffrNo`) — `src/modules/FieldFailureReportPrint.tsx`
Purpose: a printable A4 R-SER-03 page with no application frame around it.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open a report by FFR number. "Not found, or you cannot view it" when RLS hides it; errors shown with a Back button | FieldFailureReportPrint.tsx:56-79 | signed in + RLS only; NO module key (App.tsx:90-101 is outside the mod: guard) | GAP | Reachable by URL without mod:/failure-report |
| 2 | R-SER-03 Rev 02 laid out from the same form definition as the Word copy (header band, grid, footer template number, company logo) | :87-169 | none | FRS-067 | |
| 3 | Saved signature placed only when the person printing is the raiser; otherwise an empty block | :81-85, 148-154 | none | FRS-067, URS-057 (OQ-51) | |
| 4 | Print button (browser print); "Word copy" download (audit logged); Back to the register | :89-99 | none | FRS-067 (Word copy); GAP for the audit and navigation | |

---

### Gaps summary

Format: screen — capability — what a requirement would need to say — suggested risk

- Dashboard — Field/Installation call counts — what the dashboard counts (every call visible to the role, Field and Installation only, PM excluded) and that it is role-scoped — Medium
- Dashboard — Pending Registrations card — that the dashboard shows the number of requests awaiting a UCN, and what it shows when that count cannot be read — Low
- Dashboard — Calls This Month — how the monthly count is dated (registration date, falling back to complaint date) — Low
- Dashboard — SLA "due soon" threshold — that a call is "due" within a quarter of its target (minimum 6 h) — Medium
- Dashboard — open a call from a tile — that a call named on the dashboard opens in its own register — Low
- Dashboard — SLA rules fallback — that the dashboard shall not evaluate SLA against built-in defaults when the configured rules cannot be read, or shall say that it is — Medium
- Dashboard — Public Health Threat / Serious Incident counts — what period and population the vigilance counts cover — Medium
- Dashboard — Parties Served / Engineers Active — definition of the distinct counts — Low
- Dashboard — charts (6 months, item status, top products, top engineers) — that they exist and what they are computed over — Low
- Dashboard — Recent Calls list — the latest 8 calls by registration date — Low
- Dashboard — scope chip — that the screen states the visibility scope in force — Low
- Dashboard — load/empty/not-connected messages — what the dashboard shows when data is absent or fails — Low
- My Workload — per-section permission gating — that a queue count is shown only to a reader who may open its register, and is not requested otherwise (stated today only for the installations section) — Medium
- My Workload — independent section loading — that one failing section does not stop the others and is named — Low
- My Workload — wait for reporting scope — that "Awaiting me" is computed only once the reader's team is known — Medium
- My Workload — Spare Requests section — the stage counts and "Awaiting me", and that each opens the filtered register — Medium
- My Workload — RM Approval section — the waiting count, engineers, and longest wait over the whole queue — Medium
- My Workload — Pending Dispatch section — spares, ageing of a week or more, units, engineers, orders — Medium
- My Workload — Hand Stock section — the short-line finding and the stock summary figures — Medium
- My Workload — Material Returns section — the returns figures — Low
- My Workload — Stock Transfer section — the transfer figures — Low
- My Workload — Daily Review section — exact stage counts, with each card opening the matching filtered list (the Any Potential Effect card does not) — Medium
- My Workload — "+" lower bound — that a count over a partial read is shown as a lower bound — Medium
- My Workload — figure vs queue cards — that a figure opens nothing and does not look clickable — Low
- My Workload — register links, Refresh, synced time — Low
- My Workload — empty/counting messages — Low
- Product & Party Search — product-list fallback — that when the register list fails, the fallback list and the failure are both stated — Medium
- Product & Party Search — serial-only contains search — that a serial with no product is searched as a contains match — Low
- Product & Party Search — 200-result cap — that a truncated machine search says it is truncated — Medium
- Product & Party Search — auto-open on a single match — Low
- Product & Party Search — party dropdown source — which parties are offered (those owning a machine, not the Party Master), correcting FRS-037's wording — Low
- Product & Party Search — "＋ Field call" from a machine — that a call can be registered pre-filled from the machine found, only with calls.create — Medium
- Product & Party Search — "Download again" of the device copy — that a user can force a full re-download — Low
- Product & Party Search — table sort/resize/columns — Low
- Product & Party Search — validation and empty messages — Low
- Machine History — free-text serial not on master — that an unlisted serial may still be looked up — Low
- Machine History — arrival by link — that a linked serial is applied only if it belongs to the product — Medium
- Machine History — "where it is now" panel — the fields shown and their source registers — Medium
- Machine History — party-mismatch warning — that a Product Database vs cover party disagreement is flagged — Medium
- Machine History — "not on Product Database" note — Low
- Machine History — timeline and register labels — partial through SR-013/CW-011; that each row names its register and is ordered newest first with undated rows last — Low
- Machine History — voided/cancelled/migrated markings — that migrated and voided entries are distinguishable in the history — Medium
- Machine History — filter chips — Low
- Machine History — lookup audit — that a machine-history lookup is an audited action — Low
- Machine History — silent per-register failure and row caps — that a history in which a register failed or was truncated says so rather than presenting exact counts — High
- Machine History — UCN colouring — Low
- Machine History — messages — Low
- Daily Complaint Review Register — tab structure and counts — Low
- Daily Complaint Review Register — register filters and default year — what the register filters on and that it opens on the current year — Low
- Daily Complaint Review Register — arriving filter from Workload — Low
- Daily Complaint Review Register — paging, load-in-full worklists, "+" — that worklists load completely (up to a stated ceiling) and partial counts are marked — Medium
- Daily Complaint Review Register — exact counts, and a failed count showing no figure — Medium
- Daily Complaint Review Register — stale-database banner — Low
- Daily Complaint Review Register — automatic Review 2 = NO at 9:15 am — the rule (calls before today, not first-year, not unknown age, never overwrite) and who the answer is attributed to; reconcile with URS-058's ban on attributing a judgement to a process — High
- Daily Complaint Review Register — three-pane desk with remembered widths — Low
- Daily Complaint Review Register — desk grouping and first-year marking — Low
- Daily Complaint Review Register — bulk Review 2 = NO — the bulk authority, the first-year / unknown-age / already-answered exclusions, confirmation and audit — High
- Daily Complaint Review Register — auto save — that auto save writes answers without completing a stage or naming a completer, its per-user and organisation settings, and the acknowledgement — High
- Daily Complaint Review Register — DCCR export format — that the export carries the whole filtered set in the register's own columns and order — Medium
- Daily Complaint Review Register — open a review in a drawer — Low
- Daily Complaint Review Register — call card — Low
- Daily Complaint Review Register — report context (hour meter, software, visits) — what evidence is shown beside the review — Medium
- Daily Complaint Review Register — in-app service report preview — Low
- Daily Complaint Review Register — spares table — Low
- Daily Complaint Review Register — machine history pop-up — Low
- Daily Complaint Review Register — manual "Raise FFR" from the review — that an FFR can be raised by hand from a review, only with ffr.manage, with existing FFRs shown first — High
- Daily Complaint Review Register — Review 1 display — that Review 1 is answered at registration and shown read-only — Medium
- Daily Complaint Review Register — Review 2 answers and "All NO" — that "All NO" fills the answers without saving — Medium
- Daily Complaint Review Register — age-at-failure first-year warning — that the review shows age at failure and flags less than 366 days — Medium
- Daily Complaint Review Register — frequent-failure rule 2 (fleet level) — that the second rule (same complaint on N serials within X days) is part of the verdict — High
- Daily Complaint Review Register — live Any Potential Effect preview — Low
- Daily Complaint Review Register — automatic FFR on Any Potential Effect = YES — that a YES raises exactly one FFR per call, filled from the call, never withdrawn, with the observation copied while blank — High
- Daily Complaint Review Register — Review 3 lists narrowed by product — Medium
- Daily Complaint Review Register — "Change product?" — that a reviewer may re-attribute a failure to a product line without altering the call, and that every analysis counts under it — High
- Daily Complaint Review Register — Service Dept Observation / Action Taken — including "FFR Generation" until the FFR number is entered — Medium
- Daily Complaint Review Register — administrator override of review dates — who may change a review completion date, and that the change is recorded — High
- Daily Complaint Review Register — read-only without review.edit — Low
- Daily Complaint Review Register — audit entries — which review actions are audited — Low
- Daily Complaint Review Register — UCN colouring — Low
- Product Failure Analysis — 8,000-row load cap and "+" — Medium
- Product Failure Analysis — year window and migrated split — that the analysis reports the migrated vs system-created split (URS-037), not only a warning — Medium
- Product Failure Analysis — KPI cards — definitions — Medium
- Product Failure Analysis — built-in analyses and counting under the corrected product — that failures count under the reviewed product; the dimensions and chart forms offered — Medium
- Product Failure Analysis — chart plus side table and labels — Low
- Product Failure Analysis — cross-filter — Low
- Product Failure Analysis — .xlsx downloads not gated by export.data — that every download (including .xlsx) is restricted to roles holding export.data — High
- Product Failure Analysis — trend chart and download — Low
- Product Failure Analysis — saved/shared charts — that a chart may be kept or shared, that sharing needs config.manage, and that sharing never widens data — Medium
- Product Failure Analysis — messages — Low
- Spare Insights — date window and "This year" — that the window defaults to the current year (it is hard-coded to 2026) — Medium
- Spare Insights — auto-recalculate — Low
- Spare Insights — DB computation under consumption RLS — partial URS-036; that figures are scoped to the reader's consumption visibility — Medium
- Spare Insights — KPI cards — definitions, including the never-zero unclassified % — Medium
- Spare Insights — unclassified banner — Low
- Spare Insights — consumable vs spare split — Medium
- Spare Insights — top parts — Low
- Spare Insights — by product with top-25 note — Low
- Spare Insights — by month — Low
- Spare Insights — voided excluded, dated by booking (IST) — Medium
- Spare Insights — messages — Low
- Call Review — search — Low
- Call Review — tabs — Low
- Call Review — empty-list wording by scope — that an empty list claims completeness only for full-visibility roles — Medium
- Call Review — Load more — Low
- Call Review — desk layout — Low
- Call Review — call details pane — Low
- Call Review — re-marking and remarks — that a review can be updated and carries remarks — Medium
- Call Review — Reco/Re-open authority mismatch — which permission gates Reco (consumption.reconcile) and Re-open (pending.register/calls.create), matching the UI (callreview.mark) — Medium
- Call Review — re-open reason — that the reason is enforced by the database, not only the form — Medium
- Call Review — context pane display and report links — Low
- Call Review — audit — Low
- Call Review — read-only message — Low
- KPI & Failure Analysis — missing-view message — Low
- KPI & Failure Analysis — other cards (parts per call, OGP, warranty) — definitions — Medium
- KPI & Failure Analysis — cover vocabulary bucketing — that an unrecognised cover lands in neither tile — Medium
- KPI & Failure Analysis — product/region chips — Low
- KPI & Failure Analysis — rate-row click filter — Low
- KPI & Failure Analysis — drill-through to calls by complaint — Low
- KPI & Failure Analysis — scope chip/refresh — Low
- Objective — objectives table and good/bad colouring — that objectives are held per year with target, frequency, responsible and monthly figures (no URS by design; SR-033 status only) — Medium
- Objective — monthly/quarterly explanation — Low
- Objective — typing a monthly figure — who may type a figure, that blank means not measured, and that the change is traceable — High
- Objective — Re-calculate — that it writes only computed rows up to the current month and replaces a typed-over computed figure — High
- Objective — per-month cut-off dates — who may set them, that each applies to its month alone, and that a change is recorded — High
- Objective — administrator cut-off lock — Medium
- Objective — add an objective — Medium
- Objective — edit definition / formula / parameters — Medium
- Objective — delete an objective and its figures — that a quality objective and its figures may (or may not) be deleted, and by whom — High
- Objective — evidence download — that the evidence workbook is produced (SR-033 status only) and is subject to the export restriction — Medium
- Objective — evidence messages — Low
- Objective — computed-column explanation (and the stale "every figure is typed" line) — Low
- Objective — scope chip/messages — Low
- Field Failure Register — read scope (ffr.view whole register vs calls visible) — that ffr.view grants the whole register — Medium
- Field Failure Register — access-vs-empty banner — Low
- Field Failure Register — year and product filters — Low
- Field Failure Register — tabs and desk/table views — Low
- Field Failure Register — manual Raise FFR — that an FFR may be raised by hand, only by ffr.manage — High
- Field Failure Register — pre-fill from review — partial URS-058; that the form is filled from the review and warns on an unsolved call — Medium
- Field Failure Register — FFR numbering — that the number is issued per year by the system and never edited — Medium
- Field Failure Register — form fields and vocabularies — the fields of R-SER-03 and their allowed values — Medium
- Field Failure Register — required fields — that Problem reported and Customer Name are mandatory, enforced beyond the client — High
- Field Failure Register — Raised By stamping on a manual raise — High
- Field Failure Register — editing and weekly review — that the weekly review date and attachment can be recorded (no field exists in the drawer) and who may edit — High
- Field Failure Register — live call columns and "withdrawn" badge — Medium
- Field Failure Register — desk (Due a review, the call as it stands now) — Medium
- Field Failure Register — call context via ffr_call_context — that register readers may see a report's visits and spares without call visibility — High
- Field Failure Register — no deletion of reports — that FFRs are never deleted (0166) — Medium
- Field Failure Register — Insights cards other than migrated — definitions — Medium
- Field Failure Register — Insights cross-filter — Low
- Field Failure Register — Insights charts — Low
- Field Failure Register — trend download not export-gated — that .xlsx downloads obey export.data — High
- Field Failure Register — Pareto drill and download not export-gated — High
- Field Failure Report print page — no module key on /ffr/:ffrNo — that the printable report is reachable only by those who may open the register, or that RLS alone is intended — Medium
- Field Failure Report print page — print audit and navigation — Low

---

# Service Calls & Feedback

## Capability inventory — group 2: calls, requests, visits, feedback, indoor

Source revision: working tree of /home/user/RITHI_CRM as read on 2026-09-29. Requirement sources searched: `src/lib/validation.ts` (URS, FRS, NON_AUDITABLE NAR, TESTS, dumped whole and grepped), `docs/CALL_REQUEST_REQUIREMENTS.md` (CR), `docs/ISO13485_SERVICING.md` (SR), `docs/COVER_REQUIREMENTS.md` (CW headings).

Conventions: every route is gated first by its module key `mod:<path>` (App.tsx:113-122, `can(actionForPath)`), so "Guard" lists only what is added on top of it. "DB" means the database is what refuses (RLS policy or trigger). A requirement is cited as covering a capability only where its text states that behaviour.

`/call-updation` and `/breakdowns` are redirects to `/field-calls` (App.tsx:148, 160). They are not separate screens.

---

### Request Registration (`/request-registration`) — `src/modules/RequestCallRegistration.tsx`
Purpose: the register of every call registration request, whatever became of it, plus the form an engineer or manager uses to raise a request of 1 to 5 calls.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See every request newest first, 2,000 at a time, with Load more | RequestCallRegistration.tsx:120-144, 270-272; supabase.ts:2139-2167 | mod:/request-registration; DB `cr_read` | CR-023, CR-024; partial: FRS-048 — says registers page, does not state this register's page size or order | Pages of 1,000 with id tiebreak |
| 2 | The count shows "+" while more requests may exist, filtered or not | RequestCallRegistration.tsx:148, 246-251 | none | GAP | Lower-bound rule is in CLAUDE.md only |
| 3 | Search by REQID, UCN, engineer, party, city, product, serial, complaint | RequestCallRegistration.tsx:150-163, 276 | none | GAP | Searches the loaded rows only, so older requests are not found until loaded |
| 4 | Filter by status chips (All / Pending / Registered / Mapped / Cancelled), with a count on each | RequestCallRegistration.tsx:64, 172-176, 278-282 | none | partial: CR-019, CR-020 — define the statuses, not the filter; chip counts are over loaded rows and carry no "+" | |
| 5 | Arrive from My Workload already filtered by status, call type and KYC | RequestCallRegistration.tsx:98-106 | none | FRS-088.5, OQ-76 | |
| 6 | See the customer's KYC state on each row (Verified / status / not on master) | RequestCallRegistration.tsx:107-110, 135, 181-199 | none; DB parties read | FRS-088.6 | A failed KYC lookup leaves the column blank without saying so (line 135) |
| 7 | Filter by KYC: verified, unverified, not on the master | RequestCallRegistration.tsx:201-211 | none | FRS-088.3, FRS-088.4, FRS-088.5 | |
| 8 | UCN is coloured by its call's status | RequestCallRegistration.tsx:76, 165-170 | none | GAP | Colour code is a CLAUDE.md rule only |
| 9 | Export the list shown to CSV, with a "not finished loading" warning | RequestCallRegistration.tsx:284-289; format.tsx:156-160; exportscope.ts:111-115 | export.data (client gate) | partial: URS-013, FRS-018 — say export is authorised, not this register or the partial-load warning | Exports rows before the table's own Filters panel is applied |
| 10 | Open a request to read every field and its supporting documents | RequestCallRegistration.tsx:298-371 | none | partial: CR-029 — documents follow the request; the read view is not stated | |
| 11 | Correct a request while it is Pending: engineer, submitted-by e-mail, call type, party, site, product, serial, complaint, reported problem, contacts, call attended, plan date, comments | RequestCallRegistration.tsx:315-356; supabase.ts:2089-2137 | DB `cr_update` + 0232 freeze trigger | URS-075, FRS-087.1-.6, OQ-75 | Every field is a plain text box (lines 337-347), including Standard Complaint, Product, Serial and Party. So a correction bypasses CR-005, CR-015 and FRS-053. `email` ("Submitted by") is editable, but FRS-087.1 does not list it and `cr_read` grants visibility on it |
| 12 | A correction the database skipped (zero rows) is reported as "Nothing was saved", not as saved | supabase.ts:2113-2135 | DB RLS | partial: FRS-087.3 — the refusal after Pending is stated; the zero-row case for a non-author is not | |
| 13 | A non-Pending request shows why it cannot be corrected | RequestCallRegistration.tsx:329-334 | none | FRS-087.2 | |
| 14 | Raise a new request (New Request button) | RequestCallRegistration.tsx:252, 294-296 | request.create | CR-022 | |
| 15 | The device's offline copy of the machine register is used and its age shown | RequestCallRegistration.tsx:747 | none | URS-078 | |
| 16 | Choose the call type from the master (FIELD / INSTALLATION CALL …) | RequestCallRegistration.tsx:395, 758-761 | none | partial: CR-017 — installation path defined; call type being a master pick is not stated | |
| 17 | A manager chooses the engineer the request is for (their team); an engineer gets themselves | RequestCallRegistration.tsx:388-394, 763-766 | team list (useTeamEngineers) | URS-034, FRS-040, OQ-24 | |
| 18 | Installation only: search the customer on the server, owners first, and type a new customer if needed; the customer's state, city and address are filled from the Party Master | RequestCallRegistration.tsx:456-460, 810-839 | none | CR-017, CR-018, CR-026 | |
| 19 | Installation only: enter state, city, address and contact for the site | RequestCallRegistration.tsx:840-849 | none | CR-017 | |
| 20 | Up to 5 calls on one request; add and remove calls | RequestCallRegistration.tsx:41, 614-619, 863, 1017 | none | partial: CR "shape" section — says one to five calls, but not as a numbered requirement | |
| 21 | Call 1's product list is the whole register; calls 2-5 offer only products the first customer owns, and say why when that list is empty | RequestCallRegistration.tsx:477-535, 866-886 | none | CR-005a, CR-007, CR-025 | |
| 22 | Find the machine by typing any part of its serial, across every customer; results ranked begins-with, ends-with, contains | RequestCallRegistration.tsx:887-941; supabase.ts:1915 | none | CR-006, CR-031 | |
| 23 | Picking the machine fills the customer and site into that call; a value already typed is kept | RequestCallRegistration.tsx:598-609 | none | CR-005, CR-013, CR-014 | |
| 24 | The customer the machine names is shown under the serial, or a message that the serial is not on the register | RequestCallRegistration.tsx:946-952 | none | CR-011 | |
| 25 | A later call inherits the first call's customer and site; changing call 1's customer clears machines that belong to the old one | RequestCallRegistration.tsx:537-567, 614-618 | none | CR-007, CR-008, CR-009 | |
| 26 | Site (city, state, address, contact) per call, prefilled and editable | RequestCallRegistration.tsx:953-967 | none | CR-013, CR-030 | |
| 27 | A machine already on this request is shown but cannot be picked twice | RequestCallRegistration.tsx:584-588, 921-926 | none | CR-004 | |
| 28 | Standard Complaint is picked from that product's list, never typed; says when the master is empty or loading | RequestCallRegistration.tsx:968-995 | none | CR-015, CR-012, FRS-053, URS-045, OQ-39 | |
| 29 | Reported Problem is typed freely and is mandatory | RequestCallRegistration.tsx:649-650, 996-1000 | none | CR-016 | |
| 30 | Installation calls get "INSTALLATION CALL" as a fixed complaint | RequestCallRegistration.tsx:446-454, 981-982 | none | GAP | |
| 31 | The matching service manuals and articles are shown under each call while it is typed | RequestCallRegistration.tsx:1002-1014 | none | CR-029, FRS-035 | |
| 32 | Installation only: upload an Installation Report and KYC to the Drive folder, see, open or remove it; the upload size is limited | RequestCallRegistration.tsx:1020-1042, 1070-1120 | CallReg bridge | partial: CR-029 — attachment stated; size limit, folder and "wait for upload" block not stated | |
| 33 | Answer Call Attended? (mandatory); Attended Date required when Yes; otherwise a Planned Visit Date defaulting to today | RequestCallRegistration.tsx:659-660, 1044-1055 | none | GAP | The attended date later dates the registered call (see Pending Registrations #20) |
| 34 | Refuse the submit with a named reason: no call type, no party (installation), no product, no serial, serial names no customer, no reported problem, duplicate product+serial, no Call Attended, upload in progress | RequestCallRegistration.tsx:624-663 | none | CR-010, CR-011, CR-004, CR-016, FRS-061, OQ-47; partial: Call Attended rules — GAP | |
| 35 | Before refusing a serial with no customer, ask the register by model and serial | RequestCallRegistration.tsx:665-706 | none | CR-011 | |
| 36 | Submit: the database mints one REQID and every call is written in one insert, keyed REQID-Product-Serial | RequestCallRegistration.tsx:708-733; supabase.ts:1917-1931 | request.create; DB | CR-001, CR-002, CR-028, FRS-005, FRS-061 | Fallback path (lines 1933-1949) can save call 1 and fail the rest, reporting "Saved X (1 call)". That is a half-saved request, which CR-030 does not address |
| 37 | Clear the form | RequestCallRegistration.tsx:620, 1058 | none | GAP | Low |
| 38 | The submit is written to the audit log with outcome and duration | RequestCallRegistration.tsx:725 | none | partial: URS-016, FRS-021 — generic audit trail; which actions are logged is not stated | |
| 39 | Refresh the register; last-sync time remembered on this device | RequestCallRegistration.tsx:122-124, 239-242 | none | GAP | Low |

### Pending Registrations (`/pending-registrations`) — `src/modules/PendingRegistrations.tsx`
Purpose: the Hotline queue of requests with no UCN. Each leaves by mapping to an existing call, registering a new call, or cancelling with a reason.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See every pending request (no UCN, not cancelled), all pages, newest first; banner states the exact count | PendingRegistrations.tsx:118-136; sheets.ts:341-346; supabase.ts:2291-2308 | mod:/pending-registrations; DB `cr_read` | FRS-078, CR-021, URS-066, OQ-59 | Reads `call_requests` |
| 2 | Search by party, product, serial, engineer, problem, city, REQID | PendingRegistrations.tsx:277-279, 305 | none | GAP | Low |
| 3 | "Open Calls" column flags requests whose machine (model+serial, or party when no serial) already has an open call, with a tooltip list | PendingRegistrations.tsx:43-70, 139-167; supabase.ts:2424-2466 | none | partial: FRS-072 — states the model+serial rule; the open-call check itself is not a requirement | A failed lookup leaves the column blank silently (line 166) |
| 4 | Map a request to a UCN by typing it in the table cell | PendingRegistrations.tsx:80-102 | pending.register (or legacy `edit`) | FRS-078, URS-066 | |
| 5 | Map to an existing call: if the UCN is not found, ask "map anyway?" and allow it | PendingRegistrations.tsx:171-188 | pending.register; DB `cr_update` | partial: FRS-078 — says "mapped to an existing call"; mapping to a UCN that does not exist is allowed after a confirm | High. The request can be closed against no call |
| 6 | A map or cancel that RLS skipped (zero rows) is reported as success | supabase.ts:2312-2324 | DB | GAP | Unlike `updateCallRequest`, no row count is taken |
| 7 | Open a request: three panes with request details, actions and this machine's history; pane widths draggable and remembered | PendingRegistrations.tsx:341-497, 439-474 | none | GAP | Low |
| 8 | See the service manuals and articles for the request's product and complaint | PendingRegistrations.tsx:498-512 | none | CR-029, FRS-035 | |
| 9 | See open calls on this machine and map to one in a click; open the call in its register | PendingRegistrations.tsx:526-545, 320 | pending.register | FRS-078 | |
| 10 | See every call ever on this machine (model+serial), whatever its status, and map to a closed one | PendingRegistrations.tsx:356-392, 603-677; supabase.ts:2390-2422 | pending.register (Map) | partial: SR-013 — history retrievable by identity; mapping to a closed call is not stated | |
| 11 | Edit a call from the history pane before mapping (only changed fields are sent) | PendingRegistrations.tsx:394-432, 621-640, 671 | none on screen; DB section-right triggers + `updateCall` zero-row check | partial: URS-067, FRS-079 — rights stated; this editor applies no client lock by right and no Solved/Cancelled check, so it relies wholly on the database | The Edit button is shown to every viewer |
| 12 | Map another UCN typed in the actions pane | PendingRegistrations.tsx:547-554 | pending.register | FRS-078 | |
| 13 | Cancel a request with a mandatory free-text reason plus an optional note | PendingRegistrations.tsx:190-201, 556-596 | pending.register; DB | FRS-078, CR-020, URS-066, OQ-59 | |
| 14 | A role without the right can read but is told it cannot action | PendingRegistrations.tsx:107, 522 | pending.register | partial: CR-022/FRS-078 — gate implied, message not stated | |
| 15 | Create new call: cover (item status, warranty, contract) is filled from Product Database only on an exact model+serial match; party, product and serial stay from the request | PendingRegistrations.tsx:203-243 | none | URS-011, URS-060, OQ-27 | Different messages for not found versus ambiguous serial |
| 16 | The register form opens prefilled from the request: call number = request UniqueID, customer, complaint, contact, engineer; Person Calling = DIRECT ENGINEER | PendingRegistrations.tsx:244-269 | none | partial: FRS-005 — call number from request; engineer and Person Calling defaults not stated | |
| 17 | Complaint and breakdown dates come from the request (attended date, else logged date, else today) and the form says which | PendingRegistrations.tsx:687-698, 723-727 | none | GAP | Medium. Dates a quality record |
| 18 | Re-pick party/product/serial from Product Database; the request's engineer is kept over the machine's | PendingRegistrations.tsx:779-788 | none | partial: FRS-040 — attribution to engineer; the "request wins" rule is not stated | |
| 19 | Register the call (Field or Installation form chosen from the request's call type) | PendingRegistrations.tsx:267, 729-741 | calls.create/install.create via DB insert policy | URS-003, FRS-005, FRS-006, FRS-061, URS-044, FRS-051 | |
| 20 | After registering, the UCN is written back to the request; a failure there is swallowed | PendingRegistrations.tsx:735-736 | DB `cr_update` | partial: FRS-078 — the outcome is stated; failure handling is not | High. The call exists while the request stays Pending, so it can be registered twice |
| 21 | Refresh; the list reloads after every action | PendingRegistrations.tsx:283-285 | none | GAP | Low |

### Field Call Register (`/field-calls`) — `src/modules/FieldCalls.tsx` (+ `callFields.tsx`, `CallAssociations.tsx`)
Purpose: the operational register of field (breakdown) calls, where calls are registered, viewed, edited, allotted, visited, re-opened, cancelled and restored.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Show the 800 most recent calls; Load more adds 800; count shows "+" | FieldCalls.tsx:645-650, 1008-1017, 1159-1175 | mod:/field-calls; DB call policies | partial: FRS-048 — paging stated, not this size | |
| 2 | Search the whole register on the server by UCN, product, serial, party and a global box; a search stopping at 1,000 says so | FieldCalls.tsx:552-558, 724-757, 1269-1275; supabase.ts:261-272 | DB RLS | FRS-048, PQ-05 | |
| 3 | Only calls my role may see: engineer their own, manager their team; an unallotted call is visible to all; my own unsynced local calls stay visible | FieldCalls.tsx:942-979 | client scope + DB | URS-002, FRS-003, FRS-004, OQ-02 | Blank-allottee visibility is not stated |
| 4 | "Open only" toggle, on by default for engineers | FieldCalls.tsx:559-562, 1276-1282 | none | GAP | Low |
| 5 | "Re-opened" filter chip with count of re-opened calls | FieldCalls.tsx:563, 1005-1006, 1283-1289 | none | partial: URS-025 — re-open recorded; filter not stated | |
| 6 | Engineer chips: each engineer's count of calls; a click shows only theirs; choice remembered | FieldCalls.tsx:564-566, 922-940, 1216-1225 | none | partial: URS-033, FRS-039 — grouping stated; chip filter and lower-bound "+" not | |
| 7 | Group by Region, Engineer and Call Status, up to three deep, remembered per user; region is read off the engineer's User Master row | FieldCalls.tsx:567-569, 996-1002, 1255-1260 | none | URS-033, FRS-039, OQ-22 | |
| 8 | Table Filters panel, column picker (every call field), sort, reorder, resize, all remembered | DataTable.tsx:239-282, 330-333, 437-451; FieldCalls.tsx:1236 | none | GAP | Low. Exports ignore this panel's filters |
| 9 | Header shows my visibility scope, the data source and time since last sync | FieldCalls.tsx:1176-1196 | none | GAP | Low |
| 10 | UCN and Call Status coloured by the latest visit; re-open count on hover | FieldCalls.tsx:214-228 | none | FRS-007 (status); colour — GAP | |
| 11 | Aging column in days; the clock stops at Solved or Cancelled | FieldCalls.tsx:238-256 | none | GAP | Medium. A delay figure |
| 12 | Columns "Created By (Hotline Desk)" and "Actually Registered By" | FieldCalls.tsx:229-236, 1418-1426 | none | URS-044, FRS-051, OQ-37 | |
| 13 | Export the grid columns to CSV, with warnings for partial load or capped search | FieldCalls.tsx:1307-1314 | export.data (client) | partial: URS-013, FRS-018, OQ-10 — export gate stated; partial-load warning and grid-column scope not | |
| 14 | + New Field Call | FieldCalls.tsx:1197-1206 | calls.create; DB insert policy | URS-003, FRS-005 | |
| 15 | Fetch from Product Database: Party, then Product, then Serial; a single serial is picked automatically; fills the form | FieldCalls.tsx:273-392, 1374-1384 | none | partial: URS-011, OQ-27 — cover reflected on call; cascade not stated | |
| 16 | Cover fields (item status, warranty, contract) locked once filled from Product Database | FieldCalls.tsx:67-86 | none | partial: URS-011 — reflected; locking not stated | |
| 17 | The engineer is prefilled from the machine's Service Engineer, else the Party Master's serviceman | FieldCalls.tsx:303-321, 1376-1382 | none | GAP | Medium |
| 18 | Party field: server search over customers who own a machine; one with no machine is shown but not pickable | callFields.tsx:164-190 | none | partial: CR-006/CR-017 — stated for the request form, not the call form | |
| 19 | Required: Complaint Date, Party, Product, Serial, Complaint Reported | FieldCalls.tsx:135-156 | form | FRS-061 (serial), OQ-47; partial: URS-003 — lists what is captured, not which are required | |
| 20 | Standard Complaint picked from that product's master, never typed; suggestions from past calls with their grounds; what was offered and accepted is logged | callFields.tsx:92-143; FieldCalls.tsx:819-833 | none | URS-043, URS-045, FRS-049, FRS-052, FRS-053, OQ-36, OQ-39 | |
| 21 | Help while typing Complaint Reported: the alarm number in this product's spelling and past phrasings | callFields.tsx:145-153 | none | GAP | Low |
| 22 | Vigilance: Public Health Threat, Death and Serious Incident, emphasised, each defaulting to NO | FieldCalls.tsx:162-172 | none | partial: URS-067 — edit right stated; SR-026 — Review 1 reads them; the NO default is not stated anywhere | High. A regulator-facing answer is recorded without being answered |
| 23 | Call Allocated To: any active User Master name at registration | callFields.tsx:48-69, 208 | none | partial: URS-032 — team limit stated for allotment, not at registration | |
| 24 | Created By desk and Actually Registered By shown before saving; both stamped by the database | callFields.tsx:71-85, 213-214; FieldCalls.tsx:203-206 | DB trigger 0114 | URS-044, FRS-051 | |
| 25 | Call Number read-only: request UniqueID, or CLYY##### assigned on save | FieldCalls.tsx:72-79 | DB | FRS-005, OQ-03 | |
| 26 | Register: the database assigns the UCN; routed to the call type's own table | FieldCalls.tsx:809-856; supabase.ts:293-314 | DB | FRS-005, FRS-006, OQ-03, OQ-04 | |
| 27 | If the save fails, or no database is connected, the call is kept only in this browser under a locally-made UCN and marked ⏳ | FieldCalls.tsx:794-807, 841-852 | none | GAP | High. The locally shown UCN is not the one the database later assigns (line 891). A refused registration (for example by RLS) becomes a local call |
| 28 | Sync pending local calls to the database or sheet (each gets a new UCN) | FieldCalls.tsx:884-907, 1290-1294 | none | GAP | High |
| 29 | Discard one or all unsynced local calls, after a confirm | FieldCalls.tsx:909-920, 1150-1152, 1295-1299 | calls.create or calls.edit (single); none (all) | GAP | Medium |
| 30 | Sheet path only: cached list reused if under 30 minutes old; 30-minute background resync | FieldCalls.tsx:708-722 | none | GAP | Low |
| 31 | Arriving from a pending request or KPI: the create drawer opens prefilled, or the register opens pre-searched, or a call opens in edit | FieldCalls.tsx:759-792 | none | partial: FRS-078 | Edit opens only if that call is among the loaded rows |
| 32 | When registered from a pending request, the UCN is written back to it | FieldCalls.tsx:835-839 | DB | FRS-078 | Fire-and-forget; a failure is not reported |
| 33 | View a call: three-column read-only form; dates dd-MMM-yyyy; complaint date and registrant rows hidden from the view | FieldCalls.tsx:88-110, 1385-1432 | none | partial: URS-076 — date form stated for cover registers only | |
| 34 | Edit a call (not Solved, not Cancelled); fields a role lacks the section right for are read-only with the reason | FieldCalls.tsx:480, 519-550, 858-882 | calls.edit; DB section triggers (0127) | partial: URS-067, FRS-079, OQ-60 — the Edit button needs `calls.edit` itself, so a role holding only one section right (e.g. calls.edit.contact) is offered no Edit on this register | The whole form is sent on save, not only changed fields |
| 35 | A Solved call is read-only, for administrators too | FieldCalls.tsx:469-482 | client | partial: FRS-007, OQ-05 — FRS-007 says read-only to non-admins; the screen is stricter | |
| 36 | Visit Entry: record a visit (see the Visit Entry section) | FieldCalls.tsx:1116-1118, 1446-1451 | calls.report; not Solved/Cancelled/local | URS-004, FRS-007 | |
| 37 | Request Spares against the call | FieldCalls.tsx:1119-1121, 1462-1467 | spare.request; not Solved/Cancelled | URS-007 | |
| 38 | Reco: open Spare Consumption prefilled with this UCN, call number and engineer | FieldCalls.tsx:631-639, 1122-1124 | consumption.reconcile | partial: FRS-028 — entry stated; hand-off from the call not | |
| 39 | Re-open a Solved call after a confirm; no reason is asked | FieldCalls.tsx:503, 1019-1032; supabase.ts:2470-2473 | pending.register or calls.create; DB `reopen_call` | partial: URS-025, FRS-031, OQ-19 — re-open recorded; FRS-064 asks a reason from the review, the register sends none | |
| 40 | Close again: withdraw a re-open without inventing a visit | FieldCalls.tsx:507, 1043-1055 | pending.register or calls.create; DB | FRS-031, OQ-19 | |
| 41 | Cancel a call (Unattended/Unsolved only), with a mandatory reason and a warning if already visited; not a delete | FieldCalls.tsx:491-502, 1057-1086; supabase.ts:2501-2504 | calls.cancel; DB `cancel_call` | partial: FRS-079 — permission only; reason required, allowed states and record retention not stated | |
| 42 | Restore a cancelled call; the reason stays on record | FieldCalls.tsx:1088-1099, 1134-1136 | calls.cancel; DB | partial: FRS-079 — permission only | |
| 43 | The same action list, in one order, in the row and at the top of an opened call | FieldCalls.tsx:1101-1155, 1339-1346 | per action | GAP | Low |
| 44 | Tick calls (header box takes only the listed rows) and allot them together to one engineer of my team; a partial move says how many moved | FieldCalls.tsx:571-591, 981-994, 1239-1253; supabase.ts:339-359 | calls.allot + team; DB update policy | URS-032, FRS-038, OQ-22 | |
| 45 | A note tells a manager without calls.allot where to get it | FieldCalls.tsx:588-591, 1227-1232 | none | GAP | Low |
| 46 | On a closed call, the signed Service Report is shown in the app with which visit filed it, or "no service report was filed" | FieldCalls.tsx:596-629, 1347-1371, 1453-1460 | none | GAP | Medium |
| 47 | Opened call lists: visit history (click for all fields; show report), spares requested (stage; refused and dropped hidden), spares consumed, customer feedback | CallAssociations.tsx:217-404 | DB read policies | partial: SR-013, URS-012 — history retrievable; this panel is not stated | A failed load shows "No visits reported yet" (no catch at line 234) |
| 48 | On a solved call, each part sent but not booked is flagged "Not consumed" or "Short n of m" | CallAssociations.tsx:265-299, 356-364 | none | partial: URS-047, FRS-055 — stated for the report view, not the call | |
| 49 | Supporting documents (manuals for the product and general ones, KB articles) on the call | CallAssociations.tsx:137-215, 307 | none | URS-029, FRS-035, OQ-21 | |
| 50 | Create, edit, re-open, close-again, cancel and restore are written to the audit log | FieldCalls.tsx:818, 842, 869, 876, 1027, 1050, 1081, 1094 | none | partial: URS-016, FRS-021 — generic | |

### Installation Calls (`/installations`) — `src/modules/FieldCalls.tsx` (INST_CONFIG)
Purpose: the same register component for installation calls. Everything in the Field Call Register section applies; only the differences are listed.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | All Field Call Register capabilities, scoped to installation calls | FieldCalls.tsx:431-442, 459-461 | mod:/installations | as the Field Call Register section | |
| 2 | + New Installation Call only for the Commercial function (and admin/Hotline by grant) | FieldCalls.tsx:441, 1198 | install.create; DB insert policy | URS-006, FRS-008, OQ-06 | |
| 3 | The customer may be typed as a new customer (free text), owners listed first | FieldCalls.tsx:517-518; callFields.tsx:173-190 | none | partial: CR-017, CR-018 — stated for the request form only | |
| 4 | Party pick alone (no machine) prefills the Party Master's serviceman | FieldCalls.tsx:279-283, 1379-1382 | none | GAP | Low |
| 5 | Warranty Start Date is captured on the installation visit | CallReporting.tsx:62, 231-234 | calls.report | URS-006, URS-070, FRS-082 | See Visit Entry #9 |

### Preventive (PM) (`/pm-calls`) — `src/modules/FieldCalls.tsx` (PM_CONFIG)
Purpose: the same register component for preventive-maintenance calls.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | All Field Call Register capabilities, scoped to PM calls | FieldCalls.tsx:444-454, 462-464 | mod:/pm-calls | as the Field Call Register section | |
| 2 | + New PM Call singly | FieldCalls.tsx:1198 | calls.create | partial: URS-005 — PM scheduled and recorded; single creation gate not stated | |
| 3 | PM calls dated to the 1st of their due month appear by that date | FieldCalls.tsx:449 | none | FRS-032 | Created by PM Bulk Upload |

### Pending Calls (`/pending-calls`) — `src/modules/PendingCalls.tsx`
Purpose: every call nobody has closed, across Field, Installation and PM, with re-allotment.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List open calls (Unattended, Unsolved, Report pending, Reopened) 2,000 at a time with Load more and "+" | PendingCalls.tsx:96-123, 178-188; supabase.ts:2347-2360 | mod:/pending-calls; DB via `pending_calls` | partial: FRS-007 — states; FRS-048 paging; the list itself is not a requirement | URS-014 names this module, but the screen shows no SLA due/breached flag |
| 2 | Status tiles with counts; a click filters to that status | PendingCalls.tsx:170-174, 211-223 | none | GAP | Medium. Counts are taken after the status filter, so the other tiles read 0 once one is picked |
| 3 | Type chips (Field / Installation / PM), matched by family not spelling | PendingCalls.tsx:28-37, 129, 287-291 | none | GAP | Low |
| 4 | Status picker | PendingCalls.tsx:292-293 | none | GAP | Low |
| 5 | Engineer chips with counts (lower bound), remembered | PendingCalls.tsx:119-122, 152-168, 225-234 | none | partial: URS-033 | |
| 6 | Search by UCN, party, city, product, serial, complaint, engineer | PendingCalls.tsx:125-136, 286 | none | GAP | Low. Loaded rows only |
| 7 | Visibility: my calls or my team's, stated in the header | PendingCalls.tsx:125-128, 189-201 | client scope + DB | URS-002, FRS-003 | |
| 8 | Group by Type, Engineer, Call Status | PendingCalls.tsx:265-270 | none | partial: FRS-039 — lists Region, Engineer, Call Status for calls; here Type replaces Region | |
| 9 | Tick calls and re-allot to one engineer of my team; partial moves reported | PendingCalls.tsx:73-84, 138-150, 250-264 | calls.allot + team; DB | URS-032, FRS-038, OQ-22 | |
| 10 | A note tells a manager without calls.allot where to get it | PendingCalls.tsx:236-241 | none | GAP | Low |
| 11 | Click a row to open that call in its own register for editing | PendingCalls.tsx:271-275 | register's own gates | GAP | Opens only if the call is among the register's loaded 800 |
| 12 | The empty text tells the truth: load failed, filtered, "everything is closed" only for a role that sees all, otherwise "nothing you can see" | PendingCalls.tsx:276-283 | none | GAP | Medium |
| 13 | A missing view is reported as needing migration 0012, other errors verbatim | PendingCalls.tsx:106-114 | none | GAP | Low |
| 14 | Export to CSV with a partial-load warning | PendingCalls.tsx:294-299 | export.data | partial: URS-013, FRS-018 | |
| 15 | Refresh; last sync time | PendingCalls.tsx:178-181 | none | GAP | Low |

### Visit Reports / Service Reports (`/reports`) — `src/modules/Reports.tsx` (+ `ReportDetail.tsx`)
Purpose: the visit history register, one row per visit, to browse, filter, open and export.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List visits by visit date newest first, 1,000 at a time, Load more, "+" | Reports.tsx:159-171, 215-225, 287, 303-305; supabase.ts:2770-2780 | mod:/reports; DB `reports_read` | URS-004, FRS-007; partial: FRS-048 | |
| 2 | Kept in this browser; reused if fresh, 30-minute background sync while unfiltered; "showing cached data" | Reports.tsx:106-111, 173-192 | none | GAP | Low |
| 3 | Live server filters: UCN, Call Number, Engineer, Status (contains) | Reports.tsx:194-213, 309-314 | DB | FRS-018 | |
| 4 | Every field an engineer filled can be turned on as a column | Reports.tsx:256-280 | none | GAP | Low |
| 5 | Service report cell: show it in the app, or open in Drive | Reports.tsx:230-254, 326-334 | none | GAP | Low |
| 6 | Open a visit to read all its fields (date-named fields formatted), with its report | Reports.tsx:302, 325; ReportDetail.tsx:40-124 | none | partial: URS-004 | |
| 7 | Export every column the loaded visits carry, including every form answer, to Excel (real dates and numbers, plus an About sheet stating scope) | Reports.tsx:47-92, 122-157, 316-321 | partial-load confirm only; no export.data check | partial: FRS-018 — says CSV export is blocked without export.data; the Excel path (`xlsxDownload`, xlsx.ts:211-215) does not check export.data | High. The export gate is bypassed on this screen |
| 8 | Export the same to CSV | Reports.tsx:136-140 | export.data | FRS-018, OQ-10 | |
| 9 | Refresh | Reports.tsx:284-287 | none | GAP | Low |

### Visit Entry (visit report form, opened from `/field-calls`, `/installations`, `/pm-calls`) — `src/modules/CallReporting.tsx`
Purpose: records one visit against a call, plus its spare consumption and, when solved, the customer's feedback.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Each save files a new visit; UCN, call number, call type and e-mail are filled by the app | CallReporting.tsx:579, 595-616; supabase.ts:2788-2793 | calls.report (button); DB `reports` insert policy | URS-004, FRS-007, SR-004 | |
| 2 | See the previous visits (last status, engineer, date) and open the last manual report | CallReporting.tsx:204-224, 336-342, 580-588, 836-840 | none | GAP | Low |
| 3 | Visit Entry Date stamped automatically | CallReporting.tsx:136-139, 622-626 | none | partial: SR-004 — entry date held separately | Client clock, stored as text in `data` |
| 4 | Visit date: not in the future and not before the complaint date (checked on save, not only in the picker) | CallReporting.tsx:140-158, 366-371, 627-640; visitdate.ts | client; DB 0115 (complaint date) | GAP | High. A future-dated visit closes the call |
| 5 | Visiting Service Engineer mandatory; a manager or admin may pick an engineer of their team, whose stock is then used | CallReporting.tsx:169-173, 372-376, 641-648 | team list | URS-034, FRS-040; partial: SR-023 | `engineer_email` stays the signed-in user |
| 6 | Call Status picked from three values; the form adapts | CallReporting.tsx:38, 175-177, 656-661 | none | FRS-007 | |
| 7 | Pending Reason: mandatory from the master when Unsolved; locked to "Report Pending" for a pending report | CallReporting.tsx:226-227, 378, 667-682 | none | GAP | Medium |
| 8 | Update Visit Work Details? Yes/No, forced Yes on a completed report; No skips the service report fields | CallReporting.tsx:183, 228-229, 379, 662-666 | none | GAP | Medium |
| 9 | Service report fields: complaint picked from master, observation, job done, hour meter, software version (required), maintenance done, filter changed (required), accessory serial from the party's CPX/ASU units | CallReporting.tsx:54-66, 236-249, 379-383, 484-575 | none | URS-004, SR-005, FRS-053; accessory serial — GAP | |
| 10 | Installation: Warranty Start Date? mandatory, a choice of Installation Call Solved Date or Invoice Date (no default), stored on the feedback and the installation warranty record; the machine's warranty now and after the report shown beneath it | CallReporting.tsx | none | URS-006, URS-070, URS-178, FRS-136.8, FRS-245, FRS-246 | Covered (Rev 3.2) |
| 11 | Manual report: upload a PDF or photo up to 10 MB to the call type's Drive folder (no pasting), show, open, replace or remove it | CallReporting.tsx:344-358, 487-531, 832-835 | CallReg bridge | GAP | Medium. Evidence file for the visit |
| 12 | Manual report mandatory for Solved - Report Completed | CallReporting.tsx:387-388 | none | GAP | Medium |
| 13 | Add Consumption? Yes or None Consumed; Yes needs at least one line; setting it back drops the lines | CallReporting.tsx:47-53, 251-255, 384-385 | none | URS-054, FRS-062, OQ-48 | |
| 14 | Pick spares only from the engineer's hand stock, narrowed to the call's product, its accessories and common parts, with "Show all parts" | CallReporting.tsx:185-202, 257-281, 697-713 | DB `handstock_balance` read | URS-024, FRS-030; narrowing — GAP | |
| 15 | Quantity limited to what is left in hand across the lines; a GRIR / traceability value per line; edit or remove lines before saving | CallReporting.tsx:283-334, 714-768 | client; DB cap trigger | URS-024, FRS-030, OQ-15; GRIR — partial: SR-015 (says lot is not recorded) | SR-015's status predates this field |
| 16 | The spare still in the picker is saved too; an invalid one stops the save with the reason | CallReporting.tsx:398-407 | none | FRS-062, OQ-48 | |
| 17 | Customer sign-off name, number, designation (optional, solved only) | CallReporting.tsx:68-70, 781-793 | none | GAP | Low |
| 18 | Customer feedback questions chosen by call type; ratings and yes/no mandatory on a solved call | CallReporting.tsx:77-104, 389-390, 795-821 | none | partial: URS-012, FRS-017 — capture per question; mandatory-on-solved not stated | |
| 19 | Save order: visit first, then spares in one insert, then feedback; a failure after the visit says what was saved, and Save retries only the rest | CallReporting.tsx:395-481 | DB | partial: FRS-062 — one statement for spares; that the visit can stand without its spares is not stated | High. A visit can exist with its consumption unrecorded if the user leaves |
| 20 | After the visit, the call's `status` is stamped; a failure is ignored | CallReporting.tsx:435-436 | DB | partial: FRS-007 — the trigger recomputes status | |
| 21 | A second completed visit on the same call cannot record feedback: one feedback per UCN (0186/0188), plain insert | CallReporting.tsx:457-472; supabase.ts:3983-3986 | DB unique `feedback_ucn_key` | GAP | Medium. A re-opened call solved again reports "feedback was not saved" |
| 22 | Visit, consumption failure and feedback failure are written to the audit log | CallReporting.tsx:450, 468, 474, 478 | none | partial: URS-016, FRS-021 | |
| 23 | Missing hand-stock view reported as needing migration 0023 | CallReporting.tsx:265-271 | none | GAP | Low |

### Bulk Report Mapping (`/report-mapping`) — `src/modules/ReportMapping.tsx` (+ `components/report/ConvertLoadedReports.tsx`)
Purpose: recovers visit reports from a superseded system and puts each on its call, and converts AppSheet references already loaded into Drive links.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Only an administrator, or a holder of calls.report, with the database connected | ReportMapping.tsx:48-61 | mod:/report-mapping (admin module) + isAdmin or calls.report | partial: FRS-077 — screen stated; gate not | |
| 2 | Step 0: survey visits already in the register whose report is an AppSheet reference, counted by six shapes; wording limited to "visits you can see" for a scoped reader | ConvertLoadedReports.tsx:54-90, 203-216, 225-227 | DB `reports_read` | NAR-003.12, NAR-003.13, NAR-003.19, OQ-69 | |
| 3 | Step 0: choose a pass size (1-2,000), resolve that pass's file names in Drive (optionally within one folder) | ConvertLoadedReports.tsx:65-72, 92-108, 176-199 | CallReg bridge | NAR-003.14, NAR-003.15 | |
| 4 | Step 0: convert resolved references after a confirm; the original goes into Source Ref; nothing else changes; unresolved rows keep their reference | ConvertLoadedReports.tsx:110-139 | DB update policy | NAR-003.16, NAR-003.17, NAR-003.18, OQ-69 | |
| 5 | Step 1: read a CSV whose columns are recognised by name; match each row to its call by UCN, else Call Number; read the calls' existing visits | ReportMapping.tsx:63-99, 265-276; reportMapping.ts:202-241 | DB | NAR-003.1, FRS-077, OQ-58 | |
| 6 | A row is held back and shown with its reason when unmatched, ambiguous, or has no id or visit date; a stable row id is derived from call + visit date | reportMapping.ts:212-239 | none | URS-065, FRS-077 | |
| 7 | Step 2: resolve attachment file names in Drive; a name matching none or several is left blank and named as a problem | ReportMapping.tsx:101-126, 278-301 | CallReg bridge | NAR-003.14, NAR-003.15, FRS-077 | Step 2 is not required before Write: rows with no link are skipped, not written |
| 8 | "Will do" per row: skip (report already there / nothing to attach), attach to the completed visit, or file a new visit | ReportMapping.tsx:189-197, 211-223; reportMapping.ts:300-325 | none | NAR-003.2-.10, OQ-67 | |
| 9 | Summary counts (rows, matched, unmatched, ambiguous, with a link, ready) and the measured skip reasons | ReportMapping.tsx:303-312, 334-347 | none | NAR-003.10, OQ-67 | |
| 10 | Show only rows with a problem | ReportMapping.tsx:199, 324-327 | none | GAP | Low |
| 11 | Step 3: after a confirm, attach links to existing completed visits first, then file new "Solved - Report Completed" visits; a stop says how many were done | ReportMapping.tsx:128-187 | DB `reports` policies | NAR-003.4, NAR-003.6-.8, NAR-003.11, FRS-077, OQ-58, OQ-67 | |
| 12 | Unknown columns are kept on the visit | ReportMapping.tsx:266-271; reportMapping.ts:206-210 | none | GAP | Low |

### PM Bulk Upload (`/pm-bulk-upload`) — `src/modules/PmBulkUpload.tsx` (+ `lib/pmImport.ts`)
Purpose: creates the monthly PM batch as PM calls from a CSV.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Administrators only (screen refuses others) | PmBulkUpload.tsx:58-65 | mod:/pm-bulk-upload + isAdmin | URS-005, FRS-009 | |
| 2 | Download a CSV template | PmBulkUpload.tsx:85-92, 126; pmImport.ts:121-126 | none | GAP | Low. Not routed through the export gate (a blank template) |
| 3 | Choose a CSV; headings matched by alias; rows with none of party, product or serial are dropped as blank | PmBulkUpload.tsx:67-83; pmImport.ts:70-112 | none | FRS-009, OQ-14 | |
| 4 | A row with a party or product but NO serial is still created as a PM call | pmImport.ts:112 | none | GAP | High. Contradicts FRS-061 / URS-053 (serial mandatory on PM calls) |
| 5 | Standard Complaint, Call Number and engineer are taken from the file as written, with no check against the masters | pmImport.ts:84-102; PmBulkUpload.tsx:144 | none | GAP | Medium. URS-045 requires controlled values to be chosen |
| 6 | Item status from the file normalised to WGP/OGP/CMC/AMC | pmImport.ts:92-97 | none | partial: URS-069 — vocabulary stated for the derived status, not for import | |
| 7 | Pick the due month (default this month; past months back-fill); every call is dated the 1st of it; today recorded as Added On | PmBulkUpload.tsx:28-30, 127-129, 141-145; pmImport.ts:76-77, 103-104 | none | URS-026, FRS-032, OQ-19 | |
| 8 | Registration date-time for the batch: first time and gap between calls, prefilled per month from the latest existing call and editable | PmBulkUpload.tsx:31-53, 132-140; pmImport.ts:114-117 | DB read pm_calls | partial: FRS-032 — sequencing stated; editable start/gap and the derived default not | |
| 9 | Unrecognised columns kept on the call | pmImport.ts:105-110 | none | GAP | Low |
| 10 | Preview of the first 8 calls, count, blank rows skipped | PmBulkUpload.tsx:107, 149-167 | none | FRS-009, OQ-14 | |
| 11 | Import in batches with progress; the database assigns UCN and Call Number; a stop says how many were created | PmBulkUpload.tsx:94-105, 169-180 | DB insert via `calls` | FRS-009, FRS-046, OQ-14 | |
| 12 | Re-importing the same file creates the calls a second time (insert-only, no key) | PmBulkUpload.tsx:97-100 | none | GAP | High. URS-062 asks for a natural key on every file-loaded register |
| 13 | Clear the loaded file | PmBulkUpload.tsx:173 | none | GAP | Low |

### Solved Without a Report (`/missing-visit-reports`) — `src/modules/SolvedWithoutReport.tsx`
Purpose: administrators' list of calls reading Solved whose visit record is incomplete, naming each gap.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List every such call (all pages), with the gaps: no visit, no visit date, no service report, entry date looks like an import stamp | SolvedWithoutReport.tsx:84-96; supabase.ts:2268-2275 | mod:/missing-visit-reports (admin module); DB call policies (security_invoker) | partial: URS-065 — names this module but states the review-before-write rule, not this list | Medium |
| 2 | Gap chips with exact counts (a call counts under each of its gaps); a click filters | SolvedWithoutReport.tsx:143-171, 195 | none | GAP | Medium |
| 3 | Search by UCN, call number, party, product, serial | SolvedWithoutReport.tsx:157-171, 188-190 | none | GAP | Low |
| 4 | "Every solved call has a dated visit and a report" when empty and loaded | SolvedWithoutReport.tsx:182-186 | none | GAP | Medium. For a scoped role this is a statement about visible calls only |
| 5 | A load failure names a missing migration or grant, or the error verbatim | SolvedWithoutReport.tsx:90-95 | none | GAP | Low |
| 6 | Export to Excel (with an About sheet explaining each gap and the scope) or CSV | SolvedWithoutReport.tsx:97-139, 199-204 | CSV: export.data; Excel: none | partial: URS-013 | High (Excel path ungated, as on /reports) |
| 7 | Each export written to the audit log with rows, scope and format | SolvedWithoutReport.tsx:138 | none | partial: URS-016, FRS-021 | |
| 8 | Refresh | SolvedWithoutReport.tsx:175-178 | none | GAP | Low |

### Customer Feedback (`/feedback`) — `src/modules/CustomerFeedback.tsx`
Purpose: the register of customer feedback, one column per question.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List feedback newest-loaded first, 1,000 at a time, Load more, "+" | CustomerFeedback.tsx:90-118, 164, 179-181; supabase.ts:3959-3968 | mod:/feedback; DB feedback read policy | URS-012, FRS-017, OQ-28 | |
| 2 | Each question answered is its own column | CustomerFeedback.tsx:126-132; supabase.ts:3962-3967 | none | URS-012, FRS-017, OQ-28 | |
| 3 | The Date column is the feedback's own entry date; "Loaded on" shows when the row was written | CustomerFeedback.tsx:26-50, 148-155 | none | GAP | Medium. Date of a complaint record |
| 4 | Filter Uploaded vs Entered here, with counts | CustomerFeedback.tsx:51-55, 69-72, 186-200 | none | partial: URS-037 — migrated data distinguishable is stated for stock/service figures | |
| 5 | On top of the database's rules, a scoped role sees only rows whose engineer name is in their team | CustomerFeedback.tsx:120-124 | client | partial: FRS-017 — "scoped like calls"; this extra filter hides visible rows that name no engineer or a differently spelled one | |
| 6 | Search across every column and the complaint | CustomerFeedback.tsx:134-139, 185 | none | GAP | Low |
| 7 | UCN coloured by its call's status | CustomerFeedback.tsx:44, 141-146 | none | GAP | Low |
| 8 | Browser cache, reused when fresh; 30-minute background sync of every loaded page | CustomerFeedback.tsx:20, 65, 79-84, 102-108 | none | GAP | Low |
| 9 | Export to CSV with a partial-load warning | CustomerFeedback.tsx:202-204 | export.data | partial: URS-013, FRS-018 | |
| 10 | Refresh | CustomerFeedback.tsx:161-164 | none | GAP | Low |

### Feedback Without a Report (`/feedback-without-report`) — `src/modules/FeedbackWithoutReport.tsx`
Purpose: administrators' list of feedback with no "Solved - Report Completed" visit behind it, naming which record is absent.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List every such feedback (all pages), with the finding and the latest visit's status | FeedbackWithoutReport.tsx:96-109; supabase.ts:2282-2289 | mod:/feedback-without-report (admin); DB (security_invoker) | URS-071, FRS-083, OQ-72 | |
| 2 | Finding chips with exact counts; a click filters | FeedbackWithoutReport.tsx:153-172, 196 | none | partial: FRS-083 — names the four findings; the filter is not stated | |
| 3 | Search by UCN, call number, party, product, serial, engineer | FeedbackWithoutReport.tsx:164-172, 189-191 | none | GAP | Low |
| 4 | "Every customer feedback has a completed report" when empty | FeedbackWithoutReport.tsx:183-187 | none | GAP | Medium (same scope caveat as Solved Without a Report) |
| 5 | A load failure names the bundle to run, or the error verbatim | FeedbackWithoutReport.tsx:102-107 | none | GAP | Low |
| 6 | Export to Excel (About sheet with findings and scope) or CSV; audit-logged | FeedbackWithoutReport.tsx:111-149, 201-208 | CSV: export.data; Excel: none | partial: URS-013, URS-016 | High (Excel path ungated) |
| 7 | Refresh | FeedbackWithoutReport.tsx:176-179 | none | GAP | Low |

### Indoor Service Register (`/indoor`) — `src/modules/IndoorService.tsx`
Purpose: the workshop register for equipment taken in (repair, rework, salvage, pre-delivery inspection, demo, other), from receipt to dispatch.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | List jobs newest first (at most 500), count stated as exact | IndoorService.tsx:105-113, 169-178; supabase.ts:5368-5376 | mod:/indoor; DB `indoor_read` | FRS-057, OQ-43 | Medium. Beyond 500 jobs the count and list silently truncate (countMore={false}) |
| 2 | Filter by status, activity and kind (chips with counts, remembered); show or hide dispatched, closed and condemned | IndoorService.tsx:124-137, 196-210 | none | GAP | Low |
| 3 | Banner: how many DEMO units are out past their expected return | IndoorService.tsx:130, 187-194 | none | GAP | Medium |
| 4 | Receive equipment: files a blank job (Customer property / Repair / Received) at once, with a database-issued job number, and opens it | IndoorService.tsx:146-153, 180-182; supabase.ts:5380-5391 | indoor.receive; DB `indoor_insert` | URS-049, FRS-057, OQ-43 | Condition on arrival is typed afterwards, not at receipt |
| 5 | Set kind (whose property) and activity independently | IndoorService.tsx:310-319 | indoor.work (screen); DB update policy | URS-049, FRS-057, OQ-43 | |
| 6 | Product, serial, customer, UCN (optional), tag, condition on arrival: each saved when the field loses focus | IndoorService.tsx:139-144, 320-349; supabase.ts:5393-5425 | indoor.work; DB | URS-049, FRS-057, SR-040, SR-042 | Medium. Saves on blur with no confirmation; free text with no product/party master check |
| 7 | Set the status freely from nine states | IndoorService.tsx:340-343 | indoor.work; DB triggers refuse Dispatched/Closed without QC etc. | partial: FRS-059 — refusals stated; free status setting not | |
| 8 | Received by and received at shown (stamped by the database) | IndoorService.tsx:350-352 | DB | OQ-43 | |
| 9 | Record cleaning against a work instruction and revision (default WI/SER/01); status becomes Cleaned | IndoorService.tsx:356-372; supabase.ts:5430-5439 | indoor.work | URS-050, FRS-058, OQ-44 | `cleaned_by` and `cleaned_at` are sent from the browser. 0158:439-441 only fills the time; the person is never stamped from the session |
| 10 | Salvage: tick Decontaminated, needed before any part is harvested | IndoorService.tsx:373-379, 478-483 | indoor.work; DB trigger | URS-050, FRS-058, OQ-44 | The tick is offered for Salvage only; URS-050 asks for a precondition wherever equipment is opened |
| 11 | Findings, work done, damage to the customer's property | IndoorService.tsx:383-392 | indoor.work | URS-049, SR-040 | Reported-to-customer fields (FRS-057) are not on screen |
| 12 | Rework: nonconformity reference, instruction and revision, authorised by, re-verified by and result, disposition, adverse-effect assessed plus note | IndoorService.tsx:395-426 | indoor.work | GAP | Medium. No URS/FRS covers §8.3.4 rework |
| 13 | Salvage: condemnation reason (only with the Condemn right), disposal method and reference, customer informed | IndoorService.tsx:428-455 | indoor.condemn (reason); DB trigger + CHECK | URS-052, FRS-060, OQ-46 | |
| 14 | Harvested parts: add a row (blank code, qty 1, Serviceable), which cannot be edited on screen; remove a row; not credited to hand stock | IndoorService.tsx:457-484 | indoor.work; DB `indoor_job_parts_write` FOR ALL | partial: URS-052, FRS-060 — recording stated; the part cannot be given a code or grade here, and a harvested-part record can be DELETED | High. Deleting a quality record (0158:523-543 grants DELETE) |
| 15 | Pre-delivery inspection: source reference, checklist and revision, firmware, result (Pass / with observation / Fail), held reason, accessories per packing list | IndoorService.tsx:488-512 | indoor.work | partial: SR-006, SR-043; FRS-059 (a failed PDI refused leaving) | |
| 16 | Demo: going to, requested by, expected/actual out and back, custodian, outcome, sale ref, condition out/back, consumables | IndoorService.tsx:514-548 | indoor.work | partial: URS-049 — register of company stock stated; loan fields and due date not | |
| 17 | Other: description required (database refuses without) | IndoorService.tsx:550-557 | indoor.work; DB | GAP | Low |
| 18 | Accessories: add, edit name/serial/tag on blur, tick returned, remove; outstanding count stated | IndoorService.tsx:559-590 | indoor.work; DB FOR ALL | URS-049, FRS-057, SR-042, OQ-43 | Removing deletes the row. Medium |
| 19 | Checks: parameter, expected, measured, verdict, instrument, calibration due; add and remove | IndoorService.tsx:592-629 | indoor.work; DB FOR ALL | partial: SR-043, SR-006, SR-020 — structure stated; a recorded check verdict can be DELETED | High |
| 20 | Quality check Pass/Fail and notes; Fail sends the job back to Under repair; signer and time shown | IndoorService.tsx:631-651 | indoor.qc; DB BEFORE UPDATE trigger | URS-051, FRS-059, OQ-45 | Fail→Under repair is not stated |
| 21 | Warning when the check was signed by the person who received the unit (not blocked) | IndoorService.tsx:294-298, 652-658 | none | FRS-059, SR-043 | |
| 22 | Dispatch reference; warning while accessories are outstanding (not blocking); dispatched by and at shown | IndoorService.tsx:661-676 | indoor.dispatch; DB trigger | partial: URS-051, FRS-059 | |
| 23 | Receiving a unit is written to the audit log; the later field saves are not logged by the screen | IndoorService.tsx:149 | none | partial: URS-016, FRS-021 | Every other change relies on the database trail |
| 24 | Not connected: says it reads live data only | IndoorService.tsx:155-165 | none | GAP | Low |
| 25 | A job opens as a centred window (Esc / × closes); Create Indoor DC on its DC page opens the DC form in a second pane with a draggable divider, remembered per device (2026-10-03) | IndoorService.tsx IndoorJobWindow | indoor.dispatch for the DC | FRS-239, OQ-229 | |
| 26 | Visiting Service Engineer of the drafted visit picked from the active User Master (default: the signed-in engineer); filed with that name and email at the DC's approval (2026-10-03) | CallReporting.tsx (Indoor mode); access.ts useActivePeople | indoor.work | FRS-237, OQ-228, OQ-229 | |
| 27 | Delete a job permanently with a reason and the typed job number; refused once on any Indoor DC or with its visit filed; audited (2026-10-03, 0324) | IndoorService.tsx DeleteJobAction; delete_indoor_job() | indoor.delete (no role by migration; admin passes) | URS-175, FRS-238, OQ-228, OQ-229 | |
| 28 | R/SER/07 register in the app's DataTable: column order, widths, wrap, picker; exact count (2026-10-03) | IndoorService.tsx registerColumns | export.data for Excel / Print | FRS-239, OQ-229 | |

---

### Gaps summary

Risk: High = could create, alter, lose or misattribute a quality or stock record, or wrongly expose data. Medium = wrong figure or decision support. Low = convenience.

- Request Registration — correcting a request uses free-text boxes for Standard Complaint, Product, Serial, Party and Call Type — the correction path must hold the same controls as the form (complaint chosen from the master, customer read off the machine, serial on the register) — High
- Request Registration — "Submitted by" e-mail is editable in a correction — a requirement that the raiser's identity is not correctable (it also drives `cr_read` visibility) — High
- Request Registration — fallback submit path can save call 1 and fail the rest — a request is saved whole or not at all — High
- Request Registration — Call Attended? mandatory; Attended Date required on Yes; planned date defaulting to today — state the rule, since the attended date later dates the call — Medium
- Request Registration — status chip counts are over loaded rows with no "+"; the register count's lower-bound "+" — counts over partly loaded data are marked as lower bounds — Medium
- Request Registration — client search over loaded rows only — state that search covers the whole register or says it does not — Low
- Request Registration — UCN coloured by call status — the fixed status colour code — Low
- Request Registration — export scope and partial-load warning — every register export states or warns its completeness — Medium
- Request Registration — read view of a request — Low
- Request Registration — up to five calls per request as a stated limit — Low
- Request Registration — fixed "INSTALLATION CALL" complaint on installation requests — Low
- Request Registration — installation document upload limits (size, folder, wait-for-upload) — Low
- Request Registration — Clear, Refresh and remembered sync time — Low
- Request Registration — which request actions are audit-logged — Medium
- Pending Registrations — mapping to a UCN not found after a confirm — a request may be mapped only to a call that exists — High
- Pending Registrations — map/cancel updates do not detect a zero-row RLS refusal — a disposition the database did not write is never reported as done — High
- Pending Registrations — after Register, the UCN back-fill to the request is best-effort and a failure is swallowed — a request becomes Registered in the same act that creates its call, or the failure is shown — High
- Pending Registrations — Edit call from the history pane is shown to every viewer, with no client lock by section right and no Solved/Cancelled check — state the rights and closed-call rule for every path that edits a call — High
- Pending Registrations — call dates derived from the request (attended, else logged, else today) — Medium
- Pending Registrations — engineer on the request wins over the machine's; Person Calling defaults to DIRECT ENGINEER — Medium
- Pending Registrations — Open Calls column (is there already an open call on this machine) — Medium
- Pending Registrations — machine history pane, mapping onto a closed call — Medium
- Pending Registrations — viewer-without-right banner — Low
- Pending Registrations — search, resizable panes, refresh — Low
- Field Call Register — failed or offline registration kept only in the browser under a locally made UCN; Sync pending re-registers with a new UCN; Discard deletes — a call is either written to the database or refused, and no provisional UCN is shown — High
- Field Call Register — Vigilance answers default to NO — the three vigilance answers must be actively answered at registration — High
- Field Call Register — Edit is offered only to holders of `calls.edit`, so a section-only right (e.g. contact) cannot be used on the register — the UI must honour each section right separately, as URS-067 states — High
- Field Call Register — Cancel call: reason mandatory, only Unattended/Unsolved, record retained; Restore keeps the reason — state the cancellation and restoration rules, not only the permission — High
- Field Call Register — Re-open asks no reason — a re-open records who, when and why — High
- Field Call Register — Solved call read-only for administrators too — reconcile FRS-007 ("non-admins") with the screen — Medium
- Field Call Register — Aging column (days open, stops at Solved/Cancelled) — Medium
- Field Call Register — engineer prefilled from the machine's Service Engineer, else the Party Master's serviceman — Medium
- Field Call Register — cover fields locked once filled from Product Database — Medium
- Field Call Register — Call Allocated To at registration offers every directory name, not the team — Medium
- Field Call Register — which fields are mandatory at registration (complaint date, party, product, complaint reported) — Medium
- Field Call Register — signed Service Report shown on a closed call — Medium
- Field Call Register — opened call's associated records (visits, spares, consumption, feedback), and a load failure reading "No visits reported yet" — Medium
- Field Call Register — shortfall flag on the call (parts sent, not booked) — Medium
- Field Call Register — UCN write-back to the pending request is fire-and-forget — High
- Field Call Register — export scope; exports ignore the table's Filters panel — Medium
- Field Call Register — audit logging of call actions (which actions) — Medium
- Field Call Register — engineer chip filter, open-only default, re-opened filter, Filters panel/column picker/layout memory, header indicators, colour code, sheet-path cache sync, arrival pre-search, action order, allot-right note, complaint text helper — Low
- Installation Calls — free-text new customer on the call form (CR-017/018 cover only the request) — Medium
- Installation Calls — party-only prefill of serviceman — Low
- Preventive (PM) — single PM creation gated by calls.create — Low
- Pending Calls — status tile counts computed after the status filter, so other tiles read 0 — tile counts reflect every other active filter but not their own — Medium
- Pending Calls — the empty-state rules ("everything is closed" only for a role that sees all) — Medium
- Pending Calls — no SLA due/breached flag although URS-014 names this module — Medium
- Pending Calls — list of open calls as a requirement (states, paging) — Medium
- Pending Calls — row click opens the register only if the call is loaded there — Low
- Pending Calls — group by Type rather than Region — Low
- Pending Calls — type chips, status picker, search, missing-view message, allot-right note, refresh — Low
- Visit Reports — Excel export does not check export.data (only CSV does) — every download path is gated by export.data — High
- Visit Reports — export of every column and form answer with an About sheet stating scope — Medium
- Visit Reports — browser cache and 30-minute background sync — Low
- Visit Reports — column picker, report viewer, refresh — Low
- Visit Entry — visit date not in the future and not before the complaint date — High
- Visit Entry — visit saved before its spares and feedback; the visit can stand without its consumption — a visit and its consumption are recorded together, or the gap is made visible — High
- Visit Entry — Pending Reason mandatory for Unsolved; fixed for Report Pending — Medium
- Visit Entry — Update Visit Work Details? = No skips the service report on non-completed statuses — Medium
- Visit Entry — Manual report is an upload (no pasted link), mandatory on Solved - Report Completed — Medium
- Visit Entry — customer feedback mandatory on a solved call — Medium
- Visit Entry — a second completed visit on a re-opened call cannot record feedback (one feedback per UCN) — Medium
- Visit Entry — Warranty Start Date defaults to today — Medium (closed Rev 3.2: a choice, no default)
- Visit Entry — hand-stock picker narrowed to the call's product — Low
- Visit Entry — GRIR/traceability per line exists, while SR-015 still reads "lot not recorded" — Medium
- Visit Entry — call status stamp after the visit is best-effort — Medium
- Visit Entry — prior-visit summary, auto Visit Entry Date (client clock), accessory serial picker, customer sign-off, missing-view message — Low
- Visit Entry — which visit events are audit-logged — Medium
- Bulk Report Mapping — screen gate (admin or calls.report) — Medium
- Bulk Report Mapping — show-only-problems filter; unknown columns kept on the visit — Low
- PM Bulk Upload — a PM call can be created with no serial — High
- PM Bulk Upload — re-importing a file duplicates every call (no key) — High
- PM Bulk Upload — Standard Complaint, Call Number and engineer accepted from the file unchecked against masters — Medium
- PM Bulk Upload — editable first registration time and gap, defaulted from the month's latest call — Medium
- PM Bulk Upload — template download, unknown columns kept, clear — Low
- Solved Without a Report — the list itself (what counts as a gap, including the import-stamp rule) — Medium
- Solved Without a Report — gap chips; "every solved call has…" empty message, true only for a role that sees all — Medium
- Solved Without a Report — Excel export ungated by export.data — High
- Solved Without a Report — search, load-failure message, refresh — Low
- Customer Feedback — Date column is the feedback's own entry date, not the load date — Medium
- Customer Feedback — client engineer-name filter on top of RLS can hide rows the database allows — Medium
- Customer Feedback — Uploaded vs Entered here filter — Medium
- Customer Feedback — search, UCN colour, cache and background sync, refresh — Low
- Feedback Without a Report — Excel export ungated by export.data — High
- Feedback Without a Report — empty message scope — Medium
- Feedback Without a Report — search, load-failure message, refresh — Low
- Indoor Service — harvested parts, accessories and checks (including a recorded verdict) can be deleted — quality records under a job are never deleted — High
- Indoor Service — list capped at 500 while the count claims to be exact — Medium
- Indoor Service — DEMO overdue banner — Medium
- Indoor Service — Rework fields (§8.3.4) with no URS/FRS — Medium
- Indoor Service — per-field save on blur with no confirmation, free-text product/customer — Medium
- Indoor Service — Receive files a blank job before anything is entered — Medium
- Indoor Service — `cleaned_by`/`cleaned_at` sent by the browser — cleaning attribution stamped by the database — High
- Indoor Service — harvested part cannot be given a code or grade on screen — Medium
- Indoor Service — QC Fail returns the job to Under repair; free status setting — Medium
- Indoor Service — accessory removal deletes the row — Medium
- Indoor Service — Demo loan fields and due date — Medium
- Indoor Service — only Receive is audit-logged — Medium
- Indoor Service — filters, Other description rule, not-connected message — Low

---

# Spares & Hand Stock

## Capability inventory — group 3: Spares and stock

Source read in full: `src/modules/SpareRequests.tsx`, `SpareRmApproval.tsx`, `SpareDispatch.tsx`, `StockOut.tsx`, `DeliveryChallan.tsx`, `Declaration.tsx`, `SpareConsumption.tsx`, `HandStock.tsx`, `HandStockReport.tsx`, `MaterialReturns.tsx`, `StockTransfer.tsx`, plus `src/lib/spareflow.ts`, `src/lib/spareapproval.ts` (form rules), `src/lib/sparedispatch.ts`, and the data calls in `src/lib/supabase.ts` that each action reaches. Requirement sources searched: `src/lib/validation.ts` (URS / FRS / TESTS / NAR), `docs/CALL_REQUEST_REQUIREMENTS.md`, `docs/ISO13485_SERVICING.md`, `docs/COVER_REQUIREMENTS.md`. None of the CR-xxx or CW-xxx requirements touches these screens. SR-015, SR-016 and SR-017 are the only SR-xxx that do.

Conventions:
- "Covered" means a requirement's text states the behaviour. Where only a test (OQ/PQ) states it, the test ID is given alongside the FRS it verifies.
- `supabase.ts` means `src/lib/supabase.ts`.
- **Shared behaviour on every register below:** the shared `DataTable` sorts, filters columns, reorders and resizes columns, and saves a per-user or per-role view keyed by `storageKey` (`src/components/table/DataTable.tsx:57,119,166,445,494`). Grouping is covered by URS-033 and FRS-039. The rest of that behaviour is not stated anywhere. It is listed once per screen as "Table view controls".
- **Shared behaviour on every CSV export:** the export is refused without `export.data` (`src/lib/format.tsx:141,158`), which FRS-018 covers. When the table is only partly loaded, a disclaimer pop-up appears first (`src/lib/exportscope.ts`, `format.tsx:160`). No requirement states that disclaimer.

---

### Spare Requests (`/spare-requests`) — `src/modules/SpareRequests.tsx`
Purpose: The register of every spare line (one row per part), where spare requests are raised and taken through RM, Commercial and NSM approval, a drop, and the engineer's acknowledgement of receipt. Dispatch itself happens on Pending Dispatch.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:161; rbac.ts:124,531 | `mod:/spare-requests` | GAP | No requirement names who may open the register. URS-007 names the workflow, not the screen. |
| 2 | "New Spare Request" button opens the raise drawer | SpareRequests.tsx:946 | `spare.request` | URS-007 | |
| 3 | A request reference (UID `WA-yyyymmdd-xxxx`) is created in the browser each time the drawer opens, and shown | SpareRequests.tsx:144-152, 227-232 | none | GAP | The identifier comes from the client, not the database. No requirement covers it. |
| 4 | Choose the request type: Call Based or HandStock | SpareRequests.tsx:60, 233-236 | none | partial: URS-007 — says "against a call" only; the HandStock type is not stated anywhere | |
| 5 | Choose the engineer the request is for: managers get their team, office desks get everyone, an engineer is fixed to themselves | SpareRequests.tsx:133-139, 237-245 | client team list (`useTeamEngineers`); DB refuses an out-of-team write (OQ-24) | URS-034, FRS-040, OQ-24 | |
| 6 | Engineer email, OR request date (today) and "OR No assigned on submit" shown read-only | SpareRequests.tsx:246-257 | none | partial: FRS-010 — says lines are created; that the database assigns the OR number and date is not stated | The OR No and date come from the database (supabase.ts:3371). |
| 7 | Pick the call by searching UCN, call number, party or serial (at least 3 characters, 350 ms debounce, top 25); the party, product, serial, complaint and item status are copied from it; "Change call" clears it | SpareRequests.tsx:369-428 | read policies on calls | partial: URS-007 — "against a call"; copying the call's identity onto the request is not stated | |
| 8 | When opened from a call, the call is fixed and shown read-only | SpareRequests.tsx:140-142, 264-268 | none | GAP | |
| 9 | Part picker offers only the call product's parts, its accessories and the common parts, with a "Show all parts" tick for the whole Part Master; a HandStock request always gets the whole list | SpareRequests.tsx:118-122, 164-170, 289-301 | none | GAP | The product-to-part mapping (partfit) is in no requirement. |
| 10 | A part must be chosen from the Part Master (type-to-search, no free text); the box is disabled with a reason when the master is empty or still loading | SpareRequests.tsx:302-340 | none | partial: URS-045 — covers controlled lists in general; not stated for the spare part | |
| 11 | Quantity per part: whole numbers, at least 1 (lower or blank values become 1) | SpareRequests.tsx:91, 178-179, 342 | none | GAP | |
| 12 | Add or remove spare rows, at most 20 per request | SpareRequests.tsx:58, 172-175, 343-348, 182 | none | GAP | |
| 13 | HandStock reason is required for a HandStock request | SpareRequests.tsx:275-283, 185 | none (client check) | GAP | |
| 14 | Additional remarks | SpareRequests.tsx:351-354 | none | GAP | |
| 15 | Submit rules: at least one spare, engineer required, a Call Based request needs a UCN; messages "Add at least one spare.", "A Call-Based request needs a call (UC Number).", "Enter the reason for the HandStock request." | SpareRequests.tsx:177-185 | none (client) | GAP | |
| 16 | Submit writes the header, then the lines with row numbers 1..n; if the lines fail, the header is deleted | SpareRequests.tsx:209; supabase.ts:3366-3389 | RLS insert on spare_requests / spare_request_lines | partial: FRS-010 — per-part lines are stated; the all-or-nothing behaviour (two statements plus a compensating delete) is not | This is not a single transaction. A failure between the two statements, or of the delete, leaves a header with no lines. |
| 17 | After saving: success banner naming the OR No and UID; register reloads; audit entry `spare.request` | SpareRequests.tsx:210-211, 1093-1096 | none | partial: URS-016 / FRS-021 — audit trail (client-written) | |
| 18 | "Connect the database" banner; Submit disabled when not connected | SpareRequests.tsx:218-222, 358 | none | GAP | |
| 19 | Register loads spare lines 1,000 at a time; "Load more" appends; the count shows "+" while more exist | SpareRequests.tsx:538, 642-654, 706-716, 942-945 | RLS (`0040_spare_read_scope`) | GAP | |
| 20 | Screen opens on cached data if synced in the last 30 minutes ("Showing cached data…"); refreshes in the background every 30 minutes; manual Refresh | SpareRequests.tsx:537, 671-677, 936 | none | GAP | Cached rows persist in the browser. |
| 21 | Read-only fallback to the 26_SpareRequest Google Sheet when the database is not connected | SpareRequests.tsx:655-669, 433-447 | none | GAP | |
| 22 | Rows limited by role on the server; while an admin previews "View as", only the previewed person's rows are shown | SpareRequests.tsx:680-703 | RLS; client filter for View-as | partial: URS-002, FRS-003 — role visibility; View-as preview filtering not stated | |
| 23 | Stage for each spare worked out from its approval columns: Rejected, Received, Dropped, Dispatched, RM Approval, Commercial, NSM, Stores. Only "Approved", "Auto-Approved" or "Cleared for Stores Processing" count as a yes | spareflow.ts:71-107 | none (the database computes `stage` too) | partial: FRS-010 — the chain order is stated; the whole-word approval rule and the Dropped / Rejected / Received states are not | A wrong reading here (finding 20) let "Not Approved" lines reach Stores. |
| 24 | Stage chips (All, "Needs my action", one per stage) with counts, "+" when partial; click to filter | SpareRequests.tsx:959-967, 862-866, 876-886 | none | GAP | |
| 25 | "Needs my action" = lines whose stage permission the reader holds; receipt only on the reader's own request; RM stage only for their team and never their own | spareflow.ts:155-173; SpareRequests.tsx:621-631 | `spare.approve_*`, `spare.receive`; mirrors `spare_rm_may_approve()` (0033) | partial: FRS-011 — manager scoping; the "own request only" rule for receipt is not stated | |
| 26 | Engineer facet chips, counted after the stage filter, choice remembered | SpareRequests.tsx:858-874, 970-979 | none | GAP | |
| 27 | Search across Spare ID, UID, OR, UCN, party, product, part, engineer, stage, status, DC | SpareRequests.tsx:888-897, 1038 | none | GAP | Searches loaded rows only. |
| 28 | Each UCN coloured by its call's status (looked up in one request; left plain if unknown) | SpareRequests.tsx:459, 899-904 | call read policies | GAP | |
| 29 | Group by Region (from the engineer), Engineer, Stage | SpareRequests.tsx:906-913, 993-997 | none | URS-033, FRS-039 | |
| 30 | Columns incl. "Sent" (all N / N of M / "N to confirm") and an "Approvals" column summarising the Commercial/NSM answers | SpareRequests.tsx:451-505, 915-923 | none | partial: URS-021 — the outstanding balance is visible; the Approvals summary is not stated | |
| 31 | Table view controls (sort, column filters, choose columns incl. all fields, reorder, resize, saved view) | SpareRequests.tsx:983-999 | none | GAP | Shared component. |
| 32 | Approve one spare at RM, Commercial or NSM (per line) | SpareRequests.tsx:837-840, 726-788; spareflow.ts:176-202 | `spare.approve_rm` / `_commercial` / `_nsm`; DB stage guard (0016); RM must be the manager (0033) | URS-007, FRS-010, FRS-011, OQ-07 | |
| 33 | RM approval of a non-AMC/OGP line marks Commercial and NSM "Auto-Approved" (no approver name); a HandStock line skips Commercial only and stops at NSM; the modal says so before approving | spareflow.ts:187-196; SpareRequests.tsx:1407-1415, 1281-1289 | DB `spare_needs_commercial` / `spare_needs_nsm` (0210) | GAP | The rules for when a stage is skipped are not in any requirement, including the HandStock-needs-NSM rule. |
| 34 | Reject one spare at its stage; a reason is required; stage and reason recorded | SpareRequests.tsx:840, 1521-1526, 1395; spareflow.ts:180-186 | stage permission; DB refuses a reject with no reason | partial: URS-008 / FRS-010 — actor and time; a required reason for rejection is not stated | |
| 35 | "⇉ all N": approve or acknowledge every line of the same OR at the same stage in one action (never at RM) | SpareRequests.tsx:807-813, 775-779; spareflow.ts:111-112; supabase.ts:3421-3427 | stage permission; DB stage guard | GAP | |
| 36 | Commercial approval form: Admin Status (Cleared / In progress). Cleared needs a Reason for Clearing. CMC, Warranty and AMC need an MC/SA number (starts MC or SA, no spaces). Direct PO needs all 4 PO steps answered. In progress needs a Pending Reason. Comments optional. "In progress" records why and leaves the spare in the queue | SpareRequests.tsx:1417-1477; spareapproval.ts:23-115 | `spare.approve_commercial` | GAP | A charging decision is recorded with no requirement behind it. The answer is kept in `approval_data`. |
| 37 | NSM approval form: Status (Cleared / Put on HOLD) required; reasons (multi-select) + Other; remarks; HOLD keeps it with NSM | SpareRequests.tsx:1479-1515; spareapproval.ts:131-164 | `spare.approve_nsm` | GAP | |
| 38 | Drop a spare (not sent) at RM, Commercial, NSM or Stores, with a required reason | SpareRequests.tsx:796-802, 1527-1532; spareflow.ts:218-221 | `spare.drop` | partial: FRS-012 — drop at any stage by Spare Coordinator / Hotline; a required reason is not stated | FRS-012 names roles; the screen checks the permission. |
| 39 | At Stores, "Dispatch…" opens Pending Dispatch filtered to that engineer (no dispatch from the register) | SpareRequests.tsx:814-827 | `spare.dispatch` | GAP | |
| 40 | Mark received (per line, or all lines of the OR at that stage) with optional receipt remarks; acknowledges every outstanding delivery on the line; the line becomes Received only when the whole quantity is confirmed | SpareRequests.tsx:828-835, 762-774, 1533-1538; supabase.ts:3649-3657 | `spare.receive` + own request (client); DB `receive_spare_shipments()` | URS-008, URS-022, FRS-027, OQ-18 | Screen restricts to the raiser (spareflow.ts:164,167). No requirement says only the raiser may acknowledge. |
| 41 | Terminal-state labels (✓ Received, 🚚 In transit, ✕ Rejected, ⊘ Dropped) where there is nothing to do | SpareRequests.tsx:803-806 | none | GAP | |
| 42 | Tick boxes (shown only to approvers) plus a bulk bar: Approve N / Reject N / Drop N / Clear | SpareRequests.tsx:561-562, 1000-1031 | any of `spare.approve_rm/_commercial/_nsm`; Drop needs `spare.drop` | GAP | |
| 43 | Bulk decision confirmation: names the decision and the count; reason required for reject or drop; each line decided at its own stage; lines the reader may not decide are skipped and counted ("N approved — M skipped (reason)") | SpareRequests.tsx:555-596, 1047-1087; supabase.ts:3514-3534 | DB `decide_spare_lines()` (0116) | GAP | This is a high-volume approval path. No FRS covers it. |
| 44 | Every decision writes an audit entry (`spare.approve/reject/drop/receive`, target, scope, count) | SpareRequests.tsx:577-582, 752-759 | none | partial: URS-016 / FRS-021 — client-written trail | |
| 45 | Row click opens the spare's detail drawer: the spare and its stage, an order tally ("1 at Stores · 2 at RM Approval"), OR date, raised by, request type, item status | SpareRequests.tsx:925-931, 1099-1106, 1113-1125, 1245-1275 | none | GAP | |
| 46 | "Entered in the system" date shown only when it differs from the OR date (import-day vs request-day) | SpareRequests.tsx:522-530, 1268-1272 | none | GAP | |
| 47 | Detail shows the rejected stage and reason, the call identity, the HandStock reason, remarks, and every spare on the order with its DC and date | SpareRequests.tsx:1290-1325 | none | GAP | |
| 48 | Approval trail: Raised (OR date, not upload date), RM, Commercial, NSM, Stores (DC and courier), Received, each with who, when and note; plus the Commercial/NSM form answers | SpareRequests.tsx:1327-1354; spareflow.ts:228-254 | none | partial: URS-008 — actor and time are recorded; the trail's display is not stated | |
| 49 | Change the engineer on the order (before any part is dispatched), with the target from the team list and a "Why" field; change log shown (from, to, by, date, reason) | SpareRequests.tsx:1144-1243 | `users.manage` (client); DB `reassign_spare_request()` + trigger (0100) | URS-035, FRS-041, OQ-23 | The screen does NOT require a reason (1218-1221). URS-035 says every change is retained "with … the reason". |
| 50 | After dispatch the name is locked, with an explanation pointing to a stock transfer | SpareRequests.tsx:1156-1162, 1203-1208 | same | URS-035, FRS-041 | |
| 51 | Arriving from My Workload opens with that stage filter already applied | SpareRequests.tsx:542-543 | none | GAP | |
| 52 | Export CSV of visible rows (partial disclaimer when more exist) | SpareRequests.tsx:1040-1042 | `export.data` | partial: FRS-018 — gate only; partial-file disclaimer not stated | |
| 53 | Status banners: Loading, "Synced N lines", "Load failed: <error>", dismissable | SpareRequests.tsx:638-651, 949-954 | none | GAP | |

### RM Approval (`/spare-rm-approval`) — `src/modules/SpareRmApproval.tsx`
Purpose: The Reporting Manager's queue of spare lines waiting for RM approval, for approving or rejecting in bulk.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:162; rbac.ts:125,532 | `mod:/spare-rm-approval` | GAP | No requirement names this screen. |
| 2 | Loads the whole RM queue in one go (paged, capped at 2,000); the count shows "+" if the cap is hit | SpareRmApproval.tsx:37-40, 94-139, 241-243; supabase.ts:3540-3545 | RLS via view `spare_pending_rm` | GAP | |
| 3 | Rows the reader may NOT approve (their own, or outside their tree) are still listed, marked "Not yours" with the rule on hover | SpareRmApproval.tsx:25-30, 222-228 | `spare_rm_may_approve()` (0033) per row | partial: FRS-011 — manager-only approval; showing others' rows greyed is not stated | |
| 4 | Those rows cannot be ticked (selection filtered to the reader's own) | SpareRmApproval.tsx:297-305 | client + DB | partial: FRS-011 | |
| 5 | "Select all N of mine" | SpareRmApproval.tsx:327-335 | `spare.approve_rm` | GAP | |
| 6 | Bulk Approve N / Reject N / Clear; confirmation dialog names the count; reason required to reject; skipped lines counted in the result | SpareRmApproval.tsx:161-189, 306-321, 341-372 | `spare.approve_rm`; DB `decide_spare_lines()` (0116) | partial: URS-007, FRS-010, FRS-011, OQ-07 — authority and scoping; the bulk path, required reason and skip reporting are not stated | |
| 7 | Audit entry per batch (`spare.approve/reject`, selected, decided, skipped) | SpareRmApproval.tsx:172-177 | none | partial: URS-016 / FRS-021 | |
| 8 | Columns: OR, engineer, part code + description, qty, UCN (coloured), call no, customer, product, serial, complaint, cover, request type, request date, remarks, HandStock reason, raised | SpareRmApproval.tsx:191-229, 157 | none | GAP | |
| 9 | "Waiting" days badge (≥7 red, ≥3 amber) | SpareRmApproval.tsx:70-73, 217-220 | none | GAP | |
| 10 | Search across OR, part, description, engineer, UCN, customer, product, serial, call number, complaint | SpareRmApproval.tsx:141-150, 325 | none | GAP | |
| 11 | Grouping by Engineer (default), OR, Cover | SpareRmApproval.tsx:286-291 | none | URS-033, FRS-039 | |
| 12 | Table view controls | SpareRmApproval.tsx:279-296 | none | GAP | Shared component. |
| 13 | Empty state tells apart: load failed / nothing matches search / "Every spare has had its first approval" (only for roles that see everything) / "Nothing … that you can see" | SpareRmApproval.tsx:266-277 | `seesEveryRecord()` | GAP | |
| 14 | Load error names migration 0116 when the view is missing, otherwise the error verbatim | SpareRmApproval.tsx:41, 133-137 | none | GAP | |
| 15 | Export CSV (capped-scope disclaimer at 2,000) | SpareRmApproval.tsx:250-254 | `export.data` | partial: FRS-018 | |
| 16 | Manual Refresh; "Database connected" status (no cache, no background sync) | SpareRmApproval.tsx:234-248 | none | GAP | |

### Pending Dispatch (`/spare-dispatch`) — `src/modules/SpareDispatch.tsx`
Purpose: The Stores queue of fully approved spares, grouped by engineer and booked out in batches. Each batch creates one stock out and one DC. There is also a Stock outs tab.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:163; rbac.ts:126,533 | `mod:/spare-dispatch` | partial: URS-008 (declared module) | |
| 2 | Queue of approved, not-yet-sent spares, read up to 2,000 lines; the count shows "+" at the cap | SpareDispatch.tsx:49-52, 93-121, 249-251; supabase.ts:3485-3492 | RLS via view `spare_pending_dispatch` (security_invoker) | partial: URS-008 — "Stores shall dispatch approved spares"; the queue itself is not stated | |
| 3 | Banner when the 2,000 cap is hit, naming the engineer where the read stopped and saying later engineers (A to Z) are missing | SpareDispatch.tsx:289-299 | none | GAP | |
| 4 | Grouped into one card per engineer, the longest-waiting engineer first; each card shows spares, units, ORs and "waiting N days" (≥14 red, ≥7 amber) | SpareDispatch.tsx:137, 374-410; sparedispatch.ts:73-111 | none | GAP | |
| 5 | Expand/collapse a card; Expand all / Collapse all; queues of 3 or fewer engineers open themselves the first time | SpareDispatch.tsx:74-78, 138-144, 272-273, 399-401 | none | GAP | |
| 6 | Search by engineer, OR, spare ID, part, UCN, call, party; pre-filled from `?engineer=` when arriving from Spare Requests | SpareDispatch.tsx:79-82, 130-135, 271 | none | GAP | |
| 7 | Tick single spares, or a whole engineer (ticking another engineer replaces the selection) | SpareDispatch.tsx:171-185, 392-398, 418 | none | GAP | |
| 8 | A batch must be one engineer; the bar says "A stock out goes to one engineer — the selection spans N." and Dispatch is disabled | SpareDispatch.tsx:146-149, 336, 350; sparedispatch.ts:117-122 | DB `dispatch_spare_lines()` enforces the same | GAP | The one-DC-one-engineer rule is not in any requirement. |
| 9 | Send fewer units than outstanding: quantity per line, clamped between 1 and the outstanding amount; "N of M sent" badge for lines already partly sent | SpareDispatch.tsx:151-158, 423-433, 441-445 | DB rejects issuing more than the remainder | URS-021, FRS-026, OQ-18 | URS-021 is filed under `/stock-out`, but this is the screen where it happens. |
| 10 | Mark a line "Refurbished" (issue the R-prefixed recycled part) | SpareDispatch.tsx:160-169, 434-440, 197 | DB checks the R-part exists and is active | URS-027, FRS-033, OQ-20 | |
| 11 | Action bar: count of spares and units, target engineer, Clear | SpareDispatch.tsx:330-339 | none | GAP | |
| 12 | Dispatch dialog: DC date (defaults to today, EDITABLE), courier / carried by, dispatch remarks; list of what goes | SpareDispatch.tsx:465-519 | `spare.dispatch` (button disabled without it: 348-353) | partial: FRS-012 — dispatch generates a DC and stock-out; the DC date, courier and remarks (and that the DC date may be back- or forward-dated) are not stated | |
| 13 | Book out: one database call creates the stock out and the DC number, stamps every line, all or nothing | SpareDispatch.tsx:187-217; supabase.ts:3494-3512 | `spare.dispatch`; DB `dispatch_spare_lines()` (0027) | URS-008, FRS-012, OQ-08 | The all-or-nothing behaviour is stated in code comments, not in FRS-012. |
| 14 | Dispatcher name stamped by the database from the session; the client value is thrown away | SpareDispatch.tsx:189-194 | DB trigger (0211) | partial: URS-008 — "recorded with actor"; session-stamping not stated | |
| 15 | The parts count as the engineer's hand stock the moment they are booked out (acknowledgement is only a confirmation) | SpareDispatch.tsx:41-45, 481-486, 212 | derived view | FRS-013, OQ-18 | |
| 16 | After booking: success message with the stock-out number, audit entry `spare.dispatch`, and a jump straight to the Delivery Challan | SpareDispatch.tsx:199-216 | none | partial: URS-016 / FRS-021 (audit); the jump to the DC is not stated | |
| 17 | Engineer notified in-app of the dispatch | (DB trigger; no screen code) | DB trigger | URS-015, FRS-020, OQ-12 | |
| 18 | Drop the selected spares (not sent, no DC) with a reason typed into a browser prompt | SpareDispatch.tsx:219-238, 340-347; supabase.ts:3659-3668 | `spare.drop` (client); DB stage guard | partial: FRS-012 | An EMPTY reason is not refused by the screen (`reason.trim()` may be ''). Whether the DB refuses it on this path is not shown here. |
| 19 | Honest empty message: "every approved spare has been booked out" only for roles that see everything; otherwise "Nothing … that you can see" | SpareDispatch.tsx:101-113, 301-307 | `seesEveryRecord()` | GAP | |
| 20 | Load error names migration 0027 if the view is missing, otherwise the error text | SpareDispatch.tsx:55, 114-119 | none | GAP | |
| 21 | Cached queue shown if synced in the last 30 minutes; background refresh every 30 minutes; manual Refresh | SpareDispatch.tsx:69, 122-128, 243 | none | GAP | |
| 22 | Export CSV of the queue (capped disclaimer) | SpareDispatch.tsx:275-286 | `export.data` | partial: FRS-018 | |
| 23 | Tabs: Queue (count) / Stock outs (the same list as the Stock Out page; see that section) | SpareDispatch.tsx:262-268 | none | see Stock Out | |

### Stock Out (`/stock-out`) — `src/modules/StockOut.tsx` (list component `StockOuts` in `src/modules/SpareDispatch.tsx:530-633`)
Purpose: A flat list of every spare Stores has issued, one row per part, with its DC, its call and the days taken to dispatch.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:164; rbac.ts:132,534 | `mod:/stock-out` (no action keys) | partial: URS-008, URS-021 (declared module) | |
| 2 | List of issued spare lines, newest first, read up to 5,000; the title count shows "+" when capped | SpareDispatch.tsx:537-563; StockOut.tsx:27-49; supabase.ts:2564-2579 | RLS on view `spare_stock_out_lines` | URS-028, FRS-034 | FRS-034 says the view lists every spare issued. |
| 3 | Columns: stock out, DC, date, engineer, part, qty, OR, call, party, courier, booked by | SpareDispatch.tsx:568-607 | none | partial: URS-008 — actor and time; the column set is not stated | |
| 4 | "Days to dispatch" from the last approval to the stock out, coloured (≥7 red, ≥3 amber, else green) | SpareDispatch.tsx:565-592 | none | URS-028, FRS-034 (colours not stated) | |
| 5 | "♻ Refurbished" badge on a recycled part | SpareDispatch.tsx:573-583 | none | FRS-033, OQ-20 | |
| 6 | Search by stock out, DC, engineer, part, OR, UCN, call, party; line count shown | SpareDispatch.tsx:556-561, 623-625 | none | GAP | |
| 7 | Print the Delivery Challan (🖨) or open the Declaration (📜) for a row | SpareDispatch.tsx:598-606; StockOut.tsx:60-61 | none (the target route has no module guard; see DC) | partial: FRS-012 — a DC is generated; reprinting from the list is not stated | |
| 8 | Export CSV (capped disclaimer at 5,000) | SpareDispatch.tsx:626-628 | `export.data` | partial: FRS-018 | |
| 9 | Empty and loading states: "Loading stock outs…", "No stock outs yet" | SpareDispatch.tsx:609-610 | none | GAP | Any load error other than a missing table is SWALLOWED (544-551): the screen then reads "No stock outs yet". A failed read looks exactly like an empty register. |
| 10 | Migration-hint banner when the stock-out tables are missing | StockOut.tsx:24-25, 51-59 | none | GAP | |
| 11 | Table view controls | SpareDispatch.tsx:612-620 | none | GAP | |

### Delivery Challan (`/dc/:stockOut`) — `src/modules/DeliveryChallan.tsx`
Purpose: The printable A4 Delivery Challan for one stock out.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open a challan by stock-out number (from Stock Out, Pending Dispatch, or straight after booking) | App.tsx:91-97; DeliveryChallan.tsx:29-52 | NO module key: the route sits outside the RBAC route guard; only RLS on `spare_dispatches` / lines | GAP | Any signed-in user can open the URL. RLS alone decides what is found. |
| 2 | Finds the stock out among the 500 most recent dispatches; otherwise "Stock out X was not found, or you cannot view it." | DeliveryChallan.tsx:42-44; supabase.ts:3703-3708 | RLS | GAP | An older stock out (beyond the latest 500) can never be reprinted. It reads as "not found". |
| 3 | Lines printed are the quantities sent on THIS stock out (partial dispatch), ordered by spare ID | supabase.ts:3711-3725 | RLS | partial: FRS-026, OQ-18 — "the stock out and delivery challan show one unit" | |
| 4 | Company letterhead (company mark, name, address, phone, email), "DELIVERY CHALLAN" title | DeliveryChallan.tsx:100-112 | none | GAP | |
| 5 | To (engineer), courier, Stock Out No., Stock Out Date, Ref No., Ref Date | DeliveryChallan.tsx:114-126 | none | partial: FRS-012 — a DC is generated; its content is not stated | |
| 6 | Grid: Sr.No, Order No., Item Code, Description, Qty; total on the last sheet; "Continued on sheet N" on the others | DeliveryChallan.tsx:128-162 | none | GAP | |
| 7 | Cut into A4 sheets of 20 rows, each with its own letterhead and signature block; "Sheet X of Y" | DeliveryChallan.tsx:11-22, 66, 82, 189-191; dc.ts:133-143 | none | GAP | |
| 8 | Remarks; GSTIN, CIN, PAN | DeliveryChallan.tsx:164-170 | none | GAP | |
| 9 | The printer's own saved signature goes in the company block ONLY when they booked this stock out; the customer block is always blank | DeliveryChallan.tsx:89-97, 171-187; signature.ts:48-54 | signature RLS (owner only) | URS-057, FRS-067, OQ-51 | |
| 10 | Print, Declaration and Back to dispatch buttons; the sheet count is shown | DeliveryChallan.tsx:69-80 | none | GAP | |
| 11 | Error page when the database is not connected or the read fails | DeliveryChallan.tsx:36, 47-49, 54-63 | none | GAP | |

### Declaration (`/declaration/:stockOut`) — `src/modules/Declaration.tsx`
Purpose: The printable "To whomsoever it may concern" declaration that travels with the parcel of one stock out.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open a declaration by stock-out number | App.tsx:91-97; Declaration.tsx:32-66 | NO module key (outside the route guard); RLS only | GAP | |
| 2 | Same 500-most-recent lookup as the DC; "not found, or you cannot view it" | Declaration.tsx:48-50 | RLS | GAP | Same blind spot as DC #2. |
| 3 | One line per PART (the same part on two lines is merged, quantities summed) | Declaration.tsx:52-55 | none | GAP | |
| 4 | "Before printing" panel (not printed): To*, Address*, City, State, Contact No, Approximate value (Rs.)*, Purpose, Sent by. Address pre-filled from the User Master; courier from the stock out | Declaration.tsx:56-61, 106-149; declaration.ts:81-87 | none | GAP | |
| 5 | "Still to fill in: …" warning for missing To / address / value | Declaration.tsx:92, 103 | none | GAP | Printing is NOT blocked when mandatory fields are missing. |
| 6 | "Save to the User Master as <engineer>'s address", offered when the address was edited; writes address, city, state and phone to the directory row | Declaration.tsx:70-80, 131-135; supabase.ts:3690-3700 | `spare.dispatch` (client); DB `user_directory_address_guard` (only these columns) | partial: URS-010 — master data maintained under control; editing the User Master from a print page is not stated | This changes master data from a document screen. |
| 7 | Printed sheet: company mark, form title, date, SO No, GST No, area code, the declaration text with purpose and value, the "no transaction" statement | Declaration.tsx:156-180 | none | GAP | |
| 8 | Grid: SNO, part number, description, qty; totals; 18 rows per sheet with the heading and sender block on every sheet; "Sheet X of Y" | Declaration.tsx:93, 182-228; declaration.ts:91 | none | GAP | |
| 9 | Recipient block (courier line, "TO,", name, address) and company sender block (no signature image) | Declaration.tsx:211-224 | none | GAP | |
| 10 | Buttons: Back to dispatch, Challan, Print | Declaration.tsx:98-104 | none | GAP | |
| 11 | Error page when not connected or the read fails | Declaration.tsx:44, 61-63, 82-89 | none | GAP | |

### Spare Consumption (`/spare-consumption`) — `src/modules/SpareConsumption.tsx`
Purpose: The register of spares consumed against calls. Office roles can also add reconciliation lines and adjust or void quantities here.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:165; rbac.ts:133,535 | `mod:/spare-consumption` | partial: URS-054 (declared module) | |
| 2 | Loads consumption lines 1,000 at a time, newest first; Load more | SpareConsumption.tsx:51, 231-245, 265-278, 377-379; supabase.ts:3944-3948 | RLS `cons_read` | GAP | The title count takes no "+" (`countMore` is not passed, 357-360). It reads as exact while more pages exist. |
| 3 | Cached data within 30 minutes; background refresh every 30 minutes; manual Refresh | SpareConsumption.tsx:50, 257-263, 358 | none | GAP | |
| 4 | Read-only fallback to the v2Consumption sheet when not connected | SpareConsumption.tsx:246-255 | none | GAP | |
| 5 | Extra client-side role filter by an engineer or email column, applied on top of RLS (unfiltered when `scope.all` or when no such column exists) | SpareConsumption.tsx:286-298 | client | partial: URS-002 / FRS-003 — role visibility; a second client filter over database rows is not stated | This can hide rows RLS allowed, or show everything when the column is absent. |
| 6 | Columns built from the data (first 9, preferred order), dates shown dd-MMM-yyyy | SpareConsumption.tsx:280-284, 306-317 | none | partial: URS-076 — one date form (declared for the cover screens only) | |
| 7 | "Source" shown as a Reconciliation badge vs Report | SpareConsumption.tsx:310-316 | none | partial: FRS-028 — flagged source = Reconciliation; its display is not stated | |
| 8 | Qty shows "Voided" for 0 and "was N" when adjusted, with who adjusted it on hover | SpareConsumption.tsx:330-342 | none | partial: FRS-029, OQ-17 — retained and marked voided; the "was N" display is not stated | |
| 9 | Search across all columns (loaded rows) | SpareConsumption.tsx:300-304, 383 | none | GAP | |
| 10 | "Add consumption" (reconciliation) drawer | SpareConsumption.tsx:384-388, 440-533 | `consumption.reconcile`; RLS `cons_write` demands it for source Reconciliation | URS-023, FRS-028, OQ-16 | |
| 11 | UCN required; tabbing out looks up the call and fills the call number, engineer and that engineer's hand stock; "No call found for X" | SpareConsumption.tsx:110-131, 449-458 | call read policies | FRS-028 | |
| 12 | Engineer (whose hand stock it comes off) is editable; reloads their stock on blur | SpareConsumption.tsx:460-471 | none | partial: FRS-028 — engineer mandatory; that the office may change the engineer from the call's is not stated | |
| 13 | Parts offered = only that engineer's hand stock, with "N in hand" on every row; quantity capped at what is left across all lines | SpareConsumption.tsx:91-98, 474-512 | DB trigger caps at balance | URS-024, FRS-028, FRS-030 | |
| 14 | GRIR / traceability (batch, goods receipt or serial) per line | SpareConsumption.tsx:77-79, 505-507 | none | partial: SR-015 — its status says batch/lot/serial is NOT recorded, yet this field exists (on reconciliation lines only) | SR-015 is out of step with the code. |
| 15 | Reason ("Why") required; rules: UCN, engineer, ≥1 part, reason, qty > 0, qty ≤ in hand, each with its own message; Save disabled while any fails | SpareConsumption.tsx:133-149, 515-527 | client + DB trigger | FRS-028, OQ-16 | |
| 16 | Saves one row per part as source "Reconciliation", with `recorded_by` from the signed-in user's name | SpareConsumption.tsx:151-171; supabase.ts:2531-2548 | `cons_write` | FRS-028 ("records who made it") | `recorded_by` is sent BY THE CLIENT. Whether the DB stamps it from the session is not visible here. |
| 17 | A reconciliation saves even when the call has no visit (the rule that a spare needs a visit does not apply) | SpareConsumption.tsx:443-446 (screen text); DB 0243 | DB exemption in `zz_consumption_needs_visit` | GAP | This is stated only in CLAUDE.md and 0243. |
| 18 | A permission refusal is reworded as "Your role cannot add a reconciliation line (needs consumption.reconcile)" | SpareConsumption.tsx:162-166 | none | GAP | |
| 19 | Errors are repeated inside the open drawer (not only under its overlay) | SpareConsumption.tsx:345-353, 428, 522 | none | GAP | |
| 20 | Arriving from a call's RECO action (`?ucn=&call=&engineer=`) opens the drawer pre-filled, then clears the query string | SpareConsumption.tsx:173-189 | `consumption.reconcile` | FRS-028, OQ-16 ("pre-filled from the call") | |
| 21 | Adjust a line's quantity (✎ per row): new qty from 0 up to current + in hand; reason required; 0 voids the line and returns the stock; only qty changes | SpareConsumption.tsx:191-229, 318-329, 397-438; supabase.ts:2553-2560 | `consumption.reconcile`; DB keeps original qty, author, reason; cap trigger | URS-023, FRS-029, FRS-030, OQ-17 | |
| 22 | Adjust refuses a line with no database id ("Refresh and try again"), a negative qty, or qty above the ceiling | SpareConsumption.tsx:213-220 | client | FRS-029 | |
| 23 | Consumption lines can never be deleted (void instead) | (no delete control; DB 0049) | DB | FRS-029, OQ-61 | |
| 24 | Export CSV (partial disclaimer) | SpareConsumption.tsx:390-392 | `export.data` | partial: FRS-018 | |
| 25 | Table view controls, all fields selectable | SpareConsumption.tsx:343, 369-380 | none | GAP | |
| 26 | Banners: Loading, "Synced N consumption lines", "Load failed/Load more failed: …" | SpareConsumption.tsx:233-243, 362-367 | none | GAP | |

### Hand Stock (`/handstock`) — `src/modules/HandStock.tsx`
Purpose: Each engineer's derived stock level per spare, with the terms that make it up and a ledger of the movements. Nothing is entered here.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:166; rbac.ts:134,536 | `mod:/handstock` | GAP | No requirement is declared for `/handstock`. URS-009 names hand stock but not the screen. |
| 2 | Stock Level: one line per engineer and spare with Opening, From history, Stock out, Consumed, Transfer in/out, Returned, Stock level, Last movement | HandStock.tsx:287-309 | RLS on `handstock_balance` (security_invoker) | URS-009, FRS-013, FRS-043 | |
| 3 | Levels are derived, never stored (stock out − consumed − transfer out + transfer in − returned, plus opening) | HandStock.tsx:23-43 | derived view | FRS-013 | |
| 4 | Shown only for oneself and one's team (RLS); View-as preview narrows it on the client | HandStock.tsx:127-142 | RLS; client for View-as | FRS-014, OQ-62 (View-as not stated) | |
| 5 | "History included / History ignored" switch: restates every column without the imported sheet-era record; explanatory banner; choice remembered in the browser | HandStock.tsx:113-126, 137, 366-390 | none | URS-037, FRS-043, OQ-30 (remembering the choice is not stated) | |
| 6 | Chips In hand (default), ⚠️ Short (negative), Settled (zero), All, each with a count ("+" if partial) | HandStock.tsx:145, 278-284, 360-364 | none | GAP | A "Short" (negative) balance is a normal filter state here. URS-024 says balances "cannot become negative", and FRS-044 accepts negative closing figures. The requirements do not agree with each other or with the screen. |
| 7 | Engineer dropdown listing every active engineer on the reader's team with their total in hand, plus anyone holding stock who is not in the directory | HandStock.tsx:175-177, 257-272, 415-420 | team list | GAP | |
| 8 | Search asks the DATABASE across the whole register (engineer, part, code; ≥2 characters, debounced); results replace the list; "searching the whole register — N matches" ("+" at 1,000) | HandStock.tsx:170-174, 226-244, 336 | RLS | GAP | |
| 9 | Pages of 1,000 with Load more (hidden while a search shows); the count shows "+" | HandStock.tsx:100-102, 153-169, 183-224, 319-325 | none | GAP | |
| 10 | Cached within 30 minutes; background refresh every 30 minutes; Refresh; "synced N ago" status | HandStock.tsx:246-252, 326-338 | none | GAP | |
| 11 | Group by Engineer, Spare, Stock level | HandStock.tsx:402-406 | none | URS-033, FRS-039 | |
| 12 | Row click opens a drawer: the components, the arithmetic line, an explanation of a negative level, and the movement trail (stock out / consumed / received / returned / handed over, with reference, date, UCN, party, remarks) | HandStock.tsx:434-446, 583-662 | RLS on `handstock_movements` | partial: FRS-013 — the derivation; the drill-down is not stated | The arithmetic line (616) OMITS the Opening term, so it does not add up for a line with an opening balance. The trail reads at most 500 movements with no indication of truncation (supabase.ts:3936-3942). |
| 13 | "Transfer this spare" (drawer, when level > 0) and header "Transfer stock" open Stock Transfer (nothing pre-filled) | HandStock.tsx:339, 443, 624-628 | `stock.transfer` | GAP | |
| 14 | Movements tab: the ledger newest first, 1,000 per page with Load more; engineer filter asked of the database; kind chips (Stock out, Consumption, Transfer in/out, Return) with counts; search; +/− coloured qty | HandStock.tsx:351-357, 452-575; supabase.ts:3917-3934 | RLS | GAP | |
| 15 | Export CSV of levels (search-scoped disclaimer when a search is showing) and of movements | HandStock.tsx:422-427, 567-569 | `export.data` | partial: FRS-018 | |
| 16 | Load error names migration 0023 if the views are missing, otherwise the error text | HandStock.tsx:46, 199-205, 490-494 | none | GAP | |
| 17 | Empty states: "Searching…", "Nothing in the whole register matches that.", "No lines match this filter.", "No hand stock yet" | HandStock.tsx:407-411 | none | GAP | |
| 18 | Arriving from My Workload's Short card opens with the Short filter | HandStock.tsx:146-147 | none | GAP | |
| 19 | Table view controls | HandStock.tsx:392-399 | none | GAP | |

### Hand Stock Report (`/handstock-report`) — `src/modules/HandStockReport.tsx`
Purpose: A complete, downloadable report of every visible engineer's hand stock. It loads in full before any download is allowed.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the report (admin by default; other roles by grant) | App.tsx:187; rbac.ts:169,564 | `mod:/handstock-report` (`admin: true`) | partial: URS-077 (declared module) — default access is not stated | |
| 2 | Auto-loads every page of 1,000 until a short page arrives, showing each page as it lands; "Loading every line — N so far" | HandStockReport.tsx:51-55, 99-131, 226-230 | RLS on `handstock_balance` | URS-077, FRS-091, OQ-79 | |
| 3 | Count shows "+" until complete; toolbar reads "N lines, complete" | HandStockReport.tsx:214-219, 243-247 | none | FRS-091, OQ-79 | |
| 4 | Download CSV / Excel (.xlsx) / Excel (.xls) disabled until the load is complete (and refused again at the writer) | HandStockReport.tsx:155-160, 201-205, 220-222 | `export.data` (central gate) | URS-077, FRS-091, OQ-79 | |
| 5 | File name HandStock_dd-MMM-yyyy_HHmmss; CSV dates as text, .xlsx numbers and dates typed; second "About" sheet with scope, rows and time taken | HandStockReport.tsx:160-197 | none | FRS-091, OQ-79 | The CSV carries no scope statement, even when a search filter is applied. |
| 6 | Export recorded in the audit trail (`report.handstock`) | HandStockReport.tsx:198 | none | FRS-091 | |
| 7 | Subtitle and file scope say "every engineer" or "your own stock, and your team's" | HandStockReport.tsx:97, 146-153, 210-213 | `seesEveryRecord()` | OQ-79 | |
| 8 | Search in the browser (engineer, email, part code, part) once loaded; the download is then of the SEARCHED rows | HandStockReport.tsx:135-144, 241 | none | partial: FRS-091 — the About sheet records the search filter; that a download may be a filtered subset is not stated | |
| 9 | A negative On Hand is shown inverted (black box) as a finding | HandStockReport.tsx:70-80 | none | GAP | |
| 10 | Refresh restarts the load; an earlier load still running cannot append its pages (run token) | HandStockReport.tsx:91-102, 107, 219 | none | GAP | |
| 11 | Empty result message by scope ("No engineer is holding any hand stock" / "…you, or anyone reporting to you") | HandStockReport.tsx:232-238 | none | GAP | |
| 12 | Load failure explained (missing views → run handstock.sql; grant; or the error verbatim) | HandStockReport.tsx:122-127 | none | GAP | |
| 13 | Table view controls | HandStockReport.tsx:250-256 | none | GAP | |

### Material Returns (`/mrn`) — `src/modules/MaterialReturns.tsx`
Purpose: The register of Material Return Notes (MRNs): spares an engineer sends back to Stores. Each return is recorded here and comes off their hand stock.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:167; rbac.ts:135,537 | `mod:/mrn` | GAP | No requirement is declared for `/mrn`. |
| 2 | Register of returned items (one row per item), newest MRN first, pages of 1,000 with Load more | MaterialReturns.tsx:45-59, 91-111, 120-128, 176-178; supabase.ts:3857-3868 | RLS (scoped to reporting tree) | partial: URS-009, FRS-014 — returns tracked and scoped; the register display is not stated | The page header shows no count at all. |
| 3 | Cached within 30 minutes; background refresh; Refresh | MaterialReturns.tsx:65, 112-118, 151-153 | none | GAP | |
| 4 | View-as preview narrows the list on the client | MaterialReturns.tsx:69-75 | client | GAP | |
| 5 | Search (MRN no, reference, engineer, spare, description, customer, report no, remarks) and an engineer filter (names from loaded rows only) | MaterialReturns.tsx:130-143, 182-184 | none | GAP | |
| 6 | Row click opens the MRN: MRN no, date, reference, engineer, total good / defective returned, each item with customer, report no and remarks | MaterialReturns.tsx:172, 200-249 | none | GAP | |
| 7 | "New MRN" button | MaterialReturns.tsx:157 | `stock.return` | URS-009 | |
| 8 | Engineer: fixed to oneself; editable free text (with a directory list) for anyone holding `users.manage`, `spare.dispatch` or `spare.approve_rm` | MaterialReturns.tsx:266-270, 287-295, 384-392 | client; DB policy decides | GAP | Who may record a return for someone else is not stated. The list offered is the whole directory, not the team. |
| 9 | MRN No required (typed from the paper slip, not generated); MRN date defaults to today and can be changed | MaterialReturns.tsx:393-400, 346 | none | GAP | Neither the uniqueness of the MRN number nor back-dating is stated. |
| 10 | Spares offered = only what that engineer holds (>0); a part already on another line is not offered again | MaterialReturns.tsx:297-307, 417-427 | DB guard (0039) | URS-009, FRS-013 | |
| 11 | Good and Defective quantities per line, capped TOGETHER at what is left once the other lines are counted; the typed value is clamped and the reason stated | MaterialReturns.tsx:309-337, 428-444 | DB guard | URS-009, FRS-013 | |
| 12 | Defective quantity recorded (no nonconformity record raised) | MaterialReturns.tsx:53, 436-443 | none | partial: SR-017 — status "Absent": a defective return creates no nonconforming-material record | |
| 13 | Submit rules: engineer, MRN no, ≥1 spare, each line ≥1 (good or defective), each line and each part total ≤ in hand, each with its own message | MaterialReturns.tsx:343-358 | client + DB | URS-009, FRS-013 | |
| 14 | "Not holding any stock" message with the hand-stock formula; Record return disabled | MaterialReturns.tsx:341, 409-415, 462 | none | GAP | |
| 15 | Remarks | MaterialReturns.tsx:455-458 | none | GAP | |
| 16 | Save writes the first item (which gets the reference from the DB), then the rest; if the rest fail, the whole MRN is deleted; the engineer's email is stored only when returning one's own stock | MaterialReturns.tsx:361-369; supabase.ts:3834-3856 | RLS insert; DB stock guard | partial: FRS-013 — the guard; the all-or-nothing behaviour (compensating delete) is not stated | This is not a transaction. |
| 17 | Success "Material return recorded — <ref>" and reload | MaterialReturns.tsx:197 | none | GAP | No audit entry is written for an MRN on this screen. |
| 18 | Load error names migration 0039 if missing | MaterialReturns.tsx:40, 104-110 | none | GAP | |
| 19 | Export CSV (partial disclaimer) | MaterialReturns.tsx:186-188 | `export.data` | partial: FRS-018 | |
| 20 | Table view controls | MaterialReturns.tsx:168-179 | none | GAP | |

### Stock Transfer (`/stock-transfer`) — `src/modules/StockTransfer.tsx`
Purpose: Record hand-overs of hand stock from one engineer to another, and list past transfers.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Open the screen | App.tsx:168; rbac.ts:136,538 | `mod:/stock-transfer` | GAP | No requirement is declared for `/stock-transfer`. |
| 2 | Register of transfer lines (transfer no, date, from, to, #, part, qty, remarks), latest 1,000 in ONE request | StockTransfer.tsx:208-217, 245-256; supabase.ts:3727-3736 | RLS (either side in scope) | partial: URS-009, FRS-014 | No Load more, and the title count carries no "+" at 1,000. Older transfers cannot be reached; only the export warns (capped). |
| 3 | View-as preview narrows to transfers where either side is in scope | StockTransfer.tsx:226-232 | client | GAP | |
| 4 | Search by transfer no, from, to, part, remarks | StockTransfer.tsx:270-275, 311 | none | GAP | |
| 5 | Cached-data message, then always reloads; background refresh; Refresh | StockTransfer.tsx:223, 258-267, 282-284 | none | GAP | |
| 6 | "New Transfer" button | StockTransfer.tsx:289 | `stock.transfer` | URS-009 | |
| 7 | From engineer (defaults to oneself) and To engineer: both FREE TEXT with a directory suggestion list, editable by anyone who can open the drawer | StockTransfer.tsx:47-48, 128-135, 141-143, 261-263 | client offers no restriction; DB policy not visible here | GAP | Nothing on screen stops an engineer transferring someone else's stock, or naming a "To" who is not in the directory. |
| 8 | Transfer date, default today, editable | StockTransfer.tsx:49, 136-139 | none | GAP | Back-dating is possible and not stated. |
| 9 | Parts offered = only what the From engineer holds (re-read when From changes); a part cannot be picked twice; quantity clamped to 1..held | StockTransfer.tsx:63-91, 160-181 | DB guard (0020) | URS-009, FRS-013, OQ-08 | |
| 10 | Submit rules: From and To required and different, ≥1 part, qty ≥1 and ≤ held; messages name the engineer and quantity | StockTransfer.tsx:95-107 | client + DB guard | URS-009, FRS-013, OQ-08 (From ≠ To not stated) | |
| 11 | "<From> is not holding any stock" message; Transfer disabled | StockTransfer.tsx:118, 153-158, 194 | none | GAP | The message says stock comes from a HandStock request "they have acknowledged receiving". That contradicts FRS-013, OQ-18 and Pending Dispatch, where stock counts from dispatch with no acknowledgement. |
| 12 | Remarks | StockTransfer.tsx:187-190 | none | GAP | |
| 13 | Save writes the header, then the lines; if the lines fail, the header is deleted (nothing moves) | StockTransfer.tsx:110-112; supabase.ts:3459-3478 | RLS insert; DB stock check | partial: FRS-013 — guard; not transactional | |
| 14 | Success "Stock transfer <uid> recorded." and reload | StockTransfer.tsx:323 | none | GAP | No audit entry is written for a transfer on this screen. |
| 15 | Export CSV (capped disclaimer at 1,000) | StockTransfer.tsx:313-315 | `export.data` | partial: FRS-018 | |
| 16 | Table view controls | StockTransfer.tsx:300-307 | none | GAP | |

---

### Gaps summary

Risk scale: High = could create, alter, lose or misattribute a quality or stock record, or wrongly expose data. Medium = wrong figure or decision support. Low = convenience.

### Spare Requests
- Spare Requests — who may open the register — must name the module key and its default holders — Low
- Spare Requests — client-created request UID — must say how the request reference is assigned and that it is unique — Medium
- Spare Requests — HandStock request type — must define HandStock requests (no call) alongside call-based ones — High
- Spare Requests — OR number and date assigned by the database — must say the database assigns them — Medium
- Spare Requests — call identity copied from the picked call — must say the request carries the call's party, product, serial, complaint and cover — Medium
- Spare Requests — call fixed when raised from a call — must say the call cannot be changed then — Low
- Spare Requests — part list narrowed to the product's parts, accessories and common parts ("Show all parts") — must state the narrowing and the override — Medium
- Spare Requests — part must be chosen from the Part Master, no free text — must state it for spare parts (URS-045 is generic) — Medium
- Spare Requests — quantity at least 1, whole numbers — must state the quantity rule — Low
- Spare Requests — at most 20 spares per request — must state the limit — Low
- Spare Requests — HandStock reason required — must state it — Medium
- Spare Requests — remarks field — must state it is optional free text — Low
- Spare Requests — submit validation messages — must list what makes a request incomplete — Medium
- Spare Requests — header and lines written in two statements with a compensating delete — must require a request to be saved whole or not at all — High
- Spare Requests — audit entry on raise — must require it (URS-016 is general; the trail is client-written) — Medium
- Spare Requests — not-connected banner, Submit disabled — must state offline behaviour — Low
- Spare Requests — paging 1,000 with "+" counts — must require counts to be marked as lower bounds — Medium
- Spare Requests — 30-minute cache and background sync — must state that cached data is shown and how stale it may be — Medium
- Spare Requests — Google Sheet fallback — must state the fallback, or it should be retired — Low
- Spare Requests — View-as preview filtering — must state that the preview shows only the previewed person's rows — High
- Spare Requests — stage derivation (whole-word approval; Dropped, Rejected and Received states) — must state what counts as approved and each terminal state — High
- Spare Requests — stage chips with counts — must state the stage counts — Medium
- Spare Requests — "Needs my action" rule (receipt only on own request) — must state that only the raiser acknowledges — High
- Spare Requests — engineer facet chips — Low
- Spare Requests — search — Low
- Spare Requests — UCN coloured by call status — must state the colour code and that an unknown state stays plain — Low
- Spare Requests — Approvals summary column — Low
- Spare Requests — table view controls — Low
- Spare Requests — auto-approval of Commercial and NSM for non-AMC/OGP lines, and HandStock needing NSM — must state when each middle stage is required or skipped, and that an auto-approval names no approver — High
- Spare Requests — reason required to reject — must state it — High
- Spare Requests — per-OR "all N" decision at later stages (never at RM) — must state it — High
- Spare Requests — Commercial approval form (status, clearing reason, MC/SA number format, Direct PO steps, pending reason; "in progress" holds the line) — must state the fields, rules and retention of the answer — High
- Spare Requests — NSM approval form (status, reasons, hold) — must state it — High
- Spare Requests — drop requires a reason; permission-based rather than role-named — FRS-012 should say reason required and name the permission — High
- Spare Requests — "Dispatch…" link to Pending Dispatch — Low
- Spare Requests — terminal-state labels — Low
- Spare Requests — bulk tick and approve/reject/drop across requests, confirmation, reason, skipped lines counted — must state the bulk decision path (0116) — High
- Spare Requests — audit on each decision — see raise — Medium
- Spare Requests — detail drawer (spare and its order tally) — Low
- Spare Requests — "Entered in the system" shown only when it differs — must say the trail uses the request date, not the upload date — Medium
- Spare Requests — detail shows reject reason, call and order lines — Low
- Spare Requests — approval trail display — must require the trail (who and when per stage) to be viewable — Medium
- Spare Requests — engineer change without a required reason — URS-035 requires the reason to be retained, but the screen lets it be blank; requirement and screen should agree — High
- Spare Requests — arriving filter from My Workload — Low
- Spare Requests — partial-export disclaimer — must require a partly-loaded export to be flagged — Medium
- Spare Requests — status banners — Low

### RM Approval
- RM Approval — who may open the queue — Low
- RM Approval — whole queue read, 2,000 cap with "+" — must state the queue and its completeness — Medium
- RM Approval — rows not the reader's shown as "Not yours" — must say ineligible rows are shown rather than hidden — Medium
- RM Approval — those rows cannot be ticked — must state it — Medium
- RM Approval — "Select all of mine" — Low
- RM Approval — bulk approve/reject with confirmation, required reason and skip count — must state the bulk RM path — High
- RM Approval — audit per batch — Medium
- RM Approval — column set (serial, complaint, cover, remarks, HandStock reason) — must say what an approver is shown — Medium
- RM Approval — waiting-days badge — Low
- RM Approval — search — Low
- RM Approval — table view controls — Low
- RM Approval — honest empty state by scope — must say an empty queue claims only what the reader may see — Medium
- RM Approval — migration hint on load failure — Low
- RM Approval — partial-export disclaimer — Medium
- RM Approval — no cache, manual refresh — Low

### Pending Dispatch
- Pending Dispatch — the Stores queue itself — must state the queue of approved, unsent lines — Medium
- Pending Dispatch — cap banner naming where the read stopped — Medium
- Pending Dispatch — grouping by engineer, oldest first, age colours — Medium
- Pending Dispatch — expand/collapse — Low
- Pending Dispatch — search and `?engineer=` pre-filter — Low
- Pending Dispatch — tick lines or a whole engineer — Low
- Pending Dispatch — one stock out and one DC per engineer — must state it — High
- Pending Dispatch — action bar totals — Low
- Pending Dispatch — DC date editable (back- or forward-dating), courier and remarks — must say who may set the DC date and within what bounds — High
- Pending Dispatch — booking out is all or nothing — FRS-012 should state it — High
- Pending Dispatch — dispatcher stamped from the session — must state it (URS-008 says only "actor") — High
- Pending Dispatch — success message, audit entry and jump to the DC — Low
- Pending Dispatch — drop via browser prompt accepts a blank reason — must state a reason is required on this path too — High
- Pending Dispatch — honest empty message by scope — Medium
- Pending Dispatch — migration hint on load failure — Low
- Pending Dispatch — cache and background sync — Medium
- Pending Dispatch — partial-export disclaimer — Medium
- Pending Dispatch — URS-021 and URS-022 filed against the wrong screens (partial issue happens here, receipt on Spare Requests) — the module declarations need correcting — Medium

### Stock Out
- Stock Out — column set — Low
- Stock Out — days-to-dispatch colours — Low
- Stock Out — search — Low
- Stock Out — reprint DC and Declaration from the list — must state it — Medium
- Stock Out — partial-export disclaimer — Medium
- Stock Out — a failed load is swallowed and shown as "No stock outs yet" — must require a failed read to be reported, not shown as empty — Medium
- Stock Out — migration banner — Low
- Stock Out — table view controls — Low

### Delivery Challan
- Delivery Challan — no module permission on the route (RLS only) — must say who may open or print a DC — High
- Delivery Challan — only the latest 500 stock outs can be found — must require any issued stock out to stay reprintable — High
- Delivery Challan — prints the quantity sent on this stock out — stated only in OQ-18; FRS should say it — Medium
- Delivery Challan — letterhead and company details — must state the controlled form content — Medium
- Delivery Challan — header fields (To, Stock Out No/Date, Ref) — must state them — Medium
- Delivery Challan — grid, totals and continuation — Medium
- Delivery Challan — A4 sheets with letterhead and signature on each — Medium
- Delivery Challan — remarks and statutory identifiers — Low
- Delivery Challan — Print, Declaration and Back buttons — Low
- Delivery Challan — error page — Low

### Declaration
- Declaration — no module permission on the route — must say who may open or print it — High
- Declaration — 500-most-recent lookup — must require any issued stock out to stay reprintable — High
- Declaration — lines merged per part — must state it — Medium
- Declaration — fill-in fields (To, address, value, purpose, sent by) and their pre-fill — must state the document's inputs — Medium
- Declaration — printing is not blocked while mandatory fields are empty — must say whether an incomplete declaration may be printed — Medium
- Declaration — "Save to the User Master" writes an engineer's address from a print page — must authorise this route for changing master data — High
- Declaration — printed content (title, GST, area code, declaration text) — Medium
- Declaration — 18-row sheets with repeated heading and sender block — Low
- Declaration — recipient and sender blocks — Low
- Declaration — toolbar buttons — Low
- Declaration — error page — Low

### Spare Consumption
- Spare Consumption — paging without "+" on the title count — must require lower-bound marking — Medium
- Spare Consumption — cache and background sync — Medium
- Spare Consumption — sheet fallback — Low
- Spare Consumption — extra client-side role filter on top of RLS — must say whether visibility is decided only by the database — High
- Spare Consumption — dynamic columns and date format — Low
- Spare Consumption — Reconciliation badge — Low
- Spare Consumption — "Voided" and "was N" display — must say an amended or voided line is visibly marked — Medium
- Spare Consumption — search — Low
- Spare Consumption — engineer on a reconciliation can be changed from the call's — must say who the stock may be taken off — High
- Spare Consumption — GRIR/traceability field exists on reconciliation lines while SR-015 says none is recorded — the requirement status should be reconciled with the code — Medium
- Spare Consumption — `recorded_by` supplied by the client — must require the author to come from the session (as URS-058 does for judgements) — High
- Spare Consumption — reconciliation exempt from the needs-a-visit rule (0243) — must state it — High
- Spare Consumption — permission-refusal message reworded — Low
- Spare Consumption — errors shown inside the drawer — Low
- Spare Consumption — partial-export disclaimer — Medium
- Spare Consumption — table view controls — Low
- Spare Consumption — status banners — Low

### Hand Stock
- Hand Stock — no requirement declared for the screen — URS-009 should declare `/handstock` — Low
- Hand Stock — View-as preview filtering — High
- Hand Stock — history switch remembered per browser — Low
- Hand Stock — "Short" (negative) balances shown as a normal state while URS-024 says balances cannot go negative (and FRS-044 allows negative closing figures) — the requirements need one consistent statement — Medium
- Hand Stock — engineer dropdown — Low
- Hand Stock — server-side search across the whole register — Medium
- Hand Stock — paging and "+" counts — Medium
- Hand Stock — cache and background sync — Medium
- Hand Stock — drill-down: arithmetic line omits Opening; trail silently capped at 500 — must say the drill-down reconciles and is complete — Medium
- Hand Stock — "Transfer this spare" and "Transfer stock" shortcuts — Low
- Hand Stock — Movements ledger tab (paging, kind chips, engineer filter) — must state the ledger view — Medium
- Hand Stock — partial and search-scoped export — Medium
- Hand Stock — migration hint — Low
- Hand Stock — empty states — Low
- Hand Stock — arriving filter — Low
- Hand Stock — table view controls — Low

### Hand Stock Report
- Hand Stock Report — default access (admin only) — Low
- Hand Stock Report — the download may be a searched subset, and the CSV carries no scope — Medium
- Hand Stock Report — negative On Hand highlighted — Low
- Hand Stock Report — Refresh cannot mix two loads (run token) — Medium
- Hand Stock Report — empty message by scope — Low
- Hand Stock Report — load-failure explanation — Low
- Hand Stock Report — table view controls — Low

### Material Returns
- Material Returns — no requirement declared for `/mrn` — Low
- Material Returns — register display and paging (no count at all) — Medium
- Material Returns — cache and background sync — Medium
- Material Returns — View-as filtering — High
- Material Returns — search and engineer filter — Low
- Material Returns — MRN detail view — Low
- Material Returns — returning on behalf of another engineer (users.manage, spare.dispatch or spare.approve_rm; whole directory offered) — must state who may record a return for whom — High
- Material Returns — MRN number typed from the slip (uniqueness?) and editable MRN date — must state the MRN identity and date rules — High
- Material Returns — defective quantity raises no nonconformity record (SR-017 "Absent") — High
- Material Returns — "not holding any stock" message — Low
- Material Returns — remarks — Low
- Material Returns — two-step save with a compensating delete — must require the MRN to be saved whole or not at all — High
- Material Returns — no audit entry written by the screen — must require one — Medium
- Material Returns — migration hint — Low
- Material Returns — partial-export disclaimer — Medium
- Material Returns — table view controls — Low

### Stock Transfer
- Stock Transfer — no requirement declared for `/stock-transfer` — Low
- Stock Transfer — only the latest 1,000 lines are readable, with no Load more and no "+" — must require the register to be complete or marked partial — Medium
- Stock Transfer — View-as filtering — High
- Stock Transfer — search — Low
- Stock Transfer — cache and background sync — Medium
- Stock Transfer — From is free text for anyone who can open the drawer, and To need not be a directory user — must state who may transfer whose stock and that the recipient must be a known engineer — High
- Stock Transfer — editable transfer date (back-dating) — High
- Stock Transfer — From ≠ To rule — Low
- Stock Transfer — "not holding any stock" text says stock comes from acknowledged receipt, contradicting FRS-013 — the text is wrong against the requirement — Medium
- Stock Transfer — remarks — Low
- Stock Transfer — two-step save with a compensating delete — High
- Stock Transfer — no audit entry written by the screen — Medium
- Stock Transfer — partial-export disclaimer — Medium
- Stock Transfer — table view controls — Low

---

# Masters, Cover & Knowledge

## Capability inventory — group 4: masters, cover, knowledge base, documents, training

Scope: 15 routes / 13 screen files, read in full, plus the components and `src/lib` helpers they call.
Requirement sources searched: `src/lib/validation.ts` (URS / FRS / NAR / TESTS), `docs/COVER_REQUIREMENTS.md` (CW), `docs/ISO13485_SERVICING.md` (SR), `docs/CALL_REQUEST_REQUIREMENTS.md` (CR — none apply to these screens).
Guard notation: `mod:/x` = the module key that opens the screen; `perm` = a client `can()` check; `DB:` = the row-level-security policy or database function that actually enforces it.
Common to every `⭳ Export CSV` below: `csvExport()` refuses without `export.data` (`src/lib/format.tsx:158`, flag set at `src/lib/auth.tsx:611-612`), asks for confirmation when the table has more rows than are loaded (`src/lib/exportscope.ts`), and writes dates as dd-MMM-yyyy (`format.tsx:161-167`). FRS-018 covers only the `export.data` gate. The partial-download warning and the date format are not stated for exports in general, so every export row is marked partial.

---

### Party Master (`/parties`) — `src/modules/PartyMaster.tsx`
Purpose: Lets you browse and maintain the customer (party) register, including its KYC status and the KYC evidence behind it.

| # | Capability (plain words a user would use) | Where (file:line) | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See the list of customers with Key, name, city, state, type, profile, address, pincode, Serviceman, phone, email, KYC status, KYC record links, GSTIN, PAN | PartyMaster.tsx:44-88, 373-385 | mod:/parties; DB: `parties` read open to any signed-in user (0008:171) | partial: URS-010 — URS-010 says only that master data is "maintained under control"; nothing states which fields are shown | KYC status and record links in the list are covered separately (#16) |
| 2 | The list opens straight from a copy saved on this device and refreshes itself when that copy is stale or empty ("Showing cached data — synced X ago") | 136-141, 286-294; src/lib/cache.ts:9-10 | none | partial: URS-078 — URS-078 is about the offline machine/customer copy used for searching (machinestore). This screen's browse cache (first 1,000–1,500 rows) is a different mechanism and no requirement states it | |
| 3 | Automatic re-sync every 30 minutes, but only while no filter is set | 302-306; cache.ts:43-49 | none | GAP | |
| 4 | ↻ Refresh button forces a re-read of the first page and re-caches it | 272-284, 358-360 | none | GAP | |
| 5 | Filter by party name, state, city and type. The filter runs on the server as you type (after 300 ms), and clearing it brings the cached list back | 309-328, 388-393; supabase.ts:1188-1197 | none | partial: FRS-048 — says only that "search is executed by the database" | |
| 6 | Load more (1,000 at a time); the count shows "+" while more rows exist | 330-340, 366, 381-383 | none | partial: FRS-048 (registers page) — the "+" lower-bound rule is not stated | |
| 7 | ⚙ Columns picker adds any other field on the row (system columns are hidden) | 350-354 | none | GAP | Low |
| 8 | ⭳ Export CSV of the curated columns | 400-402 | `export.data` | partial: FRS-018 — partial-data warning not stated | |
| 9 | Click a row to open the edit drawer (only for users who may edit) | 385, 491-601 | perm `masters.edit`; DB: `parties_write` has_perm('masters.edit') (0008:176, 0250) | URS-010, FRS-015, OQ-26 | |
| 10 | Edit type, profile, Serviceman, route, installation address and contacts, and billing address and contacts | 95-120, 499-511, 240-268 | masters.edit | partial: FRS-015 — says masters are editable; the field set and the rule "blank billing = same as installation" are not stated | |
| 11 | Party name cannot be edited (it would strand machines, calls and contracts) | 90-94, 495-497; supabase.ts:1052-1062 | UI only (the field is not sent) | GAP | The rule is enforced only because the client does not send the field. A holder of masters.edit can still rename a party through the API |
| 12 | Save sends only the editable fields, then re-reads that one row so derived values show | 243-266 | masters.edit | GAP | Low |
| 13 | Saving a party also refreshes this device's offline customer register | supabase.ts:1064-1069 | — | partial: URS-078 — the offline copy is required; refreshing it on edit is not stated | |
| 14 | KYC fields: GSTIN (15 chars; filling it also fills PAN), PAN, status Pending / Verified / Rejected (pick list), notes | 513-547; DB 0201:84-87 (CHECK), 114-165 (GSTIN/PAN derivation) | masters.edit | partial: FRS-086.4 (status recorded) — the GSTIN→PAN derivation and the three allowed statuses are not stated | |
| 15 | Marking Verified stamps who verified it and when, from the sign-in. Sending it back to Pending clears the stamp | 514-517, 548-552; DB 0201:167-176 (`parties_kyc_stamp`) | DB trigger | partial: URS-074 / FRS-086 — "whether verified" is required; the attribution stamp and its clearing are not stated | High-value ALCOA control with no requirement |
| 16 | "✓ KYC Verified" chip and a 📄 link per KYC record, shown in the table | 60-85, 127-131 | none | FRS-086.2, FRS-086.3, OQ-74 | |
| 17 | Attach a KYC record: upload to Drive into a folder "KYC - <party>" (size limit). It records name, link, who and when, and saves immediately so Cancel cannot lose it | 193-229; kyc.ts:69-76 | masters.edit (UI); DB parties_write | FRS-086.1, OQ-74 | "who" is a client-supplied name (`user.fullName`), not stamped by the database |
| 18 | Attaching the same file twice keeps one record | kyc.ts:69-76 | — | GAP | Low |
| 19 | Remove a KYC record (confirmation). The file stays in Drive | 231-238, 579-582 | masters.edit | FRS-086.7 | |
| 20 | "Marked Verified with no record attached" notice | 566-571 | none | FRS-086.6 | |
| 21 | ✎ Change engineer: rename one Serviceman spelling on every party that carries it, in one statement. The screen shows how many customers carry each spelling, flags spellings not in the User Master, lets you pick the target only from the User Master or choose "Leave nobody", and shows a count before you confirm | 155-189, 395-399, 407-489; supabase.ts:1094-1134 | perm masters.edit; DB parties_write | GAP | Bulk rewrite of a master field that decides who future calls are allotted to (`allocated_to` is matched by name). High |
| 22 | Messages: "Connect the database…", "Sync failed", "Search failed", "Load more failed", and an empty-list text | 146-148, 281-283, 322-324, 337-339, 384 | none | GAP | Low |

### Product Database (`/product-database`) — `src/modules/ProductMaster.tsx`
Purpose: Lets you search the install base (one row per machine) and start a Field or Installation call from a machine.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See the machines, newest entries first: product, serial, item code, party, city, state, status, warranty end, contract, contract end, engineer | ProductMaster.tsx:27-39; supabase.ts:1638-1641 | mod:/product-database; DB `products` read open (0008) | partial: URS-031 / FRS-037 — those describe Product & Party Search, not this register; URS-010 (master data) | |
| 2 | Searches answer from the copy of the machine register held on this device, and fall back to the server | supabase.ts:1616-1621 | none | URS-078 | |
| 3 | A line shows how many machines, customers and standard complaints are on this device and how old each copy is, with a "Download again" button. Administrators also see a duplicates count | components/machine/MachineRegisterNote.tsx:13-80; ProductMaster.tsx:194 | admin note: `manage-users` or `admin.view` | URS-078 (the copy states its age) | The duplicate note is not stated |
| 4 | Filter by party, product, serial, status (pick list), global search; Search button, Enter key, Clear | 202-212, 96-127 | none | partial: URS-031 — says only that you can find a machine by product and serial | |
| 5 | Status filter reads the derived cover status | 206-208; supabase.ts:1653-1660 | none | partial: URS-069 — derivation is required for 2.0; this screen's filter is not | |
| 6 | A timeout explains how to narrow the search and keeps the database's own words | 64-67, 115-122 | none | GAP | Low |
| 7 | Load more (1,000 per page); the count shows "+" until the end | 74-84, 129-142, 188-191 | none | partial: FRS-048 | |
| 8 | Unfiltered browse set cached on the device, with a 30-minute background sync while no filter is set | 72, 144-161 | none | GAP | |
| 9 | ↻ Refresh re-runs the search and forces a fresh download of the device copy | 182 | none | partial: URS-078 | |
| 10 | ⚙ Columns picker offers all 32 install-base columns | 51-59, 216 | none | GAP | Low |
| 11 | "+ Field" / "+ Install" per row opens the call form pre-filled from the machine | 163-174, 215 | perm `calls.create` (column only shown with it) | partial: URS-003 — registering a call is required; starting it pre-filled from a machine is not stated | The Install button is offered to anyone with calls.create; creating the installation is still gated by `install.create` on the Installation screen and in the database (FRS-008) |
| 12 | ⭳ Export CSV of all 32 columns | 229-237 | export.data | partial: FRS-018 | |
| 13 | The screen is read-only: machines are loaded through Bulk Uploads or follow from the cover registers and ownership transfer | whole file (no write path) | — | partial: URS-010 | |

### Product Database 2.0 (`/product-database-2`) — `src/modules/ProductDatabase2.tsx`
Purpose: One row per machine (model + serial), assembled from five registers. Each row names the register that decided the party, the warranty and the contract.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Load every machine (paged to the end, so the count is exact) | 87-107; supabase `listProductDatabaseV2` | mod:/product-database-2; DB: since 0221 any signed-in user may read `product_database_v2_mv` | URS-068, FRS-080, OQ-64, CW-002, CW-014 | |
| 2 | Columns: product, serial, party, derived status, warranty from/to, contract type/to, "Because", "Party from" | 37-49 | — | FRS-080, FRS-081, CW-016..018 | |
| 3 | Dates shown dd-MMM-yyyy | 35 | — | partial: URS-076 — URS-076 is filed only under the cover registers | |
| 4 | "Live as of <time>" stamp, or "A register has changed since … — updating within 5 minutes" | 73-81, 149-159 | — | GAP | FRS-080 and CW-019 describe a plain VIEW. It has been a materialised view with a scheduled rebuild since 0220/0223, and no requirement states the staleness window. Medium |
| 5 | ⟳ Rebuild from the registers | 108-116, 160-165; DB `refresh_product_database_2()` requires masters.edit, cover.edit or admin (0223:112) | perm masters.edit (UI) | GAP | The client offers the button only with masters.edit, while the database also accepts cover.edit |
| 6 | Search product, serial, party, contract or SA number (runs on the device) | 120-128, 174 | none | partial: URS-031 | |
| 7 | Status chips with exact counts, used as a filter | 130-139, 179 | none | partial: URS-069 — derived status is required; filtering by it is not | |
| 8 | ⭳ Export CSV of all 35 view columns, marked complete | 51-62, 185-191 | export.data | partial: FRS-018 | |
| 9 | Click a machine to open the whole record in a drawer: machine, whose it is and which register decided, warranty, contract, ownership transfer, which registers named it, machine key | 218-316 | none | FRS-080, CW-018 | |
| 10 | Drawer links open Machine History, the Warranty Register at the SA number, the Installation call at its UCN, the Contract Register at the MC number, and Ownership Transfer at the reference. A missing number shows as plain text, not a link | 229-235, 249-300; receivers CoverRegister.tsx:572-579, OwnershipTransfer.tsx:45-52 | none (the target screens have their own gates) | GAP | Low |
| 11 | Empty-list diagnosis: counts per register (rows / no serial / no model) and a verdict. It says "your slice too" when the reader is not an office role | 171, 351-435; dberror `emptyRegisterVerdict` | none | GAP | Decision support that stops a wrong "the registers are empty" conclusion. Medium |
| 12 | Load failure shows one of three answers plus the error verbatim | 99-106 | none | GAP | Low |
| 13 | Who may read the assembled record | 0221:36-62 | DB | partial: CW-020 — CW-020 reads "Met: readable only by those entitled to the underlying rows". 0221 grants the matview to every signed-in user, so warranty and contract detail that `warranty/contract` policies restrict to masters.view / cover.edit / admin is readable here by anyone who can open the screen. CW-020's status line is stale | Exposure change recorded in 0221 but not in the requirement |

### Product Master (`/product-master`) — `src/modules/ProductLines.tsx`
Purpose: Read-only catalogue of product lines (53 rows), showing whether each line is still sold.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See every product line: code, name, type, category, short form, "Still sold?", added on, added by | ProductLines.tsx:46-55, 74-90 | mod:/product-master; DB `pm_read` (0193:90) | partial: URS-010, URS-060 (declared on /product-master) — neither states the catalogue content | |
| 2 | Search code, name, type, category, short form | 63-72, 121 | none | GAP | Low |
| 3 | All / Active / Inactive chips with exact counts | 57-61, 122-132 | none | GAP | Low |
| 4 | Banner: an Inactive line takes no new Sale Entry, but still takes contracts, calls, visits, spares and feedback | 110-117; enforced on the sale form at CoverRegister.tsx:171-176, 1134-1142 | none | GAP | A business rule with no URS or FRS. It is enforced only on the form and free text is allowed, so it is advice rather than a control. Medium |
| 5 | ⭳ Export CSV | 134-140 | export.data | partial: FRS-018 | |
| 6 | Empty-state text pointing to Bulk Uploads → Product Master, and naming the permission needed | 145-150 | none | GAP | Low |
| 7 | Load error text | 51 | none | GAP | Low |
| 8 | No add, edit or retire on this screen (maintained by Bulk Uploads; DB `pm_write` = masters.edit, 0193:94) | whole file | — | partial: URS-010 | |

### User Master (`/user-master`; `/users` redirects here, App.tsx:190) — `src/modules/UserMasterView.tsx` (+ `src/components/people/PersonProfile.tsx`)
Purpose: The directory of every person, signed in or not. Here you set the role each person gets, manage logins, and keep profile, R&R and training records.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | See the whole directory (paged, ordered by name): name, designation, department, role, signed in?, emails, region, active, managers, contact, address | UserMasterView.tsx:151-168, 360-416; supabase.ts:2642-2649 | mod:/user-master; DB `ud_read` open to signed-in users (0008:183) | partial: URS-010 / FRS-015 | |
| 2 | Without a database, a read-only sheet browse with Search (first 300) | 160-164, 443-455, 587-605 | none | GAP | Low |
| 3 | Search name, email, region, designation, role | 457-461, 569 | none | GAP | Low |
| 4 | The role column shows "X (now Y)" where the sign-in carries a different role | 372-390 | none | partial: URS-002 / FRS-003 | |
| 5 | Banner counts users whose sign-in role differs from this list. "Apply this list's role" writes each to their sign-in, one at a time, with failures named and an audit entry per user | 478-501, 541-555 | users.manage; DB `profiles` write policy | GAP | Changes effective access in bulk. High |
| 6 | ✎ Edit turns the whole table into inputs; Save N changes writes each changed row separately (failures named, drafts kept); Enter saves; Esc cancels with a discard confirmation; changed rows show an "Edited" badge | 278-337, 417-440, 513-527 | perm users.manage; DB `ud_write` has_perm('users.manage') (0008:186) | partial: FRS-015 — says only that masters are editable | |
| 7 | A user must have a name ("it is what calls are allotted to") | 200-201, 299-300, 993 | UI | GAP | |
| 8 | Rename warning before saving: the save moves everyone who names the old name as manager (0257), and the work filed under it — calls, requests, spares, consumption, hand stock, Serviceman — to the new name (0259). Nothing moves if another row still has the old name | 172-195, 230-231, 301-302, 945 | users.manage; DB triggers 0257/0259 | GAP | A bulk rewrite of attribution across quality and stock records, with no URS/FRS. High |
| 9 | Saving a role applies it to the person's sign-in now, or on first sign-in | 212-223 | users.manage | partial: FRS-002 / FRS-003 — logins are created from User Master and roles map to permissions; flowing the directory role onto the profile is not stated | |
| 10 | Department picker, fed from the Department master list | 56, 364-370, 948-953 | users.manage | GAP | DEFECT: `persist()` (203-208) does not send `department`, so a Department chosen here is never saved. Training audiences (AudiencePicker) filter on it |
| 11 | + New User drawer. Optionally create a sign-in login, starting password default "123456789" (minimum 6 characters, valid email) | 142-147, 229-252, 612-638; supabase.ts:4016-4038 | users.manage | FRS-002, OQ-01 | A fixed default starting password is not stated or risk-assessed |
| 12 | ⧉ Clone: new login copying another user's role and extra permissions, optionally plus `data.view_all` ("can see all records") | 144-148, 238-241, 622-635, 720 | users.manage | GAP | Grants record visibility by copying. URS-063 covers copying ROLES, not users. High |
| 13 | 🔐 Access drawer: set role (written to User Master) and tick extra per-user permissions on top of the role | 656-664, 757-838 | users.manage; DB profiles policy | partial: URS-002 / FRS-003 — per-user extra permissions are not stated anywhere | High |
| 14 | 📊 Data drawer: everything this user entered (calls, spare requests, dispatches, approvals, reports, consumption; first 50 of each) | 840-890; supabase.ts:4061-4083 | button shown to users.manage; reads follow RLS | GAP | Matched by `ilike` on the NAME, so a short name can pull in other people's records. Low/Medium |
| 15 | 🔑 Reset password: generates a new one, shows it once with Copy, signs out every device, audits that it happened (not the password) | 339-358, 671-692, 721-726 | users.manage; DB `admin_reset_password` checks admin | GAP | Credential administration with no requirement. SOP-02 is a procedure only. High |
| 16 | 🔒 Disable / 🔓 Enable login; history kept | 267-276, 728-733, 736 | users.manage | FRS-002, OQ-01 | |
| 17 | 🗑 Delete a User Master row (confirmation; the login is kept) | 254-265, 734; supabase.ts:2670-2676 | users.manage; DB ud_write | GAP | The delete CASCADES to `user_profile` and `user_rr` (0264:61, 86), destroying R&R history, while `training_attendance` / `training_assignments` have no cascade, so the delete is refused for anyone with training. This contradicts FRS-093 "Nothing is deletable". High |
| 18 | Click a row to see the full record, with action buttons and the person's profile / R&R / training panel | 694-752 | view: mod:/user-master; actions: users.manage | URS-079, FRS-093 | |
| 19 | Profile details: Employee Code and Joining Date, edit and save. The Employee Code must be unique | PersonProfile.tsx:56-63, 138-162; training.ts:28-33; DB `up_insert`/`up_update` users.manage (0264:75-79) | users.manage | URS-079, FRS-093, OQ-81 | |
| 20 | Add a new R&R: upload to Drive or paste a link; From is required; To must not be before From. Saving closes the previous open period the day before (DB trigger) | PersonProfile.tsx:65-92, 164-201; 0264:103-117 | users.manage or training.manage (DB `rr_insert`) | URS-079, FRS-093, OQ-81 | |
| 21 | ✎ Period: change an R&R's From/To in place | PersonProfile.tsx:93-99, 211-228; training.ts:52-56 | users.manage or training.manage (DB `rr_update`) | partial: URS-079 — "a new one shall end the previous one without deleting it". Editing a recorded period in place leaves no history, and this is not stated | |
| 22 | "Training to do" list. The person themself can press "✓ Read & understood" (confirmation) | PersonProfile.tsx:101-106, 238-258; DB `acknowledge_training()` own row only | own record | URS-079, FRS-093, OQ-81 | |
| 23 | Past training grouped by document/topic: date, how, trainer, assessment and score, evidence links | PersonProfile.tsx:108-117, 260-285 | DB `may_see_person()` | URS-079, FRS-093 | |
| 24 | Manager / Regional Manager / Region fields suggest names already in the directory and accept a new typed name | 912-936, 969-971 | users.manage | partial: FRS-003 — the tree is "resolved from User Master"; free-typed manager names, which build that tree, are not constrained by any requirement | Medium |
| 25 | Active (validity) Yes/No on the directory row | 400-409, 962-967 | users.manage | partial: FRS-002 — FRS-002 describes the LOGIN's inactive flag, which is a different field from `validity` | |
| 26 | Role pickers offer every role the database holds, not only the built-in ones | 47-52, 762-764 | — | FRS-065 | |
| 27 | Client audit entries for add, edit, delete, create, clone, reset password, role apply and access save | 209, 241, 261, 272, 354, 493, 794 | — | partial: URS-016 / FRS-021 — a client-written trail (FRS-021 states its limits) | |
| 28 | ⭳ Export CSV | 578-582, 600-602 | export.data | partial: FRS-018 | |

### Part Master (`/parts`) — `src/modules/PartMaster.tsx` (+ `ProductAccessories.tsx`)
Purpose: The spare-parts catalogue (ITEM Master). Here you add, edit, rename, retire and map parts to products, and map each main product to its accessories.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Loads the whole catalogue on every open (paged to the end), shows the stored copy first, and caches it | PartMaster.tsx:93-123; supabase.ts:3349-3363 | mod:/parts; DB `parts` read open | partial: URS-010 | |
| 2 | 30-minute background reload | 133-137 | none | GAP | Low |
| 3 | Global search: every typed word must appear somewhere in the part, including Item Master fields kept in `extra` | 139-173, 470-471 | none | GAP | Low |
| 4 | Filters: part code, description, product (Common / ⚠ Unrecognised / a name), active only / inactive only | 158-173, 472-485 | none | GAP | Low |
| 5 | Product column reads "Common (all products)" when blank, and flags names the Product Database lacks with ⚠ in red | 415-429 | none | GAP | Decides which spares a call offers (partfit). Medium |
| 6 | ⚙ Columns picker | 175-179 | none | GAP | Low |
| 7 | ⭳ Export CSV | 488-490 | export.data | partial: FRS-018 | |
| 8 | ＋ Add part. The code is normalised to upper case, may not contain "|", and must match the pattern. Description is required. Spare/Consumable is required. Product(s) or "Common to all products" is required. Purchase cost is an optional number. A duplicate code is refused. A "Will be listed as CODE\|Description" preview is shown | 186-221, 393, 495-570; supabase.ts:3257-3271 | perm masters.edit; DB `parts_write` masters.edit | partial: URS-010 / FRS-015 — none of the validation rules are stated | |
| 9 | ✎ Edit a part's category, products and purchase cost. A blank cost is saved as "not recorded", not 0. A category the file brought is kept even if it is not one of the four | 223-317, 572-692 | masters.edit | partial: FRS-015 | |
| 10 | Rename a part (code or description). The drawer shows first how many records in which tables will move, then renames the part and all nine carrying tables in one transaction | 262-304, 600-619, 684-687; supabase.ts:3295-3320; DB `rename_part()` (0196) checks masters.edit | masters.edit | partial: URS-060 — rename behaviour appears only in the defect log (D-007/D-008), not as a URS or FRS | Moves the identity of stock records. High |
| 11 | ⊘ Deactivate / ↩ Reactivate a part (confirmation). Parts are never deleted | 181-184, 373-382, 409-412 | masters.edit | FRS-015, OQ-26; URS-027 (only active parts may be issued as refurbished) | |
| 12 | Bulk: tick parts → set / add / remove products (10 at a time, failures named, confirmation) | 319-347, 430-448 | masters.edit | GAP | Medium |
| 13 | Bulk: tick parts → set Spare / Consumable | 349-371, 449-455 | masters.edit | GAP | Feeds Spare Insights categories. Medium |
| 14 | After a reload, clears this device's cached spare picker list so new or remapped parts appear | 105-106 | — | GAP | Low |
| 15 | Without a database, lists the sheet "spare" master read-only | 57-68, 102 | none | GAP | Low |
| 16 | Main product → Accessories panel (collapsible). Main products come from Product Master lines not categorised ACCESSORY; accessories from the ACCESSORY lines. Choosing a main product loads its list; save; ✎ edit; 🗑 delete (confirmation); optional note | ProductAccessories.tsx:26-128; supabase.ts:5931-5942 | perm masters.edit; DB `pa_insert`/`pa_update`/`pa_delete` masters.edit (0255:56-64) | GAP | Changes which parts the Spare Request and consumption pickers offer on a call. Hard delete. Medium |

### All Masters (`/masters`) and one list (`/masters/:key`) — `src/modules/AllMasters.tsx`, `MasterListPage.tsx`, `MasterListTable.tsx`, `masterLists.ts`
Purpose: Overview of every master with counts. Each value list (Call Type, Standard Complaint, reasons, Department, and so on) can be maintained here.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Summary table: the four registers (party, product, part, user) with a row count each, and every value list with its entry count, status (Loaded / Empty / Error) and "Used by" | AllMasters.tsx:36-41, 79-141, 172-195 | mod:/masters | partial: URS-010 | |
| 2 | KPI cards per register, plus "Value lists" total entries | 213-220 | none | GAP | Low |
| 3 | Lists come from the `master_lists` registry. Without it, the built-in list is used and a message says to run masters.sql | 102-117, 135-137; masterLists.ts:13-45 | none | GAP | Low |
| 4 | ↻ Refresh all (clears every dropdown cache first); cached counts on open; 30-minute background sync | 79-84, 143-151, 204 | none | GAP | Low |
| 5 | Open a register's own screen, or open a value list inline (Edit list / View list), or "↗ Open its own screen" (/masters/<key>) | 179-195, 229, 243-252 | none (target gates apply) | GAP | Low |
| 6 | ⭳ Export CSV of the summary | 234-238 | export.data | partial: FRS-018 | |
| 7 | /masters/<key>: an unknown key returns to /masters; the label and columns come from the registry or the built-in definition | MasterListPage.tsx:14-37 | mod:/masters/<key> | GAP | Low |
| 8 | See a list's entries: value, extra columns, Added On, Added By, Active | MasterListTable.tsx:49-61, 177-238 | read open | URS-010, FRS-015 | |
| 9 | + Add an entry, with any extra columns. A duplicate is refused ("already in this list"). Added-on is today; Added-by is the user's name | MasterListTable.tsx:74-85, 256-278; supabase.ts:3197-3203 | perm `master.<list>.edit` (or masters.edit); DB 0067/0121 policies | FRS-015, OQ-26 | `added_by` is client-supplied text, not stamped |
| 10 | ⊘ Deactivate / ↩ Reactivate an entry (confirmation: stays on records, stops being offered) | 87-97, 216-226; supabase.ts:3217-3220 | master.<list>.edit | FRS-015, OQ-26 | |
| 11 | 🗑 Delete an entry (confirmation) | 99-105, 227-235; supabase.ts:3210-3213 | perm `master.<list>.delete`; DB policy | partial: FRS-015 / OQ-26 — FRS-015 says "a value already in use is deactivated, not deleted" and OQ-26 expects that. The screen performs a hard DELETE with no in-use check, and nothing in the database refuses it | The requirement states a control the code does not have. Medium |
| 12 | Standard Complaint only: map each complaint to products (multi-select; empty = all products), edit inline ✎, other `extra` keys kept | 39-47, 107-128, 184-204 | master.complaint.edit | GAP | Decides which complaints the call forms offer per product (a controlled-vocabulary scope, URS-045 adjacent). Medium |
| 13 | Standard Complaint filters: complaint name, and product (a product, or "All products (no mapping)") | 130-144, 316-324 | none | GAP | Low |
| 14 | Standard Complaint bulk: tick complaints → set / add / remove products (10 at a time, failures named) | 146-175, 293-312 | master.complaint.edit | GAP | Medium |
| 15 | Search within the list; ↻ Refresh clears that list's dropdown cache so forms pick up changes without a reload | 67-72, 315, 325 | none | GAP | Low |
| 16 | ⭳ Export CSV of the list (Standard Complaint export includes Key and Products for re-upload), capped at 5,000 | 328-338 | export.data | partial: FRS-018 | |
| 17 | Without edit rights, a message names the permission needed; a "Used by" note explains that removing only takes a value out of the dropdown | 250-254, 279-283 | — | GAP | Low |

### Warranty Register (`/warranties`) and Contract Register (`/contracts`) — `src/modules/CoverRegister.tsx` (+ `src/lib/cover.ts`, `src/lib/coverspec.ts`)
Purpose: Sale Entries (warranty) and Contract Entries with the machines under each. Machines inherit their entry's terms unless pinned. From here you raise installation calls and renew contracts.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Two tabs: Entries (the deals) and Register (one row per machine; formerly By machine) | CoverRegister.tsx:53, 1267-1270 | mod:/warranties, mod:/contracts; DB read: masters.view or cover.edit or admin (0036:561, 0236) | FRS-016, URS-011 | |
| 2 | Entries list, newest first, with machine count and State (Active / About to expire / Inactive) from the end date | 994-1004, 1319-1327; cover.ts:238-257; coverspec.ts:205-214 | read policy | partial: FRS-016 — the state rule and its "about to expire" threshold are not stated | |
| 3 | By-machine list with resolved cover and a "N pinned" / "follows entry" column | 1006-1018; cover.ts:284-299 | read policy | FRS-016, OQ-27 | |
| 4 | Three state tiles with counts that also filter. A count that was not loaded shows "—", never 0 | 580-587, 684-696, 735-746, 1272-1283 | none | GAP | Medium |
| 5 | Search (number or party; serial, product, party or number), run on the server after 300 ms | 723-748, 1236, 1305; cover.ts:238-299 | none | partial: URS-031 | |
| 6 | Opens 2,000 rows (two server pages). Load more doubles each time. Counts show "+" | 56-77, 659-721, 1258 | none | partial: FRS-048 | |
| 7 | Cached per tab, with a 30-minute background sync while unfiltered | 622-628, 731-734, 750-755 | none | GAP | Low |
| 8 | Arriving from a Product Database 2.0 link opens the right tab already searched | 567-579 | none | GAP | Low |
| 9 | An opened entry opens in a pop-up: details left and products right, every entry action in a fixed bar at the top, no close on an outside click, a confirmation before closing over unsaved changes; the halves stack below 900 px | CoverRegister.tsx entryPopup; fieldcalls.css .cover-pop | none | NAR-007 (NAR-005 withdrawn) | |
| 10 | + New entry offers the next number in the series (editable, not reserved). Sale: warranty start defaults to today, and the entry date is stamped on create | 608-620, 804-814, 1238-1240; cover.ts:267-274 | perm cover.edit; DB write cover.edit | GAP | Number series behaviour (duplicate refused by the unique key) is not stated. Medium |
| 11 | Entry form fields by section. Derived fields are shown but cannot be typed: warranty end and years from months, contract end and years from months (2026-10-02), and the entry date. Contract: start defaults to today; Period (Months), PM Visits (Total), Payment Schedule and Bill Generate At are required, all blanks named in one refusal before the write; the Renew panel's End is read-only and it refuses a renewal without months. Contract Status is computed from the end date and today (Active / About to Expire / Contract Expired); Period (Years) is hidden and shown as a line under the months; the entry window shows the device-copy line (MachineRegisterNote) | 121-140, 1076-1110; cover.ts field defs (SALE/CONTRACT) | cover.edit (fields disabled without it, 1088) | CW-004, FRS-079 (cover.edit), FRS-220 | |
| 12 | PM visits follow the period until someone types over them | 1089-1103; coverspec deriveHeader | cover.edit | FRS-090.1-.3, OQ-78 | |
| 13 | Dates read dd-MMM-yyyy and become a date picker while being edited | 86-106, 183-189 | — | URS-076, FRS-089, OQ-77 | The Renew panel uses native `<input type="date">` (439-446), which contradicts FRS-089.1 ("cover registers shall display every date … dd-MMM-yyyy") |
| 14 | Sale: party picker searches the Party Master on the server and also accepts a typed name the master does not hold. Contract: party picker searches the Product Database's customers (owners of a machine on record) and accepts no typed name (FRS-220.1) | 141-158 | cover.edit | partial: URS-045 — URS-045 requires controlled values to be chosen. Free text here is deliberate but no requirement grants the exception | Medium |
| 15 | Sale: choosing a party fills the eleven address, contact and tax fields from the Party Master, blanks included. Only when the name actually changes; nothing is filled for an unknown name | 778-802, 1104 | cover.edit | GAP | FRS-090.4-.6 cover only the explicit "Update from Party Master" |
| 16 | ↺ Update from Party Master (sale): lists every field it would change, old → new, before changing any. "Already matches" when nothing differs. Nothing is changed for a party the master lacks | 944-983, 1118-1123; coverspec partyFillChanges | cover.edit | FRS-090.4-.6, OQ-78 | |
| 17 | Save entry. Only declared columns are written. Machines that follow the entry move with it | 804-823; cover.ts:313-346 | cover.edit | FRS-016, CW-021 | |
| 18 | Delete entry and all its machines (confirmation) | 985-992, 1124; cover.ts:365-368 | cover.edit (DB write policy) | GAP | Hard delete of a cover record. Warranty and contract tables are not in the 0049 retention guard. High |
| 19 | Machine card: expand; edit machine fields; inherited value shown as placeholder "from entry"; "N pinned" badge; ↺ inherit per field; Save machine (only when changed) | 193-292 | cover.edit | FRS-016, OQ-27 | |
| 20 | Remove a machine from the entry (confirmation) | 235-240, 255; cover.ts:360-363 | cover.edit | GAP | Hard delete. High |
| 21 | Sale machine: product code and name offered only from ACTIVE Product Master lines. Code and name are paired where the catalogue gives one answer. Free text is still allowed. A note counts the retired lines not offered | 163-177, 214-223, 280-281, 1129-1142; productLines.ts | cover.edit | GAP | "A retired line takes no new sale" has no URS or FRS, and free text bypasses it. Medium |
| 22 | Machine-level arithmetic: rate → tax → total; period → end | 208-223; coverspec deriveItem | cover.edit | partial: CW-004 / CW-005 (period → end); tax and total rules are not stated | |
| 23 | + Add machine (only after the entry is saved) | 1143, 1149-1154 | cover.edit | FRS-016 | |
| 24 | ＋ Installation calls (sale): one per saved machine with product and serial that has no call. The confirmation lists the machines and the fixed answers. The UCN is written back through `link_install_call`. On failure it stops, naming the calls already created. When done it says "Every machine here has its installation call", or asks you to save first | 854-894, 1159-1170; cover.ts:425-455 | shown inside cover.edit block; call insert gated by install.create (DB); link_install_call accepts install.create or cover.edit (0258) | URS-073, FRS-085, CW-022, OQ-73 | |
| 25 | + Installation call for one machine from the By-machine tab. The confirmation names the INST Call placeholder it will overwrite. The row and cache are updated in place | 896-942, 1026-1050 | perm install.create or cover.edit | partial: FRS-085 — the per-machine variant and the overwrite of an existing INST Call value are not stated | |
| 26 | ↺ Force update child records: before clearing, counts values that DIFFER from the entry separately from those that repeat it, and names each field with its machine count. Offered only when something is pinned. One statement | 825-852, 1171-1184; cover.ts:401-409 | cover.edit | URS-072, FRS-084, CW-021, OQ-73 | |
| 27 | ↻ Renew this contract (contract only; disabled while machines load). New MC is typed and refused if it exists; start = day after end; months drive years and end; untick machines; type, party, period, PM visits and billing carried over; link back via prev_mc and last_contract_* Prev MC Number is written by the renewal and is not shown on the contract form (2026-10-02) | 321-549, 1188-1213; cover.ts:518-630 | cover.edit | URS-048, FRS-056, CW-010, OQ-42 | |
| 28 | Renewal re-pricing: new rate per machine with the old rate shown beside it; "Revise all ticked by %"; Clear rates; GST total preview; a bad rate blocks saving; every rate checked before anything is written | 351-400, 471-546; cover.ts:579-630 | cover.edit | partial: URS-048 / FRS-056 — FRS-056 still says "Rate, tax and total are left empty on every machine". Rates may now be entered, never carried over, and the requirement does not state that | The success message at 1202 still says "rates … are deliberately blank" |
| 29 | Stale replies are dropped when you open another entry, so Renew cannot be seeded with the wrong contract's machines | 757-776 | — | GAP | Low |
| 30 | + Field call per machine opens the Field Call form pre-filled with party, machine and cover | 1019-1021, 1329-1340 | NO permission check on the button | partial: URS-011 ("reflected on calls") | Shown to readers without calls.create. The call form and DB still gate the save |
| 31 | ⭳ Export Excel (.xlsx, dates as Excel date cells, identifiers as text) and ⭳ Export CSV of entries or machines; the computed State is exported as shown (FRS-220.9) | 1241-1243, 1307-1309 | export.data | partial: FRS-018 | |
| 32 | Error text never blank (code kept); a failure to count tiles is reported as information without dropping the table | cover.ts:220-231; 685-701, 742-745 | — | GAP | Low |
| 33 | Contract type pick list CMC / AMC; sale party type and profile pick lists | cover.ts field defs (options) | cover.edit | partial: CW-008 — the family rule applies to derived status; the entry form's list is not stated | |
| 34 | ⇢ Convert to Contract on a saved sale (contract.edit.entries): party and machines carried, start = day after warranty end, MC offered, type/months/PM/billing/rates asked, contract form's required rule, existing MC refused, warning when already on a contract; opens the Contract Register on it | CoverRegister.tsx ConvertPanel; cover.ts proposeConversion / conversionHeader / conversionItem / convertWarrantyToContract | contract.edit.entries; DB contract write policy | FRS-221, OQ-218 | |
| 35 | Save entry disabled on a saved entry until a field changes | CoverRegister.tsx entryButtons | — | FRS-223 | |
| 36 | One time (0318): every sale re-read from the Party Master, every machine line put back on its sale, old values backed up, marker row stops a re-run | 0318_warranty_party_refresh_once.sql | migration | FRS-222, OQ-218, _status.sql row 245 | |
| 37 | Register line click opens its entry with that machine opened, marked and scrolled to | CoverRegister.tsx openFromRegister; cover.ts getHeader | read policy | NAR-007.10, OQ-225 | |
| 38 | Renew / Convert to Contract open in a third column | CoverRegister.tsx sidePanel; fieldcalls.css .cover-pop-body-3 | — | NAR-007.9, OQ-225 | |
| 39 | Warranty Register tab: Installation call column (Pending / UCN / —) and INSTALL CALL PENDING tile with count, filtered on the server | cover.ts PENDING_INSTALL / machineFilter; CoverRegister.tsx | read policy | FRS-231, OQ-225 | |
| 40 | Warranty Entries tab: Install calls pending per sale (filtered embedded count) and SALES WITH INSTALL CALLS PENDING tile with count, filtered on the server | cover.ts listHeaders / countPendingSales; CoverRegister.tsx | read policy | FRS-231.3 | |
| 41 | A sale naming a party the Party Master lacks: notice, City and State required (shared PARTY_REQUIRED), and Save entry adds the party from the sale's fields (masters.parties.add) before saving; without the right it saves and says so | CoverRegister.tsx saveEntry / partyNotice; partyRules.ts; supabase.ts addParty | masters.parties.add; DB 0325 | FRS-256, OQ-253 | |
| 42 | Sale and machine Service Engineer picked from the User Master's active people (validity), no free text; a name not on the list is shown and flagged | cover.ts optionsFrom 'active-user'; supabase.ts sbActiveUserNames; CoverRegister.tsx | — | FRS-257 | |
| 43 | Warranty Entry: six required fields (Party Name, Invoice No, Invoice Date, Warranty Start, Period months, PM Visits), ordered Sale / Warranty / Party | cover.ts SALE.headerFields; missingRequired | — | FRS-258 | |
| 44 | Party Name locked once the sale is saved | CoverRegister.tsx partyLocked | — | FRS-258 | |
| 45 | Party details changed on the sale (incl. Country, Service Engineer) written back to the Party Master on Save entry; needs masters.parties.edit, else saved and said | CoverRegister.tsx saveEntry; partyRules.partyEdits; supabase.ts sbPartyIdByName, updateParty | masters.parties.edit; DB parties update policy (0325) | FRS-258 | |
| 46 | A new party from a sale requires Party Type, Profile, Country, State, City, Address, Pincode, GST, Service Engineer | partyRules.SALE_NEW_PARTY_REQUIRED; CoverRegister.tsx saveEntry | — | FRS-258 | |
| 47 | Contract Party Name picked from the Party Master (device copy first) | cover.ts CONTRACT party_name optionsFrom 'party'; supabase.ts sbSearchParties | — | FRS-259 | |
| 48 | Contract + Add machine: third-column picker of the customer's Product Database machines (device copy first), tick, Rate + Tax, Total worked out, Add saves each line with SA / MC history; already-on-contract not tickable; unlisted machine by hand | CoverRegister.tsx ContractMachinePicker; coverspec.ts contractItemFromMachine, pickableMachine; supabase.ts sbListPartyItems | contract.edit.entries; DB contract_items_insert | FRS-259 | |
| 49 | Contract machine card in four sections: Product Details, Price, From the entry, History; Total After Tax read-only | cover.ts CONTRACT.itemFields; CoverRegister.tsx ItemCard | — | FRS-259 | |

### Ownership Transfer (`/ownership-transfer`) — `src/modules/OwnershipTransfer.tsx`
Purpose: Records a machine changing hands, and warranty/contract details recovered for machines whose sale paperwork was lost.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Load all transfers and additional entries (paged) | OwnershipTransfer.tsx:58-73; supabase.ts:4367-4402 | mod:/ownership-transfer; DB `ownership_read` open (0072:126), `pae_read` | URS-011, URS-068 | |
| 2 | Tabs: Transfers (n) / Additional Entry Details (n) | 156-159 | none | GAP | Low |
| 3 | Search each tab (serial, machine, party, reference; warranty, source) on the device | 98-100, 174, 183 | none | GAP | Low |
| 4 | Arriving from a Product Database 2.0 link opens the tab already searched | 43-52 | none | GAP | Low |
| 5 | Transfers table: serial, machine, from, to, date, reference, reason, document link, recorded by | 102-112, 168-176 | none | partial: CW-011 | |
| 6 | ＋ Record a transfer. Serial and To party are required. From is left blank and filled by the database from the current holder (left EMPTY when that would equal the destination). Date defaults to today. Reference, reason, document link and remarks. `recorded_by` is stamped from the session | 75-85, 144, 189-210; 0072 trigger (lines 54-76), 0182/0183 | perm `ownership.transfer`; DB `ownership_write` | CW-011, CW-013, URS-061, FRS-073, OQ-55 | The form asks for a SERIAL only. `item_name` is filled from `products` by serial (0072:69-71), which is ambiguous where serials repeat across models: partial against URS-060 / CW-001 (model + serial). "To party" is free text, not picked from the Party Master |
| 7 | Recording a transfer moves the Product Database owner to the latest transfer; a back-dated row does not undo a later one | 83, 162-166; 0072:105 | DB trigger | partial: CW-011 / CW-012 — CW-012 is "Met (2.0)" only; the update of the stored `products` owner is not stated | |
| 8 | ＋ Add entry details. Serial required; warranty number/start/end, contract number/type/start/end, "where this came from", document link. Described as "one entry per machine — saving again corrects it" | 87-96, 145, 212-235 | perm cover.edit; DB `pae_write` cover.edit (0073:139) | URS-068, CW-015 | DEFECT (likely): `saveAdditionalEntry` upserts `onConflict: 'serial_number'` (supabase.ts:4407), but 0185:57-62 dropped the serial-only unique index for (item_name, serial) `machine_key`. With no matching index the upsert should be refused. The form has no product field either. Contradicts URS-060 / FRS-074 |
| 9 | Missing-table message naming sales_contracts.sql | 64-70 | none | GAP | Low |
| 10 | No edit or delete of a transfer or entry on screen | whole file | — | partial: URS-017 | |
| 11 | Record a transfer: machine picked from the Product Database (serial, model, current party; device copy first); its current details, Sale Entry and Warranty shown and kept in the transfer's extra; From sent as the current party, model sent with the serial | OwnershipTransfer.tsx openMove, pickMachine, saveMove, DetailBlock; coverspec.ts transferDetailsFromMachine, transferExtra; supabase.ts sbSearchMachines, sbProductBySerial | ownership.transfer; DB ownership_transfer_apply | FRS-260 | |
| 12 | To party picked from the Party Master (device copy first), its address, city, state, type and engineer shown; no free text; same party as From refused | OwnershipTransfer.tsx pickTo; supabase.ts sbSearchParties, sbPartyInfo | ownership.transfer | FRS-260 | |
| 13 | Sale Entry block shows the machine's Invoice No. and Invoice Date | coverspec.ts transferDetailsFromMachine; supabase.ts serverProductBySerial | ownership.transfer | FRS-263 | |
| 14 | Optional fresh warranty for the new owner: start (defaults to the transfer date) and months typed, years and end worked out; Reference no. required; the machine wears it numbered with the Reference no. while it starts on or after the sale's | OwnershipTransfer.tsx fresh, saveMove; coverspec.ts freshWarranty; 0382 ownership_transfer_warranty, sync_product_machine | ownership.transfer; DB ownership_transfer_warranty | FRS-263 | |
| 15 | Opened from a Product Database row's ⇄ Transfer with that machine picked | OwnershipTransfer.tsx location effect, chooseMachine | ownership.transfer | FRS-262 | |

### Field Solutions (`/knowledge-base`) — `src/modules/KnowledgeBase.tsx`
Purpose: Team-written articles about field problems and fixes.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Article cards (not the How-To ones): category, product, title, preview, author, date, attachment count | KnowledgeBase.tsx:66-73, 92-93, 183-206 | alwaysOpen (Layout.tsx:152); DB `kb_read` signed-in (0042:44) | URS-020, FRS-025 | |
| 2 | Search title, category, product, tags, body, author | 112-116, 186-187 | none | GAP | Low |
| 3 | Opens a specific article when arriving from a call's Supporting Documents | 75-82 | none | FRS-035 | |
| 4 | Article viewer: sanitised rich text, tags, attachment links | 222-248 | none | FRS-025, OQ-13 | |
| 5 | ＋ Add article (anyone signed in) | 118, 168 | DB `kb_insert` auth.uid() not null | partial: FRS-025 — "available to all; author or admin edits". Who may contribute is implied, not stated | |
| 6 | ✏️ Edit and 🗑 Delete (hard, "cannot be undone") by the author or an admin | 84, 119, 149-154, 240-245 | DB `kb_update`/`kb_delete` created_by = auth.uid() or is_admin (0042:52-60) | partial: FRS-025 — edit is stated, delete is not | |
| 7 | Form: title required; category (Field Issue / How-To / Product Tip / Spares / Other); products (multi-select from ACTIVE Product Master lines plus any already named); tags; rich editor; attachment links (add/remove) | 36, 106-110, 121-135, 250-300 | author/admin | partial: FRS-025 / FRS-035 — product and tags matching on calls is stated; the multi-select from active lines is not | |
| 8 | Body sanitised on save and on display | 127, 231 | — | FRS-025, OQ-13 | |
| 9 | An article filed as How-To is listed on How to Use, and the save message says so with an "Open How to Use →" button | 86-93, 136-146, 171-181, 260-262 | none | GAP | Low |
| 10 | Missing-table and not-connected messages | 70, 207-209 | none | GAP | Low |

### How to Use RITHI CRM (`/knowledge-base/how-to`) — `src/modules/HowToUse.tsx`
Purpose: The built-in step-by-step user guide, plus the team's How-To articles.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | 33 written tasks in groups, each with who does it, steps and a note; a jump strip scrolls to a task and highlights it (no anchors) | HowToUse.tsx:56-440, 495-506, 565-606 | alwaysOpen (Layout.tsx:139) | URS-020, FRS-025 | Task 32 still sends people to "Admin → User Access" (/users), which now redirects (422-426) |
| 2 | "Open <screen> →" buttons, shown only for screens the role may open | 45-49, 491-493, 598-604 | per target `actionForPath` | GAP | Low |
| 3 | Screenshots per task: everyone sees them; an admin can add (downscaled to 1280), replace, caption (saved on blur) or remove | 442-479, 508-546; DB `help_screenshots` policies (0043) | admin (`isAdmin`) | GAP | Low |
| 4 | Team articles filed under How-To, sorted by title; opening one goes to Field Solutions | 514-519, 548-549, 613-635 | none | partial: FRS-025 | |
| 5 | The guide renders even if the database is unreachable (screenshots and articles are best-effort) | 508-521 | — | GAP | Low |

### How RITHI Functions (`/knowledge-base/how-it-works`) — `src/modules/HowRithiFunctions.tsx`
Purpose: Shows four explanatory documents (call flow, spare flow, hand stock, spare schema) in a frame.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Choose one of four documents with chips; the choice is remembered on this device | HowRithiFunctions.tsx:51-116, 176-182 | mod:/knowledge-base/how-it-works (admin:true; 0209 grants Admin, NSM, Zoho, Technical Support) | partial: URS-020 (declared module) | |
| 2 | Document shown in a frame from `public/docs/`, in the app's light or dark scheme; its height is accepted only from its own frame | 100, 118-149, 201-212 | — | GAP | Low |
| 3 | ⧉ Open on its own (new tab) | 185-189 | none | GAP | The files are static under `public/docs/`, so anyone with the URL can read them without signing in. The module restriction to four roles does not protect the content. Medium |
| 4 | "Could not be loaded" banner when the file is missing (HEAD check) | 151-161, 192-199 | — | GAP | Low |

### Service Manuals (`/service-manuals`) and QMS Documents (`/qms`) — `src/modules/DocumentLibrary.tsx`
Purpose: Two shelves on one screen: service manuals keyed by product, and controlled QMS documents with number, revision and effective date. A new QMS document can trigger training.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Shelf list; retired documents hidden unless "Show retired" is ticked | DocumentLibrary.tsx:96-105, 203-208, 305-308 | mod:/service-manuals, mod:/qms; DB `documents_read` signed-in (0070:81) | URS-029, URS-030, FRS-035, FRS-036, OQ-21 | |
| 2 | Search title, product, document number, revision, tags, notes | 203-208, 304 | none | GAP | Low |
| 3 | Columns: title (opens Drive); QMS: Doc No, Rev, Effective; manuals: Product ("Every product" when blank); File (📄 stored copy vs 🔗 link); Added By; Updated; Live | 210-261 | none | FRS-035, FRS-036 | "Updated" shows the raw timestamp, not dd-MMM-yyyy (256) |
| 4 | ＋ Add document | 284, 315-426 | perm docs.manage (manuals) / qms.manage (QMS); DB `documents_insert` by kind (0070:86-90) | FRS-035, FRS-036, OQ-21 | |
| 5 | Upload the file to Drive (size limit) or paste a link. Document No and Revision are suggested from the file name, only into empty fields, and the suggestion is stated | 107-140, 361-399 | docs.manage / qms.manage | partial: FRS-035 (stored in Drive) — the filename suggestion is not stated | |
| 6 | Validation: title required; file or link required; a QMS document needs its number | 142-147 | UI | partial: URS-030 / FRS-036 — revision and effective date are "held" but not enforced as required | |
| 7 | Manual product: suggestion list from the product master, but free text is accepted; blank = every product | 339-348 | docs.manage | partial: FRS-035 | |
| 8 | ✏️ Edit a document in place: title, number, revision, effective date, link, and so on | 194-201, 267 | docs.manage / qms.manage; DB `documents_update` | GAP | For a QMS document this overwrites the recorded revision and link with no history. URS-030 requires a superseded document to be withdrawn, not destroyed; the screen guidance (391-395) says publish a new entry, but nothing enforces it. High |
| 9 | ⊘ Retire / ↩ Restore (confirmation: stays on the shelf as the record) | 186-192, 268-269 | docs.manage / qms.manage | URS-030, FRS-036, OQ-21 | |
| 10 | Guidance that a pasted link stays live (can change under the recorded revision); QMS should upload the file | 380-396 | — | partial: FRS-036 — a linked, mutable QMS document is not prevented | |
| 11 | New QMS document: choose who must be trained (roles, designations, departments, regions, named people; active only; exact count) and a due date. Saving assigns the training; a failure is reported and the document is kept | 84-94, 169-182, 401-416; components/people/AudiencePicker.tsx:19-61; lib/audience.ts:10-19 | qms.manage; DB `tg_insert` training.manage or qms.manage (0264:258) | URS-079, FRS-093 | |
| 12 | Author recorded (`uploaded_by_name` client text; authorship stamped by the database per FRS-036) | 165 | — | FRS-036 | |
| 13 | Load / not-connected messages | 97-101 | none | GAP | Low |

### Training (`/training`) — `src/modules/Training.tsx` (+ `src/lib/training.ts`, `src/components/people/*`)
Purpose: Training assignments and their status, bulk training sessions with attendance and assessment, and each person's training record.

| # | Capability | Where | Guard | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Load the directory, active QMS documents, training status and sessions | Training.tsx:60-73; training.ts:65-71, 113-116 | mod:/training (admin:true); DB `may_see_person()` on assignments/attendance | URS-079, FRS-093, OQ-81 | |
| 2 | Assignments table: person, department, designation, topic, assigned, due, status (Overdue / Failed - retrain / Pending / Completed / Cancelled), completed | 98-112, 219-232; 0264:294-306 | may_see_person | partial: FRS-093 — Completed and Fail are stated; "Overdue" (past due date) and "Cancelled" are not | |
| 3 | Status chips with exact counts, and search by person, topic, department, document | 78-88, 225-226 | none | GAP | Low |
| 4 | Click a person to open their profile / R&R / training drawer | 99-100, 326-330 | may_see_person | URS-079 | |
| 5 | Cancel an open assignment, with the reason kept | 90-96, 109-111; training.ts:98-102 | perm training.manage; DB `tg_update` | GAP | Ends a person's training obligation. Not in URS-079 / FRS-093. Medium |
| 6 | ＋ Assign training: a QMS document or a free topic, optional due date, and an audience. Anyone already assigned is skipped | 114-130, 240-260; training.ts:89-97 | training.manage; DB `tg_insert` | URS-079, FRS-093, OQ-81 | |
| 7 | ＋ Record session: document or topic, date (required), trainer (from the directory or typed), method, duration, notes | 132-143, 262-280 | training.manage; DB `ts_insert` | URS-079, FRS-093 | Trainer accepts free text |
| 8 | Attach attendance sheets or certificates (several files to Drive, size limit) | 160-172, 282-287 | training.manage | URS-079 | |
| 9 | Add attendees by audience; per person: attended, assessment Pass / Fail, score, remarks; remove a person (new sessions only) | 152-159, 289-314 | training.manage | URS-079, FRS-093 | |
| 10 | Save session and attendance; re-saving an existing session corrects it | 173-187; training.ts:126-145 | training.manage; DB `ts_update`/`ta_update` | partial: URS-079 / FRS-093 — "Nothing is deletable", yet a recorded Pass/Fail, score or attendance can be overwritten with no amendment history | Quality record edited in place. High |
| 11 | Open an existing session from the Sessions tab (only for training.manage) | 144-151, 233-238 | training.manage | partial: as #10 | |
| 12 | Sessions list is readable by every signed-in user | 0264:233 | DB `ts_read` true | partial: FRS-093 (states the per-person visibility rule only) | |
| 13 | ⭳ Export CSV of assignments | 228-230 | export.data | partial: FRS-018 | |
| 14 | Empty text "No training assigned that you may see"; load failure names training.sql | 67-70, 222 | — | GAP | Low |

---

### Gaps summary

Party Master — Change engineer (bulk rename of Serviceman across parties) — must state who may rename a party field in bulk, that the target must be a User Master name, the preview count, and one-statement atomicity — High
Party Master — Party name not editable — must state that the party name is the join key, cannot be edited from the register, and how a rename is done; today it is enforced only by the client not sending the field — Medium
Party Master — KYC Verified stamp (who/when from session; cleared on return to Pending) — FRS-086 should state the database attribution of the verification — Medium
Party Master — GSTIN/PAN derivation and the three KYC statuses — must state the allowed values and the derivation — Low
Party Master — Browse cache, 30-min sync, refresh, filters, load more with "+", columns picker, messages — a general register-reading requirement (paging, lower-bound counts, cache age) — Low
Party Master — Device customer register refreshed on party edit — URS-078 should state the copy is refreshed after an edit — Low
Party Master / all screens — CSV export partial-data warning and date format — FRS-018 should state the partial-data confirmation and dd-MMM-yyyy output — Medium
Product Database — Browse/search/filters/status filter/timeout guidance/cache/columns — requirement for the install-base register itself (not only Product & Party Search) — Low
Product Database — "+ Field / + Install" pre-filled call from a machine — requirement that a call started from the register carries the machine's party and cover — Medium
Product Database 2.0 — Materialised view "Live as of" / "updating within 5 minutes" and Rebuild — FRS-080 and CW-019 must state the rebuild schedule, the staleness window and who may rebuild (the client gate is masters.edit, the database accepts cover.edit/admin) — Medium
Product Database 2.0 — Read access widened by 0221 — CW-020 ("Met") must be restated: warranty and contract detail is readable by any signed-in user who can open the screen — High
Product Database 2.0 — Empty-list diagnosis per register — decision-support requirement: an empty register reports what the sources hold rather than asserting emptiness — Medium
Product Database 2.0 — Search, status chips, drawer links to SA/MC/UCN/transfer — convenience — Low
Product Master — "Inactive line takes no new Sale Entry" — URS/FRS stating the rule and its enforcement point; it is form-only and free text bypasses it — Medium
Product Master — Search, chips, empty state — Low
User Master — Apply this list's role to sign-ins (bulk) — must state how a directory role reaches the effective profile role, who may apply it, and the audit — High
User Master — Rename cascades (0257/0259) moving team and filed work to the new name — must state which records move, which do not (approver/dispatcher identities), the pre-save warning, and the twin-name exception — High
User Master — Department not saved (persist omits it) — requirement that department is recorded (training audiences depend on it); defect to raise — Medium
User Master — Create login with fixed default password "123456789" — FRS-002 should state the initial-credential rule and forced change — High
User Master — Clone user (role + extra permissions + optional data.view_all) — must state that cloning a user grants authority and data scope, and who may do it — High
User Master — Extra per-user permissions (Access drawer) — URS-002/FRS-003 describe role-based access only; per-user grants need a requirement and a review — High
User Master — Reset password (generated, shown once, all sessions signed out, audited) — credential administration requirement — High
User Master — Delete User Master row (cascades to user_profile/user_rr; refused where training exists) — must state whether a directory row may be deleted and that R&R history is retained; contradicts FRS-093 "Nothing is deletable" — High
User Master — Data drawer (activity matched by name ilike) — requirement for the handover view and its matching rule — Low
User Master — R&R period edited in place — URS-079 should state whether a recorded period may be amended and how that is traced — Medium
User Master — Free-typed Reporting/Regional Manager names — FRS-003 should state that tree names must match a directory row — Medium
User Master — Validity vs login active — FRS-002 should distinguish the directory Active flag from the login flag — Low
User Master — Name required; search; sheet fallback — Low
Part Master — Add-part validation rules (code format, no "|", category and products mandatory, duplicate refused) — FRS-015 should state them — Medium
Part Master — Rename part carrying nine tables with impact preview — URS/FRS for part identity change (today only defect log D-007/D-008) — High
Part Master — Bulk set products / bulk set Spare-Consumable — must state bulk master edits and failure reporting — Medium
Part Master — Product mapping ("Common", ⚠ unrecognised) that decides spares offered on a call — Medium
Part Master — Main product → accessories lists (hard delete) — requirement for the mapping that widens the spare pickers — Medium
Part Master — Global search, filters, cache, sheet fallback — Low
All Masters — Delete of a value-list entry with no in-use check — FRS-015/OQ-26 claim "in use is deactivated, not deleted" but a hard delete is offered and not refused — Medium
All Masters — Standard Complaint → products mapping (single and bulk) — requirement that the complaint list offered on a call is scoped by product, who maintains it, and the "empty = all" rule — Medium
All Masters — added_by on a value is client text — FRS-015 should state attribution of master edits — Low
All Masters — Overview counts, KPI cards, fallback registry, refresh/cache, open-list navigation, list search, export with Key — Low
Warranty/Contract — State tiles and the "about to expire" threshold — FRS-016 should state the state rule and threshold (coverStatus) — Medium
Warranty/Contract — New entry number offered from the series — requirement for SA/MC numbering (offered, not reserved; duplicate refused) — Medium
Warranty/Contract — Party auto-fill on a sale (eleven fields replaced) — FRS-090 covers only the explicit update — Medium
Warranty/Contract — Party picker accepts free text — URS-045 exception must be stated — Medium
Warranty/Contract — Delete entry with its machines; Remove machine — must state whether cover records may be hard-deleted (they are outside the 0049 retention guard) — High
Warranty/Contract — Sale product offered only from active lines (free text allowed) — see Product Master rule — Medium
Warranty/Contract — Item rate → tax → total arithmetic — pricing rule (GST) requirement — Medium
Warranty/Contract — Per-machine + Installation call overwriting INST Call placeholder — FRS-085 extension — Low
Warranty/Contract — Renewal re-pricing (rates entered, % uplift, preview) — FRS-056 still says rates are left empty; must be restated; success message is stale — Medium
Warranty/Contract — Renewal date fields render as native locale dates — contradicts FRS-089.1 — Low
Warranty/Contract — + Field call button shown without calls.create — requirement on who is offered call creation — Low
Warranty/Contract — Search, paging doubling, cache/sync, arrival from 2.0, stale-reply guard, error text, CMC/AMC list — Low
Ownership Transfer — Additional entry upsert on serial_number (index dropped by 0185; no product field) — URS-060/FRS-074 require model+serial; the save likely fails and the form cannot supply the model — High
Ownership Transfer — Transfer identified by serial only; item_name looked up by serial; To party free text — URS-060/CW-001 require model+serial; party should be a controlled value — High
Ownership Transfer — Products owner updated from latest transfer — CW-011/CW-012 should state the effect on the stored register — Medium
Ownership Transfer — Tabs, search, arrival from 2.0, missing-table message — Low
Field Solutions — Delete article (hard, author/admin) — FRS-025 should state delete and its authority — Low
Field Solutions — Product multi-select from active lines; How-To routing; search — Low
How to Use — Admin screenshots; Open buttons by permission; offline rendering; stale "User Access" task — Low
How RITHI Functions — Documents under public/docs are readable without sign-in, outside the four-role restriction (0209) — requirement on who may read internal design documents — Medium
How RITHI Functions — Document chooser, framing, missing-file banner — Low
Service Manuals / QMS — Edit a document in place (number, revision, link overwritten) — URS-030 requires superseded revisions retained; editing in place must be refused or traced for QMS — High
Service Manuals / QMS — Revision and effective date not enforced; linked (mutable) QMS documents allowed — FRS-036 should state which fields are mandatory and that a controlled document is a stored copy — Medium
Service Manuals / QMS — File-name suggestion of Doc No/Revision; search; raw "Updated" timestamp — Low
Training — Cancel an assignment with reason — URS-079/FRS-093 should state cancellation, its authority and its record — Medium
Training — Session attendance and assessment overwritten on re-save with no history — URS-079 should require amendments to training records to be traced — High
Training — "Overdue" status and sessions readable by everyone — FRS-093 should state them — Low
Training — Status chips, search, empty and failure messages, trainer free text — Low

---

# Reports, Administration & app-wide

## Capability inventory — group 5: Reports, admin screens, app-wide behaviour

Scope: `/exports` + `/exports/:tab`, `/bulk-uploads`, the legacy Data Import panel (it lives on `/admin-config`), `/data-export`, `/device-cache`, `/tracker`, `/users`, `/roles`, `/audit`, `/admin-config`, `/software-validation`, `/settings`, `/profile`, `/version-history`, and app-wide behaviour (sign-in, reset password, auth, menu/header, route guard, audit helper, offline machine/customer cache, export gate).

Requirement sources checked: `src/lib/validation.ts` (URS, FRS, NAR, TESTS), `docs/CALL_REQUEST_REQUIREMENTS.md` (CR), `docs/ISO13485_SERVICING.md` (SR), `docs/COVER_REQUIREMENTS.md` (CW). A capability counts as covered only where a requirement's own text states that behaviour. When a URS only *declares* a module (`modules: [...]`), that is not treated as coverage of each capability on the screen.

Guard abbreviations: `mod:/x` = module key checked by the route guard (`src/App.tsx:110-120`) and by the menu. "RLS" = row-level security on the underlying table/view. "export.data" = the central CSV gate (`src/lib/format.tsx:141-158`, set from `src/lib/auth.tsx:611-612`).

---

### Reports hub (`/exports`, `/exports/:tab`) — `src/modules/ReportsHub.tsx` (+ `ReportBuilder.tsx`, `ConsumptionReport.tsx`, `KpiExport.tsx`, `UnusedSpareReport.tsx`, `CallReport.tsx`, `FeedbackReport.tsx`, `src/lib/reports.ts`)
Purpose: one page that holds five report tabs. Each tab filters one register in the database and downloads the result as a file.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Only the report tabs my role may open are shown. Each report has its own key and falls back to `mod:/exports` | ReportsHub.tsx:67-70, 104-116 | `mod:/exports/<key>` (parent fallback via `can`) | partial: URS-013 — says export is permitted only to authorised roles. Per-report access is not stated | `/exports/<tab>` is not in MODULES, so the App-level guard (App.tsx:110) does not run for it. The hub's own check is the only one |
| 2 | A pasted link to a report I may not open, or a bare `/exports`, lands on the first report I can open | ReportsHub.tsx:72-85 | as #1 | GAP | Unknown tab → first permitted |
| 3 | If no report is open to my role, a message says an admin grants them one by one | ReportsHub.tsx:87-95 | none | GAP | |
| 4 | Only one tab is mounted at a time, so a hidden tab does not count rows | ReportsHub.tsx:117-121 | none | GAP | Performance only (Low) |
| 5 | Consumption Report: filter by call date range, product, customer, city, engineer, part (code or name), UCN and call type. The filter runs in the database | ConsumptionReport.tsx:48-63; supabase.ts:586-606 | page: `mod:/exports/consumption`; rows: RLS on `consumption_report` (security_invoker, 0215) | partial: URS-054 — declares this screen but says only that consumption is complete. No filter or report content is stated | Contains-match on text fields |
| 6 | The exact number of matching rows is counted in the database as I type (debounced). If the count fails, a message says so | ReportBuilder.tsx:103-111, 302-307; supabase.ts:610-614 | as #5 | GAP | Count is exact, shown with no "+" |
| 7 | Clear the filter; the current filter is described in words | ReportBuilder.tsx:234-238 | none | GAP | |
| 8 | Mandatory columns are shown ticked and locked. Optional columns can be ticked. Some optional columns start ticked (Line ID, Source Ref Key, Created At) | ReportBuilder.tsx:241-274; ConsumptionReport.tsx:38-40 | none | GAP | |
| 9 | "Add every column" / "Just the report format" / "Back to the default columns" buttons | ReportBuilder.tsx:275-290 | none | GAP | |
| 10 | Columns come out in the view's own order, not click order. A missing value becomes blank | ReportBuilder.tsx:125, 161-164 | none | GAP | |
| 11 | Download Excel (.xlsx) of every matching row (paged 1,000 at a time) with a progress count. It includes a second "Filter" sheet: report name, what one row is, filter applied, row count, column count, download time, report notes | ReportBuilder.tsx:127-195, 170-187, 293-297; supabase.ts:619-635 | per-report `mayExport` (`consumption.view` or `calls.view` or `reports.view`) — ConsumptionReport.tsx:47. **Not** `export.data`: xlsxDownload has no export gate (xlsx.ts:211-215) | partial: URS-013 — says export only to authorised roles, but the Excel path skips the `export.data` gate that FRS-018 names. The scope sheet is stated only for the Hand Stock Report (FRS-091) | The Excel button bypasses `export.data` |
| 12 | Download CSV of the same rows | ReportBuilder.tsx:167-168, 298-301 | `mayExport` + `export.data` (format.tsx:158) | FRS-018, URS-013 | |
| 13 | Buttons are disabled while not connected, while busy, when I may not export, or when the count is 0 | ReportBuilder.tsx:294, 298 | as #11 | GAP | |
| 14 | Dates in the file: a real Excel date in .xlsx, `dd-MMM-yyyy HH:mm:ss` text in .csv. Values are read by value, not by column name | ReportBuilder.tsx:136-160; format.tsx:165-168 | none | partial: URS-076 — says every date is presented in one form and stored as a date. Exported files are not mentioned | |
| 15 | Numbers stay numbers in the .xlsx (identifiers made of digits stay text) | ReportBuilder.tsx:156-160 (xlsxCell) | none | GAP | |
| 16 | Every download is written to the audit log as `report.<key>` with rows, columns and filter | ReportBuilder.tsx:190-191 | none (client-written) | partial: URS-016/FRS-021 — an audit trail of "key actions" is stated; report downloads are not named | |
| 17 | "Nothing matches that filter" when the result is empty, and the error text if the build fails | ReportBuilder.tsx:131, 192-193 | none | GAP | |
| 18 | "Not connected to the database" banner; a denied note explains that the page opens but the file cannot be taken | ReportBuilder.tsx:204-209, 309; ConsumptionReport.tsx:80-85 | none | GAP | |
| 19 | Changing report resets the filter and the column choice | ReportBuilder.tsx:115-117 | none | GAP | Low |
| 20 | Consumption file notes explain the visit dates, default columns and the no-visit fallback | ConsumptionReport.tsx:64-79 | none | GAP | |
| 21 | Call Report: one row per CALL (not per visit), with its latest visit (latest entry) and the spares booked (voided lines excluded). Filter by call date, product, customer, city, allotted-to, UCN, call type and exact call status | CallReport.tsx:20-72; supabase.ts:5795-5842 | page `mod:/exports/calls`; `mayExport` = `calls.view` or `reports.view` (CallReport.tsx:38); rows: RLS via `call_report` (security_invoker, 0191) | partial: URS-004 — says call status reflects the latest visit. One row per call, the filters and the spares columns are not stated | Status filter is exact, not contains (CallReport.tsx:50-55) |
| 22 | Customer Feedback Report: one row per feedback, each question as its own column, with an optional "All Answers" column | FeedbackReport.tsx:13-74 | page `mod:/exports/feedback`; `mayExport` = `feedback.view` or `calls.report` (:30) | URS-012, FRS-017 | |
| 23 | Feedback filter by the feedback's own date (never the load date), product, customer, state, engineer, UCN, call type, and source (Uploaded / Entered here) | FeedbackReport.tsx:31-48 | as #22 | partial: URS-037 — asks that migrated and native records be distinguishable. The date rule and the other filters are not stated | |
| 24 | Feedback file notes: a blank is "not asked", not "unanswered"; one feedback per call | FeedbackReport.tsx:49-74 | none | GAP | |
| 25 | KPI Export: the KPI workbook's Field_INST tab (columns A–AG plus Pending Days). Field and installation calls only, cancelled calls excluded. Computed Attended/Solved days, TTA/TTS and Failure Month | KpiExport.tsx:88-108; kpi.ts | page `mod:/exports/kpi`. **No `mayExport` check at all** in KpiExport.tsx | partial: URS-013 — generic analytics/export. The Field_INST definitions and formulas are stated nowhere (FRS-042 covers other KPI views) | Medium: a wrong figure here is a KPI decision |
| 26 | KPI filter by registered-from / to date, and a "Whole register" button | KpiExport.tsx:109-122 | as #25 | GAP | |
| 27 | KPI count of matching calls shown on the button. If the count fails, a banner says the export will still read them | KpiExport.tsx:36-44, 136, 150 | as #25 | GAP | |
| 28 | KPI download Excel (real dates) or CSV (paged 1,000 at a time). Written to the audit log as `kpi.export` | KpiExport.tsx:46-85, 128-147 | Excel: page key only (not `export.data`); CSV: `export.data` | partial: URS-013 / FRS-018 — CSV gate only | |
| 29 | Show the list of KPI columns | KpiExport.tsx:152-159 | none | GAP | |
| 30 | "Not Consumed Against this Call": parts dispatched/received against a solved call that were not booked (Not used) or were under-booked (Short). Refused/dropped lines are excluded | UnusedSpareReport.tsx:121-131; view 0147 | page `mod:/exports/unused`; rows RLS (security_invoker) | URS-047, FRS-055, URS-054 | |
| 31 | Unused-spares filter by dispatched date range, engineer (picker built from the report itself, else free text), product, part code; a Clear button | UnusedSpareReport.tsx:51, 133-157; supabase.ts:677-697 | as #30 | partial: FRS-055 — content only; no filters stated | |
| 32 | Unused-spares preview of the first 25 rows | UnusedSpareReport.tsx:67-74, 160, 172-201 | page key only (preview has no `mayExport` check) | GAP | |
| 33 | Unused-spares download Excel (with an "About" sheet giving scope, filter, rows and time taken) or CSV. Written to the audit log as `report.unused_spares` | UnusedSpareReport.tsx:76-113, 161-166 | `mayExport` (`consumption.view`/`calls.view`/`reports.view`, :40); Excel skips `export.data` | partial: URS-013/FRS-018 — CSV only | |

### Bulk Uploads (`/bulk-uploads`) — `src/modules/BulkUploads.tsx` (+ `src/lib/uploads.ts`, `supabase.ts` `prepareUpload`/`uploadRows`)
Purpose: one uploader per register. You pick the register and a CSV file, preview what will be written, then write it to the database in batches.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Screen is open only to real administrators, even when a role holds `mod:/bulk-uploads` | BulkUploads.tsx:233 | `mod:/bulk-uploads` + `isAdmin` (super admin or admin role, auth.tsx:387); each table's own RLS | partial: URS-010 — "maintained under control". Who may bulk-load is not stated (FRS-009 states it only for PM bulk upload) | |
| 2 | "Connect the database in Settings first" when not connected | BulkUploads.tsx:234 | none | GAP | Low |
| 3 | "Before you start" guidance (order matters, preview first, day-first dates, ⚠ registers) | BulkUploads.tsx:243-250 | none | GAP | Low |
| 4 | Registers are listed in groups (Calls, Visit Reports, Spares, Quality, Masters, Master Value Lists, Cover), each with its current row count | BulkUploads.tsx:215-223, 252-258, 97-100; uploads.ts:1528-1533; supabase.ts:4707-4711 | none | GAP | Row count is exact (count head) |
| 5 | Pick a CSV file per register. The header row is found below any letterhead, using the register's own column names | BulkUploads.tsx:31-42, 101-102 | none | GAP | |
| 6 | Preview before writing: rows ready, rows held back (with row number and reason), headers kept on the row / not loaded / ignored / stamped, recognised columns (required marked *), a sample shaped row | BulkUploads.tsx:103-111, 135-205 | none | partial: URS-062 — says a row without the key is refused with the reason. The preview itself is stated only for Bulk Report Mapping (URS-065) | |
| 7 | "Nothing loadable — every row is missing X. Is this the right register?" | BulkUploads.tsx:43-52 | none | partial: URS-062 | |
| 8 | A row missing a required column is held back and named, never loaded as a fragment | uploads.ts:363-367 | none | partial: URS-062 — says refusal of a row without its KEY. Other required fields are not stated | |
| 9 | Per-register row rules hold back impossible rows by name (qty < 1 lines, zero returns, same-engineer transfers, zero dispatches, zero balances) | uploads.ts:758-760, 843-844, 871-875, 934, 984 | none (DB would refuse the whole batch) | GAP | |
| 10 | Where a header matches several aliases, one wins by alias priority; the losers are kept in the extra blob | uploads.ts:242-246 | none | GAP | |
| 11 | A value the register stamps (call type, list name, source) overrides the file's own column and is not copied into extra | uploads.ts:254, 279, 323-349 | none | partial: FRS-006 — says call types are segregated. Stamping on upload is not stated | |
| 12 | Dates are read day-first. A date column is read month-first only when its own values prove it, and the preview says so | uploads.ts:263-267; BulkUploads.tsx:152-159 | none | partial: URS-076 — "store every date as a date". The day-first / month-first rule is not stated | Medium: a wrong date |
| 13 | A cell a typed column cannot read (e.g. 15/13/24, "two") is kept in extra, not dropped | uploads.ts:305-322 | none | partial: FRS-071 — "kept, not dropped" is stated for the FFR register only | |
| 14 | Unrecognised headers are kept on the row in extra (or reported as "not loaded" where the register has no extra); unwanted headers are dropped as "ignored" | uploads.ts:273-276, 319-349, 389-397; BulkUploads.tsx:164-187 | none | partial: FRS-071 — FFR only | |
| 15 | Rows repeating the same key inside one file: the last wins, or quantities are added (WinMax fold) | uploads.ts:382-383, 437-462, 987-992 | none | GAP | |
| 16 | Controlled vocabularies are applied while shaping: cover → WGP/OGP/CMC/AMC, approvals → Approved/Rejected/…, part category title-cased | uploads.ts:470, 474, 1381-1392 | none (DB `cover_code` triggers, 0208) | GAP | |
| 17 | Some registers run a preparation step before the confirmation, so the count I approve is the count written | BulkUploads.tsx:58-77; supabase.ts:4439-4646 | table RLS | partial: FRS-047 — stated for opening stock only | |
| 18 | Confirmation dialog: "Upload N rows into X?" plus the preparation note, plus "matched on <key>, re-run corrects" or "⚠ NO natural key — re-run ADDS rows" | BulkUploads.tsx:78-82 | none | partial: URS-062 | |
| 19 | Rows are written in batches (300/500/2000 by table) with progress. Rows of different column-sets go in separate requests, so an absent column takes its default | supabase.ts:4648-4699; uploads.ts:425-434 | table RLS | URS-040, FRS-046 | |
| 20 | Registers with a natural key are upserted (re-load corrects). Registers without one are inserted | supabase.ts:4677-4679 | table RLS (UPDATE policy needed for upsert) | URS-062, FRS-074 | See #21 |
| 21 | The MRN Register and Stock Transfer Lines have NO natural key, so a second run duplicates stock records. The screen shows a ⚠ warning | uploads.ts:835-862, 883-895; BulkUploads.tsx:122-126 | table RLS | partial: URS-062 — requires EVERY loadable register to have a natural key. These two contradict it | High: duplicated stock movements |
| 22 | On failure: the error, the row it stopped near, how many were written before it stopped, and a hint (missing index → run `_status.sql`; timeout → re-run; missing table) | supabase.ts:4680-4696; BulkUploads.tsx:86 | none | GAP | Earlier batches stay written (no whole-file rollback) |
| 23 | After a Product Database or Party Master upload, this device's offline copy is downloaded again | supabase.ts:4694, 4703 | none | partial: URS-078 — offline copy stated; refresh after a load not stated | |
| 24 | Bulk uploads write NO client audit-log entry. Only the 10 quality tables carry the database trail (record_audit, one event per statement) | BulkUploads.tsx (no `logAudit`); 0225_record_audit_on.sql:48-51 | — | partial: URS-016/FRS-021 — masters, parties, products, parts, cover, stock history and user loads leave no attributable trail | High |
| 25 | Field / Installation / PM Calls: key UCN, call type stamped, written straight to the tables; call number and reg date stamped by the database | uploads.ts:667-673, 479-524 | table RLS | partial: FRS-006, FRS-051 (bulk-loaded calls carry no registrant) — the upload itself is not stated | |
| 26 | Field / Installation / PM Reports (visits): uid derived from UCN + visit date; visit date REQUIRED; Visit Entry Date → `updated_at`, which decides the call status | uploads.ts:534-565, 677-683 | table RLS | partial: URS-004 — "status reflects the latest visit". The derived key, the required visit date and the status effect of a load are not stated | High: changes call status |
| 27 | Call Registration Requests: request ID required (a re-load would otherwise duplicate); only a UCN-shaped value is taken as a UCN; status becomes Registered where a UCN exists | uploads.ts:685-723 | table RLS | URS-039, FRS-045, CR-019 | |
| 28 | Spare Request headers: key OR number; the table's uid is not sent | uploads.ts:726-747 | table RLS | partial: URS-062 | |
| 29 | Spare Request Lines with RM / Commercial / NSM approvals: row numbers assigned, lines re-pointed to the request holding that OR number, and a STUB request is CREATED ("Imported") for any OR number the header file lacks | uploads.ts:750-795; supabase.ts:4577-4645 | table RLS (`spare_requests` insert) | GAP | High: creates quality records and approvals from a file |
| 30 | Stock Out Register (dispatches): key uid | uploads.ts:796-805 | table RLS; `dispatched_by` stamped by DB (0211) | partial: URS-008 | |
| 31 | Consumption: key source row id. A VISIT is FILED from the file's Visit Date & Time for any call with no visit (one per UCN, first dated row wins). Rows whose call has no visit and no date are held back and named | uploads.ts:587-662, 806-834; supabase.ts:4482-4509 | table RLS; 0214 visit guard | GAP | High: creates visit records and sets call status (a blank status reads Report pending) |
| 32 | MRN Register: `source = import` stamped, so a historical return is not refused for leaving the engineer short | uploads.ts:835-862 | table RLS; 0039 stock guard relaxed for import | GAP | High: bypasses the stock guard (URS-009) |
| 33 | Stock Transfer Register: `source = import` stamped (stock check relaxed); same-engineer rows held back | uploads.ts:863-882 | table RLS; 0089 | GAP | High (as #32) |
| 34 | Stock Transfer Lines: lines whose transfer is not in the register are held back and counted | uploads.ts:883-895; supabase.ts:4559-4575 | table RLS | GAP | |
| 35 | Opening Stock (prepared pool) and Opening Stock (WinMax export): only ACTIVE User Master names are kept, the dropped names are listed, an empty directory is refused. WinMax good + defective are added, and same-code lines are folded | uploads.ts:897-909, 957-993; supabase.ts:4527-4552 | table RLS | URS-041, FRS-047 | |
| 36 | Consumption — historical and yearly exports; Stock Out — all years: key source + ref (yearly ref = position + UCN + part; source derived from Visit Entry year) | uploads.ts:911-925, 929-954, 996-1022 | table RLS | partial: URS-037/FRS-043 — migrated part distinguishable. Keys and derivation not stated | |
| 37 | QMS Documents (Master List): key doc no + revision, `kind = qms` stamped, URL required; no training assigned | uploads.ts:1038-1053 | table RLS (`qms.manage`) | partial: FRS-036 — QMS control. The bulk load is not stated | |
| 38 | Customer Feedback: key UCN (one per call), `imported_from` stamped, feedback date from Visit Entry Date | uploads.ts:1054-1083 | table RLS | URS-062, FRS-074; partial URS-037 | |
| 39 | Field Failure Register (any year): key FFR no + serial, unknown headings kept, `imported_from` stamped, `raised_by` left empty | uploads.ts:1118-1170 | table RLS; `ffr_stamp` | FRS-071, FRS-072 | |
| 40 | DCCR Register: review answers loaded by UCN, including `review2_by` / `review3_by` names from the file. Derived fields ignored | uploads.ts:1171-1186 | table RLS | partial: URS-058 — requires the judge's identity from the session and never caller-supplied. Importing reviewer names from a file is not addressed | High: attribution |
| 41 | Party Master: key party name, billing block separated, each party given a Party key on first load | uploads.ts:1189-1254 | table RLS | partial: URS-010 | |
| 42 | Product Database: key model + serial. A BLANK CELL CLEARS the column (`blanksClear`) | uploads.ts:1259-1318, 301-303 | table RLS | partial: URS-060/FRS-072 (key). **Contradicts URS-040** ("a value the file leaves empty shall … not be written as empty or null") | High |
| 43 | Product Master (product lines): key product code, Active carried as given | uploads.ts:1329-1345 | table RLS | partial: URS-060 | |
| 44 | Part Master: key CODE\|Description, category normalised (unknown words kept), Inactive loads retired | uploads.ts:1346-1400 | table RLS | partial: URS-010/FRS-015 | |
| 45 | Ownership Transfer: key OT no + serial, "priority" ignored, blank From filled from the current holder | uploads.ts:1403-1432 | table RLS | URS-061, FRS-073, FRS-074 | |
| 46 | Additional Entry Details (recovered warranty): key model + serial | uploads.ts:1433-1456 | table RLS | URS-060, FRS-072, FRS-074 | |
| 47 | Sale Entry / Sale Details / Contract Entry / Contract Details: the AppSheet exports shaped by the cover importer; a stub entry is created for an item whose entry is missing | uploads.ts:1459-1476 | table RLS | partial: URS-072 / FRS-016 | |
| 48 | Every master value list gets its own uploader; the list name is stamped; key name + value + stage + product | uploads.ts:1485-1526; BulkUploads.tsx:215, 225-228 | table RLS (`masters.edit` / per list) | partial: URS-010/FRS-015 | |
| 49 | Standard Complaint list upload: matched by Key (from Export CSV) and NEVER renamed; the Products column sets the product mapping; a file without Products leaves mappings alone | uploads.ts:1510-1519; supabase.ts:4451-4463 | table RLS | GAP | Medium |
| 50 | Dismiss a result message | BulkUploads.tsx:128-133 | none | GAP | Low |

### Legacy Data Import panel ("Cover normalisation (legacy importer)", on `/admin-config`) — `src/modules/DataImport.tsx` (+ `src/lib/dataImport.ts`)
Purpose: the older importer, kept for the four AppSheet sale/contract exports and the "Normalise cover" step. It also still loads the User Master directory and the MRN tabs.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Panel shows only to administrators | DataImport.tsx:48 | `mod:/admin-config` + `isAdmin` | GAP | |
| 2 | A banner points to Bulk Uploads for loading registers | DataImport.tsx:112-120 | none | GAP | Low |
| 3 | Row counts for user_directory, material_returns and the 4 cover tables, with a ↻ Counts button. A failed count says "—" means an error, not empty | DataImport.tsx:39-46, 129-135 | none | GAP | Low |
| 4 | Pick several CSVs. The target table is AUTO-DETECTED from the headers; unrecognised files are marked. The MRN form-data tab is explained | DataImport.tsx:50-74, 137; dataImport.ts:22-37 | none | GAP | No preview of shaped rows and no confirmation dialog |
| 5 | Import all ready files through the admin's session, with per-file progress. Cover tables are upserted on their numbers; user_directory and material_returns are plain INSERTS (re-import duplicates) | DataImport.tsx:76-101, 162-164; dataImport.ts:144-147, 157-179 | table RLS | partial: URS-062 — every loadable register should have a natural key; user_directory and MRN here have none | High: duplicate people change the visibility tree (visible_engineer_names); duplicate MRN changes stock |
| 6 | After any cover import, "Normalise cover" runs automatically: item values repeating their entry are handed back to inheritance and machine cover is refreshed | DataImport.tsx:87-98; cover.ts `finishCoverImport` | table RLS | partial: URS-072 / FRS-084 — return to parent terms is stated, but "state what such a return will discard before it discards it" is not done here (no confirmation) | |
| 7 | "Normalise cover" button, run on demand | DataImport.tsx:165-170 | `isAdmin` | partial: URS-072 | |
| 8 | No audit-log entry for any of this | DataImport.tsx (no `logAudit`) | — | partial: URS-016 | |

### Data Export (`/data-export`) — `src/modules/DataExport.tsx`
Purpose: pick tables and download them as a ZIP of CSV files, or schedule a daily/weekly e-mailed export of the ticked tables.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Screen gate: "You need admin access to export data" | DataExport.tsx:215-217 | `mod:/data-export` (admin module) | GAP | |
| 2 | List of exportable tables with approximate row counts (from planner statistics) | DataExport.tsx:89-104, 247-258 | `exportable_tables()` (admin-only per the empty-list text) | partial: NAR-004.2/.3 — the schedule side only | Counts say "(approx.)" |
| 3 | Search tables, "Select all shown", "Clear", and a total of selected approx rows | DataExport.tsx:120-129, 231-244 | none | GAP | Low |
| 4 | Export N tables: every row of each table read AS ME under RLS (paged, cap 200,000 per table), one CSV per table, all zipped into `rithi-export-<date>.zip` | DataExport.tsx:131-162 | `mod:/data-export`; RLS. **Not `export.data`** (uses zip `download`, not csvExport). No audit-log entry | GAP | High: bulk export of whole tables with no recorded trace. NAR-004 covers only scheduled mail |
| 5 | Dates in the CSVs as `dd-MMM-yyyy HH:mm:ss`; jsonb written verbatim | DataExport.tsx:48-51 | none | partial: URS-076 | |
| 6 | A failed export stops with "Nothing was downloaded" | DataExport.tsx:158-161 | none | GAP | |
| 7 | Create a schedule for the ticked tables: name, every day or one weekday, time in IST, active flag | DataExport.tsx:328-393, 177-197 | DB guard in 0228 (admin) | NAR-004.1, NAR-004.2, NAR-004.5, NAR-004.6 | |
| 8 | Recipients cannot be chosen on screen; the page says so | DataExport.tsx:279-284 | — | NAR-004.7, NAR-004.8 | |
| 9 | The database refuses an unknown table, an audit table or a blank name, and shows its own words | DataExport.tsx:191-196 | 0228 guard | NAR-004.3, NAR-004.4 | |
| 10 | Edit a schedule (its tables become the ticked ones) | DataExport.tsx:164-175, 315 | 0228 | partial: NAR-004.1 — "define"; editing not stated | |
| 11 | Pause / Resume a schedule | DataExport.tsx:208-213, 316-318 | 0228 | partial: NAR-004 — enable/disable not stated | |
| 12 | Delete a schedule (with a confirmation) | DataExport.tsx:199-206, 319 | 0228 | GAP | |
| 13 | Schedule list: name, tables, when, next run (or "paused"), last run with status/detail | DataExport.tsx:288-326 | admin read | partial: NAR-004.17 | |
| 14 | "What has been sent" run log, read-only | DataExport.tsx:398-420 | select-only grant (per comment 395-397) | NAR-004.17, NAR-004.19 | |
| 15 | Separate failure messages for the picker and the schedules, naming `data_export.sql` | DataExport.tsx:99-103, 111-115, 286 | none | GAP | Low |
| 16 | Notice that nothing is mailed until the mail function is deployed | DataExport.tsx:422-426 | none | GAP | Low |

### Device Cache Status (`/device-cache`) — `src/modules/DeviceCacheStatus.tsx`
Purpose: shows which person/device holds the offline machine register, Party Master and complaint list, and how old each copy is.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | One row per person per device, including every person who has never reported | DeviceCacheStatus.tsx:90-105; supabase.ts:5909-5913 | `mod:/device-cache`; `device_cache_report()` refuses without it (FRS-092.4) | URS-078, FRS-092 | |
| 2 | Columns: person (+ inactive), role, device label (user agent on hover), app version, machines + downloaded time, customers + time, complaints + time, problem (storage refused, download errors), last reported | DeviceCacheStatus.tsx:51-80 | as #1 | partial: URS-078 — machines, customers, times and last failure are stated. App version, complaints and the "storage refused" flag are not | |
| 3 | A computed State per row: Current (<6 h), Due a refresh (6–24 h), Older than a day, No copy on the device, Never reported | DeviceCacheStatus.tsx:35-46 | none | partial: URS-078 — "state its age". The bands are not stated | |
| 4 | State chips with exact counts; click to filter | DeviceCacheStatus.tsx:109-114, 145 | none | GAP | Low |
| 5 | Search by person, email, role or device | DeviceCacheStatus.tsx:116-120, 142 | none | GAP | Low |
| 6 | Summary line: N people, N devices, how reports arrive | DeviceCacheStatus.tsx:134-139 | none | GAP | Low |
| 7 | Refresh button with a synced-at time | DeviceCacheStatus.tsx:127-130 | none | GAP | Low |
| 8 | A load failure names `device_cache.sql` | DeviceCacheStatus.tsx:98-102, 132 | none | GAP | Low |

### Tracker (`/tracker`) — `src/modules/Tracker.tsx`
Purpose: a shared activity list that everyone who can open the page can add to and edit in place.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Seeing the page is the right to edit it | Tracker.tsx:56-58 | `mod:/tracker` (DB policy the same, per comment) | NAR-002 | |
| 2 | Add an item (appended at the end of the order); written to the audit log as `tracker.add` | Tracker.tsx:86-93, 130-132 | `mod:/tracker` | NAR-002 | |
| 3 | Edit title, detail, owner and area in place; each saves when you click away | Tracker.tsx:161-196, 78-84 | `mod:/tracker`; writable columns whitelisted (supabase.ts:560-563) | NAR-002 | |
| 4 | Change status (Open / In progress / Blocked / Done / Dropped, colour-coded) or due date; saves at once | Tracker.tsx:40-51, 181-200 | `mod:/tracker` | NAR-002 | |
| 5 | Delete an item for everybody (confirmation warns it is gone for all); written to the audit log as `tracker.delete` | Tracker.tsx:95-102, 201-203 | `mod:/tracker` | partial: NAR-002 — add and edit stated, delete not | |
| 6 | Done/Dropped are hidden by default; a tick shows them with a count | Tracker.tsx:104, 133-136 | none | GAP | |
| 7 | Each row shows a position number (renumbers with filter), with the durable id on hover | Tracker.tsx:159 | none | GAP | Low |
| 8 | "Last changed by X, time ago · raised by Y" on each row (stamped by the database) | Tracker.tsx:208-213 | DB stamps | GAP | |
| 9 | Open count in the header, a Refresh button, a not-connected banner, empty-state text, save/load errors shown | Tracker.tsx:109-126, 142-148, 81 | none | GAP | Low |

### Users (`/users`) — `src/App.tsx:190`
Purpose: a redirect only.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | `/users` redirects to `/user-master` (the User Master screen, `UserMasterView.tsx`, which is not part of this group) | App.tsx:190 | route guard on `/user-master` | partial: URS-002 declares `/users` | `src/modules/UsersAdmin.tsx` is not imported anywhere (dead code) |

### Roles & Permissions (`/roles`) — `src/modules/RolePermissions.tsx`
Purpose: the permission matrix (menu group → page → actions) per role, plus adding roles and exporting the matrix.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Edit with `rbac.manage`; read-only with `admin.view`; otherwise "You don't have permission" | RolePermissions.tsx:131-137, 520-523 | `mod:/roles` + `rbac.manage` / `admin.view` | FRS-079 (admin.view opens admin pages read-only); partial FRS-003 | |
| 2 | The matrix lists every role in the database, including roles added from the app | RolePermissions.tsx:35-49 | none | FRS-065 | |
| 3 | The matrix follows the stored permissions until you touch something (no reseeding over your edits) | RolePermissions.tsx:79-94 | none | GAP | |
| 4 | Matrix grouped by menu header → page → actions; expand/collapse each level, Expand all / Collapse all | RolePermissions.tsx:99-129, 424-425, 439-518 | none | GAP | Low |
| 5 | Tick/untick "View" (open the page) and each action per role | RolePermissions.tsx:140-148, 367-373 | `rbac.manage` | partial: FRS-003 — "each role maps to a permission set" | |
| 6 | "Everything on this page" tick/untick for one role | RolePermissions.tsx:150-158, 495-509 | `rbac.manage` | GAP | |
| 7 | Admin column always full and locked | RolePermissions.tsx:139, 370 | — | GAP | |
| 8 | Each master value list appears as its own page with per-list add/edit/delete | RolePermissions.tsx:104-119 | none | FRS-015 | |
| 9 | Save writes ONLY the roles I touched; the admin list is re-asserted when it has fallen behind; "Nothing was changed" when nothing was touched | RolePermissions.tsx:309-365 | `rbac.manage`; `app_roles` RLS | GAP | High: this rule is what stops one save overwriting every tuned role |
| 10 | Save refuses a role left with no permissions ticked ("empty means not configured") | RolePermissions.tsx:340-345 | `rbac.manage` | URS-056 | |
| 11 | Save is written to the audit log as `rbac.save` with the role keys only — not what changed | RolePermissions.tsx:359 | client-written | partial: URS-016 — no before/after of a permission change is kept (`app_roles` is not under record_audit) | High |
| 12 | Add a role: name → key (slug), must copy an existing role, key must not be reserved / taken / start with a digit; Admin as the source copies everything | RolePermissions.tsx:287-307, 385-414; rbac.ts:644-659 | `rbac.manage` | URS-056, FRS-065 | |
| 13 | Roles cannot be deleted here (explained on screen) | RolePermissions.tsx:415-418 | — | FRS-065 | |
| 14 | Export the matrix to .xlsx: a Matrix sheet (group, page, route, grant, key, Yes/No per role), a Roles sheet (count held, stored vs NOT CONFIGURED fallback), and a "How to read this" sheet (who, when, saved/UNSAVED). Written to the audit log as `rbac.export`; allowed to read-only viewers too | RolePermissions.tsx:184-279, 430-433 | `rbac.manage` or `admin.view`; not `export.data` (xlsx) | GAP | Medium |
| 15 | Success/error banner, dismissable | RolePermissions.tsx:378-383 | none | GAP | Low |

### Audit Log (`/audit`) — `src/modules/AuditLog.tsx`
Purpose: read the client-written `audit_log` of actions, logins, errors and durations, with filters and CSV export.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Screen requires `audit.view` | AuditLog.tsx:120-122 | `mod:/audit` + `audit.view`; RLS on `audit_log` | partial: FRS-021 — the trail is described. Who may read it is stated only in the checklist, not a URS/FRS | |
| 2 | Table of time, user, email, role, action, target, status (ok/error badge), duration ms, error | AuditLog.tsx:21-31 | as #1 | FRS-021, URS-016 | |
| 3 | Filter by action (contains), email (contains), status (ok/error); run in the database, debounced | AuditLog.tsx:85-98, 150-155; supabase.ts:2696-2704 | as #1 | GAP | |
| 4 | Load more, 500 at a time | AuditLog.tsx:100-109, 144-146 | as #1 | GAP | Low |
| 5 | Up to 1,500 audit rows are CACHED IN THE BROWSER (localStorage), shown instantly next time as "Showing cached — synced X ago", refreshed when older than 30 min | AuditLog.tsx:37-42, 64-71; cache.ts:9-10, 24-29 | none | GAP | Medium: audit data persists on the device; sign-out does not clear `rithi.cache.*` (auth.tsx:547-563) |
| 6 | Background re-sync every 30 min while no filter is set | AuditLog.tsx:79-83; cache.ts:43-57 | none | GAP | Low |
| 7 | Manual Refresh with a synced-at time | AuditLog.tsx:126-129, 52-62 | none | GAP | Low |
| 8 | Export CSV of the loaded rows, with a pop-up warning when more rows exist | AuditLog.tsx:157-159; exportscope.ts:111-124 | `export.data` | FRS-018; partial (no partial-export warning in any requirement) | |
| 9 | Column layout remembered | AuditLog.tsx:141 | none | GAP | Low |
| 10 | The database-enforced trail (`record_audit`) is NOT viewable on this screen | AuditLog.tsx (reads `audit_log` only) | — | partial: FRS-021 — says record_audit exists; how it is read is not stated | |

### Admin Config (`/admin-config`) — `src/modules/AdminConfig.tsx` (+ `SlaRulesCard`, `CallRegistrationCard`, `FrequentFailureCard`, `AuditModeCard`, `DataImport`)
Purpose: holds the legacy importer (see its own section above), SLA targets, the Hotline desk default, the frequent-failure rule and Audit Mode.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | The page stacks the five cards | AdminConfig.tsx:22-41 | `mod:/admin-config` | partial: URS-014 declares the screen | |
| 2 | SLA Targets: edit each rule's hours (minimum 1) and on/off; Save sends only the changed rules; Refresh | SlaRulesCard.tsx:31-45, 61-89 | UI: none beyond the route (inputs disabled only when offline); DB `sla_write` = admin or `config.manage` (0044:41-43) | URS-014, FRS-019 | SR-010: the rule set cannot express the procedure's matrix |
| 3 | SLA shows defaults when the table is missing or empty, and names 0044 | SlaRulesCard.tsx:18-28 | none | GAP | Low |
| 4 | SLA changes are not audit-logged | SlaRulesCard.tsx (no logAudit) | — | partial: URS-016 | Medium |
| 5 | Hotline desk: choose which Hotline profile new calls are filed to. Saves immediately on pick; clearing falls back to the single hotline profile; shows who resolves now | CallRegistrationCard.tsx:50-58, 75-91 | UI `isAdmin`; DB `app_settings_write` = admin or `config.manage` (0047:22-24) | FRS-051, URS-044 | Saved with no confirmation, reason or audit entry |
| 6 | Hotline desk: "No Hotline desk found" guidance; load failure names `call_requests.sql` | CallRegistrationCard.tsx:33-47 | none | GAP | Low |
| 7 | Frequent Failure rule 1: window (months ≥1), failures needed (≥1, counting this call), same-equipment-needs-same-complaint flag | FrequentFailureCard.tsx:79-101, 64 | Save button admin-only in UI; DB `app_settings` = admin or `config.manage` | URS-046, FRS-054 | |
| 8 | Frequent Failure rule 2: on/off, window (days ≥1), distinct serials needed (≥2) | FrequentFailureCard.tsx:107-136 | as #7 | GAP | High: changes future Review 2 verdicts. Rule 2 is in no requirement |
| 9 | Saving says it applies from now on and recorded answers are unchanged | FrequentFailureCard.tsx:55-62, 74-77 | — | FRS-054 | Not audit-logged |
| 10 | Audit Mode: show ON/OFF; an admin switches it with a required reason; history table (when, to, reason, by) for admins | AuditModeCard.tsx:44-122 | UI `isAdmin`; DB `set_audit_mode()` refuses non-admin | NAR-001 | |
| 11 | Card says nothing behaves differently while Audit Mode is on | AuditModeCard.tsx:73-78 | — | NAR-001 | |

### Software Validation (`/software-validation`) — `src/modules/SoftwareValidation.tsx`
Purpose: shows the whole validation package in tabs, prints it, and records IQ/OQ/PQ execution results.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | 24 tabs: Overview, Plan, Checklist, Requirements by Module, Traceability Matrix, URS, FRS, NAR, Defects, Architecture, Design, Config Spec, Risk, FMEA, Security, Data Integrity, Migration, Backup, Supplier, Procedures, Test Protocol, Traceability, CAPA, Summary Report | SoftwareValidation.tsx:31-66, 112-116 | `mod:/software-validation` (admin module) | partial: SR-037 / URS-019 — validation is required; viewing it in-app is not stated | Two tabs share key `'trace'` (:46, :63), so clicking either shows both sections |
| 2 | Requirements by Module with gap tables (unimplemented URS, unproved FRS, untested URS) and screens with no requirement, with their reasons | SoftwareValidation.tsx:164-300 | as #1 | GAP | Derived from `src/lib/requirements.ts` |
| 3 | Six-column traceability matrix, one row per link, with counts; tests outside it named | SoftwareValidation.tsx:302-378 | as #1 | GAP | |
| 4 | Print the current tab / print the full package | SoftwareValidation.tsx:78, 105 | as #1 | GAP | Low |
| 5 | Record a test result (Pass / Fail / N/A), actual result and tester per test; saves on change/blur. The DB stamps `recorded_by` and `executed_at` | SoftwareValidation.tsx:84-87, 627-635; 0046_validation_results.sql:19-27 | UI `config.manage` or `manage-users`; DB `valres_write` = admin or `config.manage` (0046:38-41) | partial: URS-019 — "tested and approved". Recording execution evidence is not stated | High: see #6–#8 |
| 6 | Only ONE result per test is kept (upsert on test_id), so a re-execution overwrites the earlier evidence. `executed_at` is set only the first time, so a later result keeps the first date | supabase.ts:5247-5250; 0046_validation_results.sql:24-26 | — | GAP | High: validation evidence overwritten / dated wrongly |
| 7 | "Tester" is free text, not the signed-in person. `recorded_by` is stored but not shown | SoftwareValidation.tsx:633, 636-643 | — | GAP | High: misattribution risk |
| 8 | A failed save is silently ignored. A `manage-users` holder without `config.manage` sees the controls and the DB refuses | SoftwareValidation.tsx:74, 84-87 | — | GAP | Medium |
| 9 | Execution summary: recorded / total, pass, fail; "read-only for your role" | SoftwareValidation.tsx:88-92, 609-613, 687 | none | GAP | |
| 10 | Blank approval, CAPA and checklist evidence tables for wet signature | SoftwareValidation.tsx:133-137, 152-157, 672-681, 694-696 | none | GAP | |

### Settings (`/settings`) — `src/modules/Settings.tsx` (+ `DbConnection.tsx`, `SheetConnection.tsx`, `TemplatePlaceholder.tsx`)
Purpose: the browser's database and CallReg connections, a design reference, template placeholders, and a demo-data reset.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Change with `manage-users`; read-only with `admin.view` (banner); otherwise a "Restricted — use Profile" notice | Settings.tsx:32-57 | `mod:/settings` + `manage-users` / `admin.view` | FRS-079 (read-only admin pages) | `MODULES_WITHOUT_REQUIREMENT` records Settings as having no requirement |
| 2 | Database connection: enter a Supabase Project URL and anon key; Save; Test (saves first, then counts calls) | DbConnection.tsx:21-53; supabase.ts:54-60 | `manage-users` (UI only); stored in this browser's localStorage | GAP | High: repoints where this browser reads and WRITES every record. validation.ts:221 says nothing about the quality record depends on Settings, which this contradicts |
| 3 | Google Sheet (CallReg) connection: URL and Field tab; Test lists tabs; Save | SheetConnection.tsx:17-85 | `manage-users` (UI only); localStorage | GAP | High: the bridge also carries Drive uploads (e.g. R&R documents, PersonProfile.tsx:73) |
| 4 | Design System Defaults: a static description | Settings.tsx:67-97 | none | GAP | Low |
| 5 | Document Templates: add/edit a text template for 5 keys, saved only in this browser's local demo store; nothing reads them | Settings.tsx:104-117; TemplatePlaceholder.tsx:43-50 | `manage-users` | GAP | Low. Also listed in `clearDemoData` (seed.ts:9) |
| 6 | Reset Demo Data (with a confirmation): clears local `rithi.db.*` except users and reloads | Settings.tsx:18-24, 121-129 | `manage-users` | GAP | Low (local only) |

### My Profile (`/profile`) — `src/modules/Profile.tsx` (+ `ChangePassword.tsx`, `components/people/MyPeople.tsx`, `PersonProfile.tsx`)
Purpose: your own account, details, R&R and training, your team, effective permissions, signature, password and theme.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Account table: name, email, designation, "Permission" (role label), region | Profile.tsx:22-35, 59-72 | none (not a module; always open) | GAP | Low |
| 2 | A banner when the profile did not load ("treated as an Engineer until one exists") | Profile.tsx:47-57 | none | GAP | See app-wide #6 |
| 3 | My details: name, employee code, joining date, department, designation, managers, mail IDs, region, current R&R | PersonProfile.tsx:120-131; MyPeople.tsx:22-51 | DB `may_see_person()` (0264) | URS-079, FRS-093 | Matched to the User Master by sign-in email |
| 4 | Edit employee code and joining date | PersonProfile.tsx:57-63, 141-156 | `users.manage` | URS-079, FRS-093 | |
| 5 | Add a new R&R: title, Effective From (required), To (≥ From), upload a document to Drive (size-limited) or paste a link (required), notes. It closes the previous one | PersonProfile.tsx:66-92, 167-201 | `users.manage` or `training.manage` | URS-079, FRS-093 | `uploaded_by_name` is sent by the client (:88) |
| 6 | Change an R&R period | PersonProfile.tsx:93-99, 211-228 | `users.manage` or `training.manage` | partial: URS-079 — periods are stated, editing them afterwards is not | Medium |
| 7 | Training to do (topic, assigned, due, status); acknowledge "Read & understood" on my own (with a confirmation) | PersonProfile.tsx:101-106, 238-258 | own row only (`isMe`, :33); DB `acknowledge_training()` | URS-079, FRS-093 | |
| 8 | Past training grouped by topic/document revision: date, how, trainer, assessment, evidence links | PersonProfile.tsx:108-117, 260-285 | `may_see_person` | URS-079 | |
| 9 | My team list (reporting tree) and each member's profile in a drawer | MyPeople.tsx:30-39, 52-73 | `visible_engineer_names()` + `may_see_person` | URS-079 | |
| 10 | "What I can do": role in effect, where the permissions come from (stored vs built-in defaults), personal extra permissions, lists of actions and pages, a preview banner | Profile.tsx:271-346 | none | GAP | Medium: explains access; wrong text misleads |
| 11 | My Signature: draw or upload; name and designation lines; preview "as it will print"; Save; Remove; privacy statement | Profile.tsx:148-265 | DB: owner-only policies (0172) | URS-057, FRS-066, FRS-067, FRS-068 | |
| 12 | Change password: current password verified first; new one ≥ 8 characters, confirmed, different from current. Only for database logins | ChangePassword.tsx:21-37 | own session | partial: FRS-001 — authentication stated. Password rules are not | Medium |
| 13 | Appearance: pick a theme (saved per device) | Profile.tsx:103-126; ThemeProvider.tsx:26-29 | none | GAP | Low |

### Version History (`/version-history`) — `src/modules/VersionHistory.tsx`
Purpose: shows the current build's identity and the in-app change log.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Current build: version, build number, build ID, build time | VersionHistory.tsx:16-23 | `mod:/version-history` | URS-019, FRS-024 | |
| 2 | Change log table: version, date, summary, list of changes | VersionHistory.tsx:27-54 | as #1 | FRS-024 | |

### App-wide: sign-in, reset password, auth, route guard — `src/modules/Login.tsx`, `src/modules/ResetPassword.tsx`, `src/lib/auth.tsx`, `src/App.tsx`
Purpose: who gets in, as whom, and what every screen checks before it opens.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Sign in with email/Gmail and password (Supabase Auth); friendly messages for wrong password / unconfirmed email | Login.tsx:22-34; auth.tsx:478-487 | Supabase Auth | URS-001, FRS-001 | |
| 2 | A failed sign-in is written to the audit log (`login_failed` with the typed email, error, duration). A successful one is logged as `login` | auth.tsx:482, 507 | client-written | partial: FRS-021 — user actions stated; login events not named | |
| 3 | A disabled login (profile inactive) is refused, logged and signed out. An already-open session is signed out on the next load | auth.tsx:350-355, 500-505 | profiles.active | FRS-002 | |
| 4 | If my own profile cannot be read at sign-in, I am signed out with the error | auth.tsx:489-496, 339-346 | — | GAP | Medium |
| 5 | On first sign-in with no profile, one is created from my User Master row | supabase.ts:4213-4215 (`ensureMyProfile`) | — | partial: FRS-002 — "created from User Master" | |
| 6 | With neither a profile nor a User Master row I stay signed in as an "unresolved" identity that runs with the Engineer fallback | supabase.ts:4216-4237; auth.tsx:36-38 | client `can()` uses engineer defaults | GAP | High: grants engineer-level access to an unknown login |
| 7 | "Forgotten your password? Ask an administrator" — no self-service reset | Login.tsx:70-75 | — | GAP | ResetPassword footer (:57) contradicts it ("request a new one from the sign-in screen") |
| 8 | Reset/invite link: set a new password (≥ 8, confirmed); Cancel signs out. An expired link returns to sign-in with the reason | ResetPassword.tsx:14-60; auth.tsx:312-323; Login.tsx:14; App.tsx:85 | recovery session | partial: FRS-001 — "first sign-in forces a password set" | |
| 9 | Fallback sign-in when Supabase is not configured in this browser: local demo accounts with known seeded passwords, including a hard-coded admin hash for a real e-mail. There is also a CallReg "User Master" sign-in whose first-login password needs only 5 characters | auth.tsx:143-182, 510-545; Login.tsx:36-45 | local only | GAP | High: reachable by repointing Settings (Settings #2) |
| 10 | Super-admin e-mail list in the client grants all rights in the browser (mirrored by `app_super_admins` in the DB) | auth.tsx:51-57, 387, 595 | hard-coded | GAP | High: no requirement names super admin |
| 11 | Every permission check (`can`): admin/super-admin all; otherwise role set (stored, or defaults when empty) + personal extra permissions + parent fallback | auth.tsx:591-608 | app_roles | FRS-003, FRS-004 | |
| 12 | Permission changes reach an open tab when it regains focus (throttled to one per minute) | auth.tsx:298-310 | — | GAP | Medium |
| 13 | Route guard: a known module I lack shows "🔒 You don't have access… ask an administrator"; unknown paths go to the Dashboard | App.tsx:107-120, 206 | `mod:<path>` | URS-002, FRS-003 | `/exports/<tab>` and `/masters/*` handled separately |
| 14 | Printable routes (`/dc/`, `/declaration/`, `/ffr/`) render with no menu and are RLS-scoped | App.tsx:88-105 | RLS | GAP | Low |
| 15 | A render error in one screen shows an error box instead of a white page | App.tsx:126, 218 | — | GAP | Low |
| 16 | "Loading…" while a saved session is restored (no login flash) | App.tsx:81-82 | — | GAP | Low |
| 17 | Demo data is cleared once on first sign-in | App.tsx:77-79; seed.ts:12-21 | — | GAP | Low |
| 18 | Sign out: logged as `logout`, clears my notifications, wipes this device's offline machine/party copy (after reporting it), ends any "View as" preview | auth.tsx:547-563; supabase.ts:4193-4197; machinestore.ts:282-295 | — | partial: FRS-092.5 — reports on sign-out. Wiping the copy is not stated | High: exposure on a shared device. Screen caches (`rithi.cache.*`, incl. the audit log) are NOT cleared |
| 19 | Central export gate: CSV downloads refuse "not permitted for your role" without `export.data` | format.tsx:141-158; auth.tsx:611-612 | `export.data` | FRS-018 | Excel (`xlsxDownload`) and ZIP downloads do not consult it |
| 20 | Partial-download warning: a confirm pop-up when rows beyond those loaded exist (CSV and Excel) | exportscope.ts:111-124; format.tsx:160; xlsx.ts:212 | — | GAP | Medium (only hand-stock completeness is stated, URS-077) |
| 21 | Audit helper: `logAudit` fire-and-forget with actor/role/email; `withAudit` records outcome + duration | audit.ts:26-51 | client-written | FRS-021 | FRS-021 states it can be bypassed |

### App-wide: menu, header, update banner, notifications, "View as", offline cache — `src/components/layout/Layout.tsx`, `NotificationBell.tsx`, `ViewAs.tsx`, `src/lib/machinestore.ts`, `src/lib/counts.ts`
Purpose: the application frame and the background behaviour that runs on every page.

| # | Capability (plain words a user would use) | Where (file:line) | Guard (permission key / admin / none / DB policy if known) | Covered by | Note |
|---|---|---|---|---|---|
| 1 | Grouped side menu. Entries show only when I hold their key (`perm`), when admin-only entries meet `manage-users`/`admin.view`, or when always open | Layout.tsx:44-287, 294-296, 561-563 | `mod:<path>` / `admin.view` | partial: FRS-003 — client scoping stated; menu rules not | Admin-only entries show on `admin.view` while pages may ask for their own key |
| 2 | Collapse/expand groups, Collapse all / Expand all, collapse sidebar to icons (remembered per device); mobile drawer | Layout.tsx:373-429, 507-515, 556-560 | none | GAP | Low |
| 3 | The Knowledge Base heading flashes until a page in it is opened on this device | Layout.tsx:381-392, 565, 591 | none | GAP | Low |
| 4 | Row counts next to menu entries ("1,000+" when partial), remembered in localStorage | Layout.tsx:595-597; counts.ts:15-51 | none | GAP | Medium: counts are not keyed by user, so a shared device shows the previous person's counts |
| 5 | "Search modules…" box jumps to any permitted screen (Enter = first match) | Layout.tsx:299-339 | same visibility as menu | GAP | Low |
| 6 | Breadcrumb "Group · Screen" | Layout.tsx:611, 709-716 | none | GAP | Low |
| 7 | Managers (rm/rgm): toggle "Team calls" / "My calls", remembered | Layout.tsx:613-621; auth.tsx:392-398 | rbacRole rm/rgm | partial: URS-002 — team scope stated; the toggle is not | |
| 8 | "View as": an admin picks any profile (search, first 60) and the app behaves with that person's permissions until Exit; persists across reloads; banner shown | ViewAs.tsx:15-77; auth.tsx:250-252, 388-404, 592 | `isAdmin` | GAP | High: the code comment says "Nothing is written — a read-only preview" (ViewAs.tsx:12), but I found no write block. Writes run under the admin's own session |
| 9 | Notification bell: unread count polled every 60 s (99+), opens the latest 30, "Mark all read", clicking marks read and opens its link | NotificationBell.tsx:15-32, 36-63 | RLS (own notifications) | URS-015, FRS-020 | |
| 10 | Theme picker in the header (per device) | Layout.tsx:342-362, 624 | none | GAP | Low |
| 11 | User chip: name, designation, "Permission · role"; menu with My Profile, Clear Cache and Update, Sign out; "?" avatar when the profile did not load | Layout.tsx:626-673 | none | GAP | Low |
| 12 | Update banner: checks `version.json` on focus and every 5 min. Names the new version only when it differs, otherwise says "earlier build". "Update now" clears screen caches, keeps offline registers, reloads. ✕ dismisses | Layout.tsx:445-462, 496-505, 519-543 | none | GAP | Medium: a deployed fix stays invisible without it |
| 13 | "Clear Cache and Update" (footer and user menu): clears `rithi.cache.*`/`rithi.sync.*`, dropdown caches, browser caches and service workers, then hard-reloads (keeps offline registers) | Layout.tsx:465-483, 667-670, 695-702 | none | GAP | Low |
| 14 | Footer: version, build number, build ID, build time | Layout.tsx:680-687 | none | FRS-024 | |
| 15 | Offline copy of the machine register and Party Master per signed-in person in IndexedDB. Downloaded after sign-in; refreshed when older than 6 h, when the signal returns, when the tab becomes visible, and checked every 15 min. Standard complaints, spare products and accessories are warmed too | Layout.tsx:398-400; machinestore.ts:300-319, 146-156 | own session; RLS on source tables | URS-078 | |
| 16 | The offline copy is replaced only by a COMPLETE download. A stopped download resumes from the last id within 2 h. A copy downloaded for another user is ignored | machinestore.ts:125-136, 158-177, 191-198 | — | URS-078 | |
| 17 | Each device reports what it holds (counts, times, errors, storage OK, app version) after each download, and at least every 6 h | machinestore.ts:216-259; supabase.ts:5885-5896 | DB stamps user (FRS-092.2) | FRS-092 | |

---

### Gaps summary

Format: `<screen> — <capability> — <what a requirement would need to say> — risk`. High = could create, alter, lose or misattribute a quality/stock record, or wrongly expose data. Medium = wrong figure or decision support. Low = convenience.

### Reports hub
- Reports hub — per-report access keys (#1) — each report is separately grantable and the URL is checked as well as the tab strip — Medium
- Reports hub — unpermitted/bare link redirects to first permitted report (#2) — a link to a report the role may not open never opens it — Low
- Reports hub — "no report open to your role" notice (#3) — the screen says so when no report is grantable — Low
- Reports hub — one tab mounted at a time (#4) — none needed beyond performance — Low
- Reports / Consumption — database-side filters (#5) — the consumption report filters on call date, product, customer, city, engineer, part, UCN and call type over the whole register, not the loaded page — Medium
- Reports — exact matching-row count before download (#6) — a report states the exact number of rows it will export, and says so when it cannot count — Medium
- Reports — clear filter / filter described in words (#7) — the applied filter is shown in words — Low
- Reports — locked mandatory columns, optional picker, default-ticked columns (#8) — the report's fixed format is always included; optional columns are the reader's choice — Low
- Reports — column-choice shortcuts (#9) — none beyond convenience — Low
- Reports — view's column order, blanks for missing (#10) — column order is fixed by the report, not by selection — Low
- Reports — Excel download with Filter/scope sheet (#11) — every report workbook carries its scope (filter, row meaning, rows, columns, time); and export by Excel is subject to the same export authority as CSV — High (the Excel path bypasses `export.data`)
- Reports — buttons disabled offline / busy / not permitted / zero rows (#13) — none beyond convenience — Low
- Reports — export date/number typing (#14 partial, #15) — exported dates are real Excel dates in .xlsx and dd-MMM-yyyy HH:mm:ss in .csv; numbers stay numeric and digit identifiers stay text — Medium
- Reports — each download audit-logged (#16) — every report export is recorded with who, when, rows and filter — Medium
- Reports — empty/failed build messages (#17) — none beyond convenience — Low
- Reports — not-connected banner and denied note (#18) — none beyond convenience — Low
- Reports — report switch resets filter (#19) — a filter set for one report is never applied to another — Low
- Reports / Consumption — file notes on visit dates and fallbacks (#20) — the file states that visit dates are the call's latest visit and are "no later than" where there is no visit — Medium
- Reports / Call Report — one row per call, latest entry, spares booked excluding voids, exact status filter (#21) — the call report's row definition and its status derivation — Medium
- Reports / Feedback — feedback-date filter and source filter (#23) — the feedback report filters by the feedback's own date and can split uploaded vs entered-here — Medium
- Reports / Feedback — "a blank is not asked" note (#24) — the report states which questions apply to which visit type — Medium
- Reports / KPI Export — Field_INST columns and formulas (#25) — the KPI export's column set, inclusions (field + installation, no cancelled) and each computed field's rule (Attended/Solved days, TTA, TTS, Failure Month, Pending Days); plus who may export it — Medium
- Reports / KPI Export — registered date range + whole register (#26) — none beyond convenience — Low
- Reports / KPI Export — count on the button, failure banner (#27) — as reports #6 — Low
- Reports / KPI Export — Excel/CSV download and audit (#28) — export authority applies to Excel as well as CSV; the KPI export has no report-level export right at all — High
- Reports / KPI Export — column list display (#29) — none — Low
- Reports / Unused spares — filters incl. engineer picker from the report (#31) — the unused-spares report filters by dispatch date, engineer, product, part — Low
- Reports / Unused spares — first-25 preview (#32) — none beyond convenience — Low
- Reports / Unused spares — Excel with About sheet, CSV, audit (#33) — as reports #11/#16 — High (Excel bypasses `export.data`)

### Bulk Uploads
- Bulk Uploads — admin-only gate beyond the module key (#1) — who may bulk-load each register — High
- Bulk Uploads — not-connected message (#2) — none — Low
- Bulk Uploads — "before you start" guidance (#3) — none — Low
- Bulk Uploads — grouped registers with live row counts (#4) — none beyond convenience — Low
- Bulk Uploads — header row located below letterhead (#5) — a file's header row is found by the register's own column names — Low
- Bulk Uploads — preview before write (#6) — every bulk load shows rows ready, rows held back with reasons, and unrecognised headers BEFORE anything is written — High
- Bulk Uploads — "nothing loadable" message (#7) — a file with no loadable row writes nothing and says why — Medium
- Bulk Uploads — required columns hold a row back (#8) — a row missing any required field is not loaded and is named — High
- Bulk Uploads — per-register reject rules (#9) — rows the database would refuse are held back by name so the rest loads — Medium
- Bulk Uploads — alias priority, losers to extra (#10) — when a file carries two headings for one field, which one wins — Medium
- Bulk Uploads — stamped values override the file (#11) — a register stamps call type / list name / source and ignores the file's own value — High
- Bulk Uploads — day-first dates, month-first only when proven and stated (#12) — how an imported date is read, and that a non-default reading is disclosed — Medium
- Bulk Uploads — unreadable typed cells kept in extra (#13) — an unreadable value is retained, never silently dropped — Medium
- Bulk Uploads — unknown headers kept / ignored headers dropped (#14) — what happens to a column the register does not map — Medium
- Bulk Uploads — in-file duplicate keys: last wins or quantities summed (#15) — how duplicate rows inside one file are resolved — High
- Bulk Uploads — controlled vocabularies applied during shaping (#16) — cover/approval/category values are normalised on import; unknown values kept unchanged — Medium
- Bulk Uploads — preparation step before confirmation (#17) — the count approved equals the count written for every register with a preparation step — Medium
- Bulk Uploads — confirmation with re-run warning (#18) — the operator confirms the count and is told whether a re-run corrects or duplicates — Medium
- Bulk Uploads — MRN Register and Stock Transfer Lines have no natural key (#21) — URS-062 requires one for every register; either give these a key or record the exception — High
- Bulk Uploads — failure reporting with rows written before stopping (#22) — a failed load reports how much was written, and whether a re-run is safe — High (partial writes stay)
- Bulk Uploads — offline copy refreshed after product/party load (#23) — none beyond convenience — Low
- Bulk Uploads — no audit-log entry for any upload (#24) — every bulk load is recorded with who, register, file, rows written — High
- Bulk Uploads — call registers load (#25) — calls loaded from a file: key, stamped type, database-assigned numbers, empty registrant — High
- Bulk Uploads — visit reports load (#26) — derived visit key, visit date required, entry date decides call status — High
- Bulk Uploads — Spare Request headers keyed on OR number (#28) — none beyond URS-062 — Low
- Bulk Uploads — Spare Request Lines create stub requests and re-point lines (#29) — the importer may create a request marked Imported for an orphan line, and loads approvals from a file — High
- Bulk Uploads — Stock Out Register load (#30) — dispatches loaded from a file, and whose name they carry — Medium
- Bulk Uploads — Consumption load files visits from the file (#31) — the consumption importer creates a visit per UCN from the file's dates, holds back undated calls, and what status those calls take — High
- Bulk Uploads — MRN import bypasses the stock guard (#32) — imported historical returns are exempt from the hand-stock cap, and how that is marked — High
- Bulk Uploads — Stock Transfer import bypasses the stock guard (#33) — as #32 — High
- Bulk Uploads — Stock Transfer Lines held back when parent missing (#34) — none beyond #9 — Medium
- Bulk Uploads — historical consumption / stock-out keys and source derivation (#36) — how migrated stock rows are keyed and assigned to a year — Medium
- Bulk Uploads — QMS Master List load (#37) — QMS documents may be bulk-loaded, keyed on number + revision, without assigning training — Medium
- Bulk Uploads — Customer Feedback marked imported (#38) — feedback imported from the superseded system is distinguishable — Low
- Bulk Uploads — DCCR Register loads reviewer names from a file (#40) — how a migrated review's reviewer is recorded, reconciled with URS-058 — High
- Bulk Uploads — Party Master load and Party key assignment (#41) — keyed on name; each party gets a stable key on first load — Medium
- Bulk Uploads — Product Database blank cell clears the column (#42) — the exception to URS-040 for a whole-row master export, stated explicitly — High
- Bulk Uploads — Product Master load (#43) — product lines keyed on code; Active decides only new sales — Low
- Bulk Uploads — Part Master load, category normalisation, inactive retired (#44) — none beyond URS-010 — Low
- Bulk Uploads — cover exports shaped, stub entries created (#47) — importing the four AppSheet exports in any order creates stub entries later filled — Medium
- Bulk Uploads — master value list per-list uploaders (#48) — none beyond URS-010 — Low
- Bulk Uploads — Standard Complaint list matched by key, never renamed; Products column sets mapping (#49) — a complaint upload never renames a complaint and changes product mapping only when the file carries Products — Medium
- Bulk Uploads — dismiss message (#50) — none — Low

### Legacy Data Import panel
- Legacy Data Import — admin-only panel (#1) — who may use the legacy importer — Medium
- Legacy Data Import — banner to Bulk Uploads (#2) — none — Low
- Legacy Data Import — table counts and refresh (#3) — none — Low
- Legacy Data Import — auto-detected target, no preview, no confirmation (#4) — a legacy import is detected, previewed and confirmed before writing, or is retired — High
- Legacy Data Import — user_directory and MRN plain inserts, duplicate on re-run (#5) — URS-062 applies here too — High
- Legacy Data Import — automatic Normalise cover after cover import (#6) — the normalisation states what it changes before it changes it (URS-072 clause) — Medium
- Legacy Data Import — Normalise cover button (#7) — as #6 — Medium
- Legacy Data Import — no audit entry (#8) — legacy imports are recorded in the audit trail — High

### Data Export
- Data Export — screen gate (#1) — who may export whole tables — High
- Data Export — table list with approximate counts (#2) — the picker offers only exportable tables and says counts are estimates — Low
- Data Export — search/select all/clear (#3) — none — Low
- Data Export — download ZIP of whole tables as the user (#4) — manual full-table export runs under the reader's own access, is subject to the export authority, and is recorded in the audit trail — High
- Data Export — date formatting in CSVs (#5) — as reports #14 — Low
- Data Export — failed export downloads nothing (#6) — none — Low
- Data Export — edit a schedule (#10) — schedules may be amended, and the amendment recorded — Medium
- Data Export — pause/resume (#11) — schedules can be disabled without deletion — Medium
- Data Export — delete a schedule (#12) — deleting a schedule does not affect records of what was sent — Medium
- Data Export — schedule list with next/last run (#13) — none beyond NAR-004.17 — Low
- Data Export — separate failure banners (#15) — none — Low
- Data Export — mail side not deployed notice (#16) — none — Low

### Device Cache Status
- Device Cache — app version, complaints and storage-refused columns (#2) — the report also shows app version, the complaint list held, and whether the browser keeps a copy — Low
- Device Cache — state bands (#3) — the age bands used to call a copy current/due/old — Low
- Device Cache — state chips (#4) — none — Low
- Device Cache — search (#5) — none — Low
- Device Cache — summary line (#6) — none — Low
- Device Cache — refresh (#7) — none — Low
- Device Cache — load failure message (#8) — none — Low

### Tracker
- Tracker — delete an item for everybody (#5) — whether items may be deleted, and by whom — Low
- Tracker — hide Done/Dropped (#6) — none — Low
- Tracker — positional numbering (#7) — none — Low
- Tracker — last changed by / raised by (#8) — edits are attributed by the database — Low
- Tracker — count/refresh/banners (#9) — none — Low

### Users
- Users — `/users` redirect to User Master (#1) — URS-002 still declares `/users`; point it at `/user-master` — Low

### Roles & Permissions
- Roles & Permissions — read-only via admin.view / edit via rbac.manage (#1) — who may edit and who may only read the matrix — Medium
- Roles & Permissions — matrix follows stored permissions until edited (#3) — the matrix shows what is stored, never code defaults — High
- Roles & Permissions — grouped tree with expand/collapse (#4) — none — Low
- Roles & Permissions — per-role view/action ticks (#5) — each page's opening right and each action are granted separately per role — Medium
- Roles & Permissions — whole-page tick (#6) — none — Low
- Roles & Permissions — admin column always full (#7) — admin holds all permissions and cannot be narrowed — Medium
- Roles & Permissions — save only touched roles; admin list re-asserted (#9) — saving writes only the roles changed; untouched roles are never rewritten — High
- Roles & Permissions — save logged without before/after (#11) — each permission change is recorded with role, permission, old and new state, who and when — High
- Roles & Permissions — export matrix with provenance and unsaved flag (#14) — the matrix can be exported and the file states admin-is-full, not-configured fallbacks and unsaved state — Medium
- Roles & Permissions — messages (#15) — none — Low

### Audit Log
- Audit Log — reading requires audit.view (#1) — who may read the audit trail — High
- Audit Log — filters by action/email/status in the database (#3) — the trail is searchable by action, person and outcome — Medium
- Audit Log — load more (#4) — none — Low
- Audit Log — rows cached in browser storage and not cleared at sign-out (#5) — whether audit data may be kept on a device, and that it is removed at sign-out — Medium
- Audit Log — 30-min background sync (#6) — none — Low
- Audit Log — manual refresh (#7) — none — Low
- Audit Log — CSV export with partial warning (#8) — as app-wide #20 — Low
- Audit Log — layout remembered (#9) — none — Low
- Audit Log — record_audit not viewable here (#10) — how the database-enforced before/after trail is read and by whom — High

### Admin Config
- Admin Config — page composition (#1) — none — Low
- Admin Config — SLA defaults shown when table missing (#3) — none — Low
- Admin Config — SLA changes not audit-logged (#4) — changes to SLA targets are recorded — Medium
- Admin Config — Hotline desk guidance/failure messages (#6) — none — Low
- Admin Config — Frequent Failure rule 2 (#8) — the fleet rule (same complaint on N distinct serials of one product within D days), its defaults, who may change it, and that changes are recorded — High

### Software Validation
- Software Validation — package tabs (#1) — the validation package is viewable in-app by administrators (and the duplicate 'trace' tab key noted) — Low
- Software Validation — requirements-by-module and gap tables (#2) — none beyond reporting — Low
- Software Validation — traceability matrix (#3) — none beyond reporting — Low
- Software Validation — print tab / full package (#4) — none — Low
- Software Validation — record test results (#5) — test execution results are recorded in the system with the executing person taken from the session — High
- Software Validation — one result per test, overwritten; executed_at kept from first run (#6) — every execution is retained with its own date, a re-run never overwrites earlier evidence — High
- Software Validation — tester is free text (#7) — the tester is the authenticated person, or both are shown — High
- Software Validation — silent failure / mismatched UI and DB rights (#8) — a refused save is reported — Medium
- Software Validation — execution summary (#9) — none — Low
- Software Validation — blank signature/CAPA tables (#10) — none — Low

### Settings
- Settings — database connection (URL + key) editable per browser (#2) — who may change the backend a browser writes to, and that it is not a per-device preference; `MODULES_WITHOUT_REQUIREMENT` must be corrected — High
- Settings — CallReg/Drive bridge URL editable (#3) — as #2, since documents are uploaded through it — High
- Settings — design defaults text (#4) — none — Low
- Settings — local template placeholders (#5) — none (or remove) — Low
- Settings — reset demo data (#6) — none — Low

### My Profile
- Profile — account table (#1) — none — Low
- Profile — unresolved-profile banner (#2) — see app-wide #6 — Medium
- Profile — change an R&R period afterwards (#6) — R&R periods may be amended, by whom, and the amendment recorded — Medium
- Profile — "What I can do" panel (#10) — a person can see the permissions actually in effect and their source — Medium
- Profile — change password rules (#12) — password length/complexity and current-password check — Medium
- Profile — theme (#13) — none — Low

### App-wide: sign-in, auth, route guard
- App auth — login/login_failed audit events (#2) — sign-in successes and failures are recorded with identity and time — Medium
- App auth — profile read failure signs out (#4) — a person whose profile cannot be read is not admitted — Medium
- App auth — profile auto-created from User Master (#5) — first sign-in creates a profile from the User Master with its role — Medium
- App auth — unresolved identity runs as Engineer fallback (#6) — a login with no profile and no User Master row is admitted with no permissions, or with a stated minimal set — High
- App auth — no self-service reset; footer contradiction (#7) — how a forgotten password is reset — Low
- App auth — reset/invite link flow and password rules (#8) — reset and invite links set a password of stated strength and expire after one use — Medium
- App auth — local demo / CallReg fallback sign-in with seeded passwords (#9) — no sign-in path other than the production identity provider is available in a released build — High
- App auth — hard-coded super-admin list (#10) — super admin accounts, how they are designated, and that the client and database lists match — High
- App auth — permission changes applied on tab focus (#12) — a permission change takes effect in open sessions within a stated time — Medium
- App auth — printable routes without chrome (#14) — none beyond RLS — Low
- App auth — per-screen error boundary (#15) — none — Low
- App auth — no login flash during restore (#16) — none — Low
- App auth — demo data cleared (#17) — none — Low
- App auth — sign-out wipes offline copy but not screen caches (#18) — at sign-out every copy of records on the device is removed — High
- App auth — partial-download warning (#20) — any export from a partly-loaded list warns before writing and the file does not pass as complete — Medium

### App-wide: menu, header, update banner, notifications, "View as", offline cache
- App frame — menu visibility rules (#1) — a menu entry is shown exactly when its page opens for that role — Medium
- App frame — collapse/expand menu (#2) — none — Low
- App frame — flashing Knowledge Base heading (#3) — none — Low
- App frame — menu counts from device storage, not per user (#4) — counts shown are the viewer's own, and a lower bound is marked — Medium
- App frame — module search (#5) — none — Low
- App frame — breadcrumb (#6) — none — Low
- App frame — manager Team/My toggle (#7) — a manager may narrow to their own calls — Low
- App frame — "View as" preview (#8) — an administrator may preview another person's access; whether writes are blocked during preview; and that each preview is recorded — High
- App frame — theme picker (#10) — none — Low
- App frame — user chip/menu (#11) — none — Low
- App frame — update banner (#12) — an open session is told when a newer build is deployed and can update without losing offline data — Medium
- App frame — Clear Cache and Update (#13) — none beyond convenience — Low


---

# Where each gap is now stated

Every GAP and partial above, and the requirement that now states it, as filed with the validation package on 2026-09-30 (Rev 3.0). IDs are the package's final numbers. Where the behaviour is not yet what the requirement says, the requirement's test says it is expected to fail until the named defect (D-…) is fixed.

### Overview & Quality

- Dashboard — Field/Installation call counts (PM excluded, role-scoped) -> URS-093, FRS-116.1, FRS-116.12
- Dashboard — Pending Registrations card and its unreadable state -> FRS-116.2
- Dashboard — Calls This Month dating -> FRS-116.3
- Dashboard — SLA due-soon threshold -> FRS-116.4
- Dashboard — SLA needs-attention table -> FRS-116.5 (with FRS-019)
- Dashboard — open a call from a tile -> FRS-116.11
- Dashboard — SLA rules fallback -> FRS-116.6, D-024
- Dashboard — Public Health Threat / Serious Incident counts -> FRS-116.7
- Dashboard — Parties Served / Engineers Active -> FRS-116.8
- Dashboard — charts -> FRS-116.9
- Dashboard — Recent Calls list -> FRS-116.10
- Dashboard — scope chip -> FRS-116.12
- Dashboard — load/empty/not-connected messages -> FRS-116.12
- My Workload — per-section permission gating -> FRS-117.1
- My Workload — independent section loading -> FRS-117.2
- My Workload — wait for reporting scope -> FRS-117.3
- My Workload — Spare Requests section -> FRS-117.4
- My Workload — RM Approval section -> FRS-117.5
- My Workload — Pending Dispatch section -> FRS-117.6
- My Workload — Hand Stock section -> FRS-117.7
- My Workload — Material Returns section -> FRS-117.8
- My Workload — Stock Transfer section -> FRS-117.8
- My Workload — Daily Review section (APE card unfiltered) -> FRS-117.9, D-022
- My Workload — "+" lower bound -> FRS-117.10
- My Workload — figure vs queue cards -> FRS-117.11
- My Workload — register links, Refresh, synced time -> FRS-117.12
- My Workload — empty/counting messages -> FRS-117.12
- Product & Party Search — product-list fallback -> FRS-118.1
- Product & Party Search — serial-only contains search -> FRS-118.2
- Product & Party Search — 200-result cap -> FRS-118.3
- Product & Party Search — auto-open on a single match -> FRS-118.4
- Product & Party Search — party dropdown source -> FRS-118.5, AMEND FRS-037
- Product & Party Search — "+ Field call" from a machine -> FRS-118.6
- Product & Party Search — "Download again" -> FRS-118.7
- Product & Party Search — table sort/resize/columns -> FRS-118.8
- Product & Party Search — validation and empty messages -> FRS-118.9
- Machine History — free-text serial -> FRS-119.1
- Machine History — arrival by link -> FRS-119.2
- Machine History — "where it is now" panel -> FRS-119.4
- Machine History — party-mismatch warning -> FRS-119.5
- Machine History — "not on Product Database" note -> FRS-119.5
- Machine History — timeline and register labels -> FRS-119.6
- Machine History — voided/cancelled/migrated markings -> FRS-119.7
- Machine History — filter chips -> FRS-119.6
- Machine History — lookup audit -> FRS-119.11
- Machine History — silent per-register failure and row caps -> URS-096, FRS-119.8, FRS-119.9, D-019
- Machine History — UCN colouring -> FRS-119.12
- Machine History — messages -> FRS-119.12
- Daily Complaint Review Register — tab structure and counts -> FRS-107.1
- Daily Complaint Review Register — register filters and default year -> FRS-107.2, FRS-107.3
- Daily Complaint Review Register — arriving filter from Workload -> FRS-107.4
- Daily Complaint Review Register — paging, load-in-full worklists, "+" -> FRS-107.5, FRS-107.6, FRS-107.7
- Daily Complaint Review Register — exact counts, failed count shows no figure -> FRS-107.8
- Daily Complaint Review Register — stale-database banner -> FRS-107.10
- Daily Complaint Review Register — automatic Review 2 = NO each morning -> URS-080, FRS-096, FRS-097, AMEND URS-058/FRS-069, D-028
- Daily Complaint Review Register — three-pane desk with remembered widths -> FRS-108.1
- Daily Complaint Review Register — desk grouping and first-year marking -> FRS-108.2
- Daily Complaint Review Register — bulk Review 2 = NO -> URS-083, FRS-101
- Daily Complaint Review Register — auto save -> URS-083, FRS-102
- Daily Complaint Review Register — DCCR export format -> FRS-108.5, FRS-108.6
- Daily Complaint Review Register — open a review in a drawer -> FRS-108.3
- Daily Complaint Review Register — call card -> FRS-103.1
- Daily Complaint Review Register — report context (hour meter, software, visits) -> FRS-103.4
- Daily Complaint Review Register — in-app service report preview -> FRS-103.5
- Daily Complaint Review Register — spares table -> FRS-103.6
- Daily Complaint Review Register — machine history pop-up -> FRS-103.7
- Daily Complaint Review Register — manual "Raise FFR" from the review -> URS-081, FRS-099
- Daily Complaint Review Register — Review 1 display -> FRS-103.2
- Daily Complaint Review Register — Review 2 answers and "All NO" -> FRS-103.9
- Daily Complaint Review Register — age-at-failure first-year warning -> FRS-103.3
- Daily Complaint Review Register — frequent-failure rule 2 -> FRS-104
- Daily Complaint Review Register — live Any Potential Effect preview -> FRS-103.8
- Daily Complaint Review Register — automatic FFR on Any Potential Effect = YES -> URS-081, FRS-098, D-029
- Daily Complaint Review Register — Review 3 lists narrowed by product -> FRS-105.1, FRS-105.2, FRS-105.3
- Daily Complaint Review Register — "Change product?" -> URS-085, FRS-105.4, FRS-105.5, FRS-105.6
- Daily Complaint Review Register — Service Dept Observation / Action Taken -> FRS-105.7, FRS-105.8
- Daily Complaint Review Register — administrator override of review dates -> URS-086, FRS-106, D-020
- Daily Complaint Review Register — read-only without review.edit -> FRS-108.4
- Daily Complaint Review Register — audit entries -> FRS-108.7
- Daily Complaint Review Register — UCN colouring -> FRS-107.11, FRS-103.1
- (decision 3) Bulk Uploads — DCCR Register historical load -> URS-082, FRS-100, D-029
- Product Failure Analysis — 8,000-row load cap and "+" -> FRS-113.1
- Product Failure Analysis — year window and migrated warning -> FRS-113.2
- Product Failure Analysis — KPI cards -> FRS-113.3
- Product Failure Analysis — built-in analyses and counting under the corrected product -> FRS-113.4, FRS-105.5
- Product Failure Analysis — chart plus side table and labels -> FRS-113.5
- Product Failure Analysis — cross-filter -> FRS-113.6
- Product Failure Analysis — .xlsx downloads not gated by export.data -> URS-149, FRS-112, D-018
- Product Failure Analysis — trend chart and download -> FRS-113.7, FRS-112.3
- Product Failure Analysis — saved/shared charts -> FRS-113.8
- Product Failure Analysis — messages -> FRS-113.12
- Spare Insights — date window and "This year" -> FRS-114.1, D-023
- Spare Insights — auto-recalculate -> FRS-114.2
- Spare Insights — DB computation under consumption RLS -> FRS-114.3
- Spare Insights — KPI cards (never-zero unclassified %) -> FRS-114.6
- Spare Insights — unclassified banner -> FRS-114.7
- Spare Insights — consumable vs spare split -> FRS-114.8
- Spare Insights — top parts -> FRS-114.8
- Spare Insights — by product with top-25 note -> FRS-114.8
- Spare Insights — by month -> FRS-114.9
- Spare Insights — voided excluded, dated by booking (IST) -> FRS-114.4, FRS-114.5
- Spare Insights — messages -> FRS-114.10
- Call Review — search -> FRS-120.1
- Call Review — tabs -> FRS-120.2
- Call Review — empty-list wording by scope -> FRS-120.3
- Call Review — Load more -> FRS-120.4
- Call Review — desk layout -> FRS-120.5
- Call Review — call details pane -> FRS-120.5
- Call Review — re-marking and remarks -> FRS-120.6
- Call Review — Reco/Re-open authority mismatch -> FRS-120.7, FRS-120.8, D-025
- Call Review — re-open reason enforced by the database -> FRS-120.9, D-025
- Call Review — context pane display and report links -> FRS-120.10
- Call Review — audit -> FRS-120.11
- Call Review — read-only message -> FRS-120.11
- KPI & Failure Analysis — missing-view message -> FRS-115.6
- KPI & Failure Analysis — other cards -> FRS-115.1
- KPI & Failure Analysis — cover vocabulary bucketing -> FRS-115.2
- KPI & Failure Analysis — product/region chips -> FRS-115.3
- KPI & Failure Analysis — rate-row click filter -> FRS-115.4
- KPI & Failure Analysis — drill-through to calls by complaint -> FRS-115.5
- KPI & Failure Analysis — scope chip/refresh -> FRS-115.7
- Objective — objectives table and good/bad colouring -> URS-098, FRS-121.1
- Objective — monthly/quarterly explanation -> FRS-121.1
- Objective — typing a monthly figure -> FRS-121.2, FRS-121.6
- Objective — Re-calculate -> FRS-121.3, FRS-121.6
- Objective — per-month cut-off dates -> FRS-121.4, FRS-121.6
- Objective — administrator cut-off lock -> FRS-121.4
- Objective — add an objective -> FRS-121.5
- Objective — edit definition / formula / parameters -> FRS-121.5
- Objective — delete an objective and its figures -> FRS-121.7, D-021
- Objective — evidence download (and export restriction) -> FRS-121.8, FRS-112.3
- Objective — evidence messages -> FRS-121.8
- Objective — computed-column explanation and the stale "every figure is typed" line -> FRS-121.9, D-021
- Objective — scope chip/messages -> FRS-121.10
- Field Failure Register — read scope (ffr.view whole register) -> FRS-110.6
- Field Failure Register — access-vs-empty banner -> FRS-110.7
- Field Failure Register — year and product filters -> FRS-110.9
- Field Failure Register — tabs and desk/table views -> FRS-110.4, FRS-110.10
- Field Failure Register — manual Raise FFR -> FRS-099
- Field Failure Register — pre-fill from review -> FRS-099.3, FRS-099.4
- Field Failure Register — FFR numbering -> FRS-109.2, FRS-109.3
- Field Failure Register — form fields and vocabularies -> FRS-109.1
- Field Failure Register — required fields -> FRS-109.4, D-027
- Field Failure Register — Raised By stamping on a manual raise -> FRS-109.5
- Field Failure Register — editing and weekly review -> FRS-110.1, FRS-110.2, D-027
- Field Failure Register — live call columns and "withdrawn" badge -> FRS-110.5
- Field Failure Register — desk (Due a review, the call as it stands now) -> FRS-110.4
- Field Failure Register — call context via ffr_call_context -> FRS-111.1, FRS-111.2, FRS-111.3
- Field Failure Register — no deletion of reports -> FRS-110.8
- Field Failure Register — Insights cards other than migrated -> URS-089, FRS-113.9
- Field Failure Register — Insights cross-filter -> FRS-113.10
- Field Failure Register — Insights charts -> FRS-113.11
- Field Failure Register — trend download not export-gated -> FRS-112.3, D-018
- Field Failure Register — Pareto drill and download not export-gated (and missing raw column) -> FRS-113.11, FRS-112.3, FRS-112.7, D-018
- Field Failure Register — (decision 2) CAPA fields blank on an automatic report -> FRS-098.6, D-029
- Field Failure Report print page — no module key on /ffr/:ffrNo -> FRS-111.4, D-026
- Field Failure Report print page — print audit and navigation -> FRS-111.5
- NOT GIVEN A REQUIREMENT: dashboard.view and consumption.view sit in PERM_TREE (rbac.ts:462, :488) and no screen tests them. Whether to remove them from the matrix or make the screens test them is a permission-matrix decision, not a requirement of these screens.
### Service Calls & Feedback

- Request Registration #1 list newest first, page size -> FRS-122.1
- Request Registration #2 "+" on the count -> FRS-122.2
- Request Registration #3 search -> FRS-122.4
- Request Registration #4 status chips and their counts -> FRS-122.3 (D-040)
- Request Registration #8 UCN coloured by state -> FRS-122.5
- Request Registration #9 export and partial warning -> FRS-122.7, FRS-138
- Request Registration #10 read a request -> FRS-122.6
- Request Registration #11 correction via free-text boxes, email correctable -> FRS-124.1-.4, .7 (D-030)
- Request Registration #12 zero-row correction reported -> FRS-124.6
- Request Registration #16 call type from master -> FRS-123.2, FRS-124.3
- Request Registration #20 up to five calls -> FRS-123.1
- Request Registration #30 fixed INSTALLATION CALL complaint -> FRS-123.6
- Request Registration #32 installation uploads, size, wait -> FRS-123.7
- Request Registration #33 Call Attended?, Attended Date, planned date -> FRS-123.3-.5 (D-030)
- Request Registration #34 refusal reasons incl. Call Attended -> FRS-123.3-.4, .7
- Request Registration #36 half-saved fallback -> FRS-123.8 (D-030)
- Request Registration #37 clear -> FRS-123.9
- Request Registration #38 audit of submit -> FRS-123.10
- Request Registration #39 refresh and sync time -> FRS-122.8
- Pending Registrations #2 search -> FRS-126.7
- Pending Registrations #3 Open Calls column, silent failure -> FRS-126.1-.2 (D-040)
- Pending Registrations #5 map to unknown UCN -> FRS-125.1 (D-031)
- Pending Registrations #6 zero-row map/cancel -> FRS-125.2 (D-031)
- Pending Registrations #7 three panes, widths remembered -> FRS-126.3
- Pending Registrations #10 whole machine history, map to closed call -> FRS-126.4
- Pending Registrations #11 edit from history pane -> FRS-126.6, FRS-132 (D-034)
- Pending Registrations #14 no-right banner -> FRS-125.5
- Pending Registrations #16 prefill, engineer, Person Calling -> FRS-127.1
- Pending Registrations #17 dates from the request -> FRS-127.2
- Pending Registrations #18 request's engineer wins -> FRS-127.4
- Pending Registrations #20 UCN back-fill swallowed -> FRS-125.3 (D-031)
- Pending Registrations #21 refresh, reload after action -> FRS-126.7
- Field Call Register #1 800 + Load more + "+" -> FRS-131.1
- Field Call Register #3 unallotted call visible -> FRS-131.2
- Field Call Register #4 Open only -> FRS-131.3
- Field Call Register #5 Re-opened chip -> FRS-131.4
- Field Call Register #6 engineer chips -> FRS-131.5
- Field Call Register #8 Filters panel, columns, layout -> FRS-131.9
- Field Call Register #9 header scope/source/sync -> FRS-131.8
- Field Call Register #10 colour, re-open count -> FRS-131.7
- Field Call Register #11 Aging -> FRS-131.6
- Field Call Register #13 export scope and warnings -> FRS-131.10, FRS-138
- Field Call Register #15 Product Database cascade -> FRS-130.1
- Field Call Register #16 cover locked -> FRS-130.2
- Field Call Register #17 engineer prefill -> FRS-130.3
- Field Call Register #18 party search, non-owners not pickable -> FRS-130.4
- Field Call Register #19 required fields -> FRS-130.8
- Field Call Register #21 complaint text helper -> FRS-130.7
- Field Call Register #22 vigilance default NO -> FRS-129 (D-033)
- Field Call Register #23 Call Allocated To at registration -> FRS-130.6
- Field Call Register #27 failed/offline registration kept locally -> FRS-128.2-.3 (D-032)
- Field Call Register #28 sync pending local calls -> FRS-128.4
- Field Call Register #29 discard local calls -> FRS-128.4
- Field Call Register #30 sheet-path cache and resync -> FRS-131.14
- Field Call Register #31 arrival prefilled/searched/edit -> FRS-131.11 (D-040), FRS-127
- Field Call Register #32 UCN write-back fire-and-forget -> FRS-125.3 (D-031)
- Field Call Register #33 view form, dates -> FRS-139.6 (visit), URS-076; the call view by FRS-134.1 and FRS-131.7
- Field Call Register #34 Edit needs calls.edit; section locks -> FRS-132.1-.2 (D-034)
- Field Call Register #35 Solved read-only for admins too -> FRS-132.3; AMEND FRS-007
- Field Call Register #38 Reco hand-off -> FRS-134.5
- Field Call Register #39 re-open asks no reason -> FRS-133.4 (D-035); AMEND FRS-064
- Field Call Register #41 cancel: states, reason, retention -> FRS-133.1-.2 (D-036)
- Field Call Register #42 restore keeps reason -> FRS-133.3
- Field Call Register #43 one action order -> FRS-131.12
- Field Call Register #45 allot-right note -> FRS-131.13
- Field Call Register #46 signed Service Report on a closed call -> FRS-134.3
- Field Call Register #47 associated records, failed load text -> FRS-134.1-.2 (D-040)
- Field Call Register #48 shortfall flag on the call -> FRS-134.4
- Field Call Register #50 audit of call actions -> FRS-128.5, FRS-133.7
- Installation Calls #3 new customer typed, owners first -> FRS-130.5
- Installation Calls #4 party-only serviceman prefill -> FRS-130.3
- Preventive (PM) #2 single PM gated by calls.create -> FRS-130.9
- Pending Calls #1 the list, states, paging -> FRS-135.1
- Pending Calls #2 tile counts -> FRS-135.2 (D-040)
- Pending Calls #3 type chips by family -> FRS-135.3
- Pending Calls #4 status picker -> FRS-135.4
- Pending Calls #5 engineer chips -> FRS-135.4
- Pending Calls #6 search -> FRS-135.4
- Pending Calls #8 group by Type -> FRS-135.5
- Pending Calls #10 allot-right note -> FRS-135.6
- Pending Calls #11 row opens call in its register -> FRS-135.7, FRS-131.11 (D-040)
- Pending Calls #12 empty-text rules -> FRS-135.8
- Pending Calls #13 missing-view message -> FRS-135.9
- Pending Calls #14 export -> FRS-135.10, FRS-138
- Pending Calls #15 refresh -> FRS-135.10
- Pending Calls (note) no SLA flag although URS-014 names it -> AMEND URS-014 (comment); not a new requirement
- Visit Reports #1 paging -> FRS-139.1
- Visit Reports #2 cache and sync -> FRS-139.2
- Visit Reports #4 column picker -> FRS-139.4
- Visit Reports #5 report cell -> FRS-139.5
- Visit Reports #6 open a visit -> FRS-139.6
- Visit Reports #7 Excel ungated, every column, About sheet -> FRS-138.1, .3, .4 (D-018)
- Visit Reports #9 refresh -> FRS-139.7
- Visit Entry #2 previous visits -> FRS-136.11
- Visit Entry #3 Visit Entry Date stamped -> FRS-136.2
- Visit Entry #4 date bounds -> FRS-136.1 (OQ-126, visit_date_test)
- Visit Entry #5 manager picks team engineer -> FRS-136.3
- Visit Entry #7 Pending Reason -> FRS-136.5
- Visit Entry #8 Update Visit Work Details? -> FRS-136.6
- Visit Entry #9 accessory serial -> FRS-136.7
- Visit Entry #10 Warranty Start Date default -> FRS-136.8
- Visit Entry #11 manual report upload -> FRS-136.9
- Visit Entry #12 manual report mandatory on completed -> FRS-136.9
- Visit Entry #14 picker narrowed to product -> FRS-137.4
- Visit Entry #15 GRIR per line -> FRS-137.5; AMEND SR-015
- Visit Entry #17 customer sign-off -> FRS-136.10
- Visit Entry #18 feedback mandatory on solved -> FRS-136.10
- Visit Entry #19 save order, retry remainder -> FRS-137.1-.2
- Visit Entry #20 status stamp best-effort -> FRS-137.3
- Visit Entry #21 second feedback on a re-opened call -> FRS-133.6 (D-035)
- Visit Entry #22 audit of visit events -> FRS-137.6
- Visit Entry #23 missing hand-stock view message -> FRS-136.12
- Bulk Report Mapping #1 gate -> FRS-145.1
- Bulk Report Mapping #7 (note) write without step 2 -> FRS-145.4
- Bulk Report Mapping #10 show only problems -> FRS-145.2
- Bulk Report Mapping #12 unknown columns kept -> FRS-145.3
- PM Bulk Upload #2 template -> FRS-142.2
- PM Bulk Upload #4 no serial -> FRS-142.4 (D-038)
- PM Bulk Upload #5 complaint, call number, engineer unchecked -> FRS-142.5 (D-038)
- PM Bulk Upload #6 item status normalised -> FRS-142.6
- PM Bulk Upload #8 first time and gap -> FRS-142.8
- PM Bulk Upload #9 unknown columns kept -> FRS-142.9
- PM Bulk Upload #12 re-import duplicates -> FRS-142.11 (D-038)
- PM Bulk Upload #13 clear -> FRS-142.13
- Solved Without a Report #1 the list and its gaps -> FRS-140.1 (OQ-131)
- Solved Without a Report #2 gap chips -> FRS-140.2
- Solved Without a Report #3 search -> FRS-140.3
- Solved Without a Report #4 empty message scope -> FRS-140.4 (D-040)
- Solved Without a Report #5 load failure message -> FRS-140.5
- Solved Without a Report #6 Excel ungated -> FRS-140.6, FRS-138.1 (D-018)
- Solved Without a Report #7 export audit-logged -> FRS-138.5
- Solved Without a Report #8 refresh -> FRS-140.7
- Customer Feedback #3 Date vs Loaded on -> FRS-141.2 (OQ-133)
- Customer Feedback #4 Uploaded vs Entered here -> FRS-141.3
- Customer Feedback #5 client engineer-name filter -> FRS-141.4 (D-037); AMEND FRS-017
- Customer Feedback #6 search -> FRS-141.5
- Customer Feedback #7 UCN colour -> FRS-141.5
- Customer Feedback #8 cache and sync -> FRS-141.6
- Customer Feedback #9 export -> FRS-141.7, FRS-138
- Customer Feedback #10 refresh -> FRS-141.6
- Feedback Without a Report #2 finding chips -> FRS-140.2
- Feedback Without a Report #3 search -> FRS-140.3
- Feedback Without a Report #4 empty message scope -> FRS-140.4 (D-040)
- Feedback Without a Report #5 load failure message -> FRS-140.5
- Feedback Without a Report #6 Excel ungated, audit -> FRS-140.6, FRS-138.1, .5 (D-018)
- Feedback Without a Report #7 refresh -> FRS-140.7
- Indoor #1 500 cap with exact count -> FRS-143.1 (D-040)
- Indoor #2 filter chips -> FRS-143.2
- Indoor #3 overdue demo banner -> FRS-143.3 (OQ-137)
- Indoor #4 receive files blank job -> FRS-143.4
- Indoor #6 save on blur -> FRS-143.5
- Indoor #7 free status setting -> FRS-144.2
- Indoor #9 cleaned_by from browser -> FRS-143.6 (D-039)
- Indoor #11 reported-to-customer not on screen -> FRS-143.9 (D-039)
- Indoor #12 rework fields -> FRS-144.4
- Indoor #14 harvested parts uneditable and deletable -> FRS-143.7-.8 (D-039)
- Indoor #15 pre-delivery inspection -> FRS-144.5
- Indoor #16 demo loan fields -> FRS-144.6
- Indoor #17 Other description -> FRS-144.7 (OQ-137)
- Indoor #18 (note) accessory removal deletes -> FRS-143.8 (D-039)
- Indoor #19 checks deletable -> FRS-144.8, FRS-143.8 (D-039)
- Indoor #20 QC Fail -> Under repair -> FRS-144.3
- Indoor #22 dispatch warning -> FRS-144.9
- Indoor #23 only receive audit-logged -> FRS-143.10-.11 (D-039)
- Indoor #24 not-connected message -> FRS-143.12
### Spares & Hand Stock

- Spare Requests — open the screen → FRS-165.1
- Spare Requests — request UID made in the browser → FRS-146.14
- Spare Requests — Call Based / HandStock type → URS-118, FRS-146.2
- Spare Requests — OR No and date assigned by the database → FRS-146.13
- Spare Requests — call search and identity copied → FRS-146.4, FRS-146.5
- Spare Requests — call fixed when raised from a call → FRS-146.6
- Spare Requests — part list narrowed to the product, Show all parts → FRS-146.8
- Spare Requests — part from Part Master only, disabled with reason → FRS-146.7
- Spare Requests — quantity whole, at least 1 → FRS-146.9
- Spare Requests — at most 20 rows → FRS-146.10
- Spare Requests — HandStock reason required → FRS-146.3
- Spare Requests — remarks → FRS-146.11
- Spare Requests — submit rules and messages → FRS-146.12
- Spare Requests — header then lines, compensating delete → URS-131, FRS-164.1 (D-044)
- Spare Requests — success banner and audit entry → FRS-146.16
- Spare Requests — not-connected banner, Submit disabled → FRS-146.15
- Spare Requests — paging 1,000 with "+" → FRS-156.1
- Spare Requests — 30-minute cache and background sync → FRS-156.5
- Spare Requests — Google Sheet fallback → FRS-156.6
- Spare Requests — View-as filtering → FRS-156.7
- Spare Requests — stage derivation, whole-word, terminal states → URS-119, FRS-147.1–.4
- Spare Requests — stage chips with counts → FRS-157.1
- Spare Requests — Needs my action (receipt own only) → FRS-157.2, FRS-152.6
- Spare Requests — engineer facet chips → FRS-157.3
- Spare Requests — search → FRS-157.4
- Spare Requests — UCN coloured by call status → FRS-157.5
- Spare Requests — Sent and Approvals columns → FRS-157.10, FRS-150.9
- Spare Requests — table view controls → FRS-157.16
- Spare Requests — auto-approval rules, HandStock needs NSM, modal says so → FRS-147.5–.8
- Spare Requests — reason required to reject → URS-120, FRS-148.1–.3 (D-043)
- Spare Requests — "all N" per order, never at RM → FRS-149.6
- Spare Requests — Commercial approval form → URS-122, FRS-150.1–.5, .7–.9
- Spare Requests — NSM approval form → FRS-150.6–.8
- Spare Requests — drop with required reason, permission-based → FRS-148.4–.7; AMEND FRS-012
- Spare Requests — Dispatch… link → FRS-157.11
- Spare Requests — mark received, raiser only → FRS-152 (AMEND URS-022)
- Spare Requests — terminal-state labels → FRS-157.12
- Spare Requests — tick boxes and bulk bar → FRS-149.1
- Spare Requests — bulk confirmation, reason, skip count → URS-121, FRS-149.2–.5
- Spare Requests — audit entry on each decision → FRS-149.10
- Spare Requests — detail drawer and order tally → FRS-157.6
- Spare Requests — "Entered in the system" only when it differs → FRS-157.7
- Spare Requests — detail shows reject reason, call, order lines → FRS-157.8
- Spare Requests — approval trail display → URS-126, FRS-157.9
- Spare Requests — engineer change without a required reason → FRS-148.8; AMEND URS-035 (D-043)
- Spare Requests — arriving filter from My Workload → FRS-157.13
- Spare Requests — partial-export disclaimer → FRS-156.9
- Spare Requests — status banners → FRS-156.3, FRS-156.5
- Spare Requests — approver names from the client → URS-123, FRS-151.2 (D-041)
- RM Approval — open the screen → FRS-165.1
- RM Approval — whole queue, 2,000 cap with "+" → FRS-149.7
- RM Approval — rows not the reader's shown "Not yours" → FRS-149.8
- RM Approval — those rows cannot be ticked → FRS-149.8
- RM Approval — Select all of mine → FRS-149.9
- RM Approval — bulk approve/reject, required reason, skip count → FRS-149.2–.5, FRS-148.1
- RM Approval — audit per batch → FRS-149.10
- RM Approval — column set → FRS-157.15
- RM Approval — waiting-days badge → FRS-157.15
- RM Approval — search → FRS-157.15
- RM Approval — table view controls → FRS-157.16
- RM Approval — honest empty state by scope → FRS-156.4
- RM Approval — migration hint on load failure → FRS-156.3
- RM Approval — partial-export disclaimer → FRS-156.9
- RM Approval — no cache, manual refresh → FRS-156.5
- Pending Dispatch — open the screen → FRS-165.1
- Pending Dispatch — the Stores queue → URS-124, FRS-153.1
- Pending Dispatch — cap banner naming where the read stopped → FRS-153.2
- Pending Dispatch — cards per engineer, oldest first, age colours → FRS-153.3
- Pending Dispatch — expand/collapse → FRS-153.13
- Pending Dispatch — search and ?engineer= → FRS-153.4
- Pending Dispatch — tick lines or a whole engineer → FRS-153.5
- Pending Dispatch — one stock out per engineer → FRS-153.6
- Pending Dispatch — partial quantity → FRS-153.7 (FRS-026)
- Pending Dispatch — action bar totals → FRS-153.5, FRS-153.8
- Pending Dispatch — DC date editable, courier, remarks → FRS-153.8, FRS-153.11, FRS-163.1
- Pending Dispatch — booking out all or nothing → FRS-153.9
- Pending Dispatch — dispatcher stamped from session → FRS-151.1
- Pending Dispatch — parts count at dispatch → FRS-153.11
- Pending Dispatch — success message, audit, jump to DC → FRS-153.12
- Pending Dispatch — drop via prompt accepts a blank reason → FRS-148.5–.6 (D-043)
- Pending Dispatch — honest empty message → FRS-156.4
- Pending Dispatch — migration hint → FRS-156.3
- Pending Dispatch — cache and background sync → FRS-156.5
- Pending Dispatch — partial-export disclaimer → FRS-156.9
- Pending Dispatch — tabs Queue / Stock outs → FRS-153.14
- Pending Dispatch — URS-021 / URS-022 filed against the wrong screens → AMEND URS-021, AMEND URS-022, AMEND URS-008
- Stock Out — open the screen → FRS-165.1, FRS-165.2
- Stock Out — column set → FRS-157.14
- Stock Out — days-to-dispatch colours → FRS-157.14
- Stock Out — search → FRS-157.14
- Stock Out — reprint DC and Declaration → FRS-157.14
- Stock Out — partial-export disclaimer → FRS-156.9
- Stock Out — failed load shown as "No stock outs yet" → FRS-156.3 (D-046)
- Stock Out — migration banner → FRS-156.3
- Stock Out — table view controls → FRS-157.16
- Delivery Challan — no module permission on the route → FRS-154.1, FRS-165.5
- Delivery Challan — only the latest 500 findable → FRS-154.2 (D-045)
- Delivery Challan — prints quantity sent on this stock out → FRS-154.3
- Delivery Challan — letterhead → FRS-154.4
- Delivery Challan — header fields → FRS-154.5
- Delivery Challan — grid, totals, continuation → FRS-154.6
- Delivery Challan — A4 sheets of 20 with letterhead and signature → FRS-154.7
- Delivery Challan — remarks and statutory identifiers → FRS-154.8
- Delivery Challan — Print / Declaration / Back → FRS-154.10
- Delivery Challan — error page → FRS-154.11
- Declaration — no module permission → FRS-155.1, FRS-165.5
- Declaration — 500-most-recent lookup → FRS-155.1 (D-045)
- Declaration — lines merged per part → FRS-155.2
- Declaration — fill-in fields and pre-fill → FRS-155.3, FRS-155.4
- Declaration — printing not blocked while mandatory fields empty → FRS-155.5 (decision recorded as open in its RATIONALE)
- Declaration — Save to the User Master → FRS-155.6, FRS-155.7
- Declaration — printed content → FRS-155.8
- Declaration — 18-row sheets → FRS-155.9
- Declaration — recipient and sender blocks → FRS-155.10
- Declaration — toolbar → FRS-155.11
- Declaration — error page → FRS-155.11
- Spare Consumption — paging without "+" → FRS-156.1 (D-047)
- Spare Consumption — cache and background sync → FRS-156.5
- Spare Consumption — sheet fallback → FRS-156.6
- Spare Consumption — extra client-side role filter → FRS-156.8 (D-047)
- Spare Consumption — dynamic columns and date format → FRS-158.9, FRS-158.10
- Spare Consumption — Reconciliation badge → FRS-158.5
- Spare Consumption — "Voided" and "was N" → FRS-158.6
- Spare Consumption — search → FRS-158.10
- Spare Consumption — engineer changeable on a reconciliation → FRS-158.2
- Spare Consumption — GRIR / traceability vs SR-015 → FRS-158.3; AMEND SR-015
- Spare Consumption — recorded_by from the client → FRS-151.5 (D-042)
- Spare Consumption — reconciliation exempt from needs-a-visit → FRS-158.4
- Spare Consumption — permission-refusal message → FRS-158.8
- Spare Consumption — errors inside the drawer → FRS-158.8
- Spare Consumption — adjust ceiling and refusals → FRS-158.7
- Spare Consumption — partial-export disclaimer → FRS-156.9
- Spare Consumption — table view controls → FRS-157.16
- Spare Consumption — status banners → FRS-156.3, FRS-156.5
- Hand Stock — no requirement declared → URS-127 (modules), AMEND URS-009
- Hand Stock — View-as filtering → FRS-156.7
- Hand Stock — history switch remembered → FRS-159.10
- Hand Stock — Short chip vs URS-024 → FRS-159.3, FRS-159.4; AMEND URS-024
- Hand Stock — engineer dropdown → FRS-159.5
- Hand Stock — server-side search → FRS-159.6
- Hand Stock — paging and "+" → FRS-156.1
- Hand Stock — cache and background sync → FRS-156.5
- Hand Stock — drill-down arithmetic omits Opening; trail capped at 500 → FRS-159.2, FRS-159.7 (D-048, D-047); AMEND FRS-013
- Hand Stock — Transfer shortcuts → FRS-159.9
- Hand Stock — Movements ledger tab → FRS-159.8
- Hand Stock — partial and search-scoped export → FRS-156.9
- Hand Stock — migration hint → FRS-156.3
- Hand Stock — empty states → FRS-156.3, FRS-159.6
- Hand Stock — arriving filter → FRS-159.11
- Hand Stock — table view controls → FRS-157.16
- Hand Stock Report — default access → FRS-160.1, FRS-165.3
- Hand Stock Report — searched subset, CSV carries no scope → FRS-160.2 (D-047)
- Hand Stock Report — negative On Hand highlighted → FRS-159.4
- Hand Stock Report — Refresh run token → FRS-160.3
- Hand Stock Report — empty message by scope → FRS-160.4
- Hand Stock Report — load-failure explanation → FRS-160.5
- Hand Stock Report — table view controls → FRS-157.16
- Material Returns — no requirement declared → URS-128 (modules), AMEND URS-009
- Material Returns — register display and paging, no count → FRS-161.14, FRS-156.1
- Material Returns — cache and background sync → FRS-156.5
- Material Returns — View-as filtering → FRS-156.7
- Material Returns — search and engineer filter → FRS-161.14
- Material Returns — MRN detail view → FRS-161.13
- Material Returns — returning on behalf of another engineer → FRS-161.2, FRS-161.3
- Material Returns — MRN number and editable date → FRS-161.4, FRS-161.5, FRS-163
- Material Returns — defective quantity raises no nonconformity record → FRS-161.7 records it; the nonconformity record itself remains SR-017 (Absent) — NOT covered by a new requirement
- Material Returns — "not holding any stock" message → FRS-161.9
- Material Returns — remarks → FRS-161.10
- Material Returns — two-step save with compensating delete → FRS-164.2 (D-044)
- Material Returns — no audit entry → FRS-161.12 (D-051)
- Material Returns — migration hint → FRS-156.3
- Material Returns — partial-export disclaimer → FRS-156.9
- Material Returns — table view controls → FRS-157.16
- Stock Transfer — no requirement declared → URS-129 (modules), AMEND URS-009
- Stock Transfer — latest 1,000 only, no Load more, no "+" → FRS-162.10, FRS-156.1 (D-047)
- Stock Transfer — View-as filtering → FRS-156.7
- Stock Transfer — search → FRS-162.10
- Stock Transfer — cache and background sync → FRS-156.5
- Stock Transfer — From free text, To not a directory user → FRS-162.2–.4 (D-049)
- Stock Transfer — editable transfer date → FRS-162.7, FRS-163 (D-050)
- Stock Transfer — From ≠ To → FRS-162.5
- Stock Transfer — "not holding" text contradicts FRS-013 → FRS-162.8 (D-052)
- Stock Transfer — remarks → FRS-162.7
- Stock Transfer — two-step save with compensating delete → FRS-164.3 (D-044)
- Stock Transfer — no audit entry → FRS-162.9 (D-051)
- Stock Transfer — partial-export disclaimer → FRS-156.9
- Stock Transfer — table view controls → FRS-157.16
### Masters, Cover & Knowledge

- Party Master #1  list fields ............................. FRS-173.1, FRS-176.6
- Party Master #2  device cache, "Showing cached data" ..... FRS-176.2
- Party Master #3  30-minute sync only unfiltered .......... FRS-176.3
- Party Master #4  Refresh ................................. FRS-176.4
- Party Master #5  server-side filter after 300 ms ......... FRS-176.5
- Party Master #6  Load more, "+" .......................... FRS-176.1
- Party Master #7  Columns picker .......................... FRS-176.6
- Party Master #8  Export partial warning, dates ........... FRS-176.7-.9
- Party Master #10 editable field set, blank billing ....... FRS-173.1, FRS-173.5
- Party Master #11 party name not editable ................. URS-136, FRS-173.2-.3 (D-058)
- Party Master #12 save sends editable only, re-read ....... FRS-173.4
- Party Master #13 device customer register refreshed ...... FRS-173.6
- Party Master #14 GSTIN/PAN, three statuses ............... FRS-174.1-.3
- Party Master #15 Verified stamp and clearing ............. FRS-174.4-.5, FRS-173.7 (D-058)
- Party Master #17 "who" is client text on KYC record ...... FRS-086.1 (existing) — not re-specified; noted only
- Party Master #18 same file twice keeps one ............... FRS-174.6
- Party Master #21 Change engineer (bulk Serviceman) ....... URS-136, FRS-175
- Party Master #22 messages ................................ FRS-176.10, FRS-176.15
- Product Database #1  register content .................... FRS-182.1-.2, FRS-176
- Product Database #3  duplicates note ..................... URS-078 (existing; admin note is part of the copy's statement)
- Product Database #4  filters, search, Enter, Clear ....... FRS-182.2, FRS-176.5
- Product Database #5  status filter derived ............... FRS-182.2
- Product Database #6  timeout guidance .................... FRS-182.3, FRS-176.10
- Product Database #7  Load more "+" ....................... FRS-176.1
- Product Database #8  browse cache, 30-min sync ........... FRS-176.2-.3
- Product Database #9  Refresh forces device copy .......... FRS-176.4, URS-078
- Product Database #10 Columns picker ...................... FRS-176.6
- Product Database #11 + Field / + Install pre-filled ...... URS-140, FRS-182.4-.5 (D-063)
- Product Database #12 Export .............................. FRS-176.7-.9
- Product Database #13 read-only ........................... FRS-182.1
- Product Database 2.0 #3  dates dd-MMM-yyyy ............... FRS-176.12
- Product Database 2.0 #4  Live as of / updating in 5 min .. URS-141, FRS-183.1-.2
- Product Database 2.0 #5  Rebuild authority ............... FRS-183.3-.4
- Product Database 2.0 #6  search on device ................ FRS-183.6
- Product Database 2.0 #7  status chips exact .............. FRS-183.6, FRS-176.14
- Product Database 2.0 #8  Export .......................... FRS-176.7-.9
- Product Database 2.0 #10 drawer links .................... FRS-183.8, FRS-176.11
- Product Database 2.0 #11 empty-list diagnosis ............ URS-141, FRS-183.7
- Product Database 2.0 #12 load failure three answers ...... FRS-183.9
- Product Database 2.0 #13 readership widened by 0221 ...... URS-141, FRS-183.5, R-85; AMEND CW-020
- Product Master #1  catalogue content ..................... FRS-182.6
- Product Master #2  search ................................ FRS-182.6
- Product Master #3  All/Active/Inactive chips ............. FRS-182.6, FRS-176.14
- Product Master #4  Inactive line banner / sale rule ...... URS-140, FRS-182.7-.8
- Product Master #5  Export ................................ FRS-176.7-.9
- Product Master #6  empty-state text ...................... FRS-182.7
- Product Master #7  load error ............................ FRS-176.10
- Product Master #8  no add/edit/retire .................... FRS-182.6
- User Master #1  directory list ........................... FRS-171, FRS-176
- User Master #2  sheet fallback ........................... FRS-171.8, FRS-176.15
- User Master #3  search ................................... FRS-176 (search), FRS-171
- User Master #4  "X (now Y)" .............................. FRS-170.6
- User Master #5  Apply this list's role (bulk) ............ URS-134, FRS-170.6
- User Master #6  whole-table edit ......................... FRS-171.6
- User Master #7  name required ............................ FRS-171.1
- User Master #8  rename warning and cascades .............. URS-132, FRS-166, FRS-167
- User Master #9  role applied to sign-in on save .......... FRS-170.5
- User Master #10 Department (not saved) ................... FRS-171.2-.3 (D-053)
- User Master #11 new login, default password .............. URS-133, FRS-168 (D-057); AMEND FRS-001, FRS-002
- User Master #12 Clone (+ data.view_all) .................. URS-134, FRS-170.3
- User Master #13 Access drawer, individual permissions .... URS-134, FRS-170.1-.2
- User Master #14 Data drawer .............................. URS-135, FRS-171.7
- User Master #15 Reset password ........................... URS-133, FRS-169
- User Master #17 Delete row (cascade / refused) ........... URS-135, FRS-172 (D-059); AMEND FRS-093
- User Master #21 R&R period edited in place ............... URS-146, FRS-190.5 (D-062)
- User Master #24 free-typed manager names ................. URS-135, FRS-171.4 (D-053)
- User Master #25 validity vs login active ................. FRS-171.5 (D-053); AMEND FRS-002
- User Master #27 client audit entries ..................... FRS-168.6, FRS-169.5, FRS-170.4, FRS-172.4 (with FRS-021's stated limits)
- User Master #28 Export ................................... FRS-176.7-.9
- Part Master #1  whole catalogue, stored copy ............. FRS-176.1-.2
- Part Master #2  30-minute reload ......................... FRS-176.3
- Part Master #3  global search incl. extra ................ FRS-179.8
- Part Master #4  filters .................................. FRS-179.8, FRS-179.2
- Part Master #5  Common / unrecognised flag ............... FRS-179.1-.2
- Part Master #6  Columns picker ........................... FRS-176.6
- Part Master #7  Export ................................... FRS-176.7-.9
- Part Master #8  add-part validation ...................... URS-138, FRS-177.1-.8
- Part Master #9  edit category, products, cost ............ FRS-177.9
- Part Master #10 rename carrying nine tables .............. URS-138, FRS-178
- Part Master #12 bulk set products ........................ FRS-179.3
- Part Master #13 bulk Spare / Consumable .................. FRS-179.3
- Part Master #14 spare picker cache cleared ............... FRS-179.4
- Part Master #15 sheet fallback ........................... FRS-176.15
- Part Master #16 main product → accessories ............... URS-138, FRS-179.5-.7
- All Masters #1  summary table ............................ FRS-180.10
- All Masters #2  KPI cards ................................ FRS-180.10
- All Masters #3  registry fallback message ................ FRS-180.9
- All Masters #4  Refresh all, cache, sync ................. FRS-180.8, FRS-176.2-.3
- All Masters #5  open a register / list ................... FRS-180.10
- All Masters #6  Export ................................... FRS-176.7-.9
- All Masters #7  /masters/<key> unknown key ............... FRS-180.10
- All Masters #11 delete with no in-use check .............. URS-139, FRS-180.5-.6 (D-056); AMEND FRS-015, OQ-26
- All Masters #12 Standard Complaint → products ............ URS-139, FRS-181.1-.4
- All Masters #13 complaint filters ........................ FRS-181.5
- All Masters #14 complaint bulk mapping ................... FRS-181.2
- All Masters #15 list search, Refresh clears cache ........ FRS-180.8, FRS-176
- All Masters #16 Export with Key and Products, 5,000 cap .. FRS-181.6, FRS-176.7-.9
- All Masters #17 permission-needed / Used by notes ........ FRS-180.7, FRS-180.4
- All Masters (summary) added_by is client text ............ FRS-180.3 (sys_created_by, 0244)
- Warranty/Contract #2  state and 30-day threshold ......... FRS-184.1
- Warranty/Contract #4  tiles, "—" not 0 ................... FRS-184.2, FRS-176.10
- Warranty/Contract #5  server search after 300 ms ......... FRS-176.5
- Warranty/Contract #6  2,000 then doubling, "+" ........... FRS-176.1
- Warranty/Contract #7  per-tab cache, 30-min sync ......... FRS-176.2-.3
- Warranty/Contract #8  arrival from 2.0 ................... FRS-176.11
- Warranty/Contract #10 next number, entry date ............ FRS-184.3-.4
- Warranty/Contract #14 party picker free text ............. URS-142, FRS-184.5
- Warranty/Contract #15 party auto-fill on choose .......... FRS-184.6
- Warranty/Contract #18 delete entry ....................... URS-143, FRS-187 (D-055)
- Warranty/Contract #20 remove machine ..................... URS-143, FRS-187 (D-055)
- Warranty/Contract #21 active product lines on sale ....... URS-140, FRS-182.8
- Warranty/Contract #22 rate → tax → total ................. FRS-184.7
- Warranty/Contract #25 per-machine + Installation call .... FRS-186
- Warranty/Contract #28 renewal re-pricing ................. FRS-185; AMEND FRS-056, OQ-42
- Warranty/Contract #13 renewal native date inputs ......... FRS-185.9 (D-064)
- Warranty/Contract #29 stale replies dropped .............. FRS-176.13
- Warranty/Contract #30 + Field call without calls.create .. FRS-184.9 (D-063)
- Warranty/Contract #31 Export ............................. FRS-176.7-.9
- Warranty/Contract #32 error text never blank ............. FRS-176.10
- Warranty/Contract #33 CMC / AMC pick list ................ FRS-184.8
- Ownership Transfer #2  tabs .............................. FRS-176 (register reading)
- Ownership Transfer #3  search ............................ FRS-176
- Ownership Transfer #4  arrival from 2.0 .................. FRS-176.11
- Ownership Transfer #5  transfers table ................... FRS-188, CW-011
- Ownership Transfer #6  serial-only, item by serial, free-text party ... URS-144, FRS-188.1-.5 (D-060); AMEND CW-011
- Ownership Transfer #7  products owner moved .............. FRS-188.4 (D-060)
- Ownership Transfer #8  additional entry upsert ........... URS-144, FRS-188.6 (D-054); AMEND CW-015
- Ownership Transfer #9  missing-table message ............. FRS-176.10
- Ownership Transfer #10 no edit or delete ................. URS-143, FRS-187
- Field Solutions #2  search ............................... FRS-191.9
- Field Solutions #5  anyone signed in may add ............. FRS-191.1
- Field Solutions #6  edit and delete by author/admin ...... URS-147, FRS-191.2
- Field Solutions #7  form: title, products from active .... FRS-191.3
- Field Solutions #9  How-To routing ....................... FRS-191.4
- Field Solutions #10 messages ............................. FRS-176.10
- How to Use #2  Open buttons by permission ................ FRS-191.5
- How to Use #3  admin screenshots ......................... FRS-191.6
- How to Use #4  How-To articles listed .................... FRS-191.4
- How to Use #5  renders without the database .............. FRS-191.5
- How to Use #1 note: task 32 still says "Admin → User Access" — stale help text, not a requirement; NOT COVERED (for BACKLOG)
- How RITHI Functions #1 chooser remembered ................ FRS-191.8
- How RITHI Functions #2 framed, theme, height ............. FRS-191.8
- How RITHI Functions #3 open on its own / public files .... URS-147, FRS-191.7
- How RITHI Functions #4 missing-file banner ............... FRS-191.8
- Service Manuals / QMS #2  search ......................... FRS-176
- Service Manuals / QMS #3  Updated raw timestamp .......... FRS-189.9 (D-064)
- Service Manuals / QMS #5  file-name suggestion ........... FRS-189.7
- Service Manuals / QMS #6  revision / effective date required .... FRS-189.1 (D-061)
- Service Manuals / QMS #7  manual product free text ....... FRS-189.8
- Service Manuals / QMS #8  edit in place .................. URS-145, FRS-189.4-.5 (D-061); AMEND FRS-036
- Service Manuals / QMS #10 linked (mutable) QMS document .. FRS-189.3
- Service Manuals / QMS #13 load messages .................. FRS-176.10
- Training #2  Overdue / Cancelled ......................... FRS-190.1-.2; AMEND FRS-093
- Training #3  chips and search ............................ FRS-190.7, FRS-176.14
- Training #5  cancel with reason .......................... URS-146, FRS-190.1
- Training #7  trainer free text ........................... FRS-093 (existing) — accepted as typed; not re-specified
- Training #10 session re-save overwrites .................. URS-146, FRS-190.4 (D-062)
- Training #11 open existing session ....................... FRS-190.4
- Training #12 sessions readable by everyone ............... FRS-190.6
- Training #13 Export ...................................... FRS-176.7-.9
- Training #14 empty and failure text ...................... FRS-190.7
### Reports, Administration & app-wide

- Reports hub
- #1 per-report access keys -> FRS-192.1
- #2 unpermitted/bare link to first permitted report -> FRS-192.2
- #3 "no report open to your role" notice -> FRS-192.3
- #4 one tab mounted at a time -> FRS-192.4
- #5 Consumption database-side filters -> FRS-192.5, FRS-194.1
- #6 exact matching-row count, count failure stated -> FRS-192.6
- #7 clear filter / filter in words -> FRS-192.7
- #8 locked mandatory, optional picker, default-ticked -> FRS-192.8, FRS-192.9
- #9 column-choice shortcuts -> FRS-192.10
- #10 view's column order, blanks for missing -> FRS-192.11
- #11 Excel download, paged, Filter/scope sheet, export authority -> FRS-192.12, FRS-192.13, FRS-193.1, FRS-193.2 (D-065)
- #13 buttons disabled offline/busy/not permitted/zero -> FRS-192.16
- #14 export date typing -> FRS-192.14, FRS-192.15
- #15 numbers stay numbers, digit identifiers text -> FRS-192.14
- #16 each download audit-logged -> FRS-193.4, FRS-193.5
- #17 empty / failed build messages -> FRS-192.17
- #18 not-connected banner, denied note -> FRS-192.18
- #19 report switch resets filter -> FRS-192.19
- #20 Consumption file notes on visit dates -> FRS-194.2
- #21 Call Report row definition, latest entry, spares excl. void, exact status -> FRS-194.3, FRS-194.4
- #23 Feedback own-date filter and source filter -> FRS-194.6
- #24 Feedback "blank is not asked" note -> FRS-194.7
- #25 KPI Field_INST columns, inclusions, formulas, who may export -> FRS-195.1-.7, FRS-195.12, FRS-193.2
- #26 KPI registered date range, whole register -> FRS-195.8
- #27 KPI count on button, failure banner -> FRS-195.9
- #28 KPI Excel/CSV and audit -> FRS-195.10, FRS-193.1, FRS-193.4
- #29 KPI column list -> FRS-195.11
- #31 Unused spares filters incl. engineer picker, Clear -> FRS-194.8
- #32 Unused spares first-25 preview -> FRS-194.9
- #33 Unused spares Excel About sheet, CSV, audit -> FRS-194.10, FRS-193.1, FRS-193.4
- Bulk Uploads
- #1 admin-only gate -> FRS-196.1
- #2 not-connected message -> FRS-196.2
- #3 "before you start" guidance -> FRS-196.3
- #4 grouped registers with row counts -> FRS-196.4
- #5 header row below letterhead -> FRS-196.5
- #6 preview before write -> FRS-196.6
- #7 "nothing loadable" -> FRS-196.7
- #8 required columns hold a row back -> FRS-197.1
- #9 per-register reject rules -> FRS-197.2
- #10 alias priority, losers to extra -> FRS-197.3
- #11 stamped values override the file -> FRS-197.4
- #12 day-first, month-first only when proven -> FRS-197.5
- #13 unreadable typed cells kept -> FRS-197.6
- #14 unknown headers kept / ignored dropped -> FRS-197.7
- #15 in-file duplicate keys -> FRS-197.8
- #16 controlled vocabularies during shaping -> FRS-197.9
- #17 preparation step before confirmation -> FRS-196.8 (D-075)
- #18 confirmation with re-run warning -> FRS-196.9
- #21 MRN Register / Stock Transfer Lines no natural key -> FRS-199.5, FRS-199.6 (D-071)
- #22 failure reporting with rows written -> FRS-196.12
- #23 offline copy refreshed after product/party load -> FRS-196.13
- #24 no audit-log entry for uploads -> FRS-196.14 (D-067)
- #25 call registers load -> FRS-198.1
- #26 visit reports load, status effect -> FRS-198.2, FRS-198.3
- #28 Spare Request headers on OR number -> FRS-198.4
- #29 Spare Request Lines stubs, re-pointing, approvals -> FRS-198.5, FRS-198.6 (D-075)
- #30 Stock Out Register load -> FRS-198.7
- #31 Consumption files visits from the file -> FRS-198.8, FRS-198.9 (D-075)
- #32 MRN import exempt from stock guard -> FRS-199.1, FRS-199.4
- #33 Stock Transfer import exempt -> FRS-199.2, FRS-199.4
- #34 Stock Transfer Lines held back when parent missing -> FRS-199.3
- #36 historical consumption / stock-out keys and source year -> FRS-198.10
- #37 QMS Master List load -> FRS-200.7
- #38 Customer Feedback marked imported (partial URS-037) -> FRS-198.11
- #40 DCCR Register reviewer names from a file -> URS-082, FRS-100 (D-029); AMEND URS-058
- #41 Party Master load and Party key -> FRS-200.1
- #42 Product Database blank cell clears the column -> FRS-197.10, FRS-200.2; AMEND URS-040 (D-072)
- #43 Product Master load -> FRS-200.3
- #44 Part Master load -> FRS-200.4
- #47 cover exports shaped, stub entries -> FRS-200.8
- #48 master value list uploaders -> FRS-200.5
- #49 Standard Complaint by key, never renamed, Products mapping -> FRS-200.6
- #50 dismiss message -> FRS-196.15
- Legacy Data Import panel
- #1 admin-only panel -> FRS-201.1
- #2 banner to Bulk Uploads -> FRS-201.1
- #3 table counts and refresh -> FRS-201.2
- #4 auto-detected target, no preview, no confirmation -> FRS-201.3, FRS-201.4 (D-071)
- #5 user_directory and MRN plain inserts -> FRS-201.5, FRS-201.6 (D-071)
- #6 automatic Normalise cover after cover import -> FRS-201.7 (D-071)
- #7 Normalise cover button -> FRS-201.7
- #8 no audit entry -> FRS-201.8 (D-067)
- Data Export
- #1 screen gate -> FRS-202.1
- #2 table list with approximate counts -> FRS-202.2
- #3 search / select all / clear / total -> FRS-202.3
- #4 ZIP of whole tables as the user, cap, gate, audit -> FRS-202.4-.8 (D-065)
- #5 CSV date formatting -> FRS-202.6
- #6 failed export downloads nothing -> FRS-202.9
- #10 edit a schedule -> FRS-202.10
- #11 pause / resume -> FRS-202.11
- #12 delete a schedule -> FRS-202.12
- #13 schedule list with next / last run -> FRS-202.13
- #15 separate failure banners -> FRS-202.14
- #16 mail-not-deployed notice -> FRS-202.14
- Device Cache Status
- #2 app version, complaints, storage-refused columns -> FRS-215.1
- #3 state bands -> FRS-215.2
- #4 state chips -> FRS-215.3
- #5 search -> FRS-215.4
- #6 summary line -> FRS-215.5
- #7 refresh -> FRS-215.6
- #8 load failure names device_cache.sql -> FRS-215.6
- Tracker
- #5 delete for everybody -> AMEND NAR-002
- #6 Done / Dropped hidden -> AMEND NAR-002
- #7 positional numbering, id on hover -> AMEND NAR-002
- #8 last changed by / raised by -> AMEND NAR-002
- #9 count / refresh / banners / errors -> AMEND NAR-002 (edit-in-place behaviour); no further statement needed (Low)
- Users
- #1 /users redirects to /user-master -> FRS-213.3
- Roles & Permissions
- #1 read-only via admin.view / edit via rbac.manage -> FRS-203.1
- #3 matrix follows stored permissions -> FRS-203.2
- #4 grouped tree, expand / collapse -> FRS-203.3
- #5 per-role View and action ticks -> FRS-203.4
- #6 whole-page tick -> FRS-203.4
- #7 admin column always full -> FRS-203.5
- #9 save only touched roles, admin re-asserted, "Nothing was changed" -> FRS-203.6
- #11 save logged without before / after -> FRS-203.8 (D-067)
- #14 export matrix with provenance and unsaved flag -> FRS-203.9, FRS-193.3
- #15 messages -> FRS-203.10
- Audit Log
- #1 reading requires audit.view -> FRS-204.1 (D-066)
- #3 filters in the database -> FRS-204.3
- #4 load more -> FRS-204.4
- #5 rows cached in browser, not cleared at sign-out -> FRS-204.6, FRS-211.2 (D-070)
- #6 30-min background sync -> FRS-204.5
- #7 manual refresh -> FRS-204.5
- #8 CSV export with partial warning -> FRS-204.7, FRS-193.6
- #9 layout remembered -> FRS-204.8
- #10 record_audit not viewable here -> FRS-204.9
- Admin Config
- #1 page composition -> FRS-206.1
- #3 SLA defaults when table missing -> FRS-206.2
- #4 SLA changes not audit-logged -> FRS-206.6 (D-067)
- #6 Hotline desk guidance / failure messages -> FRS-206.3
- #8 Frequent Failure rule 2 -> URS-158, FRS-205
- (#5 Hotline desk and #9 FF save with no audit, noted in the inventory) -> FRS-206.3, FRS-206.4, FRS-206.6
- Software Validation
- #1 package tabs, duplicate 'trace' key -> FRS-208.1 (D-073)
- #2 requirements-by-module and gap tables -> FRS-208.2
- #3 traceability matrix -> FRS-208.3
- #4 print tab / full package -> FRS-208.5
- #5 record test results -> FRS-207.1
- #6 one result per test, overwritten, first date kept -> FRS-207.2, FRS-207.4 (D-068)
- #7 tester free text -> FRS-207.3 (D-068)
- #8 silent failure, mismatched UI / DB rights -> FRS-207.1, FRS-207.5 (D-068)
- #9 execution summary, read-only notice -> FRS-207.6, FRS-207.7
- #10 blank signature / CAPA tables -> FRS-207.8
- (new) Data Flows tab -> URS-162, FRS-209
- Settings
- #2 database connection editable per browser -> FRS-214.2, FRS-214.3, FRS-214.4; AMEND MODULES_WITHOUT_REQUIREMENT (D-072)
- #3 CallReg / Drive bridge URL -> FRS-214.4, FRS-214.5
- #4 design defaults text -> FRS-214.6
- #5 local template placeholders -> FRS-214.7
- #6 reset demo data -> FRS-214.7
- My Profile
- #1 account table -> FRS-216.1
- #2 unresolved-profile banner -> FRS-216.2, FRS-210.5
- #6 change an R&R period afterwards -> FRS-216.3
- #10 "What I can do" panel -> FRS-216.4
- #12 change password rules -> FRS-210.7
- #13 theme -> FRS-213.14
- App-wide: sign-in, auth, route guard
- #2 login / login_failed audit events -> FRS-210.11
- #4 profile read failure signs out -> FRS-210.3
- #5 profile auto-created from User Master -> FRS-210.4
- #6 unresolved identity runs as Engineer -> FRS-210.5 (D-074)
- #7 no self-service reset, footer contradiction -> FRS-210.9 (D-074)
- #8 reset / invite link flow and password rules -> FRS-210.8
- #9 local demo / CallReg fallback sign-in -> FRS-210.2 (D-074)
- #10 hard-coded super-admin list -> FRS-210.6
- #12 permission changes applied on tab focus -> FRS-210.10
- #14 printable routes without chrome -> FRS-213.4
- #15 per-screen error boundary -> FRS-213.5
- #16 no login flash during restore -> FRS-213.6
- #17 demo data cleared -> FRS-213.15
- #18 sign-out wipes offline copy but not screen caches -> FRS-211.1, FRS-211.2 (D-070)
- #20 partial-download warning -> FRS-193.6
- App-wide: menu, header, update banner, View as, offline cache
- #1 menu visibility rules -> FRS-213.1
- #2 collapse / expand menu, mobile drawer -> FRS-213.7
- #3 flashing Knowledge Base heading -> FRS-213.7
- #4 menu counts from device storage, not per user -> FRS-211.3, FRS-213.11 (D-070)
- #5 module search -> FRS-213.8
- #6 breadcrumb -> FRS-213.9
- #7 manager Team / My toggle -> FRS-213.10
- #8 View as preview -> FRS-212 (D-069)
- #10 theme picker -> FRS-213.14
- #11 user chip / menu -> FRS-213.9
- #12 update banner -> FRS-213.12
- #13 Clear Cache and Update -> FRS-213.13


---

# Rev 3.1 addendum — capabilities added after 2026-09-30

_Added 2026-10-02 for the Software Validation Package Rev 3.1. Same method as above — each row is something a person can do or the screen does by itself — for what shipped from v0.10.8 to v0.10.21. Every row is **Covered**: the requirement named states it, and the test named exercises it. Where a line here supersedes a row above, it says so._

| # | Screen | Capability | Where | Guard | Covered by |
|---|---|---|---|---|---|
| 1 | Field / Installation / PM call (view) | Update Party Details (City, State from the Party Master) and Update Product Details (warranty, contract, item status as on the registration date), one call or ticked in bulk; hidden and refused while Audit Mode is ON | FieldCalls.tsx (section headers); 0271 | calls.edit or calls.edit.customer; Audit Mode OFF (DB) | NAR-006 |
| 2 | Bulk Uploads | Technical / Service Notes upload, matched on the Drive link so a re-load corrects | uploads.ts `service_notes`; 0272 | bulk.upload | FRS-035; OQ-215 |
| 3 | Technical / Service Notes | Added / Added By / Updated show Drive's Created / Last Modified By / Last Modified for a note loaded from a listing; RITHI's own entry under Record details | DocumentLibrary.tsx; 0299 | docs.manage to edit; read by all signed in | FRS-035; OQ-215 |
| 4 | Technical / Service Notes | A note names several products (multi-select; comma-separated in the upload) | DocumentLibrary.tsx | docs.manage | FRS-035; OQ-215 |
| 5 | Call view — Supporting documents | Active Technical Notes offered beside the manuals, against each product a note names | CallAssociations.tsx; docmatch.ts | read by all signed in | FRS-035; OQ-215 |
| 6 | My Profile | One tab per section; the last tab remembered on the device | Profile.tsx | signed in | FRS-216.5; OQ-214 |
| 7 | My Profile → My Team | Active / Current and Ex Employees, by the User Master's Active column; an ex employee's profile still opens | MyPeople.tsx | the reporting tree; 0264 may_see_person | FRS-216.6; OQ-214 |
| 8 | Part Search (new screen, Overview) | Active parts, four columns, a type-search filter on each column; no edit, action, selection or download for anyone | PartSearch.tsx; 0308 | mod:/part-search (every configured role) | URS-167, FRS-217; OQ-211 |
| 9 | Header search (app-wide) | Screens, then records across ten registers, each opening its own record; supersedes app-wide #5 above | Layout.tsx; globalSearch.ts | RLS per register; the target screen's page key | URS-168, FRS-218, FRS-213.8; OQ-212 |
| 10 | Party Master | A party opens read-only for a person who may not edit it (before: a click did nothing) | PartyMaster.tsx | mod:/parties | FRS-218.4; OQ-212 |
| 11 | Spare Consumption | A line opens read-only with every field it carries (before: no line view) | SpareConsumption.tsx | mod:/spare-consumption; cons_read | FRS-218.4; OQ-212 |
| 12 | Part Master | HSN Code column, on Add part and the edit drawer (digits only), and in the Part Master upload | PartMaster.tsx; uploads.ts; 0309 | masters.edit.records | FRS-219; OQ-213 |
| 13 | Part Master — rename | A rename moves stock adjustments too, and needs only masters.edit.rename_part even for a part on another engineer's request or on a return | 0309, 0310 | masters.edit.rename_part (DB) | FRS-178.3, FRS-178.7, FRS-178.8; OQ-213 |
| 14 | Reports | The open tab is highlighted | dccr.css | — | D-080 (fixed) |
| 15 | How RITHI Functions → All modules | Every menu screen explained, in menu order, with its flows; the reader's access shown | ModuleGuide.tsx; moduleGuide.ts | signed in | FRS-191.10 |
| 16 | How RITHI Functions / Software Validation → Data flows | Fourteen workflows; ▶ Play, Pause, Previous, Next, Reset walk a flow step by step | FlowDiagram.tsx; flows.ts | signed in | FRS-209.8, FRS-209.9 |
