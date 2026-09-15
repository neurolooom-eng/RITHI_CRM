# Field Service Handbook — how to use RITHI CRM

Shareable copy: <https://claude.ai/code/artifact/a6cb9ac1-cd68-47f7-9ce9-7e88eafc5908>

Every screen in the application — what it is for and the rules that are easy to
get wrong. Written for the people using it, not for the code: where this and the
application disagree, **the application is right and this file is the bug**.

---

## Rules that apply everywhere

**The call status colour code.** Identical wherever a UCN appears, in every
module, light or dark:

| Status | Colour |
| --- | --- |
| Unattended | RED `#d32f2f` |
| Unsolved | BLUE `#1565c0` |
| Solved — Report Pending | PINK `#c2185b` |
| Solved | GREEN `#2e7d32` |

A call is **Unattended** only while it has no visit at all; after that its status
is the latest visit's. A UCN whose status is unknown renders plain rather than
guessing — a wrong colour on a code is worse than no colour.

**A number ending in `+` is a lower bound.** Registers load in pages, so "90+"
means *at least* 90. A number without one is exact.

**Every dropdown is type-and-pick.** Type to filter, click or Enter to commit;
nothing commits on a keystroke. Under eight options there is no search box. Where
a list comes from a master you cannot type a value that is not on it.

**Quality records are never deleted.** A wrong spare line is **voided** — the
quantity goes to zero, the row stays with its original quantity, reason and
author, and the stock returns. A failure report is cancelled or withdrawn.

**You see what your role allows.** Two people can open the same screen and see
different totals. An empty register usually means access, not emptiness.

---

## Overview & search

- **Dashboard** `/` — what is open, what is overdue, what needs you.
- **Product & Party Search** `/lookup` — find a machine or customer and see
  everything about it. The party list comes from the machines on record, so every
  customer offered has something to find.
- **Spare Insights** `/spare-insights` — consumption over a window, five ways.
  Both ends of the window count; voided lines do not; an uncategorised part shows
  as Unclassified rather than guessed at.

## Requests & registration

- **Request Registration** `/request-registration` — **the machine names the
  customer**: search the serial first and the customer follows. An installation is
  the exception, since the machine may not exist yet.
- **Pending Registrations** `/pending-registrations` — the Hotline queue.
  Registering one issues the UCN and files the call.
  > The call is filed to the Hotline desk, but the system separately records *who
  > actually typed it in*. The two differing is a finding, not an error.

## The call registers

- **Field Call Register** `/field-calls` — breakdown calls.
- **Installation Calls** `/installations` — new machines going in.
- **Preventive (PM)** `/pm-calls` — planned maintenance.
- **Pending Calls** `/pending-calls` — everything still open, across all three.
- **Visit Reports / Service Reports** `/reports` — one row per **visit**, not per
  call.
  > **Two dates, on purpose.** *Visit date* is when the engineer was there;
  > *entry date* is when the register was told. A visit on 30 May written up on
  > 3 June closes the call in May.

**What you may change on a call** is four separate rights — the complaint, the
customer and machine, the vigilance answers, the contact details — so a manager
can have some and not others. Re-allocating to another engineer is its own right.
**Every change to a vigilance answer is recorded** (who, when, from what to what),
because those three answers are Review 1. A call can be **cancelled** (and
restored) or **closed without a visit**; neither deletes anything.

## Getting data in

- **Bulk Uploads** `/bulk-uploads` — **this is the importer.** It finds the
  heading row even under a letterhead, reads tab-separated files, and lists what
  it kept and what it held back. Unrecognised columns are **kept on the row**
  where the register allows it.
- **Bulk Report Mapping** `/report-mapping` — attaches a batch of visit reports to
  their calls.
- **PM Bulk Upload** `/pm-bulk-upload` — loads a maintenance schedule in one go.

## Spares

A part is requested, approved in stages, dispatched, received, then booked
against the call it was fitted to.

1. **Spare Requests** `/spare-requests` — the engineer asks for a part against a
   call.
2. **RM Approval** `/spare-rm-approval` — the queue shows the complaint, machine,
   serial and cover, because "is this part plausible for this fault?" is most of
   the decision. Approve, reject or drop many at once; the last two need a reason.
3. Commercial and NSM approve their own stages where the request needs them.
4. **Pending Dispatch** `/spare-dispatch` — Stores issues the part and raises the
   Delivery Challan.
5. The engineer **acknowledges receipt**.
6. **Spare Consumption** `/spare-consumption` — the part is booked against the
   call.

- **Stock Out** `/stock-out` — a flat list of what Stores has issued; a different
  question from the dispatch queue, and now grantable separately.
- **Hand Stock** `/handstock` — what an engineer holds. **Worked out, never
  stored**: issued − consumed ± transfers − returns.
  > **Why a booking can be refused.** Consumption is capped at the engineer's
  > balance. If the balance is wrong the Spare Coordinator corrects the stock; the
  > engineer does not book around it.
- **Material Returns (MRN)** `/mrn` — parts back to Stores; the return puts the
  stock back on the balance.
- **Stock Transfer** `/stock-transfer` — hand stock between engineers. A transfer
  to the same person is held back and named.

## Quality

- **Daily Call Review** `/daily-review` — Review 1 is the vigilance answer taken
  > **Frequent failure has two rules.** **Rule 1** — this machine failing again
  > (same product and serial) within the window. **Rule 2** — the same complaint
  > on **different serial numbers** of one product within 30 days, which is a
  > batch or component problem rather than one unit. It counts serials, not
  > calls, so several visits to one machine stay rule 1's finding. Either rule
  > makes it a frequent failure, and the screen says which. Both are tuned in
  > Admin Config.
  > **Change product?** (Review 2). Where what actually failed is an **accessory**
  > logged against the machine it is fitted to — a CPX CARE failure raised on an
  > EXTEND-XT — name the real product here. The failure is then counted against
  > that accessory and **not** against the machine. The call itself is not
  > changed: it still records that a machine was down and an engineer attended,
  > and the register shows both. Blank is the normal answer.
  at registration; **Review 2** asks what the failure was; **Review 3** classifies
  it.
  - Your name is recorded when a stage completes, on every path including
    auto-save and the bulk answer. A later edit does not reassign it.
  - Answering in bulk refuses a first-year failure or an unknown age — those are
    reviewed one at a time.
  - A call logged today stays pending all day; from 9:15 the next morning Review 2
    answers itself *No*, marked as automatic.
- **Call Review** `/call-review` — a second look at the **report** on a solved
  call. Book a spare the engineer did not record (a **Reconciliation** line,
  visibly a correction), re-open the call, or mark it Report Reviewed.
- **Field Failure Register** `/failure-report` — failures that go back to
  manufacturing, on the controlled form `R-SER-03`, numbered `FFR - 001/26` and
  restarting each year.
  - **A report raises itself** when the Daily Call Review answers any of Risk to
    Patient, Warranty Failure or Frequent Failure as *Yes*.
  - **Year and Product, both taking several values.** Tick as many as you like;
    the list stays open while you tick, and nothing ticked means everything.
    Year opens on this year; Product opens on all, so it costs nothing until you
    use it. The products offered are the ones the years you chose actually hold.
  - They narrow the register, the table and Insights together, so the three
    cannot disagree about the period. If the filters match nothing, the screen
    says so and offers to clear them — an empty result and an empty register
    look identical and mean different things.
  - **Register → Desk**: reports left, the report centre, the call's visits and
    spares right.
  - **Print** the R-SER-03 page or download **Word**. Your saved signature prints
    only where the form names you.
  - **Insights**: click any bar, slice, point or column and every figure narrows
    to it.
    - **Reports raised** is a trend line, readable **Monthly, Quarterly or
      Yearly**. Changing the scale clears the point you had chosen — a month is
      not a quarter, and keeping it would filter on nothing.
    - **Pareto** — bars are the count, the line is the running share, the dashes
      mark 80%. What sits left of the crossing accounts for four-fifths of the
      reports: the shortlist, not a verdict.
      It **drills down**: Machine first, then Complaint grouping and Root cause
      in whichever order suits the question, or straight past either. Clicking a
      bar fixes that level and ranks what is left inside it; the path above the
      chart shows what is fixed and what is still open, and any step can be
      dropped on its own.
      Its **numbers sit beside it** — reports, share, running total, cumulative %
      — with **Download** for the same split-up plus a sheet saying how each
      figure was arrived at and what it left off the chart.
    - On every **horizontal bar chart** the total sits next to the name and the
      bar comes last. **Drag the edge of the name column** to whatever width
      suits; each chart remembers yours.
  - Filters sit on the left of the bar, the view buttons on the right.
  - Every change is recorded — only the fields that differed, with who and when.
  > If the review later says *No*, the report still stands and shows as
  > **withdrawn**. The withdrawal is itself the thing worth seeing.
- **Customer Feedback** `/feedback` — what customers told us, kept with the calls.
  - **Date** is the feedback's own date — for a loaded row, the date the export
    gave it; for one taken here, when it was taken. **Loaded on** is a separate
    column, because when a row arrived is a different fact from when the customer
    spoke.
  - **Uploaded** and **Entered here** are told apart, with a count on each.

## Cover

- **Warranty Register** `/warranties` — sale entries (`SA`) and the machines sold
  under each.
- **Contract Register** `/contracts` — contract entries (`MC`) and the machines
  covered.

Both work the same way. Two views: **Entries** (the deal and its machines) and
**Machines** (per serial, with Active / About to expire / Inactive tiles). Each
opens on **2,000 rows** — two full requests of the 1,000 the database hands over
at once — and every **Load more** fetches twice as much as the one before.
**"+ New entry" arrives with its number already in it** — offered, not reserved,
so two people starting at once get the same number and the second is refused on
saving.

**About to expire means the last 30 days** — the same band the old sheet used,
counted to the end date and including it. Before that it is Active; after it,
Inactive. A machine with no end date shows **Not covered**, which is not the
same as Inactive: nobody has said the cover ended, the date is simply missing.

Type the period in **months** and the rest fills in:

| You type | Warranty | Contract |
| --- | --- | --- |
| 24 months | 2 years · 6 PM visits | 2 years · 4 PM visits |
| 18 months | 1.5 years · 4 PM visits | 1.5 years · 3 PM visits |

The two visit rates differ: warranty three a year, a contract one every six
months. On a contract machine line a **Rate** fills in 18% tax and the total.
A **Payment Schedule** can be Yearly, Half Yearly, Quarterly or Monthly.

On a warranty machine line, filling in **Already Sold To** sets **Add Call**:
`WI-` for a machine nobody has owned before, `RWI-` where it names somebody.

**A machine follows its entry**: a field left empty follows the header, typing
pins that machine, ↺ hands it back.
> The end date stays typeable and editing it changes nothing else, so a contract
> that does not run a whole number of months still works.

- **Ownership Transfer** `/ownership-transfer` — one row per hand-over; the
  machine follows the **latest** transfer.
  - **Leave "From Party" blank** and it fills from whoever holds the machine now,
    which is what lets a historical list load in date order.
  - If the previous owner cannot be worked out the hand-over is still recorded
    with that field blank, not dropped.
  - Matched on the OT number **and** the machine, so a corrected export updates
    rather than arriving twice.

## Masters & documents

What the rest of the application picks from. A value not on a master cannot be
typed into a form that reads it.

- **Party Master** `/parties` — customers and dealers.
- **Product Database** `/product-database` — every machine by serial, with its
  warranty, contract and current owner. This is where a call reads cover from.
  It keeps **all 32 columns** of the ProdMaster file — Item Code, the address,
  the PO, PM Visits, the installation fields and the rest. Eleven of them are on
  screen when it opens; **⚙ Columns** offers the other twenty-one, and
  **Export CSV** gives you every one of them whether or not it is on screen.
  > **Warranty Status** and **Contract Status** here are the words the FILE
  > used. They are not the Active / About to expire / Inactive the system works
  > out from the dates, and the two can disagree — which is worth seeing.
- **Product Master** `/product-master` — the list of **product lines**, one row
  per product code: type, category, short form, and whether it is still sold.
  Not the machines — those are the Product Database.
  > **Inactive** means the line is no longer sold, so a **new Sale Entry**
  > cannot name it. It changes nothing else: machines already sold still take
  > contracts, calls, visits, spares and feedback. A line stops being sold long
  > before it stops being serviced.
  Load it under **Bulk Uploads → Product Master (product lines)**.
- **Part Master** `/parts` — the item catalogue. An inactive part stays on records
  that use it but is not offered in pickers.
  > **Editing a part.** **Spare / Consumable** is a list of the four the Item
  > Master uses; a value your file brought that is not one of them still shows
  > and still saves. **Product** is a multiple choice of **short forms** from
  > Product Master (ORG, MT75, CPX) — a shared spare fits more than one machine,
  > and retired lines are offered because a part still fits a machine no longer
  > sold. Empty means none recorded, not all. Cost is an ordinary field.
  > The **code and description together are the part's identity** — every
  > consumption line, hand-stock row, issue, dispatch, transfer and return names
  > the part by `CODE|Description` — so changing either is a **rename**, and the
  > rename moves all of those records with it. The screen tells you how many
  > will move before you commit to it, and stock balances come out unchanged.
  > A rename will not merge two parts: if the new name is taken, it is refused.
- **Party Master** `/parties` — your customers, and **who looks after each one**.
  > The **Serviceman** on a party is what fills *Call Allocated To* on a new
  > call when the machine itself has no Service Engineer — which is every
  > **installation**, because the machine does not exist here yet. The machine
  > wins where it has one; this only answers where it cannot.
  > It is a suggestion, not an assignment: whoever registers the call can change
  > it, and a call registered **from a request** keeps the request's engineer
  > regardless.
- **User Master** `/user-master` — people, roles and the reporting line. A
  manager's team is worked out from here.
  > **The role on this screen IS their access.** Change it here and it applies
  > to their sign-in straight away; they see it the next time they load the app.
  > Set it before they ever sign in and they arrive with it. **Access** on a row
  > is the same role plus anything extra that one person needs on top.
  > Two things it will not do. You cannot change your own role — ask another
  > administrator, and the save is refused rather than half-applied. And a role
  > that is not on **Roles & Permissions** grants nothing: if you mean a new
  > role, add it there first.
  > **One person, one row.** Where two rows share an email the role still
  > applies, but the name stops following, because there is no way to tell which
  > of the two is theirs.
- **All Masters** `/masters` — the value lists behind the dropdowns. Rights are
  **per list**.
  > A value in use is **deactivated**, not deleted, so records that used it keep
  > reading correctly.
- **Service Manuals** `/service-manuals` — indexed by product, so a call shows the
  right ones.
- **QMS Documents** `/qms` — with number and revision.

## Analysis & reports

- **KPI & Failure Analysis** `/kpi` — failure rate by product, region × cover, and
  spare use by cover, product and region.
- **Machine History** `/machine-history` — one machine, its whole life. Pick the
  **product first, then the serial**: the same serial number belongs to several
  models, so a serial on its own would show you a different hospital's machine.
  - **Where it is now** — whose it is, its status, where, which engineer, and the
    warranty and contract it is under.
  - **Everything recorded against it** — calls, visits, spares fitted, Field
    Failure Reports, customer feedback, sale/warranty, contracts, ownership
    transfers, additional entries and workshop jobs. Filter by register, or
    export.
  > A machine not on the Product Master still has a history, and the screen says
  > so rather than looking empty. Nothing from before the migration is here.
- **Objective** `/objective` — the year's objectives with targets, owners and the
  month-by-month actual.
  - **Re-Calculate is explicit**, never on opening the page. Only objectives with
    a formula, only up to this month, never a typed figure.
  - Each month is measured as at the end of that month.
  - A quarterly objective reports in its quarter's last month; the others read NA,
    not zero.
  - It shows its working on three tabs, the third counted from the first two.
  - **No. of Field failures registered in FFR** works itself out too. It counts
    the Field Failure **Reports** dated in the month — by report, not by row, so
    one report covering three machines counts once while the evidence sheet
    lists all three, and says why it has more lines than the figure.
  - **A month with none reads 0, not blank.** Blank means nobody has measured
    it. That is the opposite of the rate objectives, where a rate over no
    machines is undefined and stays blank.
- **Reports — Consumption Report** `/exports/consumption` — one row per spare
  booked, with its call and that call's latest visit.
- **Reports — Call Report** `/exports/calls` — **one row per call**, never per
  visit, with its latest visit and what was fitted. Narrow it, tick the extra
  columns you want, take Excel or CSV.
- **Reports — Customer Feedback Report** `/exports/feedback` — one row per
  feedback, each question its own column.
  > A **blank on a question means it was not asked** of that kind of visit — an
  > installation and a PM visit are asked different things. It is not a missing
  > answer, and the file says so.
  > The date it filters on is the **feedback's own**, not the day it was loaded.
- **Reports — Not Consumed Against this Call** `/exports/unused` — `NOT USED`
  where none was booked, `SHORT` where less was booked than sent. Refused and
  dropped lines are excluded.
- **Reports — KPI Export** `/exports/kpi` — the workbook's Field_INST tab in its
  own column order; cancelled calls excluded entirely.

## Workshop & activity

- **Indoor Service Register** `/indoor` — work on a unit in the workshop. Two
  things are asked separately: whose **property** the unit is, and what
  **activity** is being done.
  1. Received
  2. Cleaned and disinfected — before anyone works on it
  3. Findings and work done, including parts harvested
  4. Quality check
  5. Dispatch
  > A job does not need a call — a demo unit has none. A harvested part cannot go
  > back into stock until decontamination is recorded.
- **Tracker** `/tracker` — the shared activity list. Anyone who can open it can
  add and edit. Who raised an item is stamped and cannot be rewritten. Nothing is
  auto-deleted; Done and Dropped stay and the page hides them.

## Administration

- **User Access** `/users` — who can sign in and on what role; an administrator
  resets a forgotten password here.
- **Roles & Permissions** `/roles` — which role holds which right, page by page and
  action by action. Roles can be added without code.
  > **If a role sees nothing** it is almost always a missing *action*, not a
  > missing page: a role with some permissions but not "View calls" sees an empty
  > register with everything apparently granted.
  > **If a MENU ENTRY is missing entirely** — the screen exists, other people
  > describe it, and it is simply not on your menu — that is the page
  > permission, and it is the one thing that shows no error at all. Tick the
  > page here for the role. The headings and their order match the menu exactly,
  > so look for it under the group it sits in on the left.
- **Audit Log** `/audit` — what was recorded while audit mode was on. Turning it on
  or off needs a reason, and that history outlives the log.
- **Admin Config** `/admin-config` — the settings the rules read: the
  frequent-failure window and threshold, the objective cut-offs and their lock,
  audit mode.
- **Software Validation** `/software-validation` — the ISO 13485 §4.1.6 package:
  intended use, regulatory basis, requirements and the tests that answer them.
  > Not the servicing process requirements. Software validation does not discharge
  > a process requirement, which is why they are two documents.
- **Settings** `/settings` — your preferences, and for an administrator the
  connection settings.
- **Your Profile** `/profile` — **My Signature** lives here, not in Settings:
  only you can see or set it, and it prints only in the block that names you. An
  administrator can ask who has saved one and remove a leaver's, never read one.
- **Version History** `/version-history` — what changed in each release.
