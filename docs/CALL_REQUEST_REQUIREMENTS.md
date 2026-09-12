# Call Request — requirements

**Status: DRAFT, written 2026-09-12 from the module as built.** Not a controlled
document. It describes what the Call Request module must do and states, for each
requirement, whether the system does it today.

**This file is a standing reference.** The module was redesigned substantially on
2026-09-11/12 — the machine now names the customer, and the customer search is
gone from the form — and the reasoning for that sits scattered across a dozen
commit messages. It is gathered here so the next change starts from the rule
rather than from the code.

**Keeping it current is part of the change.** A requirement's status line is
updated in the same commit that makes it true. A requirement set that lags the
system is worse than none, because somebody plans around it.

---

## What this is, and what it is not

This is the requirement set for **raising a call request**: the record an
engineer or the service desk creates to ask that one or more service calls be
registered against known machines.

It is **not** the requirement set for the servicing process — that is
[`ISO13485_SERVICING.md`](ISO13485_SERVICING.md), which asks what the process
must do under §7.5.4. And it is not the software validation package
(`src/lib/validation.ts`), which asks whether the application is fit to be used
in the quality system under §4.1.6. A request is the *front door* to both: what
it captures wrongly, everything downstream carries.

Where a requirement here has a counterpart in the validation package it is
cross-referenced (URS-053 and URS-054 are the two that matter most).

## The shape of the thing

A **request** is one visit to one site. It carries:

* a **REQID**, minted by the database (`next_call_reqid`);
* **one customer**, established by its first call;
* **one to five calls**, each a machine plus a complaint.

Each call becomes its own row in `public.call_requests`, sharing the REQID, and
each is keyed by a **UniqueID** of `REQID-Product-Serial`. The Hotline actions a
request in Pending Registrations, where it becomes a registered call with a UCN.

---

## A. Identity and keys

**CR-001 — A request is identified by a REQID the database mints.**
Never by the client. Two people raising a request at the same moment must not
collide, and a REQID that arrives from a browser is a number somebody can choose.
*Status: met* — `next_call_reqid()` (0010), with a trigger keeping the counter
ahead of any imported REQID (0097).

**CR-002 — Each call on a request is keyed `REQID-Product-Serial`.**
The key is the database's, rebuilt on every write from the row's own columns, so
it cannot drift from what the row says.
*Status: met* — `call_requests_biu` (0003, 0083).

**CR-003 — A key that reads `…-NA` is a defect, not a variant.**
`NA` in the key means the row named no machine. Every downstream lookup then
matches the wrong unit or none.
*Status: met by CR-010* — the serial is mandatory, so new requests cannot
produce one. Historic rows may still carry `-NA` and are corrected by hand.

**CR-004 — One machine appears at most once on a request.**
Its UniqueID would otherwise be issued twice; the database would refuse the pair
anyway, and refusing it on the form says which row it clashes with.
*Status: met* — `machineRowProblem()` in `src/lib/callrequest.ts`, checked on the
serial alone because the rows may name different customers.

## B. The machine, and the customer it names

**CR-005 — The customer is read off the machine, never asked for separately.**
This is the module's central rule (user's design, 2026-09-11). A customer chosen
beside the machine can disagree with it, and did: `R18627` was filed against the
wrong customer and corrected by hand.
*Status: met* — Product → Serial → customer, per call row.
*Cross-reference: URS-053.*

**CR-006 — Identifying the machine must not require identifying the customer first.**
A customer name is an infix match over ~5,000 names; a serial is a prefix on an
indexed column. Measured over all 19,253 machines as a signed-in engineer: serial
prefix **0.21 ms**, mid-string **1.7–5 ms**. The old order timed out on a phone
and reported `canceling statement due to statement timeout`.
*Status: met* — the first call searches every machine on record. The party filter
in `sbSearchMachines` is **conditional**, and `check:ui` refuses an unconditional
one, because that would restore the old ordering.

**CR-007 — The first call fixes the customer for the request.**
A request is one visit to one site (user's rule, 2026-09-12).
*Status: met* — calls 2–5 inherit the customer and are offered only that
customer's products and machines.

**CR-008 — A later call inherits the site, it does not ask for it again.**
Customer, city, state, address and both contacts are copied from the first call.
Asking five times is how five spellings of one hospital reach one request.
*Status: met.*

**CR-009 — Changing the first call's customer cannot leave a machine behind.**
A machine belonging to the customer just replaced is cleared from the later
calls. Leaving it would file a call against a machine this customer does not own.
*Status: met.*

## C. What a request must capture

**CR-010 — The serial number is mandatory.**
A call that names a product but not a unit cannot be traced to the device
serviced, and its cover cannot be established.
*Status: met* — required on the request and on every call form.
*Cross-reference: URS-053.*

**CR-011 — A serial that names no customer is refused.**
It means the serial matched no machine, and the call would be filed against
nobody. The message names the cause: the machine is missing from Product Master.
*Status: met* — `machineRowProblem()`.

**CR-012 — An empty master is a master problem, and the form says so.**
It never offers a way round by accepting a typed value instead.
*Status: met* — the serial picker takes no free text outside installations.

**CR-013 — The site is recorded per call, not per request.**
City, state, address and contact belong to the machine's location. Two machines
on one request can be in two buildings.
*Status: met* (2026-09-12). Prefilled from the register and editable — the
register records where the machine was *sold*, and a ward move is filed with
nobody.

**CR-014 — A value the person typed is never overwritten by the register.**
Prefill fills what is empty. A correction must not be undone by the thing it was
correcting.
*Status: met.*

**CR-015 — The Standard Complaint is chosen, never typed.**
Every count, filter and repeat-failure match downstream runs on that value; a
hand-typed variant matches nothing.
*Status: met.*
*Cross-reference: URS-045.*

**CR-016 — Reported Problem is mandatory and free.**
It is the customer's words. Constraining it would lose the only unstructured
account of the fault.
*Status: met.*

## D. The installation exception

**CR-017 — An installation asks for the customer, because there is no machine yet.**
The unit is not on the register, so nothing can name the customer. This path
keeps the Party Master search, free text for a genuinely new customer, and a
typed serial.
*Status: met* — the whole customer block renders for installations only.

**CR-018 — Installation is the only path that accepts a customer not on a master.**
Everywhere else a typed customer is a master entry that does not exist.
*Status: met* — `allowFreeText` is set for installations alone.

## E. Status and hand-over

**CR-019 — A request's status follows its UCN.**
A request carrying a UCN is Registered; the database decides, not the client.
*Status: met* — `call_requests_biu` sets `Registered` when a UCN is present and
the status is blank or Pending (0083).

**CR-020 — A request is never deleted.**
It is Cancelled, with a reason, and stays on the register.
*Status: met* — `cancel_reason`, `cancelled_at`.

**CR-021 — Pending Registrations reads `call_requests`.**
Not `pending_registrations`, which is the sheet-era table. Two fixes were aimed
at the wrong table before this was written down.
*Status: met* — `listPending()` → `listCallRequestsAsPending()`.

## F. Who may see and raise one

**CR-022 — Raising a request is a permission.**
*Status: met* — `request.create`.

**CR-023 — A person sees the requests that are theirs, their team's, or their desk's.**
Office roles with `data.view_all` see all.
*Status: met* — `cr_read`: `can_view_all_calls()`, the registrant, the submitting
e-mail, or the reporting tree.

**CR-024 — The visibility rule is evaluated once per query, not once per row.**
This is a requirement, not an optimisation. Evaluated per row it cost an engineer
**1,840 ms** against an administrator's **189 ms** on 3,000 requests — the
difference being that the administrator's test short-circuits and an engineer's
does not — and it grows with the register, not with what the reader can see.
*Status: met* — `0164_cr_read_initplan.sql`, each helper wrapped as `(select …)`.
Run `supabase/apply/call_requests.sql` to apply it.

## G. Performance

**CR-025 — No control on this form may cost more as the register grows.**
The form is used on a phone, on hospital wi-fi, by somebody standing next to a
machine.
*Status: met* — the product list is ~40 names fetched once; the machine search is
a bounded, indexed lookup; the customer search is gone from this form entirely.

**CR-026 — A list that is capped must be complete by some other route.**
A capped read can miss the row somebody is looking for — the fault that hid
KARUNALAYA TRUST.
*Status: met where capping is used* — on the installation path the Party Master
read is ordered and complete and runs alongside the capped owner list.

**CR-027 — A search that fails must say so, and must never look like an empty result.**
"Nothing matches" on a customer somebody is looking straight at leads them to
raise a duplicate.
*Status: met* — `PickList` reports a failed search distinctly and clears it on the
next success.

## H. Records and evidence

**CR-028 — The person who raised a request is the database's to say.**
*Status: met* — `created_by` is stamped from the session; a caller-supplied value
is discarded.
*Cross-reference: URS-044, which draws the same distinction on a call.*

**CR-029 — Supporting documents attach to the request and follow it to the call.**
*Status: met* — service manuals matched by product, plus the installation report
and KYC on an installation.

**CR-030 — Every field the form collects is written per call row.**
`call_requests` holds party, city, state, address and contact per row; the form's
grouping is a convenience, never the record's shape.
*Status: met* — this is why C and B above needed no migration.

---

## Open, and deliberately so

* **Contact details are not prefilled.** The product register has no contact for
  a site, so the two contact fields start empty on every call. A source for them
  would close this; inventing one would be worse.
* **A request cannot span customers.** CR-007 is a decision, not a limitation
  discovered late: the alternative was a request whose header described one site
  and whose rows described several. If a genuine need appears for a batch across
  customers, it is a new kind of record, not a loosened rule here.
* **Historic `-NA` keys remain.** CR-003 stops new ones. There is no sweep of the
  old, and any correction changes the row's UniqueID, so it is done deliberately
  and one at a time.
