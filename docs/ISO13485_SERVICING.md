# Servicing provision — requirements under ISO 13485:2016

**Status: DRAFT for RA/QA review. Not a controlled document.**
Author: prepared for RITHI CRM, 2026-09-08. The clause mappings are the author's
and are to be confirmed against the current text of ISO 13485:2016 and of the
Medical Devices Rules, 2017 (Fifth Schedule) before this is relied on.

**This file is the standing reference** for the servicing process, kept at the
user's direction (2026-09-08: *"keep this for future reference"*). It is pointed
at from `CLAUDE.md`, so a future session reads it before building anything in the
servicing path, and its two open decisions are indexed in `docs/BACKLOG.md`.
A shareable copy for RA/QA:
<https://claude.ai/code/artifact/3696155c-2394-43ad-b017-a614f69c3219>

**Keeping it current is part of the change that closes a gap.** A requirement's
status line is updated in the same commit that makes it true — a gap analysis
that lags the system is worse than none, because somebody plans around it.

---

## What this is, and what it is not

This is the requirement set for the **servicing provision** — the process by
which a placed medical device is maintained, repaired and returned to use, and
the records that process must produce.

It is **not** the software validation package. That already exists
(`src/lib/validation.ts`, in-app under Administration → Software Validation) and
answers a different question: whether RITHI CRM is fit to be *used* in the
quality system, under **§4.1.6**. This document asks what the *servicing process*
must do, and then says where RITHI CRM does it, does it partly, or does not.

The two meet at one point and it is worth being precise about it: **software
validation does not discharge a process requirement.** A calibration record that
nothing captures is missing whether or not the application that would have held
it is validated.

## Where the requirements come from

**§7.5.4 Servicing activities** is the governing clause, and it is short. It asks
for three things:

1. Where servicing is a specified requirement, **documented servicing
   procedures, reference materials and reference measurements** — as necessary to
   perform the servicing *and to verify that product requirements are met*.
2. **Analysis of the records** of servicing carried out by the organisation **or
   its supplier**.
3. That analysis to determine **(a)** whether the information is to be handled as
   a **complaint**, and **(b)** where appropriate, to feed the **improvement**
   process.

Almost everything else below is a clause that §7.5.4 reaches into — parts,
people, instruments, traceability, records, feedback, nonconformity — because a
service visit touches all of them.

## Where complaints live — the decision of 2026-09-08

The user, asked the two questions this document ended on:
*"CAPA not here.. field call are ideally the complaints as well.."*

So the boundary is drawn here:

* **CAPA, nonconformity and advisory notices are OUTSIDE this system**, in the
  separate quality system. Those requirements are marked **Elsewhere** rather
  than Absent — they are handled, just not here.
* **The field call register IS the complaint register.** A field call is the
  intake of a customer's allegation about a device, which is what a complaint is.

Both are legitimate designs. Two things follow that are easy to miss, and neither
is a quibble:

**1. This RAISES the bar on the field call register rather than lowering it.**
Being the complaint register means §8.2.2 now applies to it: the population must
be complete, each complaint evaluated, and a decision not to investigate
justified and recorded. It is the reason SR-027 moves from "cheapest gain" to
load-bearing — without the determination, the register says either that every
field call is a complaint (not true, and it inflates the rate) or that none is.

**2. "Field call" is the right choice of word, and its edges need a rule.**
Not a PM visit and not an installation — correct, those are planned work and
allege nothing. But three edges have to be decided by RA/QA rather than assumed:

* a **PM or installation visit that discovers a fault** — the customer alleged
  nothing, yet a deficiency exists;
* a field call that turns out **not to be the device** (mains supply, a
  consumable, user technique) — still a complaint, since a complaint is about
  what was *alleged*, not about what was found;
* a complaint that **never becomes a call at all** — see SR-038, which is the
  real exposure this decision creates.

*CAPA remains outside the scope of this system by that decision; §7.5.4(b) is
not thereby discharged, and SR-039 is what remains of it here.*

## How to read the table

| field | meaning |
| --- | --- |
| **SR-nn** | servicing requirement, numbered here for reference |
| **Clause** | ISO 13485:2016 |
| **Status** | **Met** / **Partial** / **Absent** in RITHI CRM today; **Process** where it belongs to an SOP rather than to software; **Elsewhere** where it is held in another system by a recorded decision |

Status is an assessment of the *system*, not of your quality system: something
marked Absent here may well be controlled today on paper. **Elsewhere is
narrower and stronger than that** — it means a decision has been taken and
recorded, so nobody should build it here; but it never means the obligation
ended, only that it moved (see SR-039).

---

## A. The servicing process itself

**SR-001 — Servicing is a specified requirement, and its scope is stated.**
*§7.5.4, §7.2.1.* The product families serviced, what servicing covers
(breakdown, preventive, installation, calibration, upgrade) and what it excludes
must be stated, per product family.
**Status: Process.** RITHI models three call types (Field, PM, Installation) but
holds no statement of servicing scope per family.

**SR-002 — A documented servicing procedure exists for each product family.**
*§7.5.4, §7.5.1.* Not a general SOP only: the steps, the acceptance criteria and
the reference measurements for *that* device.
**Status: Partial.** The Document Library holds service manuals and presents them
on the call for the product they cover (URS-029). What is presented is the
manufacturer's manual; whether it constitutes the *documented servicing
procedure* is an RA/QA determination, not a software one.

**SR-003 — Reference materials and reference measurements are available at the
point of work.** *§7.5.4.* The engineer must have, in the field, the values a
serviced device is expected to meet.
**Status: Partial.** Documents reach the call; **expected values do not exist as
data**. A report records what was measured, not what it should have been.

**SR-004 — Every servicing event is recorded as a controlled record.**
*§7.5.4, §4.2.5.* One record per intervention, attributable and time-stamped.
**Status: Met.** `reports` is one row per visit, attributable, with the visit date
and the entry date held separately (0138). Calls carry both the desk they are
filed to and the individual who registered them (URS-044).

**SR-005 — The servicing record identifies the device, the customer, the fault,
the work done and the outcome.** *§7.5.4, §7.5.8.*
**Status: Met.** UCN, product + serial, party, complaint reported, standard
complaint, job done, observations, hour meter, software version, call status.

**SR-006 — After servicing, it is verified that product requirements are met,
and the verification is recorded.** *§7.5.4.* This is the clause most often
under-served: "solved" is a *call* outcome, not a statement that the device
performs to specification.
**Status: Absent.** There is no post-service verification checklist with
acceptance criteria and a recorded pass/fail. The nearest data — hour meter,
software version — are readings, not a verification against a limit.
**This is the largest single gap in the set.**

**SR-007 — The status of the device is identified throughout, including whether
it is fit to return to use.** *§7.5.8.*
**Status: Partial.** The call carries a state (Unattended / Unsolved / Report
pending / Solved). The *device's* status — released, held, awaiting parts,
withdrawn — is not modelled separately from the call's.

**SR-008 — Where the result of servicing cannot be fully verified by subsequent
inspection, the process is validated.** *§7.5.6.*
**Status: Process.** An RA/QA determination per procedure; nothing in software
depends on it.

**SR-009 — Servicing is performed under controlled conditions: the approved
procedure, the right instruments, a competent person.** *§7.5.1.*
**Status: Partial.** See SR-002 (procedure), SR-016 (instruments), SR-014
(competence). The application enforces none of the three as a precondition of
filing a report.

**SR-010 — Response and completion against a defined service level is
measurable, against the levels the procedure actually sets.** *§8.4, and
customer requirements under §7.2.1.*
**Status: Downgraded to Partial, 2026-09-08 — the mechanism is there and it is
configured with the wrong numbers.** The SLA machinery works (URS-014, the
pending-calls view, the objectives with per-month cut-offs). But **ANNEXURE A**
of the service procedure sets completion targets on a three-dimensional matrix —
cover type × problem criticality × spare availability — and the system cannot
express it:

* `sla_rules` is a flat list of `{key, label, target_hours}`. **One number per
  key**, with no dimensions to vary along.
* **Problem criticality does not exist** as a field on a call.
* **Spare availability** is not recorded as a fact about the call either; the
  nearest rule, `closure_spare`, keys on whether a spare was *requested*, which
  is a different question.
* The seeded targets do not match the procedure. "Attending: 3 days" is right
  (`first_visit` = 72h, and it is 3 days for every row). Completion is not:

| Cover | Critical | Spare | ANNEXURE A | Configured today |
| --- | --- | --- | --- | --- |
| AMC/WGP | No | Yes | 3 days | `closure` = 5 days |
| AMC/WGP | No | No | 7 days | `closure_spare` = 7 days *(right number, wrong question)* |
| AMC/WGP | Yes | Yes | 7 days | — |
| AMC/WGP | Yes | No | 15 days | `closure_spare_noncover` = 10 days |
| OGP | No | Yes | 15 days | — |
| OGP | No | No | 15 days | — |
| OGP | Yes | Yes | 30 days | — |
| OGP | Yes | No | 30 days | — |

So a breach today is measured against a target the procedure does not set, in
both directions. **CMC is not in ANNEXURE A at all** and is a live cover type in
this system (`ITEM_STATUS = WGP, OGP, CMC, AMC`) — which bucket it falls in is a
question for whoever owns the procedure, not an assumption for this file.

## B. Installation

**SR-011 — Documented installation requirements and acceptance criteria exist,
and installation is verified against them.** *§7.5.3.*
**Status: Partial.** Installation calls are a distinct type restricted to the
Commercial function (URS-006) and capture warranty start; there are no recorded
acceptance criteria and no verification result against them.

**SR-012 — Records of installation and verification are kept, including where
the work is done by a supplier.** *§7.5.3.*
**Status: Partial.** Records exist for the organisation's own work; **third-party
installation is not modelled** (see SR-030).

## C. Identification and traceability

**SR-013 — Every serviced device is uniquely identifiable, and its service
history is retrievable by that identity.** *§7.5.8, §7.5.9.*
**Status: Met.** Product + serial is the machine key (0129); the install base is
drawn from Product Master; ownership transfer keeps the machine's identity across
customers; the call view lists a machine's whole history.

## D. Parts and materials

**SR-014 — Spare parts are obtained from approved suppliers and meet the
device's specification.** *§7.4.*
**Status: Absent in the app; Process elsewhere.** Part Master holds parts; no
supplier approval status is held against a part.

**SR-015 — The part fitted to a device is traceable to what was fitted.**
*§7.5.9, §7.5.4.* For a device where a failed part is subsequently investigated,
the record must say which part went in.
**Status: Partial — and worth a decision.** Consumption records the part **code
and quantity** against the call. It does **not** record the **batch, lot or
serial number** of the individual part fitted. Where a supplier issues a field
action against a lot, this system cannot answer which devices received it.

**SR-016 — Parts are preserved, identified and controlled in the field.**
*§7.5.11, §7.5.8.*
**Status: Met, unusually well.** Hand stock is derived, never stored; a database
trigger caps consumption at the engineer's balance; transfers and returns (MRN)
are recorded; a refurbished part is held under its own code (URS-027).

**SR-017 — A part removed as defective is controlled as nonconforming
material.** *§8.3.*
**Status: Absent.** The superseded system carried a "send email for defective
spare" flag; there is no nonconforming-material record, disposition or
segregation in RITHI.

## E. People

**SR-018 — Servicing personnel are competent for the product they service, and
competence is recorded.** *§6.2.*
**Status: Absent.** User Master holds role, region and reporting line — not
qualification per product family, nor training records, nor an expiry.
**Consequence:** the system cannot prevent, or report on, a call being allotted to
somebody not qualified for that device.

**SR-019 — The training a role requires before productive use is defined and
recorded.** *§6.2.*
**Status: Process.** SOP-10 in the validation package covers training on the
*system*; training on *servicing* is outside it.

## F. Equipment used in servicing

**SR-020 — Monitoring and measuring equipment used to verify a serviced device
is identified, calibrated to a traceable standard, and its calibration status is
known at the time of use.** *§7.6.*
**Status: Absent.** No instrument register, no calibration due dates, and a
service report does not record **which instrument** produced a reading.
**Consequence, stated plainly:** a measurement in a service record cannot be
tied to a calibrated instrument, so it does not evidence that the device met its
specification. With SR-006, this is the pair that matters most.

**SR-021 — Where equipment is found out of calibration, the validity of previous
results is assessed and action taken.** *§7.6.*
**Status: Absent.** Follows from SR-020: without knowing which instrument took a
reading, the affected records cannot be identified.

**SR-022 — Infrastructure maintenance that can affect product quality is planned
and recorded, with intervals stated.** *§6.3.*
**Status: Partial.** PM scheduling exists for *customer devices* (URS-005/026);
this clause is about the organisation's own equipment.

## G. Records

**SR-023 — Servicing records are attributable, legible, contemporaneous,
original and accurate, and cannot be altered without trace.** *§4.2.5.*
**Status: Partial, and known.** The application keeps a client-written trail; the
database-enforced trail (`record_audit`) was switched off in 0112 and is
recorded as a raised residual risk (R-14) in the validation package. Quality
records are never deleted — a wrong consumption line is voided, not removed
(0049).

**SR-024 — Records are retained for the required period and are retrievable.**
*§4.2.5.* At least the lifetime of the device as defined by the organisation, and
not less than two years from release — or longer where MDR-2017 requires.
**Status: Partial.** URS-017 states the requirement; the retention *period* is
not configured in the system, and there is a purge on a retention window.
**The period and its basis must be stated before that purge can be justified.**

**SR-025 — Documents used in servicing are controlled: current revision, and
obsolete revisions prevented from unintended use.** *§4.2.4.*
**Status: Met.** QMS documents carry document number, revision and effective date
(URS-030).

## H. Feedback, complaints, vigilance

**SR-026 — Servicing records are systematically ANALYSED — not merely filed.**
*§7.5.4.* This is an explicit obligation and it is the one most easily missed:
the analysis must happen, and there must be a record that it happened.
**Status: Partial — the strongest partial in this set.** The Daily Call Review
walks the register call by call and records Review 1 (public health threat,
death, serious incident) and Review 2 (risk to patient, warranty failure,
frequent failure → potential effect), with an auto-answer rule and a reviewer.
That *is* an analysis with a record. What is missing is the explicit output
below. **Since 0153 the frequent-failure test is the DCCR procedure's own** —
two or more failures including the call under review, within a month, on the
same equipment or the same part in the same machine — where it had been a
six-month window with no same-part path. That corrects an *input* to the
analysis; it does not close this requirement.

**SR-027 — The analysis determines whether the information is to be handled as a
COMPLAINT, and that determination is recorded — including a decision of "not a
complaint" and its reason.** *§7.5.4(a), §8.2.2.*
**Status: Absent as an explicit decision — and now the load-bearing one.** Review
2 captures the ingredients of the decision but no field records the decision
itself. A determination that cannot be shown was made is, to an auditor, a
determination that was not made.

Under the decision of 2026-09-08 (see *Where complaints live*, above) **the field
call register IS the complaint register**, so this field is what marks which
calls are complaints. Without it the register is either "every field call is a
complaint" — which is not true and inflates the complaint rate — or nothing is
marked and the population cannot be produced at all.
**Still small to add: one controlled field plus a reason, on the review already
being done.**

**SR-028 — Complaints are handled under a documented process: received,
evaluated, investigated where indicated, actioned, and closed with a record; and
a decision not to investigate is justified and recorded.** *§8.2.2.*
**Status: Partial, by the decision above.** The call carries the intake,
evaluation (Review 1 / Review 2), the work done and the closure with a date and
an engineer — which is most of the process. What is missing is the *complaint
framing* over it: the determination (SR-027), and an investigation outcome
distinct from "the call was solved". A call can be closed by replacing a board
without anything recording why the board failed.

**SR-029 — Where a complaint or servicing finding is reportable to the
regulatory authority, it is reported within the required timeframe and the
submission is recorded.** *§8.2.3; MDR-2017.*
**Status: Absent.** Review 1 screens for the triggers. Nothing records
reportability, the clock, or the submission.

**SR-030 — Post-market feedback from servicing feeds risk management and product
realisation.** *§8.2.1.*
**Status: Partial.** Customer feedback is captured per question (URS-012);
failure analysis and reliability reporting exist (URS-036, the WRR-2026 export).
The route from those into risk management is procedural and undocumented here.

## I. Nonconformity and improvement

**SR-031 — A device found nonconforming during servicing is identified,
segregated where applicable, and dispositioned with a record.** *§8.3.1/8.3.2.*
**Status: Elsewhere.** Held in the separate quality system by the decision of
2026-09-08. What remains here is the handoff — SR-039.

**SR-032 — Where nonconforming product is detected after delivery, action
appropriate to the effects is taken — including, where required, an advisory
notice, with records of each issued.** *§8.3.3.*
**Status: Elsewhere.** As SR-031. Note that an advisory notice has to reach a
list of affected devices, and **that list comes from here** — which is what makes
SR-015 (the lot or serial of the part fitted) a dependency of an advisory notice
rather than a nicety.

**SR-033 — Data from servicing is analysed to show the suitability and
effectiveness of the quality system, and the analysis is recorded.** *§8.4.*
**Status: Met in substance.** Quality objectives per month and quarter, computed
from the register with a stated cut-off and an evidence sheet naming its
assumptions and hard stops (0136–0139).

**SR-034 — Corrective action is taken on causes of nonconformity, and its
effectiveness is verified; preventive action likewise.** *§8.5.2, §8.5.3.*
**Status: Elsewhere** — *"CAPA not here"* (the user, 2026-09-08). CAPA is held in
the separate quality system. **This does not discharge §7.5.4(b):** the servicing
analysis must still demonstrably feed that process, which is SR-039. SOP-09 in
the validation package governs CAPA for the *software* and is a different thing
again.

## I-b. What the boundary decision creates

*Added 2026-09-08, when CAPA was placed outside this system and the field call
register was made the complaint register. Neither requirement existed while both
questions were open, which is why they are numbered after the rest.*

**SR-038 — A complaint that arrives WITHOUT a field call still reaches the
complaint population.** *§8.2.2.*
**Status: Absent — and it is the exposure the decision creates.** If the field
call register is the complaint register, then a complaint that never became a
field call is not recorded anywhere: a customer who emails Commercial about
labelling, a distributor's report on a device already replaced, a complaint about
delivery or documentation rather than the device. Each of those is a complaint
under §8.2.2 and none of them produces a call.

Two ways to close it, and the choice is the user's: **either** every complaint is
made to enter as a call (a call type or an origin flag, so the register really is
complete), **or** the complaint register is elsewhere and this system feeds it —
in which case SR-027's determination becomes an *export*, not a marker. What
cannot stand is the middle: the register presented as the complaint population
while a route into complaints exists that bypasses it.

**SR-039 — A complaint or servicing finding identified here demonstrably REACHES
the separate quality system that handles it.** *§7.5.4(b), §8.5.2.*
**Status: Absent.** Nonconformity, advisory notices and CAPA are held elsewhere
by the decision of 2026-09-08. That is a legitimate design, but §7.5.4(b) asks
for the servicing analysis to feed the improvement process, and an obligation
does not end at a system boundary: there must be a recorded handoff — what was
raised, when, to what reference — or the analysis stops at the edge of this
system and the evidence chain breaks exactly where an auditor follows it.
The cheapest form is a reference field and a date on the call, filled when the
finding is raised in the other system.

## J. Servicing done by others

**SR-035 — Where servicing is outsourced, the supplier is evaluated and
controlled, and the arrangement is documented.** *§4.1.5, §7.4.*
**Status: Absent.**

**SR-036 — Records of servicing carried out by a SUPPLIER are analysed on the
same footing as the organisation's own.** *§7.5.4 — the clause says "or its
supplier" and it is easily read past.*
**Status: Absent.** RITHI holds only work done by its own engineers. If any
servicing is subcontracted, those records are outside the analysis in SR-026 and
the gap is invisible from inside the system.

## K. The software itself

**SR-037 — Software used in the servicing process is validated for its intended
use, and revalidated on change.** *§4.1.6.*
**Status: Met.** The existing package (URS/FRS/risk/FMEA/IQ-OQ-PQ, Rev 1.8) with
its own change control.

---

## L. Indoor service — equipment taken into the workshop

*Added 2026-09-08 from procedure §4.5. **This section exists because the Indoor
process brings a clause into scope that the first revision missed entirely**:
once the organisation takes a customer's device onto its own premises, §7.5.10
applies, and nothing in the first 39 requirements covered it. A field-only
reading of the servicing provision does not see it.*

**SR-040 — Customer property in the organisation's possession is identified,
verified, protected and safeguarded; and where it is lost, damaged or found
unfit for use, that is REPORTED TO THE CUSTOMER and recorded.** *§7.5.10.*
**Status: Absent.** Procedure §4.5.2 receives the equipment as *"Customer
Property"* and records it in the Indoor Service Register — so the process exists
and the obligation is recognised. The register is not in this system, and there
is no custody record: nothing says which customer devices are held, since when,
or in what condition they arrived. The reporting duty on damage has no record at
all. **A device on the workshop bench is the organisation's responsibility in a
way a device in the field is not**, which is what makes this the requirement the
Indoor process adds rather than one it inherits.

**SR-041 — Equipment is cleaned and decontaminated before it is worked on, to
the work instruction, and that is recorded.** *§7.5.2, §6.4.*
**Status: Absent.** Procedure §4.5.3 requires it against **WI/SER/01**. The step
protects the person doing the work as much as the product, so "it was done" is a
record somebody may need to rely on later; nothing holds it.

**SR-042 — The equipment carries an identified STATUS throughout, and its
accessories are identified to the equipment they came with.** *§7.5.8.*
**Status: Absent — and this is SR-007 made concrete.** Procedure §4.5.4 puts a
physical **identification tag** on the device to show its status, and tags the
accessories with the details of the parent equipment. §4.5.5 adds a separate
**process tag** for DEMO units. The system holds none of the three, and the
distinction in the last one matters beyond housekeeping: **a DEMO unit is the
organisation's own stock, not customer property**, so SR-040 does not apply to it
— and telling them apart is exactly what the separate tag exists to do.

**SR-043 — A quality check is performed on completion, before the equipment goes
back, and the record is kept.** *§7.5.4.*
**Status: Absent in the system; REQUIRED BY THE PROCEDURE.** §4.5.6: *"After the
Service completion a quality check is performed and Records are maintained."*

This is **SR-006** — the largest gap in this document — and the Indoor procedure
settles a question the first revision left open. The gap is *not* that the
organisation fails to verify a serviced device: its own procedure says it does.
The gap is that **the record of that check lives outside this system**, so the
service record here cannot show it happened. That is a much better problem to
have, and a smaller one to close.

**SR-044 — A call that moves between departments keeps its identity and its
history.** *§4.2.5, §7.5.9.*
**Status: Absent.** Procedure §4.5.1 has the Field Engineer consult the manager,
send the equipment in, and ask the Hotline Engineer to **transfer the call to the
Indoor Service department** — the same call, changing hands. Nothing models a
transfer, so today it would be done by closing one call and raising another,
which breaks the chain from the customer's original complaint to what was
eventually found: two records where the standard expects one traceable history.
§4.5.7 closes the loop — the field engineer reinstalls, checks, and files the
completion report — so the call ends where it began.

## The gap, in order of consequence

Ranked by what an auditor would ask first and by what a patient outcome would
turn on — not by effort.

| # | Gap | SR | Why it ranks here |
| --- | --- | --- | --- |
**Re-ranked 2026-09-08** after the boundary decision. The complaint determination
moved from third to first: it was the cheapest gain while the register was only a
service register; now that the register *is* the complaint register, it is what
makes the population producible at all. CAPA left the list, and two entries
arrived that the decision created.

| # | Gap | SR | Why it ranks here |
| --- | --- | --- | --- |
| 1 | **No recorded complaint determination** | SR-027 | The register is now the complaint register, so this field is what says which calls are complaints. Without it the population is either everything or nothing. Still the cheapest on the list. |
| 2 | **No post-service verification against acceptance criteria** | SR-006, SR-003 | §7.5.4 asks for verification that product requirements are met. "Solved" is not that. Every other record rests on this one. |
| 3 | **A complaint that never becomes a call has nowhere to live** | SR-038 | The exposure the decision creates. A register presented as the complaint population, with a route into complaints that bypasses it, is worse than one that never claimed to be. |
| 4 | **No calibrated-instrument link on a measurement** | SR-020, SR-021 | A reading not tied to a calibrated instrument does not evidence conformity — and if an instrument is later found out of calibration, the affected records cannot be found. |
| 5 | **No recorded handoff to the system that holds CAPA** | SR-039 | §7.5.4(b) does not end at a system boundary. Without it the evidence chain breaks exactly where an auditor follows it. |
| 6 | **No competence record per engineer per product** | SR-018 | Allotment cannot be checked against qualification, and §6.2 evidence has to be assembled by hand. |
| 7 | **No lot/serial of the part fitted** | SR-015 | A supplier field action on a lot cannot be answered: which devices received it? Now a dependency of an advisory notice raised in the other system. |
| 8 | **Retention period not stated or configured** | SR-024 | A purge runs on a window whose basis is not recorded. |
| 9 | **Reportability decision and clock not recorded** | SR-029 | Review 1 screens for the triggers and then stops. |
| 10 | **Third-party servicing not modelled** | SR-035, SR-036 | Only matters if any servicing is subcontracted — still unanswered. |

### What I would build first, and why

**1. The complaint determination, and with it the handoff (SR-027 + SR-039).**
One controlled field and a reason on the Daily Call Review, plus a reference and
a date recording that a finding was raised in the quality system that holds CAPA.
Smallest change on the list; it closes an explicit sub-clause; and now that the
register is the complaint register it is what makes the complaint population
producible. Build the two together — the determination without the handoff stops
at the system boundary, which is where §7.5.4(b) says it must not.

**2. Post-service verification (SR-006 + SR-003).** A verification checklist per
product family — parameter, expected value or range, measured value, pass/fail —
completed on the visit that closes a call. It gives SR-003's reference
measurements somewhere to live and makes the service record say what the standard
asks it to say. It is also the prerequisite for item 3 being worth anything.

**3. The instrument register and calibration status (SR-020).** An instrument
master with calibration due dates, and an instrument reference on a verification
reading. Only useful once 2 exists.

**Before any of them, one question of scope (SR-038):** is every complaint to
enter as a call, or is the complaint register elsewhere with this system feeding
it? The answer changes what SR-027's field *is* — a marker on a complete
population, or an export into somebody else's. It costs nothing to settle now and
is expensive to change after the field exists and people have been filling it in.

The remaining question from the first revision is still open: **is any servicing
subcontracted?** (SR-035/036.)

---

## Caveats

* Clause numbers and their reading are the author's. **RA/QA must confirm them
  against the current standard text** before this document is used as a basis for
  anything. ISO 13485 is copyrighted; nothing here reproduces its wording.
* Status against RITHI CRM is from the system as at **v0.9.149**, read from the
  code and schema. Where something is marked Absent it means *absent from this
  system*, which says nothing about whether it is controlled on paper.
* MDR-2017 (Fifth Schedule) is aligned to ISO 13485 and is the regulation this
  operation is held to; where it is more specific than the standard — retention
  in particular — its text governs.
