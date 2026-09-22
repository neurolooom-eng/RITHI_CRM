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
- **Data Export** `/data-export` — tick the tables you want and download them as
  one ZIP with a CSV per table. **The export runs as you** — it holds exactly the
  rows you are entitled to see, which is what makes it safe to have on a menu.
  The audit trails are deliberately not offered. Row counts beside each table are
  the database's own **estimates**, so they say "approx." rather than pretending
  to be exact.

  > ### Scheduling one
  >
  > The same screen sets up schedules: name it, tick the tables, choose **every
  > day** or **one weekday**, pick the time (**IST**). The chosen tables then
  > arrive by email as one ZIP of CSV files.
  >
  > **You choose which tables and when. You cannot choose where it goes.** The
  > recipients are set once on the server by whoever holds the project keys. A
  > nightly copy of the whole customer base with an address anybody could edit on
  > a screen is the one thing this must never be — so there is no recipient box,
  > on purpose.
  >
  > An **audit trail can never be scheduled**. A schedule that is too big to
  > attach leaves out the largest tables and **names them in the mail** — nothing
  > is ever trimmed to fit, because a file that looks complete and is not is
  > worse than one that is missing.
  >
  > **Pause** stops a schedule without deleting it; a paused one shows no next
  > run, because it is not going to happen. "What has been sent" is the record of
  > every run — readable, and not editable or erasable from any screen.
  >
  > **Nothing is sent until the mail side is deployed once.** Steps are in
  > `supabase/functions/scheduled-export/README.md`. Schedules saved before then
  > are kept and start sending when it goes live.

- **Bulk Report Mapping** `/report-mapping` — attaches a batch of visit reports to
  their calls.

  > ### Filling Visit Date & Time and Visit Entry Date on consumption data
  >
  > **Those two are not fields on the consumption row.** The Consumption Report
  > reads them from the **visit**, so there is nothing on the spare line to
  > type them into and re-uploading the consumption file cannot fill them.
  > They are blank for one reason: the call has no visit report.
  >
  > **If your consumption file carries `Visit Date & Time`, just load it.**
  > The Consumption upload files the visit from that column BEFORE it writes the
  > spares, so both dates and the **Visit UID** fill in on their own. One visit
  > per UCN, not one per spare line. A row whose call has no visit and no date in
  > the file is **held back and named** — the rest of the file still loads.
  >
  > Two things that load also does: a `Call Status` in the file becomes the
  > call's status, and where the file gives none the call reads **Report
  > pending**. Re-loading the same file does not make a second visit.
  >
  > **Otherwise, load the visits separately.** *Bulk Uploads → Visit Reports →
  > Field Reports* (or *Installation* / *PM* — all three write the same table).
  > One row per visit, with these headings:
  >
  > | Heading | Needed | Becomes |
  > | --- | --- | --- |
  > | `UCN` | **required** | which call the visit is for |
  > | `Visit Date & Time` | **required** | **Visit Date & Time** |
  > | `Visit Entry Date` | optional | **Visit Entry Date** |
  > | `Call Status` | **do not leave out** | the call's status |
  > | `Visiting Service Engineer`, `Email ID` | optional | who attended |
  >
  > Every spare booked on that call then shows both dates — and its **Visit
  > UID** — because the report joins them. Nothing on the consumption side is
  > re-entered.
  >
  > **Three things worth knowing before you load it:**
  >
  > - **`Call Status` decides the call's status.** A visit row with that column
  >   blank leaves the call reading *Report pending*, because a call with a
  >   visit and no status can be nothing else. Carry it through from your file.
  > - **A re-load does not duplicate.** With no `UID` column one is derived from
  >   the UCN and the visit date, so the same file loaded twice updates the same
  >   visit. It also means several consumption rows sharing one UCN and date
  >   collapse into the one visit they actually were — which is correct, and
  >   why you can build the visit file straight out of your consumption file.
  > - **A row with no `Visit Date & Time` is refused**, deliberately: a call is
  >   *Unattended* only until it has a visit, so loading a visit that did not
  >   happen would mark an unattended call as attended.
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

- **Daily Complaint Review Register (R/SER/35)** `/daily-review` — the DCCR,
  where every solved call is reviewed. **Review 1** is the vigilance answer
  taken at registration; **Review 2** asks what the failure was; **Review 3**
  classifies it.
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
  - **A report raises itself** when the Daily Complaint Review Register
    answers any of Risk to Patient, Warranty Failure or Frequent Failure
    as *Yes*.
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
  > ### Keying a new sale
  >
  > **Party Name is a search box over the Party Master** — start typing and pick
  > the customer. Choosing one **fills in the address, city, state, pincode,
  > both telephone numbers, PAN, GST, the type, the profile and the initial
  > service engineer** from that customer's record.
  >
  > **Changing the customer replaces all of those, blanks included.** That is
  > deliberate: keeping the previous customer's address where the new one has
  > none would put a different hospital's address on the sale with nothing on
  > screen saying so. Type over any of them afterwards — the installation
  > address often differs from the registered one.
  >
  > A customer the Party Master has not got can still be typed. Nothing is
  > filled in for them, because there is nothing to fill it from.
  >
  > **Sale Entry Date is stamped** when you create the entry. It is not typed.
  >
  > **Warranty Start Date defaults to today** and is yours to change. Enter the
  > period in **MONTHS**; the **End Date**, the period in years and the PM visit
  > count all follow from it and are shown greyed out — they are worked out, not
  > asked for.
  >
  > **Then add the machines.** Product is a search box over the Product Master
  > (only lines still marked Active — a retired line takes no new sale), and
  > picking a product name fills its code where the catalogue gives one answer;
  > where several codes share a name, it is left for you rather than guessed.
  > **Serial Number is free text.** Everything else — dates, period, invoice,
  > city, state, engineer — **follows the entry** until you type into it, and
  > then that machine is pinned and says so.
  >
  > ### Raising the installation calls
  >
  > **＋ Installation calls** raises one call per machine that has not got one.
  > The party, city, state, model and serial come off the sale; Standard
  > Complaint and Complaint Reported read **Installation Calls**; the three
  > vigilance questions are answered **NO**; the customer contact is left blank,
  > because those fields record who *reported* a fault and nobody reported this.
  > The SA number, the warranty start and end come across too and the cover
  > reads **WGP** — unless the sale records no warranty, in which case the cover
  > is left blank rather than guessed.
  >
  > Each call's UCN lands on that machine's **INST Call** field, and the button
  > goes away once every machine has one.
  >
  > ### Putting the machines back on the entry
  >
  > **↺ Force update child records** clears every pinned value so all the
  > machines follow the entry again. It tells you first how many values **differ**
  > from the entry — those are decisions somebody made about one machine, and
  > there is no undo — separately from the ones that merely repeat it.
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

**Renew this contract** raises the next MC from an expiring one. It starts the
day after the old one ends, so cover has no gap and no overlap, and the
machines, type, party, period and billing schedule carry over. Untick anything
not being renewed.

**Rates do not carry over — you set them here.** Each machine has a **New Rate**
box with **what it was charged last time shown beside it**, and GST and the
total after tax fill in as you type. For the usual case, put a percentage in
**Revise all ticked by** and press **Apply to rates**: every ticked machine is
filled from its own old rate, and each box is still editable afterwards. 0%
holds last year's price; a machine that had no rate is left blank rather than
set to zero.

> Leaving every rate blank is fine and is what the renewal used to do — the new
> contract is created unpriced and you fill it in later. What never happens is
> last year's price arriving in this year's contract without somebody putting it
> there.

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
- **Product Database 2.0** `/product-database-2` — the same machines, but
  **worked out** rather than stored. One row per machine (model **and** serial),
  assembled from the warranty sale register, the contract register, the
  additional entries, the ownership transfer register and the installation call.
  > **It does not replace the Product Database**, which is untouched beside it —
  > run both and compare before trusting either.
  > **Every answer says where it came from.** *Party from*, *Because*, and the
  > warranty/contract source columns name the register that decided each value,
  > so a row can be checked rather than believed.
  > **Status is derived, not typed.** Inside the warranty it is **WGP**, even
  > where a contract also covers it. Otherwise a **labour** contract is AMC and
  > a **comprehensive** one is CMC. Neither, and it is **OGP**.
  > **A contract with no type recorded says so** — `CONTRACT (TYPE NOT
  > RECORDED)` — and is never assumed to be comprehensive. Each one is a
  > contract row worth correcting.
  > **The warranty starts at the installation**: the *Warranty Start Date* the
  > engineer is asked for on an installation call, or failing that the date that
  > call was solved, and only then the selling register.
  > **A machine needs BOTH a model and a serial to be listed.** Serial numbers
  > repeat across models — there are eleven machines numbered 219 — so a
  > register row carrying a serial and no model cannot be told from the others
  > wearing that number, and is left out rather than guessed at. That is why 2.0
  > can show fewer machines than the older cover view, which needs only a serial
  > and merges the ones that share one.
  > **It keeps itself up to date.** The five registers tell it when they have
  > changed and it rebuilds itself within five minutes; the screen says which
  > it is — *"Live as of …"* or *"A register has changed since … — updating
  > within 5 minutes"*. **⟳ Rebuild from the registers** is there for when you
  > want it now rather than soon.
  > **The cover status is never stale**, whatever the line above says: WGP /
  > AMC / CMC / OGP depend on today's date and are worked out fresh every time
  > you look, so a warranty that ran out overnight shows immediately. Working every machine out from five registers on
  > demand took about **3 seconds per page** and the screen needs ten pages, so
  > it was timing out and showing nothing; it is worked out **once** now and
  > read back in milliseconds. Nobody is locked out while it rebuilds.
  > **Click a row for the whole record.** The drawer shows every field, and
  > every reference on it opens the document behind it: the **SA number** goes
  > to the Warranty Register, the **contract number** to the Contract Register,
  > the **transfer reference** to Ownership Transfer, the **installation call**
  > to Installation Calls, and the serial to **Machine History** — each one
  > already searched. A number the machine does not carry is shown as plain
  > text rather than a link that goes nowhere.
  > **Who can see it:** anyone signed in who can open the screen, the same as
  > the Product Database beside it. **Who can rebuild it:** anyone who may edit
  > masters or cover.
  > **If the screen is empty it tells you why**, counting the three registers
  > — rows, rows with no serial, rows with no model — and saying which of
  > those it is. It says *every* row is missing something only where every
  > counted row really is; otherwise it gives you the numbers and stops there.

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
- **Party Master** `/parties` — your customers, **who looks after each one**, and
  their **KYC**.
  > **KYC starts as Pending on every customer** — nobody has been verified yet,
  > so the count tells you what is outstanding. Marking one **Verified** records
  > who did it and when; sending it back to Pending clears that, because a
  > customer who is no longer verified was not verified by anybody.
  > **GSTIN and PAN come out of the Tax columns you already had**, however they
  > were typed. A GSTIN contains a PAN, so giving one gives both — and anything
  > you type in yourself is never overwritten by a re-upload.
  > The customer has **two contact blocks**: where the machine is, and where the
  > bill goes. They are separate columns now; the billing one used to be lost.
  > **Click a party to edit it** — contact details, both addresses, the
  > Serviceman and the KYC. You need *Edit masters*. The **party name** is not
  > editable: every machine, call and contract names the customer by it.
  > **✎ Change engineer** corrects one Serviceman across every customer that
  > names them, in one go. Do this when a spelling here does not match the User
  > Master — a call is allotted by NAME, so a name nobody holds fills the box
  > with somebody who does not exist and notifies no one. It tells you how many
  > customers will change before it changes them, and calls already registered
  > keep the engineer they were allotted to.
  > Not every column is shown at first — **⚙ Columns** offers the rest.
  > The **Serviceman** on a party is what fills *Call Allocated To* on a new
  > call when the machine itself has no Service Engineer — which is every
  > **installation**, because the machine does not exist here yet. The machine
  > wins where it has one; this only answers where it cannot.
  > It is a suggestion, not an assignment: whoever registers the call can change
  > it, and a call registered **from a request** keeps the request's engineer
  > regardless.
- **User Master** `/user-master` — people, roles and the reporting line. A
  manager's team is worked out from here.
  > **DESIGNATION AND ROLE ARE DIFFERENT THINGS, and they often differ.** The
  > **Designation** is the job somebody holds in the company; the **Permission**
  > is what this application lets them do. One person can be a *Regional
  > Manager* by designation and a *Reporting Manager* by permission. Both now
  > appear under your name in the top-right corner — the designation first, then
  > the permission, labelled so the two cannot be read as one. A designation set
  > here reaches the sign-in by itself; nobody has to re-type it.
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

- **Product Failure Analysis** `/product-failure` — **what fails, and why**,
  across the whole register. The register is a worklist; this is the question it
  cannot answer.
  > **Click any bar and every chart below it narrows.** Click it again to let go.
  > Products are counted under the one **Review 2 says actually failed**, so a
  > fault moved to an accessory counts there and not against the machine it was
  > logged on.
  > **It opens on this year.** The register holds nine years of migrated history
  > against one of its own, so counting everything would make each chart a
  > picture of the old system. *Every year* is one click away.
  > A failure's year is **when the machine failed** — its complaint date — not
  > when somebody reviewed it.
  > Every chart has a **data table** beside it, a **data label** toggle and a
  > **download** — and the download carries the reviews THEMSELVES, not just the
  > ranking, so a number can be argued with by somebody who was not at the screen.
  > **Age at failure is not ranked by count**, deliberately: whether failures come
  > early or late in a machine's life is the point of that one.
  > **Build your own chart** with ＋ New chart — count the failures by any of the
  > review's answers, as a Pareto, a share, or in its own order. It is kept for
  > you; sharing it with a role or with everyone needs *Manage configuration*.
  > **Sharing a chart never shares data**: what is saved is the question, not the
  > answer, so each reader still sees only the failures their own role may see.
- **My Workload** `/workload` — everything waiting on you, across the registers
  you can open. **Click a card and you get the list behind it.**
  > A card with nothing to open stays a plain figure — there is no list of an
  > *ageing of four days*. You see a section only for a register you can already
  > open, so nothing here grants you anything you did not have.
  > The counts are the registers' own, so a card and the list it opens agree.

## Across every register

- **The filter chips above a list fold away.** Click the heading — *Engineer*,
  *Status*, *Product* — to hide the row, and again to bring it back. A long row
  starts folded and a short one starts open, and whatever you choose is
  remembered on your device for that screen.
  > **Folding the chips never removes the filter.** If one is applied it stays
  > on screen with its count and one click clears it — otherwise you would be
  > looking at part of a register with nothing saying why.

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

  > **You can also open it from a review.** The Daily Complaint Review Register's
  > Review Desk has a **🔎 Machine History** button beside *Raise FFR*: it opens
  > the same thing in a pop-up for the machine on that call, so you do not have
  > to leave a half-answered review to find out what this machine has already
  > done. Close it and you are back where you were. A call that does not record
  > **both** a product and a serial says so rather than guessing — a serial on
  > its own is not a machine.

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
  > The first sixteen columns are the report's own format and are **locked**.
  > **Line ID, Source Ref Key and Created At are ticked to start with** and can
  > be unticked — *Back to the default columns* puts them back. Source Ref Key
  > is the row id from the file a line was IMPORTED from, so it is blank on
  > anything booked here; that is correct, not a gap.
  > Where a call has no visit report, the two visit dates fall back to what the
  > import said and then to when the spare was first booked — read those as
  > **"no later than"**, not "on". **Visit UID is blank on exactly those rows**,
  > which is how to tell them apart.
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
- **Feedback Without a Report** `/feedback-without-report` — **administrators
  only.** The customer gave feedback on a visit; the visit was never written up.
  > Feedback is collected **after** a visit, so its existence is evidence the
  > work happened. A completed service report is the record of **what was
  > done**. A call carrying one without the other is a gap you cannot see from
  > either record on its own, because neither is wrong by itself.
  >
  > **It names which of four things is missing**, because each needs a different
  > fix: the feedback records no UCN · no call carries that UCN · the call has
  > no visit at all · the call has visits and none reads "Solved - Report
  > Completed". The last is the commonest, and the **Latest visit status**
  > column tells you what it reads instead — "Solved - Report Pending" is the
  > system admitting a known absence, "Unsolved" is a different problem.
  >
  > **A trailing space is not a missing report.** The status is matched on its
  > letters and digits, so `Solved - Report Completed ` (which is what the
  > exports carry), a lower-case spelling and an en-dash all count. And a call
  > written up and then **re-visited still has its report** — any completed
  > visit is enough, not just the latest one.

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
- **Solved Without a Report** `/missing-visit-reports` — **administrators
  only.** Every call that reads Solved while its visit record is incomplete —
  the list of what to re-upload.
  > **It names the gap**, and there are four, each needing a different fix:
  > *no visit at all* · *no visit date* · *no service report* · *entry date
  > looks like an import stamp*. A call with more than one shows all of them.
  > **Visit Entry Date can never arrive blank.** If your file does not carry
  > that column the row takes the **time of the upload** instead, so a missing
  > one cannot be found by looking for an empty cell. This report finds it by
  > counting how many visits share the same timestamp to the microsecond — 25
  > visits entered at the same instant does not happen, a batch load does — and
  > shows you the count rather than only the verdict.
  > It matters because the entry date decides a call's status: the **latest
  > entry** wins, so a whole batch sharing one stamp lets an arbitrary row
  > decide every call in it.
  > **Solved includes "Solved - Report Pending"**, and the row says which.
  > Report Pending is the system telling you something is missing; a plain
  > Solved with no report is the system contradicting itself.

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
