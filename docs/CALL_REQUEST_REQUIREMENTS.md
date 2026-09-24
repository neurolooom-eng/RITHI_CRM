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

**CR-005a — The Product box and the machine search must name the product the same way.**
Reported 2026-09-24: *"This happens in Extend XT product only."* The Product box
is filled from `product_register_names`, which groups `products.item_name` and
returns it VERBATIM; the machine search asked for `item_name = <that>.trim()`.
For a register row stored as `EXTEND-XT ` the list therefore offered one string
and the search asked for another — measured, the dropdown said 2 machines and
the equality found 0. Every serial box under that product was empty, so no
machine could be picked, so no customer came with it (CR-005), so CR-011 refused
the request. **Product-specific by construction**, which is how it was reported,
and invisible to every other product.
*Status: met* — the product is matched exactly as the picker offered it;
`check:ui` refuses the trim. **The stray character in the data is a separate
fault and is deliberately not repaired in code**: a name with a trailing space
is two products to Postgres and one to a reader, so every `group by item_name`
splits silently — the same argument as the cover vocabulary. It is the user's to
correct with numbers in front of them:
`supabase/apply/_which_product_names_carry_stray_spaces.sql` lists every
affected name, its machine count, and which are safe to change (a space at
either end leaves `machine_key` untouched; a non-breaking or zero-width
character does not, and can collide).

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

**CR-011 — A serial that names no customer is refused, but only after the register has been asked.**
It means the serial matched no machine, and the call would be filed against
nobody. The message names the cause: the machine is missing from Product Master.

**THE ROW HAVING NO CUSTOMER AND THE MACHINE NOT EXISTING ARE DIFFERENT CLAIMS,
and they came apart twice** (reported 2026-09-24 with a screenshot: ORION-G
serial 105 refused, *"the product and serial number combination is very much
available"*). The customer is filled in when a machine is PICKED, so an empty
one really says "this row has no machine behind it **in the browser**" — which
was true when the search never offered the machine (CR-031) and when a stale
search overwrote the cached hits. The register is the authority and the cache
never was.
*Status: met* — `machineRowProblem()`, and `resolveMachines()` asks the register
by MODEL **and** serial before that rule runs. An ambiguous serial still
resolves to nothing (`sbProductBySerial` returns null rather than guessing,
because eleven machines are numbered 219), so a genuinely unanswerable row is
still refused with the message it always had.

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

**CR-031 — A capped search must be ordered, and the closest match must be offered.**
Reported 2026-09-24: *"the list is not sorted as per the closest match"*, on a
request that was then refused for a machine on the register.

The machine search was a single `ilike '%term%'` with `.limit(50)` and **no
`order` at all**, which breaks the project's own rule that every capped read
names an order — and the consequence here is not cosmetic. Measured on a
register where **925** machines carry a serial containing `105`: the machine
actually numbered 105 came back at **rank 19 of 50**, its position decided by
the physical order of the rows rather than by the match. Past the cap it is not
merely far down the list — it is absent, and a machine that cannot be picked
cannot name its customer (CR-005), so CR-011 refuses a machine that exists.

*Status: met* — **three** ordered reads run together, `term%`, `%term` and
`%term%`. The prefix read carries the first guarantee: **a string sorts before
everything it is a prefix of**, so the serial typed is the first row of that
read and the cap can never remove it.

**THE SUFFIX READ IS THE COMMON CASE HERE, NOT SYMMETRY** (the user, 2026-09-24:
*"I have a user case where serial number is INXT 0105, will that populate if I
type 105?"*). A great many serials on this register are a letter code, a space
and a number — and what somebody standing at the machine reads out is the
number. Measured: through the prefix and contains reads alone, `INXT 0105` was
**rank 146 of 1,046** machines whose serial contains `105`, so past the fifty
and not offered at all. Four serials *end* in `105`, so that read cannot be
crowded out.

`rankSerialHits()` then orders them — begins-with, ends-with, contains —
case-insensitively, because `ilike` is. **The cap is applied per group, not to
the ranked list**: sorting by tier and cutting at 50 put `INXT 0105` at rank 52,
one place past the cap, undoing the fix with its own limit. Tier order decides
what comes FIRST; it must not decide what is REACHABLE.

The ranking is a pure function in `lib/callrequest.ts` rather than inside
`supabase.ts`, so `check:ui` can run it on real inputs. An "exact match first"
tier was written and then removed when mutating it changed no result — the
alphabetical tiebreak already does that work, and a tier no test can
distinguish is not doing anything.

*Known limit, stated rather than hidden*: a term buried in the MIDDLE of a
serial, on a register where more than fifty machines match it, may still sit
low in the list. Typing more of the serial is the answer, and the picker's
footer says so.

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
