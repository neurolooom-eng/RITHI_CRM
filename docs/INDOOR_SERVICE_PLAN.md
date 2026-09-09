# Indoor Service — a plan

**Status: PHASE 1 IS BUILT AND SHIPPED (2026-09-09, v0.9.182).** Phases 2 and 3
remain a plan. Written 2026-09-08 from procedure §4.5 and ANNEXURE A as
supplied; extended 2026-09-09 with the ACTIVITY TYPES Vignesh supplied, and
built the same day.

**What Phase 1 shipped:** `0158_indoor_service.sql` — `indoor_jobs` with both
axes and all six activities' field sets, `indoor_job_accessories`,
`indoor_job_parts` and `indoor_job_checks`; the `IND<YY>-<NNNN>` series issued by
the database; five permissions of which three are enforced by a TRIGGER rather
than by hiding buttons; the `/indoor` page with the seven-step drawer; and
`supabase/tests/indoor_service_test.sql`, whose fourteen sections are the
evidence for the requirement statuses above. `_status.sql` row 120 says whether
it reached the live project. **The SQL still has to be run: `indoor.sql`.**

**The five questions that were open have been settled the reversible way, and
each is marked below.** Where a decision could be made softly it was: a warning
is undone by anybody, a hard block needs a migration and an argument. Requirements it closes are SR-040…SR-044 in
`ISO13485_SERVICING.md`; the activities also reach SR-003, SR-006, SR-017 and
SR-020.

Shareable copies:
the plan <https://claude.ai/code/artifact/571e5a56-6a85-41dc-a2fa-b55935b4d044> ·
**the activities and their fields**
<https://claude.ai/code/artifact/2f1a1fd7-71b4-4972-bdc9-4bd7d38f686d>

---

## What the procedure asks the system to hold

The seven steps of §4.5, read as obligations rather than prose:

| § | The step | What has to be recorded |
| --- | --- | --- |
| 4.5.1 | FE cannot fix it on site → consults the Manager → sends the equipment in, **with the report in CRM**, and asks the Hotline engineer to **transfer the call** to Indoor Service | the visit that decided it, the manager consulted, and a transfer that keeps the call |
| 4.5.2 | Central Service receives the equipment (**Customer Property**) into the **Indoor Service Register** | who received it, when, in what condition, with which accessories |
| 4.5.3 | Cleaned and disinfected per **WI/SER/01** | that it was done, by whom, when, against which revision of the WI |
| 4.5.4 | **Identification tag** shows the status of the equipment; accessories tagged with the parent equipment's details | the tag number, the status it shows, and a tag per accessory |
| 4.5.5 | Separate **process tag** for **DEMO units** | which kind of thing this is — and it is not customer property |
| 4.5.6 | Service performed; **on completion a quality check is performed and records are maintained** | the work, and the QC result as its own record |
| 4.5.7 | FE installs it back at the customer, checks, and files the **completion report** | the return, and the visit that closes the original call |

## Two decisions that shape everything else

### 1. The call is TRANSFERRED, not replaced

§4.5.1 says *transfer the call* — the same call, changing hands. So the design
must not close the field call and raise an indoor one. If it did, the chain from
the customer's original complaint to what was eventually found would be split
across two records, which is exactly what §7.5.9 and §4.2.5 exist to prevent, and
it would make the SLA clock restart on a call the customer has been waiting on
since day one.

**One call. One UCN. One history.**

### 2. The register is NOT an attribute of a call

§4.5.5 puts **DEMO units** into Indoor Service, and a DEMO unit has no customer,
no complaint and **no call**. So the Indoor Service Register has to stand on its
own, with the call as an *optional* link.

This is the difference between "a stage a call can be in" and "a register of
equipment held in the workshop". It is the second, and getting that wrong would
mean DEMO units either could not be recorded at all or would need a fake call
raised for them.

It also decides §7.5.10: **customer property is a duty of care; a DEMO unit is
the company's own stock.** The kind field is not a label, it is what says whether
the custody obligations apply — which is precisely why the procedure gives DEMO
units a different tag.

## What KIND of work — the second axis (added 2026-09-09)

Vignesh, on the Indoor activity types:

> 1) Recycling or rework or which is adapted please choose or creat ur own
> 2) Pre delivery checking process
> 3) Demo activity
> 4) Other Activity

**These are a DIFFERENT AXIS from `kind`, and the difference decides the data
model.** `kind` answers *whose property is this* — which is what turns the
custody duties of §7.5.10 on or off. The list above answers *what is being done
to it*. They are not interchangeable: a pre-delivery check and a demo are both on
the company's own stock, while a rework may be on either. One field cannot carry
both without losing one of the answers.

So: **`activity`**, alongside `kind`, not instead of it.

### Six, not four, and here is why

**Repair is missing from the list and has to be there.** It is what §4.5 is
actually about — the machine the field engineer could not fix, sent in under
4.5.1. Vignesh's four read as *the other things the workshop does*, which is the
useful half nobody had written down; adding Repair back makes the set complete
rather than contradicting him.

**"Recycling or rework" is two activities, and he invited the split** ("choose or
creat ur own"). They are different obligations, not different words:

* **Rework** is bringing a NONCONFORMING unit back to specification. §8.3.4 asks
  for a documented rework instruction carrying the same approval as the original
  process, a determination of any **adverse effect** the rework has, and
  **re-verification** afterwards. It is the most heavily specified thing in this
  whole list.
* **Salvage** — harvesting usable parts from a unit that is being scrapped. The
  unit is condemned; the parts enter stock. This is SR-017 (control of
  nonconforming material), currently **Absent**, and it is the activity most
  likely to put an unverified part back into circulation if it is not recorded.

Calling both "recycling" would put a scrapping decision and a repair decision in
the same bucket.

## The fields, by activity

### Common to every activity — the register core

Already in the model above: `job_no`, `kind`, `activity`, `product_name`,
`serial`, `party_name` (nullable), `received_at/by`, `condition_on_arrival`,
`tag_no`, `status`, the cleaning trio (4.5.3), `work_done`, `findings`, the QC
quartet (4.5.6), the dispatch trio (4.5.7), and the stamps.

**Cleaning applies to all six.** A unit that has been in a hospital is
decontaminated before anyone opens it, whether it is going to be repaired,
stripped for parts or sent out on demo — WI/SER/01 does not care why it came in.

### 1 · Repair — from a field call (§4.5.1–4.5.7)

| field | why |
| --- | --- |
| `ucn` | the call it came from. The call is TRANSFERRED, not replaced |
| `transfer_reason`, `manager_consulted` | 4.5.1 — the FE consults before sending |
| `accessories[]` | tagged to the parent (4.5.4), and checked off at dispatch |
| spares against the UCN | so consumption stays in ONE place, not a workshop ledger |

### 2 · Rework — a nonconforming unit corrected (§8.3.4)

| field | why |
| --- | --- |
| `nc_reference` | the nonconformity this is correcting — what was wrong |
| `rework_instruction`, `rework_instruction_rev` | §8.3.4: rework runs to a DOCUMENTED instruction, not from memory |
| `rework_authorised_by`, `rework_authorised_at` | the same authority that approved the original process |
| `adverse_effect_assessed` (Yes/No) + `adverse_effect_note` | **§8.3.4 asks for this explicitly** and it is the field most likely to be left out: does reworking this unit harm it in some other way? |
| `reverified_by/at`, `reverification_result` | rework without re-verification proves nothing |
| `disposition` | Released / Scrapped — a failed rework has to end somewhere |

### 3 · Salvage — parts harvested from a condemned unit (SR-017)

| field | why |
| --- | --- |
| `condemned_reason`, `condemned_by`, `condemned_at` | scrapping a machine is a decision with an author |
| `decontaminated` (hard gate) | nobody opens a used medical device before it is cleaned — this one blocks rather than warns |
| `parts_harvested[]` — code, description, qty, **condition grade**, destination | the grade is the point: a harvested part is not a new part, and it must not silently become one in hand stock |
| `disposal_method`, `disposal_ref` | what was NOT harvested still has to go somewhere — e-waste, and biohazard where the unit was in patient contact |
| `customer_informed` | only where the unit was customer property: scrapping somebody's machine is theirs to know |

> **The open question this raises:** a harvested part entering stock under its
> normal code makes it indistinguishable from new. The register already holds a
> refurbished part under its own code (URS-027) — salvage should do the same, or
> the grade is decoration.

### 4 · Pre-delivery inspection — a new unit before it ships

| field | why |
| --- | --- |
| `source_ref` | the SA number / PO / stock receipt it arrived on |
| `checklist_ref`, `checklist_rev` | which PDI checklist, at which revision |
| `checks[]` — parameter, expected, measured, verdict | **this is SR-006 and SR-003**: expected-vs-measured against a limit, not a reading |
| `instruments[]` — instrument, serial, **calibration due** | **SR-020**, the pair SR-006 needs to mean anything. A measurement from an uncalibrated meter is not evidence |
| `firmware_version`, `accessories_per_packing_list` | what actually shipped |
| `result` — Pass / Pass with observation / Fail | "Pass with observation" is what stops a real finding being rounded up to Pass |
| `released_by/at` or `held_reason` | a Fail does not leave the workshop |

**This activity is where Phase 3 of this plan actually lands.** The parameter
checklist SR-006 asks for is the same structure whether it runs after a repair or
before a delivery — so building it here builds it for both.

### 5 · Demo — a unit out to a prospect

| field | why |
| --- | --- |
| `demo_for_party`, `requested_by` | who it is going to, and who in the company asked |
| `expected_out`, `expected_return` | a demo unit is an asset on loan and it needs a due date |
| `actual_out`, `actual_return`, `custody_holder` | who has it right now |
| `condition_out` / `condition_back`, `accessories` both ways | the same list checked twice, or accessories quietly stop coming back |
| `consumables_used` | a demo burns stock, and that stock is real |
| `outcome` — Converted / Returned / Damaged / Lost, + `sale_ref` | what the demo was FOR |

**Overdue is the number this activity exists to produce:** demo units out past
their expected return, with who holds them. Nothing else in the system tracks
company assets sitting at a customer site.

### 6 · Other — with a rule attached

| field | why |
| --- | --- |
| `activity_note` (**required**) | "Other" with no description is a hole in the record |

> **And a review rule, because this is the field that rots.** If Other passes
> ~10% of jobs in a quarter, the workshop is doing something regularly that the
> list does not name, and the fix is a new activity type — not a bigger free-text
> box. Worth putting on the Tracker as a standing quarterly check rather than
> hoping somebody notices.

## What this changes about the phasing

**Phase 1 gains `activity` and the per-activity field sets**, which is a bigger
Phase 1 than the one above — but the alternative is a register that models one of
six activities and has to be reshaped five times.

**Phase 3 moves earlier for Pre-delivery**, because a PDI without expected-vs-
measured is not a PDI at all; it is a signature. For repair, QC can stay a
recorded Pass in Phase 1 as planned.

## Still to settle on the activities

*Answered where Phase 1 had to have an answer; the rest stand.*

6. **Rework vs Repair — who decides which one a job is?** A unit that arrives
   broken is Repair; a unit that failed OUR OWN check is Rework. The distinction
   is about where the nonconformity came from, and somebody has to make the call
   at intake.
   **Phase 1: whoever receives it, and it can be changed afterwards.** The field
   is a picker on the intake step with no enforcement, because the distinction
   is a judgement about provenance that no rule available to the database can
   make. Getting it wrong costs a corrected field, not a lost record.
7. **Does a salvaged part re-enter hand stock, and under what code?** See the
   note above — this is the one with a real risk attached.
   **Phase 1 RECORDS the harvest and credits NOTHING.** `indoor_job_parts`
   carries the code, quantity, condition grade and a `destination` in words. The
   half that cannot go wrong is recording it; the half that can is a part
   entering stock under its normal code, indistinguishable from new, which is
   exactly what makes the grade decoration. **Still open**, and until it is
   answered no balance moves.
8. **Who may condemn a unit?** Scrapping customer property in particular cannot
   be an engineer's own decision.
   **Phase 1: `indoor.condemn`, its own permission, granted to ADMIN alone on
   apply** — and enforced by the guard trigger, not by hiding the field. Nobody
   else has it until an administrator gives it out on Roles & Permissions. That
   is the safe shape of "not settled yet": the decision is somebody's to make
   deliberately rather than one that arrives with the page. **Still open** as a
   policy question — who *should* hold it.
9. **Is a DEMO unit's `kind` still "DEMO unit" when it is in for repair?** It
   should be: custody does not change because the workshop is doing something
   different to it. This is why the two axes stay separate.
   **SETTLED, and built that way.** `kind` and `activity` are two columns with
   two vocabularies, neither reachable from the other, and `check:ui` fails a
   change that folds one into the other.

## The data model

**`indoor_jobs`** — the Indoor Service Register. One row per equipment intake.

| field | notes |
| --- | --- |
| `job_no` | own series (`IND26-0001`), because a DEMO unit has no UCN to be known by |
| `ucn` | **nullable** — the field call this came from, where there is one |
| `kind` | `Customer property` \| `DEMO unit` — drives the tag series and whether custody applies |
| `product_name`, `serial`, `party_name` | copied from the call at intake, or entered for a DEMO unit |
| `received_at`, `received_by` | 4.5.2 |
| `condition_on_arrival` | what it looked like when it came in — the baseline any later damage claim is judged against |
| `tag_no` | the physical identification tag (4.5.4 / 4.5.5) |
| `status` | Received → Cleaned → Under repair → Awaiting spares → QC → Ready → Dispatched → Closed |
| `cleaned_at`, `cleaned_by`, `cleaning_wi` | 4.5.3, defaulting to `WI/SER/01` |
| `work_done`, `findings` | 4.5.6 |
| `qc_result`, `qc_by`, `qc_at`, `qc_notes` | 4.5.6 — **its own record, not a line in the work text** |
| `dispatched_at`, `dispatched_by`, `dispatch_ref` | 4.5.7 |
| `damage_note`, `reported_to_customer_at/by` | §7.5.10's reporting duty, which otherwise has nowhere to live |
| stamps | `created_by/at`, `updated_by/at`, by trigger as everywhere else |

**`indoor_job_accessories`** — because 4.5.4 says accessories are tagged to the
parent equipment. `job_id`, `name`, `serial`, `tag_no`, `returned`. Returning the
customer's accessories is part of returning their property; a list is what makes
that checkable at dispatch.

**`indoor_transfers`** — the call's side of 4.5.1: `ucn`, `job_id`, `reason`,
`manager_consulted`, `transferred_by`, `transferred_at`. A log, not a status
field, so a machine that goes in twice reads as two events.

### What this deliberately does NOT touch

**No column is added to the three call tables, and the `calls` view is not
rebuilt.** A call is "at Indoor Service" *iff* it has an open `indoor_jobs` row —
derived, looked up in one request the way `useCallStates` already resolves UCN
colours for the spare registers.

That is not a shortcut, it is the safer road: `create or replace view` on `calls`
drops `security_invoker`, which has silently exposed every call to every user
three times in this project (0040 → 0050 → 0057). Avoiding a rebuild of that view
avoids the whole class.

## The screens

**Indoor Service Register** (`/indoor`) — the register, in the project's own
table + drawer idiom. Filter by status, by kind, by product. This is the page
that finally makes the **Indoor Service** nav group appear: a group with no items
renders as nothing (`Layout.tsx`), which is why the heading could not be added on
its own back in the morning.

**The job drawer** — the seven steps as a sequence you move through, each stamping
who and when:

1. **Receive** — kind, product/serial (prefilled from the call), condition,
   accessories, tag number.
2. **Clean** — one action, recording the WI and its revision.
3. **Work** — findings, work done, spares (against the UCN, so consumption stays
   in one place).
4. **QC** — Pass/Fail, notes, by whom. **Fail returns it to Under repair**; a
   machine cannot leave with a failed check.
5. **Dispatch** — with the accessory checklist, so nothing of the customer's stays
   behind.
6. **Close** — on the field engineer's completion report against the original
   call (4.5.7).

**On the call itself** — a chip saying it is at Indoor Service with the job
number, and the job's status. Somebody looking at the call should not have to
know the workshop exists to find out where the machine is.

## Permissions

`mod:/indoor` for the page, and separate actions because the procedure separates
the roles: `indoor.receive`, `indoor.work`, `indoor.qc`, `indoor.dispatch`, plus
`calls.transfer_indoor` for 4.5.1 — which the procedure gives to the **Hotline**
engineer, not the field engineer.

`indoor.qc` being its own right is the one that matters: it is what allows the
check to be somebody other than the person who did the work.

## Phasing

**Phase 1 — the register.** Tables, RLS, the page, the nav group, the seven-step
drawer, permissions, the test suite. Stands alone: DEMO units alone justify it,
and it needs nothing from the call side.

**Phase 2 — the loop with the call.** The transfer (4.5.1), the chip on the call,
the completion report closing it (4.5.7), and the register's link back.

**Phase 3 — QC that means something.** Phase 1's QC records a Pass; Phase 3 gives
it *criteria* — the per-product parameter/expected-value checklist that SR-006 and
SR-003 actually ask for, and the instrument reference that SR-020 needs. This is
the phase that closes the largest gap in the requirements document, and it is
last because it needs the reference measurements, which do not exist as data yet.

## To settle before building

*Phase 1 needed answers to 2 and 4 and got them; 1, 3 and 5 belong to phases
that have not been built, and are untouched.*

**2 — Must QC be done by somebody other than the person who did the work?**
**A WARNING, not a block.** The procedure does not say. Both names are recorded,
`indoor.qc` is a permission separate from `indoor.work` so the segregation is
*arrangeable*, and the screen says plainly when the two are the same person.
Turning it into a refusal is one line in the trigger the day it is decided;
unblocking a workshop that turns out to have one qualified person is not.

**4 — Job numbering `IND26-0001` per year?** **Yes, as proposed** — and issued
by the DATABASE, with a client-supplied number discarded rather than accepted. A
number the client may set is a number two people can mint, and the first thing
that happens then is two machines answering to one job number.

1. **Does Central Service hold its own spare stock?** Hand stock is per engineer
   here. A workshop drawing parts is either an engineer's balance or a location's
   — and they behave differently.
2. **Must QC be done by someone other than the person who did the work?** The
   procedure does not say. A warning is cheap; a hard block is a decision.
3. **Does the SLA clock keep running while the machine is in the workshop?**
   ANNEXURE A sets completion targets and the customer is still waiting — but if
   it keeps running, indoor jobs will dominate the breach list, which may be the
   truth or may be a distortion.
4. **Job numbering** — `IND26-0001` per year, as proposed?
5. **Who may transfer a call to Indoor?** The procedure says the Hotline engineer.
   Managers too, or Hotline only?

## What it closes

SR-040 (custody of customer property, and the duty to report damage), SR-041
(cleaning to the WI), SR-042 (the identification tag, the status it shows, the
accessory tags, and the DEMO distinction), SR-044 (one call across the transfer).
SR-043 is closed in *form* by Phase 1 and in *substance* by Phase 3 — a recorded
QC result is not yet a verification against acceptance criteria, and the
difference is the whole of SR-006.
