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
| **CW** | [`docs/COVER_REQUIREMENTS.md`](COVER_REQUIREMENTS.md) | WARRANTY, CONTRACT, OWNERSHIP TRANSFER and the assembled machine record — a DRAFT |
| **OQ / PQ** | `src/lib/validation.ts` | The tests that prove each one |

## How to read it

**A user requirement is a need; a system requirement is a mechanism.** Under
each URS below sit the FRS entries that implement it, and under those the
tests that prove them. Read downwards and you have the whole argument for one
requirement: what was asked for, how it was built, and what shows it works.

**Derived by default, declared by exception — and each entry says which.**
A requirement is filed under a module when its own text names that module —
its route, or every distinctive word of its label — so the grouping is
evidence rather than opinion and it moves when the text does. Where the words
name no screen, the requirement may DECLARE the modules it governs, and those
are marked *declared* below.

That exception exists because derivation alone left **34 of 56 screens** with
no requirement section, the **Field Call Register** among them: URS-003 says
"register a customer call" and never says "field", so the one requirement that
plainly governs the register was filed under "not tied to one screen". The two
are UNIONED rather than one replacing the other, so a requirement that later
gains the words keeps being filed by them.

A requirement naming several modules appears under each: "a manager sees their
team’s calls" really is a requirement of every call register.

**A requirement that names no screen is not forced into one.** Those are
gathered at the end. Most are system-wide — access control, audit, retention —
and belong to no single screen.

# Overview

## Dashboard `/`

Opened by `mod:/`.

### URS-014 — SLA monitoring

*Risk: Medium. Filed here because the requirement declares this screen.*

The company shall define service-level targets and the system shall highlight open calls that are due or breached.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-019** — SLA engine | Medium | OQ-11 |

**FRS-019.** Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached.

## My Workload `/workload`

Opened by `mod:/workload`.

### URS-074 — A decision to supply rests on evidence that is retained

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall record, for each customer, whether that customer has been verified. The system shall retain the records on which that verification rests. The system shall show both wherever the decision to supply is taken. A verification with no record behind it is an assertion, and the person relying on it downstream cannot check it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-090** — What the period suggests, and what the customer register holds | Medium | OQ-78 |
| **FRS-088** — The installations awaiting Commercial | Low | OQ-76 |
| **FRS-086** — KYC records attached to a customer | Medium | OQ-74 |

**FRS-090.** FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has.

**FRS-088.** FRS-088.1 My Workload shall list the number of installation requests for which no call has been raised. FRS-088.2 My Workload shall state, of those, the number whose customer is verified. FRS-088.3 My Workload shall state, of those, the number whose customer is not verified. FRS-088.4 My Workload shall state, of those, the number whose customer is absent from the customer register. FRS-088.5 My Workload shall open the request register filtered to the stated subset when the operator selects a count. FRS-088.6 The request register shall display the verification status of the customer named by each request. RATIONALE: FRS-088.4 is separate from FRS-088.3 because the two need opposite actions — a customer who is absent is added, a customer who is present is verified — and a figure that merges them sends somebody to verify a customer who does not exist. The section is offered to every operator who may open the request register rather than to one department, because a count over a list the reader may not open is both useless and a disclosure of its size.

**FRS-086.** FRS-086.1 The customer register shall attach a document to a customer and shall record its name, its location, the operator who attached it and the time. FRS-086.2 The customer register shall display the verification status of each customer in its list. FRS-086.3 The customer register shall display a link to each attached record in that list. FRS-086.4 The system shall treat a customer as verified on the recorded status alone. FRS-086.5 The system shall treat no customer as verified by the presence of an attached record. FRS-086.6 The customer register shall state, for a verified customer with no attached record, that the record is absent. FRS-086.7 The customer register shall retain a removed record in the document store. RATIONALE: .4 and .5 are the two halves of one asymmetry. The status is a DECISION a person made, and withholding it because the paperwork was filed elsewhere would make the system stricter than the people it serves; attaching a file is not a decision, so it can never make a customer verified. .7 because a KYC record somebody relied on is worth keeping wherever it sits.

### URS-066 — A request awaiting registration is visible and is dispositioned

*Risk: Medium. Filed here because the requirement declares this screen.*

A request for service that has not yet become a call shall be visible as such, and shall reach one of a stated set of outcomes — registered as a new call, mapped to an existing call, or cancelled with a reason. It shall not be possible for a request to be silently dropped or to remain in no state at all, a request nobody can see being indistinguishable from a request nobody made.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-078** — Pending Registrations is the queue, and every row leaves it by a stated route | Medium | OQ-59 |

**FRS-078.** Pending Registrations lists requests carrying no UC Number. Opening one offers exactly three outcomes — register it as a new call, map it to an existing call (its UCN is recorded against the request), or cancel it with a reason — and the request’s status records which. IT READS `call_requests`, NOT the sheet-era `pending_registrations` table: two corrections were aimed at the wrong table before that surfaced, and the distinction is recorded in the codebase notes as well as here.

## Product & Party Search `/lookup`

Opened by `mod:/lookup`.

### URS-031 — Find a machine, or a customer’s machines

*Risk: Low. Filed here because the requirement declares this screen.*

A user shall be able to identify the customer holding a given product and serial number, and to list every machine and serial number recorded against a given customer, without needing to know how either is spelled in the register.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-037** — Product & Party Search | Low | OQ-25 |

**FRS-037.** A dedicated screen answers the question from either end. By product: the product list is the distinct set of item names in the PRODUCT REGISTER (view `product_register_names`, security_invoker) with the machine count beside each, and choosing one narrows Serial Number to that product’s serials — an equality match on `products.item_name`, served by the btree index of 0052, so a product name is never a prefix of another. By party: the party list opens the master and the box beside it takes any part of a name. Both land on one answer — the party, its recorded details, and every machine held against it. Export is deliberately absent from this screen.

## Machine History `/machine-history`

Opened by `mod:/machine-history`.

### URS-053 — A service record identifies the individual device

*Risk: High. Filed here because the requirement declares this screen.*

Every service call shall identify the single machine it concerns by its serial number, from the request onward. A record that names a product but not a unit cannot be traced to the device serviced, and its cover, warranty and contract cannot be established.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-061** — The serial is mandatory | High | OQ-47 |

**FRS-061.** The serial number is a required field on the call request and on the Field, Installation, PM and pending-registration call forms. The request refuses an item without one, and names the cause where the machine is absent from Product Database rather than inviting the field to be skipped. The request identifier is composed REQID-Product-Serial, so a missing serial is visible in the key itself.

### URS-031 — Find a machine, or a customer’s machines

*Risk: Low. Filed here because the requirement declares this screen.*

A user shall be able to identify the customer holding a given product and serial number, and to list every machine and serial number recorded against a given customer, without needing to know how either is spelled in the register.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-037** — Product & Party Search | Low | OQ-25 |

**FRS-037.** A dedicated screen answers the question from either end. By product: the product list is the distinct set of item names in the PRODUCT REGISTER (view `product_register_names`, security_invoker) with the machine count beside each, and choosing one narrows Serial Number to that product’s serials — an equality match on `products.item_name`, served by the btree index of 0052, so a product name is never a prefix of another. By party: the party list opens the master and the box beside it takes any part of a name. Both land on one answer — the party, its recorded details, and every machine held against it. Export is deliberately absent from this screen.

# Quality & Analytics

## Daily Complaint Review Register (R/SER/35) `/daily-review`

Opened by `mod:/daily-review`.

### URS-058 — A judgement on a quality record names the person who made it

*Risk: High. Filed here because the requirement declares this screen.*

Where the system records a judgement about a product failure, it shall record WHO made that judgement, taken from the authenticated session at the moment the judgement is completed and not from a value supplied by the caller. The identity shall not be displaced by later editing of the same record, and where the judgement is carried onto a further record the person shall be carried with it. No record shall attribute a judgement to a screen, a process or the system itself.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-069** — The reviewer is stamped by the database at completion | High | OQ-52 |

**FRS-069.** A BEFORE trigger on `call_reviews` (0173) records `review2_by_uid` / `review3_by_uid` from auth.uid() at the moment a review stage becomes COMPLETE, and fills the display name from User Master where the client sent none — so the automatic-save and bulk-review paths, which send no name, record a person instead of nothing. A name the client did send is kept: it is what the reviewer saw on screen. A later edit does NOT re-stamp: the person who answered the review is the reviewer, not whoever last corrected a spelling. The trigger evaluates the completion test from the source columns rather than reading `review2_done`, because PostgreSQL computes a GENERATED column AFTER the BEFORE triggers have run — the first version read it, stamped nothing on every path, and was caught only by exercising it against a database. The duplicated expression is compared word-for-word with its original by an automated check. raise_ffr() carries the name onto the Field Failure Report, preferring Review 3’s reviewer, and no longer writes the string “Daily Call Review” — a screen is not a person, and a report that cannot name one is left blank, blank being a question somebody asks.

## Product Failure Analysis `/product-failure`

Opened by `mod:/product-failure`.

### URS-036 — Reliability and consumption analysis

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-042** — KPI aggregates | Medium | OQ-29 |

**FRS-042.** Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer’s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped — it is a property of the fleet — so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess.

## Spare Insights `/spare-insights`

Opened by `mod:/spare-insights`.

### URS-036 — Reliability and consumption analysis

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-042** — KPI aggregates | Medium | OQ-29 |

**FRS-042.** Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer’s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped — it is a property of the fleet — so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess.

## Field Failure Register `/failure-report`

Opened by `mod:/failure-report`.

### URS-058 — A judgement on a quality record names the person who made it

*Risk: High. Filed here because the requirement declares this screen.*

Where the system records a judgement about a product failure, it shall record WHO made that judgement, taken from the authenticated session at the moment the judgement is completed and not from a value supplied by the caller. The identity shall not be displaced by later editing of the same record, and where the judgement is carried onto a further record the person shall be carried with it. No record shall attribute a judgement to a screen, a process or the system itself.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-069** — The reviewer is stamped by the database at completion | High | OQ-52 |

**FRS-069.** A BEFORE trigger on `call_reviews` (0173) records `review2_by_uid` / `review3_by_uid` from auth.uid() at the moment a review stage becomes COMPLETE, and fills the display name from User Master where the client sent none — so the automatic-save and bulk-review paths, which send no name, record a person instead of nothing. A name the client did send is kept: it is what the reviewer saw on screen. A later edit does NOT re-stamp: the person who answered the review is the reviewer, not whoever last corrected a spelling. The trigger evaluates the completion test from the source columns rather than reading `review2_done`, because PostgreSQL computes a GENERATED column AFTER the BEFORE triggers have run — the first version read it, stamped nothing on every path, and was caught only by exercising it against a database. The duplicated expression is compared word-for-word with its original by an automated check. raise_ffr() carries the name onto the Field Failure Report, preferring Review 3’s reviewer, and no longer writes the string “Daily Call Review” — a screen is not a person, and a report that cannot name one is left blank, blank being a question somebody asks.

### URS-059 — Every change to a field failure report is recorded

*Risk: High. Filed here because the requirement declares this screen.*

Each amendment to a field failure report shall be recorded with what changed — the previous and the new value of each field — together with who changed it and when. The record of amendments shall be produced by the system itself rather than by the application requesting it, shall not be alterable or removable through the application, and shall begin at the creation of the report.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-070** — The report’s amendments are recorded by the database | High | OQ-53 |

**FRS-070.** `ffr_history` (0174) receives one row per UPDATE of a field failure report, written by an AFTER trigger, holding `{column: {from, to}}` for only the columns that actually differ, with the person from auth.uid() and their User Master name. An update that changes nothing writes nothing, and `updated_at` is never an entry on its own — a log whose every line says the timestamp moved buries the one that says the CAPA was closed. It is written IN THE DATABASE rather than by the application because the application’s own audit trail is client-written (FRS-021) and therefore records only what a screen chose to report, seeing nothing of an amendment made directly through the API. The table has no insert, update or delete policy, so it cannot be forged, edited or tidied through the application, and 0166’s deletion guard is armed on it; reading it requires `ffr.manage` or administrator. Reports raised before it existed are given their creation entry, so every report’s history begins somewhere.

## KPI & Failure Analysis `/kpi`

Opened by `mod:/kpi`.

### URS-045 — Controlled vocabulary is chosen, not typed

*Risk: High. Filed here because its own words name this screen.*

Where a field must match a controlled list — a Standard Complaint above all — the value shall be CHOSEN from that list and shall not be typed freehand, and no keystroke shall commit a value on its own. Counting, filtering, repeat-failure detection and every downstream report match on the stored value, so a hand-entered variant is a record that no analysis will ever find. Where a list is empty the field shall say so rather than accept arbitrary text.

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

*Risk: High. Filed here because its own words name this screen.*

A user shall be able to record their own handwritten signature and have it reproduced on the documents that name them as signatory. The recorded signature shall be readable and writable only by the person it belongs to — by no manager, and by no administrator — and shall be reproduced on a document only where the signature block names the person producing it; in every other case the block shall be produced blank for signature by hand. Removal of a signature belonging to a person who has left shall be an authorised act which does not disclose the signature.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-066** — A signature is held for its owner only | High | OQ-51 |
| **FRS-067** — A document signs only the block that names the printer | High | OQ-51 |
| **FRS-068** — Administration of a signature discloses nothing | Medium | OQ-51 |

**FRS-066.** A user records a signature on My Profile, drawn with a finger, stylus or mouse or uploaded as a picture of one on paper; it is stored as a transparent PNG cropped to the ink (0172_user_signatures.sql). It is held in its own table rather than on the profile, because Row-Level Security grants by ROW: a policy permitting a person to save a signature on their profile row would permit them to rewrite the role and permissions on it. The read and update policies test `user_id = auth.uid()` and NOTHING ELSE — no is_admin(), no users.manage — so no second party can obtain the image, and none can set one. The owning user id is stamped from the session by trigger, so a row naming another user is stored under the inserter.

**FRS-067.** signatureBelongsTo() compares the name printed in the block with the identity of the signed-in user, on an EXACT match of name or e-mail ignoring case and surrounding space; a looser comparison would put one person’s signature on another’s document where names share a part. The Word copy of the Field Failure Report reproduces the CONTROLLED FORM itself — R-SER-03 Rev 02’s header band, two-column grid at the template’s own 6435/4500 split, every label with its exact wording and internal spacing, its A4 page setup and its footer carrying `TMPL No: R/SER/03 Rev: MAR 2020` — and a printable HTML page renders the SAME form from the same definition (src/lib/ffrform.ts), so a second transcription cannot drift from the first. The Delivery Challan reproduces the saved signature in the company block only when the person printing booked the stock out, and never in the customer’s block, which exists to be signed on receipt; the Field Failure Report (R-SER-03) embeds it only when the person generating the document is the raiser named on it. Where a signature is absent or unreadable the document is produced with an empty block, never with a broken image or a failure to produce it.

**FRS-068.** user_signature_status() reports, per user, WHETHER a signature has been saved and when — never the image. remove_user_signature() deletes one belonging to another person and is refused to a non-administrator and for the caller’s own row (which the Profile page removes). Both are SECURITY DEFINER functions, not views: a definer view over Row-Level-Security-protected tables reads as its owner and defeats the policies beneath it, which this system shipped three times, and the automated check that now refuses such a view is not weakened to admit these. A plain DELETE policy admitting an administrator was written first and does not work: PostgreSQL applies the SELECT policy to a DELETE that must locate its row, so an administrator unable to read the row reported a successful statement affecting nothing.

### URS-030 — Controlled QMS documents

*Risk: High. Filed here because its own words name this screen.*

Quality-system documents (SOPs, work instructions, forms) shall be held with their document number, revision and effective date, be readable by every user, and be maintainable only by the role responsible for the quality system. A superseded document shall be withdrawn from use without being destroyed.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-036** — QMS document control | High | OQ-21 |

**FRS-036.** QMS documents are held in the same catalogue under kind = qms with document number, revision and effective date, readable by every signed-in user and maintainable only under `qms.manage` — a right distinct from the one governing service manuals, and enforced in the database so a holder of either cannot move a document onto the other shelf. Withdrawal is by RETIRING the row (active = false): it stops being offered while the record of what was in force is retained. Authorship is stamped by the database and is not editable.

**Also governing this screen** — maintained in their own documents:

- **CR-029** — Supporting documents attach to the request and follow it to the call · [full text](CALL_REQUEST_REQUIREMENTS.md)
- **SR-025** — Documents used in servicing are controlled: current revision, and obsolete revisions prevented from unintended use · [full text](ISO13485_SERVICING.md)

# Contracts & Warranty

## Warranty Register `/warranties`

Opened by `mod:/warranties`.

### URS-076 — A date is a date, whoever is reading it

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall present every date in one written form. The system shall store every date as a date rather than as the text of one. A form that renders a date in the reader’s own locale presents one record two ways to two people in one office, and a form that stores what was typed puts text in a date column — which nothing detects until the value is sorted, filtered or subtracted.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-089** — A date field reads dd-MMM-yyyy and stores a date | Medium | OQ-77 |

**FRS-089.** FRS-089.1 The cover registers shall display every date value in the form dd-MMM-yyyy. FRS-089.2 The cover registers shall present a date input control when a date field receives focus. FRS-089.3 The cover registers shall store the value produced by that control. FRS-089.4 The cover registers shall derive no date value from text entered by the operator. RATIONALE: a native date control renders in the BROWSER’S locale and no attribute changes it — two machines in one office showed `2026-09-12` and `09/11/2026` for one field. The obvious alternative is the dangerous one: a text box holding `20-Apr-2026` saved as typed puts a formatted string in a date column, and nothing detects it until the value is sorted, filtered or subtracted. FRS-089.4 is therefore a prohibition rather than a convenience, and `check:ui` refuses a parser appearing in that component at all.

### URS-073 — Work that follows from a sale is raised from the sale

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall raise the installation work for a sold machine from the record of its sale. The system shall carry the customer and the machine from that record to the work raised. Re-keying the customer, the model or the serial into a second form is where the two records stop describing the same machine, and nothing afterwards can tell which of them is right.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-085** — Installation calls raised from a Sale Entry | Medium | OQ-73 |

**FRS-085.** FRS-085.1 The warranty register shall raise one installation call for each machine on a sale entry that has no installation call. FRS-085.2 Each such call shall carry the customer, the city and the state recorded on the sale entry. FRS-085.3 Each such call shall carry the model and the serial recorded on the machine. FRS-085.4 Each such call shall record the standard complaint and the reported complaint as "Installation Calls". FRS-085.5 Each such call shall record No against the public health threat, the death and the serious incident questions. FRS-085.6 Each such call shall record no customer contact. FRS-085.7 Each such call shall carry the warranty number, the warranty start and the warranty end of the sale entry where the sale entry records a warranty. FRS-085.8 Each such call shall record no cover where the sale entry records no warranty. FRS-085.9 The warranty register shall record the unique call number of each raised call against the machine it was raised for. FRS-085.10 The warranty register shall raise no call for a machine whose model or serial is absent. FRS-085.11 The warranty register shall stop, and shall name the machine, where a raised call cannot be recorded against it. RATIONALE: .5 states the honest answer for a machine that has not been switched on, and the answers stay editable on the call afterwards — an installation that does go wrong is answered by a person. .6 because those fields record who REPORTED a fault and nobody reported this. .8 because an unknown cover gets asked about and a wrong one gets believed. .11 because the two writes are not one transaction: continuing would leave a call nothing points at, hidden among the successes, and the machine would be offered a second call.

### URS-072 — The terms of a parent record reach every record under it

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall apply the terms recorded on a parent record to every record under it that states no term of its own. The system shall allow a record under a parent to state a term of its own. The system shall provide a means of returning every record under a parent to the parent’s terms. The system shall state what such a return will discard before it discards it. A bulk load that copies a parent’s values onto every child leaves every child stating terms of its own, so the parent moves nothing and nobody can see why.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-090** — What the period suggests, and what the customer register holds | Medium | OQ-78 |
| **FRS-084** — Force Update Child Records | Medium | OQ-73 |

**FRS-090.** FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has.

**FRS-084.** FRS-084.1 The cover registers shall clear every inheriting field on every machine under an entry when the operator requests it. FRS-084.2 The cover registers shall alter no field that the register does not declare as inheriting. FRS-084.3 The cover registers shall state the number of values that differ from the entry before clearing them. FRS-084.4 The cover registers shall state separately the number of values that repeat the entry. FRS-084.5 The cover registers shall name each field it is about to clear and the number of machines carrying it. FRS-084.6 The cover registers shall offer this action only while at least one value is pinned. FRS-084.7 The cover registers shall clear every machine under one entry in one statement. RATIONALE: .2 because the model, the serial and the machine’s own supplied-with answers are the MACHINE’S facts and clearing them would delete its identity. .3 and .4 are separate because the two are not the same act: clearing a value that repeats the entry changes nothing anybody can see, and clearing one that differs destroys a decision made about one machine, with no undo. .7 because a forty-machine sale would otherwise be forty round trips, any of which can fail half way and leave the entry half-inherited — the state this action exists to resolve.

### URS-011 — Warranty & contract cover

*Risk: Medium. Filed here because the requirement declares this screen.*

Warranty and contract cover per machine shall be maintained and reflected on calls.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-016** — Cover registers | Medium | OQ-27 |

**FRS-016.** Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned.

### URS-068 — One identified record per machine, assembled from every register that names it

*Risk: High. Filed here because its own words name this screen.*

Every machine the organisation has sold, contracted or recovered shall appear exactly once in a register of machines, identified by its MODEL together with its SERIAL — never by the serial alone, which repeats across models. That record shall be assembled from the warranty sale register, the contract register, the additional entries, the ownership transfer register and the installation call, and shall state for each of the party, the warranty and the contract WHICH register decided it, so the record can be checked against its evidence. Where the registers disagree, the most recently dated evidence shall decide.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-080** — Product Database 2.0 assembles one row per machine from five registers | High | OQ-64 |

**FRS-080.** `product_database_v2` (0218) lists every machine named by `warranty_sale_details`, `contract_details` or `product_additional_entries`, keyed by `machine_key(product, serial)` — the SQL twin of `machineKey()` in `src/lib/machine.ts`, squashed so ORION-G and ORION G are one model, and MODEL-plus-SERIAL so the eleven machines numbered 219 stay eleven rows. Ownership Transfer and the installation call are joined in. The party is the most recently DATED claim among the ownership transfer, the additional entry, the contract and the sale, ties breaking towards the transfer. `party_from`, `warranty_from`, `contract_from` and `item_status_reason` name the deciding register on every row. It does not replace `public.products` or `machine_cover`, both of which are left exactly as they are.

### URS-070 — A warranty starts when the machine was installed

*Risk: High. Filed here because its own words name this screen.*

The warranty period of a machine shall start from the date recorded on its installation — the Warranty Start Date captured when the installation call is reported, or failing that the date that call was solved — and shall fall back to the selling register only where no installation was recorded. The end of the period shall be derived from that start and the recorded period, by the same arithmetic the rest of the application uses.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-082** — Warranty start comes from the installation, and the end is computed like the app | High | OQ-66 |

**FRS-082.** Warranty start is the `Warranty Start Date?` answer on the installation call’s feedback, read through `imported_ts()` so a cell holding "n/a" yields nothing rather than failing the whole view; failing that the installation call’s solved date; failing that the additional entry; failing that the warranty sale. Where a start and a period are both known the end is `cover_period_end(start, months)`, which reproduces `addPeriod()` in `src/lib/dates.ts` INCLUDING its JavaScript month overflow — 31 January plus one month is 2 March, where Postgres’s own interval arithmetic clamps to 27 February. 26 of 458 start/period combinations differ between the two.

## Contract Register `/contracts`

Opened by `mod:/contracts`.

### URS-076 — A date is a date, whoever is reading it

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall present every date in one written form. The system shall store every date as a date rather than as the text of one. A form that renders a date in the reader’s own locale presents one record two ways to two people in one office, and a form that stores what was typed puts text in a date column — which nothing detects until the value is sorted, filtered or subtracted.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-089** — A date field reads dd-MMM-yyyy and stores a date | Medium | OQ-77 |

**FRS-089.** FRS-089.1 The cover registers shall display every date value in the form dd-MMM-yyyy. FRS-089.2 The cover registers shall present a date input control when a date field receives focus. FRS-089.3 The cover registers shall store the value produced by that control. FRS-089.4 The cover registers shall derive no date value from text entered by the operator. RATIONALE: a native date control renders in the BROWSER’S locale and no attribute changes it — two machines in one office showed `2026-09-12` and `09/11/2026` for one field. The obvious alternative is the dangerous one: a text box holding `20-Apr-2026` saved as typed puts a formatted string in a date column, and nothing detects it until the value is sorted, filtered or subtracted. FRS-089.4 is therefore a prohibition rather than a convenience, and `check:ui` refuses a parser appearing in that component at all.

### URS-072 — The terms of a parent record reach every record under it

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall apply the terms recorded on a parent record to every record under it that states no term of its own. The system shall allow a record under a parent to state a term of its own. The system shall provide a means of returning every record under a parent to the parent’s terms. The system shall state what such a return will discard before it discards it. A bulk load that copies a parent’s values onto every child leaves every child stating terms of its own, so the parent moves nothing and nobody can see why.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-090** — What the period suggests, and what the customer register holds | Medium | OQ-78 |
| **FRS-084** — Force Update Child Records | Medium | OQ-73 |

**FRS-090.** FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has.

**FRS-084.** FRS-084.1 The cover registers shall clear every inheriting field on every machine under an entry when the operator requests it. FRS-084.2 The cover registers shall alter no field that the register does not declare as inheriting. FRS-084.3 The cover registers shall state the number of values that differ from the entry before clearing them. FRS-084.4 The cover registers shall state separately the number of values that repeat the entry. FRS-084.5 The cover registers shall name each field it is about to clear and the number of machines carrying it. FRS-084.6 The cover registers shall offer this action only while at least one value is pinned. FRS-084.7 The cover registers shall clear every machine under one entry in one statement. RATIONALE: .2 because the model, the serial and the machine’s own supplied-with answers are the MACHINE’S facts and clearing them would delete its identity. .3 and .4 are separate because the two are not the same act: clearing a value that repeats the entry changes nothing anybody can see, and clearing one that differs destroys a decision made about one machine, with no undo. .7 because a forty-machine sale would otherwise be forty round trips, any of which can fail half way and leave the entry half-inherited — the state this action exists to resolve.

### URS-011 — Warranty & contract cover

*Risk: Medium. Filed here because the requirement declares this screen.*

Warranty and contract cover per machine shall be maintained and reflected on calls.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-016** — Cover registers | Medium | OQ-27 |

**FRS-016.** Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned.

### URS-048 — Cover continues across a contract renewal

*Risk: Medium. Filed here because the requirement declares this screen.*

A maintenance contract shall be renewable from its predecessor without the machine list being re-keyed, and the renewal shall carry a recorded link back to the contract it replaces. Cover shall be continuous: the successor begins the day after the predecessor ends, so no machine is momentarily uncovered and none is covered twice. Prices shall NOT be carried forward, a renewal being re-priced.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-056** — Contract renewal carries the machines, not the prices | Medium | OQ-42 |

**FRS-056.** A contract raises its successor from the register: the machines (each removable before saving), contract type, party, period, PM visit count and billing schedule are carried; `prev_mc_number` on the header and `last_contract_number` / `last_contract_end` on each item record the link back. The successor starts the day AFTER the predecessor ends and a period ends the day BEFORE its anniversary, so `machine_cover` has one unambiguous answer per day. The MC number is entered, never generated, and is refused if it already exists — renewing into an existing number would merge two contracts. Rate, tax and total are left empty on every machine.

### URS-068 — One identified record per machine, assembled from every register that names it

*Risk: High. Filed here because its own words name this screen.*

Every machine the organisation has sold, contracted or recovered shall appear exactly once in a register of machines, identified by its MODEL together with its SERIAL — never by the serial alone, which repeats across models. That record shall be assembled from the warranty sale register, the contract register, the additional entries, the ownership transfer register and the installation call, and shall state for each of the party, the warranty and the contract WHICH register decided it, so the record can be checked against its evidence. Where the registers disagree, the most recently dated evidence shall decide.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-080** — Product Database 2.0 assembles one row per machine from five registers | High | OQ-64 |

**FRS-080.** `product_database_v2` (0218) lists every machine named by `warranty_sale_details`, `contract_details` or `product_additional_entries`, keyed by `machine_key(product, serial)` — the SQL twin of `machineKey()` in `src/lib/machine.ts`, squashed so ORION-G and ORION G are one model, and MODEL-plus-SERIAL so the eleven machines numbered 219 stay eleven rows. Ownership Transfer and the installation call are joined in. The party is the most recently DATED claim among the ownership transfer, the additional entry, the contract and the sale, ties breaking towards the transfer. `party_from`, `warranty_from`, `contract_from` and `item_status_reason` name the deciding register on every row. It does not replace `public.products` or `machine_cover`, both of which are left exactly as they are.

## Ownership Transfer `/ownership-transfer`

Opened by `mod:/ownership-transfer`.

### URS-011 — Warranty & contract cover

*Risk: Medium. Filed here because the requirement declares this screen.*

Warranty and contract cover per machine shall be maintained and reflected on calls.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-016** — Cover registers | Medium | OQ-27 |

**FRS-016.** Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned.

### URS-068 — One identified record per machine, assembled from every register that names it

*Risk: High. Filed here because its own words name this screen.*

Every machine the organisation has sold, contracted or recovered shall appear exactly once in a register of machines, identified by its MODEL together with its SERIAL — never by the serial alone, which repeats across models. That record shall be assembled from the warranty sale register, the contract register, the additional entries, the ownership transfer register and the installation call, and shall state for each of the party, the warranty and the contract WHICH register decided it, so the record can be checked against its evidence. Where the registers disagree, the most recently dated evidence shall decide.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-080** — Product Database 2.0 assembles one row per machine from five registers | High | OQ-64 |

**FRS-080.** `product_database_v2` (0218) lists every machine named by `warranty_sale_details`, `contract_details` or `product_additional_entries`, keyed by `machine_key(product, serial)` — the SQL twin of `machineKey()` in `src/lib/machine.ts`, squashed so ORION-G and ORION G are one model, and MODEL-plus-SERIAL so the eleven machines numbered 219 stay eleven rows. Ownership Transfer and the installation call are joined in. The party is the most recently DATED claim among the ownership transfer, the additional entry, the contract and the sale, ties breaking towards the transfer. `party_from`, `warranty_from`, `contract_from` and `item_status_reason` name the deciding register on every row. It does not replace `public.products` or `machine_cover`, both of which are left exactly as they are.

# Knowledge Base

## How RITHI Functions `/knowledge-base/how-it-works`

Opened by `mod:/knowledge-base/how-it-works`.

### URS-020 — Knowledge base

*Risk: Low. Filed here because the requirement declares this screen.*

The team shall maintain how-to guidance and field-solution knowledge within the system.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-025** — Knowledge base | Low | OQ-13 |

**FRS-025.** A how-to guide plus team field-solution articles (sanitised rich text) are available to all; author or admin edits.

## Service Manuals `/service-manuals`

Opened by `mod:/service-manuals`.

### URS-020 — Knowledge base

*Risk: Low. Filed here because the requirement declares this screen.*

The team shall maintain how-to guidance and field-solution knowledge within the system.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-025** — Knowledge base | Low | OQ-13 |

**FRS-025.** A how-to guide plus team field-solution articles (sanitised rich text) are available to all; author or admin edits.

### URS-029 — Service manuals available at the point of work

*Risk: Medium. Filed here because its own words name this screen.*

The service documentation for a product shall be held centrally and presented to the engineer on the call for that product, so the machine is worked on against its own manual rather than one found by memory or by hunting a shared folder.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-035** — Service manual library & call lookup | Medium | OQ-21 |

**FRS-035.** Service manuals are catalogued in `documents` against the product they cover and stored in Google Drive. Opening a call lists its Supporting Documents — the manuals matching the call’s product, plus manuals held with no product (general to every machine) — alongside Knowledge Base articles whose title, product or tags match the call’s product or standard complaint. Every signed-in user may read the library; `docs.manage` maintains it.

# Service Calls

## Call Review `/call-review`

Opened by `mod:/call-review`.

### URS-075 — A request may be corrected until it has been answered

*Risk: Medium. Filed here because its own words name this screen.*

The system shall allow a request for service to be corrected while it is awaiting a decision. The system shall prevent alteration of what a request asked for once a call has been raised from it. A request corrected after the call exists leaves two records of one event disagreeing about the customer, the machine or the fault, and the call is the record every count, report and review reads.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-087** — Correcting a call request, and the freeze that ends it | Medium | OQ-75 |

**FRS-087.** FRS-087.1 The request register shall allow an operator holding call-creation rights, registration rights or authorship of the request to alter the customer, the machine, the fault, the engineer and the plan recorded on it. FRS-087.2 The request register shall refuse every such alteration to a request whose status is other than Pending. FRS-087.3 The database shall refuse every such alteration to a request whose status is other than Pending. FRS-087.4 The database shall name, in its refusal, each field it refused. FRS-087.5 The database shall permit alteration of the unique call number, the status, the actioning operator, the actioning time, the cancellation reason and the cancellation time in every status. FRS-087.6 The request register shall exclude the unique call number and the status from the fields an operator may alter. RATIONALE: FRS-087.3 repeats .2 in the DATABASE and is not redundant — `cr_update` lets the person who raised a request write their own row, so a control that lives only in the form is one a direct API call walks past. FRS-087.5 is what makes this a trigger rather than a policy: registering a request writes four of those columns and cancelling writes three, so a rule over the whole row would refuse the very actions that answer a request.

### URS-065 — A recovered quality record is reviewed before it is written

*Risk: High. Filed here because its own words name this screen.*

Where records of work already done are recovered from a superseded system, each shall be resolved to the record it belongs to AND SHOWN TO AN OPERATOR BEFORE ANY OF IT IS WRITTEN, and only rows that resolved cleanly shall be written. A visit attached to the wrong call, or carrying another machine’s photograph, is a worse outcome than a visit still missing: the first is a false record of what was done to a device, the second is a gap that is visible as a gap. Rows that did not resolve shall be reported with the reason and left unwritten rather than written with a guess.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-077** — Bulk Report Mapping reads, resolves and only then writes | High | OQ-58 |

**FRS-077.** The screen runs in three stated steps and in this order: READ the sheet and work out which call each row belongs to; RESOLVE the superseded system’s file references into links; WRITE only the rows that came through both cleanly. Nothing is written until the operator has SEEN what each row resolved to, and rows that did not resolve are listed with the reason and are not written. The register it writes into is the visit history, whose records are never deleted, so a wrong write cannot be taken back — which is why the review is a step rather than a confirmation dialogue.

### URS-055 — The report on a closed call is reviewed

*Risk: Medium. Filed here because its own words name this screen.*

A closed call’s service report shall be subject to review by a competent person other than routine daily coding of the failure, with the reviewer and the time recorded. The reviewer shall be able to return the call to open where the report does not close it, and to correct consumption where a part was fitted and not booked.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-063** — Call Review register | Medium | OQ-49 |
| **FRS-064** — Correction and re-opening from the review | Medium | OQ-49 |

**FRS-063.** A register (call_report_reviews, one row per call) records that a closed call’s report has been reviewed, with the reviewer taken from the authenticated session and a caller-supplied identity discarded. Writing requires the callreview.mark permission and visibility of the call; reading follows the call’s own visibility. The register lists solved calls only — a report-pending call has no report to review — filtered in the database.

**FRS-064.** From the review the reviewer may book a Reconciliation consumption line against the call, off the ATTENDING engineer’s hand stock and capped at what that engineer holds by the same database trigger as any other consumption; or re-open the call with a recorded reason, after which it leaves the review list. Consumption shown for a call is matched on the call number OR the unique call number, so a call predating the call-number series still shows its parts.

### URS-025 — Re-opening a closed call

*Risk: Medium. Filed here because the requirement declares this screen.*

A closed call shall be re-openable by an authorised role where further work or correction is required, and the re-opening shall be recorded.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-031** — Call re-open | Medium | OQ-19 |

**FRS-031.** An authorised role may re-open a closed call and close it again without inventing a visit; the transition is recorded.

### URS-046 — Repeat failure determined to the documented rule

*Risk: High. Filed here because its own words name this screen.*

The review shall determine whether a call is a repeat failure by the rule the servicing procedure states — counting the call under review, within the stated window, on the same equipment or the same part in the same machine — and shall present the rule alongside the verdict so a judgement recorded under one rule is not mistaken for one recorded under another. Window and threshold shall be maintainable by an administrator without a code change. Where the machine cannot be identified the review shall say so rather than report no repeat failure.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-054** — Repeat-failure verdict computed in the database | High | OQ-40 |

**FRS-054.** `frequent_failure(ucn)` returns the verdict and the calls behind it: earlier calls on the same product and serial within the window, matched on the same complaint OR the same part fitted, counted INCLUDING the call under review against the threshold. Window, threshold and whether the same-equipment path also requires a matching complaint are held in `app_settings` and editable in Admin Config; the defaults are the procedure’s (one month, two, on). The window is measured from the CALL’s date, not today, so reopening an old review cannot change its answer. A blank serial returns `known: false` — reported as “cannot tell” rather than “no repeat failure”. SECURITY DEFINER by design: an answer narrowed to the reader’s own call scope would read LOWER than the truth. Answers already recorded are not re-based; the screen shows the rule in force with the verdict.

## Request Registration `/request-registration`

Opened by `mod:/request-registration`.

### URS-075 — A request may be corrected until it has been answered

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall allow a request for service to be corrected while it is awaiting a decision. The system shall prevent alteration of what a request asked for once a call has been raised from it. A request corrected after the call exists leaves two records of one event disagreeing about the customer, the machine or the fault, and the call is the record every count, report and review reads.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-087** — Correcting a call request, and the freeze that ends it | Medium | OQ-75 |

**FRS-087.** FRS-087.1 The request register shall allow an operator holding call-creation rights, registration rights or authorship of the request to alter the customer, the machine, the fault, the engineer and the plan recorded on it. FRS-087.2 The request register shall refuse every such alteration to a request whose status is other than Pending. FRS-087.3 The database shall refuse every such alteration to a request whose status is other than Pending. FRS-087.4 The database shall name, in its refusal, each field it refused. FRS-087.5 The database shall permit alteration of the unique call number, the status, the actioning operator, the actioning time, the cancellation reason and the cancellation time in every status. FRS-087.6 The request register shall exclude the unique call number and the status from the fields an operator may alter. RATIONALE: FRS-087.3 repeats .2 in the DATABASE and is not redundant — `cr_update` lets the person who raised a request write their own row, so a control that lives only in the form is one a direct API call walks past. FRS-087.5 is what makes this a trigger rather than a policy: registering a request writes four of those columns and cancelling writes three, so a rule over the whole row would refuse the very actions that answer a request.

### URS-066 — A request awaiting registration is visible and is dispositioned

*Risk: Medium. Filed here because its own words name this screen.*

A request for service that has not yet become a call shall be visible as such, and shall reach one of a stated set of outcomes — registered as a new call, mapped to an existing call, or cancelled with a reason. It shall not be possible for a request to be silently dropped or to remain in no state at all, a request nobody can see being indistinguishable from a request nobody made.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-078** — Pending Registrations is the queue, and every row leaves it by a stated route | Medium | OQ-59 |

**FRS-078.** Pending Registrations lists requests carrying no UC Number. Opening one offers exactly three outcomes — register it as a new call, map it to an existing call (its UCN is recorded against the request), or cancel it with a reason — and the request’s status records which. IT READS `call_requests`, NOT the sheet-era `pending_registrations` table: two corrections were aimed at the wrong table before that surfaced, and the distinction is recorded in the codebase notes as well as here.

### URS-034 — Requesting on behalf of an engineer

*Risk: Medium. Filed here because its own words name this screen.*

A reporting manager shall be able to raise a spare request, a call registration request or a visit report for an engineer reporting to them, with the record attributed to that engineer and the manager’s identity retained as its author.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-040** — Raising on behalf of a team member | Medium | OQ-24 |

**FRS-040.** Where a manager may act for their team, the engineer is a field on the form rather than an assumption: the Spare Request, Call Registration Request and Reporting forms offer the manager and every engineer reporting to them, defaulting to the manager. The record carries the chosen engineer and their address, so it reaches that engineer’s own lists, while `created_by` retains the manager as its author. The list is the same reporting sub-tree the read policies use, so a manager cannot raise for somebody they cannot see.

**Also governing this screen** — maintained in their own documents:

- **CR-021** — Pending Registrations reads `call_requests` · [full text](CALL_REQUEST_REQUIREMENTS.md)

## Pending Registrations `/pending-registrations`

Opened by `mod:/pending-registrations`.

### URS-003 — Register a service call

*Risk: High. Filed here because the requirement declares this screen.*

The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN).

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-005** — Call registration & UCN | High | OQ-03 |
| **FRS-006** — Call type segregation | Medium | OQ-04 |

**FRS-005.** Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series).

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

### URS-044 — Attributable registration

*Risk: High. Filed here because the requirement declares this screen.*

A registered call shall record BOTH the Hotline desk it belongs to and the individual who registered it. Only the Hotline engineer is trained on the vigilance questions answered at registration, so a call registered by anyone else shall be identifiable from the record without reconstruction. The individual shall be taken from the authenticated session and shall not be settable by the application or by a client of the API.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-051** — Two names on a registration | High | OQ-37 |

**FRS-051.** Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it.

**Also governing this screen** — maintained in their own documents:

- **CR-021** — Pending Registrations reads `call_requests` · [full text](CALL_REQUEST_REQUIREMENTS.md)

## Field Call Register `/field-calls`

Opened by `mod:/field-calls`.

### URS-067 — Authority over a quality record is held section by section

*Risk: High. Filed here because the requirement declares this screen.*

The authority to amend a call in progress shall be grantable SEPARATELY for each part of the record whose amendment means a different thing: the complaint as reported, the customer and device it names, the vigilance answers, and the customer’s contact details. Re-allocating a call to another engineer, and cancelling or restoring one, shall each be their own authority. A single “edit” right cannot express the distinction the record requires — correcting a telephone number and re-answering whether a patient was harmed are not the same act — and each shall be attributable to the person who performed it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-079** — The call edit rights are four sections, plus allotment and cancellation | High | OQ-60 |

**FRS-079.** `calls.edit.complaint`, `calls.edit.customer`, `calls.edit.vigilance` and `calls.edit.contact` each gate one part of the record and are granted independently; `calls.allot` gates re-allocation to another engineer and `calls.cancel` gates cancelling and restoring a call. `calls.edit` remains the parent, so a role holding it holds the four sections — `parentAction()` resolves a section key to it — and a role may instead be given one section alone. `cover.edit` is the equivalent authority over the warranty and contract registers, and `admin.view` opens the administration pages READ-ONLY, so somebody may inspect configuration without the right to change users.

### URS-053 — A service record identifies the individual device

*Risk: High. Filed here because the requirement declares this screen.*

Every service call shall identify the single machine it concerns by its serial number, from the request onward. A record that names a product but not a unit cannot be traced to the device serviced, and its cover, warranty and contract cannot be established.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-061** — The serial is mandatory | High | OQ-47 |

**FRS-061.** The serial number is a required field on the call request and on the Field, Installation, PM and pending-registration call forms. The request refuses an item without one, and names the cause where the machine is absent from Product Database rather than inviting the field to be skipped. The request identifier is composed REQID-Product-Serial, so a missing serial is visible in the key itself.

### URS-002 — Role-based visibility

*Risk: High. Filed here because the requirement declares this screen.*

A user shall see and act on only the records their role permits: an engineer their own calls, a manager their reporting team, office/administration roles as defined.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-003** — RBAC + reporting-tree scoping | High | IQ-02, OQ-02 |
| **FRS-004** — Server-side authorisation | High | IQ-02, OQ-02 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |
| **FRS-050** — A view must not defeat the policies beneath it | High | OQ-35 |

**FRS-003.** Each role maps to a permission set (app_roles). Data visibility is scoped by a reporting tree resolved from User Master; enforced in the client and, authoritatively, by PostgreSQL Row-Level Security.

**FRS-004.** Every read/write is governed by RLS policies keyed on the authenticated user (auth.uid()) and SECURITY DEFINER helper functions; the UI gate is secondary.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

**FRS-050.** Every view over a table carrying row-level security is created `security_invoker`, so the policies are evaluated for the READER. `create or replace view` does not carry the setting over, and a view running as its owner returns everything with no error and no warning. `npm run check:views` fails on any view over an RLS-protected table that lacks it, and `_status.sql` reports it on a live project; views intentionally readable by every signed-in user are enumerated with their reason.

### URS-003 — Register a service call

*Risk: High. Filed here because the requirement declares this screen.*

The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN).

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-005** — Call registration & UCN | High | OQ-03 |
| **FRS-006** — Call type segregation | Medium | OQ-04 |

**FRS-005.** Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series).

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

### URS-025 — Re-opening a closed call

*Risk: Medium. Filed here because the requirement declares this screen.*

A closed call shall be re-openable by an authorised role where further work or correction is required, and the re-opening shall be recorded.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-031** — Call re-open | Medium | OQ-19 |

**FRS-031.** An authorised role may re-open a closed call and close it again without inventing a visit; the transition is recorded.

### URS-032 — Allotment and re-allotment of calls

*Risk: High. Filed here because the requirement declares this screen.*

A reporting manager shall be able to allot a call to, or move a call between, the engineers reporting to them and themselves, including several calls in one action, changing nothing on the call but the engineer it is allotted to.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-038** — Bulk re-allotment | High | OQ-22 |

**FRS-038.** Every call register — Field, Installation, PM and Pending Calls — offers selection per row and a header box that takes exactly the rows currently listed, never rows a filter is hiding. The bar that appears edits ONE field, the allotted engineer, chosen from the manager and their reporting sub-tree, and writes every selected call in one action. The choice offered is built from `visible_engineer_names()`, and the write is independently constrained by RLS: a manager cannot allot outside their own team even by direct query.

### URS-044 — Attributable registration

*Risk: High. Filed here because the requirement declares this screen.*

A registered call shall record BOTH the Hotline desk it belongs to and the individual who registered it. Only the Hotline engineer is trained on the vigilance questions answered at registration, so a call registered by anyone else shall be identifiable from the record without reconstruction. The individual shall be taken from the authenticated session and shall not be settable by the application or by a client of the API.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-051** — Two names on a registration | High | OQ-37 |

**FRS-051.** Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it.

## Installation Calls `/installations`

Opened by `mod:/installations`.

### URS-003 — Register a service call

*Risk: High. Filed here because the requirement declares this screen.*

The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN).

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-005** — Call registration & UCN | High | OQ-03 |
| **FRS-006** — Call type segregation | Medium | OQ-04 |

**FRS-005.** Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series).

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

### URS-006 — Installation control

*Risk: Medium. Filed here because its own words name this screen.*

Creation of installation calls shall be restricted to the Commercial function; installation records shall capture the warranty start date.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-006** — Call type segregation | Medium | OQ-04 |
| **FRS-008** — Installation gating | Medium | OQ-06 |

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

**FRS-008.** Insertion into installation_calls requires the install.create permission (Commercial, Hotline, admin); enforced by RLS.

### URS-070 — A warranty starts when the machine was installed

*Risk: High. Filed here because the requirement declares this screen.*

The warranty period of a machine shall start from the date recorded on its installation — the Warranty Start Date captured when the installation call is reported, or failing that the date that call was solved — and shall fall back to the selling register only where no installation was recorded. The end of the period shall be derived from that start and the recorded period, by the same arithmetic the rest of the application uses.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-082** — Warranty start comes from the installation, and the end is computed like the app | High | OQ-66 |

**FRS-082.** Warranty start is the `Warranty Start Date?` answer on the installation call’s feedback, read through `imported_ts()` so a cell holding "n/a" yields nothing rather than failing the whole view; failing that the installation call’s solved date; failing that the additional entry; failing that the warranty sale. Where a start and a period are both known the end is `cover_period_end(start, months)`, which reproduces `addPeriod()` in `src/lib/dates.ts` INCLUDING its JavaScript month overflow — 31 January plus one month is 2 March, where Postgres’s own interval arithmetic clamps to 27 February. 26 of 458 start/period combinations differ between the two.

## Preventive (PM) `/pm-calls`

Opened by `mod:/pm-calls`.

### URS-003 — Register a service call

*Risk: High. Filed here because the requirement declares this screen.*

The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN).

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-005** — Call registration & UCN | High | OQ-03 |
| **FRS-006** — Call type segregation | Medium | OQ-04 |

**FRS-005.** Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series).

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

### URS-005 — Preventive maintenance

*Risk: Medium. Filed here because its own words name this screen.*

The company shall schedule and record preventive-maintenance (PM) visits, including bulk creation of the monthly PM batch by an administrator.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-006** — Call type segregation | Medium | OQ-04 |
| **FRS-009** — PM bulk upload | Medium | OQ-14 |

**FRS-006.** Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.

**FRS-009.** An administrator uploads a CSV; rows are mapped, forced to PM type, previewed, then inserted in batches with UCN/Call Number assigned by the database.

### URS-026 — Preventive-maintenance scheduling

*Risk: Medium. Filed here because its own words name this screen.*

The monthly preventive-maintenance batch shall be created for a stated due month, retaining the date it was uploaded, and shall support loading earlier months.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-032** — PM due-month batch | Medium | OQ-19 |

**FRS-032.** The PM bulk upload dates every call in a batch to the first of a chosen due month (reg_date), records the upload date as added_on, and sequences a registration date-and-time (reg_at) so the batch holds a stable order. Call numbering is unchanged.

**Also governing this screen** — maintained in their own documents:

- **SR-034** — Corrective action is taken on causes of nonconformity, and its effectiveness is verified; preventive action likewise · [full text](ISO13485_SERVICING.md)

## Pending Calls `/pending-calls`

Opened by `mod:/pending-calls`.

### URS-014 — SLA monitoring

*Risk: Medium. Filed here because the requirement declares this screen.*

The company shall define service-level targets and the system shall highlight open calls that are due or breached.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-019** — SLA engine | Medium | OQ-11 |

**FRS-019.** Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached.

### URS-032 — Allotment and re-allotment of calls

*Risk: High. Filed here because the requirement declares this screen.*

A reporting manager shall be able to allot a call to, or move a call between, the engineers reporting to them and themselves, including several calls in one action, changing nothing on the call but the engineer it is allotted to.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-038** — Bulk re-allotment | High | OQ-22 |

**FRS-038.** Every call register — Field, Installation, PM and Pending Calls — offers selection per row and a header box that takes exactly the rows currently listed, never rows a filter is hiding. The bar that appears edits ONE field, the allotted engineer, chosen from the manager and their reporting sub-tree, and writes every selected call in one action. The choice offered is built from `visible_engineer_names()`, and the write is independently constrained by RLS: a manager cannot allot outside their own team even by direct query.

## Visit Reports / Service Reports `/reports`

Opened by `mod:/reports`.

### URS-065 — A recovered quality record is reviewed before it is written

*Risk: High. Filed here because the requirement declares this screen.*

Where records of work already done are recovered from a superseded system, each shall be resolved to the record it belongs to AND SHOWN TO AN OPERATOR BEFORE ANY OF IT IS WRITTEN, and only rows that resolved cleanly shall be written. A visit attached to the wrong call, or carrying another machine’s photograph, is a worse outcome than a visit still missing: the first is a false record of what was done to a device, the second is a gap that is visible as a gap. Rows that did not resolve shall be reported with the reason and left unwritten rather than written with a guess.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-077** — Bulk Report Mapping reads, resolves and only then writes | High | OQ-58 |

**FRS-077.** The screen runs in three stated steps and in this order: READ the sheet and work out which call each row belongs to; RESOLVE the superseded system’s file references into links; WRITE only the rows that came through both cleanly. Nothing is written until the operator has SEEN what each row resolved to, and rows that did not resolve are listed with the reason and are not written. The register it writes into is the visit history, whose records are never deleted, so a wrong write cannot be taken back — which is why the review is a step rather than a confirmation dialogue.

### URS-004 — Record a visit / call report

*Risk: High. Filed here because the requirement declares this screen.*

An engineer shall record each visit with call status, observations, work done and readings; the call status shall reflect the latest visit.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-007** — Visit reporting & status | High | OQ-05 |

**FRS-007.** A report row is written per visit; a trigger recomputes the call’s status from the latest ENTRY (Unattended → Unsolved → Report pending → Solved). A “Solved - Report Completed” call becomes read-only to non-admins.

## Customer Feedback `/feedback`

Opened by `mod:/feedback`.

### URS-071 — Two records of one visit shall not contradict each other

*Risk: Medium. Filed here because its own words name this screen.*

Where the system holds a customer’s feedback about a visit, it shall also hold a completed service report for that visit, and every instance where it does not shall be visible as a list naming which record is absent. Feedback is collected after a visit has taken place, so its existence is evidence that the work occurred; the completed report is the record of what was done. The two disagreeing means a device was serviced and the servicing was never written up — a gap that is invisible from either record read on its own, because neither record is wrong in itself.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-083** — Feedback Without a Report | Medium | OQ-72 |

**FRS-083.** `feedback_without_report` (0229) lists every customer feedback with no visit reading “Solved - Report Completed” behind it, and names WHICH of four things is absent, because each needs a different fix: the feedback records no UCN; no call carries that UCN; the call has no visit at all; or the call has visits and none of them is the completed one. The last is the commonest, and the row carries `latest_visit_status` beside it so that “Solved - Report Pending” — the system stating a known absence — is distinguishable from “Unsolved”, which is a different problem. THE STATUS IS MATCHED ON ITS LETTERS AND DIGITS, not as a string: `is_report_completed()` reduces to lower-case alphanumerics, so a trailing space, a lower-case spelling and an en-dash all read as completed, and `isCompletedVisit()` in src/lib/reportMapping.ts is the client copy of the same rule. That is not defensive coding — the export this was written for carried “Solved - Report Completed ” with a trailing space in all 378 rows, and a string comparison would have reported every one of those calls as missing its report. ANY visit reading completed is enough rather than the latest one: a call written up and then re-visited still has its report. A false entry here sends somebody to re-file a report that exists, which is wasted work and teaches them the list may mean nothing — the same argument as a `_status.sql` row that answers NO for nothing — so both rules are tested with the spellings that actually arrive. The view is `security_invoker`, so the ordinary call and feedback policies decide the rows; the SCREEN is restricted to administrators by `mod:/feedback-without-report`, at the user’s direction (2026-09-22).

### URS-012 — Customer feedback

*Risk: Low. Filed here because its own words name this screen.*

Customer feedback captured on a call shall be recorded and retrievable per question.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-017** — Feedback capture | Low | OQ-28 |

**FRS-017.** Feedback answers are stored per question and surfaced as columns in the Customer Feedback view, scoped like calls.

# Spares

## Spare Requests `/spare-requests`

Opened by `mod:/spare-requests`.

### URS-035 — Correcting who a spare order is for

*Risk: High. Filed here because the requirement declares this screen.*

An administrator shall be able to correct the engineer a spare order was raised against while it is still awaiting issue, and shall be prevented from doing so once any part of it has been issued. Every such change shall be retained with both names, the person who made it, the time and the reason.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-041** — Reassigning a spare order, with a log | High | OQ-23 |

**FRS-041.** `reassign_spare_request()` changes the engineer on a spare request and writes `spare_request_engineer_log` in the same statement, so a change cannot exist without its record or a record without its change. It refuses a non-administrator, and refuses ANY caller once the order has been issued — tested three ways: the order says dispatched, any of its lines does, or a stock-out line points at one of its lines. A BEFORE UPDATE trigger on the table enforces the dispatch rule again for every path that does not go through the function, including PostgREST and the bulk upload. The reason: hand stock is DERIVED from the request, so after issue the engineer’s name is not a label on a record but the identity of whose parts they are. The log is readable by administrators, approvers, Stores, and both engineers named on the row.

## RM Approval `/spare-rm-approval`

Opened by `mod:/spare-rm-approval`.

### URS-007 — Spare request & approval

*Risk: High. Filed here because its own words name this screen.*

An engineer shall request spare parts against a call; the request shall follow a defined multi-stage approval chain, each stage authorised by the correct role.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-010** — Spare approval chain | High | OQ-07 |
| **FRS-011** — Manager-scoped approval | High | OQ-07 |

**FRS-010.** A spare request creates per-part lines; each advances RM → Commercial → NSM → Stores. A per-stage database guard blocks a stage change unless the actor holds that stage’s permission.

**FRS-011.** A reporting manager sees and approves only their own team’s spare requests; their own request routes to their manager, not to themselves.

### URS-028 — Dispatch performance

*Risk: Low. Filed here because its own words name this screen.*

The time taken by Stores to issue an approved spare shall be measurable, from the moment the spare cleared its last approval to the moment it was issued.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-034** — Days to dispatch | Low | OQ-20 |

**FRS-034.** spare_stock_out_lines lists every spare issued, one row each, with days_to_dispatch measured from the last approval recorded on the line (NSM where the item needs that review, else Commercial, else RM) to the stock out.

## Pending Dispatch `/spare-dispatch`

Opened by `mod:/spare-dispatch`.

### URS-008 — Spare dispatch & receipt

*Risk: Medium. Filed here because the requirement declares this screen.*

Stores shall dispatch approved spares and the requesting engineer shall acknowledge receipt; each step shall be recorded with actor and time.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-012** — Dispatch & receipt | Medium | OQ-08 |

**FRS-012.** Stores dispatch generates a DC and stock-out; the engineer acknowledges receipt. Drop is available at any stage to Spare Coordinator / Hotline only.

### URS-022 — Acknowledged receipt

*Risk: Medium. Filed here because the requirement declares this screen.*

The engineer shall confirm each delivery of a spare as it is received, and a spare shall be recorded as received only when the whole quantity has been confirmed.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-027** — Per-shipment receipt | Medium | OQ-18 |

**FRS-027.** receive_spare_shipments() stamps each delivery with who confirmed it and when, accumulating spare_request_lines.received_qty. The line is marked Received (received_at) only when the acknowledged quantity reaches the requested quantity, so a part-delivered line remains at the Stores stage.

## Stock Out `/stock-out`

Opened by `mod:/stock-out`.

### URS-008 — Spare dispatch & receipt

*Risk: Medium. Filed here because the requirement declares this screen.*

Stores shall dispatch approved spares and the requesting engineer shall acknowledge receipt; each step shall be recorded with actor and time.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-012** — Dispatch & receipt | Medium | OQ-08 |

**FRS-012.** Stores dispatch generates a DC and stock-out; the engineer acknowledges receipt. Drop is available at any stage to Spare Coordinator / Hotline only.

### URS-009 — Stock accuracy

*Risk: Medium. Filed here because its own words name this screen.*

Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

### URS-021 — Partial issue of spares

*Risk: Medium. Filed here because the requirement declares this screen.*

Stores shall be able to issue fewer units of a spare than were requested when only part of the quantity is available, and the outstanding balance shall remain visible as still due.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-026** — Partial dispatch | Medium | OQ-18 |

**FRS-026.** A stock out records a quantity per requested line in spare_dispatch_lines; spare_request_lines.dispatched_qty accumulates it. The Stores queue shows the outstanding remainder and the line stays queued until fully issued. Issuing more than the remainder is rejected by dispatch_spare_lines().

### URS-024 — Stock integrity

*Risk: High. Filed here because its own words name this screen.*

No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-030** — Consumption capped at hand stock | High | OQ-15 |

**FRS-030.** A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer’s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against.

### URS-037 — Migrated data is distinguishable from the system’s own record

*Risk: High. Filed here because its own words name this screen.*

Where a stock or service figure is derived partly from records MIGRATED from the superseded system and partly from records this system created, a user shall be able to see how much of the figure comes from each, and to read the figure without the migrated part. Neither reading shall be presented as a correction of the other.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-071** — The field failure register is loaded year by year, whatever shape each year is | Medium | OQ-63 |
| **FRS-043** — The balance declares its migrated part | High | OQ-30 |

**FRS-071.** The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year.

**FRS-043.** Hand stock is derived from nine arms, three of which are migrated: the opening pools (`ref_type = Opening balance`) and the pre-2026 stock outs and yearly consumption exports (`ref_type = Historical`). `handstock_balance` carries `hist_stock_out`, `hist_consumed`, `hist_net` and `on_hand_live` (0102), so the register shows what the migration contributes per line and can present the balance without it. The identity `on_hand - hist_net = on_hand_live` holds for every row. The whole line is restated when the migrated part is excluded, not only the total, so the components on screen still reconcile. Both figures are labelled; neither is offered as a correction of the other.

### URS-038 — Closing a stock period

*Risk: High. Filed here because its own words name this screen.*

An authorised role shall be able to close a stock period, fixing an opening figure per engineer and part that stands for every movement up to that date, so the register need not re-derive settled history. A close shall not change any balance.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-044** — Period close | High | OQ-31 |

**FRS-044.** `close_handstock_period(date)` writes an opening figure per engineer and part equal to the net of every movement up to that date, then moves a cut-off (`handstock_cutoff()`) that every arm of the movement view tests. The sum and the arms divide the SAME instant — the close takes `< cutoff`, the arms `>= cutoff` — so no movement can fall on both sides. Restricted to an administrator or `consumption.reconcile`; refuses a period that has not ended. A closing figure may be negative, because it must equal exactly what it replaces.

### URS-041 — Migrated stock belongs to a person who can hold it

*Risk: Medium. Filed here because its own words name this screen.*

A stock balance shall be opened only against an active member of the user directory; identifiers appearing in a migrated file that are not people (dealers, customers) shall be excluded before loading, and what is excluded shall be reported.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-047** — Opening stock is an engineer’s | Medium | OQ-34 |

**FRS-047.** Both opening-stock registers resolve each row’s name against the ACTIVE user directory before writing, matching on `lower(btrim(name))` — the same normalisation the balance is keyed on. Rows that do not match are withheld and NAMED before anything is written, so the count approved is the count loaded. An empty directory is refused rather than treated as "nothing matches". `_handstock_opening_engineers.sql` applies the same rule to already-loaded data and reports what it removes.

### URS-049 — Custody of equipment held on the organisation’s premises

*Risk: High. Filed here because its own words name this screen.*

Equipment taken into the organisation’s own premises shall be recorded on a register that identifies it, states WHOSE property it is, and holds the condition it arrived in — that condition being the baseline against which any later damage is judged. Where such equipment is lost, damaged or found unfit for use, that shall be recorded and reported to its owner. The register shall distinguish the organisation’s own stock from a customer’s property, because the duty of care applies to one and not the other, and shall not require a service call to exist: equipment may be held for reasons that have no call.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-057** — The Indoor Service Register, on two axes | High | OQ-43 |

**FRS-057.** Equipment taken into the workshop is recorded in `indoor_jobs`, one row per intake, carrying `received_at` / `received_by`, `condition_on_arrival`, the physical `tag_no` and a `status` through nine states. TWO INDEPENDENT AXES: `kind` states whose property it is (Customer property | DEMO unit) and is what makes the custody duty applicable or not; `activity` states what is being done to it (Repair | Rework | Salvage | Pre-delivery inspection | Demo | Other). Neither is reachable from the other, so equipment does not change ownership because the work on it changed. `ucn` is NULLABLE — a demonstration unit has no call — which is why the register stands alone rather than being a state of a call. Damage is `damage_note` with `reported_to_customer_at` / `_by`. Accessories are rows in `indoor_job_accessories`, each tagged to the parent job, so what came in with the equipment is a list that can be checked off when it goes back.

### URS-052 — Scrapping equipment is an authorised act

*Risk: High. Filed here because its own words name this screen.*

Condemning equipment shall require an authority granted for that purpose alone, shall record who condemned it and why, and shall be refused to anybody not holding that authority. Parts recovered from condemned equipment shall be recorded with their condition, and shall not enter usable stock in a way that makes them indistinguishable from new parts.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-060** — Condemnation is gated, and recovered parts credit no balance | High | OQ-46 |

**FRS-060.** `indoor.condemn` is a permission of its own, enforced by a trigger on insert and update, and granted to the administrator role alone when the schema is applied — so no role acquires the ability to scrap equipment merely by being given the page. `condemned_reason` is required by a CHECK constraint before the status may be Condemned, and `condemned_by` / `condemned_at` are stamped by the database. Recovered parts are rows in `indoor_job_parts` with a condition grade and a destination in words; NO stock balance is altered, because a recovered part entering stock under its ordinary code cannot afterwards be told from a new one.

## Spare Consumption `/spare-consumption`

Opened by `mod:/spare-consumption`.

### URS-054 — Consumption recorded against a call is complete

*Risk: High. Filed here because the requirement declares this screen.*

Every part fitted during a visit shall be recorded against that call. Recording shall not depend on a further confirming action by the engineer once the part has been entered, and where no part was used that shall be a STATED answer rather than an unanswered field.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-062** — Consumption is written as entered | High | OQ-48 |

**FRS-062.** The visit report writes every consumption line the engineer has entered, including the line still in the entry control at the moment of saving; the same validation applies to it as to a line already added. “Add Consumption?” offers Yes or None Consumed: Yes requires at least one line before the report will save, and None Consumed withdraws the section. Lines are written in one statement, so a report cannot keep some of its spares and drop the rest.

### URS-023 — Reconciliation of consumption

*Risk: High. Filed here because its own words name this screen.*

Authorised office roles shall be able to record a spare consumed against a call that the engineer did not report, correct a quantity reported in error, and void an entry made in error, with a reason retained for each.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-028** — Reconciliation entry | High | OQ-16 |
| **FRS-029** — Quantity adjustment and voiding | High | OQ-17 |

**FRS-028.** Holders of consumption.reconcile (Spare Coordinator, Hotline, Admin) may insert consumption rows flagged source = Reconciliation. UCN (validated against an existing call), engineer, part and reason are mandatory and enforced by a database trigger; the entry records who made it. Parts offered are limited to the engineer’s hand stock.

**FRS-029.** The same role may amend the quantity of an existing consumption line. The original quantity, the reason, and who amended it are retained on the row; the call, part, engineer and source cannot be altered. Setting the quantity to zero voids the line, returning the stock, while the record is retained (hard deletion remains blocked).

### URS-036 — Reliability and consumption analysis

*Risk: Medium. Filed here because its own words name this screen.*

Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-042** — KPI aggregates | Medium | OQ-29 |

**FRS-042.** Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer’s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped — it is a property of the fleet — so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess.

### URS-047 — Spares sent to a call are accounted for against it

*Risk: Medium. Filed here because its own words name this screen.*

A spare that reached an engineer for a specific call shall be accounted for in that call’s consumption, and any shortfall shall be reportable — whether nothing was booked or less than was sent. A part refused or never dispatched shall not be reported as unaccounted for, because nothing arrived to be fitted. The determination shall be made only once the call is closed.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-055** — Unaccounted spares are reportable | Medium | OQ-41 |

**FRS-055.** `unused_spare_report` lists spare lines DISPATCHED or RECEIVED against a call whose part code is not fully accounted for in that call’s consumption — NOT USED where none was booked, SHORT where less was booked than sent. Quantities are aggregated per call and part, so a part sent twice and booked once is not two false findings. Refused and dropped lines are excluded: nothing arrived. Matched on the part CODE, the description being unstable. Only calls in a solved state are assessed, an open call’s parts being legitimately still in the van. `security_invoker`, so a reader sees only the calls their role allows.

## Hand Stock `/handstock`

Opened by `mod:/handstock`.

### URS-009 — Stock accuracy

*Risk: Medium. Filed here because its own words name this screen.*

Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

### URS-024 — Stock integrity

*Risk: High. Filed here because its own words name this screen.*

No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-030** — Consumption capped at hand stock | High | OQ-15 |

**FRS-030.** A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer’s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against.

## Material Returns (MRN) `/mrn`

Opened by `mod:/mrn`.

### URS-009 — Stock accuracy

*Risk: Medium. Filed here because its own words name this screen.*

Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

## Stock Transfer `/stock-transfer`

Opened by `mod:/stock-transfer`.

### URS-009 — Stock accuracy

*Risk: Medium. Filed here because its own words name this screen.*

Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-013** — Stock derivation & guard | Medium | OQ-08 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |

**FRS-013.** Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

# Indoor Service

## Indoor Service Register `/indoor`

Opened by `mod:/indoor`.

### URS-050 — Decontamination before the equipment is worked on

*Risk: High. Filed here because the requirement declares this screen.*

Equipment returned from use shall be cleaned and disinfected to the applicable work instruction before it is worked on, and that shall be recorded with who did it, when, and against WHICH REVISION of the instruction. Where the work involves opening or dismantling the equipment, the record shall be a PRECONDITION of that work rather than a note made after it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-058** — Cleaning recorded against a revision, and a hard gate before dismantling | High | OQ-44 |

**FRS-058.** `cleaned_at` / `cleaned_by` with `cleaning_wi` (defaulting to WI/SER/01) and `cleaning_wi_rev`, so the record states which revision was applied rather than which document was named. Where parts are recovered from equipment, a database trigger REFUSES the recovery while the job’s `decontaminated` flag is false: it is the only control in the module that blocks rather than records, because it protects the person doing the work and not only the product.

### URS-051 — A quality check separable from the work it checks

*Risk: High. Filed here because the requirement declares this screen.*

Work performed on equipment before it is returned shall be subject to a recorded quality check held as its own record, attributable to the person who performed it. The authority to sign the check shall be grantable separately from the authority to do the work, so that the two may be different people. Equipment whose check has failed, and work of a kind that requires a check and has none, shall not leave.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-059** — The check is its own record, and its own permission | High | OQ-45 |

**FRS-059.** `qc_result` / `qc_by` / `qc_at` / `qc_notes` are columns of the job, not sentences in the work text. `indoor.qc` is a permission distinct from `indoor.work` and is enforced by a BEFORE UPDATE trigger, so a person holding every other authority in the module is refused the check by the database rather than by a hidden button. A trigger refuses any move to Ready, Dispatched or Closed while `qc_result` is Fail, refuses a Repair or Rework reaching Dispatched with no result at all, and refuses a failed pre-delivery inspection leaving. Whether the check must be signed by somebody OTHER than the person who received the unit is NOT enforced: the procedure does not require it, both identities are recorded, and the screen states plainly when they are the same.

# Reports

## Reports `/exports`

Opened by `mod:/exports`.

### URS-064 — A credential cannot be recovered from a log

*Risk: High. Filed here because its own words name this screen.*

No log, error message or build record the system produces shall contain any part of a credential. Where a credential is malformed such that a subsystem would report a fragment of it, the operation shall be REFUSED before that subsystem is reached, and the refusal shall say what to correct without reproducing any part of the value. Masking the credential is not by itself sufficient: a subsystem reports the piece it failed on, which may be a fragment matching neither the credential nor the string containing it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-076** — The migration runner refuses rather than let a credential reach a log | High | OQ-57 |

**FRS-076.** The database URL is passed to psql through the environment, never on a command line, and psql’s output is masked before it is logged. THAT WAS NOT SUFFICIENT, and a real run proved it twice. Node’s URL parser splits credentials at the LAST “@” and libpq at the FIRST, so a password containing an unencoded “@” makes libpq report a HOST built from a SUFFIX of the password — a string matching neither the password nor the URL, which no exact-value mask can catch. It reached a public build log while the platform’s own masking displayed the secret as masked throughout. scripts/apply-migrations.mjs now REFUSES before psql is invoked when the URL carries more than one “@”, names the correction and prints no part of the value: nothing can leak from a call that is not made. Every tail of the password of three characters or more is additionally masked, for any other tool reporting the same shape. The exposure already made is not undone by this and is recorded as requiring the credential to be rotated.

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because its own words name this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — Consumption Report `/exports/consumption`

Opened by `mod:/exports/consumption`.

### URS-054 — Consumption recorded against a call is complete

*Risk: High. Filed here because the requirement declares this screen.*

Every part fitted during a visit shall be recorded against that call. Recording shall not depend on a further confirming action by the engineer once the part has been entered, and where no part was used that shall be a STATED answer rather than an unanswered field.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-062** — Consumption is written as entered | High | OQ-48 |

**FRS-062.** The visit report writes every consumption line the engineer has entered, including the line still in the entry control at the moment of saving; the same validation applies to it as to a line already added. “Add Consumption?” offers Yes or None Consumed: Yes requires at least one line before the report will save, and None Consumed withdraws the section. Lines are written in one statement, so a report cannot keep some of its spares and drop the rest.

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — KPI Export `/exports/kpi`

Opened by `mod:/exports/kpi`.

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because its own words name this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — Not Consumed Against this Call `/exports/unused`

Opened by `mod:/exports/unused`.

### URS-054 — Consumption recorded against a call is complete

*Risk: High. Filed here because the requirement declares this screen.*

Every part fitted during a visit shall be recorded against that call. Recording shall not depend on a further confirming action by the engineer once the part has been entered, and where no part was used that shall be a STATED answer rather than an unanswered field.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-062** — Consumption is written as entered | High | OQ-48 |

**FRS-062.** The visit report writes every consumption line the engineer has entered, including the line still in the entry control at the moment of saving; the same validation applies to it as to a line already added. “Add Consumption?” offers Yes or None Consumed: Yes requires at least one line before the report will save, and None Consumed withdraws the section. Lines are written in one statement, so a report cannot keep some of its spares and drop the rest.

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — Call Report `/exports/calls`

Opened by `mod:/exports/calls`.

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Reports — Customer Feedback Report `/exports/feedback`

Opened by `mod:/exports/feedback`.

### URS-071 — Two records of one visit shall not contradict each other

*Risk: Medium. Filed here because the requirement declares this screen.*

Where the system holds a customer’s feedback about a visit, it shall also hold a completed service report for that visit, and every instance where it does not shall be visible as a list naming which record is absent. Feedback is collected after a visit has taken place, so its existence is evidence that the work occurred; the completed report is the record of what was done. The two disagreeing means a device was serviced and the servicing was never written up — a gap that is invisible from either record read on its own, because neither record is wrong in itself.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-083** — Feedback Without a Report | Medium | OQ-72 |

**FRS-083.** `feedback_without_report` (0229) lists every customer feedback with no visit reading “Solved - Report Completed” behind it, and names WHICH of four things is absent, because each needs a different fix: the feedback records no UCN; no call carries that UCN; the call has no visit at all; or the call has visits and none of them is the completed one. The last is the commonest, and the row carries `latest_visit_status` beside it so that “Solved - Report Pending” — the system stating a known absence — is distinguishable from “Unsolved”, which is a different problem. THE STATUS IS MATCHED ON ITS LETTERS AND DIGITS, not as a string: `is_report_completed()` reduces to lower-case alphanumerics, so a trailing space, a lower-case spelling and an en-dash all read as completed, and `isCompletedVisit()` in src/lib/reportMapping.ts is the client copy of the same rule. That is not defensive coding — the export this was written for carried “Solved - Report Completed ” with a trailing space in all 378 rows, and a string comparison would have reported every one of those calls as missing its report. ANY visit reading completed is enough rather than the latest one: a call written up and then re-visited still has its report. A false entry here sends somebody to re-file a report that exists, which is wasted work and teaches them the list may mean nothing — the same argument as a `_status.sql` row that answers NO for nothing — so both rules are tested with the spellings that actually arrive. The view is `security_invoker`, so the ordinary call and feedback policies decide the rows; the SCREEN is restricted to administrators by `mod:/feedback-without-report`, at the user’s direction (2026-09-22).

### URS-013 — Reports & analytics

*Risk: Medium. Filed here because the requirement declares this screen.*

Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-018** — Reports & export gate | Medium | OQ-10 |

**FRS-018.** Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.

## Feedback Without a Report `/feedback-without-report`

Opened by `mod:/feedback-without-report`.

### URS-071 — Two records of one visit shall not contradict each other

*Risk: Medium. Filed here because the requirement declares this screen.*

Where the system holds a customer’s feedback about a visit, it shall also hold a completed service report for that visit, and every instance where it does not shall be visible as a list naming which record is absent. Feedback is collected after a visit has taken place, so its existence is evidence that the work occurred; the completed report is the record of what was done. The two disagreeing means a device was serviced and the servicing was never written up — a gap that is invisible from either record read on its own, because neither record is wrong in itself.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-083** — Feedback Without a Report | Medium | OQ-72 |

**FRS-083.** `feedback_without_report` (0229) lists every customer feedback with no visit reading “Solved - Report Completed” behind it, and names WHICH of four things is absent, because each needs a different fix: the feedback records no UCN; no call carries that UCN; the call has no visit at all; or the call has visits and none of them is the completed one. The last is the commonest, and the row carries `latest_visit_status` beside it so that “Solved - Report Pending” — the system stating a known absence — is distinguishable from “Unsolved”, which is a different problem. THE STATUS IS MATCHED ON ITS LETTERS AND DIGITS, not as a string: `is_report_completed()` reduces to lower-case alphanumerics, so a trailing space, a lower-case spelling and an en-dash all read as completed, and `isCompletedVisit()` in src/lib/reportMapping.ts is the client copy of the same rule. That is not defensive coding — the export this was written for carried “Solved - Report Completed ” with a trailing space in all 378 rows, and a string comparison would have reported every one of those calls as missing its report. ANY visit reading completed is enough rather than the latest one: a call written up and then re-visited still has its report. A false entry here sends somebody to re-file a report that exists, which is wasted work and teaches them the list may mean nothing — the same argument as a `_status.sql` row that answers NO for nothing — so both rules are tested with the spellings that actually arrive. The view is `security_invoker`, so the ordinary call and feedback policies decide the rows; the SCREEN is restricted to administrators by `mod:/feedback-without-report`, at the user’s direction (2026-09-22).

# Master

## Party Master `/parties`

Opened by `mod:/parties`.

### URS-074 — A decision to supply rests on evidence that is retained

*Risk: Medium. Filed here because the requirement declares this screen.*

The system shall record, for each customer, whether that customer has been verified. The system shall retain the records on which that verification rests. The system shall show both wherever the decision to supply is taken. A verification with no record behind it is an assertion, and the person relying on it downstream cannot check it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-090** — What the period suggests, and what the customer register holds | Medium | OQ-78 |
| **FRS-088** — The installations awaiting Commercial | Low | OQ-76 |
| **FRS-086** — KYC records attached to a customer | Medium | OQ-74 |

**FRS-090.** FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has.

**FRS-088.** FRS-088.1 My Workload shall list the number of installation requests for which no call has been raised. FRS-088.2 My Workload shall state, of those, the number whose customer is verified. FRS-088.3 My Workload shall state, of those, the number whose customer is not verified. FRS-088.4 My Workload shall state, of those, the number whose customer is absent from the customer register. FRS-088.5 My Workload shall open the request register filtered to the stated subset when the operator selects a count. FRS-088.6 The request register shall display the verification status of the customer named by each request. RATIONALE: FRS-088.4 is separate from FRS-088.3 because the two need opposite actions — a customer who is absent is added, a customer who is present is verified — and a figure that merges them sends somebody to verify a customer who does not exist. The section is offered to every operator who may open the request register rather than to one department, because a count over a list the reader may not open is both useless and a disclosure of its size.

**FRS-086.** FRS-086.1 The customer register shall attach a document to a customer and shall record its name, its location, the operator who attached it and the time. FRS-086.2 The customer register shall display the verification status of each customer in its list. FRS-086.3 The customer register shall display a link to each attached record in that list. FRS-086.4 The system shall treat a customer as verified on the recorded status alone. FRS-086.5 The system shall treat no customer as verified by the presence of an attached record. FRS-086.6 The customer register shall state, for a verified customer with no attached record, that the record is absent. FRS-086.7 The customer register shall retain a removed record in the document store. RATIONALE: .4 and .5 are the two halves of one asymmetry. The status is a DECISION a person made, and withholding it because the paperwork was filed elsewhere would make the system stricter than the people it serves; attaching a file is not a decision, so it can never make a customer verified. .7 because a KYC record somebody relied on is worth keeping wherever it sits.

### URS-010 — Master data

*Risk: Medium. Filed here because its own words name this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

## Product Database `/product-database`

Opened by `mod:/product-database`.

### URS-060 — A record is keyed on what identifies it

*Risk: High. Filed here because the requirement declares this screen.*

The key of a quality or servicing record shall be the whole of what identifies it. Where a record concerns a DEVICE, the device is its model together with its serial number, serial numbers being repeated across models. Where one document concerns SEVERAL devices, each device shall hold its own record under that document’s number. A key narrower than the identity does not fail loudly — it silently replaces one record with another — so the sufficiency of such a key shall be established by MEASUREMENT against the data to be loaded, before that data is loaded.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-072** — A device record is keyed on the model and the serial | High | OQ-54 |

**FRS-072.** Three registers were keyed on less than their identity, and each was corrected against MEASURED data rather than argument. The field failure register was keyed on the report number alone (0181): eight numbers in the 2016–2019 registers each cover several machines — one covers four — so 20 rows collapsed to 8 and TWELVE machines were lost on a load reporting success. Recovered warranty entries were keyed on the serial alone (0185): of 2,263 rows, 298 serials belong to more than one product — one serial is both an ANAVENT and an ORION, another is four machines — so 640 rows collapsed to 298 and THREE HUNDRED AND FORTY-TWO machines were lost. Ownership transfers carried no key at all (0184). Each key is now the pair, held as a GENERATED STORED column with a plain unique index. The rule was already stated in the codebase (src/lib/machine.ts) together with the incident that produced it — a request for one model’s serial 201 was offered an open call for another model’s serial 201, one action from being mapped onto it — and these three registers contradicted it.

### URS-010 — Master data

*Risk: Medium. Filed here because the requirement declares this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

### URS-031 — Find a machine, or a customer’s machines

*Risk: Low. Filed here because the requirement declares this screen.*

A user shall be able to identify the customer holding a given product and serial number, and to list every machine and serial number recorded against a given customer, without needing to know how either is spelled in the register.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-037** — Product & Party Search | Low | OQ-25 |

**FRS-037.** A dedicated screen answers the question from either end. By product: the product list is the distinct set of item names in the PRODUCT REGISTER (view `product_register_names`, security_invoker) with the machine count beside each, and choosing one narrows Serial Number to that product’s serials — an equality match on `products.item_name`, served by the btree index of 0052, so a product name is never a prefix of another. By party: the party list opens the master and the box beside it takes any part of a name. Both land on one answer — the party, its recorded details, and every machine held against it. Export is deliberately absent from this screen.

## Product Database 2.0 `/product-database-2`

Opened by `mod:/product-database-2`.

### URS-068 — One identified record per machine, assembled from every register that names it

*Risk: High. Filed here because the requirement declares this screen.*

Every machine the organisation has sold, contracted or recovered shall appear exactly once in a register of machines, identified by its MODEL together with its SERIAL — never by the serial alone, which repeats across models. That record shall be assembled from the warranty sale register, the contract register, the additional entries, the ownership transfer register and the installation call, and shall state for each of the party, the warranty and the contract WHICH register decided it, so the record can be checked against its evidence. Where the registers disagree, the most recently dated evidence shall decide.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-080** — Product Database 2.0 assembles one row per machine from five registers | High | OQ-64 |

**FRS-080.** `product_database_v2` (0218) lists every machine named by `warranty_sale_details`, `contract_details` or `product_additional_entries`, keyed by `machine_key(product, serial)` — the SQL twin of `machineKey()` in `src/lib/machine.ts`, squashed so ORION-G and ORION G are one model, and MODEL-plus-SERIAL so the eleven machines numbered 219 stay eleven rows. Ownership Transfer and the installation call are joined in. The party is the most recently DATED claim among the ownership transfer, the additional entry, the contract and the sale, ties breaking towards the transfer. `party_from`, `warranty_from`, `contract_from` and `item_status_reason` name the deciding register on every row. It does not replace `public.products` or `machine_cover`, both of which are left exactly as they are.

### URS-069 — What a machine is covered by today is derived, not typed

*Risk: High. Filed here because the requirement declares this screen.*

Whether a machine is inside its warranty, under a maintenance contract, or covered by neither shall be DERIVED from the recorded warranty and contract periods rather than stored as an opinion that ages. A machine inside its warranty is under warranty (WGP) even where a contract also covers it; a labour contract is AMC and a comprehensive contract is CMC; a machine covered by neither is OGP. A contract whose type was never recorded shall be reported as such and shall never be assumed to be either kind.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-081** — Item status is derived warranty-first, and a typeless contract is flagged | High | OQ-65 |

**FRS-081.** `product_database_v2.item_status` is WGP where the warranty period covers today; otherwise `contract_cover_code(type)` where the contract period covers today — labour/labor to AMC, comprehensive/CMC to CMC, anything else returned UNCHANGED rather than bucketed; otherwise OGP. A contract covering today whose type is blank reads `CONTRACT (TYPE NOT RECORDED)`. This differs from `machine_cover` in both directions on purpose: that view asks the contract FIRST (so a machine inside warranty reads as its contract type) and defaults a blank type to CMC (so a labour contract silently reads as comprehensive).

### URS-070 — A warranty starts when the machine was installed

*Risk: High. Filed here because the requirement declares this screen.*

The warranty period of a machine shall start from the date recorded on its installation — the Warranty Start Date captured when the installation call is reported, or failing that the date that call was solved — and shall fall back to the selling register only where no installation was recorded. The end of the period shall be derived from that start and the recorded period, by the same arithmetic the rest of the application uses.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-082** — Warranty start comes from the installation, and the end is computed like the app | High | OQ-66 |

**FRS-082.** Warranty start is the `Warranty Start Date?` answer on the installation call’s feedback, read through `imported_ts()` so a cell holding "n/a" yields nothing rather than failing the whole view; failing that the installation call’s solved date; failing that the additional entry; failing that the warranty sale. Where a start and a period are both known the end is `cover_period_end(start, months)`, which reproduces `addPeriod()` in `src/lib/dates.ts` INCLUDING its JavaScript month overflow — 31 January plus one month is 2 March, where Postgres’s own interval arithmetic clamps to 27 February. 26 of 458 start/period combinations differ between the two.

## Product Master (product lines) `/product-master`

Opened by `mod:/product-master`.

### URS-060 — A record is keyed on what identifies it

*Risk: High. Filed here because the requirement declares this screen.*

The key of a quality or servicing record shall be the whole of what identifies it. Where a record concerns a DEVICE, the device is its model together with its serial number, serial numbers being repeated across models. Where one document concerns SEVERAL devices, each device shall hold its own record under that document’s number. A key narrower than the identity does not fail loudly — it silently replaces one record with another — so the sufficiency of such a key shall be established by MEASUREMENT against the data to be loaded, before that data is loaded.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-072** — A device record is keyed on the model and the serial | High | OQ-54 |

**FRS-072.** Three registers were keyed on less than their identity, and each was corrected against MEASURED data rather than argument. The field failure register was keyed on the report number alone (0181): eight numbers in the 2016–2019 registers each cover several machines — one covers four — so 20 rows collapsed to 8 and TWELVE machines were lost on a load reporting success. Recovered warranty entries were keyed on the serial alone (0185): of 2,263 rows, 298 serials belong to more than one product — one serial is both an ANAVENT and an ORION, another is four machines — so 640 rows collapsed to 298 and THREE HUNDRED AND FORTY-TWO machines were lost. Ownership transfers carried no key at all (0184). Each key is now the pair, held as a GENERATED STORED column with a plain unique index. The rule was already stated in the codebase (src/lib/machine.ts) together with the incident that produced it — a request for one model’s serial 201 was offered an open call for another model’s serial 201, one action from being mapped onto it — and these three registers contradicted it.

### URS-010 — Master data

*Risk: Medium. Filed here because the requirement declares this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

## User Master `/user-master`

Opened by `mod:/user-master`.

### URS-010 — Master data

*Risk: Medium. Filed here because its own words name this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

## Part Master `/parts`

Opened by `mod:/parts`.

### URS-010 — Master data

*Risk: Medium. Filed here because its own words name this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

### URS-027 — Refurbished spares

*Risk: High. Filed here because its own words name this screen.*

Where a recycled spare is issued in place of a new one, it shall be identified by its own part number, held and consumed as that part, and the engineer shall be told the part is refurbished. Only a part held in Part Master and active may be issued this way.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-033** — Refurbished issue | High | OQ-20 |

**FRS-033.** Stores may mark a line as refurbished when issuing it. The issue records the recycled identity — R + part code, description unchanged — while the request keeps what was asked for. Hand stock is derived from the ISSUE, so the refurbished part is held and consumed under its own code. A database check refuses the swap unless that code exists in Part Master and is active, and the engineer’s dispatch notification states that the part is refurbished.

## All Masters `/masters`

Opened by `mod:/masters`.

### URS-010 — Master data

*Risk: Medium. Filed here because the requirement declares this screen.*

Party, product, part and user master data, and configurable value lists, shall be maintained under control.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-015** — Master maintenance | Medium | OQ-26 |

**FRS-015.** Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.

# Administration

## Bulk Report Mapping `/report-mapping`

Opened by `mod:/report-mapping`.

### URS-040 — A bulk load shall not silently alter what it does not carry

*Risk: High. Filed here because the requirement declares this screen.*

Loading a file shall change only the fields that file supplies. A value the file leaves empty shall take the value the system defines for it, and shall not be written as empty or null; a load that cannot honour this shall fail rather than write.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-074** — Every loadable register has a key its interface can infer | Medium | OQ-54 |
| **FRS-071** — The field failure register is loaded year by year, whatever shape each year is | Medium | OQ-63 |
| **FRS-046** — A batch is one shape | High | OQ-33 |

**FRS-074.** Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first.

**FRS-071.** The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year.

**FRS-046.** The API writes a batch of rows as ONE insert whose column list is the union of the rows’ keys; a row lacking one of those keys is written as NULL, not as the column default. The loader therefore groups rows by their column set and sends each group separately, so a column no row in the group carries genuinely defaults. Filling absent values in was rejected as a fix: it would defeat a default that carries meaning. A load that violates a NOT NULL constraint fails the batch and writes nothing of it.

## PM Bulk Upload `/pm-bulk-upload`

Opened by `mod:/pm-bulk-upload`.

### URS-040 — A bulk load shall not silently alter what it does not carry

*Risk: High. Filed here because the requirement declares this screen.*

Loading a file shall change only the fields that file supplies. A value the file leaves empty shall take the value the system defines for it, and shall not be written as empty or null; a load that cannot honour this shall fail rather than write.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-074** — Every loadable register has a key its interface can infer | Medium | OQ-54 |
| **FRS-071** — The field failure register is loaded year by year, whatever shape each year is | Medium | OQ-63 |
| **FRS-046** — A batch is one shape | High | OQ-33 |

**FRS-074.** Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first.

**FRS-071.** The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year.

**FRS-046.** The API writes a batch of rows as ONE insert whose column list is the union of the rows’ keys; a row lacking one of those keys is written as NULL, not as the column default. The loader therefore groups rows by their column set and sends each group separately, so a column no row in the group carries genuinely defaults. Filling absent values in was rejected as a fix: it would defeat a default that carries meaning. A load that violates a NOT NULL constraint fails the batch and writes nothing of it.

## Bulk Uploads `/bulk-uploads`

Opened by `mod:/bulk-uploads`.

### URS-062 — A loaded register can be corrected by loading it again

*Risk: Medium. Filed here because the requirement declares this screen.*

Every register that may be populated from a file shall have a natural key drawn from the file itself, so that re-loading a corrected export UPDATES the records it names rather than adding them a second time. The key shall be one the data interface can infer, and its sufficiency shall be verified against a database rather than by inspection. A row not carrying the key shall be refused and the reason given, a row that cannot be matched on a re-run being one that arrives again on every load.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-074** — Every loadable register has a key its interface can infer | Medium | OQ-54 |

**FRS-074.** Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first.

### URS-039 — Identifier continuity across a migration

*Risk: High. Filed here because the requirement declares this screen.*

Record identifiers shall remain unique and continue in sequence after historical records carrying their own identifiers are loaded; the system shall not re-issue an identifier the migrated data already uses.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-045** — Identifier continuity | High | OQ-32 |

**FRS-045.** The call-request trigger assigns a REQID from a sequence when the row does not carry one, and when it DOES carry one advances the sequence past it (0097), so loading historical records cannot leave the counter beneath them. `resync_call_req_seq()` repairs a counter already stranded. Identifiers issued out of sequence before the repair are re-lettered rather than renumbered, so a record people have seen keeps its identity while ceasing to collide.

### URS-040 — A bulk load shall not silently alter what it does not carry

*Risk: High. Filed here because the requirement declares this screen.*

Loading a file shall change only the fields that file supplies. A value the file leaves empty shall take the value the system defines for it, and shall not be written as empty or null; a load that cannot honour this shall fail rather than write.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-074** — Every loadable register has a key its interface can infer | Medium | OQ-54 |
| **FRS-071** — The field failure register is loaded year by year, whatever shape each year is | Medium | OQ-63 |
| **FRS-046** — A batch is one shape | High | OQ-33 |

**FRS-074.** Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first.

**FRS-071.** The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year.

**FRS-046.** The API writes a batch of rows as ONE insert whose column list is the union of the rows’ keys; a row lacking one of those keys is written as NULL, not as the column default. The loader therefore groups rows by their column set and sends each group separately, so a column no row in the group carries genuinely defaults. Filling absent values in was rejected as a fix: it would defeat a default that carries meaning. A load that violates a NOT NULL constraint fails the batch and writes nothing of it.

## Data Export `/data-export`

Opened by `mod:/data-export`.

### URS-062 — A loaded register can be corrected by loading it again

*Risk: Medium. Filed here because its own words name this screen.*

Every register that may be populated from a file shall have a natural key drawn from the file itself, so that re-loading a corrected export UPDATES the records it names rather than adding them a second time. The key shall be one the data interface can infer, and its sufficiency shall be verified against a database rather than by inspection. A row not carrying the key shall be refused and the reason given, a row that cannot be matched on a re-run being one that arrives again on every load.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-074** — Every loadable register has a key its interface can infer | Medium | OQ-54 |

**FRS-074.** Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first.

## Solved Without a Report `/missing-visit-reports`

Opened by `mod:/missing-visit-reports`.

### URS-065 — A recovered quality record is reviewed before it is written

*Risk: High. Filed here because the requirement declares this screen.*

Where records of work already done are recovered from a superseded system, each shall be resolved to the record it belongs to AND SHOWN TO AN OPERATOR BEFORE ANY OF IT IS WRITTEN, and only rows that resolved cleanly shall be written. A visit attached to the wrong call, or carrying another machine’s photograph, is a worse outcome than a visit still missing: the first is a false record of what was done to a device, the second is a gap that is visible as a gap. Rows that did not resolve shall be reported with the reason and left unwritten rather than written with a guess.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-077** — Bulk Report Mapping reads, resolves and only then writes | High | OQ-58 |

**FRS-077.** The screen runs in three stated steps and in this order: READ the sheet and work out which call each row belongs to; RESOLVE the superseded system’s file references into links; WRITE only the rows that came through both cleanly. Nothing is written until the operator has SEEN what each row resolved to, and rows that did not resolve are listed with the reason and are not written. The register it writes into is the visit history, whose records are never deleted, so a wrong write cannot be taken back — which is why the review is a step rather than a confirmation dialogue.

## Tracker `/tracker`

Opened by `mod:/tracker`.

### URS-019 — Controlled change

*Risk: Medium. Filed here because the requirement declares this screen.*

Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-024** — Release identity & change log | Medium | IQ-01 |

**FRS-024.** Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled.

## User Access `/users`

Opened by `mod:/users`.

### URS-001 — Authenticated access

*Risk: High. Filed here because its own words name this screen.*

Only authenticated, authorised personnel shall access the system, each with a unique user identity.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-001** — Credential authentication | High | OQ-01 |
| **FRS-002** — Account lifecycle | High | OQ-01 |
| **FRS-051** — Two names on a registration | High | OQ-37 |

**FRS-001.** The system authenticates users against Supabase Auth (email + password); first sign-in forces a password set; sessions are token-based and expire.

**FRS-002.** Administrators create logins from User Master; a leaver’s login can be set inactive, blocking sign-in and hydration while retaining their historical records.

**FRS-051.** Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it.

### URS-002 — Role-based visibility

*Risk: High. Filed here because the requirement declares this screen.*

A user shall see and act on only the records their role permits: an engineer their own calls, a manager their reporting team, office/administration roles as defined.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-003** — RBAC + reporting-tree scoping | High | IQ-02, OQ-02 |
| **FRS-004** — Server-side authorisation | High | IQ-02, OQ-02 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |
| **FRS-050** — A view must not defeat the policies beneath it | High | OQ-35 |

**FRS-003.** Each role maps to a permission set (app_roles). Data visibility is scoped by a reporting tree resolved from User Master; enforced in the client and, authoritatively, by PostgreSQL Row-Level Security.

**FRS-004.** Every read/write is governed by RLS policies keyed on the authenticated user (auth.uid()) and SECURITY DEFINER helper functions; the UI gate is secondary.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

**FRS-050.** Every view over a table carrying row-level security is created `security_invoker`, so the policies are evaluated for the READER. `create or replace view` does not carry the setting over, and a view running as its owner returns everything with no error and no warning. `npm run check:views` fails on any view over an RLS-protected table that lacks it, and `_status.sql` reports it on a live project; views intentionally readable by every signed-in user are enumerated with their reason.

## Roles & Permissions `/roles`

Opened by `mod:/roles`.

### URS-067 — Authority over a quality record is held section by section

*Risk: High. Filed here because the requirement declares this screen.*

The authority to amend a call in progress shall be grantable SEPARATELY for each part of the record whose amendment means a different thing: the complaint as reported, the customer and device it names, the vigilance answers, and the customer’s contact details. Re-allocating a call to another engineer, and cancelling or restoring one, shall each be their own authority. A single “edit” right cannot express the distinction the record requires — correcting a telephone number and re-answering whether a patient was harmed are not the same act — and each shall be attributable to the person who performed it.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-079** — The call edit rights are four sections, plus allotment and cancellation | High | OQ-60 |

**FRS-079.** `calls.edit.complaint`, `calls.edit.customer`, `calls.edit.vigilance` and `calls.edit.contact` each gate one part of the record and are granted independently; `calls.allot` gates re-allocation to another engineer and `calls.cancel` gates cancelling and restoring a call. `calls.edit` remains the parent, so a role holding it holds the four sections — `parentAction()` resolves a section key to it — and a role may instead be given one section alone. `cover.edit` is the equivalent authority over the warranty and contract registers, and `admin.view` opens the administration pages READ-ONLY, so somebody may inspect configuration without the right to change users.

### URS-063 — A read-only role holds no authority to write, and a derived role does not track its source

*Risk: High. Filed here because the requirement declares this screen.*

Where a role is described as read-only it shall hold no permission that any write policy names, so that a refusal is the database’s and not a hidden control. Where a role is created by COPYING another, the copy shall be a one-time act and the two shall not thereafter be kept in step, so that granting an authority on one role cannot confer it on another. A periodic report shall state the write authority each such role holds; it shall present that as a matter for review rather than as a defect, because a grant may be deliberate and no re-application of configuration can remove one.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-075** — The read-only roles hold nothing that writes, and a copy is a one-time act | High | OQ-56 |

**FRS-075.** 0180 removes `review.edit` from the Zoho Migration role. It had arrived by copying: 0155 merged the Technical Support permission row into Zoho Migration on EVERY application of the RBAC bundle, so an authority granted deliberately on one role crossed to another silently. What it conferred was established against a database rather than read from the policy — `review.edit` grants ALL commands on `call_reviews`, and a user holding it answered a review, fired the trigger and raised a field failure report in their own name, a record the retention guard means can never be deleted. 0155 now SEEDS the role once and leaves it alone: two roles kept identical are one role with two names, and a separate role exists in order to diverge and be revoked without touching the other. The Technical Support grant is RETAINED, being the system owner’s decision. The status report tests only what the configuration bundle provides; the write authority each read-only role holds is reported by a diagnostic as a question for review, because a status row that reads NO on a deliberate grant sends somebody to re-apply configuration that cannot remove it.

### URS-056 — An access role always has a defined permission set

*Risk: High. Filed here because the requirement declares this screen.*

A role by which access is granted shall never exist without an explicit set of permissions. Where a role is added by configuration it shall be derived from an existing role, so that no role can be brought into use whose effective authority is implied rather than stated.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-065** — A role is created only by derivation | High | OQ-50 |

**FRS-065.** Roles may be added from Roles & Permissions by a holder of rbac.manage. The form requires a source role and copies its permissions; a role cannot be created with an empty set, because has_perm() treats an empty permission array as unconfigured and falls back to the engineer defaults — an “empty” role would therefore grant an engineer’s authority. The key is derived as a slug from the name and cannot collide with an existing or reserved key. Roles are not deleted from this screen; a role in use is emptied or its users moved. Every role the database holds is drawn in the matrix and offered wherever a role is chosen.

### URS-002 — Role-based visibility

*Risk: High. Filed here because the requirement declares this screen.*

A user shall see and act on only the records their role permits: an engineer their own calls, a manager their reporting team, office/administration roles as defined.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-003** — RBAC + reporting-tree scoping | High | IQ-02, OQ-02 |
| **FRS-004** — Server-side authorisation | High | IQ-02, OQ-02 |
| **FRS-014** — Stock visibility scope | Medium | OQ-62 |
| **FRS-050** — A view must not defeat the policies beneath it | High | OQ-35 |

**FRS-003.** Each role maps to a permission set (app_roles). Data visibility is scoped by a reporting tree resolved from User Master; enforced in the client and, authoritatively, by PostgreSQL Row-Level Security.

**FRS-004.** Every read/write is governed by RLS policies keyed on the authenticated user (auth.uid()) and SECURITY DEFINER helper functions; the UI gate is secondary.

**FRS-014.** Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.

**FRS-050.** Every view over a table carrying row-level security is created `security_invoker`, so the policies are evaluated for the READER. `create or replace view` does not carry the setting over, and a view running as its owner returns everything with no error and no warning. `npm run check:views` fails on any view over an RLS-protected table that lacks it, and `_status.sql` reports it on a live project; views intentionally readable by every signed-in user are enumerated with their reason.

## Audit Log `/audit`

Opened by `mod:/audit`.

### URS-016 — Audit trail

*Risk: High. Filed here because its own words name this screen.*

The system shall keep a secure, attributable, time-stamped audit trail of key actions that users cannot alter.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-021** — Audit log | High | OQ-09 |

**FRS-021.** TWO TRAILS AGAIN, as of 0225 (2026-09-21). `audit_log` records what a USER DID — action, target, duration, outcome, actor and time — and its retention is configurable (app_settings.audit_retention_days, default ~10 years), with a daily digest built to archive the day off-database (supabase/functions/daily-digest) THAT HAS NEVER BEEN DEPLOYED — so no off-database archive exists today. Its LIMITS are stated rather than glossed: it is written by the CLIENT, so it can be bypassed by a direct API call, and it is purged when the retention window passes. THE SECOND TRAIL IS BACK ON. `record_audit` records what a ROW BECAME, before and after, in triggers that CANNOT BE BYPASSED and that nothing purges — stopped by 0112 on 2026-09-05 when it was thought to exist only for 21 CFR Part 11, and re-armed by 0225 at the user’s direction on 2026-09-21. The event that settled it was not a regulatory one: on 2026-09-20 a re-applied bundle set 4,222 calls back to Unattended, and NOTHING IN THE SYSTEM COULD SAY WHAT THEY HAD BEEN. A client-written trail cannot answer that, because the write did not come through the client. 0103’s shape is what was restored, not 0048’s: a BULK load is ONE attributable event rather than a row per record, so the trail stays about what people did. The table also still holds everything it captured 2026-08 to 2026-09-05; that gap, 05-Sep to 21-Sep, is real and is not recoverable.

## Admin Config `/admin-config`

Opened by `mod:/admin-config`.

### URS-014 — SLA monitoring

*Risk: Medium. Filed here because the requirement declares this screen.*

The company shall define service-level targets and the system shall highlight open calls that are due or breached.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-019** — SLA engine | Medium | OQ-11 |

**FRS-019.** Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached.

## Software Validation `/software-validation`

Opened by `mod:/software-validation`.

### URS-019 — Controlled change

*Risk: Medium. Filed here because the requirement declares this screen.*

Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-024** — Release identity & change log | Medium | IQ-01 |

**FRS-024.** Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled.

## Version History `/version-history`

Opened by `mod:/version-history`.

### URS-019 — Controlled change

*Risk: Medium. Filed here because the requirement declares this screen.*

Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app.

| Implemented by | Risk | Proved by |
| --- | --- | --- |
| **FRS-024** — Release identity & change log | Medium | IQ-01 |

**FRS-024.** Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled.

# Not tied to one screen

These name no module in their own words. Most are system-wide, and forcing
them under a screen would say something the requirement does not.

## User requirements

- **URS-061** — A value that cannot be determined is recorded as unknown · implemented by FRS-073
- **URS-015** — Notifications · implemented by FRS-020
- **URS-017** — Data integrity & retention · implemented by FRS-022
- **URS-018** — Availability & recovery · implemented by FRS-023
- **URS-033** — Grouping a register · implemented by FRS-039
- **URS-042** — Response within a working time · implemented by FRS-048
- **URS-043** — Decision support · implemented by FRS-049

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

## Cover — warranty, contract, ownership

- **CW-001** — A machine is identified by its model together with its serial · [full text](COVER_REQUIREMENTS.md)
- **CW-002** — One machine is one row · [full text](COVER_REQUIREMENTS.md)
- **CW-003** — The identifier is normalised the same way everywhere · [full text](COVER_REQUIREMENTS.md)
- **CW-004** — A warranty has a recorded start, a recorded period and a derived end · [full text](COVER_REQUIREMENTS.md)
- **CW-005** — The end of a period is computed the same way everywhere · [full text](COVER_REQUIREMENTS.md)
- **CW-006** — A warranty starts when the machine was installed · [full text](COVER_REQUIREMENTS.md)
- **CW-007** — An unreadable answer is not a date · [full text](COVER_REQUIREMENTS.md)
- **CW-008** — A contract's type is one of two families, and is never guessed · [full text](COVER_REQUIREMENTS.md)
- **CW-009** — A contract covering today with no recorded type is reported, not assumed · [full text](COVER_REQUIREMENTS.md)
- **CW-010** — Cover is continuous across a renewal · [full text](COVER_REQUIREMENTS.md)
- **CW-011** — A change of owner is a dated record, and it is read · [full text](COVER_REQUIREMENTS.md)
- **CW-012** — The most recently dated evidence decides the party · [full text](COVER_REQUIREMENTS.md)
- **CW-013** — A machine may not be transferred to the party that already owns it · [full text](COVER_REQUIREMENTS.md)
- **CW-014** — Every register that names a machine contributes to its record · [full text](COVER_REQUIREMENTS.md)
- **CW-015** — A machine recovered by hand is a machine · [full text](COVER_REQUIREMENTS.md)
- **CW-016** — What a machine is covered by today is derived, not stored · [full text](COVER_REQUIREMENTS.md)
- **CW-017** — Warranty decides before contract · [full text](COVER_REQUIREMENTS.md)
- **CW-018** — A derived value names the register that decided it · [full text](COVER_REQUIREMENTS.md)
- **CW-019** — The derived record does not overwrite the registers · [full text](COVER_REQUIREMENTS.md)
- **CW-020** — The record is readable only by those entitled to the underlying rows · [full text](COVER_REQUIREMENTS.md)
- **CW-021** — The terms of a sale or a contract reach every machine under it · [full text](COVER_REQUIREMENTS.md)
- **CW-022** — The installation work for a sold machine is raised from its sale · [full text](COVER_REQUIREMENTS.md)

# Where the set is not complete

Stated rather than left to be noticed. None of these is a defect on its own —
each is a question for a person.

| | Count | What it means |
| --- | --- | --- |
| User requirements no system requirement implements | 0 | a gap, or a need met outside this system |
| System requirements no test names | 0 | built and specified, not yet proved |
| User requirements nothing proves, directly or through an FRS | 0 | the one that matters for an audit |

**Is every screen covered by the wider package?** That is answered in
[`REQUIREMENT_COVERAGE.md`](REQUIREMENT_COVERAGE.md), which searches
requirements, design, risks, tests and the checklist rather than requirement
text alone.

## Screens no user requirement governs

**2 of 61.** Each is written down with its reason in
`src/lib/validation.ts` (`MODULES_WITHOUT_REQUIREMENT`), so it is a decision
somebody made rather than a drift nobody saw — and `check:ui` fails when a
screen joins this list without one. Neither is a defect on its own; both are
questions for a person.

| Screen | Why nothing is filed here |
| --- | --- |
| **Objective** `/objective` | The quality objectives are a QMS obligation (ISO 13485 §5.4.1) rather than something a user asked this system for. The servicing reference governs them; no URS claims to, and writing one to fill the gap would be inventing a requirement to satisfy a report. |
| **Settings** `/settings` | Per-device preferences — the CallReg endpoint, the theme. Nothing about the quality record depends on them, which is why no requirement reaches this screen. |

---

**76** user requirements · **90** system requirements · **30** call-request · **44** servicing · **85** tests · **5** recorded as non-auditable · **126** of 76 user requirements tied to a module.
---

## Non-auditable requirements

Recorded here because a feature absent from the specification is the thing an assessor finds. Each is classified by PROVENANCE: it is not derived from a regulatory clause and is not offered as evidence against one. That is a statement about where the requirement came from, NOT a statement that its use goes unrecorded.

### NAR-005 — The cover registers are worked as two windows

*Non-Auditable Requirement (user-originated; no regulatory clause claimed)* · risk: **Low**

NAR-005.1 The cover registers shall display an opened entry beside the list of entries. NAR-005.2 The cover registers shall display a control that changes the width given to each of the two. NAR-005.3 The cover registers shall retain the width last set, per register. NAR-005.4 The cover registers shall express that width as a proportion of the available width. NAR-005.5 The cover registers shall display the list alone while no entry is open. NAR-005.6 The cover registers shall keep each of the two above a stated minimum width. NAR-005.7 The cover registers shall display the two one above the other where the available width is below 900 pixels. NAR-005.8 The cover registers shall remove the width control where they display the two one above the other.

**Why it is classified this way.** Requested by the system owner on 2026-09-22: "Make the Warranty Entry and Contract as a 2 window view [Adjustable width]." CLASSIFIED NON-AUDITABLE BY WHAT IT TOUCHES: it changes where a record is DISPLAYED and nothing about what is recorded, what is enforced, or who may do it. The same fields, the same validation, the same policies and the same writes; a drawer over the list and a pane beside it hold identical content. It is recorded here rather than omitted for the reason this section exists — a change to a screen an assessor will open, absent from the specification, is the thing an assessor finds. NAR-005.4 and NAR-005.6 are the two that are not cosmetic and are stated for that reason: a width remembered in PIXELS on a wide monitor is a pane that fills a laptop, and a divider that can be dragged to the edge leaves a reader with a screen that looks broken and nothing left to grab to undo it. NAR-005.8 likewise: a control that does nothing is worse than an absent one. Should this layout ever be used to withhold a field from one of the two panes — to show a reader less than the drawer showed — that use is NOT covered by this classification and is to be raised as an auditable requirement, because what a quality record shows its reader is not a layout decision.

**No test protocol names this requirement.** That is a gap, not a decision.

**Where it lives:** src/components/ui/SplitPane.tsx · src/modules/CoverRegister.tsx

### NAR-004 — Scheduled export of chosen tables, delivered by electronic mail

*Non-Auditable Requirement (user-originated; no regulatory clause claimed) — BUILT; THE MAIL SIDE AWAITS ONE DEPLOYMENT* · risk: **High**

NAR-004.1 The system shall provide an administrator a means to define a named export schedule. NAR-004.2 An export schedule shall identify one or more relations of the public schema. NAR-004.3 The system shall reject an export schedule identifying a relation absent from the public schema. NAR-004.4 The system shall reject an export schedule identifying the relation audit_log, record_audit or audit_mode_changes. NAR-004.5 An export schedule shall specify a recurrence of either every day or one stated day of the week. NAR-004.6 An export schedule shall specify a time of day in the Asia/Kolkata time zone. NAR-004.7 The system shall obtain the delivery addresses of an export from the export service configuration. NAR-004.8 The system shall provide no application interface that changes the delivery addresses of an export. NAR-004.9 The system shall write the contents of each relation identified by a schedule to a separate comma-separated-values file. NAR-004.10 The system shall collect the files of one export into one archive. NAR-004.11 The system shall send one electronic mail message carrying that archive to each delivery address. NAR-004.12 The system shall omit from the archive each file whose inclusion would take the archive above the configured attachment limit. NAR-004.13 The system shall name each relation omitted under NAR-004.12 in the body of that message. NAR-004.14 The system shall send at most one message for one export schedule in one recurrence interval. NAR-004.15 The system shall send one message for a recurrence interval whose stated time has passed and for which it has sent no message. NAR-004.16 The system shall read every row of each identified relation irrespective of the row-level security policies on that relation. NAR-004.17 The system shall record for each export its start time, its completion time, the relations exported, the number of rows exported, the size of the archive and its outcome. NAR-004.18 The system shall send one electronic mail message naming the cause where an export does not complete. NAR-004.19 The system shall refuse every modification and every deletion of an export record received through the application programming interface.

**Why it is classified this way.** Requested by the system owner on 2026-09-22 ("Export every Table and send it to Email every day by 11pm"), then narrowed by the same person to a CSV export of SELECTED tables ("I need to Export CSV only. Maybe I can select the Tables") and to a schedule set on a screen ("Or can we have Scheduled Export option in the UI itself so that i will schedule which ever is necessary"). The statements above are the narrowed requirement, which is what is built. THE ONE STATEMENT THAT IS NOT A CONVENIENCE IS NAR-004.8. An earlier design of this export held the delivery address in an app_settings row; it was refused as an exfiltration primitive and the refusal was correct — NAR-004.16 makes this the whole customer base, every serial, every contract, every contact, leaving the system on a timer, and a destination any administrator can edit means it can be redirected silently with nothing on any screen looking different the next morning. So the requirement is split by WHERE IT IS KEPT: which relations and at what time are rows an administrator edits (NAR-004.1, .2, .5, .6); the addresses are configuration of the export service, set through the deployment channel by somebody holding the project keys (NAR-004.7), and no application path changes them (NAR-004.8). NAR-004.4 is the second control and exists for the same reason NAR-004.16 does: the export reads past row-level security, so an unchecked relation name would be a way to mail out the audit trail. WHAT IS BUILT AND WHAT IS NOT: the schedules, their guards, the due-time arithmetic and the run record are in 0228 and the screen is Administration → Data Export. The service that sends the mail is supabase/functions/scheduled-export (Deno, Resend), which cannot be deployed from the repository — it needs a Resend key and one CLI deploy. NOTHING IS SENT UNTIL THAT IS DONE, and NAR-004.9 to .19 are therefore SPECIFIED AND UNVERIFIED AS AT THIS REVISION. The transport was the system owner’s choice on 2026-09-22 ("Resend + Supabase Edge Function for the transport"); the addresses agreed are service.almsind@gmail.com and devika.m@airliquide.com. A CORRECTION IS OWED ON THIS ENTRY’S OWN EARLIER TEXT. It stated that a search on 2026-09-22 found "no mail path of any kind — no MailApp, no pg_net, no transport" and withdrew two statements about a daily digest on that basis. THAT SEARCH WAS WRONG: supabase/functions/daily-digest has been in the repository since 2026-09, sends through Resend, attaches the day’s record_audit as a CSV, and ships with a pg_net schedule — and this package’s own supplier appendix names Resend. The true statement is narrower and is the one that matters to an assessor: THAT FUNCTION HAS NEVER BEEN DEPLOYED, so no digest has ever been sent and no off-database archive of the audit trail exists. The claim withdrawn was about a control OPERATING; the reason given for withdrawing it was false. Should this export ever be relied upon as the backup of record, that use is NOT covered by this classification: backup and restore is FRS-023, it is auditable, and PQ-06 verifies it.

**Verified by:** OQ-68 — The daily export runs to time, carries every table, and says so when it does not. · OQ-70 — A schedule names what leaves and when, and cannot name where it goes or reach an audit trail. · OQ-71 — The mail carries every row of the chosen relations, readable, and says what it left out.

**Where it lives:** 0228_export_schedules.sql · supabase/functions/scheduled-export/index.ts · src/modules/DataExport.tsx · supabase/tests/export_schedule_test.sql · scripts/check-scheduled-export.mjs

### NAR-003 — Bulk Report Mapping — attaching a recovered report to its call

*Non-Auditable Requirement (user-originated; no regulatory clause claimed)* · risk: **Medium**

NAR-003.1 Bulk Report Mapping shall identify the call for each imported row by the UC Number, and by the Call Number where the UC Number is empty. NAR-003.2 Bulk Report Mapping shall classify a visit as the completed visit when the visit call status, reduced to lower-case alphanumeric characters, equals "solvedreportcompleted". NAR-003.3 Bulk Report Mapping shall make no change to a call whose completed visit holds a non-empty report link. NAR-003.4 Bulk Report Mapping shall write the report link to the completed visit whose report link is empty. NAR-003.5 Bulk Report Mapping shall select the completed visit with the latest entry timestamp where the call holds more than one completed visit with an empty report link. NAR-003.6 Bulk Report Mapping shall write the report link, the source reference and the call status "Solved - Report Completed" to the visit selected under NAR-003.4. NAR-003.7 Bulk Report Mapping shall preserve every column of that visit other than the three columns named in NAR-003.6. NAR-003.8 Bulk Report Mapping shall create one visit carrying the report link and the call status "Solved - Report Completed" where the call holds no completed visit. NAR-003.9 Bulk Report Mapping shall make no change for an imported row whose report link is empty. NAR-003.10 Bulk Report Mapping shall display for each imported row, before the operator confirms the write, one action from the set {no change, write to existing visit, create visit}. NAR-003.11 Bulk Report Mapping shall complete every write to an existing visit before it creates any visit.

**Why it is classified this way.** Stated by the system owner on 2026-09-22: "If the Report is already present, it should not update. If the Report is Absent, then it should update the Report Link on a Existing Visit Entry - with Status ‘Solved - Report Completed’ - with the Report Link. If there is no Visit with ‘Solved - Report Completed’, then it should add Visit Entry." CLASSIFIED NON-AUDITABLE BY PROVENANCE, at the owner’s direction: it is a rule about how a recovery tool behaves, not one derived from a regulatory clause, and it is not offered as evidence against one. THAT IS NOT A STATEMENT THAT ITS USE GOES UNRECORDED — `reports` is one of the ten tables record_audit covers (0225), so every attachment and every filed visit is recorded with the row before and after. NAR-003.3 and NAR-003.7 are the two that carry weight and are written as prohibitions for that reason: a recovered link must never displace one an engineer filed, and a visit being attached to is an engineer’s record whose other columns are theirs. Should this tool ever be used to alter a visit’s date, engineer or work details, that use is NOT covered by this classification and is to be raised as an auditable requirement with its own risk assessment.

**Verified by:** OQ-67 — A recovered report reaches its call without displacing what an engineer filed.

**Where it lives:** src/lib/reportMapping.ts · src/modules/ReportMapping.tsx · scripts/check-report-mapping.ts

### NAR-002 — Tracker — the shared activity list

*Non-Auditable Requirement (user-originated; no regulatory clause claimed)* · risk: **Low**

An activity list a handful of people keep together: anyone who can open it may add a row and edit any field, and every field saves when it loses focus rather than through a form. It is reached under Administration and is gated by its own module key, so who may open it is an administrator’s decision like any other screen.

**Why it is classified this way.** Requested by the system owner on 2026-09-08 — "add a tracker page under admin to track activities. something very similar to backlog.. shared between me and a few other. all who have access should be able add, edit". IT IS NOT A QUALITY RECORD AND IS NOT OFFERED AS ONE: nothing in the servicing process reads it, no figure is drawn from it, and no judgement recorded elsewhere depends on it. It is listed here for the reason this section exists — a feature absent from the specification is the thing an assessor finds — and because its edit-in-place behaviour is deliberate and would otherwise read as a control that had been forgotten rather than one that was never required. Should anything a servicing or quality procedure relies on ever be kept here, that use is NOT covered by this classification and is to be raised as an auditable requirement with its own risk assessment: a shared list with no attribution per field and no amendment history cannot carry a record anybody must rely on.

**No test protocol names this requirement.** That is a gap, not a decision.

**Where it lives:** src/modules/Tracker.tsx

### NAR-001 — Audit Mode

*Non-Auditable Requirement (user-originated; no regulatory clause claimed)* · risk: **Medium**

The system provides a system-wide Audit Mode that only an administrator may switch on or off. The switch is held in app_settings; it is changed only through set_audit_mode(), which refuses a caller who is not an administrator and refuses a change with no reason; every change is written to audit_mode_changes with the new state, the reason, the actor and the time. That table has no insert, update or delete path through the API and is not covered by the audit-log retention purge, so the record of when the mode was on outlives the audit log itself.

**Why it is classified this way.** Requested by the system owner on 2026-09-06, with the rules governing the mode’s BEHAVIOUR to be supplied separately. As at this revision NO APPLICATION BEHAVIOUR IS CONDITIONED ON THE MODE: the switch is built, its use is recorded, and nothing reads it. It is documented now rather than later because an undocumented switch in a validated system is a finding in itself. When the rules arrive, each one is to be assessed on its own merits — any rule that would alter, conceal or suppress a quality record, or change what a record shows to an assessor, is NOT covered by this classification and must be raised as an auditable requirement with its own risk assessment before it is built.

**Verified by:** OQ-38 — Audit Mode is an administrator’s switch, and every throw of it is kept.

**Where it lives:** 0114_audit_mode.sql · supabase/tests/audit_mode_test.sql


---

# Traceability matrix

**One row per LINK, not per requirement.** A user requirement implemented by
two system requirements, each proved by two tests, is four rows — because what
is being traced is the link: *this need is met by this mechanism, and that is
shown by this test*. Collapsing them into one row with three lists hands the
reader back the very question the matrix exists to answer.

The URS and FRS cells are **left blank on a row that continues the one above**,
so the eye follows a requirement down its own block. Nothing is missing there:
the identifier is the one at the top of the block.

A requirement with no system requirement, or a mechanism with no test, **still
gets a row**, with the gap named in the empty column. Leaving it out would make
this table answer "everything here is traced" by omitting everything that is
not.

| URS ID | URS Details | FRS ID | FRS Details | Test Case ID | Test Case Details |
| --- | --- | --- | --- | --- | --- |
| **URS-076** | **A date is a date, whoever is reading it** — The system shall present every date in one written form. The system shall store every date as a date rather than as the text of one. A form that renders a date in the reader’s own locale presents one record two ways to two people in one office, and a form that stores what was typed puts text in a date column — which nothing detects until the value is sorted, filtered or subtracted. _(Risk: Medium.)_ | **FRS-089** | FRS-089.1 The cover registers shall display every date value in the form dd-MMM-yyyy. FRS-089.2 The cover registers shall present a date input control when a date field receives focus. FRS-089.3 The cover registers shall store the value produced by that control. FRS-089.4 The cover registers shall derive no date value from text entered by the operator. RATIONALE: a native date control renders in the BROWSER’S locale and no attribute changes it — two machines in one office showed `2026-09-12` and `09/11/2026` for one field. The obvious alternative is the dangerous one: a text box holding `20-Apr-2026` saved as typed puts a formatted string in a date column, and nothing detects it until the value is sorted, filtered or subtracted. FRS-089.4 is therefore a prohibition rather than a convenience, and `check:ui` refuses a parser appearing in that component at all. | **OQ-77** | OQ · A date reads the same to everybody, and what is stored is a date. Expected: Every date reads dd-MMM-yyyy in both browsers. The field becomes a date picker on focus and reads the long form again afterwards. The stored value is an ISO date, not the text on screen. No parser exists in the component: the value that leaves it is the date control’s own, so a typed string cannot reach a date column however it is entered. |
| **URS-075** | **A request may be corrected until it has been answered** — The system shall allow a request for service to be corrected while it is awaiting a decision. The system shall prevent alteration of what a request asked for once a call has been raised from it. A request corrected after the call exists leaves two records of one event disagreeing about the customer, the machine or the fault, and the call is the record every count, report and review reads. _(Risk: Medium.)_ | **FRS-087** | FRS-087.1 The request register shall allow an operator holding call-creation rights, registration rights or authorship of the request to alter the customer, the machine, the fault, the engineer and the plan recorded on it. FRS-087.2 The request register shall refuse every such alteration to a request whose status is other than Pending. FRS-087.3 The database shall refuse every such alteration to a request whose status is other than Pending. FRS-087.4 The database shall name, in its refusal, each field it refused. FRS-087.5 The database shall permit alteration of the unique call number, the status, the actioning operator, the actioning time, the cancellation reason and the cancellation time in every status. FRS-087.6 The request register shall exclude the unique call number and the status from the fields an operator may alter. RATIONALE: FRS-087.3 repeats .2 in the DATABASE and is not redundant — `cr_update` lets the person who raised a request write their own row, so a control that lives only in the form is one a direct API call walks past. FRS-087.5 is what makes this a trigger rather than a policy: registering a request writes four of those columns and cancelling writes three, so a rule over the whole row would refuse the very actions that answer a request. | **OQ-75** | OQ · A request can be corrected until it becomes a call, and not after. Expected: The Pending request takes the correction. The other three are refused from the screen AND through the API, and the refusal names each field it refused rather than reporting a database internal. Registering and cancelling still work in every state — a rule over the whole row would have refused the actions that answer a request. Writing unchanged values back is not refused. Neither the call number nor the status is offered as an editable field. |
| **URS-074** | **A decision to supply rests on evidence that is retained** — The system shall record, for each customer, whether that customer has been verified. The system shall retain the records on which that verification rests. The system shall show both wherever the decision to supply is taken. A verification with no record behind it is an assertion, and the person relying on it downstream cannot check it. _(Risk: Medium.)_ | **FRS-090** | FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has. | **OQ-78** | OQ · A suggested figure can be overruled, and a customer’s address can be brought up to date. Expected: Six visits for 24 months, three for 12 — it follows the period while nothing has been typed. Once 4 is typed it stays 4 through both a start-date change and a period change, while the end date still moves. The contract behaves the same way at its own rate. The update names each field with its present and its proposed value and changes nothing until confirmed; selecting it again reports that nothing differs rather than listing eleven fields. On a customer the register does not hold, nothing is changed and the screen says why. |
|  |  | **FRS-088** | FRS-088.1 My Workload shall list the number of installation requests for which no call has been raised. FRS-088.2 My Workload shall state, of those, the number whose customer is verified. FRS-088.3 My Workload shall state, of those, the number whose customer is not verified. FRS-088.4 My Workload shall state, of those, the number whose customer is absent from the customer register. FRS-088.5 My Workload shall open the request register filtered to the stated subset when the operator selects a count. FRS-088.6 The request register shall display the verification status of the customer named by each request. RATIONALE: FRS-088.4 is separate from FRS-088.3 because the two need opposite actions — a customer who is absent is added, a customer who is present is verified — and a figure that merges them sends somebody to verify a customer who does not exist. The section is offered to every operator who may open the request register rather than to one department, because a count over a list the reader may not open is both useless and a disclosure of its size. | **OQ-76** | OQ · Commercial can see what is waiting and which of it can proceed. Expected: The registered one is not counted — it is a call now. The three counts separate verified, unverified and absent-from-the-master, and the absent one is NOT counted as unverified: it needs a different fix. Each count opens the register on exactly that subset, with the customer’s KYC on every row. The section does not appear at all for a role that cannot open the register, and no count is fetched for them. |
|  |  | **FRS-086** | FRS-086.1 The customer register shall attach a document to a customer and shall record its name, its location, the operator who attached it and the time. FRS-086.2 The customer register shall display the verification status of each customer in its list. FRS-086.3 The customer register shall display a link to each attached record in that list. FRS-086.4 The system shall treat a customer as verified on the recorded status alone. FRS-086.5 The system shall treat no customer as verified by the presence of an attached record. FRS-086.6 The customer register shall state, for a verified customer with no attached record, that the record is absent. FRS-086.7 The customer register shall retain a removed record in the document store. RATIONALE: .4 and .5 are the two halves of one asymmetry. The status is a DECISION a person made, and withholding it because the paperwork was filed elsewhere would make the system stricter than the people it serves; attaching a file is not a decision, so it can never make a customer verified. .7 because a KYC record somebody relied on is worth keeping wherever it sits. | **OQ-74** | OQ · A verification is supported by a record, and neither implies the other. Expected: The record carries its name, its link, the operator and the time. The list shows the status and links to each record without opening anything. The verified customer with no record reads Verified AND says the record is absent — the status is a decision and is not withdrawn for want of paperwork. The Pending customer with two records is still Pending: attaching a file is not a decision. A removed record leaves the file in Drive. An attachment survives Cancel, because it is written when it uploads — otherwise the file sits in Drive attached to nothing. |
| **URS-073** | **Work that follows from a sale is raised from the sale** — The system shall raise the installation work for a sold machine from the record of its sale. The system shall carry the customer and the machine from that record to the work raised. Re-keying the customer, the model or the serial into a second form is where the two records stop describing the same machine, and nothing afterwards can tell which of them is right. _(Risk: Medium.)_ | **FRS-085** | FRS-085.1 The warranty register shall raise one installation call for each machine on a sale entry that has no installation call. FRS-085.2 Each such call shall carry the customer, the city and the state recorded on the sale entry. FRS-085.3 Each such call shall carry the model and the serial recorded on the machine. FRS-085.4 Each such call shall record the standard complaint and the reported complaint as "Installation Calls". FRS-085.5 Each such call shall record No against the public health threat, the death and the serious incident questions. FRS-085.6 Each such call shall record no customer contact. FRS-085.7 Each such call shall carry the warranty number, the warranty start and the warranty end of the sale entry where the sale entry records a warranty. FRS-085.8 Each such call shall record no cover where the sale entry records no warranty. FRS-085.9 The warranty register shall record the unique call number of each raised call against the machine it was raised for. FRS-085.10 The warranty register shall raise no call for a machine whose model or serial is absent. FRS-085.11 The warranty register shall stop, and shall name the machine, where a raised call cannot be recorded against it. RATIONALE: .5 states the honest answer for a machine that has not been switched on, and the answers stay editable on the call afterwards — an installation that does go wrong is answered by a person. .6 because those fields record who REPORTED a fault and nobody reported this. .8 because an unknown cover gets asked about and a wrong one gets believed. .11 because the two writes are not one transaction: continuing would leave a call nothing points at, hidden among the successes, and the machine would be offered a second call. | **OQ-73** | OQ · An entry moves every machine under it, and raises the work that follows from it. Expected: It states how many values DIFFER from the entry separately from how many repeat it, names every field and its machine count, and only then clears them. All three machines then follow the entry; none has lost its product, serial or supplied-with answers. With nothing pinned the action is not offered. Three machines become two calls — the one with no serial is not a machine yet. Each call carries the entry’s customer and the machine’s model and serial, reads "Installation Calls" in both complaint columns, answers No to all three vigilance questions, records no customer contact, and carries the sale’s warranty as WGP. Each machine shows its call number and the button is gone. From a sale with no warranty the cover is blank, not guessed. |
| **URS-072** | **The terms of a parent record reach every record under it** — The system shall apply the terms recorded on a parent record to every record under it that states no term of its own. The system shall allow a record under a parent to state a term of its own. The system shall provide a means of returning every record under a parent to the parent’s terms. The system shall state what such a return will discard before it discards it. A bulk load that copies a parent’s values onto every child leaves every child stating terms of its own, so the parent moves nothing and nobody can see why. _(Risk: Medium.)_ | **FRS-090** | FRS-090.1 The cover registers shall calculate a PM visit count from the recorded period. FRS-090.2 The cover registers shall accept a PM visit count entered by the operator. FRS-090.3 The cover registers shall retain an entered PM visit count when the period or the start date is subsequently changed. FRS-090.4 The warranty register shall re-read the address, the contact details and the tax registrations of the named customer from the customer register when the operator requests it. FRS-090.5 The warranty register shall state each field that request would change, with its present and its proposed value, before changing any. FRS-090.6 The warranty register shall change no field where the customer register holds no such customer. RATIONALE: .1 and .3 together are the requirement — three visits a year is the standard OFFER and what was sold is on the purchase order, so a count that keeps reverting to the offer whenever a start date is corrected is a field somebody re-types until they give up, and one that never follows the period makes every ordinary sale a manual entry. The test for "has it been changed" is whether it still equals what the period suggested BEFORE the edit, which is the same rule a machine uses to pin a field away from its entry. .5 because the installation address on a sale legitimately differs from the registered one: a sale whose address changed silently under an operator who had corrected it by hand is worse than one that is visibly out of date, because the first is wrong and nobody knows. .6 because blanking a sale on the ground that the customer register has never heard of the customer would destroy the only address anybody has. | **OQ-78** | OQ · A suggested figure can be overruled, and a customer’s address can be brought up to date. Expected: Six visits for 24 months, three for 12 — it follows the period while nothing has been typed. Once 4 is typed it stays 4 through both a start-date change and a period change, while the end date still moves. The contract behaves the same way at its own rate. The update names each field with its present and its proposed value and changes nothing until confirmed; selecting it again reports that nothing differs rather than listing eleven fields. On a customer the register does not hold, nothing is changed and the screen says why. |
|  |  | **FRS-084** | FRS-084.1 The cover registers shall clear every inheriting field on every machine under an entry when the operator requests it. FRS-084.2 The cover registers shall alter no field that the register does not declare as inheriting. FRS-084.3 The cover registers shall state the number of values that differ from the entry before clearing them. FRS-084.4 The cover registers shall state separately the number of values that repeat the entry. FRS-084.5 The cover registers shall name each field it is about to clear and the number of machines carrying it. FRS-084.6 The cover registers shall offer this action only while at least one value is pinned. FRS-084.7 The cover registers shall clear every machine under one entry in one statement. RATIONALE: .2 because the model, the serial and the machine’s own supplied-with answers are the MACHINE’S facts and clearing them would delete its identity. .3 and .4 are separate because the two are not the same act: clearing a value that repeats the entry changes nothing anybody can see, and clearing one that differs destroys a decision made about one machine, with no undo. .7 because a forty-machine sale would otherwise be forty round trips, any of which can fail half way and leave the entry half-inherited — the state this action exists to resolve. | **OQ-73** | OQ · An entry moves every machine under it, and raises the work that follows from it. Expected: It states how many values DIFFER from the entry separately from how many repeat it, names every field and its machine count, and only then clears them. All three machines then follow the entry; none has lost its product, serial or supplied-with answers. With nothing pinned the action is not offered. Three machines become two calls — the one with no serial is not a machine yet. Each call carries the entry’s customer and the machine’s model and serial, reads "Installation Calls" in both complaint columns, answers No to all three vigilance questions, records no customer contact, and carries the sale’s warranty as WGP. Each machine shows its call number and the button is gone. From a sale with no warranty the cover is blank, not guessed. |
| **URS-071** | **Two records of one visit shall not contradict each other** — Where the system holds a customer’s feedback about a visit, it shall also hold a completed service report for that visit, and every instance where it does not shall be visible as a list naming which record is absent. Feedback is collected after a visit has taken place, so its existence is evidence that the work occurred; the completed report is the record of what was done. The two disagreeing means a device was serviced and the servicing was never written up — a gap that is invisible from either record read on its own, because neither record is wrong in itself. _(Risk: Medium.)_ | **FRS-083** | `feedback_without_report` (0229) lists every customer feedback with no visit reading “Solved - Report Completed” behind it, and names WHICH of four things is absent, because each needs a different fix: the feedback records no UCN; no call carries that UCN; the call has no visit at all; or the call has visits and none of them is the completed one. The last is the commonest, and the row carries `latest_visit_status` beside it so that “Solved - Report Pending” — the system stating a known absence — is distinguishable from “Unsolved”, which is a different problem. THE STATUS IS MATCHED ON ITS LETTERS AND DIGITS, not as a string: `is_report_completed()` reduces to lower-case alphanumerics, so a trailing space, a lower-case spelling and an en-dash all read as completed, and `isCompletedVisit()` in src/lib/reportMapping.ts is the client copy of the same rule. That is not defensive coding — the export this was written for carried “Solved - Report Completed ” with a trailing space in all 378 rows, and a string comparison would have reported every one of those calls as missing its report. ANY visit reading completed is enough rather than the latest one: a call written up and then re-visited still has its report. A false entry here sends somebody to re-file a report that exists, which is wasted work and teaches them the list may mean nothing — the same argument as a `_status.sql` row that answers NO for nothing — so both rules are tested with the spellings that actually arrive. The view is `security_invoker`, so the ordinary call and feedback policies decide the rows; the SCREEN is restricted to administrators by `mod:/feedback-without-report`, at the user’s direction (2026-09-22). | **OQ-72** | OQ · Feedback with no completed report behind it is listed, and feedback WITH one is not. Expected: The first is NOT listed — a trailing space is not a missing report, and a string comparison would list it. The second is listed as "a visit exists but none reads Solved - Report Completed", with "Solved - Report Pending" beside it. The third is "no visit at all", the fourth "no call with that UCN", the fifth "the feedback records no UCN". The sixth is NOT listed: a re-visit does not undo a report. The seventh is not listed at all — no feedback, nothing to reconcile. The screen does not appear in the menu for a non-administrator and the route refuses. |
| **URS-065** | **A recovered quality record is reviewed before it is written** — Where records of work already done are recovered from a superseded system, each shall be resolved to the record it belongs to AND SHOWN TO AN OPERATOR BEFORE ANY OF IT IS WRITTEN, and only rows that resolved cleanly shall be written. A visit attached to the wrong call, or carrying another machine’s photograph, is a worse outcome than a visit still missing: the first is a false record of what was done to a device, the second is a gap that is visible as a gap. Rows that did not resolve shall be reported with the reason and left unwritten rather than written with a guess. _(Risk: High.)_ | **FRS-077** | The screen runs in three stated steps and in this order: READ the sheet and work out which call each row belongs to; RESOLVE the superseded system’s file references into links; WRITE only the rows that came through both cleanly. Nothing is written until the operator has SEEN what each row resolved to, and rows that did not resolve are listed with the reason and are not written. The register it writes into is the visit history, whose records are never deleted, so a wrong write cannot be taken back — which is why the review is a step rather than a confirmation dialogue. | **OQ-58** | OQ · Nothing is written from a recovered file until the operator has seen what each row resolved to, and only clean rows are written. Expected: After steps 1 and 2 the visit history is UNCHANGED — nothing is written by reading or resolving. Every row is shown with what it resolved to before any write is offered. After step 3 only the rows that resolved on both counts are present; the unmatched UCN and the unresolved reference are reported with their reasons and are NOT written. The second write adds nothing (the register is keyed), so a re-run corrects rather than duplicates. |
| **URS-066** | **A request awaiting registration is visible and is dispositioned** — A request for service that has not yet become a call shall be visible as such, and shall reach one of a stated set of outcomes — registered as a new call, mapped to an existing call, or cancelled with a reason. It shall not be possible for a request to be silently dropped or to remain in no state at all, a request nobody can see being indistinguishable from a request nobody made. _(Risk: Medium.)_ | **FRS-078** | Pending Registrations lists requests carrying no UC Number. Opening one offers exactly three outcomes — register it as a new call, map it to an existing call (its UCN is recorded against the request), or cancel it with a reason — and the request’s status records which. IT READS `call_requests`, NOT the sheet-era `pending_registrations` table: two corrections were aimed at the wrong table before that surfaced, and the distinction is recorded in the codebase notes as well as here. | **OQ-59** | OQ · Every pending request leaves the queue by one of three stated routes, and none can be lost. Expected: All three leave the queue. The first carries the new call’s UCN and status Registered; the second carries the existing UCN and status Mapped; the third carries status Cancelled AND the reason given. None is in no state at all. The screen’s rows come from `call_requests`; the sheet-era `pending_registrations` table is not what it reads. |
| **URS-067** | **Authority over a quality record is held section by section** — The authority to amend a call in progress shall be grantable SEPARATELY for each part of the record whose amendment means a different thing: the complaint as reported, the customer and device it names, the vigilance answers, and the customer’s contact details. Re-allocating a call to another engineer, and cancelling or restoring one, shall each be their own authority. A single “edit” right cannot express the distinction the record requires — correcting a telephone number and re-answering whether a patient was harmed are not the same act — and each shall be attributable to the person who performed it. _(Risk: High.)_ | **FRS-079** | `calls.edit.complaint`, `calls.edit.customer`, `calls.edit.vigilance` and `calls.edit.contact` each gate one part of the record and are granted independently; `calls.allot` gates re-allocation to another engineer and `calls.cancel` gates cancelling and restoring a call. `calls.edit` remains the parent, so a role holding it holds the four sections — `parentAction()` resolves a section key to it — and a role may instead be given one section alone. `cover.edit` is the equivalent authority over the warranty and contract registers, and `admin.view` opens the administration pages READ-ONLY, so somebody may inspect configuration without the right to change users. | **OQ-60** | OQ · Each part of a call in progress is amendable only by a role granted that part, and each amendment names who made it. Expected: The contact-only role amends the telephone number and is refused the other three sections, the re-allocation and the cancellation. The parent role performs all four sections, `parentAction()` resolving each section key to `calls.edit`. The allot-only role re-allocates and amends nothing. The `admin.view` role reads the administration page and cannot change it. Every successful amendment is attributable to the person who made it, and every refusal names the authority that was missing rather than failing silently. |
| **URS-064** | **A credential cannot be recovered from a log** — No log, error message or build record the system produces shall contain any part of a credential. Where a credential is malformed such that a subsystem would report a fragment of it, the operation shall be REFUSED before that subsystem is reached, and the refusal shall say what to correct without reproducing any part of the value. Masking the credential is not by itself sufficient: a subsystem reports the piece it failed on, which may be a fragment matching neither the credential nor the string containing it. _(Risk: High.)_ | **FRS-076** | The database URL is passed to psql through the environment, never on a command line, and psql’s output is masked before it is logged. THAT WAS NOT SUFFICIENT, and a real run proved it twice. Node’s URL parser splits credentials at the LAST “@” and libpq at the FIRST, so a password containing an unencoded “@” makes libpq report a HOST built from a SUFFIX of the password — a string matching neither the password nor the URL, which no exact-value mask can catch. It reached a public build log while the platform’s own masking displayed the secret as masked throughout. scripts/apply-migrations.mjs now REFUSES before psql is invoked when the URL carries more than one “@”, names the correction and prints no part of the value: nothing can leak from a call that is not made. Every tail of the password of three characters or more is additionally masked, for any other tool reporting the same shape. The exposure already made is not undone by this and is recorded as requiring the credential to be rotated. | **OQ-57** | OQ · A malformed database credential is refused before any part of it can be reported. Expected: The run is refused before the database client is invoked, and says the “@” must be percent-encoded, naming the other characters that need it. NO PART of the password, the user name or the URL appears anywhere in the output. With the credential correctly encoded the run proceeds, showing the refusal tests the malformation and not the presence of a password. |
| **URS-063** | **A read-only role holds no authority to write, and a derived role does not track its source** — Where a role is described as read-only it shall hold no permission that any write policy names, so that a refusal is the database’s and not a hidden control. Where a role is created by COPYING another, the copy shall be a one-time act and the two shall not thereafter be kept in step, so that granting an authority on one role cannot confer it on another. A periodic report shall state the write authority each such role holds; it shall present that as a matter for review rather than as a defect, because a grant may be deliberate and no re-application of configuration can remove one. _(Risk: High.)_ | **FRS-075** | 0180 removes `review.edit` from the Zoho Migration role. It had arrived by copying: 0155 merged the Technical Support permission row into Zoho Migration on EVERY application of the RBAC bundle, so an authority granted deliberately on one role crossed to another silently. What it conferred was established against a database rather than read from the policy — `review.edit` grants ALL commands on `call_reviews`, and a user holding it answered a review, fired the trigger and raised a field failure report in their own name, a record the retention guard means can never be deleted. 0155 now SEEDS the role once and leaves it alone: two roles kept identical are one role with two names, and a separate role exists in order to diverge and be revoked without touching the other. The Technical Support grant is RETAINED, being the system owner’s decision. The status report tests only what the configuration bundle provides; the write authority each read-only role holds is reported by a diagnostic as a question for review, because a status row that reads NO on a deliberate grant sends somebody to re-apply configuration that cannot remove it. | **OQ-56** | OQ · A read-only role holds no authority to write, and an authority granted on one role does not cross to a role copied from it. Expected: The diagnostic names each role and each write authority it holds, and states that a grant is a matter for review rather than a missing configuration. The authority granted on the source role is NOT present on the role copied from it. The status report does not report a failure on account of a deliberate grant — a report that cannot be cleared by the action it recommends is worse than none. |
| **URS-062** | **A loaded register can be corrected by loading it again** — Every register that may be populated from a file shall have a natural key drawn from the file itself, so that re-loading a corrected export UPDATES the records it names rather than adding them a second time. The key shall be one the data interface can infer, and its sufficiency shall be verified against a database rather than by inspection. A row not carrying the key shall be refused and the reason given, a row that cannot be matched on a re-run being one that arrives again on every load. _(Risk: Medium.)_ | **FRS-074** | Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first. | **OQ-54** | OQ · Two devices sharing a serial number remain two records, and re-loading a corrected file corrects rather than duplicates. Expected: Both devices are present as SEPARATE records — the second has not replaced the first. The second load leaves the count unchanged and the corrected field updated. The same product and serial a second time is REFUSED. A row lacking the key is not loaded and the reason is stated on screen. |
| **URS-061** | **A value that cannot be determined is recorded as unknown** — Where the system completes a value the record did not supply and the source cannot answer, the field shall be left EMPTY and the record retained. It shall not be filled with a value that is available but untrue, and the record shall not be discarded for want of it. What is known — that this happened, to this device, on this date, under this paperwork — is the record; the part that is unknown is one field. _(Risk: High.)_ | **FRS-073** | 0072 completed a blank “from” party from the machine master — correct while the master still names the PREVIOUS owner, and wrong once it has caught up, because the completion then returns the DESTINATION and the two are identical. The constraint refusing a transfer between one party and itself rejected the row, and one such row halted an entire file: 2,985 of 4,327 on the first real export, whose own “from” column carries the same defect. 0182 and 0183 make the completion conditional and discard a supplied value equal to the destination; where the predecessor cannot be determined the field is left EMPTY and the hand-over is recorded with what is known. The constraint is retained and is now unreachable through the trigger: the invariant remains declared and nothing can write a row breaking it — what was wrong was manufacturing a value that violated it. | **OQ-55** | OQ · A hand-over is recorded when the previous owner cannot be determined, and no untrue value is written. Expected: The first hand-over is RECORDED, with the previous owner EMPTY — not filled with the destination, and not refused. The second records the previous owner from the master, showing the completion still operates where the source can answer. The constraint refusing a transfer between one party and itself is still declared. |
| **URS-060** | **A record is keyed on what identifies it** — The key of a quality or servicing record shall be the whole of what identifies it. Where a record concerns a DEVICE, the device is its model together with its serial number, serial numbers being repeated across models. Where one document concerns SEVERAL devices, each device shall hold its own record under that document’s number. A key narrower than the identity does not fail loudly — it silently replaces one record with another — so the sufficiency of such a key shall be established by MEASUREMENT against the data to be loaded, before that data is loaded. _(Risk: High.)_ | **FRS-072** | Three registers were keyed on less than their identity, and each was corrected against MEASURED data rather than argument. The field failure register was keyed on the report number alone (0181): eight numbers in the 2016–2019 registers each cover several machines — one covers four — so 20 rows collapsed to 8 and TWELVE machines were lost on a load reporting success. Recovered warranty entries were keyed on the serial alone (0185): of 2,263 rows, 298 serials belong to more than one product — one serial is both an ANAVENT and an ORION, another is four machines — so 640 rows collapsed to 298 and THREE HUNDRED AND FORTY-TWO machines were lost. Ownership transfers carried no key at all (0184). Each key is now the pair, held as a GENERATED STORED column with a plain unique index. The rule was already stated in the codebase (src/lib/machine.ts) together with the incident that produced it — a request for one model’s serial 201 was offered an open call for another model’s serial 201, one action from being mapped onto it — and these three registers contradicted it. | **OQ-54** | OQ · Two devices sharing a serial number remain two records, and re-loading a corrected file corrects rather than duplicates. Expected: Both devices are present as SEPARATE records — the second has not replaced the first. The second load leaves the count unchanged and the corrected field updated. The same product and serial a second time is REFUSED. A row lacking the key is not loaded and the reason is stated on screen. |
| **URS-053** | **A service record identifies the individual device** — Every service call shall identify the single machine it concerns by its serial number, from the request onward. A record that names a product but not a unit cannot be traced to the device serviced, and its cover, warranty and contract cannot be established. _(Risk: High.)_ | **FRS-061** | The serial number is a required field on the call request and on the Field, Installation, PM and pending-registration call forms. The request refuses an item without one, and names the cause where the machine is absent from Product Database rather than inviting the field to be skipped. The request identifier is composed REQID-Product-Serial, so a missing serial is visible in the key itself. | **OQ-47** | OQ · A call cannot be raised without identifying the individual machine. Expected: Submission is refused in every case where the serial is absent, naming the serial. Where the machine is not on Product Database the message says so rather than inviting the field to be skipped. A submitted request carries REQID-Product-Serial. The call form refuses to save without a serial. |
| **URS-054** | **Consumption recorded against a call is complete** — Every part fitted during a visit shall be recorded against that call. Recording shall not depend on a further confirming action by the engineer once the part has been entered, and where no part was used that shall be a STATED answer rather than an unanswered field. _(Risk: High.)_ | **FRS-062** | The visit report writes every consumption line the engineer has entered, including the line still in the entry control at the moment of saving; the same validation applies to it as to a line already added. “Add Consumption?” offers Yes or None Consumed: Yes requires at least one line before the report will save, and None Consumed withdraws the section. Lines are written in one statement, so a report cannot keep some of its spares and drop the rest. | **OQ-48** | OQ · Every part entered on a visit is recorded, and the absence of parts is a stated answer. Expected: The part entered without pressing Add is recorded against the call. Yes with nothing entered is refused, naming the two ways out. None Consumed saves with no consumption and the spare section is withdrawn. A quantity above hand stock stops the save with the balance stated — it is not silently dropped or trimmed. |
| **URS-055** | **The report on a closed call is reviewed** — A closed call’s service report shall be subject to review by a competent person other than routine daily coding of the failure, with the reviewer and the time recorded. The reviewer shall be able to return the call to open where the report does not close it, and to correct consumption where a part was fitted and not booked. _(Risk: Medium.)_ | **FRS-063** | A register (call_report_reviews, one row per call) records that a closed call’s report has been reviewed, with the reviewer taken from the authenticated session and a caller-supplied identity discarded. Writing requires the callreview.mark permission and visibility of the call; reading follows the call’s own visibility. The register lists solved calls only — a report-pending call has no report to review — filtered in the database. | **OQ-49** | OQ · A closed call’s report can be reviewed, corrected and re-opened, by an authorised person only. Expected: Only solved calls are listed. The reconciliation within stock is booked against the attending engineer and appears in the spares list; the one above stock is refused with the balance stated. The review records the reviewer from the authenticated session and the time. A re-opened call leaves the register. The role without the permission can read but is offered no review action, and the direct insert is refused by the database. |
|  |  | **FRS-064** | From the review the reviewer may book a Reconciliation consumption line against the call, off the ATTENDING engineer’s hand stock and capped at what that engineer holds by the same database trigger as any other consumption; or re-open the call with a recorded reason, after which it leaves the review list. Consumption shown for a call is matched on the call number OR the unique call number, so a call predating the call-number series still shows its parts. | **OQ-49** | OQ · A closed call’s report can be reviewed, corrected and re-opened, by an authorised person only. Expected: Only solved calls are listed. The reconciliation within stock is booked against the attending engineer and appears in the spares list; the one above stock is refused with the balance stated. The review records the reviewer from the authenticated session and the time. A re-opened call leaves the register. The role without the permission can read but is offered no review action, and the direct insert is refused by the database. |
| **URS-058** | **A judgement on a quality record names the person who made it** — Where the system records a judgement about a product failure, it shall record WHO made that judgement, taken from the authenticated session at the moment the judgement is completed and not from a value supplied by the caller. The identity shall not be displaced by later editing of the same record, and where the judgement is carried onto a further record the person shall be carried with it. No record shall attribute a judgement to a screen, a process or the system itself. _(Risk: High.)_ | **FRS-069** | A BEFORE trigger on `call_reviews` (0173) records `review2_by_uid` / `review3_by_uid` from auth.uid() at the moment a review stage becomes COMPLETE, and fills the display name from User Master where the client sent none — so the automatic-save and bulk-review paths, which send no name, record a person instead of nothing. A name the client did send is kept: it is what the reviewer saw on screen. A later edit does NOT re-stamp: the person who answered the review is the reviewer, not whoever last corrected a spelling. The trigger evaluates the completion test from the source columns rather than reading `review2_done`, because PostgreSQL computes a GENERATED column AFTER the BEFORE triggers have run — the first version read it, stamped nothing on every path, and was caught only by exercising it against a database. The duplicated expression is compared word-for-word with its original by an automated check. raise_ffr() carries the name onto the Field Failure Report, preferring Review 3’s reviewer, and no longer writes the string “Daily Call Review” — a screen is not a person, and a report that cannot name one is left blank, blank being a question somebody asks. | **OQ-52** | OQ · A completed review names the person who completed it, on every path. Expected: The auto-saved review records A — both the identity and the name — although the screen sent no name. B’s later edit leaves both unchanged. The report names A. The report raised where Review 3 is complete names C, Review 3’s reviewer being preferred. No report anywhere names a screen. |
| **URS-059** | **Every change to a field failure report is recorded** — Each amendment to a field failure report shall be recorded with what changed — the previous and the new value of each field — together with who changed it and when. The record of amendments shall be produced by the system itself rather than by the application requesting it, shall not be alterable or removable through the application, and shall begin at the creation of the report. _(Risk: High.)_ | **FRS-070** | `ffr_history` (0174) receives one row per UPDATE of a field failure report, written by an AFTER trigger, holding `{column: {from, to}}` for only the columns that actually differ, with the person from auth.uid() and their User Master name. An update that changes nothing writes nothing, and `updated_at` is never an entry on its own — a log whose every line says the timestamp moved buries the one that says the CAPA was closed. It is written IN THE DATABASE rather than by the application because the application’s own audit trail is client-written (FRS-021) and therefore records only what a screen chose to report, seeing nothing of an amendment made directly through the API. The table has no insert, update or delete policy, so it cannot be forged, edited or tidied through the application, and 0166’s deletion guard is armed on it; reading it requires `ffr.manage` or administrator. Reports raised before it existed are given their creation entry, so every report’s history begins somewhere. | **OQ-53** | OQ · Every amendment to a field failure report is recorded, and the record cannot be altered. Expected: The log begins with the report’s creation. The two-field change adds ONE entry naming the person, holding both fields with their previous and new values and nothing else — no timestamp-only entry. The unchanged save adds nothing. The API amendment is logged exactly as the screen’s was. The administrator’s update affects no row and the delete is refused; the entries are unchanged. The engineer reads no rows. |
| **URS-057** | **A person’s signature is applied by that person alone** — A user shall be able to record their own handwritten signature and have it reproduced on the documents that name them as signatory. The recorded signature shall be readable and writable only by the person it belongs to — by no manager, and by no administrator — and shall be reproduced on a document only where the signature block names the person producing it; in every other case the block shall be produced blank for signature by hand. Removal of a signature belonging to a person who has left shall be an authorised act which does not disclose the signature. _(Risk: High.)_ | **FRS-066** | A user records a signature on My Profile, drawn with a finger, stylus or mouse or uploaded as a picture of one on paper; it is stored as a transparent PNG cropped to the ink (0172_user_signatures.sql). It is held in its own table rather than on the profile, because Row-Level Security grants by ROW: a policy permitting a person to save a signature on their profile row would permit them to rewrite the role and permissions on it. The read and update policies test `user_id = auth.uid()` and NOTHING ELSE — no is_admin(), no users.manage — so no second party can obtain the image, and none can set one. The owning user id is stamped from the session by trigger, so a row naming another user is stored under the inserter. | **OQ-51** | OQ · A signature is held for, and applied by, its owner alone. Expected: B and the administrator each receive NO ROW — not a redacted one. B’s update affects nothing and A’s signature is unchanged; B’s insert is stored under B, leaving A’s untouched. The status function returns whether and when, and no image. A’s challan carries A’s signature in the company block and an empty customer block; B’s printing of the same challan carries an empty company block. Both Word documents open without repair; A’s shows the signature, B’s an empty block. The administrator’s removal succeeds and returns only whether there was one; B’s is refused. |
|  |  | **FRS-067** | signatureBelongsTo() compares the name printed in the block with the identity of the signed-in user, on an EXACT match of name or e-mail ignoring case and surrounding space; a looser comparison would put one person’s signature on another’s document where names share a part. The Word copy of the Field Failure Report reproduces the CONTROLLED FORM itself — R-SER-03 Rev 02’s header band, two-column grid at the template’s own 6435/4500 split, every label with its exact wording and internal spacing, its A4 page setup and its footer carrying `TMPL No: R/SER/03 Rev: MAR 2020` — and a printable HTML page renders the SAME form from the same definition (src/lib/ffrform.ts), so a second transcription cannot drift from the first. The Delivery Challan reproduces the saved signature in the company block only when the person printing booked the stock out, and never in the customer’s block, which exists to be signed on receipt; the Field Failure Report (R-SER-03) embeds it only when the person generating the document is the raiser named on it. Where a signature is absent or unreadable the document is produced with an empty block, never with a broken image or a failure to produce it. | **OQ-51** | OQ · A signature is held for, and applied by, its owner alone. Expected: B and the administrator each receive NO ROW — not a redacted one. B’s update affects nothing and A’s signature is unchanged; B’s insert is stored under B, leaving A’s untouched. The status function returns whether and when, and no image. A’s challan carries A’s signature in the company block and an empty customer block; B’s printing of the same challan carries an empty company block. Both Word documents open without repair; A’s shows the signature, B’s an empty block. The administrator’s removal succeeds and returns only whether there was one; B’s is refused. |
|  |  | **FRS-068** | user_signature_status() reports, per user, WHETHER a signature has been saved and when — never the image. remove_user_signature() deletes one belonging to another person and is refused to a non-administrator and for the caller’s own row (which the Profile page removes). Both are SECURITY DEFINER functions, not views: a definer view over Row-Level-Security-protected tables reads as its owner and defeats the policies beneath it, which this system shipped three times, and the automated check that now refuses such a view is not weakened to admit these. A plain DELETE policy admitting an administrator was written first and does not work: PostgreSQL applies the SELECT policy to a DELETE that must locate its row, so an administrator unable to read the row reported a successful statement affecting nothing. | **OQ-51** | OQ · A signature is held for, and applied by, its owner alone. Expected: B and the administrator each receive NO ROW — not a redacted one. B’s update affects nothing and A’s signature is unchanged; B’s insert is stored under B, leaving A’s untouched. The status function returns whether and when, and no image. A’s challan carries A’s signature in the company block and an empty customer block; B’s printing of the same challan carries an empty company block. Both Word documents open without repair; A’s shows the signature, B’s an empty block. The administrator’s removal succeeds and returns only whether there was one; B’s is refused. |
| **URS-056** | **An access role always has a defined permission set** — A role by which access is granted shall never exist without an explicit set of permissions. Where a role is added by configuration it shall be derived from an existing role, so that no role can be brought into use whose effective authority is implied rather than stated. _(Risk: High.)_ | **FRS-065** | Roles may be added from Roles & Permissions by a holder of rbac.manage. The form requires a source role and copies its permissions; a role cannot be created with an empty set, because has_perm() treats an empty permission array as unconfigured and falls back to the engineer defaults — an “empty” role would therefore grant an engineer’s authority. The key is derived as a slug from the name and cannot collide with an existing or reserved key. Roles are not deleted from this screen; a role in use is emptied or its users moved. Every role the database holds is drawn in the matrix and offered wherever a role is chosen. | **OQ-50** | OQ · A role cannot be brought into use without an explicit permission set. Expected: Creation is refused without a source, with the reason stated. The created role holds exactly the source’s permissions. A duplicate or reserved key is refused. The role is drawn in the matrix and offered by every role picker, and permission changes to it take effect. No delete is offered. |
| **URS-001** | **Authenticated access** — Only authenticated, authorised personnel shall access the system, each with a unique user identity. _(Risk: High.)_ | **FRS-001** | The system authenticates users against Supabase Auth (email + password); first sign-in forces a password set; sessions are token-based and expire. | **OQ-01** | OQ · Authentication and account lifecycle. Expected: Invalid rejected; valid succeeds; first-sign-in forces password; inactive login is blocked. |
|  |  | **FRS-002** | Administrators create logins from User Master; a leaver’s login can be set inactive, blocking sign-in and hydration while retaining their historical records. | **OQ-01** | OQ · Authentication and account lifecycle. Expected: Invalid rejected; valid succeeds; first-sign-in forces password; inactive login is blocked. |
|  |  | **FRS-051** | Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it. | **OQ-37** | OQ · A call says whose desk it is on AND who registered it, and neither can be forged. Expected: The Hotline engineer’s own call shows her on both. The stand-in’s call shows the Hotline desk and the stand-in — that pair is the finding. A supplied individual is discarded and the signed-in user recorded instead; a supplied desk that is not a Hotline desk is replaced by the configured default. The stand-in can still read the call she registered. The grouping lists every call registered by anyone other than the Hotline engineer. A bulk-loaded call shows both as not recorded, rather than naming anybody. |
| **URS-002** | **Role-based visibility** — A user shall see and act on only the records their role permits: an engineer their own calls, a manager their reporting team, office/administration roles as defined. _(Risk: High.)_ | **FRS-003** | Each role maps to a permission set (app_roles). Data visibility is scoped by a reporting tree resolved from User Master; enforced in the client and, authoritatively, by PostgreSQL Row-Level Security. | **IQ-02** | IQ · Confirm RLS is enabled on record tables and configuration is loaded. Expected: RLS is enabled on all record tables; roles and SLA rules present. |
|  |  |  |  | **OQ-02** | OQ · Role scoping is enforced server-side. Expected: Engineer sees only own; peer record not returned even by direct query; manager sees team; office sees all. |
|  |  | **FRS-004** | Every read/write is governed by RLS policies keyed on the authenticated user (auth.uid()) and SECURITY DEFINER helper functions; the UI gate is secondary. | **IQ-02** | IQ · Confirm RLS is enabled on record tables and configuration is loaded. Expected: RLS is enabled on all record tables; roles and SLA rules present. |
|  |  |  |  | **OQ-02** | OQ · Role scoping is enforced server-side. Expected: Engineer sees only own; peer record not returned even by direct query; manager sees team; office sees all. |
|  |  | **FRS-014** | Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock. | **OQ-62** | OQ · An engineer sees the stock they hold and not another engineer’s. Expected: A sees A’s balance. B sees B’s and not A’s, on screen and through the API alike — the scope is in the policy, not in the query the screen happens to send. The Spare Coordinator sees both, that being the role that corrects stock. |
|  |  | **FRS-050** | Every view over a table carrying row-level security is created `security_invoker`, so the policies are evaluated for the READER. `create or replace view` does not carry the setting over, and a view running as its owner returns everything with no error and no warning. `npm run check:views` fails on any view over an RLS-protected table that lacks it, and `_status.sql` reports it on a live project; views intentionally readable by every signed-in user are enumerated with their reason. | **OQ-35** | OQ · A view does not defeat the policies beneath it. Expected: The counts agree: the view shows exactly what the table shows that user, and so does every view built on it. The check reports no view over an RLS-protected table lacking security_invoker, and any listed as open by design carries a stated reason. |
| **URS-003** | **Register a service call** — The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN). _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-01** | PQ · End-to-end field workflow by real users. Expected: The workflow completes; records are consistent, attributable and retrievable. |
|  |  | **FRS-005** | Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series). | **OQ-03** | OQ · UCN and Call Number assignment. Expected: Each gets a unique UCN (letter F/I/P) and a Call Number; no duplicates. |
|  |  | **FRS-006** | Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing. | **OQ-04** | OQ · Call-type routing and mis-file prevention. Expected: Each call lands in its typed table; the mis-typed direct insert is rejected by the CHECK constraint. |
| **URS-004** | **Record a visit / call report** — An engineer shall record each visit with call status, observations, work done and readings; the call status shall reflect the latest visit. _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-01** | PQ · End-to-end field workflow by real users. Expected: The workflow completes; records are consistent, attributable and retrievable. |
|  |  | **FRS-007** | A report row is written per visit; a trigger recomputes the call’s status from the latest ENTRY (Unattended → Unsolved → Report pending → Solved). A “Solved - Report Completed” call becomes read-only to non-admins. | **OQ-05** | OQ · Visit reporting drives call status; completed calls lock. Expected: Status follows the latest entry; a completed call is read-only to non-admins. |
| **URS-005** | **Preventive maintenance** — The company shall schedule and record preventive-maintenance (PM) visits, including bulk creation of the monthly PM batch by an administrator. _(Risk: Medium.)_ | **FRS-006** | Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing. | **OQ-04** | OQ · Call-type routing and mis-file prevention. Expected: Each call lands in its typed table; the mis-typed direct insert is rejected by the CHECK constraint. |
|  |  | **FRS-009** | An administrator uploads a CSV; rows are mapped, forced to PM type, previewed, then inserted in batches with UCN/Call Number assigned by the database. | **OQ-14** | OQ · PM bulk upload. Expected: Rows preview correctly; on import each becomes a PM call with UCN/Call Number; blanks skipped. |
| **URS-006** | **Installation control** — Creation of installation calls shall be restricted to the Commercial function; installation records shall capture the warranty start date. _(Risk: Medium.)_ | **FRS-006** | Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing. | **OQ-04** | OQ · Call-type routing and mis-file prevention. Expected: Each call lands in its typed table; the mis-typed direct insert is rejected by the CHECK constraint. |
|  |  | **FRS-008** | Insertion into installation_calls requires the install.create permission (Commercial, Hotline, admin); enforced by RLS. | **OQ-06** | OQ · Installation creation is Commercial-gated. Expected: Engineer is blocked (button hidden and DB rejects); Commercial succeeds into installation_calls. |
| **URS-007** | **Spare request & approval** — An engineer shall request spare parts against a call; the request shall follow a defined multi-stage approval chain, each stage authorised by the correct role. _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-01** | PQ · End-to-end field workflow by real users. Expected: The workflow completes; records are consistent, attributable and retrievable. |
|  |  | **FRS-010** | A spare request creates per-part lines; each advances RM → Commercial → NSM → Stores. A per-stage database guard blocks a stage change unless the actor holds that stage’s permission. | **OQ-07** | OQ · Spare approval authority and manager scoping. Expected: Unauthorised stage change is rejected; a manager sees only team spares and cannot approve their own. |
|  |  | **FRS-011** | A reporting manager sees and approves only their own team’s spare requests; their own request routes to their manager, not to themselves. | **OQ-07** | OQ · Spare approval authority and manager scoping. Expected: Unauthorised stage change is rejected; a manager sees only team spares and cannot approve their own. |
| **URS-008** | **Spare dispatch & receipt** — Stores shall dispatch approved spares and the requesting engineer shall acknowledge receipt; each step shall be recorded with actor and time. _(Risk: Medium.)_ | **FRS-012** | Stores dispatch generates a DC and stock-out; the engineer acknowledges receipt. Drop is available at any stage to Spare Coordinator / Hotline only. | **OQ-08** | OQ · Dispatch, receipt and stock guard. Expected: Dispatch creates a DC/stock-out; receipt recorded; the over-transfer is blocked. |
| **URS-009** | **Stock accuracy** — Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold. _(Risk: Medium.)_ | **FRS-013** | Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility. | **OQ-08** | OQ · Dispatch, receipt and stock guard. Expected: Dispatch creates a DC/stock-out; receipt recorded; the over-transfer is blocked. |
|  |  | **FRS-014** | Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock. | **OQ-62** | OQ · An engineer sees the stock they hold and not another engineer’s. Expected: A sees A’s balance. B sees B’s and not A’s, on screen and through the API alike — the scope is in the policy, not in the query the screen happens to send. The Spare Coordinator sees both, that being the role that corrects stock. |
| **URS-010** | **Master data** — Party, product, part and user master data, and configurable value lists, shall be maintained under control. _(Risk: Medium.)_ | **FRS-015** | Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted. | **OQ-26** | OQ · Master data is maintained under control. Expected: The unauthorised edits are refused by the database, not only hidden; the authorised edits succeed; a value in use is deactivated rather than deleted, so the records that carry it still read correctly; each edit appears in the audit trail with actor and time. |
| **URS-011** | **Warranty & contract cover** — Warranty and contract cover per machine shall be maintained and reflected on calls. _(Risk: Medium.)_ | **FRS-016** | Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned. | **OQ-27** | OQ · Warranty and contract cover reaches the machine and the call. Expected: Each machine inherits its parent record’s cover; the individually pinned value overrides the inherited one and is not overwritten by it; the call shows the cover in force for that machine. |
| **URS-012** | **Customer feedback** — Customer feedback captured on a call shall be recorded and retrievable per question. _(Risk: Low.)_ | **FRS-017** | Feedback answers are stored per question and surfaced as columns in the Customer Feedback view, scoped like calls. | **OQ-28** | OQ · Customer feedback is captured per question and scoped like the call. Expected: Every answer is retained against its own question and shown in its own column; the feedback is visible to exactly those who may see the call it belongs to. |
| **URS-013** | **Reports & analytics** — Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles. _(Risk: Medium.)_ |  | (tested against the user requirement itself) | **PQ-03** | PQ · Operational reporting & SLA in real use. Expected: Screens load within acceptable time; SLA and export behave per role. |
|  |  | **FRS-018** | Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data. | **OQ-10** | OQ · Export is authorisation-gated. Expected: Engineer export is blocked; authorised export succeeds. |
| **URS-014** | **SLA monitoring** — The company shall define service-level targets and the system shall highlight open calls that are due or breached. _(Risk: Medium.)_ |  | (tested against the user requirement itself) | **PQ-03** | PQ · Operational reporting & SLA in real use. Expected: Screens load within acceptable time; SLA and export behave per role. |
|  |  | **FRS-019** | Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached. | **OQ-11** | OQ · SLA evaluation and highlighting. Expected: The call is flagged due/breached against the configured rule. |
| **URS-015** | **Notifications** — An engineer shall be notified in-app when a call is allotted to them or a requested spare is dispatched. _(Risk: Low.)_ | **FRS-020** | Database triggers create a per-user notification when a call is allotted or a requested spare is dispatched; each user reads/marks only their own (RLS). | **OQ-12** | OQ · Notifications on allotment/dispatch. Expected: The engineer receives the corresponding notifications and only their own. |
| **URS-016** | **Audit trail** — The system shall keep a secure, attributable, time-stamped audit trail of key actions that users cannot alter. _(Risk: High.)_ | **FRS-021** | TWO TRAILS AGAIN, as of 0225 (2026-09-21). `audit_log` records what a USER DID — action, target, duration, outcome, actor and time — and its retention is configurable (app_settings.audit_retention_days, default ~10 years), with a daily digest built to archive the day off-database (supabase/functions/daily-digest) THAT HAS NEVER BEEN DEPLOYED — so no off-database archive exists today. Its LIMITS are stated rather than glossed: it is written by the CLIENT, so it can be bypassed by a direct API call, and it is purged when the retention window passes. THE SECOND TRAIL IS BACK ON. `record_audit` records what a ROW BECAME, before and after, in triggers that CANNOT BE BYPASSED and that nothing purges — stopped by 0112 on 2026-09-05 when it was thought to exist only for 21 CFR Part 11, and re-armed by 0225 at the user’s direction on 2026-09-21. The event that settled it was not a regulatory one: on 2026-09-20 a re-applied bundle set 4,222 calls back to Unattended, and NOTHING IN THE SYSTEM COULD SAY WHAT THEY HAD BEEN. A client-written trail cannot answer that, because the write did not come through the client. 0103’s shape is what was restored, not 0048’s: a BULK load is ONE attributable event rather than a row per record, so the trail stays about what people did. The table also still holds everything it captured 2026-08 to 2026-09-05; that gap, 05-Sep to 21-Sep, is real and is not recoverable. | **OQ-09** | OQ · Audit trail is complete and tamper-resistant. Expected: Both actions are logged with actor and time; non-admin cannot read/modify the trail. |
| **URS-017** | **Data integrity & retention** — Records shall be complete, accurate and retained and retrievable for the required retention period (ALCOA+). _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-02** | PQ · Record retention & recovery. Expected: Records are complete and retrievable; a restore reproduces the records. |
|  |  | **FRS-022** | Records are written to PostgreSQL with constraints; the publishable key is public by design and access is enforced by RLS; the service_role key is never shipped. | **OQ-61** | OQ · A record cannot be deleted through the application, and the amendment of one is recoverable. Expected: Every application deletion is refused by name, stating that the record is retained and naming the workflow to use instead. The amendment appears in `ffr_history` with both values, its author and its time. The voided consumption line is still present carrying its ORIGINAL quantity, reason and author, with quantity zero. The owner’s deletion succeeds — that is the archival exception — and takes the report’s history with it, which is why it is a controlled procedure and not an application action. |
| **URS-018** | **Availability & recovery** — The system and its records shall be backed up and recoverable. _(Risk: Medium.)_ |  | (tested against the user requirement itself) | **PQ-02** | PQ · Record retention & recovery. Expected: Records are complete and retrievable; a restore reproduces the records. |
|  |  | **FRS-023** | The Supabase project provides managed backups; restore is periodically verified per procedure. | **PQ-06** | PQ · The record can be restored from a backup, and the restoration is verified rather than assumed. Expected: Every register’s count matches. The sampled records are complete, including the amendment history. The policies are present in the restored database: data restored without its access rules is not a restoration of the record, because anyone reaching it would see everything. |
| **URS-019** | **Controlled change** — Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app. _(Risk: Medium.)_ | **FRS-024** | Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled. | **IQ-01** | IQ · Confirm the deployed version, build and environment. Expected: Version, build ID and environment match the release record; expected apply-bundles report as present. |
| **URS-020** | **Knowledge base** — The team shall maintain how-to guidance and field-solution knowledge within the system. _(Risk: Low.)_ | **FRS-025** | A how-to guide plus team field-solution articles (sanitised rich text) are available to all; author or admin edits. | **OQ-13** | OQ · Knowledge-base content is sanitised. Expected: The script/handler is stripped; benign formatting/images/tables are preserved. |
| **URS-021** | **Partial issue of spares** — Stores shall be able to issue fewer units of a spare than were requested when only part of the quantity is available, and the outstanding balance shall remain visible as still due. _(Risk: Medium.)_ |  | (tested against the user requirement itself) | **PQ-04** | PQ · The spare lifecycle works for the people who run it. Expected: Stores, engineers and the Spare Coordinator complete each task unaided; stock balances agree with physical stock at the end of the exercise; every correction is traceable to a person, a time and a reason. |
|  |  | **FRS-026** | A stock out records a quantity per requested line in spare_dispatch_lines; spare_request_lines.dispatched_qty accumulates it. The Stores queue shows the outstanding remainder and the line stays queued until fully issued. Issuing more than the remainder is rejected by dispatch_spare_lines(). | **OQ-18** | OQ · Partial issue and acknowledged receipt. Expected: The stock out and delivery challan show one unit; the line remains queued for the remaining unit; hand stock rises by one; the line stays at the Stores stage until fully issued and is marked Received only after the final acknowledgement; hand stock totals two, never four. |
| **URS-022** | **Acknowledged receipt** — The engineer shall confirm each delivery of a spare as it is received, and a spare shall be recorded as received only when the whole quantity has been confirmed. _(Risk: Medium.)_ |  | (tested against the user requirement itself) | **PQ-04** | PQ · The spare lifecycle works for the people who run it. Expected: Stores, engineers and the Spare Coordinator complete each task unaided; stock balances agree with physical stock at the end of the exercise; every correction is traceable to a person, a time and a reason. |
|  |  | **FRS-027** | receive_spare_shipments() stamps each delivery with who confirmed it and when, accumulating spare_request_lines.received_qty. The line is marked Received (received_at) only when the acknowledged quantity reaches the requested quantity, so a part-delivered line remains at the Stores stage. | **OQ-18** | OQ · Partial issue and acknowledged receipt. Expected: The stock out and delivery challan show one unit; the line remains queued for the remaining unit; hand stock rises by one; the line stays at the Stores stage until fully issued and is marked Received only after the final acknowledgement; hand stock totals two, never four. |
| **URS-023** | **Reconciliation of consumption** — Authorised office roles shall be able to record a spare consumed against a call that the engineer did not report, correct a quantity reported in error, and void an entry made in error, with a reason retained for each. _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-04** | PQ · The spare lifecycle works for the people who run it. Expected: Stores, engineers and the Spare Coordinator complete each task unaided; stock balances agree with physical stock at the end of the exercise; every correction is traceable to a person, a time and a reason. |
|  |  | **FRS-028** | Holders of consumption.reconcile (Spare Coordinator, Hotline, Admin) may insert consumption rows flagged source = Reconciliation. UCN (validated against an existing call), engineer, part and reason are mandatory and enforced by a database trigger; the entry records who made it. Parts offered are limited to the engineer’s hand stock. | **OQ-16** | OQ · A reconciliation entry is authorised and complete. Expected: The engineer is refused; the office user’s form is pre-filled from the call; each incomplete or excessive submission is refused with a specific message; the complete entry is stored flagged Reconciliation with the author and reason, and reduces hand stock. |
|  |  | **FRS-029** | The same role may amend the quantity of an existing consumption line. The original quantity, the reason, and who amended it are retained on the row; the call, part, engineer and source cannot be altered. Setting the quantity to zero voids the line, returning the stock, while the record is retained (hard deletion remains blocked). | **OQ-17** | OQ · A quantity is amended or voided with the change retained. Expected: The amendment is accepted and the line retains the original quantity, the reason and the author; the reason-less amendment and every identity change are refused; the zeroed line is retained, marked as voided, and the stock returns to the engineer; deletion is refused. The audit trail holds the before and after image of each change. |
| **URS-024** | **Stock integrity** — No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative. _(Risk: High.)_ |  | (tested against the user requirement itself) | **PQ-04** | PQ · The spare lifecycle works for the people who run it. Expected: Stores, engineers and the Spare Coordinator complete each task unaided; stock balances agree with physical stock at the end of the exercise; every correction is traceable to a person, a time and a reason. |
|  |  | **FRS-030** | A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer’s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against. | **OQ-15** | OQ · Consumption cannot exceed the engineer’s hand stock. Expected: The excess report is refused, naming the balance and directing the user to the Spare Coordinator; the valid report is accepted; the excessive increase is refused; the balance never becomes negative. |
| **URS-025** | **Re-opening a closed call** — A closed call shall be re-openable by an authorised role where further work or correction is required, and the re-opening shall be recorded. _(Risk: Medium.)_ | **FRS-031** | An authorised role may re-open a closed call and close it again without inventing a visit; the transition is recorded. | **OQ-19** | OQ · Call re-opening and the preventive-maintenance batch. Expected: The re-open and subsequent closure are recorded without creating a visit; every call in the batch is dated the first of the chosen month, carries the upload date, and holds a stable order; call numbering is unchanged. |
| **URS-027** | **Refurbished spares** — Where a recycled spare is issued in place of a new one, it shall be identified by its own part number, held and consumed as that part, and the engineer shall be told the part is refurbished. Only a part held in Part Master and active may be issued this way. _(Risk: High.)_ | **FRS-033** | Stores may mark a line as refurbished when issuing it. The issue records the recycled identity — R + part code, description unchanged — while the request keeps what was asked for. Hand stock is derived from the ISSUE, so the refurbished part is held and consumed under its own code. A database check refuses the swap unless that code exists in Part Master and is active, and the engineer’s dispatch notification states that the part is refurbished. | **OQ-20** | OQ · Refurbished spares are identified, controlled and counted separately. Expected: Both invalid attempts are refused, naming the part code to add; the issue records the R-code with the description unchanged while the request is unaltered; hand stock shows the original and the R-part as separate lines, both offered for consumption; the stock-out list shows the refurbished flag and the days taken from the last approval. |
| **URS-028** | **Dispatch performance** — The time taken by Stores to issue an approved spare shall be measurable, from the moment the spare cleared its last approval to the moment it was issued. _(Risk: Low.)_ | **FRS-034** | spare_stock_out_lines lists every spare issued, one row each, with days_to_dispatch measured from the last approval recorded on the line (NSM where the item needs that review, else Commercial, else RM) to the stock out. | **OQ-20** | OQ · Refurbished spares are identified, controlled and counted separately. Expected: Both invalid attempts are refused, naming the part code to add; the issue records the R-code with the description unchanged while the request is unaltered; hand stock shows the original and the R-part as separate lines, both offered for consumption; the stock-out list shows the refurbished flag and the days taken from the last approval. |
| **URS-029** | **Service manuals available at the point of work** — The service documentation for a product shall be held centrally and presented to the engineer on the call for that product, so the machine is worked on against its own manual rather than one found by memory or by hunting a shared folder. _(Risk: Medium.)_ | **FRS-035** | Service manuals are catalogued in `documents` against the product they cover and stored in Google Drive. Opening a call lists its Supporting Documents — the manuals matching the call’s product, plus manuals held with no product (general to every machine) — alongside Knowledge Base articles whose title, product or tags match the call’s product or standard complaint. Every signed-in user may read the library; `docs.manage` maintains it. | **OQ-21** | OQ · The right document reaches the point of work, and a withdrawn one does not. Expected: The product call lists both its own manual and the general one; the other call lists the general one only; the tagged article appears alongside them; the retired manual disappears from the call while remaining on the shelf marked retired; both cross-shelf attempts are refused by the database. |
| **URS-030** | **Controlled QMS documents** — Quality-system documents (SOPs, work instructions, forms) shall be held with their document number, revision and effective date, be readable by every user, and be maintainable only by the role responsible for the quality system. A superseded document shall be withdrawn from use without being destroyed. _(Risk: High.)_ | **FRS-036** | QMS documents are held in the same catalogue under kind = qms with document number, revision and effective date, readable by every signed-in user and maintainable only under `qms.manage` — a right distinct from the one governing service manuals, and enforced in the database so a holder of either cannot move a document onto the other shelf. Withdrawal is by RETIRING the row (active = false): it stops being offered while the record of what was in force is retained. Authorship is stamped by the database and is not editable. | **OQ-21** | OQ · The right document reaches the point of work, and a withdrawn one does not. Expected: The product call lists both its own manual and the general one; the other call lists the general one only; the tagged article appears alongside them; the retired manual disappears from the call while remaining on the shelf marked retired; both cross-shelf attempts are refused by the database. |
| **URS-031** | **Find a machine, or a customer’s machines** — A user shall be able to identify the customer holding a given product and serial number, and to list every machine and serial number recorded against a given customer, without needing to know how either is spelled in the register. _(Risk: Low.)_ | **FRS-037** | A dedicated screen answers the question from either end. By product: the product list is the distinct set of item names in the PRODUCT REGISTER (view `product_register_names`, security_invoker) with the machine count beside each, and choosing one narrows Serial Number to that product’s serials — an equality match on `products.item_name`, served by the btree index of 0052, so a product name is never a prefix of another. By party: the party list opens the master and the box beside it takes any part of a name. Both land on one answer — the party, its recorded details, and every machine held against it. Export is deliberately absent from this screen. | **OQ-25** | OQ · Product & Party Search identifies a machine and a customer’s machines. Expected: The product list is the register’s own, each name with its machine count; the serial list holds only that product’s serials; the search returns that machine and its customer and does NOT return machines of the longer-named product; the party shows its recorded details and every machine held against it; no export is offered. |
| **URS-032** | **Allotment and re-allotment of calls** — A reporting manager shall be able to allot a call to, or move a call between, the engineers reporting to them and themselves, including several calls in one action, changing nothing on the call but the engineer it is allotted to. _(Risk: High.)_ | **FRS-038** | Every call register — Field, Installation, PM and Pending Calls — offers selection per row and a header box that takes exactly the rows currently listed, never rows a filter is hiding. The bar that appears edits ONE field, the allotted engineer, chosen from the manager and their reporting sub-tree, and writes every selected call in one action. The choice offered is built from `visible_engineer_names()`, and the write is independently constrained by RLS: a manager cannot allot outside their own team even by direct query. | **OQ-22** | OQ · Bulk re-allotment moves exactly what was chosen, and only within the team. Expected: The header tick selects only the rows listed — hidden rows are untouched; grouping nests in the order chosen and its counts reconcile; the selected calls move together and nothing but the allotted engineer changes on them; the out-of-team write is rejected by the database, not merely absent from the list. |
| **URS-033** | **Grouping a register** — A user shall be able to group a register by the values of a column — and by more than one column at a time — so a manager can read a list by region, then by engineer, then by call status, without exporting it. _(Risk: Low.)_ | **FRS-039** | Any register built on the shared table component can be grouped by up to three columns at once (for calls: Region, Engineer, Call Status). Groups are formed from the rows the filters have already produced, nest in the order chosen, carry their own counts, and collapse independently; each user’s choice is remembered per screen against their own identity. Region is not held on a call — it is resolved from the allotted engineer’s User Master row. | **OQ-22** | OQ · Bulk re-allotment moves exactly what was chosen, and only within the team. Expected: The header tick selects only the rows listed — hidden rows are untouched; grouping nests in the order chosen and its counts reconcile; the selected calls move together and nothing but the allotted engineer changes on them; the out-of-team write is rejected by the database, not merely absent from the list. |
| **URS-034** | **Requesting on behalf of an engineer** — A reporting manager shall be able to raise a spare request, a call registration request or a visit report for an engineer reporting to them, with the record attributed to that engineer and the manager’s identity retained as its author. _(Risk: Medium.)_ | **FRS-040** | Where a manager may act for their team, the engineer is a field on the form rather than an assumption: the Spare Request, Call Registration Request and Reporting forms offer the manager and every engineer reporting to them, defaulting to the manager. The record carries the chosen engineer and their address, so it reaches that engineer’s own lists, while `created_by` retains the manager as its author. The list is the same reporting sub-tree the read policies use, so a manager cannot raise for somebody they cannot see. | **OQ-24** | OQ · A manager may act for their team, and only their team. Expected: The request is attributed to the named engineer and reaches their lists; created_by retains the manager as its author; the out-of-team attempt is rejected by the database. |
| **URS-035** | **Correcting who a spare order is for** — An administrator shall be able to correct the engineer a spare order was raised against while it is still awaiting issue, and shall be prevented from doing so once any part of it has been issued. Every such change shall be retained with both names, the person who made it, the time and the reason. _(Risk: High.)_ | **FRS-041** | `reassign_spare_request()` changes the engineer on a spare request and writes `spare_request_engineer_log` in the same statement, so a change cannot exist without its record or a record without its change. It refuses a non-administrator, and refuses ANY caller once the order has been issued — tested three ways: the order says dispatched, any of its lines does, or a stock-out line points at one of its lines. A BEFORE UPDATE trigger on the table enforces the dispatch rule again for every path that does not go through the function, including PostgREST and the bulk upload. The reason: hand stock is DERIVED from the request, so after issue the engineer’s name is not a label on a record but the identity of whose parts they are. The log is readable by administrators, approvers, Stores, and both engineers named on the row. | **OQ-23** | OQ · A spare order can be corrected before issue and not after, by any route. Expected: The change succeeds before issue and is logged with both names, the actor, the time and the reason; the engineer it was taken off can read it; after issue every route is refused — the screen, the function and a direct table write — with a message naming the order; the non-administrator is refused. |
| **URS-036** | **Reliability and consumption analysis** — Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately. _(Risk: Medium.)_ | **FRS-042** | Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer’s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped — it is a property of the fleet — so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess. | **OQ-29** | OQ · The KPIs are computed from the record and scoped like it. Expected: The rate equals calls in twelve months divided by machines, times one hundred; each consumption appears under the cover of the call it was fitted to and the region of the engineer who fitted it; the engineer sees only their own calls in the numerator against the fleet-wide denominator, and the screen says so; a product with no machines on record shows no rate rather than a computed one. |
| **URS-037** | **Migrated data is distinguishable from the system’s own record** — Where a stock or service figure is derived partly from records MIGRATED from the superseded system and partly from records this system created, a user shall be able to see how much of the figure comes from each, and to read the figure without the migrated part. Neither reading shall be presented as a correction of the other. _(Risk: High.)_ | **FRS-071** | The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year. | **OQ-63** | OQ · The field failure register loads year by year whatever shape each year’s file is. Expected: Both years load; each heading reaches the same column through the shared matcher (strict, then loose, then squashed). Columns no register column claims are kept rather than dropped. The re-load UPDATES the corrected row instead of adding it again, the register being keyed on the report AND the machine. |
|  |  | **FRS-043** | Hand stock is derived from nine arms, three of which are migrated: the opening pools (`ref_type = Opening balance`) and the pre-2026 stock outs and yearly consumption exports (`ref_type = Historical`). `handstock_balance` carries `hist_stock_out`, `hist_consumed`, `hist_net` and `on_hand_live` (0102), so the register shows what the migration contributes per line and can present the balance without it. The identity `on_hand - hist_net = on_hand_live` holds for every row. The whole line is restated when the migrated part is excluded, not only the total, so the components on screen still reconcile. Both figures are labelled; neither is offered as a correction of the other. | **OQ-30** | OQ · The balance declares how much of itself was migrated. Expected: The migrated contribution is stated per line; excluding it restates the components as well as the total, so the arithmetic on screen reconciles; the identity holds for every row, not only the one examined; both readings are labelled and neither is presented as a correction. |
| **URS-038** | **Closing a stock period** — An authorised role shall be able to close a stock period, fixing an opening figure per engineer and part that stands for every movement up to that date, so the register need not re-derive settled history. A close shall not change any balance. _(Risk: High.)_ | **FRS-044** | `close_handstock_period(date)` writes an opening figure per engineer and part equal to the net of every movement up to that date, then moves a cut-off (`handstock_cutoff()`) that every arm of the movement view tests. The sum and the arms divide the SAME instant — the close takes `< cutoff`, the arms `>= cutoff` — so no movement can fall on both sides. Restricted to an administrator or `consumption.reconcile`; refuses a period that has not ended. A closing figure may be negative, because it must equal exactly what it replaces. | **OQ-31** | OQ · Closing a period changes nothing. Expected: The balance is identical before and after, line for line and part for part, while the movements read fall to those after the cut-off; a movement dated ON the closing day is counted once, not twice; both unauthorised attempts are refused. |
| **URS-039** | **Identifier continuity across a migration** — Record identifiers shall remain unique and continue in sequence after historical records carrying their own identifiers are loaded; the system shall not re-issue an identifier the migrated data already uses. _(Risk: High.)_ | **FRS-045** | The call-request trigger assigns a REQID from a sequence when the row does not carry one, and when it DOES carry one advances the sequence past it (0097), so loading historical records cannot leave the counter beneath them. `resync_call_req_seq()` repairs a counter already stranded. Identifiers issued out of sequence before the repair are re-lettered rather than renumbered, so a record people have seen keeps its identity while ceasing to collide. | **OQ-32** | OQ · Identifiers continue across a migration. Expected: The new identifier follows the highest loaded one rather than restarting; no identifier is issued twice; those issued out of sequence are distinguishable rather than renumbered, so a record already seen keeps its identity. |
| **URS-040** | **A bulk load shall not silently alter what it does not carry** — Loading a file shall change only the fields that file supplies. A value the file leaves empty shall take the value the system defines for it, and shall not be written as empty or null; a load that cannot honour this shall fail rather than write. _(Risk: High.)_ | **FRS-074** | Ownership transfers are keyed on the hand-over document AND the machine (0184); recovered warranty entries on the model AND the serial (0185); customer feedback on the call (0186). Each is a GENERATED STORED column carrying a plain unique index, because the data interface can infer neither an expression index nor a partial one — `npm run check:upserts` verifies every declared target against a real database and refused a partial index written during this very revision. A row carrying no key is refused and named at the point of loading. Where a row has no key VALUE but must be retained — feedback naming no call — the key falls back to the row’s own identifier, so it is unique by construction and no record is deleted to permit an index. Existing duplicates are collapsed by the migration keeping the most recent, a second record of one thing being a correction of the first. | **OQ-54** | OQ · Two devices sharing a serial number remain two records, and re-loading a corrected file corrects rather than duplicates. Expected: Both devices are present as SEPARATE records — the second has not replaced the first. The second load leaves the count unchanged and the corrected field updated. The same product and serial a second time is REFUSED. A row lacking the key is not loaded and the reason is stated on screen. |
|  |  | **FRS-071** | The register exists on paper back to 2016, one spreadsheet TAB per year, and the years do not agree with one another. The Bulk Uploads definition maps each year’s headings onto `field_failure_reports` through the shared header matcher (case- and space-insensitive, several accepted names per column, one date parser), and ANY COLUMN IT DOES NOT RECOGNISE IS KEPT on the row in `extra` and named on screen as kept — so a format nobody anticipated loses nothing and the unfamiliar heading is something to name later rather than data discarded now. Rows are matched on the FFR NUMBER, which is unique, so a corrected year is re-loaded over itself and the years may be loaded in any order; a row with no number is refused, because without it the same row arrives again on every load. Two properties are enforced in the database rather than by the importer: every loaded row carries `imported_from`, so migrated years stay DISTINGUISHABLE from reports this system raised and any figure over the register can report the split (the Insights tab does); and `ffr_stamp` leaves `raised_by` NULL on a loaded row, because the sheet’s “Raised by” is a name with no user account behind it and stamping the person running the upload would attribute a 2016 report to somebody who never saw it. Loading old years cannot disturb the current year’s number, which is drawn per year. | **OQ-63** | OQ · The field failure register loads year by year whatever shape each year’s file is. Expected: Both years load; each heading reaches the same column through the shared matcher (strict, then loose, then squashed). Columns no register column claims are kept rather than dropped. The re-load UPDATES the corrected row instead of adding it again, the register being keyed on the report AND the machine. |
|  |  | **FRS-046** | The API writes a batch of rows as ONE insert whose column list is the union of the rows’ keys; a row lacking one of those keys is written as NULL, not as the column default. The loader therefore groups rows by their column set and sends each group separately, so a column no row in the group carries genuinely defaults. Filling absent values in was rejected as a fix: it would defeat a default that carries meaning. A load that violates a NOT NULL constraint fails the batch and writes nothing of it. | **OQ-33** | OQ · A load changes only what its file carries. Expected: Both rows load; the row that left the column empty carries the column’s default, not an empty value and not null; the status column defaults rather than storing blanks; nothing outside the file’s columns is altered. |
| **URS-041** | **Migrated stock belongs to a person who can hold it** — A stock balance shall be opened only against an active member of the user directory; identifiers appearing in a migrated file that are not people (dealers, customers) shall be excluded before loading, and what is excluded shall be reported. _(Risk: Medium.)_ | **FRS-047** | Both opening-stock registers resolve each row’s name against the ACTIVE user directory before writing, matching on `lower(btrim(name))` — the same normalisation the balance is keyed on. Rows that do not match are withheld and NAMED before anything is written, so the count approved is the count loaded. An empty directory is refused rather than treated as "nothing matches". `_handstock_opening_engineers.sql` applies the same rule to already-loaded data and reports what it removes. | **OQ-34** | OQ · Migrated stock is opened only against an active user. Expected: Only the active engineer’s rows are written; the withheld names are listed BEFORE the write and the count approved is the count loaded; a name differing only in case or spacing still matches; the empty-directory load is refused rather than withholding everything. |
| **URS-042** | **Response within a working time** — A register shall return within a time that allows the work it supports, on the full production data volume and with access rules in force. _(Risk: Medium.)_ | **FRS-048** | Just-in-time compilation is disabled for the database (0099). The planner’s cost estimate for a view carrying row-level-security sub-plans exceeds `jit_above_cost` by several times, so Postgres compiled a query for 3.7 s that then executed in 174 ms — the more access rules a query carried, the more certain it was to be compiled. Registers page rather than requesting more rows than the API will return, and search is executed by the database rather than over the page already loaded. | **PQ-05** | PQ · The registers return within a working time on production volume. Expected: Each register returns within the time its work allows; time spent compiling is not a material part of any measurement; paging returns further records and the search finds a record outside the loaded page. |
| **URS-043** | **Decision support** — The system may SUGGEST a controlled value to the person entering it, provided the suggestion is drawn from the record, states its grounds, can be overruled, and is never written without a person choosing it. What was offered and what was accepted shall be retained so the suggestion quality can be reviewed. _(Risk: Medium.)_ | **FRS-049** | Registering a call offers up to three Standard Complaints for the reported problem, each with its grounds. The first source is the REGISTER: `suggest_standard_complaint()` (0104) ranks by what was actually chosen on past calls whose reported problem resembles this one, matched two ways — whole-string similarity and word similarity, because "O2 sensor faulty" against "Oxygen sensor defective" scores 0.24 on the first and 0.41 on the second. A count of past decisions outranks a resemblance between strings. The second, optional, source is a model (Edge Function `suggest-complaint`) which RE-RANKS those same candidates and cannot return a value outside them, enforced on both sides of the call; it exists for the paraphrase the first source cannot reach. The field is written only by the person choosing, and `complaint_suggestions` records what was offered and what was taken. The function is SECURITY DEFINER so a new engineer is not given the worst suggestions, and returns aggregates only — a value, a count, a score — so no call a reader may not see crosses the boundary. | **OQ-36** | OQ · A suggestion advises; it does not decide. Expected: Suggestions state why each is offered; nothing is written until a person chooses; ignoring them is recorded as such; the engineer gets the same suggestions without gaining access to the calls behind them; a value outside the candidate list is discarded rather than offered; the log shows what was offered, what was taken, and at which rank. |
| **URS-044** | **Attributable registration** — A registered call shall record BOTH the Hotline desk it belongs to and the individual who registered it. Only the Hotline engineer is trained on the vigilance questions answered at registration, so a call registered by anyone else shall be identifiable from the record without reconstruction. The individual shall be taken from the authenticated session and shall not be settable by the application or by a client of the API. _(Risk: High.)_ | **FRS-051** | Each call carries `created_by` — the Hotline DESK it is filed to, defaulting to the hotline-role profile or to an administrator’s configured choice (app_settings.calls.default_registrant_email) — and `actual_created_by`, the authenticated individual who registered it. A BEFORE INSERT trigger (0114, named so it fires last) sets the second from auth.uid() and DISCARDS any value the caller supplied; it accepts a supplied desk only when that user is a hotline desk, and otherwise substitutes the default. Where there is no authenticated session (a migration, a restore, an administrative load) both are kept as supplied and a missing one is filled from the other, so restored provenance is not erased. The two columns DIFFERING is the finding the control exists to produce, and the register lists and groups by the individual. Where neither can be determined — records bulk-loaded from the superseded system — both are empty and the record says so rather than implying attribution; `_registered_by_check.sql` reports where that line falls. Row-level security admits a reader on either column, so the individual who registered a call retains access to it. | **OQ-37** | OQ · A call says whose desk it is on AND who registered it, and neither can be forged. Expected: The Hotline engineer’s own call shows her on both. The stand-in’s call shows the Hotline desk and the stand-in — that pair is the finding. A supplied individual is discarded and the signed-in user recorded instead; a supplied desk that is not a Hotline desk is replaced by the configured default. The stand-in can still read the call she registered. The grouping lists every call registered by anyone other than the Hotline engineer. A bulk-loaded call shows both as not recorded, rather than naming anybody. |
| **URS-045** | **Controlled vocabulary is chosen, not typed** — Where a field must match a controlled list — a Standard Complaint above all — the value shall be CHOSEN from that list and shall not be typed freehand, and no keystroke shall commit a value on its own. Counting, filtering, repeat-failure detection and every downstream report match on the stored value, so a hand-entered variant is a record that no analysis will ever find. Where a list is empty the field shall say so rather than accept arbitrary text. _(Risk: High.)_ | **FRS-052** | Every dropdown in the application renders as a pick list that FILTERS on typing and commits only on a click or Enter over a highlighted row; a native `<select>` commits on the first keystroke, which on an auto-saving quality record wrote a value nobody chose. Below eight options the search box is suppressed, so a two-item list is not made harder to use. Free text is a per-field decision, OFF by default (`allowFreeText`); the form engine renders `type: select` this way, so every field-defined form inherits it. `npm run check:ui` fails the build on any native `<select>` remaining in the source. | **OQ-39** | OQ · A controlled value is chosen, never typed, and a keystroke never commits one. Expected: Typing FILTERS and never selects. Escape leaves the field exactly as it was. A click, and Enter over a highlighted row, each commit. No screen accepts a complaint that is not on the list. With the master empty the control says so and remains a picker — it does not become a text box. A short list shows as a plain list. |
|  |  | **FRS-053** | The Standard Complaint is a pick list with free text OFF on every screen that asks for it — the Field Call, Installation and PM registers (through the form engine), the Visit Report and the Call Registration request. Where the master is empty the control says whether it is empty or still loading and remains a picker. Suggestions drawn from past calls are offered beneath it and are values from the register itself, so they remain valid even when the master has not loaded. | **OQ-39** | OQ · A controlled value is chosen, never typed, and a keystroke never commits one. Expected: Typing FILTERS and never selects. Escape leaves the field exactly as it was. A click, and Enter over a highlighted row, each commit. No screen accepts a complaint that is not on the list. With the master empty the control says so and remains a picker — it does not become a text box. A short list shows as a plain list. |
| **URS-046** | **Repeat failure determined to the documented rule** — The review shall determine whether a call is a repeat failure by the rule the servicing procedure states — counting the call under review, within the stated window, on the same equipment or the same part in the same machine — and shall present the rule alongside the verdict so a judgement recorded under one rule is not mistaken for one recorded under another. Window and threshold shall be maintainable by an administrator without a code change. Where the machine cannot be identified the review shall say so rather than report no repeat failure. _(Risk: High.)_ | **FRS-054** | `frequent_failure(ucn)` returns the verdict and the calls behind it: earlier calls on the same product and serial within the window, matched on the same complaint OR the same part fitted, counted INCLUDING the call under review against the threshold. Window, threshold and whether the same-equipment path also requires a matching complaint are held in `app_settings` and editable in Admin Config; the defaults are the procedure’s (one month, two, on). The window is measured from the CALL’s date, not today, so reopening an old review cannot change its answer. A blank serial returns `known: false` — reported as “cannot tell” rather than “no repeat failure”. SECURITY DEFINER by design: an answer narrowed to the reader’s own call scope would read LOWER than the truth. Answers already recorded are not re-based; the screen shows the rule in force with the verdict. | **OQ-40** | OQ · Repeat failure is determined by the rule in force, and says when it cannot tell. Expected: One earlier failure is already a repeat failure — the count INCLUDES the call under review. The same part in the same machine is found even though the complaints differ. A blank serial reports that the machine cannot be identified, NOT that there is no repeat failure. An old review’s answer does not change, the window being measured from the call. The verdict follows the administrator’s window and threshold and states the rule applied. Answers already recorded are untouched. |
| **URS-047** | **Spares sent to a call are accounted for against it** — A spare that reached an engineer for a specific call shall be accounted for in that call’s consumption, and any shortfall shall be reportable — whether nothing was booked or less than was sent. A part refused or never dispatched shall not be reported as unaccounted for, because nothing arrived to be fitted. The determination shall be made only once the call is closed. _(Risk: Medium.)_ | **FRS-055** | `unused_spare_report` lists spare lines DISPATCHED or RECEIVED against a call whose part code is not fully accounted for in that call’s consumption — NOT USED where none was booked, SHORT where less was booked than sent. Quantities are aggregated per call and part, so a part sent twice and booked once is not two false findings. Refused and dropped lines are excluded: nothing arrived. Matched on the part CODE, the description being unstable. Only calls in a solved state are assessed, an open call’s parts being legitimately still in the van. `security_invoker`, so a reader sees only the calls their role allows. | **OQ-41** | OQ · A spare that reached a call is accounted for against it. Expected: Two sent and one booked reports SHORT of one; nothing booked reports NOT USED. A part sent twice and booked once reports nothing, quantities being aggregated per call and part. Refused and dropped lines never appear. Nothing is reported while the call is open. A voided line reports the whole quantity short. |
| **URS-048** | **Cover continues across a contract renewal** — A maintenance contract shall be renewable from its predecessor without the machine list being re-keyed, and the renewal shall carry a recorded link back to the contract it replaces. Cover shall be continuous: the successor begins the day after the predecessor ends, so no machine is momentarily uncovered and none is covered twice. Prices shall NOT be carried forward, a renewal being re-priced. _(Risk: Medium.)_ | **FRS-056** | A contract raises its successor from the register: the machines (each removable before saving), contract type, party, period, PM visit count and billing schedule are carried; `prev_mc_number` on the header and `last_contract_number` / `last_contract_end` on each item record the link back. The successor starts the day AFTER the predecessor ends and a period ends the day BEFORE its anniversary, so `machine_cover` has one unambiguous answer per day. The MC number is entered, never generated, and is refused if it already exists — renewing into an existing number would merge two contracts. Rate, tax and total are left empty on every machine. | **OQ-42** | OQ · A contract renews into its successor with cover continuous. Expected: The machine list, type, party, period and billing schedule carry over; the unticked machine does not. An existing MC number is refused rather than merged into. The successor starts the day after the predecessor ends. Rates, tax and totals are empty. The changeover day resolves to exactly one contract. |
| **URS-049** | **Custody of equipment held on the organisation’s premises** — Equipment taken into the organisation’s own premises shall be recorded on a register that identifies it, states WHOSE property it is, and holds the condition it arrived in — that condition being the baseline against which any later damage is judged. Where such equipment is lost, damaged or found unfit for use, that shall be recorded and reported to its owner. The register shall distinguish the organisation’s own stock from a customer’s property, because the duty of care applies to one and not the other, and shall not require a service call to exist: equipment may be held for reasons that have no call. _(Risk: High.)_ | **FRS-057** | Equipment taken into the workshop is recorded in `indoor_jobs`, one row per intake, carrying `received_at` / `received_by`, `condition_on_arrival`, the physical `tag_no` and a `status` through nine states. TWO INDEPENDENT AXES: `kind` states whose property it is (Customer property \| DEMO unit) and is what makes the custody duty applicable or not; `activity` states what is being done to it (Repair \| Rework \| Salvage \| Pre-delivery inspection \| Demo \| Other). Neither is reachable from the other, so equipment does not change ownership because the work on it changed. `ucn` is NULLABLE — a demonstration unit has no call — which is why the register stands alone rather than being a state of a call. Damage is `damage_note` with `reported_to_customer_at` / `_by`. Accessories are rows in `indoor_job_accessories`, each tagged to the parent job, so what came in with the equipment is a list that can be checked off when it goes back. | **OQ-43** | OQ · Equipment held on the premises is identified, and whose it is survives a change of work. Expected: The intake is accepted with no call — a demonstration unit has none. Received-by and received-at are stamped by the database from the session. The kind remains DEMO unit after the activity changes, the two being independent. The accessory list reports one of two still outstanding. The unauthorised user is refused by the database, and sees no rows at all. |
| **URS-050** | **Decontamination before the equipment is worked on** — Equipment returned from use shall be cleaned and disinfected to the applicable work instruction before it is worked on, and that shall be recorded with who did it, when, and against WHICH REVISION of the instruction. Where the work involves opening or dismantling the equipment, the record shall be a PRECONDITION of that work rather than a note made after it. _(Risk: High.)_ | **FRS-058** | `cleaned_at` / `cleaned_by` with `cleaning_wi` (defaulting to WI/SER/01) and `cleaning_wi_rev`, so the record states which revision was applied rather than which document was named. Where parts are recovered from equipment, a database trigger REFUSES the recovery while the job’s `decontaminated` flag is false: it is the only control in the module that blocks rather than records, because it protects the person doing the work and not only the product. | **OQ-44** | OQ · Nothing is recovered from equipment that has not been decontaminated. Expected: The first attempt is REFUSED by the database with a message naming the work instruction, not merely warned about. After the unit is marked decontaminated the same part records. The cleaning record carries the instruction AND the revision it was performed against. |
| **URS-051** | **A quality check separable from the work it checks** — Work performed on equipment before it is returned shall be subject to a recorded quality check held as its own record, attributable to the person who performed it. The authority to sign the check shall be grantable separately from the authority to do the work, so that the two may be different people. Equipment whose check has failed, and work of a kind that requires a check and has none, shall not leave. _(Risk: High.)_ | **FRS-059** | `qc_result` / `qc_by` / `qc_at` / `qc_notes` are columns of the job, not sentences in the work text. `indoor.qc` is a permission distinct from `indoor.work` and is enforced by a BEFORE UPDATE trigger, so a person holding every other authority in the module is refused the check by the database rather than by a hidden button. A trigger refuses any move to Ready, Dispatched or Closed while `qc_result` is Fail, refuses a Repair or Rework reaching Dispatched with no result at all, and refuses a failed pre-delivery inspection leaving. Whether the check must be signed by somebody OTHER than the person who received the unit is NOT enforced: the procedure does not require it, both identities are recorded, and the screen states plainly when they are the same. | **OQ-45** | OQ · The check is separable from the work, and equipment does not leave without one. Expected: The first is refused by the database naming the missing permission — not hidden, refused. The check records with the signer and time stamped. A failed check refuses Dispatched. A repair with no result refuses Dispatched; a demonstration unit does not, having no repair to verify. Where signer and receiver are the same person the record shows both names and the screen states it, the procedure not requiring otherwise. |
| **URS-052** | **Scrapping equipment is an authorised act** — Condemning equipment shall require an authority granted for that purpose alone, shall record who condemned it and why, and shall be refused to anybody not holding that authority. Parts recovered from condemned equipment shall be recorded with their condition, and shall not enter usable stock in a way that makes them indistinguishable from new parts. _(Risk: High.)_ | **FRS-060** | `indoor.condemn` is a permission of its own, enforced by a trigger on insert and update, and granted to the administrator role alone when the schema is applied — so no role acquires the ability to scrap equipment merely by being given the page. `condemned_reason` is required by a CHECK constraint before the status may be Condemned, and `condemned_by` / `condemned_at` are stamped by the database. Recovered parts are rows in `indoor_job_parts` with a condition grade and a destination in words; NO stock balance is altered, because a recovered part entering stock under its ordinary code cannot afterwards be told from a new one. | **OQ-46** | OQ · Equipment is not scrapped without authority, and no recovered part reaches stock. Expected: The first is refused by the database. A condemnation with no reason is refused by a constraint. The administrator succeeds, and who condemned it and when are stamped. The recovered parts are recorded with their grades and destinations. NO hand-stock balance changes. Only the administrator role holds the permission after a fresh apply. |
| **URS-026** | **Preventive-maintenance scheduling** — The monthly preventive-maintenance batch shall be created for a stated due month, retaining the date it was uploaded, and shall support loading earlier months. _(Risk: Medium.)_ | **FRS-032** | The PM bulk upload dates every call in a batch to the first of a chosen due month (reg_date), records the upload date as added_on, and sequences a registration date-and-time (reg_at) so the batch holds a stable order. Call numbering is unchanged. | **OQ-19** | OQ · Call re-opening and the preventive-maintenance batch. Expected: The re-open and subsequent closure are recorded without creating a visit; every call in the batch is dated the first of the chosen month, carries the upload date, and holds a stable order; call numbering is unchanged. |
| **URS-068** | **One identified record per machine, assembled from every register that names it** — Every machine the organisation has sold, contracted or recovered shall appear exactly once in a register of machines, identified by its MODEL together with its SERIAL — never by the serial alone, which repeats across models. That record shall be assembled from the warranty sale register, the contract register, the additional entries, the ownership transfer register and the installation call, and shall state for each of the party, the warranty and the contract WHICH register decided it, so the record can be checked against its evidence. Where the registers disagree, the most recently dated evidence shall decide. _(Risk: High.)_ | **FRS-080** | `product_database_v2` (0218) lists every machine named by `warranty_sale_details`, `contract_details` or `product_additional_entries`, keyed by `machine_key(product, serial)` — the SQL twin of `machineKey()` in `src/lib/machine.ts`, squashed so ORION-G and ORION G are one model, and MODEL-plus-SERIAL so the eleven machines numbered 219 stay eleven rows. Ownership Transfer and the installation call are joined in. The party is the most recently DATED claim among the ownership transfer, the additional entry, the contract and the sale, ties breaking towards the transfer. `party_from`, `warranty_from`, `contract_from` and `item_status_reason` name the deciding register on every row. It does not replace `public.products` or `machine_cover`, both of which are left exactly as they are. | **OQ-64** | OQ · One row per machine, assembled from five registers, each value naming its source. Expected: Every machine appears exactly once. The two sharing a serial are TWO rows, not one. The party is the one named by the later contract, and party_from says so. machine_cover merges the same-serial pair into one row, which is the difference this register exists to remove. |
| **URS-069** | **What a machine is covered by today is derived, not typed** — Whether a machine is inside its warranty, under a maintenance contract, or covered by neither shall be DERIVED from the recorded warranty and contract periods rather than stored as an opinion that ages. A machine inside its warranty is under warranty (WGP) even where a contract also covers it; a labour contract is AMC and a comprehensive contract is CMC; a machine covered by neither is OGP. A contract whose type was never recorded shall be reported as such and shall never be assumed to be either kind. _(Risk: High.)_ | **FRS-081** | `product_database_v2.item_status` is WGP where the warranty period covers today; otherwise `contract_cover_code(type)` where the contract period covers today — labour/labor to AMC, comprehensive/CMC to CMC, anything else returned UNCHANGED rather than bucketed; otherwise OGP. A contract covering today whose type is blank reads `CONTRACT (TYPE NOT RECORDED)`. This differs from `machine_cover` in both directions on purpose: that view asks the contract FIRST (so a machine inside warranty reads as its contract type) and defaults a blank type to CMC (so a labour contract silently reads as comprehensive). | **OQ-65** | OQ · Item status is derived warranty-first and never guesses a contract type. Expected: WGP, AMC, CONTRACT (TYPE NOT RECORDED) and OGP respectively, each with a reason naming the deciding register. machine_cover answers the contract type for the first and CMC for the third, which are the two differences. |
| **URS-070** | **A warranty starts when the machine was installed** — The warranty period of a machine shall start from the date recorded on its installation — the Warranty Start Date captured when the installation call is reported, or failing that the date that call was solved — and shall fall back to the selling register only where no installation was recorded. The end of the period shall be derived from that start and the recorded period, by the same arithmetic the rest of the application uses. _(Risk: High.)_ | **FRS-082** | Warranty start is the `Warranty Start Date?` answer on the installation call’s feedback, read through `imported_ts()` so a cell holding "n/a" yields nothing rather than failing the whole view; failing that the installation call’s solved date; failing that the additional entry; failing that the warranty sale. Where a start and a period are both known the end is `cover_period_end(start, months)`, which reproduces `addPeriod()` in `src/lib/dates.ts` INCLUDING its JavaScript month overflow — 31 January plus one month is 2 March, where Postgres’s own interval arithmetic clamps to 27 February. 26 of 458 start/period combinations differ between the two. | **OQ-66** | OQ · The warranty starts at the installation and ends by the application’s own arithmetic. Expected: The answered date, then the solved date, then the selling register — warranty_from names which. The end equals start plus period minus a day. "n/a" neither reads as a date nor fails the view. 31 January plus one month is 2 March, matching addPeriod(), where a plain Postgres interval gives 27 February. |

**110** links · **76** user requirements · **90** system requirements · **80** tests · **76** requirements traced end to end, **0** in part, **0** not yet.

**Outside this matrix:** OQ-38, OQ-68, OQ-70, OQ-71, OQ-67 — they prove a
requirement recorded as NON-AUDITABLE, which sits outside the
URS → FRS → test chain by design rather than by omission.
