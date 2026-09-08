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

## How to read the table

| field | meaning |
| --- | --- |
| **SR-nn** | servicing requirement, numbered here for reference |
| **Clause** | ISO 13485:2016 |
| **Status** | **Met** / **Partial** / **Absent** in RITHI CRM today, or **Process** where it belongs to an SOP rather than to software |

Status is an assessment of the *system*, not of your quality system: something
marked Absent here may well be controlled today on paper.

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
measurable.** *§8.4, and customer requirements under §7.2.1.*
**Status: Met.** SLA rules (URS-014), the pending-calls view, and the quality
objectives with per-month cut-offs (0139).

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
below.

**SR-027 — The analysis determines whether the information is to be handled as a
COMPLAINT, and that determination is recorded — including a decision of "not a
complaint" and its reason.** *§7.5.4(a), §8.2.2.*
**Status: Absent as an explicit decision.** Review 2 captures the ingredients of
the decision but no field records the decision itself. A determination that
cannot be shown was made is, to an auditor, a determination that was not made.
**Small to add: one controlled field plus a reason, on the review already being
done.**

**SR-028 — Complaints are handled under a documented process: received,
evaluated, investigated where indicated, actioned, and closed with a record; and
a decision not to investigate is justified and recorded.** *§8.2.2.*
**Status: Absent.** There is no complaint record distinct from the call.

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
**Status: Absent.**

**SR-032 — Where nonconforming product is detected after delivery, action
appropriate to the effects is taken — including, where required, an advisory
notice, with records of each issued.** *§8.3.3.*
**Status: Absent.** No advisory-notice or field-action record exists.

**SR-033 — Data from servicing is analysed to show the suitability and
effectiveness of the quality system, and the analysis is recorded.** *§8.4.*
**Status: Met in substance.** Quality objectives per month and quarter, computed
from the register with a stated cut-off and an evidence sheet naming its
assumptions and hard stops (0136–0139).

**SR-034 — Corrective action is taken on causes of nonconformity, and its
effectiveness is verified; preventive action likewise.** *§8.5.2, §8.5.3.*
**Status: Absent.** No CAPA record. SOP-09 in the validation package governs
CAPA for the *software*, not for servicing.

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

## The gap, in order of consequence

Ranked by what an auditor would ask first and by what a patient outcome would
turn on — not by effort.

| # | Gap | SR | Why it ranks here |
| --- | --- | --- | --- |
| 1 | **No post-service verification against acceptance criteria** | SR-006, SR-003 | §7.5.4 asks for verification that product requirements are met. "Solved" is not that. Every other record rests on this one. |
| 2 | **No calibrated-instrument link on a measurement** | SR-020, SR-021 | A reading not tied to a calibrated instrument does not evidence conformity — and if an instrument is later found out of calibration, the affected records cannot be found. |
| 3 | **No recorded complaint determination** | SR-027, SR-028 | §7.5.4(a) is explicit, and the review that would carry it already runs daily. Cheapest of the top five to close. |
| 4 | **No competence record per engineer per product** | SR-018 | Allotment cannot be checked against qualification, and §6.2 evidence has to be assembled by hand. |
| 5 | **No lot/serial of the part fitted** | SR-015 | A supplier field action on a lot cannot be answered: which devices received it? |
| 6 | **No nonconformity, CAPA or advisory-notice record** | SR-031/032/034 | Present on paper, presumably; absent from the system that holds the evidence feeding them. |
| 7 | **Retention period not stated or configured** | SR-024 | A purge runs on a window whose basis is not recorded. |
| 8 | **Reportability decision and clock not recorded** | SR-029 | Review 1 screens for the triggers and then stops. |
| 9 | **Third-party servicing not modelled** | SR-035, SR-036 | Only matters if any servicing is subcontracted — worth confirming either way. |

### What I would build first, and why

**1. Post-service verification (SR-006 + SR-003).** A verification checklist per
product family — parameter, expected value or range, measured value, pass/fail —
completed on the visit that closes a call. It closes the largest gap, it gives
SR-003's reference measurements somewhere to live, and it makes the service
record say what the standard asks it to say. It is also the prerequisite for gap
2 being worth anything.

**2. The complaint determination (SR-027).** One controlled field and a reason,
on the Daily Call Review that already runs. Smallest change in the list, and it
closes an explicit sub-clause.

**3. The instrument register and calibration status (SR-020).** An instrument
master with calibration due dates, and an instrument reference on a
verification reading. Only useful once 1 exists.

Everything else follows from a decision you have not yet been asked to make:
whether nonconformity, CAPA, complaints and vigilance belong **in this system**
or in a separate quality system that this one feeds. That is a governance
question, not a technical one, and it should be answered before any of items
6–8 is built — building them here would otherwise duplicate a register that
exists somewhere else.

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
