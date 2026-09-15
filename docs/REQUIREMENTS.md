# Requirements — the complete set, by module

**GENERATED — do not hand-edit.** Written by `scripts/requirements-doc.ts`
(`npm run docs:reqs`). Edit the source and re-run it.

One document, so there is one place to read what this system is required to
do. It is ASSEMBLED rather than written: every requirement below is
maintained somewhere else, and a hand-kept fifth copy would be the one that
goes stale while reading as authoritative.

| | Where it is maintained | What it is |
| --- | --- | --- |
| **URS** | `src/lib/validation.ts` | **User requirements** — what the business needs, in its own words |
| **FRS** | `src/lib/validation.ts` | **System requirements** — how this system does it. Each names the URS it implements |
| **CR** | [`docs/CALL_REQUEST_REQUIREMENTS.md`](CALL_REQUEST_REQUIREMENTS.md) | The CALL REQUEST module, in full |
| **SR** | [`docs/ISO13485_SERVICING.md`](ISO13485_SERVICING.md) | The SERVICING PROCESS against ISO 13485 §7.5.4 — a DRAFT, not approved |
| **OQ / PQ** | `src/lib/validation.ts` | The tests that prove each one |

## How to read it

**A user requirement is a need; a system requirement is a mechanism.** Under
each URS below sit the FRS entries that implement it, and under those the
tests that prove them. Read downwards and you have the whole argument for one
requirement: what was asked for, how it was built, and what shows it works.

**The module is derived from the words, not declared.** Nothing on a
requirement says which screen it belongs to. One is filed under a module when
its own text names that module — its route, or every distinctive word of its
label. So the grouping is evidence rather than opinion, and it moves when the
text does. A requirement naming several modules appears under each: "a manager
sees their team’s calls" really is a requirement of every call register.

**A requirement that names no screen is not forced into one.** Those are
gathered at the end. Most are system-wide — access control, audit, retention —
and belong to no single screen.

# Quality & Analytics

## Daily Call Review `/daily-review`

Opened by `mod:/daily-review`.

### URS-055 — The report on a closed call is reviewed

*Risk: Medium.* A closed call’s service report shall be subject to review by a competent person other than routine daily coding of the failure, with the reviewer and the time recorded. The reviewer shall be able to return the call to open where the report does not close it, and to correct consumption where a part was fitted and not booked.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-063** — Call Review register | Medium | OQ-49 |
| **FRS-064** — Correction and re-opening from the review | Medium | OQ-49 |

**FRS-063.** A register (call_report_reviews, one row per call) records that a closed call’s report has been reviewed, with the reviewer taken from the authenticated session and a caller-supplied identity discarded. Writing requires the callreview.mark permission and visibility of the call; reading follows the call’s own visibility. The register lists solved calls only — a report-pending call has no report to review — filtered in the database.

**FRS-064.** From the review the reviewer may book a Reconciliation consumption line against the call, off the ATTENDING engineer’s hand stock and capped at what that engineer holds by the same database trigger as any other consumption; or re-open the call with a recorded reason, after which it leaves the review list. Consumption shown for a call is matched on the call number OR the unique call number, so a call predating the call-number series still shows its parts.

## KPI & Failure Analysis `/kpi`

Opened by `mod:/kpi`.

### URS-045 — Controlled vocabulary is chosen, not typed

*Risk: High.* Where a field must match a controlled list — a Standard Complaint above all — the value shall be CHOSEN from that list and shall not be typed freehand, and no keystroke shall commit a value on its own. Counting, filtering, repeat-failure detection and every downstream report match on the stored value, so a hand-entered variant is a record that no analysis will ever find. Where a list is empty the field shall say so rather than accept arbitrary text.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-052** — One picking control, and typing never selects | High | OQ-39 |
| **FRS-053** — Standard Complaint takes no free text anywhere | High | OQ-39 |

**FRS-052.** Every dropdown in the application renders as a pick list that FILTERS on typing and commits only on a click or Enter over a highlighted row; a native `<select>` commits on the first keystroke, which on an auto-saving quality record wrote a value nobody chose. Below eight options the search box is suppressed, so a two-item list is not made harder to use. Free text is a per-field decision, OFF by default (`allowFreeText`); the form engine renders `type: select` this way, so every field-defined form inherits it. `npm run check:ui` fails the build on any native `<select>` remaining in the source.

**FRS-053.** The Standard Complaint is a pick list with free text OFF on every screen that asks for it — the Field Call, Installation and PM registers (through the form engine), the Visit Report and the Call Registration request. Where the master is empty the control says whether it is empty or still loading and remains a picker. Suggestions drawn from past calls are offered beneath it and are values from the register itself, so they remain valid even when the master has not loaded.

# Documents

## QMS Documents `/qms`

Opened by `mod:/qms`.

### URS-057 — A person’s signature is applied by that person alone

*Risk: High.* A user shall be able to record their own handwritten signature and have it reproduced on the documents that name them as signatory. The recorded signature shall be readable and writable only by the person it belongs to — by no manager, and by no administrator — and shall be reproduced on a document only where the signature block names the person producing it; in every other case the block shall be produced blank for signature by hand. Removal of a signature belonging to a person who has left shall be an authorised act which does not disclose the signature.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-066** — A signature is held for its owner only | High | OQ-51 |
| **FRS-067** — A document signs only the block that names the printer | High | OQ-51 |
| **FRS-068** — Administration of a signature discloses nothing | Medium | OQ-51 |

**FRS-066.** A user records a signature on My Profile, drawn with a finger, stylus or mouse or uploaded as a picture of one on paper; it is stored as a transparent PNG cropped to the ink (0172_user_signatures.sql). It is held in its own table rather than on the profile, because Row-Level Security grants by ROW: a policy permitting a person to save a signature on their profile row would permit them to rewrite the role and permissions on it. The read and update policies test `user_id = auth.uid()` and NOTHING ELSE — no is_admin(), no users.manage — so no second party can obtain the image, and none can set one. The owning user id is stamped from the session by trigger, so a row naming another user is stored under the inserter.

**FRS-067.** signatureBelongsTo() compares the name printed in the block with the identity of the signed-in user, on an EXACT match of name or e-mail ignoring case and surrounding space; a looser comparison would put one person’s signature on another’s document where names share a part. The Word copy of the Field Failure Report reproduces the CONTROLLED FORM itself — R-SER-03 Rev 02’s header band, two-column grid at the template’s own 6435/4500 split, every label with its exact wording and internal spacing, its A4 page setup and its footer carrying `TMPL No: R/SER/03 Rev: MAR 2020` — and a printable HTML page renders the SAME form from the same definition (src/lib/ffrform.ts), so a second transcription cannot drift from the first. The Delivery Challan reproduces the saved signature in the company block only when the person printing booked the stock out, and never in the customer’s block, which exists to be signed on receipt; the Field Failure Report (R-SER-03) embeds it only when the person generating the document is the raiser named on it. Where a signature is absent or unreadable the document is produced with an empty block, never with a broken image or a failure to produce it.

**FRS-068.** user_signature_status() reports, per user, WHETHER a signature has been saved and when — never the image. remove_user_signature() deletes one belonging to another person and is refused to a non-administrator and for the caller’s own row (which the Profile page removes). Both are SECURITY DEFINER functions, not views: a definer view over Row-Level-Security-protected tables reads as its owner and defeats the policies beneath it, which this system shipped three times, and the automated check that now refuses such a view is not weakened to admit these. A plain DELETE policy admitting an administrator was written first and does not work: PostgreSQL applies the SELECT policy to a DELETE that must locate its row, so an administrator unable to read the row reported a successful statement affecting nothing.

### URS-030 — Controlled QMS documents

*Risk: High.* Quality-system documents (SOPs, work instructions, forms) shall be held with their document number, revision and effective date, be readable by every user, and be maintainable only by the role responsible for the quality system. A superseded document shall be withdrawn from use without being destroyed.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-036** — QMS document control | High | OQ-21 |

**FRS-036.** QMS documents are held in the same catalogue under kind = qms with document number, revision and effective date, readable by every signed-in user and maintainable only under `qms.manage` — a right distinct from the one governing service manuals, and enforced in the database so a holder of either cannot move a document onto the other shelf. Withdrawal is by RETIRING the row (active = false): it stops being offered while the record of what was in force is retained. Authorship is stamped by the database and is not editable.

**Also governing this screen** — maintained in their own documents:

- **CR-029** — Supporting documents attach to the request and follow it to the call · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **SR-025** — Documents used in servicing are controlled: current revision, and obsolete revisions prevented from unintended use · [full text](ISO13485_SERVICING.md)

# Knowledge Base

## Service Manuals `/service-manuals`

Opened by `mod:/service-manuals`.

### URS-029 — Service manuals available at the point of work

*Risk: Medium.* The service documentation for a product shall be held centrally and presented to the engineer on the call for that product, so the machine is worked on against its own manual rather than one found by memory or by hunting a shared folder.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-035** — Service manual library & call lookup | Medium | OQ-21 |

**FRS-035.** Service manuals are catalogued in `documents` against the product they cover and stored in Google Drive. Opening a call lists its Supporting Documents — the manuals matching the call’s product, plus manuals held with no product (general to every machine) — alongside Knowledge Base articles whose title, product or tags match the call’s product or standard complaint. Every signed-in user may read the library; `docs.manage` maintains it.

# Service Calls

## Call Review `/call-review`

Opened by `mod:/call-review`.

### URS-065 — A recovered quality record is reviewed before it is written

*Risk: High.* Where records of work already done are recovered from a superseded system, each shall be resolved to the record it belongs to AND SHOWN TO AN OPERATOR BEFORE ANY OF IT IS WRITTEN, and only rows that resolved cleanly shall be written. A visit attached to the wrong call, or carrying another machine’s photograph, is a worse outcome than a visit still missing: the first is a false record of what was done to a device, the second is a gap that is visible as a gap. Rows that did not resolve shall be reported with the reason and left unwritten rather than written with a guess.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-077** — Bulk Report Mapping reads, resolves and only then writes | High | OQ-58 |

**FRS-077.** The screen runs in three stated steps and in this order: READ the sheet and work out which call each row belongs to; RESOLVE the superseded system’s file references into links; WRITE only the rows that came through both cleanly. Nothing is written until the operator has SEEN what each row resolved to, and rows that did not resolve are listed with the reason and are not written. The register it writes into is the visit history, whose records are never deleted, so a wrong write cannot be taken back — which is why the review is a step rather than a confirmation dialogue.

### URS-055 — The report on a closed call is reviewed

*Risk: Medium.* A closed call’s service report shall be subject to review by a competent person other than routine daily coding of the failure, with the reviewer and the time recorded. The reviewer shall be able to return the call to open where the report does not close it, and to correct consumption where a part was fitted and not booked.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-063** — Call Review register | Medium | OQ-49 |
| **FRS-064** — Correction and re-opening from the review | Medium | OQ-49 |

**FRS-063.** A register (call_report_reviews, one row per call) records that a closed call’s report has been reviewed, with the reviewer taken from the authenticated session and a caller-supplied identity discarded. Writing requires the callreview.mark permission and visibility of the call; reading follows the call’s own visibility. The register lists solved calls only — a report-pending call has no report to review — filtered in the database.

**FRS-064.** From the review the reviewer may book a Reconciliation consumption line against the call, off the ATTENDING engineer’s hand stock and capped at what that engineer holds by the same database trigger as any other consumption; or re-open the call with a recorded reason, after which it leaves the review list. Consumption shown for a call is matched on the call number OR the unique call number, so a call predating the call-number series still shows its parts.

### URS-046 — Repeat failure determined to the documented rule

*Risk: High.* The review shall determine whether a call is a repeat failure by the rule the servicing procedure states — counting the call under review, within the stated window, on the same equipment or the same part in the same machine — and shall present the rule alongside the verdict so a judgement recorded under one rule is not mistaken for one recorded under another. Window and threshold shall be maintainable by an administrator without a code change. Where the machine cannot be identified the review shall say so rather than report no repeat failure.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-054** — Repeat-failure verdict computed in the database | High | OQ-40 |

**FRS-054.** `frequent_failure(ucn)` returns the verdict and the calls behind it: earlier calls on the same product and serial within the window, matched on the same complaint OR the same part fitted, counted INCLUDING the call under review against the threshold. Window, threshold and whether the same-equipment path also requires a matching complaint are held in `app_settings` and editable in Admin Config; the defaults are the procedure’s (one month, two, on). The window is measured from the CALL’s date, not today, so reopening an old review cannot change its answer. A blank serial returns `known: false` — reported as “cannot tell” rather than “no repeat failure”. SECURITY DEFINER by design: an answer narrowed to the reader’s own call scope would read LOWER than the truth. Answers already recorded are not re-based; the screen shows the rule in force with the verdict.

## Request Registration `/request-registration`

Opened by `mod:/request-registration`.

### URS-066 — A request awaiting registration is visible and is dispositioned

*Risk: Medium.* A request for service that has not yet become a call shall be visible as such, and shall reach one of a stated set of outcomes — registered as a new call, mapped to an existing call, or cancelled with a reason. It shall not be possible for a request to be silently dropped or to remain in no state at all, a request nobody can see being indistinguishable from a request nobody made.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-078** — Pending Registrations is the queue, and every row leaves it by a stated route | Medium | OQ-59 |

**FRS-078.** Pending Registrations lists requests carrying no UC Number. Opening one offers exactly three outcomes — register it as a new call, map it to an existing call (its UCN is recorded against the request), or cancel it with a reason — and the request’s status records which. IT READS `call_requests`, NOT the sheet-era `pending_registrations` table: two corrections were aimed at the wrong table before that surfaced, and the distinction is recorded in the codebase notes as well as here.

### URS-034 — Requesting on behalf of an engineer

*Risk: Medium.* A reporting manager shall be able to raise a spare request, a call registration request or a visit report for an engineer reporting to them, with the record attributed to that engineer and the manager’s identity retained as its author.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-040** — Raising on behalf of a team member | Medium | OQ-24 |

**FRS-040.** Where a manager may act for their team, the engineer is a field on the form rather than an assumption: the Spare Request, Call Registration Request and Reporting forms offer the manager and every engineer reporting to them, defaulting to the manager. The record carries the chosen engineer and their address, so it reaches that engineer’s own lists, while `created_by` retains the manager as its author. The list is the same reporting sub-tree the read policies use, so a manager cannot raise for somebody they cannot see.

**Also governing this screen** — maintained in their own documents:

- **CR-021** — Pending Registrations reads `call_requests` · [full text](CALL_REQUEST_REQUIREMENTS.md)

## Pending Registrations `/pending-registrations`

Opened by `mod:/pending-registrations`.

**Also governing this screen** — maintained in their own documents:

- **CR-021** — Pending Registrations reads `call_requests` · [full text](CALL_REQUEST_REQUIREMENTS.md)

## Installation Calls `/installations`

Opened by `mod:/installations`.

### URS-006 — Installation control

*Risk: Medium.* Creation of installation calls shall be restricted to the Commercial function; installation records shall capture the warranty start date.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-006** — Call type segregation | Medium | OQ-04 |
| **FRS-008** — Installation gating | Medium | OQ-06 |

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

**FRS-008.** Insertion into installation_calls requires the install.create permission (Commercial, Hotline, admin); enforced by RLS.

## Preventive (PM) `/pm-calls`

Opened by `mod:/pm-calls`.

### URS-005 — Preventive maintenance

*Risk: Medium.* The company shall schedule and record preventive-maintenance (PM) visits, including bulk creation of the monthly PM batch by an administrator.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-006** — Call type segregation | Medium | OQ-04 |
| **FRS-009** — PM bulk upload | Medium | OQ-14 |

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

**FRS-009.** An administrator uploads a CSV; rows are mapped, forced to PM type, previewed, then inserted in batches with UCN/Call Number assigned by the database.

### URS-026 — Preventive-maintenance scheduling

*Risk: Medium.* The monthly preventive-maintenance batch shall be created for a stated due month, retaining the date it was uploaded, and shall support loading earlier months.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-032** — PM due-month batch | Medium | OQ-19 |

**FRS-032.** The PM bulk upload dates every call in a batch to the first of a chosen due month (reg_date), records the upload date as added_on, and sequences a registration date-and-time (reg_at) so the batch holds a stable order. Call numbering is unchanged.

**Also governing this screen** — maintained in their own documents:

- **SR-034** — Corrective action is taken on causes of nonconformity, and its effectiveness is verified; preventive action likewise · [full text](ISO13485_SERVICING.md)

## Customer Feedback `/feedback`

Opened by `mod:/feedback`.

### URS-012 — Customer feedback

*Risk: Low.* Customer feedback captured on a call shall be recorded and retrievable per question.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-017** — Feedback capture | Low | OQ-28 |

**FRS-017.** Feedback answers are stored per question and surfaced as columns in the Customer Feedback view, scoped like calls.

# Spares

## RM Approval `/spare-rm-approval`

Opened by `mod:/spare-rm-approval`.

### URS-007 — Spare request & approval

*Risk: High.* An engineer shall request spare parts against a call; the request shall follow a defined multi-stage approval chain, each stage authorised by the correct role.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-010** — Spare approval chain | High | OQ-07 |
| **FRS-011** — Manager-scoped approval | High | OQ-07 |

**FRS-010.** A spare request creates per-part lines; each advances RM → Commercial → NSM → Stores. A per-stage database guard blocks a stage change unless the actor holds that stage’s permission.

**FRS-011.** A reporting manager sees and approves only their own team’s spare requests; their own request routes to their manager, not to themselves.

### URS-028 — Dispatch performance

*Risk: Low.* The time taken by Stores to issue an approved spare shall be measurable, from the moment the spare cleared its last approval to the moment it was issued.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-034** — Days to dispatch | Low | OQ-20 |

**FRS-034.** spare_stock_out_lines lists every spare issued, one row each, with days_to_dispatch measured from the last approval recorded on the line (NSM where the item needs that review, else Commercial, else RM) to the stock out.

## Stock Out `/stock-out`

Opened by `mod:/stock-out`.

### URS-009 — Stock accuracy

*Risk: Medium.* Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

### URS-024 — Stock integrity

*Risk: High.* No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-030** — Consumption capped at hand stock | High | OQ-15 |

**FRS-030.** A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer’s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against.

### URS-037 — Migrated data is distinguishable from the system’s own record

*Risk: High.* Where a stock or service figure is derived partly from records MIGRATED from the superseded system and partly from records this system created, a user shall be able to see how much of the figure comes from each, and to read the figure without the migrated part. Neither reading shall be presented as a correction of the other.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-071** — The field failure register is loaded year by year, whatever shape each year is | Medium | OQ-63 |
| **FRS-043** — The balance declares its migrated part | High | OQ-30 |

**FRS-071.** The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year.

**FRS-043.** Hand stock is derived from nine arms, three of which are migrated: the opening pools (`ref_type = Opening balance`) and the pre-2026 stock outs and yearly consumption exports (`ref_type = Historical`). `handstock_balance` carries `hist_stock_out`, `hist_consumed`, `hist_net` and `on_hand_live` (0102), so the register shows what the migration contributes per line and can present the balance without it. The identity `on_hand - hist_net = on_hand_live` holds for every row. The whole line is restated when the migrated part is excluded, not only the total, so the components on screen still reconcile. Both figures are labelled; neither is offered as a correction of the other.

### URS-038 — Closing a stock period

*Risk: High.* An authorised role shall be able to close a stock period, fixing an opening figure per engineer and part that stands for every movement up to that date, so the register need not re-derive settled history. A close shall not change any balance.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-044** — Period close | High | OQ-31 |

**FRS-044.** `close_handstock_period(date)` writes an opening figure per engineer and part equal to the net of every movement up to that date, then moves a cut-off (`handstock_cutoff()`) that every arm of the movement view tests. The sum and the arms divide the SAME instant — the close takes `< cutoff`, the arms `>= cutoff` — so no movement can fall on both sides. Restricted to an administrator or `consumption.reconcile`; refuses a period that has not ended. A closing figure may be negative, because it must equal exactly what it replaces.

### URS-041 — Migrated stock belongs to a person who can hold it

*Risk: Medium.* A stock balance shall be opened only against an active member of the user directory; identifiers appearing in a migrated file that are not people (dealers, customers) shall be excluded before loading, and what is excluded shall be reported.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-047** — Opening stock is an engineer’s | Medium | OQ-34 |

**FRS-047.** Both opening-stock registers resolve each row’s name against the ACTIVE user directory before writing, matching on `lower(btrim(name))` — the same normalisation the balance is keyed on. Rows that do not match are withheld and NAMED before anything is written, so the count approved is the count loaded. An empty directory is refused rather than treated as "nothing matches". `_handstock_opening_engineers.sql` applies the same rule to already-loaded data and reports what it removes.

### URS-049 — Custody of equipment held on the organisation’s premises

*Risk: High.* Equipment taken into the organisation’s own premises shall be recorded on a register that identifies it, states WHOSE property it is, and holds the condition it arrived in — that condition being the baseline against which any later damage is judged. Where such equipment is lost, damaged or found unfit for use, that shall be recorded and reported to its owner. The register shall distinguish the organisation’s own stock from a customer’s property, because the duty of care applies to one and not the other, and shall not require a service call to exist: equipment may be held for reasons that have no call.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-057** — The Indoor Service Register, on two axes | High | OQ-43 |

**FRS-057.** Equipment taken into the workshop is recorded in `indoor_jobs`, one row per intake, carrying `received_at` / `received_by`, `condition_on_arrival`, the physical `tag_no` and a `status` through nine states. TWO INDEPENDENT AXES: `kind` states whose property it is (Customer property | DEMO unit) and is what makes the custody duty applicable or not; `activity` states what is being done to it (Repair | Rework | Salvage | Pre-delivery inspection | Demo | Other). Neither is reachable from the other, so equipment does not change ownership because the work on it changed. `ucn` is NULLABLE — a demonstration unit has no call — which is why the register stands alone rather than being a state of a call. Damage is `damage_note` with `reported_to_customer_at` / `_by`. Accessories are rows in `indoor_job_accessories`, each tagged to the parent job, so what came in with the equipment is a list that can be checked off when it goes back.

### URS-052 — Scrapping equipment is an authorised act

*Risk: High.* Condemning equipment shall require an authority granted for that purpose alone, shall record who condemned it and why, and shall be refused to anybody not holding that authority. Parts recovered from condemned equipment shall be recorded with their condition, and shall not enter usable stock in a way that makes them indistinguishable from new parts.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-060** — Condemnation is gated, and recovered parts credit no balance | High | OQ-46 |

**FRS-060.** `indoor.condemn` is a permission of its own, enforced by a trigger on insert and update, and granted to the administrator role alone when the schema is applied — so no role acquires the ability to scrap equipment merely by being given the page. `condemned_reason` is required by a CHECK constraint before the status may be Condemned, and `condemned_by` / `condemned_at` are stamped by the database. Recovered parts are rows in `indoor_job_parts` with a condition grade and a destination in words; NO stock balance is altered, because a recovered part entering stock under its ordinary code cannot afterwards be told from a new one.

## Spare Consumption `/spare-consumption`

Opened by `mod:/spare-consumption`.

### URS-023 — Reconciliation of consumption

*Risk: High.* Authorised office roles shall be able to record a spare consumed against a call that the engineer did not report, correct a quantity reported in error, and void an entry made in error, with a reason retained for each.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-028** — Reconciliation entry | High | OQ-16 |
| **FRS-029** — Quantity adjustment and voiding | High | OQ-17 |

**FRS-028.** Holders of consumption.reconcile (Spare Coordinator, Hotline, Admin) may insert consumption rows flagged source = Reconciliation. UCN (validated against an existing call), engineer, part and reason are mandatory and enforced by a database trigger; the entry records who made it. Parts offered are limited to the engineer’s hand stock.

**FRS-029.** The same role may amend the quantity of an existing consumption line. The original quantity, the reason, and who amended it are retained on the row; the call, part, engineer and source cannot be altered. Setting the quantity to zero voids the line, returning the stock, while the record is retained (hard deletion remains blocked).

### URS-036 — Reliability and consumption analysis

*Risk: Medium.* Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-042** — KPI aggregates | Medium | OQ-29 |

**FRS-042.** Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer’s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped — it is a property of the fleet — so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess.

### URS-047 — Spares sent to a call are accounted for against it

*Risk: Medium.* A spare that reached an engineer for a specific call shall be accounted for in that call’s consumption, and any shortfall shall be reportable — whether nothing was booked or less than was sent. A part refused or never dispatched shall not be reported as unaccounted for, because nothing arrived to be fitted. The determination shall be made only once the call is closed.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-055** — Unaccounted spares are reportable | Medium | OQ-41 |

**FRS-055.** `unused_spare_report` lists spare lines DISPATCHED or RECEIVED against a call whose part code is not fully accounted for in that call’s consumption — NOT USED where none was booked, SHORT where less was booked than sent. Quantities are aggregated per call and part, so a part sent twice and booked once is not two false findings. Refused and dropped lines are excluded: nothing arrived. Matched on the part CODE, the description being unstable. Only calls in a solved state are assessed, an open call’s parts being legitimately still in the van. `security_invoker`, so a reader sees only the calls their role allows.

## Hand Stock `/handstock`

Opened by `mod:/handstock`.

### URS-009 — Stock accuracy

*Risk: Medium.* Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

### URS-024 — Stock integrity

*Risk: High.* No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-030** — Consumption capped at hand stock | High | OQ-15 |

**FRS-030.** A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer’s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against.

## Material Returns (MRN) `/mrn`

Opened by `mod:/mrn`.

### URS-009 — Stock accuracy

*Risk: Medium.* Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

## Stock Transfer `/stock-transfer`

Opened by `mod:/stock-transfer`.

### URS-009 — Stock accuracy

*Risk: Medium.* Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

# Reports

## Reports `/exports`

Opened by `mod:/exports`.

### URS-064 — A credential cannot be recovered from a log

*Risk: High.* No log, error message or build record the system produces shall contain any part of a credential. Where a credential is malformed such that a subsystem would report a fragment of it, the operation shall be REFUSED before that subsystem is reached, and the refusal shall say what to correct without reproducing any part of the value. Masking the credential is not by itself sufficient: a subsystem reports the piece it failed on, which may be a fragment matching neither the credential nor the string containing it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-076** — The migration runner refuses rather than let a credential reach a log | High | OQ-57 |

**FRS-076.** The database URL is passed to psql through the environment, never on a command line, and psql’s output is masked before it is logged. THAT WAS NOT SUFFICIENT, and a real run proved it twice. Node’s URL parser splits credentials at the LAST “@” and libpq at the FIRST, so a password containing an unencoded “@” makes libpq report a HOST built from a SUFFIX of the password — a string matching neither the password nor the URL, which no exact-value mask can catch. It reached a public build log while the platform’s own masking displayed the secret as masked throughout. scripts/apply-migrations.mjs now REFUSES before psql is invoked when the URL carries more than one “@”, names the correction and prints no part of the value: nothing can leak from a call that is not made. Every tail of the password of three characters or more is additionally masked, for any other tool reporting the same shape. The exposure already made is not undone by this and is recorded as requiring the credential to be rotated.

### URS-013 — Reports & analytics

*Risk: Medium.* Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — KPI Export `/exports/kpi`

Opened by `mod:/exports/kpi`.

### URS-013 — Reports & analytics

*Risk: Medium.* Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

# Master

## Party Master `/parties`

Opened by `mod:/parties`.

### URS-010 — Master data

*Risk: Medium.* Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

## User Master `/user-master`

Opened by `mod:/user-master`.

### URS-010 — Master data

*Risk: Medium.* Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

## Part Master `/parts`

Opened by `mod:/parts`.

### URS-010 — Master data

*Risk: Medium.* Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

### URS-027 — Refurbished spares

*Risk: High.* Where a recycled spare is issued in place of a new one, it shall be identified by its own part number, held and consumed as that part, and the engineer shall be told the part is refurbished. Only a part held in Part Master and active may be issued this way.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-033** — Refurbished issue | High | OQ-20 |

**FRS-033.** Stores may mark a line as refurbished when issuing it. The issue records the recycled identity — R + part code, description unchanged — while the request keeps what was asked for. Hand stock is derived from the ISSUE, so the refurbished part is held and consumed under its own code. A database check refuses the swap unless that code exists in Part Master and is active, and the engineer’s dispatch notification states that the part is refurbished.

# Administration

## User Access `/users`

Opened by `mod:/users`.

### URS-001 — Authenticated access

*Risk: High.* Only authenticated, authorised personnel shall access the system, each with a unique user identity.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-001** — Credential authentication | High | OQ-01 |
| **FRS-002** — Account lifecycle | High | OQ-01 |
| **FRS-051** — Two names on a registration | High | OQ-37 |

**FRS-001.** The system authenticates users against Supabase Auth (email + password); first sign-in forces a password set; sessions are token-based and expire.

**FRS-002.** Administrators create logins from User Master; a leaver’s login can be set inactive, blocking sign-in and hydration while retaining their historical records.

**FRS-051.** Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it.

## Audit Log `/audit`

Opened by `mod:/audit`.

### URS-016 — Audit trail

*Risk: High.* The system shall keep a secure, attributable, time-stamped audit trail of key actions that users cannot alter.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-021** — Audit log | High | OQ-09 |

**FRS-021.** ONE TRAIL, as of 0112 (2026-09-05). `audit_log` records what a USER DID — action, target, duration, outcome, actor and time — and its retention is configurable (app_settings.audit_retention_days, default ~10 years), with a daily digest archiving the day off-database. Its LIMITS are stated rather than glossed: it is written by the CLIENT, so it can be bypassed by a direct API call, and it is purged when the retention window passes. THE SECOND TRAIL HAS BEEN SWITCHED OFF. `record_audit` recorded what a ROW BECAME, before and after, in SECURITY DEFINER triggers that could not be bypassed and were never purged; it was added for 21 CFR Part 11, which is FDA’s and does not apply here, and stopped at the user’s direction. The TABLE REMAINS, readable by an administrator, holding everything it captured while it ran (2026-08 to 2026-09-05) — retained, not maintained. Re-attaching the triggers is one statement if a later assessment wants the control back.

# Not tied to one screen

These name no module in their own words. Most are system-wide, and forcing
them under a screen would say something the requirement does not.

## User requirements

- **URS-067** — Authority over a quality record is held section by section · implemented by FRS-079
- **URS-063** — A read-only role holds no authority to write, and a derived role does not track its source · implemented by FRS-075
- **URS-062** — A loaded register can be corrected by loading it again · implemented by FRS-074
- **URS-061** — A value that cannot be determined is recorded as unknown · implemented by FRS-073
- **URS-060** — A record is keyed on what identifies it · implemented by FRS-072
- **URS-053** — A service record identifies the individual device · implemented by FRS-061
- **URS-054** — Consumption recorded against a call is complete · implemented by FRS-062
- **URS-058** — A judgement on a quality record names the person who made it · implemented by FRS-069
- **URS-059** — Every change to a field failure report is recorded · implemented by FRS-070
- **URS-056** — An access role always has a defined permission set · implemented by FRS-065
- **URS-002** — Role-based visibility · implemented by FRS-003, FRS-004, FRS-014, FRS-050
- **URS-003** — Register a service call · implemented by FRS-005, FRS-006
- **URS-004** — Record a visit / call report · implemented by FRS-007
- **URS-008** — Spare dispatch & receipt · implemented by FRS-012
- **URS-011** — Warranty & contract cover · implemented by FRS-016
- **URS-014** — SLA monitoring · implemented by FRS-019
- **URS-015** — Notifications · implemented by FRS-020
- **URS-017** — Data integrity & retention · implemented by FRS-022
- **URS-018** — Availability & recovery · implemented by FRS-023
- **URS-019** — Controlled change · implemented by FRS-024
- **URS-020** — Knowledge base · implemented by FRS-025
- **URS-021** — Partial issue of spares · implemented by FRS-026
- **URS-022** — Acknowledged receipt · implemented by FRS-027
- **URS-025** — Re-opening a closed call · implemented by FRS-031
- **URS-031** — Find a machine, or a customer’s machines · implemented by FRS-037
- **URS-032** — Allotment and re-allotment of calls · implemented by FRS-038
- **URS-033** — Grouping a register · implemented by FRS-039
- **URS-035** — Correcting who a spare order is for · implemented by FRS-041
- **URS-039** — Identifier continuity across a migration · implemented by FRS-045
- **URS-040** — A bulk load shall not silently alter what it does not carry · implemented by FRS-074, FRS-071, FRS-046
- **URS-042** — Response within a working time · implemented by FRS-048
- **URS-043** — Decision support · implemented by FRS-049
- **URS-044** — Attributable registration · implemented by FRS-051
- **URS-048** — Cover continues across a contract renewal · implemented by FRS-056
- **URS-050** — Decontamination before the equipment is worked on · implemented by FRS-058
- **URS-051** — A quality check separable from the work it checks · implemented by FRS-059

## Call Request module

- **CR-001** — A request is identified by a REQID the database mints · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-002** — Each call on a request is keyed `REQID-Product-Serial` · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-003** — A key that reads `…-NA` is a defect, not a variant · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-004** — One machine appears at most once on a request · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-005** — The customer is read off the machine, never asked for separately · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-006** — Identifying the machine must not require identifying the customer first · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-007** — The first call fixes the customer for the request · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-008** — A later call inherits the site, it does not ask for it again · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-009** — Changing the first call's customer cannot leave a machine behind · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-010** — The serial number is mandatory · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-011** — A serial that names no customer is refused · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-012** — An empty master is a master problem, and the form says so · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-013** — The site is recorded per call, not per request · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-014** — A value the person typed is never overwritten by the register · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-015** — The Standard Complaint is chosen, never typed · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-016** — Reported Problem is mandatory and free · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-017** — An installation asks for the customer, because there is no machine yet · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-018** — Installation is the only path that accepts a customer not on a master · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-019** — A request's status follows its UCN · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-020** — A request is never deleted · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-022** — Raising a request is a permission · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-023** — A person sees the requests that are theirs, their team's, or their desk's · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-024** — The visibility rule is evaluated once per query, not once per row · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-025** — No control on this form may cost more as the register grows · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-026** — A list that is capped must be complete by some other route · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-027** — A search that fails must say so, and must never look like an empty result · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-028** — The person who raised a request is the database's to say · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **CR-030** — Every field the form collects is written per call row · [full text](CALL_REQUEST_REQUIREMENTS.md)

## Servicing process (ISO 13485)

- **SR-001** — Servicing is a specified requirement, and its scope is stated · [full text](ISO13485_SERVICING.md)
- **SR-002** — A documented servicing procedure exists for each product family · [full text](ISO13485_SERVICING.md)
- **SR-003** — Reference materials and reference measurements are available at the point of work · [full text](ISO13485_SERVICING.md)
- **SR-004** — Every servicing event is recorded as a controlled record · [full text](ISO13485_SERVICING.md)
- **SR-005** — The servicing record identifies the device, the customer, the fault, the work done and the outcome · [full text](ISO13485_SERVICING.md)
- **SR-006** — After servicing, it is verified that product requirements are met, and the verification is recorded · [full text](ISO13485_SERVICING.md)
- **SR-007** — The status of the device is identified throughout, including whether it is fit to return to use · [full text](ISO13485_SERVICING.md)
- **SR-008** — Where the result of servicing cannot be fully verified by subsequent inspection, the process is validated · [full text](ISO13485_SERVICING.md)
- **SR-009** — Servicing is performed under controlled conditions: the approved procedure, the right instruments, a competent person · [full text](ISO13485_SERVICING.md)
- **SR-010** — Response and completion against a defined service level is measurable, against the levels the procedure actually sets · [full text](ISO13485_SERVICING.md)
- **SR-011** — Documented installation requirements and acceptance criteria exist, and installation is verified against them · [full text](ISO13485_SERVICING.md)
- **SR-012** — Records of installation and verification are kept, including where the work is done by a supplier · [full text](ISO13485_SERVICING.md)
- **SR-013** — Every serviced device is uniquely identifiable, and its service history is retrievable by that identity · [full text](ISO13485_SERVICING.md)
- **SR-014** — Spare parts are obtained from approved suppliers and meet the device's specification · [full text](ISO13485_SERVICING.md)
- **SR-015** — The part fitted to a device is traceable to what was fitted · [full text](ISO13485_SERVICING.md)
- **SR-016** — Parts are preserved, identified and controlled in the field · [full text](ISO13485_SERVICING.md)
- **SR-017** — A part removed as defective is controlled as nonconforming material · [full text](ISO13485_SERVICING.md)
- **SR-018** — Servicing personnel are competent for the product they service, and competence is recorded · [full text](ISO13485_SERVICING.md)
- **SR-019** — The training a role requires before productive use is defined and recorded · [full text](ISO13485_SERVICING.md)
- **SR-020** — Monitoring and measuring equipment used to verify a serviced device is identified, calibrated to a traceable standard, and its calibration status is known at the time of use · [full text](ISO13485_SERVICING.md)
- **SR-021** — Where equipment is found out of calibration, the validity of previous results is assessed and action taken · [full text](ISO13485_SERVICING.md)
- **SR-022** — Infrastructure maintenance that can affect product quality is planned and recorded, with intervals stated · [full text](ISO13485_SERVICING.md)
- **SR-023** — Servicing records are attributable, legible, contemporaneous, original and accurate, and cannot be altered without trace · [full text](ISO13485_SERVICING.md)
- **SR-024** — Records are retained for the required period and are retrievable · [full text](ISO13485_SERVICING.md)
- **SR-026** — Servicing records are systematically ANALYSED — not merely filed · [full text](ISO13485_SERVICING.md)
- **SR-027** — The analysis determines whether the information is to be handled as a COMPLAINT, and that determination is recorded — including a decision of "not a complaint" and its reason · [full text](ISO13485_SERVICING.md)
- **SR-028** — Complaints are handled under a documented process: received, evaluated, investigated where indicated, actioned, and closed with a record; and a decision not to investigate is justified and recorded · [full text](ISO13485_SERVICING.md)
- **SR-029** — Where a complaint or servicing finding is reportable to the regulatory authority, it is reported within the required timeframe and the submission is recorded · [full text](ISO13485_SERVICING.md)
- **SR-030** — Post-market feedback from servicing feeds risk management and product realisation · [full text](ISO13485_SERVICING.md)
- **SR-031** — A device found nonconforming during servicing is identified, segregated where applicable, and dispositioned with a record · [full text](ISO13485_SERVICING.md)
- **SR-032** — Where nonconforming product is detected after delivery, action appropriate to the effects is taken — including, where required, an advisory notice, with records of each issued · [full text](ISO13485_SERVICING.md)
- **SR-033** — Data from servicing is analysed to show the suitability and effectiveness of the quality system, and the analysis is recorded · [full text](ISO13485_SERVICING.md)
- **SR-035** — Where servicing is outsourced, the supplier is evaluated and controlled, and the arrangement is documented · [full text](ISO13485_SERVICING.md)
- **SR-036** — Records of servicing carried out by a SUPPLIER are analysed on the same footing as the organisation's own · [full text](ISO13485_SERVICING.md)
- **SR-037** — Software used in the servicing process is validated for its intended use, and revalidated on change · [full text](ISO13485_SERVICING.md)
- **SR-038** — A complaint that arrives WITHOUT a field call still reaches the complaint population · [full text](ISO13485_SERVICING.md)
- **SR-039** — A complaint or servicing finding identified here demonstrably REACHES the separate quality system that handles it · [full text](ISO13485_SERVICING.md)
- **SR-040** — Customer property in the organisation's possession is identified, verified, protected and safeguarded; and where it is lost, damaged or found unfit for use, that is REPORTED TO THE CUSTOMER and recorded · [full text](ISO13485_SERVICING.md)
- **SR-041** — Equipment is cleaned and decontaminated before it is worked on, to the work instruction, and that is recorded · [full text](ISO13485_SERVICING.md)
- **SR-042** — The equipment carries an identified STATUS throughout, and its accessories are identified to the equipment they came with · [full text](ISO13485_SERVICING.md)
- **SR-043** — A quality check is performed on completion, before the equipment goes back, and the record is kept · [full text](ISO13485_SERVICING.md)
- **SR-044** — A call that moves between departments keeps its identity and its history · [full text](ISO13485_SERVICING.md)

# Where the set is not complete

Stated rather than left to be noticed. None of these is a defect on its own —
each is a question for a person.

| | Count | What it means |
| --- | --- | --- |
| User requirements no system requirement implements | 0 | a gap, or a need met outside this system |
| System requirements no test names | 0 | built and specified, not yet proved |
| User requirements nothing proves, directly or through an FRS | 0 | the one that matters for an audit |

**Is every screen covered?** That question is answered in
[`REQUIREMENT_COVERAGE.md`](REQUIREMENT_COVERAGE.md), which searches the whole
package rather than requirement text alone. It is not answered here: the match
used for FILING above is strict on purpose, and inverting a strict match to
claim an absence reports every near-miss as a gap.

---

**67** user requirements · **79** system requirements · **30** call-request · **44** servicing · **71** tests · **2** recorded as non-auditable · **39** of 67 user requirements tied to a module by their own words.
