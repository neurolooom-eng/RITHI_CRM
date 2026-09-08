# Indoor Service — a plan

**Status: PLAN for review. Nothing built.** Written 2026-09-08 from procedure
§4.5 and ANNEXURE A as supplied. Requirements it closes are SR-040…SR-044 in
`ISO13485_SERVICING.md`.

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
